"use client"

import { Check, Clock, Play, ThumbsDown, ThumbsUp, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ProgressBar } from "@/components/progress-bar"
import { StatusBadge } from "@/components/status-badge"
import type { Proposal } from "@/lib/types"

function timeLeft(ts: number) {
  const diff = ts - Date.now()
  if (diff <= 0) return "Voting closed"
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  if (days > 0) return `${days}d ${hours}h left`
  return `${hours}h left`
}

const statusTone = {
  Active: "active",
  Passed: "passed",
  Rejected: "rejected",
  Executed: "executed",
} as const

export function ProposalCard({
  proposal,
  onVote,
  onExecute,
}: {
  proposal: Proposal
  onVote: (proposalId: number, support: boolean) => void
  onExecute: (proposalId: number) => void
}) {
  const totalWeight = proposal.yesWeight + proposal.noWeight
  const canVote = proposal.status === "Active" && !proposal.hasVoted
  const canExecute = proposal.status === "Passed"

  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug text-pretty">{proposal.reason}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            to {proposal.recipient}
          </p>
        </div>
        <StatusBadge tone={statusTone[proposal.status]}>{proposal.status}</StatusBadge>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-lg bg-muted px-3 py-2">
        <span className="text-xs text-muted-foreground">Requested</span>
        <span className="text-sm font-semibold text-primary">{proposal.amount} ETH</span>
      </div>

      <div className="mt-3 space-y-1.5">
        <ProgressBar value={proposal.yesWeight} goal={totalWeight || 1} />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 text-success">
            <ThumbsUp className="size-3" /> {proposal.yesWeight.toFixed(1)} ETH
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" /> {timeLeft(proposal.votingEndsAt)}
          </span>
          <span className="inline-flex items-center gap-1 text-destructive">
            {proposal.noWeight.toFixed(1)} ETH <ThumbsDown className="size-3" />
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {canVote ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5 text-success hover:text-success"
              onClick={() => onVote(proposal.id, true)}
            >
              <ThumbsUp className="size-3.5" /> Vote Yes
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5 text-destructive hover:text-destructive"
              onClick={() => onVote(proposal.id, false)}
            >
              <ThumbsDown className="size-3.5" /> Vote No
            </Button>
          </>
        ) : proposal.status === "Active" && proposal.hasVoted ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="size-3.5 text-success" /> You voted on this proposal
          </p>
        ) : proposal.status === "Rejected" ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <X className="size-3.5 text-destructive" /> Proposal did not pass
          </p>
        ) : proposal.status === "Executed" ? (
          <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Check className="size-3.5 text-primary" /> Funds released
          </p>
        ) : null}

        {canExecute && (
          <Button size="sm" className="flex-1 gap-1.5" onClick={() => onExecute(proposal.id)}>
            <Play className="size-3.5" /> Execute
          </Button>
        )}
      </div>
    </div>
  )
}
