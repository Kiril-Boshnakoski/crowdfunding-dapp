"use client"

import { useState } from "react"
import {
  ChevronDown,
  Clock,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/progress-bar"
import { StatusBadge } from "@/components/status-badge"
import { ProposalCard } from "@/components/proposal-card"
import { getCampaignState, type Campaign } from "@/lib/types"
import { cn } from "@/lib/utils"

function deadlineLabel(ts: number) {
  const diff = ts - Date.now()
  if (diff <= 0) return "Ended"
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days >= 1) return `${days}d left`
  const hours = Math.floor(diff / (1000 * 60 * 60))
  return `${hours}h left`
}

export function CampaignCard({
  campaign,
  onContribute,
  onVote,
  onExecute,
  onRefund,
}: {
  campaign: Campaign
  onContribute: (campaignId: number, amount: number) => void
  onVote: (campaignId: number, proposalId: number, support: boolean) => void
  onExecute: (campaignId: number, proposalId: number) => void
  onRefund: (campaignId: number) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [amount, setAmount] = useState("")

  const state = getCampaignState(campaign)
  const isActive = state === "active"
  const isFunded = state === "funded"
  const isFailed = state === "failed"
  const canRefund = isFailed && campaign.myContribution > 0

  function handleContribute() {
    const value = Number(amount)
    if (!value || value <= 0) return
    // Wiring note: contract write -> contribute(campaignId) with msg.value
    onContribute(campaign.id, value)
    setAmount("")
  }

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/30">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {isActive && (
                <StatusBadge tone="active">
                  <Sparkles className="size-3" /> Active
                </StatusBadge>
              )}
              {isFunded && (
                <StatusBadge tone="funded">
                  <ShieldCheck className="size-3" /> Funded
                </StatusBadge>
              )}
              {isFailed && <StatusBadge tone="failed">Goal not met</StatusBadge>}
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3" /> {deadlineLabel(campaign.deadline)}
              </span>
            </div>
            <h3 className="text-base font-semibold leading-snug text-balance">
              {campaign.title}
            </h3>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground text-pretty">
              {campaign.description}
            </p>
          </div>
        </div>

        <ProgressBar value={campaign.raised} goal={campaign.goal} />

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-mono">
            <Users className="size-3" /> by {campaign.creator}
          </span>
          {campaign.myContribution > 0 && (
            <span>
              You backed{" "}
              <span className="font-medium text-foreground">
                {campaign.myContribution} ETH
              </span>
            </span>
          )}
        </div>

        {/* Contribute — only while the campaign is live */}
        {isActive && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                aria-label={`Contribution amount for ${campaign.title}`}
                className="w-full rounded-lg border border-border bg-background py-2 pl-3 pr-12 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/30"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                ETH
              </span>
            </div>
            <Button size="lg" onClick={handleContribute}>
              Contribute
            </Button>
          </div>
        )}

        {/* Refund — only when the campaign failed and the user has funds locked */}
        {canRefund && (
          <Button
            variant="destructive"
            size="lg"
            className="w-full gap-2"
            onClick={() => onRefund(campaign.id)}
          >
            <RotateCcw className="size-4" />
            Claim refund of {campaign.myContribution} ETH
          </Button>
        )}
      </div>

      {/* Governance view — available once a campaign is funded */}
      {isFunded && (
        <div className="border-t border-border">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="flex w-full items-center justify-between px-5 py-3 text-sm font-medium transition-colors hover:bg-muted/40"
          >
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              Governance · {campaign.proposals.length} proposal
              {campaign.proposals.length === 1 ? "" : "s"}
            </span>
            <ChevronDown
              className={cn("size-4 transition-transform", expanded && "rotate-180")}
            />
          </button>

          {expanded && (
            <div className="space-y-4 border-t border-border bg-muted/20 p-5">
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Raised" value={`${campaign.raised.toFixed(1)}`} />
                <Stat label="Released" value={`${campaign.released.toFixed(1)}`} />
                <Stat
                  label="Treasury"
                  value={`${(campaign.raised - campaign.released).toFixed(1)}`}
                  highlight
                />
              </div>

              {campaign.proposals.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
                  No spending proposals yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {campaign.proposals.map((p) => (
                    <ProposalCard
                      key={p.id}
                      proposal={p}
                      onVote={(proposalId, support) =>
                        onVote(campaign.id, proposalId, support)
                      }
                      onExecute={(proposalId) => onExecute(campaign.id, proposalId)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  )
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-sm font-semibold", highlight && "text-primary")}>
        {value} <span className="text-xs font-normal text-muted-foreground">ETH</span>
      </p>
    </div>
  )
}
