'use html';
'use client';

import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

// Configure Wagmi config
export const config = createConfig({
  chains: [mainnet, sepolia],
  connectors: [
    injected(), // Supports Metamask, Frame, Rabby, Brave, etc.
  ],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(), // We use Sepolia testnet or local networks for testing
  },
});

export function Providers({ children }: { children: React.ReactNode }) {
  // Ensure QueryClient is only initialized once on the client side
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}