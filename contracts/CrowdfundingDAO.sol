// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title CrowdfundingDAO
 * @author Kiril Boshnakoski
 * @notice A decentralized, DAO-style crowdfunding platform where raised funds are
 *         NOT freely withdrawable by the campaign creator. Instead, after a campaign
 *         is funded, the creator must submit "spending proposals" that contributors
 *         vote on. Funds are only released when a proposal is approved by a majority
 *         of contribution-weighted voting power.
 *
 * @dev Security architecture overview:
 *      - ReentrancyGuard protects every function that performs an external ETH transfer
 *        ({contribute} refunds are pull-based; {releaseFunds} and {claimRefund} send ETH).
 *      - The Checks-Effects-Interactions (CEI) pattern is strictly enforced: all storage
 *        mutations happen BEFORE any external call, so a malicious recipient contract
 *        cannot observe or exploit an inconsistent intermediate state.
 *      - Voting power is proportional to the wei each address contributed to that specific
 *        campaign, preventing non-contributors or low-stake actors from hijacking decisions.
 *      - Custom errors are used everywhere instead of revert strings to minimize gas and
 *        keep failure modes machine-readable.
 *      - All ETH is escrowed inside this contract; per-campaign accounting (`raised`,
 *        `releasedAmount`) guarantees one campaign can never spend another campaign's funds.
 */
