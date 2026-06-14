import type { Address, Campaign } from "./types"

const DAY = 1000 * 60 * 60 * 24

const addr = (s: string) => s as Address

export const mockCampaigns: Campaign[] = [
  {
    id: 1,
    title: "Open Source ZK Rollup Toolkit",
    description:
      "Funding a fully open-source toolkit for building zero-knowledge rollups, including circuits, a prover, and developer docs.",
    creator: addr("0x4a7b...91Fe"),
    goal: 50,
    raised: 62.4,
    released: 12,
    deadline: Date.now() - 3 * DAY, // ended + funded
    myContribution: 4.5,
    proposals: [
      {
        id: 1,
        campaignId: 1,
        reason: "Pay the audit firm for the core circuit review (milestone 1).",
        recipient: addr("0xAud1...7c3D"),
        amount: "8",
        yesWeight: 41.2,
        noWeight: 5.6,
        votingEndsAt: Date.now() + 2 * DAY,
        status: "Active",
        hasVoted: false,
      },
      {
        id: 2,
        campaignId: 1,
        reason: "Reimburse initial infrastructure and RPC node costs.",
        recipient: addr("0xC0re...22aB"),
        amount: "4",
        yesWeight: 38.9,
        noWeight: 9.1,
        votingEndsAt: Date.now() - 1 * DAY,
        status: "Passed",
        hasVoted: true,
      },
      {
        id: 3,
        campaignId: 1,
        reason: "Sponsor a closed-door conference junket (off-mission).",
        recipient: addr("0xBad0...0000"),
        amount: "10",
        yesWeight: 6.3,
        noWeight: 44.0,
        votingEndsAt: Date.now() - 2 * DAY,
        status: "Rejected",
        hasVoted: true,
      },
    ],
  },
  {
    id: 2,
    title: "Decentralized Grants for Climate Data",
    description:
      "A community treasury that funds open climate datasets and the tools to verify them on-chain.",
    creator: addr("0x9c2d...4Bb1"),
    goal: 120,
    raised: 73.8,
    released: 0,
    deadline: Date.now() + 9 * DAY, // active
    myContribution: 0,
    proposals: [],
  },
  {
    id: 3,
    title: "Indie Game Studio: First Title",
    description:
      "Help a three-person studio ship their first cooperative roguelike. Backers vote on how the treasury is spent.",
    creator: addr("0x1f8e...0aC7"),
    goal: 30,
    raised: 11.2,
    released: 0,
    deadline: Date.now() + 4 * DAY, // active
    myContribution: 1.0,
    proposals: [],
  },
  {
    id: 4,
    title: "Hardware Wallet for Accessibility",
    description:
      "A hardware wallet redesigned for users with low vision, including audio guidance and tactile feedback.",
    creator: addr("0x77aa...De01"),
    goal: 80,
    raised: 41.3,
    released: 0,
    deadline: Date.now() - 1 * DAY, // ended + failed
    myContribution: 6.0,
    proposals: [],
  },
]
