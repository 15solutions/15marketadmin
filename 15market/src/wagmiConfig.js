import { createConfig } from '@privy-io/wagmi';
import { http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { arcTestnet, monadTestnet, avalancheFuji, sepolia } from './constants';

export const config = createConfig({
    chains: [arcTestnet, monadTestnet, avalancheFuji, sepolia],
    // Explicit injected connector so the branded login page can connect a
    // browser wallet directly (fully custom UI, zero Privy modal) instead of
    // depending on whichever connectors Privy injects on its own.
    connectors: [injected()],
    transports: {
        [arcTestnet.id]: http(),
        [monadTestnet.id]: http(),
        [avalancheFuji.id]: http(),
        [sepolia.id]: http(),
    },
});


