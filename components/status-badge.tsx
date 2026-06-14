import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

type Tone = "active" | "passed" | "rejected" | "executed" | "neutral" | "funded" | "failed"

const toneStyles: Record<Tone, string> = {
  active: "bg-chart-2/15 text-chart-2 ring-chart-2/25",
  passed: "bg-success/15 text-success ring-success/25",
  executed: "bg-primary/15 text-primary ring-primary/25",
  funded: "bg-primary/15 text-primary ring-primary/25",
  rejected: "bg-destructive/15 text-destructive ring-destructive/25",
  failed: "bg-destructive/15 text-destructive ring-destructive/25",
  neutral: "bg-muted text-muted-foreground ring-border",
}

export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: Tone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        toneStyles[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
