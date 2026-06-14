"use client"

import { useEffect, useState, type FormEvent } from "react"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface NewCampaignInput {
  title: string
  description: string
  goal: number
  durationDays: number
}

export function CreateCampaignModal({
  onCreate,
}: {
  onCreate: (input: NewCampaignInput) => void
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [goal, setGoal] = useState("")
  const [duration, setDuration] = useState("")

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    if (open) document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  function reset() {
    setTitle("")
    setDescription("")
    setGoal("")
    setDuration("")
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // Wiring note: replace with a contract write, e.g.
    // writeContract({ functionName: "createCampaign", args: [...] })
    onCreate({
      title: title.trim(),
      description: description.trim(),
      goal: Number(goal),
      durationDays: Number(duration),
    })
    reset()
    setOpen(false)
  }

  const labelClass = "text-sm font-medium text-foreground"
  const inputClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/30"

  return (
    <>
      <Button size="lg" className="gap-2" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Create Campaign
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-campaign-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 id="create-campaign-title" className="text-base font-semibold">
                Launch a new campaign
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <X className="size-4" />
              </Button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="c-title" className={labelClass}>
                  Title
                </label>
                <input
                  id="c-title"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Open Source ZK Rollup Toolkit"
                  className={inputClass}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="c-desc" className={labelClass}>
                  Description
                </label>
                <textarea
                  id="c-desc"
                  required
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What are you raising funds for?"
                  className={`${inputClass} resize-none`}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="c-goal" className={labelClass}>
                    Funding goal (ETH)
                  </label>
                  <input
                    id="c-goal"
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="50"
                    className={inputClass}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="c-duration" className={labelClass}>
                    Duration (days)
                  </label>
                  <input
                    id="c-duration"
                    required
                    type="number"
                    min="1"
                    step="1"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="30"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="mt-1 flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="lg">
                  Launch campaign
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
