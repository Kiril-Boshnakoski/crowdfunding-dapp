import { cn } from "@/lib/utils"

export function ProgressBar({
  value,
  goal,
  className,
}: {
  value: number
  goal: number
  className?: string
}) {
  const pct = goal > 0 ? Math.min((value / goal) * 100, 100) : 0
  const reached = value >= goal

  return (
    <div className={cn("space-y-2", className)}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            reached ? "bg-success" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">
          {value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ETH
        </span>
        <span className="text-muted-foreground">
          {pct.toFixed(0)}% of {goal.toLocaleString(undefined, { maximumFractionDigits: 2 })} ETH
        </span>
      </div>
    </div>
  )
}
