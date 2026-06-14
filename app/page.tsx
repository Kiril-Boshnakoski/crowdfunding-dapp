import { Navbar } from "@/components/navbar"
import { Dashboard } from "@/components/dashboard"
import { WalletProvider } from "@/lib/use-wallet"

export default function Page() {
  return (
    <WalletProvider>
      <div className="min-h-screen bg-background">
        <Navbar />
        <Dashboard />
      </div>
    </WalletProvider>
  )
}
