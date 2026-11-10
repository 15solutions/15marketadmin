// ============================================================
// nexus-core/src/config.js
// Single source of truth for all configuration
// ============================================================
require('dotenv').config();

module.exports = {
  // Network
  PORT: Number(process.env.PORT || 3010),
  ROUNDS_PORT: Number(process.env.ROUNDS_PORT || 3011),
  
  // Blockchain / Arc Testnet
  CHAIN_ID: Number(process.env.CHAIN_ID || 5042002),
  RPCS: [
    process.env.ARC_RPC_1,
    process.env.ARC_RPC_2,
    process.env.ARC_RPC_3,
    process.env.ARC_RPC_4
  ].filter(Boolean),
  THIRDWEB_SECRET_KEY: process.env.THIRDWEB_SECRET_KEY,
  THIRDWEB_CLIENT_ID: process.env.THIRDWEB_CLIENT_ID,
  PRIVATE_KEY: process.env.PRIVATE_KEY,
  CONTRACT_ADDRESS: process.env.ARC_CONTRACT_ADDRESS,
  ROUNDS_CONTRACT_ADDRESS: process.env.ROUNDS_CONTRACT_ADDRESS,

  // Session-wallet derivation secret — REQUIRED, no default. If missing,
  // deriveSessionWallet() throws so we never silently derive from a known string.
  SESSION_MASTER_SECRET: process.env.SESSION_MASTER_SECRET || '',
  
  // Classic Trades
  BATCH_WINDOW_MS: Number(process.env.SETTLEMENT_BATCH_WINDOW_MS || 25),
  SETTLEMENT_CONCURRENCY: Number(process.env.SETTLEMENT_CONCURRENCY || 16),
  DEFAULT_SESSION_BALANCE: Number(process.env.DEFAULT_SESSION_BALANCE || 1000),
  PAYOUT_INLINE_FALLBACK: String(process.env.PAYOUT_INLINE_FALLBACK || 'true') === 'true',

  // Payout Multipliers (hardcoded — do NOT source from env)
  // Duration tiers: 5s = 2.90x, 10s = 2.40x, 15s = 1.90x
  // Applied as: stake * multiplier * 0.99 (1% platform fee)
  MULTIPLIERS: { 5: 2.90, 10: 2.40, 15: 1.90 },
  
  // Auth: wallet address-based identity (Reown / WalletConnect)

  // Redis
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // Auto-Signer
  FACTORY_ADDRESS: process.env.ARC_FACTORY_ADDRESS || '0x0000000000000000000000000000000000000000',
  TREASURY_ADDRESS: process.env.TREASURY_ADDRESS || '0x0000000000000000000000000000000000000000',
  FEE_COLLECTOR: process.env.FEE_COLLECTOR || '0xf6d5A5eC5e404DeD248f5474f12E7c620cf0E9CB',

  // Solana
  SOL_GAS_TANK_KEY: process.env.SOL_GAS_TANK_KEY || null,  // bs58 private key — set when available
  SOL_DEVNET_RPC: process.env.SOL_DEVNET_RPC || 'https://api.devnet.solana.com',
  SOL_DEVNET_USDC_MINT: process.env.SOL_DEVNET_USDC_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',

  // Tower Exchange (DEX aggregator on Arc) — server-side key only, NEVER a
  // bundled default. When unset, swap quoting degrades to the on-chain path.
  TOWER_API_KEY: process.env.TOWER_API_KEY || '',

  // CORS
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || 'https://15market.online').split(',').map(s => s.trim()),
};
