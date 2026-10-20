import { defineChain } from 'viem'
// Arc Network Constants
export const ARC_CONTRACT_ADDRESS = import.meta.env.VITE_ARC_CONTRACT_ADDRESS;
export const ARC_RPC_DRPC_OFFICIAL = "https://rpc.drpc.testnet.arc.io";
export const ARC_RPC_DRPC_PROXY = "https://rpc.blockdaemon.testnet.arc.io";
export const ARC_RPC_OFFICIAL = "https://rpc.testnet.arc.io";
export const ARC_RPC = ARC_RPC_DRPC_OFFICIAL;
export const ARC_RPC_FALLBACK = ARC_RPC_DRPC_PROXY;

// Project ID
export const projectId = import.meta.env.VITE_REOWN_PROJECT_ID;
export const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN;
const isLocal = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || 
     window.location.hostname === '127.0.0.1' || 
     window.location.hostname.startsWith('192.168.'));

// Priority Detection: Automatic fall-back for production environments
const rawKeeperUrl = isLocal 
    ? (import.meta.env.VITE_KEEPER_URL || "http://localhost:3010")
    : (import.meta.env.VITE_KEEPER_URL && !import.meta.env.VITE_KEEPER_URL.includes('localhost') 
        ? import.meta.env.VITE_KEEPER_URL 
        : "https://api.15market.online");

export const KEEPER_URL = rawKeeperUrl.endsWith('/') ? rawKeeperUrl.slice(0, -1) : rawKeeperUrl;
export const KEEPER_URL_ARC = KEEPER_URL; // Unified backend
export const KEEPER_URL_ROUNDS = KEEPER_URL; // Unified backend



// Chain Definition for Arc
export const arcTestnet = defineChain({
    id: 5042002,
    name: 'Arc Testnet',
    nativeCurrency: {
        name: 'USDC',
        symbol: 'USDC',
        decimals: 18
    },
    rpcUrls: {
        default: {
            http: [ARC_RPC_DRPC_OFFICIAL, ARC_RPC_DRPC_PROXY, ARC_RPC_OFFICIAL],
        },
        public: {
            http: [ARC_RPC_DRPC_OFFICIAL, ARC_RPC_DRPC_PROXY, ARC_RPC_OFFICIAL],
        },
    },
    blockExplorers: {
        default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
    },
    testnet: true,
});
