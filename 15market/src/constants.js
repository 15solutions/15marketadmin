// Network Constants & Chain Definitions
import { defineChain } from 'viem'

// ARC TESTNET
export const ARC_CHAIN_ID = 5042002;

export const ARC_RPCS = [
    "https://rpc.testnet.arc.network", // Arc Official
];

export const ARC_RPC = ARC_RPCS[0];
export const ARC_EXPLORER = "https://testnet.arcscan.app";
export const ARC_CONTRACT_ADDRESS = import.meta.env.VITE_ARC_CONTRACT_ADDRESS;
export const ARC_ROUNDS_CONTRACT_ADDRESS = import.meta.env.VITE_ARC_ROUNDS_CONTRACT_ADDRESS || "0x02AE9D2a7CEca436E7B3A482772EfB74C4fE4721";
export const ARC_USDC_ADDRESS = "0x0000000000000000000000000000000000000000"; // Native Coin
export const ARC_RPC_BACKUP = ARC_RPCS[0];

// 3. Chain Definition for Arc (Moved to top to prevent TDZ)
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
            http: [...ARC_RPCS],
        },
        public: {
            http: [...ARC_RPCS],
        },
    },
    blockExplorers: {
        default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
    },
    testnet: true,
});

export const monadTestnet = defineChain({
    id: 10143,
    name: 'Monad Testnet',
    nativeCurrency: {
        name: 'MON',
        symbol: 'MON',
        decimals: 18
    },
    rpcUrls: {
        default: { http: ['https://testnet-rpc.monad.xyz/'] },
        public: { http: ['https://testnet-rpc.monad.xyz/'] },
    },
    blockExplorers: {
        default: { name: 'MonadExplorer', url: 'https://testnet.monadexplorer.com' },
    },
    testnet: true,
});

export const avalancheFuji = defineChain({
    id: 43113,
    name: 'Avalanche Fuji',
    nativeCurrency: {
        name: 'AVAX',
        symbol: 'AVAX',
        decimals: 18
    },
    rpcUrls: {
        default: { http: ['https://avalanche-fuji-c-chain-rpc.publicnode.com'] },
        public: { http: ['https://avalanche-fuji-c-chain-rpc.publicnode.com'] },
    },
    blockExplorers: {
        default: { name: 'SnowTrace', url: 'https://testnet.snowtrace.io' },
    },
    testnet: true,
});

export const sepolia = defineChain({
    id: 11155111,
    name: 'Sepolia',
    nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18
    },
    rpcUrls: {
        default: { http: ['https://ethereum-sepolia-rpc.publicnode.com'] },
        public: { http: ['https://ethereum-sepolia-rpc.publicnode.com'] },
    },
    blockExplorers: {
        default: { name: 'Etherscan', url: 'https://sepolia.etherscan.io' },
    },
    testnet: true,
});

// 2. Keeper Configuration
const isNative = typeof window !== 'undefined' && !!window.Capacitor;
const isLocal = typeof window !== 'undefined' &&
    !isNative &&
    (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        /^192\.168\./.test(window.location.hostname) ||
        /^10\./.test(window.location.hostname) ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(window.location.hostname)); // Precise Private IP ranges

// Derivation logic:
// 1. If VITE_KEEPER_URL is an absolute URL (starts with http), use it always.
// 2. If it's a relative path (starts with /), only use it if we are local OR we explicitly want proxying (like in some local dev setups).
// 3. Fallback to hardcoded absolute URL for production if ENV is relative or missing.

const envUrl = import.meta.env.VITE_KEEPER_URL;
const envUrlArc = import.meta.env.VITE_KEEPER_URL_ARC;

// If we are local, and the env variable is missing or pointing to the production domain,
// we should default to the local backend to prevent "Failed to Fetch" or CORS errors.
// Must stay in sync with render.yaml (VITE_KEEPER_URL_ARC) and the backend
// ALLOWED_ORIGINS. This was "https://api.15market.com", which refuses TCP
// connections outright, so any bundle built without VITE_KEEPER_URL_ARC fell
// back to a dead host and every balance request failed.
const PRODUCTION_BACKEND = "https://api.15market.online";

// Canonical FRONTEND origin. Anything a user can scan or share has to point at
// the host that actually serves the app, so it belongs here next to the backend
// constant rather than being hardcoded per component.
//
// Derived from window.location.origin on any real (non-loopback) host, which
// keeps preview/tunnel origins self-correcting, and pinned to production on
// localhost so a QR generated during local dev still opens the live site
// instead of a dead http://localhost link.
const isLoopbackHost = (hostname) =>
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    /^192\.168\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);

