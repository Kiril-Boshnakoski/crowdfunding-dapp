"use client"

import { createContext, useContext, useMemo, useState, useEffect, type ReactNode } from "react"
import { useAccount, useConnect, useDisconnect } from "wagmi"
import type { Address } from "./types"

interface WalletState {
  address: Address | null
  isConnected: boolean
  connect: () => void
  disconnect: () => void
}

const WalletContext = createContext<WalletState | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()

  const handleConnect = () => {
    const injectedConnector = connectors.find((c) => c.id === "injected")
    if (injectedConnector) {
      connect({ connector: injectedConnector })
    } else if (connectors.length > 0) {
      connect({ connector: connectors[0] })
    }
  }

  const value = useMemo<WalletState>(() => {
    if (!mounted) {
      return {
        address: null,
        isConnected: false,
        connect: () => {},
        disconnect: () => {},
      }
    }
    return {
      address: (address || null) as Address | null,
      isConnected,
      connect: handleConnect,
      disconnect,
    }
  }, [mounted, address, isConnected, connectors, connect, disconnect])

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
}

export function useWallet() {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider")
  return ctx
}

