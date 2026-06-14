// Types mirror the CrowdfundingDAO Solidity contract structures.
// These are intentionally close to the on-chain shapes so wiring up
// the contract ABI + React hooks later is a drop-in replacement.

export type Address = `0x${string}`

export type ProposalStatus = "Active" | "Passed" | "Rejected" | "Executed"

export interface Proposal {
  id: number
  campaignId: number
  /** Plain-language reason for the spend */
  reason: string
  /** Recipient that will receive funds on execution */
  recipient: Address
  /** Amount requested, in ETH (string to preserve precision) */
  amount: string
  /** Contribution-weighted votes, in ETH */
  yesWeight: number
  noWeight: number
  /** Unix ms timestamp for when voting closes */
  votingEndsAt: number
  status: ProposalStatus
  /** Whether the connected user has already voted */
  hasVoted: boolean
}

export interface Campaign {
  id: number
  title: string
  description: string
  creator: Address
  /** Funding goal in ETH */
  goal: number
  /** Total raised in ETH */
  raised: number
  /** Amount already released via passed proposals, in ETH */
  released: number
  /** Unix ms timestamp deadline */
  deadline: number
  /** Amount the connected user has contributed, in ETH */
  myContribution: number
  proposals: Proposal[]
}

export type CampaignState = "active" | "funded" | "failed"

export function getCampaignState(c: Campaign): CampaignState {
  const ended = Date.now() > c.deadline
  if (!ended) return "active"
  return c.raised >= c.goal ? "funded" : "failed"
}