contract CrowdfundingDAO is ReentrancyGuard {
    // ---------------------------------------------------------------------
    //                              Custom Errors
    // ---------------------------------------------------------------------

    error ZeroGoal();
    error InvalidDeadline();
    error InvalidVotingPeriod();
    error CampaignDoesNotExist();
    error ProposalDoesNotExist();
    error CampaignEnded();
    error CampaignStillActive();
    error CampaignNotFunded();
    error ZeroContribution();
    error NotCampaignCreator();
    error NotContributor();
    error AmountExceedsAvailableFunds();
    error ZeroProposalAmount();
    error VotingPeriodEnded();
    error VotingPeriodNotEnded();
    error AlreadyVoted();
    error ProposalAlreadyExecuted();
    error ProposalNotApproved();
    error CampaignSucceeded();
    error NothingToRefund();
    error TransferFailed();

    // ---------------------------------------------------------------------
    //                                Data Types
    // ---------------------------------------------------------------------

    /**
     * @notice A crowdfunding campaign.
     * @dev `raised` tracks total contributions; `releasedAmount` tracks funds already
     *      paid out through approved proposals. The currently spendable balance is
     *      `raised - releasedAmount`. Storing both avoids relying on `address(this).balance`,
     *      which is shared across all campaigns and can be force-fed via `selfdestruct`.
     */
    struct Campaign {
        address creator;          // Address that created the campaign and may submit proposals.
        uint256 goal;             // Funding goal in wei. Must be > 0.
        uint256 deadline;         // Unix timestamp after which contributions are closed.
        uint256 raised;           // Total wei contributed to this campaign.
        uint256 releasedAmount;   // Total wei already released to the creator via proposals.
        uint256 contributorCount; // Number of unique contributors (informational).
        uint256 proposalCount;    // Number of spending proposals created for this campaign.
        bool exists;              // Guards against operations on non-existent campaigns.
    }

    /**
     * @notice A spending proposal submitted by a campaign creator after funding succeeds.
     * @dev `votesFor`/`votesAgainst` accumulate contribution-weighted voting power (in wei).
     *      A proposal passes if `votesFor > votesAgainst` AND `votesFor` exceeds the
     *      approval threshold (a majority of the campaign's total raised amount).
     */
    struct Proposal {
        string description;     // Human-readable purpose of the spend.
        uint256 amount;         // Wei requested. Validated against available funds at execution.
        uint256 votingDeadline; // Unix timestamp after which voting closes and execution can occur.
        uint256 votesFor;       // Weighted "yes" votes (sum of voters' contributions).
        uint256 votesAgainst;   // Weighted "no" votes.
        bool executed;          // Set true once funds are released; prevents double spend.
    }

    // ---------------------------------------------------------------------
    //                                  Storage
    // ---------------------------------------------------------------------

    /// @notice Threshold (in basis points) of total raised required for a proposal to pass.
    /// @dev 5000 bps = 50%. A proposal needs `votesFor * 10000 > raised * APPROVAL_THRESHOLD_BPS`,
    ///      i.e. strictly MORE than 50% of all contributed weight must vote in favour.
    uint256 public constant APPROVAL_THRESHOLD_BPS = 5000;
    uint256 private constant BPS_DENOMINATOR = 10000;

    /// @notice Auto-incrementing id assigned to the next created campaign.
    uint256 public nextCampaignId;

    /// @notice campaignId => Campaign data.
    mapping(uint256 => Campaign) private _campaigns;

    /// @notice campaignId => contributor => amount contributed (wei). Doubles as voting power.
    mapping(uint256 => mapping(address => uint256)) public contributions;

    /// @notice campaignId => proposalId => Proposal data.
    mapping(uint256 => mapping(uint256 => Proposal)) private _proposals;

    /// @notice campaignId => proposalId => voter => whether they have already voted.
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasVoted;

    // ---------------------------------------------------------------------
    //                                  Events
    // ---------------------------------------------------------------------

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        uint256 goal,
        uint256 deadline
    );
    event Funded(
        uint256 indexed campaignId,
        address indexed contributor,
        uint256 amount,
        uint256 totalRaised
    );
    event ProposalCreated(
        uint256 indexed campaignId,
        uint256 indexed proposalId,
        address indexed creator,
        uint256 amount,
        uint256 votingDeadline,
        string description
    );
    event Voted(
        uint256 indexed campaignId,
        uint256 indexed proposalId,
        address indexed voter,
        bool support,
        uint256 weight
    );
    event FundsReleased(
        uint256 indexed campaignId,
        uint256 indexed proposalId,
        address indexed creator,
        uint256 amount
    );
    event RefundClaimed(
        uint256 indexed campaignId,
        address indexed contributor,
        uint256 amount
    );

    // ---------------------------------------------------------------------
    //                                 Modifiers
    // ---------------------------------------------------------------------

    /// @dev Reverts if the campaign id was never created.
    modifier campaignExists(uint256 campaignId) {
        if (!_campaigns[campaignId].exists) revert CampaignDoesNotExist();
        _;
    }

    /// @dev Restricts a call to the campaign's creator only.
    modifier onlyCreator(uint256 campaignId) {
        if (msg.sender != _campaigns[campaignId].creator) revert NotCampaignCreator();
        _;
    }

    /// @dev Restricts a call to addresses that contributed to the given campaign.
    modifier onlyContributor(uint256 campaignId) {
        if (contributions[campaignId][msg.sender] == 0) revert NotContributor();
        _;
    }

    // ---------------------------------------------------------------------
    //                            Campaign Lifecycle
    // ---------------------------------------------------------------------

    /**
     * @notice Create a new crowdfunding campaign.
     * @param goal             Funding goal in wei. Must be greater than zero.
     * @param durationSeconds  Seconds from now until the contribution deadline. Must be > 0.
     * @return campaignId      The id assigned to the new campaign.
     *
     * @dev CHECKS: goal and duration are validated. EFFECTS: campaign is written to storage
     *      and the id counter is incremented. No external interactions occur here.
     */
    function createCampaign(uint256 goal, uint256 durationSeconds)
        external
        returns (uint256 campaignId)
    {
        // --- Checks ---
        if (goal == 0) revert ZeroGoal();
        if (durationSeconds == 0) revert InvalidDeadline();

        // --- Effects ---
        campaignId = nextCampaignId++;
        uint256 deadline = block.timestamp + durationSeconds;

        _campaigns[campaignId] = Campaign({
            creator: msg.sender,
            goal: goal,
            deadline: deadline,
            raised: 0,
            releasedAmount: 0,
            contributorCount: 0,
            proposalCount: 0,
            exists: true
        });

        emit CampaignCreated(campaignId, msg.sender, goal, deadline);
    }

    /**
     * @notice Contribute ETH to an active campaign. Voting power equals total contribution.
     * @param campaignId The campaign to fund.
     *
     * @dev CHECKS: campaign exists, deadline not passed, msg.value > 0.
     *      EFFECTS: contribution and raised totals are updated before any event.
     *      INTERACTIONS: none (ETH is simply held by this contract).
     *      `nonReentrant` is applied defensively even though no external call is made,
     *      keeping fund-handling entry points uniformly protected.
     */
    function contribute(uint256 campaignId)
        external
        payable
        nonReentrant
        campaignExists(campaignId)
    {
        Campaign storage campaign = _campaigns[campaignId];

        // --- Checks ---
        if (block.timestamp >= campaign.deadline) revert CampaignEnded();
        if (msg.value == 0) revert ZeroContribution();

        // --- Effects ---
        if (contributions[campaignId][msg.sender] == 0) {
            campaign.contributorCount += 1;
        }
        contributions[campaignId][msg.sender] += msg.value;
        campaign.raised += msg.value;

        emit Funded(campaignId, msg.sender, msg.value, campaign.raised);
    }

    /**
     * @notice Claim a refund of your contribution if the campaign FAILED to reach its goal
     *         by the deadline.
     * @param campaignId The failed campaign to refund from.
     *
     * @dev Refunds are pull-based (each contributor withdraws their own funds) to avoid
     *      unbounded loops and griefing. CHECKS: campaign ended, goal not met, caller has
     *      a non-zero balance. EFFECTS: the caller's contribution is zeroed and `raised`
     *      reduced BEFORE the transfer. INTERACTIONS: ETH is sent last, guarded by
     *      `nonReentrant`, fully implementing CEI.
     */
    function claimRefund(uint256 campaignId)
        external
        nonReentrant
        campaignExists(campaignId)
    {
        Campaign storage campaign = _campaigns[campaignId];

        // --- Checks ---
        if (block.timestamp < campaign.deadline) revert CampaignStillActive();
        if (campaign.raised >= campaign.goal) revert CampaignSucceeded();

        uint256 amount = contributions[campaignId][msg.sender];
        if (amount == 0) revert NothingToRefund();

        // --- Effects ---
        contributions[campaignId][msg.sender] = 0;
        campaign.raised -= amount;

        // --- Interactions ---
        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit RefundClaimed(campaignId, msg.sender, amount);
    }

    // ---------------------------------------------------------------------
    //                          Governance: Proposals
    // ---------------------------------------------------------------------

    /**
     * @notice Create a spending proposal for a funded campaign. Only the creator may call this.
     * @param campaignId          The funded campaign.
     * @param amount              Wei requested. Must be > 0 and within currently available funds.
     * @param description         Human-readable purpose of the spend.
     * @param votingDurationSecs  Seconds the proposal stays open for voting. Must be > 0.
     * @return proposalId         The id assigned to the new proposal.
     *
     * @dev CHECKS: caller is creator, campaign reached its goal, amount is valid and does not
     *      exceed `raised - releasedAmount`. EFFECTS: proposal stored, counter incremented.
     *      Validating against available (not total) funds prevents the creator from proposing
     *      to spend money already released by earlier proposals.
     */
    function createProposal(
        uint256 campaignId,
        uint256 amount,
        string calldata description,
        uint256 votingDurationSecs
    )
        external
        campaignExists(campaignId)
        onlyCreator(campaignId)
        returns (uint256 proposalId)
    {
        Campaign storage campaign = _campaigns[campaignId];

        // --- Checks ---
        if (campaign.raised < campaign.goal) revert CampaignNotFunded();
        if (votingDurationSecs == 0) revert InvalidVotingPeriod();
        if (amount == 0) revert ZeroProposalAmount();

        uint256 available = campaign.raised - campaign.releasedAmount;
        if (amount > available) revert AmountExceedsAvailableFunds();

        // --- Effects ---
        proposalId = campaign.proposalCount++;
        uint256 votingDeadline = block.timestamp + votingDurationSecs;

        _proposals[campaignId][proposalId] = Proposal({
            description: description,
            amount: amount,
            votingDeadline: votingDeadline,
            votesFor: 0,
            votesAgainst: 0,
            executed: false
        });

        emit ProposalCreated(
            campaignId,
            proposalId,
            msg.sender,
            amount,
            votingDeadline,
            description
        );
    }

    /**
     * @notice Vote on a spending proposal. Voting power equals your contribution to the campaign.
     * @param campaignId The campaign the proposal belongs to.
     * @param proposalId The proposal to vote on.
     * @param support    True to vote in favour, false to vote against.
     *
     * @dev CHECKS: campaign & proposal exist, caller is a contributor, proposal not executed,
     *      voting window open, caller has not already voted. EFFECTS: the vote is recorded and
     *      weighted by the caller's contribution. No external interactions occur.
     */
    function vote(uint256 campaignId, uint256 proposalId, bool support)
        external
        campaignExists(campaignId)
        onlyContributor(campaignId)
    {
        Proposal storage proposal = _proposals[campaignId][proposalId];

        // --- Checks ---
        if (proposal.votingDeadline == 0) revert ProposalDoesNotExist();
        if (proposal.executed) revert ProposalAlreadyExecuted();
        if (block.timestamp >= proposal.votingDeadline) revert VotingPeriodEnded();
        if (hasVoted[campaignId][proposalId][msg.sender]) revert AlreadyVoted();

        uint256 weight = contributions[campaignId][msg.sender];

        // --- Effects ---
        hasVoted[campaignId][proposalId][msg.sender] = true;
        if (support) {
            proposal.votesFor += weight;
        } else {
            proposal.votesAgainst += weight;
        }

        emit Voted(campaignId, proposalId, msg.sender, support, weight);
    }

    /**
     * @notice Release funds to the creator for an approved proposal once voting has ended.
     * @param campaignId The campaign the proposal belongs to.
     * @param proposalId The approved proposal to execute.
     *
     * @dev Anyone may trigger execution (the outcome is deterministic), but funds always go
     *      to the campaign creator. CHECKS: proposal exists, not already executed, voting
     *      period over, approval threshold met, and the amount still fits within available
     *      funds (re-validated to be safe against any prior releases). EFFECTS: `executed`
     *      is set and `releasedAmount` increased BEFORE the transfer. INTERACTIONS: ETH is
     *      sent last under `nonReentrant`, fully respecting CEI.
     */
    function releaseFunds(uint256 campaignId, uint256 proposalId)
        external
        nonReentrant
        campaignExists(campaignId)
    {
        Campaign storage campaign = _campaigns[campaignId];
        Proposal storage proposal = _proposals[campaignId][proposalId];

        // --- Checks ---
        if (proposal.votingDeadline == 0) revert ProposalDoesNotExist();
        if (proposal.executed) revert ProposalAlreadyExecuted();
        if (block.timestamp < proposal.votingDeadline) revert VotingPeriodNotEnded();

        // Approval rule: more "yes" weight than "no" weight, AND the "yes" weight must
        // strictly exceed APPROVAL_THRESHOLD_BPS of the campaign's total raised amount.
        bool majorityFor = proposal.votesFor > proposal.votesAgainst;
        bool thresholdMet =
            proposal.votesFor * BPS_DENOMINATOR >
            campaign.raised * APPROVAL_THRESHOLD_BPS;
        if (!majorityFor || !thresholdMet) revert ProposalNotApproved();

        // Re-validate against currently available funds (defense-in-depth).
        uint256 available = campaign.raised - campaign.releasedAmount;
        if (proposal.amount > available) revert AmountExceedsAvailableFunds();

        // --- Effects ---
        proposal.executed = true;
        campaign.releasedAmount += proposal.amount;

        // --- Interactions ---
        (bool ok, ) = payable(campaign.creator).call{value: proposal.amount}("");
        if (!ok) revert TransferFailed();

        emit FundsReleased(campaignId, proposalId, campaign.creator, proposal.amount);
    }

    // ---------------------------------------------------------------------
    //                               View Helpers
    // ---------------------------------------------------------------------

    /// @notice Returns the full campaign struct for the given id.
    function getCampaign(uint256 campaignId)
        external
        view
        campaignExists(campaignId)
        returns (Campaign memory)
    {
        return _campaigns[campaignId];
    }

    /// @notice Returns the full proposal struct for the given campaign/proposal pair.
    function getProposal(uint256 campaignId, uint256 proposalId)
        external
        view
        campaignExists(campaignId)
        returns (Proposal memory)
    {
        if (_proposals[campaignId][proposalId].votingDeadline == 0) {
            revert ProposalDoesNotExist();
        }
        return _proposals[campaignId][proposalId];
    }

    /// @notice Returns the wei still available to be proposed/spent for a campaign.
    function availableFunds(uint256 campaignId)
        external
        view
        campaignExists(campaignId)
        returns (uint256)
    {
        Campaign storage campaign = _campaigns[campaignId];
        return campaign.raised - campaign.releasedAmount;
    }

    /// @notice Returns the voting power (contribution in wei) of an address for a campaign.
    function votingPowerOf(uint256 campaignId, address account)
        external
        view
        returns (uint256)
    {
        return contributions[campaignId][account];
    }

    /**
     * @notice Reject raw ETH transfers. Funds must always be associated with a campaign via
     *         {contribute} so per-campaign accounting stays accurate.
     */
    receive() external payable {
        revert ZeroContribution();
    }
}
