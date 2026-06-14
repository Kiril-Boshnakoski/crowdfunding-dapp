"use client"

import { Boxes, LogOut, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useWallet } from "@/lib/use-wallet"

export function Navbar() {
  const { address, isConnected, connect, disconnect } = useWallet()

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/25">
            <Boxes className="size-5 text-primary" aria-hidden="true" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">FundDAO</p>
            <p className="text-xs text-muted-foreground">Governed Crowdfunding</p>
          </div>
        </div>

        {isConnected ? (
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 sm:flex">
              <span className="size-2 rounded-full bg-success" aria-hidden="true" />
              <span className="font-mono text-sm">{address}</span>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={disconnect}
              aria-label="Disconnect wallet"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        ) : (
          <Button onClick={connect} className="gap-2">
            <Wallet className="size-4" />
            Connect Wallet
          </Button>
        )}
      </div>
    </header>
  )
}