const PRODUCTION_SITE = "https://15market.online";

export const SITE_URL = (typeof window !== 'undefined' &&
    window.location &&
    window.location.origin &&
    !isLoopbackHost(window.location.hostname))
    ? window.location.origin
    : PRODUCTION_SITE;

const getBaseUrl = (envValue) => {
    // Absolute env URLs always win (works for local + production).
    if (envValue && (envValue.startsWith('http://') || envValue.startsWith('https://'))) {
        return envValue;
    }

    // Local dev defaults to localhost:3010 (matches admin behavior)
    if (isLocal) {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
        return `http://${host}:3010`;
    }

    // Relative path env values (e.g. /arc-api) are still supported.
    if (envValue) return envValue;

    return PRODUCTION_BACKEND;
};

const rawKeeperUrl = getBaseUrl(envUrl);
const rawKeeperUrlArc = getBaseUrl(envUrlArc);

const ensureAbsolute = (url) => {
    if (!url) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    // Don't modify absolute paths in local dev
    if (url.startsWith('/') || url.includes('localhost')) return url;
    return `https://${url}`;
};

export const KEEPER_URL = ensureAbsolute(rawKeeperUrl).endsWith('/') ? ensureAbsolute(rawKeeperUrl).slice(0, -1) : ensureAbsolute(rawKeeperUrl);
export const KEEPER_URL_ARC = ensureAbsolute(rawKeeperUrlArc).endsWith('/') ? ensureAbsolute(rawKeeperUrlArc).slice(0, -1) : ensureAbsolute(rawKeeperUrlArc);

export const KEEPER_URL_ROUNDS = `${KEEPER_URL_ARC}/rounds`;

const envPriceUrl = import.meta.env.VITE_PRICE_FEED_URL;
export const PRICE_FEED_URL = envPriceUrl || (isLocal 
    ? `http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:3012` 
    : KEEPER_URL_ARC);



// PRODUCTION DIAGNOSTIC - Helps find "Failed to Fetch" causes
console.log(`🌐 [Config] API Endpoint: ${KEEPER_URL_ARC}`);
console.log(`🎯 [Config] Rounds API: ${KEEPER_URL_ROUNDS}`);
if (!isLocal && KEEPER_URL_ARC.includes('localhost')) {
    console.warn("⚠️ [Config] WARNING: Production frontend is trying to call a LOCAL backend. Check VITE_KEEPER_URL_ARC environment variable in Vercel.");
}
// A missing/relative VITE_KEEPER_URL_ARC silently falls back to the hardcoded
// production domain, which is how a wrong host reached users unnoticed. Make the
// fallback explicit and loud.
if (!isLocal && !envUrlArc) {
    console.warn(`⚠️ [Config] VITE_KEEPER_URL_ARC is not set at build time — falling back to ${PRODUCTION_BACKEND}. Set it in Render to pin the API host.`);
}
export const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN;

// 2. Project ID (Reown / WalletConnect)
export const projectId = import.meta.env.VITE_REOWN_PROJECT_ID;

// ─── Country → fiat gateway matching ─────────────────────────────────────
// Collected once at onboarding (ISO 3166-1 alpha-2) and stored on the
// profile. The funding UI offers exactly the rails listed for the user's
// country; unknown/unset countries fall back to DEFAULT_GATEWAYS.
// Nigeria first: launch corridor (bank transfer rails).
export const COUNTRY_LIST = [
  { code: 'NG', name: 'Nigeria' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'GH', name: 'Ghana' },
  { code: 'KE', name: 'Kenya' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'IN', name: 'India' },
  { code: 'BR', name: 'Brazil' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'AU', name: 'Australia' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SG', name: 'Singapore' },
  { code: 'PH', name: 'Philippines' },
  { code: 'PK', name: 'Pakistan' },
  { code: 'BD', name: 'Bangladesh' },
];

export const DEFAULT_GATEWAYS = ['transak'];

export const GATEWAYS_BY_COUNTRY = {
  NG: ['yellowcard', 'onramper', 'transak'],
  GH: ['yellowcard', 'onramper', 'transak'],
  KE: ['yellowcard', 'onramper', 'transak'],
  ZA: ['yellowcard', 'onramper', 'transak'],
};

export const gatewaysForCountry = (code) => {
  const c = String(code || '').trim().toUpperCase();
  return GATEWAYS_BY_COUNTRY[c] || DEFAULT_GATEWAYS;
};

