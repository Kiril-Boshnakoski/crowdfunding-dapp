"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import type { Address } from "./types"

// Mock wallet provider. Swap the body of `connect` for a real
// Wagmi/RainbowKit connector and read `address`/`isConnected` from
// `useAccount()` later — the consuming components won't need to change.

interface WalletState {
  address: Address | null
  isConnected: boolean
  connect: () => void
  disconnect: () => void
}

const WalletContext = createContext<WalletState | null>(null)

const MOCK_ADDRESS = "0xF39f...2266" as Address

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<Address | null>(null)

  const connect = useCallback(() => setAddress(MOCK_ADDRESS), [])
  const disconnect = useCallback(() => setAddress(null), [])

  const value = useMemo<WalletState>(
    () => ({ address, isConnected: address !== null, connect, disconnect }),
    [address, connect, disconnect],
  )

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider")
  return ctx
}
