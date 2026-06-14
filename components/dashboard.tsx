"use client"

import { useMemo, useState } from "react"
import { Coins, Layers, TrendingUp, Vote } from "lucide-react"
import { CampaignCard } from "@/components/campaign-card"
import { CreateCampaignModal, type NewCampaignInput } from "@/components/create-campaign-modal"
import { getCampaignState, type Campaign } from "@/lib/types"
import { mockCampaigns } from "@/lib/mock-data"
import { cn } from "@/lib/utils"

type Filter = "all" | "active" | "funded" | "failed"

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "funded", label: "Funded" },
  { id: "failed", label: "Failed" },
]

export function Dashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>(mockCampaigns)
  const [filter, setFilter] = useState<Filter>("all")

  const stats = useMemo(() => {
    const totalRaised = campaigns.reduce((sum, c) => sum + c.raised, 0)
    const proposals = campaigns.reduce((sum, c) => sum + c.proposals.length, 0)
    const active = campaigns.filter((c) => getCampaignState(c) === "active").length
    return { totalRaised, proposals, active, total: campaigns.length }
  }, [campaigns])

  const visible = useMemo(
    () =>
      filter === "all"
        ? campaigns
        : campaigns.filter((c) => getCampaignState(c) === filter),
    [campaigns, filter],
  )

  // --- Mock contract actions (replace with contract writes + refetch) ---

  function handleCreate(input: NewCampaignInput) {
    setCampaigns((prev) => [
      {
        id: Math.max(0, ...prev.map((c) => c.id)) + 1,
        title: input.title,
        description: input.description,
        creator: "0xF39f...2266",
        goal: input.goal,
        raised: 0,
        released: 0,
        deadline: Date.now() + input.durationDays * 24 * 60 * 60 * 1000,
        myContribution: 0,
        proposals: [],
      },
      ...prev,
    ])
  }

  function handleContribute(campaignId: number, amount: number) {
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === campaignId
          ? { ...c, raised: c.raised + amount, myContribution: c.myContribution + amount }
          : c,
      ),
    )
  }

  function handleVote(campaignId: number, proposalId: number, support: boolean) {
    setCampaigns((prev) =>
      prev.map((c) => {
        if (c.id !== campaignId) return c
        return {
          ...c,
          proposals: c.proposals.map((p) => {
            if (p.id !== proposalId) return p
            const weight = c.myContribution || 1
            return {
              ...p,
              hasVoted: true,
              yesWeight: support ? p.yesWeight + weight : p.yesWeight,
              noWeight: support ? p.noWeight : p.noWeight + weight,
            }
          }),
        }
      }),
    )
  }

  function handleExecute(campaignId: number, proposalId: number) {
    setCampaigns((prev) =>
      prev.map((c) => {
        if (c.id !== campaignId) return c
        const proposal = c.proposals.find((p) => p.id === proposalId)
        const released = proposal ? c.released + Number(proposal.amount) : c.released
        return {
          ...c,
          released,
          proposals: c.proposals.map((p) =>
            p.id === proposalId ? { ...p, status: "Executed" as const } : p,
          ),
        }
      }),
    )
  }

  function handleRefund(campaignId: number) {
    setCampaigns((prev) =>
      prev.map((c) => (c.id === campaignId ? { ...c, myContribution: 0 } : c)),
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-balance">
            Crowdfunding, governed by backers
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground text-pretty">
            Back campaigns with ETH. Once funded, every spend is decided on-chain by
            contribution-weighted proposals.
          </p>
        </div>
        <CreateCampaignModal onCreate={handleCreate} />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Coins} label="Total Raised" value={`${stats.totalRaised.toFixed(1)} ETH`} />
        <StatCard icon={Layers} label="Campaigns" value={stats.total.toString()} />
        <StatCard icon={TrendingUp} label="Active" value={stats.active.toString()} />
        <StatCard icon={Vote} label="Proposals" value={stats.proposals.toString()} />
      </div>

      <div className="mt-8 flex items-center gap-1.5">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
              filter === f.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {visible.map((c) => (
          <CampaignCard
            key={c.id}
            campaign={c}
            onContribute={handleContribute}
            onVote={handleVote}
            onExecute={handleExecute}
            onRefund={handleRefund}
          />
        ))}
      </div>

      {visible.length === 0 && (
        <p className="mt-16 text-center text-sm text-muted-foreground">
          No campaigns in this category yet.
        </p>
      )}
    </main>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  )
}
