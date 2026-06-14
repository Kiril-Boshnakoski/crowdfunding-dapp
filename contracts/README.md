# CrowdfundingDAO

A decentralized, DAO-style crowdfunding smart contract written in Solidity (`^0.8.20`). Unlike traditional crowdfunding where the creator can freely withdraw raised funds, **`CrowdfundingDAO` escrows every contribution and only releases money through contribution-weighted on-chain governance.** Backers retain control of how the money is spent.

---

## Table of Contents

- [Overview](#overview)
- [Core Concepts](#core-concepts)
- [Architecture](#architecture)
- [Data Structures](#data-structures)
- [Storage Layout](#storage-layout)
- [Function Reference](#function-reference)
- [Lifecycle Walkthrough](#lifecycle-walkthrough)
- [Security Considerations](#security-considerations)
- [Events](#events)
- [Custom Errors](#custom-errors)
- [Build & Deploy](#build--deploy)

---

## Overview

The contract implements a four-phase model:

1. **Create** — anyone deploys a campaign with a funding goal and a deadline.
2. **Fund** — backers contribute ETH before the deadline. Their contribution becomes their voting power.
3. **Govern** — once a campaign meets its goal, the creator submits *spending proposals*. Backers vote on each proposal weighted by how much they contributed.
4. **Release / Refund** — approved proposals release funds to the creator; if the goal is never met, backers pull their refunds.

The contract inherits from OpenZeppelin's `ReentrancyGuard` and follows the **Checks-Effects-Interactions (CEI)** pattern throughout.

---

## Core Concepts

| Concept | Description |
| --- | --- |
| **Escrowed funds** | All ETH is held by the contract. The creator never has unilateral withdrawal rights. |
| **Contribution = voting power** | Each wei contributed grants one unit of voting weight on that campaign's proposals. |
| **Spending proposals** | After funding succeeds, the creator proposes specific withdrawals with a stated purpose. |
| **Weighted majority approval** | A proposal passes only if "yes" weight beats "no" weight **and** exceeds 50% of the campaign's total raised amount. |
| **Pull-based refunds** | If a campaign fails, each backer withdraws their own funds rather than relying on a push loop. |
| **Per-campaign accounting** | `raised` and `releasedAmount` are tracked per campaign so one campaign can never spend another's funds. |

---

## Architecture

```
                          ┌─────────────────────────────┐
                          │       CrowdfundingDAO        │
                          │     (is ReentrancyGuard)     │
                          └─────────────────────────────┘
                                       │
        ┌──────────────┬───────────────┼───────────────┬──────────────────┐
        ▼              ▼               ▼               ▼                  ▼
  createCampaign   contribute       claimRefund     createProposal      vote
   (no ETH move)  (ETH in, hold)  (ETH out, CEI)   (creator only)   (contributor only)
                                                          │                  │
                                                          └────────┬─────────┘
                                                                   ▼
                                                             releaseFunds
                                                           (ETH out, CEI,
                                                            threshold check)
```

**Roles**

- **Creator** — the address that called `createCampaign`. May submit proposals (`onlyCreator`). Receives released funds.
- **Contributor** — any address with a non-zero contribution. May vote (`onlyContributor`) and claim refunds.
- **Anyone** — may call `releaseFunds` once a proposal is approved (the outcome is deterministic and funds always go to the creator), and may read all view functions.

---

## Data Structures

### `Campaign`

```solidity
struct Campaign {
    address creator;          // Creator; the only address that may submit proposals.
    uint256 goal;             // Funding goal in wei (> 0).
    uint256 deadline;         // Unix timestamp; contributions close after this.
    uint256 raised;           // Total wei contributed.
    uint256 releasedAmount;   // Total wei already released via approved proposals.
    uint256 contributorCount; // Unique contributors (informational).
    uint256 proposalCount;    // Number of proposals created.
    bool    exists;           // Guards operations against non-existent campaigns.
}
```

> **Why track both `raised` and `releasedAmount`?**
> Spendable balance is computed as `raised - releasedAmount` rather than reading `address(this).balance`. The contract's balance is shared across *all* campaigns and can be force-fed via `selfdestruct`, so relying on it would corrupt per-campaign accounting. Explicit bookkeeping keeps each campaign's funds isolated and tamper-proof.

### `Proposal`

```solidity
struct Proposal {
    string  description;     // Human-readable purpose of the spend.
    uint256 amount;          // Wei requested.
    uint256 votingDeadline;  // Unix timestamp; voting closes / execution opens after this.
    uint256 votesFor;        // Weighted "yes" votes (sum of voters' contributions).
    uint256 votesAgainst;    // Weighted "no" votes.
    bool    executed;        // True once funds released; prevents double-spend.
}
```

> A `votingDeadline` of `0` is treated as a sentinel for "proposal does not exist," since a real proposal always has a future deadline.

---

## Storage Layout

```solidity
uint256 public constant APPROVAL_THRESHOLD_BPS = 5000; // 50.00% in basis points
uint256 private constant BPS_DENOMINATOR = 10000;

uint256 public nextCampaignId;                                          // auto-incrementing id

mapping(uint256 => Campaign) private _campaigns;                        // campaignId => Campaign
mapping(uint256 => mapping(address => uint256)) public contributions;   // campaignId => backer => wei
mapping(uint256 => mapping(uint256 => Proposal)) private _proposals;    // campaignId => proposalId => Proposal
mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasVoted; // ... => voter => voted?
```

- `contributions` is `public` because it doubles as the canonical voting-power source and is useful to read off-chain.
- `_campaigns` and `_proposals` are `private` and exposed through validated view helpers (`getCampaign`, `getProposal`) that revert on non-existent ids.

---

## Function Reference

### Campaign Lifecycle

| Function | Access | ETH | Description |
| --- | --- | --- | --- |
| `createCampaign(goal, durationSeconds)` | anyone | — | Creates a campaign; returns its `campaignId`. |
| `contribute(campaignId)` | anyone | in | Adds ETH to a live campaign; increases caller's voting power. `nonReentrant`. |
| `claimRefund(campaignId)` | contributor | out | Refunds the caller if the campaign ended below its goal. `nonReentrant`. |

### Governance

| Function | Access | ETH | Description |
| --- | --- | --- | --- |
| `createProposal(campaignId, amount, description, votingDurationSecs)` | creator | — | Proposes a spend on a *funded* campaign; amount must fit available funds. |
| `vote(campaignId, proposalId, support)` | contributor | — | Casts a contribution-weighted vote; one vote per address per proposal. |
| `releaseFunds(campaignId, proposalId)` | anyone | out | Releases funds to the creator if the proposal passed and voting ended. `nonReentrant`. |

### View Helpers

| Function | Returns |
| --- | --- |
| `getCampaign(campaignId)` | Full `Campaign` struct (reverts if missing). |
| `getProposal(campaignId, proposalId)` | Full `Proposal` struct (reverts if missing). |
| `availableFunds(campaignId)` | `raised - releasedAmount`. |
| `votingPowerOf(campaignId, account)` | The account's contribution (= voting weight). |

### Approval Rule

A proposal passes in `releaseFunds` only if **both** conditions hold:

$$votesFor > votesAgainst$$

**and**

$$votesFor \times 10000 > raised \times 5000$$

The second condition means strictly **more than 50%** of the campaign's *total raised weight* must vote in favor — abstaining backers effectively count against passage, raising the bar for spending other people's money.

---

## Lifecycle Walkthrough

```
1. createCampaign(10 ether, 7 days)        → campaignId = 0
2. Alice contribute{value: 6 ether}(0)     → raised = 6, Alice power = 6
   Bob   contribute{value: 4 ether}(0)     → raised = 10 (goal met!)
3. createProposal(0, 3 ether, "Audit", 3 days) → proposalId = 0   (creator only)
4. Alice vote(0, 0, true)                  → votesFor = 6
   Bob   vote(0, 0, false)                 → votesAgainst = 4
5. (after votingDeadline) releaseFunds(0,0)
      majorityFor:  6 > 4                       ✓
      thresholdMet: 6*10000 > 10*5000 → 60000 > 50000  ✓
   → 3 ether sent to creator, releasedAmount = 3
```

If instead the campaign had raised only 8 ether by the deadline (below the 10 ether goal), no proposals could be created and each backer would call `claimRefund(0)` to pull their ETH back.

---

## Security Considerations

### 1. Reentrancy Protection (`ReentrancyGuard`)

Every function that performs an external ETH transfer is marked `nonReentrant`:

- `claimRefund` and `releaseFunds` send ETH via low-level `call`, the classic reentrancy surface.
- `contribute` is guarded **defensively** even though it makes no external call, keeping all fund-handling entry points uniformly protected.

`ReentrancyGuard` uses a storage mutex that reverts any nested re-entry into a guarded function, neutralizing cross-function reentrancy attacks.

### 2. Checks-Effects-Interactions (CEI)

Every state-mutating function is ordered strictly as **Checks → Effects → Interactions**. State is fully updated *before* any external call, so a malicious recipient contract re-entering during the `call` would observe already-finalized state. For example, in `claimRefund`:

```solidity
// Effects (state zeroed first)
contributions[campaignId][msg.sender] = 0;
campaign.raised -= amount;
// Interactions (ETH sent last)
(bool ok, ) = payable(msg.sender).call{value: amount}("");
if (!ok) revert TransferFailed();
```

Even without the mutex, a re-entrant call would find a zero balance and fail. The guard and CEI together provide defense-in-depth.

### 3. Isolated Per-Campaign Accounting

Spendable funds are derived from explicit `raised - releasedAmount` bookkeeping, **never** from `address(this).balance`. This prevents:

- One campaign spending another campaign's escrowed ETH.
- Balance manipulation via forced ETH injection (`selfdestruct`), which cannot affect the tracked per-campaign totals.

`releaseFunds` also **re-validates** `amount <= available` at execution time (not just at proposal creation), guarding against multiple proposals collectively over-spending.

### 4. Contribution-Weighted Governance

Voting power equals wei contributed, so non-contributors and low-stake actors cannot hijack spending decisions. The `onlyContributor` modifier rejects votes from non-backers, and `hasVoted` enforces one vote per address per proposal (no double voting).

### 5. Pull-Over-Push Refunds

Refunds are **pull-based** — each backer withdraws individually. This avoids:

- Unbounded loops over all contributors (gas-griefing / DoS).
- A single reverting recipient blocking refunds for everyone else.

### 6. Custom Errors

All failure modes use custom errors (e.g. `ProposalNotApproved`, `AmountExceedsAvailableFunds`) instead of revert strings. This reduces gas and keeps reverts machine-readable for front-ends and tooling.

### 7. Safe ETH Handling

- ETH is transferred with low-level `call` (the recommended forwarding-gas-safe method), and the boolean result is always checked, reverting with `TransferFailed` on failure.
- The `receive()` function reverts with `ZeroContribution`, rejecting raw transfers so funds can never enter the contract unattached to a campaign.

### 8. Access Control & Existence Guards

- `campaignExists` / proposal sentinel checks prevent operations on non-existent entities.
- `onlyCreator` restricts proposal creation; `onlyContributor` restricts voting.
- Time-based guards (`CampaignEnded`, `VotingPeriodEnded`, `VotingPeriodNotEnded`) enforce correct phase ordering.

### Known Limitations / Audit Notes

- **Block-timestamp dependence:** deadlines rely on `block.timestamp`, which miners can nudge by a few seconds. This is acceptable for day-scale campaign/voting windows but should not be used for fine-grained timing.
- **No quorum on participation count:** approval is by weight, not by number of distinct voters; a single majority contributor can pass proposals. This is by design (weight = stake) but worth understanding.
- **No emergency pause / upgrade path:** the contract is immutable once deployed.
- This contract has **not** been professionally audited. **Do not deploy to mainnet without a third-party security audit.**

---

## Events

| Event | Emitted by | Purpose |
| --- | --- | --- |
| `CampaignCreated(campaignId, creator, goal, deadline)` | `createCampaign` | New campaign indexed for front-ends. |
| `Funded(campaignId, contributor, amount, totalRaised)` | `contribute` | Tracks contributions and running total. |
| `ProposalCreated(campaignId, proposalId, creator, amount, votingDeadline, description)` | `createProposal` | New spending proposal. |
| `Voted(campaignId, proposalId, voter, support, weight)` | `vote` | Records each weighted vote. |
| `FundsReleased(campaignId, proposalId, creator, amount)` | `releaseFunds` | Successful payout. |
| `RefundClaimed(campaignId, contributor, amount)` | `claimRefund` | Backer refund on failed campaign. |

---

## Build & Deploy

The only dependency is OpenZeppelin Contracts.

### Hardhat

```bash
npm install --save-dev hardhat
npm install @openzeppelin/contracts
npx hardhat compile
```

### Foundry

```bash
forge install OpenZeppelin/openzeppelin-contracts
forge build
```

Make sure your `remappings.txt` (Foundry) or import resolution (Hardhat) maps:

```
@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/
```

> ⚠️ **Reminder:** Always obtain an independent security audit before deploying to a production network.
