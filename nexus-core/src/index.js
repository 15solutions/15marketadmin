// ==================================================================================
// NEXUS CORE - SYSTEM ARCHITECTURE (UNIFIED ENTRY POINT)
// ==================================================================================
// This is the primary backend controller for the 15MARKET trading platform. 
// It handles:
// 1. DETERMINISTIC SESSION WALLETS: Generating secure, server-side EOAs for users.
// 2. REAL-TIME PRICE AGGREGATION: High-frequency polling from Pyth, Binance, and MEXC.
// 3. SECURE SETTLEMENT: Managing trade execution, payouts, and platform fee routing.
// 4. API & WEBSOCKETS: Real-time data streaming and user session management.
// ==================================================================================
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

// SAFETY NET: Prevent ethers.js v6 internal polling rejections from crashing the process.
// Even with manual receipt polling, some ethers internals can emit unhandled rejections.
process.on('unhandledRejection', (reason, promise) => {
    const msg = reason?.message || String(reason);
    // Silently swallow known RPC rate-limit errors from ethers internals
    if (msg.includes('request limit reached') || msg.includes('could not coalesce') || msg.includes('fetch')) {
        return;
    }
    console.error('[UnhandledRejection]', msg?.substring(0, 200));
});

const config = require('./config');
const cache = require('./cache');
const rpc = require('./rpc');
const provider = rpc.provider;
const ClassicEngine = require('./classic');
const profiles = require('./profiles');
const { ethers } = require('ethers');
const circleService = require('./services/circleService');
const fundingService = require('./services/fundingService');
const notificationService = require('./services/notificationService');
const OddsEngine = require('./services/OddsEngine');
const priceService = require('./services/priceService');
const settlementPriceService = require('./services/settlementPriceService');
const chainReconciler = require('./services/chainReconciler');
const { requireAdminAuth, requirePerm, requireRoot, handleAdminAuthStatus, handleAdminBootstrap, handleAdminMe, handleAdminList, handleAdminCreate, handleAdminUpdate, handleAdminDelete } = require('./security');

// --- DYNAMICALLY DERIVED SOLANA RELAYER ADDRESS ---
let derivedSolanaRelayerAddress = '11111111111111111111111111111111'; // default fallback
if (config.SOL_GAS_TANK_KEY) {
  try {
    const bs58 = require('bs58');
    const { Keypair } = require('@solana/web3.js');
    const dec = bs58.default ? bs58.default.decode : bs58.decode;
    const kp = Keypair.fromSecretKey(dec(config.SOL_GAS_TANK_KEY));
    derivedSolanaRelayerAddress = kp.publicKey.toString();
    console.log('[Solana] Derived relayer address from env key:', derivedSolanaRelayerAddress);
  } catch (err) {
    console.error('[Solana] Failed to derive relayer address from SOL_GAS_TANK_KEY:', err.message);
  }
}


// --- Setup Server ---
const app = express();
const server = http.createServer(app);

/**
 * CORS origin policy.
 *
 * In production this is the exact ALLOWED_ORIGINS allowlist and nothing else.
 * Outside production it additionally accepts loopback and private-LAN origins
 * on ANY port, because the frontend treats all of them as "local" and then
 * calls `http://<that-host>:<PORT>` (see 15market/src/constants.js). Without
 * this, 127.0.0.1, 192.168.x.x and Vite's port fallback (5174) get no
 * Access-Control-Allow-Origin header and the browser silently drops the
 * response â€” which looks exactly like "my balance is not loading".
 */
const isAllowedOrigin = (origin) => {
    if (!origin) return false;
    if (config.ALLOWED_ORIGINS.includes(origin)) return true;
    if (process.env.NODE_ENV === 'production') return false;
    try {
        const { hostname } = new URL(origin);
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') return true;
        if (/^192\.168\./.test(hostname) || /^10\./.test(hostname) || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) return true;
    } catch { /* malformed origin â€” not allowed */ }
    return false;
};

const corsOptions = { origin: (origin, cb) => cb(null, isAllowedOrigin(origin)), credentials: true };
const io = new Server(server, { cors: corsOptions });
notificationService.init(io);


app.use(cors(corsOptions));
app.use(express.json());

// --- Deterministic Session Wallet Derivation ---

/**
 * DETERMINISTIC SESSION WALLET DERIVATION
 * ---------------------------------------
 * Generates a unique, server-side Ethereum account (EOA) for every user.
 * Rationale: Allows the platform to sign transactions (payouts/settlements) 
 * on behalf of the user without requiring them to sign every single trade on-chain.
 * 
 * SECURITY NOTE: The MASTER_SECRET must be kept highly secure. If compromised, 
 * an attacker could derive the private keys for ALL user session wallets.
 * 
 * @param {string} userAddr - The user's primary wallet address.
 * @returns {ethers.Wallet} - The derived wallet connected to the provider.
 */
function deriveSessionWallet(userAddr) {
  return rpc.deriveSessionWallet(userAddr);
}

// --- Initialize Engines ---
const classicEngine = new ClassicEngine(io);

// --- HEALTH & ADMIN AUTH ROUTES ---
//
// Declared here, not at the top of the file: `app` is created further down and
// classicEngine is constructed just above, so registering these earlier threw
// "Cannot access 'app' before initialization" and the process would not boot at
// all. Route order in this file is not free â€” it has to follow the objects the
// handlers close over.

/**
 * GET /health/settlement
 *
 * "Are most trades settling?" needs an answer you can read, not an impression.
 * The failure this exists to catch was silent: an unusable exit price used to be
 * turned into a LOST verdict, so a price-feed gap quietly cost users their stake
 * with nothing counting it.
 *
 * No auth and no PII â€” just aggregate counters, safe to poll. Counters are
 * in-process and reset on deploy, which is exactly the window you care about
 * when a change is live.
 */
app.get('/health/settlement', (req, res) => {
  const s = classicEngine._settlementStats();
  const decided = s.settledWins + s.settledLosses;
  res.json({
    ok: true,
    settled: {
      wins: s.settledWins,
      losses: s.settledLosses,
      total: decided,
      // Share of decided trades that produced a real verdict. Disputes are
      // excluded on purpose: they are the platform failing, not the market.
      autoSettledRate: decided > 0 ? Number(((decided / (decided + s.disputes)) * 100).toFixed(2)) : null
    },
    disputes: {
      total: s.disputes,
      byReason: s.byReason,
      // Anything above zero means users are waiting on a human.
      note: s.disputes > 0
        ? 'Users are blocked on these until an admin resolves them.'
        : 'none open'
    },
    liveTradesInMemory: cache.trades.size,
    sinceProcessStart: true
  });
});

/**
 * ADMIN AUTH (Supabase Auth) â€” routes
 *
 * Identity lives in Supabase Auth; authorisation in the admin_users table
 * (migration 011). The FIRST bootstrap becomes the root admin (the only root
 * there will ever be); the root can create admins & moderators and grant
 * granular permissions. Tokens are Supabase access tokens sent as
 * `Authorization: Bearer <token>` â€” see src/security.js for the middleware.
 */

app.get('/admin/auth/status', handleAdminAuthStatus);
app.post('/admin/auth/bootstrap', handleAdminBootstrap);
app.get('/admin/auth/me', requireAdminAuth, handleAdminMe);
app.get('/admin/auth/admins', requireRoot, handleAdminList);
app.post('/admin/auth/admins', requireRoot, handleAdminCreate);
app.patch('/admin/auth/admins/:id', requireRoot, handleAdminUpdate);
app.delete('/admin/auth/admins/:id', requireRoot, handleAdminDelete);

/**
 * AGGREGATED ADMIN METRICS BROADCAST
 * ---------------------------------
 * Collects live statistics from profiles and cache, then pushes to all clients.
 * Used by Admin Portal for real-time dashboard updates.
 */
async function emitAdminStats() {
  try {
    const stats = profiles.getGlobalStats();
    
    // Fetch real treasury balance from the blockchain
    let realTreasuryBal = "0.00";
    if (config.TREASURY_ADDRESS && config.TREASURY_ADDRESS !== ethers.ZeroAddress) {
      try {
        realTreasuryBal = await rpc.getBalance(config.TREASURY_ADDRESS);
      } catch (e) {
        console.warn("[Admin-Stats] Failed to fetch real treasury balance:", e.message);
      }
    }

    // Calculate Platform Revenue (Accumulated Fees)
    // For now, we derive it from volume (e.g. 1% platform cut).
    const platformRevenue = stats.platformRevenue || (parseFloat(stats.totalVolume) * 0.01).toFixed(6);

    const payload = {
      totalWallets: stats.activeTraders || 0,
      totalVolume: stats.totalVolume || "0.00",
      activeCount: cache.sessions.size || 0,
      activeStakesTotal: Array.from(cache.trades.values())
        .filter(t => t.status === 'PENDING')
        .reduce((sum, t) => sum + t.amount, 0).toFixed(2),
      treasuryBalance: realTreasuryBal,
      pendingDisputes: 0,
      platformRevenue: platformRevenue,
      userCountries: stats.userCountries || {},
      totalTrades: stats.totalTrades || 0,
      bullBearRatio: stats.bullBearRatio != null ? stats.bullBearRatio : 50,
      timestamp: Date.now()
    };

    io.emit('admin_stats_update', payload);
    // Also emit as 'dashboard_stats' for backward compatibility with existing frontend
    io.emit('dashboard_stats', payload);
  } catch (err) {
    console.error("[Admin-Stats] Broadcast Error:", err);
  }
}

// Attach emitter to engine for trade-triggered updates
classicEngine.onUpdate = emitAdminStats;

let activeBroadcast = null;

classicEngine.start();
emitAdminStats(); // Initial broadcast
setInterval(emitAdminStats, 10000); // Periodic 10s sync

/**
 * Put trades that were open when the process died back into cache.trades.
 *
 * cache.trades only lives in memory, so without this a restart silently strands
 * every in-flight trade: the 50ms monitor never sees it, the 3s recovery sweep
 * never sees it, and the client keeps polling a PENDING row that nothing will
 * ever resolve. Trades are persisted to the trades table the moment they are
 * placed, so they can be reloaded and settled normally.
 */
async function recoverUnsettledTrades() {
  let rows = [];
  try {
    rows = await profiles.getUnsettledTradesAsync();
  } catch (e) {
    console.warn('[Recovery] Unsettled trade scan failed:', e.message);
    return;
  }
  if (!rows.length) return;

  let restored = 0;
  let skipped = 0;
  for (const row of rows) {
    const id = String(row.id || row.betId || '');
    if (!id || cache.trades.has(id)) continue;
    // The trades table also carries ledger rows (deposits and the like). They
    // have no symbol or entry price, so feeding one to the settlement engine
    // would price it against nothing and corrupt the balance. Only real bets
    // are eligible for recovery.
    if (!row.symbol || row.entryPrice == null || String(id).startsWith('DEPOSIT-')) { skipped++; continue; }
    const trade = {
      ...row,
      id,
      betId: id,
      userAddr: String(row.userAddr || '').toLowerCase(),
      status: 'PENDING',
      createdAt: Number(row.createdAt || row.timestamp || Date.now()),
      settleAt: Number(row.settleAt || 0)
        || Number(row.timestamp || row.createdAt || Date.now()) + (Number(row.duration || 15) * 1000),
      settleRetries: 0,
    };
    if (!trade.userAddr) { skipped++; continue; }
    // Adopt a locked verdict that survived in Redis (1h TTL). Re-deciding
    // from stale snapshots can flip the result, and for wins re-running
    // settlement would re-credit an already-paid payout. A WON restore is
    // parked as WON â€” every settle path refuses non-PENDING objects, so
    // money can never move twice; its record still syncs once below.
    try {
      const locked = await cache.getCachedTradeResult(id);
      if (locked && typeof locked.won === 'boolean') {
        trade.lockedExitPrice = locked.exitPrice;
        trade.lockedWon = locked.won;
        trade.exitPrice = locked.exitPrice;
        trade.won = locked.won;
        trade.settledAt = locked.settledAt || Date.now();
        if (locked.won) {
          trade.status = 'WON';
          const sp = Math.max(0.03, Math.min(0.97, Number(trade.sharePrice) || 0.50));
          if (trade.amount && sp) {
            const mult = (typeof classicEngine?.multiplierFor === 'function')
              ? classicEngine.multiplierFor(trade.duration) : 2;
            trade.payout = Math.max(0.000001, Math.min(
              (Number(trade.amount) / sp) * 0.99,
              Number(trade.amount) * mult * 0.99
            ));
          }
          console.log(`[Recovery] #${id} adopted cached WON (no re-credit) â€” syncing record.`);
          cache.pushHistory(trade.userAddr, { ...trade }).catch(() => {});
        }
      }
    } catch {}
    cache.trades.set(id, trade);
    restored++;
  }
  if (restored > 0) {
    console.log(`[Recovery] Restored ${restored} unsettled trade(s) into the settlement engine.`);
    emitAdminStats();
  }
  if (skipped > 0) {
    console.log(`[Recovery] Ignored ${skipped} non-trade row(s) (deposits/ledger entries).`);
  }
}

recoverUnsettledTrades();
setInterval(recoverUnsettledTrades, 60000); // Safety net for late writes

// Keep the durable open-trade registry from growing without bound. The settle
// paths remove their own entries inline; this is the backstop for the case where
// that removal was lost (process died between settling and the HDEL), which would
// otherwise leave a settled bet in the recovery set forever.
const TERMINAL_TRADE_STATUSES = ['WON', 'LOST', 'PAID', 'CANCELLED', 'PAYOUT_FAILED', 'DISPUTE'];
setInterval(async () => {
    const pruned = await cache.pruneOpenTrades(
        (t) => TERMINAL_TRADE_STATUSES.includes(String(t.status || '').toUpperCase())
    );
    if (pruned) console.log(`[Recovery] Pruned ${pruned} settled trade(s) from the open-trade registry.`);
}, 300000);

// Initialize Odds Engine
const oddsEngine = new OddsEngine(io);
oddsEngine.start();

// --- DEDICATED PRICE FEED SERVICES ---
// Separate modules for odds engine and settlement. Both write to shared cache.
// MEXC primary, Kraken secondary, Binance tertiary (Pyth removed â€” returns 401).
priceService.start(io);
settlementPriceService.startSettlement(io);

// --- Socket.IO ---
io.on('connection', (socket) => {
  console.log(`[Socket] New connection: ${socket.id} (total: ${io.engine?.clientsCount || '?'})`);
  Object.keys(cache.prices).forEach(key => {
    if (cache.prices[key] > 0) {
      socket.emit('price', { key, price: cache.prices[key], ts: cache.priceMeta[key]?.updatedAt || Date.now() });
    }
  });
  socket.on('join_user', (address) => {
    const room = String(address || '').toLowerCase();
    if (room) socket.join(room);
  });

  // Admin Event: Global Broadcast
  socket.on('send_broadcast', (msg) => {
    const broadcast = {
      id: Date.now(),
      message: msg.text || msg.message,
      type: msg.type || 'ANNOUNCEMENT',
      expiry: msg.expiry || (Date.now() + (msg.duration * 1000)),
      timestamp: Date.now(),
      sender: msg.sender || 'SYSTEM'
    };

    activeBroadcast = broadcast;
    io.emit('broadcast', broadcast);
    console.log(`[Socket-Admin] Broadcast Sent: ${broadcast.message}`);

    // Maintenance logic
    if (broadcast.type === 'MAINTENANCE') {
      io.emit('settings_update', { maintenanceMode: true, systemBanner: broadcast.message });
    }
  });

  // Push latest stats on connection
  const stats = profiles.getGlobalStats();
  socket.emit('dashboard_stats', {
    ...stats,
    activeCount: cache.sessions.size,
    activeStakesTotal: Array.from(cache.trades.values())
      .filter(t => t.status === 'PENDING')
      .reduce((sum, t) => sum + t.amount, 0),
    totalWallets: Object.keys(profiles.profiles).length
  });

  // Push latest odds on connection
  if (oddsEngine.currentOdds) {
    socket.emit('live_odds', oddsEngine.currentOdds);
  }
});

// ============================================================
// API Routes
// ============================================================

app.post('/auth/discord', async (req, res) => {
  try {
    const { code, address } = req.body;
    if (!code || !address) return res.status(400).json({ error: 'Missing code or address' });

    const params = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.DISCORD_OAUTH_URL ? new URL(process.env.DISCORD_OAUTH_URL).searchParams.get('redirect_uri') : 'https://15market.online'
    });

    const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return res.status(400).json({ error: tokenData.error_description || tokenData.error });
    }

    const userRes = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });
    const userData = await userRes.json();

    if (!userData.id) {
        return res.status(400).json({ error: 'Failed to fetch Discord profile' });
    }

    const profile = profiles.get(address.toLowerCase()) || { address: address.toLowerCase(), trades: [] };
    profile.discord = {
      id: userData.id,
      username: userData.username
    };
    profiles.upsert(address.toLowerCase(), profile);

    res.json({ success: true, discord: profile.discord });
  } catch (e) {
    console.error('[Discord Auth Error]', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/auth/discord/unlink', (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'Missing address' });
  
  const profile = profiles.get(address.toLowerCase());
  if (profile) {
    delete profile.discord;
    profiles.upsert(address.toLowerCase(), profile);
  }
  res.json({ success: true });
});

app.get('/time', (req, res) => {
  res.json({ timestamp: Date.now() });
});

app.get('/protocol-stats', (req, res) => {
  res.json(profiles.getGlobalStats());
});

// Platform-wide trading settings. In-memory by design: the values are live
// operational switches (broadcast to every client on change), and a restart
// resetting them to safe defaults is the correct behaviour after an incident.
const platformSettings = {
  minBet: config.DEFAULT_MIN_BET || 1.0,
  maxBet: 1000000.0,
  maintenanceMode: false,
  tradingHalted: false,
  systemBanner: "",
  bannerLevel: "info",
  treasuryAddress: config.TREASURY_ADDRESS
};

app.get('/settings', (req, res) => {
  res.json(platformSettings);
});

app.post('/settings', requirePerm('platform.settings'), (req, res) => {
  const body = req.body || {};
  if (body.maintenanceMode !== undefined) platformSettings.maintenanceMode = !!body.maintenanceMode;
  if (body.tradingHalted !== undefined) platformSettings.tradingHalted = !!body.tradingHalted;
  if (body.systemBanner !== undefined) platformSettings.systemBanner = String(body.systemBanner).slice(0, 300);
  if (body.bannerLevel !== undefined) platformSettings.bannerLevel = String(body.bannerLevel).slice(0, 20);
  if (body.minBet !== undefined && Number(body.minBet) > 0) platformSettings.minBet = Number(body.minBet);
  io.emit('settings_update', platformSettings);
  res.json(platformSettings);
});

// Deposit tx hashes already credited, so a retried or replayed
// /session/deposit can never credit the same transfer twice. In-memory by
// design: it guards against client retries and double-submits within a
// process lifetime, which is the realistic double-credit window.
const _creditedDepositTxs = new Set();

// Main wallet balance â€” cached, refreshed periodically (no live RPC per request)
let _mainBalanceCache = {}; // address -> { balance, updatedAt }
const MAIN_BALANCE_CACHE_TTL = 15000; // 15s

app.get('/balance/:address', async (req, res) => {
  try {
    const addr = req.params.address.toLowerCase();
    const cached = _mainBalanceCache[addr];
    const now = Date.now();

    // Return cached value if fresh enough
    if (cached && (now - cached.updatedAt) < MAIN_BALANCE_CACHE_TTL) {
      return res.json({ success: true, balance: cached.balance });
    }

    // Fetch live â€” but only one concurrent request per address
    const bal = await rpc.getBalance(req.params.address);
    _mainBalanceCache[addr] = { balance: bal, updatedAt: now };
    res.json({ success: true, balance: bal });
  } catch (err) {
    // Return stale cache if available, else zero
    const addr = req.params.address.toLowerCase();
    const stale = _mainBalanceCache[addr];
    res.json({ success: true, balance: stale ? stale.balance : '0', source: stale ? 'stale-cache' : 'fallback' });
  }
});

// --- UNIFIED FUNDING ROUTES (Multi-Token Deposits) ---

/**
 * GET /fund/quote
 * Returns the estimated USDC output for a given source token and amount.
 */
app.get('/fund/quote', async (req, res) => {
  try {
    const { fromToken, amount } = req.query;
    if (!fromToken || !amount) return res.status(400).json({ error: "Missing parameters" });
    
    const quote = await fundingService.getQuote(fromToken, parseFloat(amount));
    res.json({ success: true, ...quote });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /fund/confirm
 * Confirms a deposit transaction and credits the user's Trading Wallet.
 */
app.post('/fund/confirm', async (req, res) => {
  try {
    const { address, amount, fromToken, txHash } = req.body;
    if (!address || !amount || !txHash) return res.status(400).json({ error: "Missing deposit details" });

    const userAddr = address.toLowerCase();
    const sessionWallet = deriveSessionWallet(userAddr);

    // Frontend already sent the final estimated amount. We use it directly.
    const finalAmount = parseFloat(amount);
    
    const result = await fundingService.creditTradingWallet(
        userAddr, 
        finalAmount, 
        txHash, 
        sessionWallet.address
    );

    // Update session balance in cache (optimistic sync)
    let session = cache.sessions.get(userAddr);
    if (!session) {
      session = cache.getOrCreateSession(userAddr, { 
        balance: 0,
        identityKey: userAddr,
        walletAddress: userAddr,
        sessionAddress: sessionWallet.address
      });
    }
    
    // We don't double add here because creditTradingWallet already adds it, 
    // BUT we need to ensure socket emission. Actually, let's just emit.
    io.to(userAddr).emit('balance_update', {
      balance: String(session.balance),
      reason: 'DEPOSIT',
      txHash
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /fund/monitor-cctp
 * Starts monitoring a Circle CCTP burn transaction.
 */
app.post('/fund/monitor-cctp', async (req, res) => {
  try {
    const { address, txHash, fromChain, destChain, amount } = req.body;
    if (!txHash || !fromChain) return res.status(400).json({ error: 'Missing CCTP details' });

    console.log(`[CCTP] Burn registered: chain ${fromChain} â†’ ${destChain || 'auto'} | TX: ${txHash}`);

    const userAddr = address.toLowerCase();

    // Trigger CCTP Initiated notification
    notificationService.notifyUser(
        userAddr,
        "CCTP Bridge Initiated",
        `Bridging ${amount} USDC via CCTP from source chain to Arc Testnet. Attestation polling started.`,
        "info"
    );

    // Instantly credit cached session balance and emit real-time socket event for immediate UX feedback
    // (The actual on-chain USDC mint will follow asynchronously via IRIS attestation + receiveMessage)
    const session = cache.sessions.get(userAddr);
    if (session) {
      session.balance = Number((session.balance + parseFloat(amount || 0)).toFixed(4));
      io.to(userAddr).emit('balance_update', {
        balance: String(session.balance),
        reason: 'DEPOSIT',
        txHash
      });
      console.log(`[CCTP-Relayer] Instantly credited ${amount} USDC to ${userAddr} (optimistic)`);
    } else {
      console.warn(`[CCTP-Relayer] No active session for ${userAddr} â€” balance will sync on next poll`);
    }

    // Offload full CCTP relay to background: poll IRIS, call receiveMessage on dest chain, finalize credit
    fundingService.monitorAndSettleCCTP(userAddr, txHash, fromChain, amount, destChain);

    res.json({ success: true, message: 'CCTP relay started. Balance pre-credited.' });
  } catch (err) {
    console.error('[monitor-cctp] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /fund/bridge-quote
 * Returns estimated gas fee in USDC and net amount to receive for a given source chain and amount.
 */
app.get('/fund/bridge-quote', async (req, res) => {
  try {
    const { sourceChain, amount } = req.query;
    if (!sourceChain || !amount) {
      return res.status(400).json({ error: "Missing sourceChain or amount" });
    }
    const quote = await fundingService.getPermitBridgeQuote(sourceChain, parseFloat(amount));
    res.json({ success: true, ...quote });
  } catch (err) {
    console.error('[bridge-quote] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /fund/permit-bridge
 * Executes EIP-2612 permit + bridge flow where the backend Gas Tank pays the gas.
 */
app.post('/fund/permit-bridge', async (req, res) => {
  try {
    const { address, sourceChain, amount, userAddress, permit, destMintRecipient } = req.body;
    if (!address || !sourceChain || !amount || !userAddress || !destMintRecipient) {
      return res.status(400).json({ error: "Missing required permit bridge parameters" });
    }
    const userAddr = address.toLowerCase();

    const result = await fundingService.executePermitBridge(
      userAddr,
      sourceChain,
      parseFloat(amount),
      userAddress,
      permit,
      destMintRecipient,
      io  // Pass socket.io so CCTP completion can push live balance update
    );

    // Optimistic credit: immediately update cache + profile + emit socket balance_update
    // This gives instant UX feedback before CCTP relay finishes (~2 min)
    const creditResult = await fundingService.creditTradingWallet(userAddr, result.netAmount, result.txHash);
    io.to(userAddr).emit('balance_update', {
      balance: String(creditResult.newBalance || result.netAmount),
      reason: 'DEPOSIT',
      txHash: result.txHash
    });
    console.log(`[CCTP-GasTank] Optimistically credited ${result.netAmount} USDC to ${userAddr} (new balance: ${creditResult.newBalance})`);

    res.json({ success: true, ...result });
  } catch (err) {
    console.error('[permit-bridge] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /fund/gas-tank
 * Returns the status and native balances of the Gas Tank relayer wallets across networks.
 */
app.get('/fund/gas-tank', async (req, res) => {
  try {
    const status = {};
    for (const [id, provider] of Object.entries(fundingService.destProviders)) {
      const wallet = fundingService.destWallets[id];
      if (wallet) {
        const bal = await provider.getBalance(wallet.address);
        status[id] = {
          address: wallet.address,
          balance: ethers.formatEther(bal)
        };
      }
    }
    res.json({ success: true, chains: status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});




// â”€â”€â”€ SESSION WALLET ROUTES (Embedded EOA) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * POST /session/init
 * Returns the deterministic embedded (session) wallet address for this user,
 * plus its real on-chain balance. No SCW, no factory, no lockStake.
 */
app.post('/session/init', async (req, res) => {
  try {
    const identity = classicEngine.resolveSessionIdentity(req.body || {});
    if (!identity.ok) return res.status(400).json({ error: identity.error });
    const userAddr = identity.identityKey;

    const sessionWallet = deriveSessionWallet(userAddr);
    const sessionAddress = sessionWallet.address;

    // Read persisted profile balance (authoritative source that survives restarts)
    const profile = profiles.get(userAddr);
    const profileBal = parseFloat(profile?.balance || 0);

    // NOTE: The virtual USDC trading balance is independent of the on-chain ARC
    // gas balance of the session wallet. We MUST NOT use onChainBal to restore the
    // trading balance, otherwise every refresh re-inflates it (the gas-funder sends
    // ARC to the session wallet for gas, unrelated to the trading pot). The trading
    // balance always lives in profile.balance, updated by syncBalance on every trade.

    // Initialize or restore session â€” profile balance is the single source of truth
    let session = cache.sessions.get(userAddr);
    if (session) {
      const timeSinceTrade = Date.now() - (session.lastTradeAt || 0);
      // Never overwrite if a trade was placed recently
      if (timeSinceTrade >= 30000) {
        // Reconcile to the persisted virtual balance. Never re-inflate from on-chain ARC.
        session.balance = profileBal > 0 ? profileBal : (session.balance || 0);
        // Re-sync profile if session drifted (e.g. from win credits) â€” but only keep
        // the persisted value as truth; on-chain ARC is excluded.
        if (session.balance !== profileBal && profileBal > 0) {
          session.balance = profileBal;
        }
      }
    } else {
      // No in-memory session â€” rebuild from the persisted profile balance only
      const restoredBalance = profileBal;
      session = cache.getOrCreateSession(userAddr, {
        identityKey: userAddr,
        walletAddress: identity.walletAddress,
        sessionAddress,
        balance: restoredBalance,
      });
      // Ensure profile is up to date
      if (restoredBalance > 0) {
        profiles.upsert(userAddr, { balance: restoredBalance });
      }
    }

    // Adopt the current on-chain balance as the reconciliation baseline so any
    // USDC sent to the trading address AFTER this point is detected as a
    // deposit. Deliberately credits nothing - this must never inflate balance.
    //
    // Detached on purpose: with several slow RPC providers this read can take
    // longer than the client's fetch timeout, and a blocked /session/init would
    // look like a failed connection. The next balance poll seeds it instead.
    chainReconciler.seedBaseline(userAddr, sessionAddress)
        .catch((seedErr) => console.warn('[session/init] baseline seed skipped:', seedErr.message));

    res.json({
      success: true,
      sessionAddress,
      walletAddress: session.walletAddress,
      balance: String(session.balance || 0),
    });
  } catch (err) {
    console.error('[session/init] error:', err.message);
    res.status(500).json({ error: "Session init failed" });
  }
});

/**
 * GET /session/balance/:address
 * Real on-chain balance of the embedded session wallet EOA.
 */
app.get('/session/balance/:address', async (req, res) => {
  try {
    const userAddr = req.params.address.toLowerCase();
    const sessionWallet = deriveSessionWallet(userAddr);
    
    // Session balance is the authoritative source of truth.
    // It is updated in real-time by placeTrade, creditWinner, creditTradingWallet, etc.
    // Profile is the persistent backup that survives restarts.
    // On-chain balance is NOT used here â€” the virtual trading balance may differ.
    const session = cache.sessions.get(userAddr);
    const profile = profiles.get(userAddr);
    const profileBal = parseFloat(profile?.balance || 0);

    if (session) {
      // Always return the live in-memory session balance â€” no guards, no Math.max
      // Sync to profile periodically so it survives restarts
      if (session.balance !== profileBal) {
        profiles.upsert(userAddr, { balance: session.balance });
      }
    } else {
      // No in-memory session â€” a cold instance. Rebuild from the shared Redis
      // snapshot first, then the persisted profile.
      //
      // This is what lets the client drop its localStorage balance cache: there
      // is ONE server-side value, so every device is served the same number.
      // A device-local cache cannot do that, and a stale per-device value is
      // exactly what made the mobile balance look stuck while desktop looked
      // fine. Redis also means a freshly deployed instance answers immediately
      // instead of waiting on a chain read.
      const snapshot = await cache.loadSessionSnapshot(userAddr);
      const restoredBalance = snapshot != null ? snapshot : profileBal;
      if (snapshot != null) {
        console.log(`[Balance] ${userAddr.slice(0, 10)}... served from the Redis snapshot: ${snapshot}`);
      }
      cache.getOrCreateSession(userAddr, {
        identityKey: userAddr,
        walletAddress: userAddr,
        sessionAddress: sessionWallet.address,
        balance: restoredBalance
      });
    }

    // â”€â”€ On-chain reconciliation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // USDC sent directly to the trading wallet address (bypassing the app's
    // deposit flow) would otherwise sit on-chain forever without ever being
    // credited. This detects that inflow and credits it, after absorbing the
    // platform's own gas top-ups.
    //
    // Detached on purpose. The RPC read fans out across providers and can
    // outlast the frontend's 6s fetch timeout, which would make the whole
    // balance response get discarded â€” the exact "my balance never loads"
    // symptom this was meant to fix. The ledger is returned immediately and
    // the credit arrives via the balance_update socket push, or the next poll.
    chainReconciler.reconcileSessionBalance(userAddr, sessionWallet.address)
        .catch((reconErr) => console.warn('[session/balance] reconcile skipped:', reconErr.message));

    // â”€â”€ On-chain is the source of truth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // The chain holds the money that can actually be staked, and it moves on
    // its own when a stake is sent to the treasury or a win settles back in.
    // We read it so the number the user sees is the real one after every
    // transaction, with the platform's gas float subtracted by the reconciler.
    //
    // Detached, for the same reason the reconcile above is. This read fans out
    // across up to four RPC providers, and tryGetBalance tries them SEQUENTIALLY
    // with a 5s budget each - so a single slow provider costs 5s and two cost
    // 10s. Awaiting it inline made the whole response outlast the client's 8s
    // abort, so the response was discarded and the balance never updated. That
    // is the "balance sits at 0 / says syncing forever" symptom, and it hit
    // phones hardest because they have the least time budget to spare.
    //
    // The ledger is already reconciled by the call above, so answering from it
    // immediately is correct. When the chain disagrees, the corrected number is
    // pushed over the socket and picked up by the next poll anyway.
    const answeredSession = cache.sessions.get(userAddr);
    const ledgerBalance = answeredSession ? answeredSession.balance : profileBal;

    chainReconciler.getOnChainSpendable(userAddr, sessionWallet.address)
        .then((onChain) => {
            if (!onChain) return; // RPC down: keep the last known good value
            const session = cache.sessions.get(userAddr);
            if (!session) return;
            // Now that the read is off the response path it can land long after
            // the number it raced with. A trade, a win credit or the reconcile
            // above may have moved the ledger in the meantime, and overwriting
            // that with a value read before it would silently undo real money.
            // Only apply the correction if the ledger is still exactly what we
            // answered with, i.e. nothing else touched it while we were reading.
            if (session.balance !== ledgerBalance) return;
            if (session.balance === onChain.spendable) return;
            session.balance = onChain.spendable;
            if (profiles.get(userAddr)?.balance !== onChain.spendable) {
                profiles.upsert(userAddr, { balance: onChain.spendable });
            }
            io.to(userAddr).emit('balance_update', {
                balance: String(onChain.spendable),
                reason: 'CHAIN_SYNC'
            });
        })
        .catch((chainErr) => console.warn('[session/balance] on-chain read skipped:', chainErr.message));

    res.json({ 
      success: true, 
      balance: String(ledgerBalance), 
      sessionAddress: sessionWallet.address, 
      source: 'session-cache'
    });
  } catch (err) {
    console.error('[session/balance] error:', err.message);
    // If RPC fails or times out, return the cached profile/in-memory balance as fallback
    const userAddr = req.params.address.toLowerCase();
    const session = cache.sessions.get(userAddr);
    const profile = profiles.get(userAddr);
    
    let fallbackBal = 0;
    if (session) fallbackBal = session.balance;
    else if (profile) fallbackBal = profile.balance;
    
    res.json({ success: true, balance: String(fallbackBal || 0), source: 'in-process-fallback' });
  }
});

/**
 * GET /session/address/:address
 * Returns the embedded session wallet address for the given user.
 */
app.get('/session/address/:address', (req, res) => {
  try {
    const userAddr = req.params.address.toLowerCase();
    const sessionWallet = deriveSessionWallet(userAddr);
    res.json({ success: true, sessionAddress: sessionWallet.address });
  } catch (err) {
    res.status(500).json({ error: "Failed to derive session address" });
  }
});

// --- SOLANA PERMANENT WALLET ENDPOINTS ---
app.post('/solana/stash-key', (req, res) => {
  const { address, privKey, pubKey } = req.body;
  if (!address || !privKey || !pubKey) return res.status(400).json({ error: "Missing data" });
  
  profiles.upsert(address.toLowerCase(), {
    solanaWallet: { pubKey, privKey }
  });
  res.json({ success: true });
});

app.get('/solana/retrieve-key/:address', (req, res) => {
  const addr = req.params.address.toLowerCase();
  const profile = profiles.get(addr);
  const privKey = profile?.solanaWallet?.privKey;
  if (!privKey) return res.status(404).json({ error: "Key not found" });
  res.json({ success: true, privKey });
});

app.get('/solana/address/:address', (req, res) => {
  const addr = req.params.address.toLowerCase();
  const profile = profiles.get(addr);
  res.json({ 
    success: true, 
    address: profile?.solanaWallet?.pubKey || null 
  });
});

app.post('/solana/clear', (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: "Missing address" });
  
  const addr = address.toLowerCase();
  const profile = profiles.get(addr);
  if (profile && profile.solanaWallet) {
    delete profile.solanaWallet;
    profiles.upsert(addr, {});
    console.log(`[Solana] Permanent Solana wallet cleared for ${addr}`);
  }
  res.json({ success: true });
});

app.get('/solana/config', (req, res) => {
  res.json({ relayerAddress: derivedSolanaRelayerAddress });
});

/**
 * POST /solana/fund
 *
 * Receives a serialized signed Solana transaction from the frontend,
 * broadcasts it on Devnet, verifies the USDC transfer, and credits
 * the user's Arc trading wallet balance.
 *
 * Body: { address, signedTx (base64), amount, fromAddress }
 */
app.post('/solana/fund', async (req, res) => {
  const { address, signedTxBase64, amount, fromAddress } = req.body;
  if (!address || !amount) return res.status(400).json({ error: 'Missing required fields' });

  try {
    const userAddr = address.toLowerCase();
    const amtNum = parseFloat(amount);
    if (isNaN(amtNum) || amtNum <= 0) return res.status(400).json({ error: 'Invalid amount' });

    let txSignature = null;

    if (signedTxBase64) {
      // Pre-signed transaction from user (e.g. Phantom/Solflare linked wallets)
      const { Connection, Transaction, Keypair } = require('@solana/web3.js');
      const connection = new Connection(config.SOL_DEVNET_RPC, 'confirmed');

      try {
        const txBytes = Buffer.from(signedTxBase64, 'base64');
        const tx = Transaction.from(txBytes);

        // Sign the transaction with the relayer's gas tank key to pay for fees
        if (config.SOL_GAS_TANK_KEY) {
          const bs58 = require('bs58');
          const dec = bs58.default ? bs58.default.decode : bs58.decode;
          const relayerKeypair = Keypair.fromSecretKey(dec(config.SOL_GAS_TANK_KEY));
          tx.partialSign(relayerKeypair);
        }

        txSignature = await connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed'
        });
        await connection.confirmTransaction(txSignature, 'confirmed');
        console.log(`[Solana/Fund] Pre-signed Tx confirmed: ${txSignature}`);
      } catch (broadcastErr) {
        console.error('[Solana/Fund] Pre-signed broadcast error:', broadcastErr.message);
        let logsMsg = '';
        if (broadcastErr.logs) {
          logsMsg = ' | Logs: ' + JSON.stringify(broadcastErr.logs);
        } else if (typeof broadcastErr.getLogs === 'function') {
          try {
            const logs = await broadcastErr.getLogs();
            logsMsg = ' | Logs: ' + JSON.stringify(logs);
          } catch (logErr) {
            console.error('Failed to get transaction logs:', logErr);
          }
        }
        return res.status(500).json({ error: 'Transaction broadcast failed: ' + broadcastErr.message + logsMsg });
      }
    } else {
      // Backend signs transaction using stashed key from Redis
      console.log(`[Solana/Fund] Initiating backend-signed transaction for user: ${userAddr}`);
      const { Connection, Transaction, Keypair, PublicKey, TransactionInstruction } = require('@solana/web3.js');
      
      const profile = profiles.get(userAddr);
      const userSolWallet = profile?.solanaWallet;
      if (!userSolWallet || !userSolWallet.privKey || !userSolWallet.pubKey) {
        return res.status(404).json({ error: 'No stashed Solana wallet found for this user. Please generate one.' });
      }

      if (!config.SOL_GAS_TANK_KEY) {
        return res.status(500).json({ error: 'Relayer gas tank key is not configured.' });
      }

      const bs58 = require('bs58');
      const dec = bs58.default ? bs58.default.decode : bs58.decode;

      const userKeypair = Keypair.fromSecretKey(dec(userSolWallet.privKey));
      const fromPubkey = userKeypair.publicKey;
      const relayerKeypair = Keypair.fromSecretKey(dec(config.SOL_GAS_TANK_KEY));
      const relayerPubkey = relayerKeypair.publicKey;

      const connection = new Connection(config.SOL_DEVNET_RPC, 'confirmed');
      const usdcMint = new PublicKey(config.SOL_DEVNET_USDC_MINT || '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU');

      // Find Associated Token Accounts (ATA)
      const getATA = (owner) => {
        return PublicKey.findProgramAddressSync(
          [
            owner.toBuffer(),
            new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA').toBuffer(),
            usdcMint.toBuffer()
          ],
          new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
        )[0];
      };

      const fromAta = getATA(fromPubkey);
      const toAta = getATA(relayerPubkey);

      // Verify user USDC balance
      const tokenInfo = await connection.getTokenAccountBalance(fromAta).catch(() => null);
      const userBal = tokenInfo ? parseFloat(tokenInfo.value.uiAmount) : 0;
      if (userBal < amtNum) {
        return res.status(400).json({ error: `Insufficient USDC. Wallet has ${userBal.toFixed(2)} USDC on Solana Devnet.` });
      }

      const { blockhash } = await connection.getLatestBlockhash();

      // Build Transaction
      const tx = new Transaction({
        recentBlockhash: blockhash,
        feePayer: relayerPubkey
      });

      // Check if relayer ATA exists, if not prepend create instruction
      const toAtaInfo = await connection.getAccountInfo(toAta);
      if (!toAtaInfo) {
        const { createAssociatedTokenAccountInstruction } = require('@solana/spl-token');
        tx.add(createAssociatedTokenAccountInstruction(
          relayerPubkey, // payer
          toAta, // ata
          relayerPubkey, // owner
          usdcMint // mint
        ));
      }

      // Transfer instruction data layout: [3, ...amount as 8-byte uint64]
      const txData = Buffer.alloc(9);
      txData.writeUInt8(3, 0);
      txData.writeBigUInt64LE(BigInt(Math.round(amtNum * 1_000_000)), 1);

      tx.add(new TransactionInstruction({
        keys: [
          { pubkey: fromAta, isSigner: false, isWritable: true },
          { pubkey: toAta, isSigner: false, isWritable: true },
          { pubkey: fromPubkey, isSigner: true, isWritable: false }
        ],
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
        data: txData
      }));

      // Sign with both user deposit key and relayer fee-payer key
      tx.sign(userKeypair, relayerKeypair);

      try {
        txSignature = await connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed'
        });
        await connection.confirmTransaction(txSignature, 'confirmed');
        console.log(`[Solana/Fund] Backend-signed Tx confirmed: ${txSignature}`);
      } catch (broadcastErr) {
        console.error('[Solana/Fund] Backend broadcast error:', broadcastErr.message);
        let logsMsg = '';
        if (broadcastErr.logs) {
          logsMsg = ' | Logs: ' + JSON.stringify(broadcastErr.logs);
        } else if (typeof broadcastErr.getLogs === 'function') {
          try {
            const logs = await broadcastErr.getLogs();
            logsMsg = ' | Logs: ' + JSON.stringify(logs);
          } catch (logErr) {
            console.error('Failed to get transaction logs:', logErr);
          }
        }
        return res.status(500).json({ error: 'Transaction broadcast failed: ' + broadcastErr.message + logsMsg });
      }
    }

    // Credit the user's Arc trading balance
    const session = cache.sessions.get(userAddr);
    if (session) {
      session.balance = (session.balance || 0) + amtNum;
      cache.sessions.set(userAddr, session);
    }
    profiles.upsert(userAddr, { balance: (profiles.get(userAddr)?.balance || 0) + amtNum });

    // TRANSFER REAL TEST USDC ON ARC TESTNET
    try {
      const destRelayerWallet = fundingService.destWallets['5042002']; // Arc Testnet Relayer
      if (destRelayerWallet) {
        const sessionWallet = deriveSessionWallet(userAddr);
        const usdcAbi = ['function transfer(address to, uint256 value) external returns (bool)'];
        // Arc Testnet USDC is 0x3600000000000000000000000000000000000000
        const arcUsdc = new ethers.Contract('0x3600000000000000000000000000000000000000', usdcAbi, destRelayerWallet);
        const amountWei = ethers.parseUnits(amtNum.toString(), 18); // Arc USDC has 18 decimals
        console.log(`[Solana/Fund] Transferring ${amtNum} real USDC on Arc Testnet to ${sessionWallet.address}...`);
        
        // Execute transfer without waiting for confirmation to keep API fast
        arcUsdc.transfer(sessionWallet.address, amountWei).then(tx => {
            console.log(`[Solana/Fund] Real USDC transferred on Arc Testnet! TX: ${tx.hash}`);
        }).catch(err => {
            console.error(`[Solana/Fund] Background Arc transfer failed:`, err.message);
        });
      }
    } catch (arcErr) {
      console.error('[Solana/Fund] Failed to initiate real USDC transfer on Arc:', arcErr.message);
    }

    console.log(`[Solana/Fund] Credited ${amtNum} USDC to ${userAddr} | tx: ${txSignature}`);
    res.json({
      success: true,
      txSignature,
      netAmount: amtNum,
      newBalance: session?.balance || amtNum
    });
  } catch (err) {
    console.error('[Solana/Fund] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /session/execute
 * 
 * SIMPLIFIED TREASURY-FIRST TRADE MODEL:
 * 1. Frontend has ALREADY sent the stake from the main wallet to the treasury.
 * 2. We receive the txHash of that transfer.
 * 3. We validate the tx, register the trade, start the countdown.
 * 4. Settlement happens automatically when the timer expires.
 * 
 * If no txHash is provided (pure simulation mode / testnet with no funds),
 * we accept the trade as a balance-deduction trade using the in-process session.
 */
app.post('/session/execute', async (req, res) => {
  const { address, tradeParams, txHash: stakeTxHash } = req.body;
  if (!address || !tradeParams) return res.status(400).json({ error: 'Missing params' });

  try {
    // Use the classic engine which handles in-process balance + settlement queue
    const result = await classicEngine.placeTrade(tradeParams, { address });
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Attach the stake tx hash if provided (for audit trail)
    if (stakeTxHash && result.tradeId) {
      const trade = cache.trades.get(String(tradeParams.id || result.tradeId));
      if (trade) trade.stakeTxHash = stakeTxHash;
    }

    // SYNCHRONOUS COPY TRADE EXECUTION â€” same request, same block as provider trade
    // Executes immediately so investor activity is event-driven with zero latency
    const copyTradeResults = [];
    // A duplicate is a replay of a bet id that is already live. It produced no
    // new on-chain stake, so every downstream side effect must be skipped or the
    // replay debits every copier a second time for a bet that never happened.
    if (result.duplicate) {
      console.warn(`[Execute] Bet #${result.tradeId} is a replay; skipping copy-trade fan-out.`);
      return res.json({
        tradeId: result.tradeId,
        txHash: result.txHash || null,
        duplicate: true,
        status: result.status || 'PENDING'
      });
    }
    if (result.success && result.tradeId) {
      const providerAddr = address.toLowerCase();
      const providerProfile = profiles.get(providerAddr);
      if (providerProfile?.isProvider) {
        const providerTradeId = String(result.tradeId);
        const tParams = req.body.tradeParams;
        let investorsNotified = 0;
        for (const addr in profiles.profiles) {
          const investor = profiles.get(addr);
          if (!investor?.activeCopies || !investor?.copyTradingWallet) continue;
          const copyRel = investor.activeCopies.find(c => c.providerAddress === providerAddr);
          if (!copyRel) continue;
          const stake = parseFloat(copyRel.stakePerTrade) || 0;
          if (stake <= 0) continue;
          const bal = parseFloat(investor.copyTradingWallet.balance) || 0;
          if (bal < stake) continue;
          // Deduct from investor's copy wallet immediately
          investor.copyTradingWallet.balance = bal - stake;
          const copyTrade = profiles.pushCopyTrade(addr, {
            id: `copy-${providerTradeId}-${addr.substring(0, 8)}`,
            providerAddress: providerAddr,
            providerName: providerProfile.providerApplication?.contactInfo?.name || providerProfile.username || '',
            asset: tParams?.symbol || 'BTC',
            direction: tParams?.direction || 'UP',
            result: 'PENDING',
            amount: stake,
            providerTradeId: providerTradeId,
            timestamp: Date.now()
          });
          profiles.upsert(addr, investor);
          // Emit socket event so investor UI updates instantly
          io.to(addr).emit('copy_trade_update', {
            trade: {
              providerAddress: providerAddr,
              providerName: copyTrade.providerName,
              asset: copyTrade.asset,
              direction: copyTrade.direction,
              result: 'PENDING',
              amount: copyTrade.amount,
              timestamp: copyTrade.timestamp
            }
          });
          notificationService.notifyUser(addr, "Copy Trade Executed", `Copied ${copyTrade.providerName}'s trade: ${copyTrade.asset} ${copyTrade.direction === 'UP' ? 'LONG' : 'SHORT'} ($${stake} USDC)`, "info");
          investorsNotified++;
          copyTradeResults.push({ addr, stake, asset: copyTrade.asset });
        }
        if (investorsNotified > 0) {
          notificationService.notifyUser(providerAddr, "Trades Copied", `${investorsNotified} investor(s) copied your ${tParams?.symbol || 'BTC'} trade.`, "info");
        }
      }
    }

    res.json({
      ...result,
      newBalance: String(cache.sessions.get(address.toLowerCase())?.balance || 0),
      copyTrades: copyTradeResults.length > 0 ? copyTradeResults : undefined
    });

    // Notify all connected admins of the new trade in real-time
    const newTrade = cache.trades.get(String(result.tradeId));
    if (newTrade) {
      io.emit('global_trade_executed', {
        ...newTrade,
        userAddr: address,
        id: newTrade.id,
        betId: newTrade.id,
        status: 'PENDING'
      });
    }
  } catch (err) {
    console.error('[session/execute] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * SECURE WITHDRAWAL (CASHOUT) PIPELINE
 * -----------------------------------
 * Deducts platform fees and sweeps user winnings back to their main wallet.
 * 
 * LOGIC:
 * 1. Calculate 1% Platform Fee.
 * 2. Deduct Fee + Gas Costs (1.3x multiplier for reliability).
 * 3. Route Fee to Treasury Address.
 * 4. Route Remaining Balance to User's Main Wallet.
 * 
 * CRITICAL: This endpoint uses strict nonce management to prevent "Replacement fee too low" 
 * errors during concurrent transfers.
 */
app.post('/session/cashout', async (req, res) => {
  const { address, amount, destination } = req.body;
  if (!address) return res.status(400).json({ error: "Missing address" });
  
  try {
    const userAddr = address.toLowerCase();
    const sessionWallet = deriveSessionWallet(userAddr);
    const targetAddr = destination ? ethers.getAddress(destination) : ethers.getAddress(address);

    // --- SECURITY VERIFICATION ---
    const { signature, message } = req.body;
    if (signature && message) {
      try {
        const recoveredAddr = ethers.verifyMessage(message, signature);
        if (recoveredAddr.toLowerCase() !== userAddr) {
          return res.status(401).json({ error: "Invalid signature: Address mismatch" });
        }
      } catch (sigErr) {
        return res.status(401).json({ error: "Signature verification failed" });
      }
    } else if (destination && destination.toLowerCase() !== address.toLowerCase()) {
      // For external transfers, we REQUIRE a signature for safety
      if (destination.toLowerCase() !== config.FEE_COLLECTOR.toLowerCase()) {
        return res.status(401).json({ error: "Signature required for external transfers" });
      }
    }
    // Note: Internal withdrawals (to main wallet) could potentially be less strict if needed,
    // but we've implemented signatures in the frontend now.

    // CRITICAL: Use a direct JsonRpcProvider (not FallbackProvider) for nonce and balance queries.
    const directProvider = rpc.providers[0];
    if (!directProvider) throw new Error("No RPC provider available");

    const balWei = await directProvider.getBalance(sessionWallet.address, 'pending');
    if (balWei <= 0n) {
      return res.status(400).json({ error: "No funds in session wallet to withdraw" });
    }

    const gasPrice = ethers.parseUnits("60", "gwei");
    const gasLimit = 21000n;
    const gasCost = gasPrice * gasLimit;

    let sendAmount;
    let feeAmount = 0n;

    if (amount && Number(amount) > 0) {
      const clampedAmount = parseFloat(Number(amount).toFixed(6));
      const requestedWei = ethers.parseUnits(clampedAmount.toString(), 18);

      feeAmount = (requestedWei * 1n) / 100n;
      sendAmount = requestedWei - feeAmount;

      if (requestedWei + (gasCost * 2n) > balWei) {
        return res.status(400).json({ error: `Insufficient balance. Need ${ethers.formatEther(requestedWei + gasCost * 2n)} USDC.` });
      }
    } else {
      const totalAvailable = balWei - (gasCost * 2n);
      if (totalAvailable <= 0n) {
        return res.status(400).json({ error: "Balance too low to cover network gas." });
      }
      
      feeAmount = (totalAvailable * 1n) / 100n;
      sendAmount = totalAvailable - feeAmount;
    }

    if (sendAmount <= 0n) {
      return res.status(400).json({ error: "Balance too low to cover gas and platform fees." });
    }

    console.log(`[Withdrawal] Routing: ${ethers.formatEther(sendAmount)} USDC to ${targetAddr} | ${ethers.formatEther(feeAmount)} USDC to Treasury`);

    let currentNonce = await rpc.getNonce(sessionWallet.address);

    if (feeAmount > 0n && config.TREASURY_ADDRESS && config.TREASURY_ADDRESS !== ethers.ZeroAddress) {
      try {
        const feeTx = await rpc.broadcastWithFailover(
          sessionWallet.privateKey,
          {
            to: ethers.getAddress(config.TREASURY_ADDRESS),
            value: feeAmount,
            gasLimit: 21000n,
            gasPrice,
            nonce: currentNonce,
            chainId: rpc.chainId
          }
        );
        currentNonce++;
        console.log(`[Withdrawal] Fee tx sent: ${feeTx.hash}`);
      } catch (feeErr) {
        console.warn("[Withdrawal] Treasury transfer failed:", feeErr.message?.substring(0, 100));
        currentNonce = await rpc.getNonce(sessionWallet.address);
      }
    }

    const tx = await rpc.broadcastWithFailover(
      sessionWallet.privateKey,
      {
        to: targetAddr,
        value: sendAmount,
        gasLimit,
        gasPrice,
        nonce: currentNonce,
        chainId: rpc.chainId
      }
    );

    const session = cache.sessions.get(userAddr);
    if (session) {
      // Deduct the full requested withdrawal amount from the virtual trading balance
      const totalDeduction = parseFloat(ethers.formatEther(sendAmount + feeAmount));
      session.balance = Number(Math.max(0, session.balance - totalDeduction).toFixed(6));
      profiles.upsert(userAddr, { balance: session.balance });
    }

    io.to(userAddr).emit('balance_update', {
      balance: String(session?.balance || '0'),
      reason: 'CASHOUT',
      txHash: tx.hash
    });

    res.json({ success: true, txHash: tx.hash, amount: ethers.formatEther(sendAmount) });
  } catch (err) {
    console.error('[Withdrawal] Critical System Failure:', err);
    res.status(500).json({ error: "Withdrawal error. Error: " + err.message });
  }
});

/**
 * POST /session/deposit
 *
 * Credits a deposit that the client already pushed on-chain to the session
 * (trading) wallet.
 *
 * SECURITY: this endpoint moves value into a spendable trading balance, so the
 * credit is only granted when BOTH hold:
 *   1. a valid signature from `address` over a canonical message, and
 *   2. an on-chain transfer that really paid `amount` to that user's session
 *      wallet, mined successfully.
 * The amount credited is derived from the receipt, never from the request, so
 * a caller cannot inflate it. Previously this endpoint trusted the client's
 * `amount` with no signature and no chain check at all.
 *
 * This is also the recovery path for USDC that reached the trading address
 * before chain reconciliation existed.
 */
app.post('/session/deposit', async (req, res) => {
  const { address, amount, txHash, signature, message } = req.body;
  if (!address || !amount) return res.status(400).json({ error: "Missing data" });

  try {
    const userAddr = address.toLowerCase();
    const requestedAmount = parseFloat(amount);
    if (!isFinite(requestedAmount) || requestedAmount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    // â”€â”€ 1. Signature check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (!signature || !message) {
      return res.status(401).json({ error: "Signature required" });
    }
    let recovered;
    try {
      recovered = ethers.verifyMessage(message, signature);
    } catch (sigErr) {
      return res.status(401).json({ error: "Signature verification failed" });
    }
    if (recovered.toLowerCase() !== userAddr) {
      return res.status(401).json({ error: "Invalid signature: address mismatch" });
    }

    // Bound signature replay. The in-memory tx set below is lost on restart,
    // so without a freshness window a captured (message, signature) pair could
    // be replayed later to re-credit the same transfer.
    const tsMatch = /TIMESTAMP:\s*(\d+)/.exec(String(message));
    if (!tsMatch) {
      return res.status(401).json({ error: "Malformed confirmation message" });
    }
    const signedAt = Number(tsMatch[1]);
    const age = Date.now() - signedAt;
    const MAX_SIG_AGE_MS = 60 * 60 * 1000;   // 1 hour
    const MAX_SIG_SKEW_MS = 5 * 60 * 1000;  // tolerate minor clock drift
    if (!isFinite(signedAt) || age > MAX_SIG_AGE_MS || age < -MAX_SIG_SKEW_MS) {
      return res.status(401).json({ error: "Confirmation expired, please retry the deposit" });
    }

    // â”€â”€ 2. On-chain verification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let creditedAmount = requestedAmount;
    // Declared out here, not inside the `if (txHash)` block: the idempotency
    // check below also needs the session wallet to read the on-chain state.
    const sessionWallet = deriveSessionWallet(userAddr);
    if (txHash) {
      // Short poll: this runs inside an HTTP request. The client retries and
      // the on-chain reconciler is the backstop if it is still pending.
      const receipt = await rpc.waitForReceipt(txHash, 4, 1500);

      if (!receipt) {
        // 503 (not 4xx) on purpose: the transfer was just broadcast and is
        // usually still pending. The client retries on 5xx, and the on-chain
        // reconciler is the backstop if every retry is exhausted.
        return res.status(503).json({ error: "Deposit transaction not confirmed yet" });
      }
      if (receipt.status !== 1) {
        return res.status(400).json({ error: "Deposit transaction reverted" });
      }

      // Native USDC transfer on Arc: recipient is `to`, amount is `value`.
      const recipient = String(receipt.to || '').toLowerCase();
      if (recipient !== sessionWallet.address.toLowerCase()) {
        return res.status(400).json({
          error: `Deposit was not sent to this trading wallet (paid to ${recipient})`
        });
      }

      const onChainAmount = parseFloat(ethers.formatEther(receipt.value || 0));
      if (!isFinite(onChainAmount) || onChainAmount <= 0) {
        return res.status(400).json({ error: "Transaction transferred no value" });
      }
      // Small tolerance so float representation cannot fail an honest claim.
      if (onChainAmount + 1e-9 < requestedAmount) {
        return res.status(400).json({
          error: `On-chain amount ${onChainAmount} is less than the claimed ${requestedAmount}`
        });
      }
      // Credit what the chain says arrived, never what the client asked for.
      creditedAmount = onChainAmount;
    } else {
      // No tx to verify: refuse rather than trust an unverifiable claim.
      return res.status(400).json({ error: "txHash is required to verify a deposit" });
    }

    // â”€â”€ 3. Idempotency: never credit the same transfer twice â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // The reconciler credits aggregate on-chain deltas with no tx hash, so it
    // never writes a claim. If it already absorbed this transfer (a user who
    // sent USDC directly, then called /fund/confirm for the same tx), claiming
    // here would land on a fresh row and credit the funds a second time.
    // Detect that, record the claim so replays stay blocked, and return the
    // already-correct balance instead of adding to it again.
    const absorbed = await chainReconciler.isOnChainStateAbsorbed(userAddr, sessionWallet.address);
    if (absorbed && absorbed.absorbed) {
        await profiles.claimDeposit(txHash, userAddr, creditedAmount, 'reconciled-already');
        let currentBalance = 0;
        try {
            const s = cache.sessions.get(userAddr);
            currentBalance = s ? Number(s.balance || 0) : Number((profiles.get(userAddr) || {}).balance || 0);
        } catch (e) { }
        console.log(`[Deposit] ${txHash} already absorbed by reconciler (on-chain ${absorbed.onChain}, baseline ${absorbed.baseline}) â€” not crediting again`);
        return res.json({ success: true, balance: currentBalance, credited: 0, alreadyReconciled: true });
    }

    // The claim is a durable INSERT on credited_deposits.tx_hash (PRIMARY KEY).
    // It replaces the old in-process Set, which was lost on every restart and
    // so allowed a replay inside the 1h signature window to credit twice.
    // Fails closed: if the table is missing or Supabase is unreachable we
    // refuse the deposit rather than risk crediting it twice.
    // Claim BEFORE crediting. If the process dies between the two, the
    // on-chain reconciler recovers it (the baseline never advanced, so it sees
    // the transfer as new money) and a client retry then gets a 409 that is
    // genuinely true. Claiming after crediting would leave a window in which a
    // crash double-credits instead of double-refusing.
    const claim = await profiles.claimDeposit(txHash, userAddr, creditedAmount, 'fund-confirm');
    if (!claim.claimed) {
        if (claim.reason === 'already-credited') {
            return res.status(409).json({ error: "Deposit already credited" });
        }
        console.error(`[Deposit] refusing credit, idempotency unavailable (${claim.reason}) for tx ${txHash}`);
        return res.status(503).json({
            error: "Deposits are temporarily unavailable. Please retry shortly."
        });
    }

    let session = cache.sessions.get(userAddr);
    const newBalance = Number(((session ? session.balance : 0) + creditedAmount).toFixed(6));

    if (session) {
      session.balance = newBalance;
    } else {
      session = cache.getOrCreateSession(userAddr, {
        identityKey: userAddr,
        walletAddress: userAddr,
        sessionAddress: sessionWallet.address,
        balance: newBalance
      });
    }
    profiles.upsert(userAddr, { balance: session.balance });
    // Keep the in-process set as a cheap fast path only. The authoritative
    // idempotency check is the credited_deposits insert above.
    _creditedDepositTxs.add(txHash.toLowerCase());

    // The reconciler watches the same on-chain balance. Advance the baseline by
    // exactly what we just credited so it does not credit this transfer again.
    // This MUST NOT fail silently: if the baseline does not move, the
    // reconciler independently credits the same transfer a second time.
    try {
        chainReconciler.advanceBaselineForCreditedDeposit(userAddr, creditedAmount);
    } catch (reconErr) {
        console.error('[Deposit] CRITICAL: baseline advance failed, reconciler may double-credit this deposit:', reconErr.message);
    }

    console.log(`[Deposit] Verified credit: ${creditedAmount} USDC to ${userAddr} | TX: ${txHash}`);

    // Id derived from the tx hash, NOT from Date.now(). A replayed transfer
    // then collides on the same id in both the in-memory `exists` check and the
    // trades table primary key, instead of inserting a second row.
    cache.pushHistory(userAddr, {
        id: `DEPOSIT-${txHash.toLowerCase()}`,
        betId: `DEPOSIT-${txHash.toLowerCase()}`,
        type: 'DEPOSIT',
        amount: creditedAmount,
        timestamp: Date.now(),
        txHash,
        status: 'CONFIRMED',
        source: 'verified-deposit'
    });

    io.to(userAddr).emit('balance_update', {
      balance: String(session.balance),
      reason: 'DEPOSIT_CONFIRMED',
      amount: creditedAmount,
      txHash
    });

    emitAdminStats();
    res.json({ success: true, balance: session.balance, credited: creditedAmount });
  } catch (err) {
    console.error('[Deposit] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/history/:address', async (req, res) => {
  const addr = classicEngine.normalizeAddr(req.params.address);
  try {
    const activeUserTrades = Array.from(cache.trades.values())
      .filter(t => String(t.userAddr).toLowerCase() === addr && ['PENDING', 'RESOLVING'].includes(t.status));
    const historyTrades = await profiles.getHistoryAsync(addr);
    res.json([...activeUserTrades, ...historyTrades]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€â”€ PUBLIC TRADE LOOKUP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Backs the shared-card QR. Scanning https://<site>/verify/<id> lands here and
// renders that trade's win/lose card, so this must work for a logged-out
// visitor who has no wallet and no session.
//
// Read-only and unauthenticated by design: the card is a public social artifact
// and everything returned is already public on-chain (the stake tx is on
// ArcScan). Only card-relevant fields are projected - notably NOT sessionAddress,
// which is the user's derived trading wallet.
app.get('/trade/:id', async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id || id.length > 200) return res.status(400).json({ error: 'Missing trade id' });

  // Live in-memory trades win: they are the only place a just-placed bet exists
  // before the history write lands.
  let trade = null;
  for (const t of cache.trades.values()) {
    if (String(t.id) === id || String(t.betId) === id ||
        String(t.stakeTxHash || '').toLowerCase() === id.toLowerCase()) {
      trade = t;
      break;
    }
  }

  if (!trade) {
    try {
      trade = await profiles.findTradePublic(id);
    } catch (e) {
      console.error(`[Trade] lookup ${id} failed:`, e?.message || e);
      return res.status(500).json({ error: 'Trade lookup failed' });
    }
  }

  if (!trade) return res.status(404).json({ error: 'Trade not found' });

  // The card prints a handle when it can. Best effort - never fail the lookup.
  let username = null;
  try {
    const owner = trade.userAddr || trade.userAddress || trade.user_address;
    if (owner) username = profiles.get(String(owner).toLowerCase())?.username || null;
  } catch { /* display-only */ }

  res.json({
    trade: {
      id: String(trade.id ?? trade.betId ?? id),
      betId: String(trade.betId ?? trade.id ?? id),
      symbol: String(trade.symbol || '').toUpperCase(),
      direction: trade.direction === 1 || String(trade.direction).toUpperCase() === 'UP' ? 'UP' : 'DOWN',
      amount: Number(trade.amount || 0),
      entryPrice: trade.entryPrice ?? null,
      exitPrice: trade.exitPrice ?? trade.lockedExitPrice ?? null,
      duration: trade.duration ?? null,
      status: trade.status || (trade.won ? 'WON' : 'LOST'),
      won: trade.won ?? ['WON', 'PAID'].includes(trade.status),
      payout: Number(trade.payout ?? trade.payoutAmount ?? 0),
      txHash: trade.stakeTxHash || trade.txHash || trade.tx || null,
      timestamp: Number(trade.timestamp || trade.createdAt || trade.settledAt || 0),
      userPublicKey: trade.userAddr || trade.userAddress || trade.user_public_key || null,
      username
    }
  });
});

// â”€â”€â”€ ON-DEMAND SETTLEMENT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Client-triggered authoritative settle. Lets the UI resolve a trade that is
// past its countdown but whose settlement events were missed (e.g. a socket
// reconnect) â€” FAST and ACCURATE, returning the verdict in the HTTP response.
// Idempotent: reuses the already-locked exit price if one was captured, so the
// result can never change after countdown zero. Never fabricates a LOST.
app.post('/trades/:id/settle', async (req, res) => {
  const betId = String(req.params.id || '');
  if (!betId) return res.status(400).json({ error: 'Missing bet id' });
  const addrNorm = req.body?.address ? String(req.body.address).toLowerCase() : null;

  let trade = cache.trades.get(betId) || null;
  if (!trade) {
    for (const t of cache.trades.values()) {
      if (String(t.id) === betId) { trade = t; break; }
    }
  }

  if (!trade) {
    const hist = (addrNorm ? (await profiles.getHistoryAsync(addrNorm) || []) : [])
      .find(h => String(h.id) === betId || String(h.tradeId) === betId || String(h.betId) === betId);
    if (hist) return res.json({ ...hist, fromHistory: true, betId });
    return res.status(404).json({ error: 'Trade not found', betId });
  }

  if (addrNorm && String(trade.userAddr).toLowerCase() !== addrNorm) {
    return res.status(403).json({ error: 'Not your trade', betId });
  }

  // Never force-settle a trade whose countdown is still running.
  const msLeft = (trade.settleAt || 0) - Date.now();
  if (msLeft > 0) {
    return res.json({ betId, status: 'PENDING', timeLeftMs: msLeft });
  }

  try {
    classicEngine.lockResult(trade); // idempotent â€” reuses locked result if any
    res.json({
      betId,
      status: trade.status,
      won: trade.lockedWon,
      entryPrice: trade.entryPrice,
      exitPrice: trade.lockedExitPrice,
      payout: trade.payoutAmount || 0,
      amount: trade.amount,
      symbol: trade.symbol,
      direction: trade.direction,
      settledAt: trade.settledAt
    });
  } catch (err) {
    console.error(`[Settle] POST /trades/${betId}/settle failed:`, err?.message || err);
    res.status(500).json({ error: err.message, betId });
  }
});

// â”€â”€â”€ PRICE PROXY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The browser can NEVER call exchange REST APIs directly (CORS blocks every one
// of them: MEXC, Binance, Kraken â€” none send an Access-Control-Allow-Origin
// header). Any frontend "REST fallback" must come through THIS relay so the
// exchange call happens server-side where CORS doesn't exist.
app.get('/price/:key', async (req, res) => {
  const key = String(req.params.key || '').toLowerCase();
  try {
    const live = await priceService.fetchPriceForAsset(key);
    if (live && live.price > 0) {
      return res.json({ key, price: live.price, source: live.source });
    }
  } catch (err) {
    console.error(`[Price] /price/${key} fetch failed:`, err?.message || err);
  }
  // Fall back to the last cached price so the UI never sees a 0.
  const cached = cache.prices[key];
  if (cached > 0) return res.json({ key, price: cached, source: 'cache' });
  res.status(404).json({ error: 'No price for asset', key });
});

// â”€â”€â”€ ROUNDS ACCESS (WAITLIST) â€” REMOVED: the rounds model was retired; the
// Ladders product is a full-page Coming Soon with no gate codes. â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€â”€ PROFILES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Username availability check for signup validation. Boolean only â€” no
// profile data. Must sit ABOVE /profiles/:address or "username" parses as
// an address.
app.get('/profiles/username/:username', async (req, res) => {
  const name = String(req.params.username || '');
  if (!/^[A-Za-z0-9]{6,20}$/.test(name.trim())) {
    return res.json({ available: false, reason: 'format' });
  }
  const r = await profiles.isUsernameTaken(name, req.query.address);
  res.json({ available: !r.taken, reason: r.reason, degraded: !!r.degraded });
});

app.get('/profiles/:address', async (req, res) => {
  const addr = req.params.address.toLowerCase();
  try {
    const profile = await profiles.getAsync(addr);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const activeUserTrades = Array.from(cache.trades.values())
      .filter(t => String(t.userAddr).toLowerCase() === addr && ['PENDING', 'RESOLVING'].includes(t.status));

    const historyTrades = await profiles.getHistoryAsync(addr);
    const allTrades = [...activeUserTrades, ...historyTrades];
    const onboarded = profile.onboarded === true || !!profile.onboardedAt || !!profile.username;

    res.json({
      ...profile,
      onboarded,
      isInitial: !onboarded,
      stats: profiles.getProfileStats(addr, historyTrades),
      trades: allTrades
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/stats/global', (req, res) => {
  res.json(profiles.getGlobalStats());
});

// â”€â”€â”€ PRICE HISTORY (live chart seed) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Recent backend-authoritative price points for one asset so a live chart can
// render a COMPLETE, correctly-scaled window the instant it mounts, instead of
// building up from an empty buffer (which made the first seconds look like a
// wider timeframe until enough ticks arrived).
//
// Reads cache.priceHistory â€” the same feed the settlement engine uses â€” so what
// the chart draws and what settles can never disagree. Read-only, public.
//
// IMPORTANT: the raw buffer is appended on EVERY trade (tens of points/second).
// Sending it verbatim would both overflow the window (a few seconds of data)
// and draw as noise. So we downsample into even ~50ms buckets, keeping the
// latest tick in each â€” a clean series that spans the whole window.
app.get('/prices/history', (req, res) => {
  const key = String(req.query.key || '').trim().toLowerCase();
  const ms = Math.min(Math.max(parseInt(req.query.ms, 10) || 20000, 1000), 600000);
  const maxPoints = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 20), 4000);
  const hist = key ? cache.priceHistory[key] : null;
  const points = [];
  if (Array.isArray(hist) && hist.length) {
    const since = Date.now() - ms;
    const bucketMs = Math.max(ms / maxPoints, 20);
    let lastBucket = -1;
    // History is appended chronologically, so walk backwards until we pass the
    // window start. Within each time bucket keep only the newest tick.
    for (let i = hist.length - 1; i >= 0; i--) {
      const e = hist[i];
      if (!e || typeof e.time !== 'number') continue;
      if (e.time < since) break;
      if (!(typeof e.price === 'number' && e.price > 0)) continue;
      const b = Math.floor((e.time - since) / bucketMs);
      if (b === lastBucket) continue;
      lastBucket = b;
      points.push({ t: e.time, p: e.price });
      if (points.length >= maxPoints) break;
    }
    points.reverse();
  }
  res.json({ key, ms, points });
});

// â”€â”€â”€ Input validation (security) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Usernames: 6â€“20 chars, letters/numbers ONLY (no special characters). The
// client validates too, but the API is the authority. Uniqueness is enforced
// separately, fail-closed, via profiles.isUsernameTaken.
// Avatars: PNG/JPEG data URLs (â‰¤1MB file) or http(s) URLs; anything else is
// dropped instead of stored.
const USERNAME_RE = /^[A-Za-z0-9]{6,20}$/;
const USERNAME_ERROR = 'Usernames are 6â€“20 letters or numbers â€” no special characters.';
const AVATAR_RE = /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/;
const sanitizeUsernameInput = (u) => {
  if (typeof u !== 'string') return undefined;
  const v = u.trim();
  return v && USERNAME_RE.test(v) ? v : undefined;
};
const sanitizeAvatarInput = (a) => {
  if (typeof a !== 'string') return undefined;
  const v = a.trim();
  if (!v) return undefined;
  if (/^https?:\/\//i.test(v)) return v.slice(0, 1000); // remote URL (X profile etc.)
  if (AVATAR_RE.test(v) && v.length <= 1_400_000) return v; // 1MB file â‰ˆ 1.37MB base64
  return undefined;
};

app.post('/profiles', async (req, res) => {
  const { address, xHandle, avatar, onboardedAt } = req.body;
  const username = sanitizeUsernameInput(req.body.username);
  // Bad explicit input is rejected loudly; absent/blank stays valid.
  if (typeof req.body.username === 'string' && req.body.username.trim() && !username) {
    return res.status(400).json({ error: USERNAME_ERROR, reason: 'format' });
  }
  // Country of residence for gateway matching (ISO alpha-2). Validated and
  // normalised; anything else is ignored rather than stored.
  const country = typeof req.body.country === 'string' && /^[A-Za-z]{2}$/.test(req.body.country.trim())
    ? req.body.country.trim().toUpperCase()
    : undefined;
  if (!address) return res.status(400).json({ error: 'Address required' });

  // Username uniqueness is enforced HERE, at write time. The live availability
  // check is only a hint (fail-open); without this gate a returning/overwriting
  // signup could claim a name another account already holds. Strict mode fails
  // closed, so an unreachable DB returns 503 instead of risking a duplicate.
  if (username) {
    const existingProfile = profiles.get(address.toLowerCase());
    const currentName = typeof existingProfile?.username === 'string' ? existingProfile.username.trim() : '';
    if (username.toLowerCase() !== currentName.toLowerCase()) {
      const taken = await profiles.isUsernameTaken(username, address, { strict: true });
      if (taken.taken) {
        return res.status(taken.reason === 'unavailable' ? 503 : 409).json({
          error: taken.reason === 'unavailable'
            ? 'Could not verify that username right now. Try again.'
            : 'That username is taken. Try another.',
          reason: taken.reason
        });
      }
    }
  }

  const sessionWallet = deriveSessionWallet(address.toLowerCase());
  const onboarded = req.body.onboarded === true || onboardedAt != null || !!username;
  const profileData = {
    walletAddress: sessionWallet.address
  };
  if (username) profileData.username = username;
  if (xHandle !== undefined) profileData.xHandle = typeof xHandle === 'string' ? xHandle.trim().slice(0, 60) : undefined;
  const safeAvatar = sanitizeAvatarInput(avatar);
  if (safeAvatar) profileData.avatar = safeAvatar;
  if (country) profileData.country = country;
  if (typeof req.body.firstName === 'string' && req.body.firstName.trim()) {
    profileData.firstName = req.body.firstName.trim().slice(0, 60);
  }
  if (typeof req.body.lastName === 'string' && req.body.lastName.trim()) {
    profileData.lastName = req.body.lastName.trim().slice(0, 60);
  }
  if (onboarded) {
    profileData.onboarded = true;
    profileData.onboardedAt = onboardedAt || Date.now();
  }
  const profile = profiles.upsert(address, profileData);
  await profiles.syncToSupabase(address.toLowerCase());
  // Referral program: every signup gets a code, and if the wizard carried a
  // referralCode payload we apply it immediately (owner of the code earns on
  // this user's deposits + traded volume). Applied-linked is once-only and
  // failures are non-fatal to signup itself.
  try {
    await profiles.ensureReferralCode(address);
    if (typeof req.body.referralCode === 'string' && req.body.referralCode.trim()) {
      await profiles.applyReferralCode(address, req.body.referralCode.trim());
    }
  } catch (e) {
    console.warn('[Profiles] referral post-processing failed:', e.message);
  }
  emitAdminStats();
  res.json({ success: true, profile, walletAddress: sessionWallet.address });
});

// â”€â”€â”€ Referral program â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// The referrer's code (7 chars) is what gets shared; the link form embeds it
// as ?ref=CODE on the site URL.
app.get('/referral/info/:address', async (req, res) => {
  try {
    const profile = await profiles.getAsync((req.params.address || '').toLowerCase());
    res.json({
      referralCode: profile?.referralCode || await profiles.ensureReferralCode(req.params.address),
      referredBy: profile?.referredBy || null,
      referredAt: profile?.referredAt || null,
      referralEnrolled: profile?.referralEnrolled === true,
      referralEnrolledAt: profile?.referralEnrolledAt || null,
      // Admin controls (010) surfaced to the user's hub: suspension blocks
      // withdrawal requests, override/slashed show the true balance.
      referralSuspended: profile?.referralSuspended === true,
      rateOverride: profile?.referralRateOverride != null ? Number(profile.referralRateOverride) : null,
      slashed: Number(profile?.referralSlashed) || 0
    });
  } catch (e) {
    console.error('[Referral] info failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/referral/apply/:address', async (req, res) => {
  try {
    const result = await profiles.applyReferralCode(req.params.address, req.body?.code);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true, referrer: result.referrer, referrerUsername: result.referrerUsername });
  } catch (e) {
    console.error('[Referral] apply failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/referral/stats/:address', async (req, res) => {
  try {
    res.json(await profiles.getReferralStats(req.params.address));
  } catch (e) {
    console.error('[Referral] stats failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Enroll into the referral program â€” mints the user's referral code. The hub
// requires this explicit step before a code/link/dashboard is shown.
app.post('/referral/enroll/:address', async (req, res) => {
  try {
    const result = await profiles.enrollReferral(req.params.address);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    await profiles.syncToSupabase((req.params.address || '').toLowerCase()).catch(() => {});
    res.json(result);
  } catch (e) {
    console.error('[Referral] enroll failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Manual commission payouts: the program is off-chain and has NO auto
// withdrawal. A request is a pending ledger row an admin processes. The
// request carries the payout route: chain (Arc only for now) and the
// destination wallet address the user wants the funds on.
app.post('/referral/withdraw/:address', async (req, res) => {
  try {
    const result = await profiles.requestRefWithdrawal(
      req.params.address,
      req.body?.amount,
      req.body?.chain,
      req.body?.destination
    );
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (e) {
    console.error('[Referral] withdraw failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/referral/withdrawals/:address', async (req, res) => {
  try {
    res.json(await profiles.getRefWithdrawals(req.params.address));
  } catch (e) {
    console.error('[Referral] withdrawals list failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/admin/referral/withdrawals', requirePerm('ref.withdrawals'), async (req, res) => {
  try {
    res.json(await profiles.getAdminRefWithdrawals());
  } catch (e) {
    console.error('[Referral] admin list failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/admin/referral/withdrawals/:id', requirePerm('ref.withdrawals'), async (req, res) => {
  try {
    const status = req.body?.status;
    const note = typeof req.body?.note === 'string' ? req.body.note : '';
    // Capture the request BEFORE flipping the status so the user can be
    // emailed with the exact amount/destination that was processed.
    const row = await profiles.getRefWithdrawalById(req.params.id);
    const result = await profiles.setRefWithdrawalStatus(req.params.id, status, note);
    if (!result.ok) return res.status(result.status).json({ error: result.error });

    // USER EMAIL NOTICE â€” cancelling a withdrawal request always emails the
    // user that an administrator cancelled it (and why, when a note was
    // attached); approving one emails them the approval. Emails go through
    // Resend with the profile's stored/verified address (skipped silently
    // when none is on file).
    if (row?.user_address) {
      const amount = `$${(Number(row.amount) || 0).toFixed(2)}`;
      const dest = row.destination_address ? ` to ${row.destination_address}` : '';
      if (status === 'rejected') {
        const reason = note ? ` Reason: ${note}` : ' No reason was provided.';
        notificationService.notifyUser(
          row.user_address,
          'Withdrawal Request Cancelled',
          `Your referral commission withdrawal request of ${amount}${dest} was cancelled by an administrator.${reason} The funds remain in your referral commission balance and can be requested again.`,
          'error',
          true
        ).catch(e => console.warn('[Referral] cancel notice failed:', e.message));
      } else if (status === 'paid') {
        notificationService.notifyUser(
          row.user_address,
          'Withdrawal Request Approved',
          `Your referral commission withdrawal request of ${amount}${dest} has been approved. The payout is on its way â€” check your wallet shortly.`,
          'success',
          true
        ).catch(e => console.warn('[Referral] approval notice failed:', e.message));
      }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[Referral] admin status failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// â”€â”€ Referral admin management (migration 010) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Enrolled users with their admin-control state for the management tab.
app.get('/admin/referral/users', requirePerm('ref.manage'), async (req, res) => {
  try {
    res.json(await profiles.getAdminRefUsers(req.query?.q));
  } catch (e) {
    console.error('[Referral] admin users failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Suspend / unsuspend a user from the referral program. Suspended users keep
// accrued commission but cannot request withdrawals.
app.post('/admin/referral/suspend', requirePerm('ref.manage'), async (req, res) => {
  try {
    const address = req.body?.address;
    const result = await profiles.setReferralSuspension(address, req.body?.suspended === true);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    await profiles.syncToSupabase((address || '').toLowerCase()).catch(() => {});
    notificationService.notifyUser(
      (address || '').toLowerCase(),
      result.suspended ? 'Referral Program Suspended' : 'Referral Program Reinstated',
      result.suspended
        ? 'An administrator has suspended your account from the referral program. Withdrawal requests are paused while suspended â€” contact support if you believe this is a mistake.'
        : 'Your account has been reinstated in the referral program. Withdrawal requests are available again.',
      result.suspended ? 'error' : 'success',
      true
    ).catch(e => console.warn('[Referral] suspend notice failed:', e.message));
    res.json(result);
  } catch (e) {
    console.error('[Referral] suspend failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Set / clear a per-user commission rate override (percent, null = default).
app.post('/admin/referral/set-rate', requirePerm('ref.manage'), async (req, res) => {
  try {
    const address = req.body?.address;
    const result = await profiles.setReferralRate(address, req.body?.rate ?? null);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    await profiles.syncToSupabase((address || '').toLowerCase()).catch(() => {});
    res.json(result);
  } catch (e) {
    console.error('[Referral] set-rate failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Slash a user's earned commission (permanent deduction).
app.post('/admin/referral/slash', requirePerm('ref.manage'), async (req, res) => {
  try {
    const address = String(req.body?.address || '').toLowerCase();
    const result = await profiles.slashReferralCommission(address, req.body?.amount);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    await profiles.syncToSupabase(address).catch(() => {});
    notificationService.notifyUser(
      address,
      'Referral Commission Slashed',
      `An administrator has deducted $${(Number(req.body?.amount) || 0).toFixed(2)} from your referral commission balance${req.body?.note ? `. Reason: ${req.body.note}` : '.'}`,
      'error',
      true
    ).catch(e => console.warn('[Referral] slash notice failed:', e.message));
    res.json(result);
  } catch (e) {
    console.error('[Referral] slash failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// NOTE: Native email/password auth was removed. Privy owns authentication
// (email code, Google, Discord, wallet); Supabase is the database, written by
// this backend with the service-role key. Returning users are detected after
// Privy auth by checking whether their profile is already onboarded
// (GET /profiles/:address), not by any password registry.

app.patch('/profiles/:address', async (req, res) => {
  const addr = req.params.address.toLowerCase();

  // If a new tradingWallet is set, trigger notification & email
  if (req.body.tradingWallet) {
    const oldProfile = profiles.get(addr);
    if (!oldProfile || oldProfile.tradingWallet !== req.body.tradingWallet) {
      notificationService.notifyUser(
        addr,
        "Trading Wallet Regenerated",
        `Your EVM Session wallet was regenerated. New session address: ${req.body.tradingWallet}`,
        "warning"
      );
    }
  }

  const updates = { ...req.body };
  // Username format gate: 6â€“20 letters/numbers (no special characters).
  if (typeof updates.username === 'string') {
    if (updates.username.trim() && !USERNAME_RE.test(updates.username.trim())) {
      return res.status(400).json({ error: USERNAME_ERROR, reason: 'format' });
    }
  }
  // Avatar gate: PNG/JPEG data URLs or http(s) URLs only â€” drop anything else
  // so arbitrary payloads can never be persisted as inline profile content.
  if (typeof updates.avatar === 'string' && updates.avatar.trim()) {
    const safe = sanitizeAvatarInput(updates.avatar);
    if (!safe) delete updates.avatar;
    else updates.avatar = safe;
  }
  if (updates.country !== undefined) {
    updates.country = (typeof updates.country === 'string' && /^[A-Za-z]{2}$/.test(updates.country.trim()))
      ? updates.country.trim().toUpperCase()
      : undefined;
    if (updates.country === undefined) delete updates.country;
  }
  if (typeof updates.username === 'string' && updates.username.trim() && updates.onboarded === undefined) {
    updates.username = updates.username.trim();
    updates.onboarded = true;
    updates.onboardedAt = Date.now();
  }
  // Same uniqueness gate as POST /profiles â€” a PATCH can rename an account too.
  if (typeof updates.username === 'string' && updates.username.trim()) {
    const name = updates.username.trim();
    const current = profiles.get(addr);
    const currentName = typeof current?.username === 'string' ? current.username.trim() : '';
    if (name.toLowerCase() !== currentName.toLowerCase()) {
      const taken = await profiles.isUsernameTaken(name, addr, { strict: true });
      if (taken.taken) {
        return res.status(taken.reason === 'unavailable' ? 503 : 409).json({
          error: taken.reason === 'unavailable'
            ? 'Could not verify that username right now. Try again.'
            : 'That username is taken. Try another.',
          reason: taken.reason
        });
      }
      updates.username = name;
    }
  }
  const profile = profiles.upsert(addr, updates);
  await profiles.syncToSupabase(addr);
  res.json({ success: true, profile });
});

// â”€â”€â”€ X (TWITTER) OAUTH INTEGRATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const crypto = require('crypto');
const oauthStates = new Map();

app.post('/auth/twitter/prepare', (req, res) => {
  const { address, origin, username } = req.body;
  if (!address) return res.status(400).json({ error: 'Wallet address required' });

  const stateId = crypto.randomBytes(16).toString('hex');
  
  oauthStates.set(stateId, { address: address.toLowerCase(), origin, username });
  
  res.json({ state: stateId });
});

app.get('/auth/twitter/callback', async (req, res) => {
  const { state, code } = req.query;
  const session = oauthStates.get(state);
  
  if (!session) return res.status(400).send('Invalid or expired authentication session');
  oauthStates.delete(state);
  
  try {
    const authHeader = 'Basic ' + Buffer.from(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString('base64');
    
    // Polyfill for fetch if needed, but Node 18+ has native fetch
    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': authHeader
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: process.env.TWITTER_CLIENT_ID,
        redirect_uri: process.env.TWITTER_CALLBACK_URL,
        code_verifier: 'challenge'
      })
    });
    
    if (!tokenRes.ok) {
      console.error('Twitter token error:', await tokenRes.text());
      return res.status(400).send('Failed to authenticate with X');
    }
    
    const tokenData = await tokenRes.json();
    
    const userRes = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });
    
    if (!userRes.ok) return res.status(400).send('Failed to retrieve X profile info');
    
    const userData = await userRes.json();
    const xUser = userData.data;
    
    // Auto-onboard or link X securely
    profiles.upsert(session.address, {
      xHandle: xUser.username,
      xId: xUser.id,
      avatar: xUser.profile_image_url,
      xConnected: true,
      username: session.username || xUser.username // Store display name passed from frontend
    });
    
    // Redirect back to frontend with success params
    const frontendOrigin = session.origin || 'http://localhost:5173';
    res.redirect(`${frontendOrigin}/?x_connected=true&x_handle=${xUser.username}`);
  } catch (err) {
    console.error('Twitter callback error:', err);
    res.status(500).send('Internal Server Error during X authentication');
  }
});

// â”€â”€â”€ CIRCLE WALLET ROUTES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get('/circle/wallet/:address', async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    const wallet = await circleService.getOrCreateWallet(address);
    const balances = await circleService.getBalance(wallet.walletId);
    const transactions = await circleService.getTransactions(wallet.walletId);
    res.json({ success: true, wallet, balances, transactions });
  } catch (err) {
    console.error('[Circle/Wallet] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/circle/transactions/:address', async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    const wallet = await circleService.getOrCreateWallet(address);
    const transactions = await circleService.getTransactions(wallet.walletId);
    res.json({ success: true, transactions });
  } catch (err) {
    console.error('[Circle/Transactions] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/circle/transfer', async (req, res) => {
  const { address, destinationAddress, amount, tokenId } = req.body;
  if (!address || !destinationAddress || !amount || !tokenId) {
    return res.status(400).json({ error: 'Missing transfer parameters' });
  }

  try {
    const userAddr = address.toLowerCase();
    const wallet = await circleService.getOrCreateWallet(userAddr);
    const result = await circleService.transfer(wallet.walletId, destinationAddress, amount, tokenId);
    res.json({ success: true, result });
  } catch (err) {
    console.error('[Circle/Transfer] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// â”€â”€â”€ ADMIN ENDPOINTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get('/admin/stats', (req, res) => {
  // Use the global stats from profiles which aggregates data across all users
  const stats = profiles.getGlobalStats();
  
  // Augment with real-time metrics
  res.json({
    ...stats,
    activeCount: cache.sessions.size,
    activeStakesTotal: Array.from(cache.trades.values())
      .filter(t => t.status === 'PENDING')
      .reduce((sum, t) => sum + t.amount, 0),
    treasuryBalance: cache.prices.eth > 0 ? 'LIVE' : '0.00', // Mock or fetch actual
    pendingDisputes: 0,
    totalWallets: Object.keys(profiles.profiles).length
  });
});

/**
 * POST /admin/trades/resolve-stuck
 *
 * Clears trades the platform abandoned: rows still marked PENDING/RESOLVING long
 * after their countdown should have ended.
 *
 * Why an endpoint and not a DELETE
 * --------------------------------
 * Deleting these rows is the wrong tool and makes things worse. The stake was
 * debited from the user's balance when the trade was placed, so removing the row
 * does not return it - the user loses the money AND the only record that it ever
 * existed, which is also the evidence needed to work out why it got stuck. So
 * this UPDATES the row to a real terminal status and leaves the audit trail
 * intact.
 *
 * Status choice: CANCELLED. It is already a settled status, so the client stops
 * showing the "still processing" disclaimer and renders a real card, and it
 * accurately says the bet was voided rather than won or lost. DISPUTE would be
 * wrong here - that status means "waiting for an admin", which is exactly the
 * stuck state we are clearing, and it would leave the user blocked.
 *
 * payout is set to 0 on purpose. The frontend treats any settled row with a
 * non-zero payout as a win, and a refunded stake is not a win.
 *
 * Safety
 * ------
 *  - dry run unless `apply: true` is passed, so the default call changes nothing
 *  - `refund` is a SEPARATE opt-in: marking a row resolved does not return the
 *    stake, so the two decisions are never silently coupled
 *  - anything still in the live in-memory working set or the Redis open-trade
 *    registry is skipped, so a trade that is genuinely mid-flight is never voided
 *  - `olderThanMinutes` defaults to 10, comfortably past any 15s/5s trade
 *  - idempotent: only PENDING/RESOLVING rows are selected, so a re-run is a no-op
 *
 * Body: { apply?: boolean, refund?: boolean, olderThanMinutes?: number, reason?: string }
 */
app.post('/admin/trades/resolve-stuck', requirePerm('trades.maintenance'), async (req, res) => {
  const apply = req.body?.apply === true;
  const refund = req.body?.refund === true;
  const olderThanMinutes = Math.max(1, Number(req.body?.olderThanMinutes) || 10);
  const reason = String(req.body?.reason || 'admin-resolved-stuck').slice(0, 120);
  const cutoff = Date.now() - olderThanMinutes * 60 * 1000;

  try {
    const rows = await profiles.getUnsettledTradesAsync();
    if (!rows.length) {
      return res.json({ ok: true, apply, refund, scanned: 0, resolved: 0, note: 'No unsettled trades found.' });
    }

    // Never void a trade that is actually alive. The in-memory working set and
    // the Redis registry are the two records of a genuinely in-flight bet.
    const live = new Set();
    for (const t of cache.trades.values()) live.add(String(t.id));
    try {
      for (const t of await cache.listOpenTrades()) live.add(String(t.id));
    } catch (e) {
      console.warn('[ResolveStuck] Redis open-trade read failed:', e.message);
    }

    const candidates = [];
    const skipped = [];
    for (const t of rows) {
      const id = String(t.id || t.betId || '');
      if (!id) continue;
      if (live.has(id)) { skipped.push({ id, why: 'live in working set / open-trade registry' }); continue; }
      const ts = Number(t.timestamp || t.createdAt || 0);
      // Timestamps arrive as seconds from the DB and ms from local rows.
      const tsMs = ts > 1e12 ? ts : ts * 1000;
      if (tsMs && tsMs > cutoff) { skipped.push({ id, why: 'still inside the safety window' }); continue; }
      candidates.push(t);
    }

    const summary = {
      ok: true,
      apply,
      refund,
      olderThanMinutes,
      scanned: rows.length,
      eligible: candidates.length,
      skippedLive: skipped.length,
      resolved: 0,
      refundedTotal: 0,
      resolvedIds: [],
      failures: [],
      skipped: skipped.slice(0, 25)
    };

    if (!apply) {
      summary.note = 'DRY RUN â€” nothing was changed. Re-run with { apply: true } to clear these.';
      summary.wouldResolve = candidates.map(t => ({
        id: String(t.id || t.betId || ''),
        user: String(t.userAddr || t.user_address || '').slice(0, 12),
        amount: Number(t.amount || 0),
        status: t.status,
        ageMinutes: Math.round((Date.now() - (Number(t.timestamp || 0) > 1e12 ? Number(t.timestamp) : Number(t.timestamp || 0) * 1000)) / 60000)
      }));
      return res.json(summary);
    }

    for (const t of candidates) {
      const id = String(t.id || t.betId || '');
      const addr = String(t.userAddr || t.user_address || '').toLowerCase();
      const amount = Number(t.amount || 0);
      try {
        if (refund && amount > 0 && addr) {
          const credit = await fundingService.creditTradingWallet(addr, amount, null);
          if (!credit?.success) {
            summary.failures.push({ id, stage: 'refund', error: credit?.error || 'refund refused' });
            continue;   // leave the row PENDING rather than resolve a stake we did not return
          }
          summary.refundedTotal = Number((summary.refundedTotal + amount).toFixed(6));
        }

        const updated = await profiles.markTradeResolved(id, addr, {
          status: 'CANCELLED',
          reason
        });
        if (!updated) {
          summary.failures.push({ id, stage: 'persist', error: 'row update failed' });
          continue;
        }

        // Out of the recovery sweep, or the settler would pick it straight back up.
        cache.resolveOpenTrade(id);
        for (const t2 of cache.trades.values()) {
          if (String(t2.id) === id) cache.trades.delete(t2.id);
        }
        io.to(addr).emit('trade_resolved', {
          betId: id,
          status: 'CANCELLED',
          refunded: refund ? amount : 0,
          message: refund
            ? `Trade #${id} was voided by support and your ${amount.toFixed(2)} USDC stake was returned.`
            : `Trade #${id} was voided by support.`
        });
        io.to(addr).emit('balance_update', { balance: String(cache.sessions.get(addr)?.balance || 0), reason: 'TRADE_VOIDED' });

        summary.resolved++;
        summary.resolvedIds.push(id);
      } catch (e) {
        summary.failures.push({ id, stage: 'exception', error: e?.message || String(e) });
      }
    }

    console.log(
      `[ResolveStuck] apply=${apply} refund=${refund} -> resolved ${summary.resolved}/${summary.eligible}, ` +
      `refunded ${summary.refundedTotal} USDC, ${summary.failures.length} failure(s)`
    );
    return res.json(summary);
  } catch (err) {
    console.error('[ResolveStuck] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

app.get('/admin/trades', (req, res) => {
  // Collect ALL settled trades from profile history
  const allSettled = [];
  for (const addr in profiles.profiles) {
    const userTrades = profiles.profiles[addr].trades || [];
    for (const t of userTrades) {
      allSettled.push({ ...t, userAddr: addr });
    }
  }

  // Also include any still-active trades from the live cache
  const activeTrades = Array.from(cache.trades.values()).map(t => ({ ...t, status: t.status || 'PENDING' }));

  // Merge: settled trades already have their final state, skip if already in settled list
  const settledIds = new Set(allSettled.map(t => String(t.id || t.betId)));
  const onlyActive = activeTrades.filter(t => !settledIds.has(String(t.id)));

  const merged = [...allSettled, ...onlyActive];
  merged.sort((a, b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0));

  res.json(merged.slice(0, 200));
});

// Alias used by older admin build
app.get('/history', (req, res) => {
  return res.redirect('/admin/trades');
});

app.get('/admin/trade/:id', (req, res) => {
  const trade = cache.trades.get(req.params.id);
  if (trade) return res.json(trade);
  
  // Search in profiles if not in active cache
  for (const addr in profiles.profiles) {
    const t = (profiles.profiles[addr].trades || []).find(t => String(t.id || t.betId) === req.params.id);
    if (t) return res.json(t);
  }
  
  res.status(404).json({ error: 'Trade not found' });
});

app.post('/admin/broadcast', requirePerm('broadcast.send'), (req, res) => {
  const { message, type, expiry } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });
  
  const broadcast = {
    id: Date.now(),
    message,
    type: type || 'ANNOUNCEMENT',
    expiry: expiry || (Date.now() + 60000),
    timestamp: Date.now()
  };
  
  activeBroadcast = broadcast;
  io.emit('broadcast', broadcast);
  console.log(`[Admin] Broadcast Sent: ${message}`);
  
  // If this is a maintenance broadcast, also trigger the maintenance flag
  if (type === 'MAINTENANCE') {
    io.emit('settings_update', { maintenanceMode: true, systemBanner: message });
  }
  
  res.json({ success: true, broadcast });
});

app.post('/admin/settings/update', requirePerm('platform.settings'), (req, res) => {
  const settings = req.body;
  // Persist the standard toggles in-memory and re-broadcast instantly.
  if (settings && typeof settings === 'object') {
    if (settings.maintenanceMode !== undefined) platformSettings.maintenanceMode = !!settings.maintenanceMode;
    if (settings.tradingHalted !== undefined) platformSettings.tradingHalted = !!settings.tradingHalted;
    if (settings.systemBanner !== undefined) platformSettings.systemBanner = String(settings.systemBanner).slice(0, 300);
    if (settings.bannerLevel !== undefined) platformSettings.bannerLevel = String(settings.bannerLevel).slice(0, 20);
    if (settings.minBet !== undefined && Number(settings.minBet) > 0) platformSettings.minBet = Number(settings.minBet);
  }
  io.emit('settings_update', settings);
  res.json({ success: true, settings });
});

app.get('/broadcast', (req, res) => {
  if (activeBroadcast && activeBroadcast.expiry < Date.now()) {
    activeBroadcast = null;
  }
  res.json(activeBroadcast);
});

// â”€â”€â”€ MISC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

app.get('/listings', (req, res) => {
  res.json([
    { id: 'eth', symbol: 'ETH', name: 'Ethereum' },
    { id: 'btc', symbol: 'BTC', name: 'Bitcoin' },
    { id: 'sol', symbol: 'SOL', name: 'Solana' },
  ]);
});
let activeCampaigns = [];
let campaignEnrollments = {};

app.get('/campaigns', (req, res) => res.json(activeCampaigns));
app.post('/admin/campaigns', (req, res) => {
  const newCampaign = {
    id: `camp-${Date.now()}`,
    title: req.body.title,
    prize: req.body.prize,
    startTime: req.body.startTime || Date.now(),
    endTime: req.body.endTime || (Date.now() + 86400000 * 7)
  };
  activeCampaigns.push(newCampaign);
  io.emit('new_campaign', newCampaign);
  res.json({ success: true, campaign: newCampaign });
});

app.get('/leaderboard', (req, res) => {
  const { campaignId } = req.query;
  const campaign = activeCampaigns.find(c => c.id === campaignId);
  if (!campaign) return res.json([]);
  
  const enrolledUsers = campaignEnrollments[campaignId] || [];
  
  const leaderboard = enrolledUsers.map(e => {
    let wins = 0;
    const profile = profiles.profiles[e.address.toLowerCase()];
    if (profile && profile.trades) {
       wins = profile.trades.filter(t => {
         const tTime = Number(t.timestamp || t.settledAt || 0);
         return tTime >= campaign.startTime && tTime <= campaign.endTime && (t.won || t.status === 'WON');
       }).length;
    }
    return { address: e.address, enrolledAt: e.enrolledAt, wins };
  });

  leaderboard.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.enrolledAt - b.enrolledAt;
  });

  res.json(leaderboard);
});

app.get('/admin/campaign-report', (req, res) => {
  const { campaignId } = req.query;
  const campaign = activeCampaigns.find(c => c.id === campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

  const enrolledUsers = campaignEnrollments[campaignId] || [];
  
  const report = enrolledUsers.map(e => {
    const addr = e.address.toLowerCase();
    const profile = profiles.profiles[addr];
    const campaignTrades = (profile?.trades || []).filter(t => {
      const tTime = Number(t.timestamp || t.settledAt || 0);
      return tTime >= campaign.startTime && tTime <= campaign.endTime;
    });

    const wonTrades = campaignTrades.filter(t => t.won || t.status === 'WON');
    const lostTrades = campaignTrades.filter(t => !t.won && t.status !== 'WON');
    const totalVolume = campaignTrades.reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);
    const firstTrade = campaignTrades.length > 0 ? [...campaignTrades].sort((a, b) => (a.timestamp || a.settledAt || 0) - (b.timestamp || b.settledAt || 0))[0] : null;

    return {
      address: e.address,
      username: profile?.username || 'Trader',
      enrolledAt: e.enrolledAt,
      firstTradeTime: firstTrade ? (firstTrade.timestamp || firstTrade.settledAt) : null,
      totalTrades: campaignTrades.length,
      wonTrades: wonTrades.length,
      lostTrades: lostTrades.length,
      winRate: campaignTrades.length > 0 ? ((wonTrades.length / campaignTrades.length) * 100).toFixed(1) : "0.0",
      volume: totalVolume.toFixed(2),
      history: campaignTrades.slice(-12).map(t => (t.won || t.status === 'WON' ? 1 : 0))
    };
  });

  report.sort((a, b) => b.wonTrades - a.wonTrades || a.enrolledAt - b.enrolledAt);

  res.json({
    campaign,
    participants: report,
    summary: {
      totalParticipants: report.length,
      totalTrades: report.reduce((acc, p) => acc + p.totalTrades, 0),
      totalVolume: report.reduce((acc, p) => acc + parseFloat(p.volume), 0).toFixed(2)
    }
  });
});

app.post('/enroll', (req, res) => {
  const { campaignId, address } = req.body;
  if (!campaignId || !address) return res.status(400).json({ error: 'Missing parameters' });
  
  if (!campaignEnrollments[campaignId]) campaignEnrollments[campaignId] = [];
  
  const existing = campaignEnrollments[campaignId].find(e => e.address.toLowerCase() === address.toLowerCase());
  if (!existing) {
     campaignEnrollments[campaignId].push({ address, enrolledAt: Date.now() });

     // Send campaign signup notification and email
     const activeCampaign = activeCampaigns.find(c => c.id === campaignId);
     const campaignTitle = activeCampaign ? activeCampaign.title : 'Campaign';
     notificationService.notifyUser(
         address,
         "Campaign Enrolled",
         `You have successfully signed up for the campaign: "${campaignTitle}".`,
         "success"
     );
  }

  res.json({ success: true, enrolled: true });
});

app.get('/enroll', (req, res) => {
  const { campaignId, address } = req.query;
  if (!campaignId || !address) return res.json({ enrolled: false });
  const enrolled = (campaignEnrollments[campaignId] || []).some(e => e.address.toLowerCase() === address.toLowerCase());
  res.json({ enrolled });
});

app.get('/winner-banner', (req, res) => res.json(null));
app.post('/active-market', (req, res) => res.json({ success: true }));
app.post('/record-fee', (req, res) => res.json({ success: true }));

// Chart history is not stored anywhere by design: every login starts from
// an empty buffer that fills with live streamed ticks. No endpoints needed.

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    mode: 'nexus_unified_embedded_wallet',
    classicQueueDepth: cache.settlementQueue.length,
    activeSessions: cache.sessions.size,
    timestamp: Date.now(),
  });
});

// ============================================================
// COPY TRADING ROUTES
// ============================================================

/**
 * GET /copy-trading/wallet/:address
 * Returns the permanent copy trading wallet (EVM) for the user. Generates one if it doesn't exist.
 * Syncs the tracked balance with the real on-chain balance for instant deposit reflection.
 */
app.get('/copy-trading/wallet/:address', async (req, res) => {
  try {
    const userAddr = req.params.address.toLowerCase();
    let profile = profiles.get(userAddr);
    
    if (!profile) {
      profile = profiles.upsert(userAddr, { balance: 0 });
    }

    // Generate if not exists
    if (!profile.copyTradingWallet) {
      const newWallet = ethers.Wallet.createRandom();
      profile.copyTradingWallet = {
        address: newWallet.address,
        privateKey: newWallet.privateKey, // Store securely in production
        balance: 0 // Track isolated balance
      };
      profiles.upsert(userAddr, profile);
      notificationService.notifyUser(userAddr, "Copy Trading Wallet Created", "Your dedicated copy trading wallet has been generated successfully.", "success");
    }

    // Sync with real on-chain balance for instant deposit reflection
    try {
      const arcRpc = config.RPCS?.[0] || 'https://rpc.testnet.arc.io';
      const provider = new ethers.JsonRpcProvider(arcRpc);
      const onChainBalance = await provider.getBalance(profile.copyTradingWallet.address);
      const onChainBalanceNum = parseFloat(ethers.formatEther(onChainBalance));
      // Use the higher of tracked vs on-chain balance
      const syncedBalance = Math.max(profile.copyTradingWallet.balance, onChainBalanceNum);
      if (syncedBalance !== profile.copyTradingWallet.balance) {
        profile.copyTradingWallet.balance = syncedBalance;
        profiles.upsert(userAddr, { copyTradingWallet: profile.copyTradingWallet });
      }
    } catch (e) {
      console.warn('[copy-trading/wallet] On-chain balance sync failed (network may be down):', e.message);
    }

    res.json({ 
      success: true, 
      wallet: {
        address: profile.copyTradingWallet.address,
        balance: profile.copyTradingWallet.balance
      }
    });
  } catch (err) {
    console.error('[copy-trading/wallet] error:', err.message);
    res.status(500).json({ error: "Failed to fetch copy trading wallet" });
  }
});

/**
 * POST /copy-trading/deposit
 * Deposits funds from the user's trading wallet into the copy trading wallet.
 * Body: { address, amount }
 * Deducts from the tracked session/trading balance and credits the copy trading wallet.
 */
app.post('/copy-trading/deposit', async (req, res) => {
  try {
    const { address, amount } = req.body;
    if (!address || !amount || amount <= 0) {
      return res.status(400).json({ error: "Missing or invalid parameters" });
    }

    const userAddr = address.toLowerCase();
    let profile = profiles.get(userAddr);
    if (!profile) return res.status(404).json({ error: "Profile not found" });

    if (!profile.copyTradingWallet) {
      const newWallet = ethers.Wallet.createRandom();
      profile.copyTradingWallet = {
        address: newWallet.address,
        privateKey: newWallet.privateKey,
        balance: 0
      };
    }

    const amt = parseFloat(amount);
    const session = cache.sessions.get(userAddr);
    const sourceBalance = session ? session.balance : (parseFloat(profile.balance) || 0);

    if (amt > sourceBalance) {
      return res.status(400).json({ error: `Insufficient trading wallet balance: ${sourceBalance.toFixed(2)} USDC` });
    }

    if (session) {
      session.balance = sourceBalance - amt;
    }
    profile.balance = sourceBalance - amt;
    profile.copyTradingWallet.balance = (parseFloat(profile.copyTradingWallet.balance) || 0) + amt;

    profiles.upsert(userAddr, { balance: profile.balance, copyTradingWallet: profile.copyTradingWallet });

    notificationService.notifyUser(userAddr, "Deposit to Copy Trading", `Deposited ${amt.toFixed(2)} USDC from trading wallet to copy trading wallet.`, "success");
    res.json({ success: true, message: `Deposited ${amt.toFixed(2)} USDC`, newBalance: profile.copyTradingWallet.balance });
  } catch (err) {
    console.error('[copy-trading/deposit] error:', err.message);
    res.status(500).json({ error: "Failed to process deposit" });
  }
});

/**
 * POST /copy-trading/withdraw
 * Withdraws funds from the copy trading wallet back to the user's trading wallet.
 * Body: { address, amount }
 */
app.post('/copy-trading/withdraw', async (req, res) => {
  try {
    const { address, amount } = req.body;
    if (!address || !amount || amount <= 0) {
      return res.status(400).json({ error: "Missing or invalid parameters" });
    }

    const userAddr = address.toLowerCase();
    const profile = profiles.get(userAddr);
    if (!profile) return res.status(404).json({ error: "Profile not found" });
    if (!profile.copyTradingWallet) return res.status(400).json({ error: "No copy trading wallet" });

    const amt = parseFloat(amount);
    const currentBalance = parseFloat(profile.copyTradingWallet.balance) || 0;
    if (amt <= 0 || amt > currentBalance) {
      return res.status(400).json({ error: `Insufficient copy trading balance: ${currentBalance.toFixed(2)} USDC` });
    }

    profile.copyTradingWallet.balance = currentBalance - amt;
    const session = cache.sessions.get(userAddr);
    if (session) {
      session.balance = (session.balance || 0) + amt;
    }
    profile.balance = (parseFloat(profile.balance) || 0) + amt;

    profiles.upsert(userAddr, { balance: profile.balance, copyTradingWallet: profile.copyTradingWallet });

    notificationService.notifyUser(userAddr, "Withdraw from Copy Trading", `Withdrew ${amt.toFixed(2)} USDC from copy trading wallet to trading wallet.`, "info");
    res.json({ success: true, message: `Withdrew ${amt.toFixed(2)} USDC`, newBalance: profile.copyTradingWallet.balance });
  } catch (err) {
    console.error('[copy-trading/withdraw] error:', err.message);
    res.status(500).json({ error: "Failed to process withdrawal" });
  }
});

// Simple in-memory OTP storage (address -> { code, email, expiresAt })
const otpStore = {};

/**
 * POST /copy-trading/send-otp
 * Sends a 6-digit OTP code to the provided email for verification
 */
app.post('/copy-trading/send-otp', async (req, res) => {
    try {
        const { address, email } = req.body;
        if (!address || !email) return res.status(400).json({ error: "Missing address or email" });

        const userAddr = address.toLowerCase();
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

        otpStore[userAddr] = { code, email, expiresAt };
        console.log(`[OTP] Stored code for ${userAddr}: ${code}`);

        const sent = await notificationService.sendOtpEmail(email, code);
        if (sent) {
            res.json({ success: true, message: "OTP sent to email" });
        } else {
            res.status(500).json({ error: "Failed to send OTP email" });
        }
    } catch (err) {
        console.error('[OTP] Send error:', err.message);
        res.status(500).json({ error: "Failed to send OTP" });
    }
});

/**
 * POST /copy-trading/verify-otp
 * Verifies the OTP code for a given address
 */
app.post('/copy-trading/verify-otp', (req, res) => {
    try {
        const { address, code } = req.body;
        if (!address || !code) return res.status(400).json({ error: "Missing address or code" });

        const userAddr = address.toLowerCase();
        const record = otpStore[userAddr];

        if (!record) {
            return res.status(400).json({ error: "No OTP sent to this address" });
        }

        if (Date.now() > record.expiresAt) {
            delete otpStore[userAddr];
            return res.status(400).json({ error: "OTP has expired. Request a new one." });
        }

        if (record.code !== code.trim()) {
            return res.status(400).json({ error: "Invalid verification code" });
        }

        // OTP verified - clean up and mark email as verified
        delete otpStore[userAddr];
        
        // Store verified email on profile
        const profile = profiles.get(userAddr) || {};
        profile.emailVerified = true;
        profile.verifiedEmail = record.email;
        profiles.upsert(userAddr, profile);

        res.json({ success: true, message: "Email verified successfully" });
    } catch (err) {
        console.error('[OTP] Verify error:', err.message);
        res.status(500).json({ error: "Failed to verify OTP" });
    }
});

/**
 * POST /copy-trading/apply
 * User applies to be a copy trading provider
 */
app.post('/copy-trading/apply', (req, res) => {
  try {
    const { primaryWallet, name, twitter, telegram, email, copyFee, onChainData } = req.body;
    if (!primaryWallet) return res.status(400).json({ error: "Missing address" });
    
    const userAddr = primaryWallet.toLowerCase();
    const stats = profiles.getProfileStats(userAddr);
    
    const profile = profiles.get(userAddr) || {};
    
    // Save application state with all submitted details
    profile.providerApplication = {
      status: 'PENDING',
      appliedAt: Date.now(),
      primaryWallet: userAddr,
      contactInfo: { name, twitter, telegram, email },
      copyFee: parseFloat(copyFee) || 0,
      onChainData: onChainData || {},
      metricsSnapshot: stats
    };
    
    profiles.upsert(userAddr, profile);
    
    const payload = {
      address: userAddr,
      username: profile.providerApplication.contactInfo?.name || profile.discord?.username || profile.username || `${userAddr.substring(0, 6)}...`,
      primaryWallet: profile.providerApplication.primaryWallet || userAddr,
      contactInfo: profile.providerApplication.contactInfo || {},
      copyFee: profile.providerApplication.copyFee || 0,
      onChainData: profile.providerApplication.onChainData || {},
      appliedAt: profile.providerApplication.appliedAt,
      metrics: profile.providerApplication.metricsSnapshot
    };

    const count = io.engine?.clientsCount || 0;
    console.log(`[CopyTrading] Application saved for ${userAddr}, connected sockets: ${count}`);
    io.emit('new_copy_application', payload);
    console.log(`[CopyTrading] Emitted 'new_copy_application' for ${userAddr}`);
    
    res.json({ success: true, message: "Application submitted successfully" });
  } catch (err) {
    console.error('[CopyTrading] Apply error:', err);
    res.status(500).json({ error: "Failed to submit application" });
  }
});

/**
 * GET /admin/copy-trading/applications
 * Admin fetches pending applications
 */
app.get('/admin/copy-trading/applications', (req, res) => {
  try {
    const apps = [];
    for (const addr in profiles.profiles) {
      const p = profiles.profiles[addr];
      if (p.providerApplication && p.providerApplication.status === 'PENDING') {
        const app = p.providerApplication;
        apps.push({
          address: addr,
          username: app.contactInfo?.name || p.discord?.username || p.username || `${addr.substring(0, 6)}...`,
          primaryWallet: app.primaryWallet || addr,
          contactInfo: app.contactInfo || {},
          copyFee: app.copyFee || 0,
          onChainData: app.onChainData || {},
          appliedAt: app.appliedAt,
          metrics: app.metricsSnapshot
        });
      }
    }
    // Sort by newest
    apps.sort((a, b) => b.appliedAt - a.appliedAt);
    res.json({ success: true, applications: apps });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch applications" });
  }
});

/**
 * POST /admin/copy-trading/approve
 * Admin approves or rejects an application
 */
app.post('/admin/copy-trading/approve', (req, res) => {
  try {
    const { address, approved, reason } = req.body;
    if (!address) return res.status(400).json({ error: "Missing address" });
    
    const userAddr = address.toLowerCase();
    const profile = profiles.get(userAddr);
    
    if (!profile || !profile.providerApplication) {
      return res.status(404).json({ error: "Application not found" });
    }
    
    profile.providerApplication.status = approved ? 'APPROVED' : 'REJECTED';
    if (reason) profile.providerApplication.reason = reason;
    
    if (approved) {
      profile.isProvider = true;
      profile.providerStats = {
        followers: 0,
        aum: 0,
        profitGenerated: 0
      };
    }
    
    profiles.upsert(userAddr, profile);

    // Notify the user via socket and email
    io.to(userAddr).emit('provider_application_update', profile.providerApplication);
    notificationService.notifyUser(
      userAddr,
      approved ? "Provider Application Approved" : "Provider Application Rejected",
      approved
        ? `Congratulations! Your application to become a copy trading provider has been approved. You can now start building your following.`
        : `Your provider application was not approved.${reason ? ` Reason: ${reason}` : ''}`,
      approved ? "success" : "error"
    );

    res.json({ success: true, status: profile.providerApplication.status });
  } catch (err) {
    res.status(500).json({ error: "Failed to process application" });
  }
});

// Clear all provider applications
app.post('/admin/copy-trading/clear', (req, res) => {
  try {
    const allProfiles = profiles.getAll();
    let cleared = 0;
    for (const [addr, profile] of Object.entries(allProfiles)) {
      if (profile.providerApplication || profile.isProvider) {
        delete profile.providerApplication;
        profile.isProvider = false;
        delete profile.providerStats;
        profiles.upsert(addr, profile);
        cleared++;
      }
    }
    res.json({ success: true, cleared });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear applications" });
  }
});

/**
 * GET /copy-trading/investors
 * Returns real investors who have active copy relationships
 */
app.get('/copy-trading/investors', (req, res) => {
  try {
    const investors = [];
    for (const addr in profiles.profiles) {
      const p = profiles.profiles[addr];
      if (p.copyTradingWallet && p.activeCopies && p.activeCopies.length > 0) {
        const totalAllocated = p.activeCopies.reduce((sum, c) => sum + (c.allocated || 0), 0);
        investors.push({
          address: addr,
          username: p.providerApplication?.contactInfo?.name || p.discord?.username || p.username || `${addr.substring(0, 6)}...`,
          avatar: p.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${addr.substring(2, 8)}`,
          allocated: totalAllocated,
          copying: p.activeCopies.length,
          pnl: `${p.copyTradingPnl >= 0 ? '+' : ''}$${(p.copyTradingPnl || 0).toFixed(2)}`,
          isProvider: !!p.isProvider
        });
      }
    }
    investors.sort((a, b) => b.allocated - a.allocated);
    res.json({ success: true, investors });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch investors" });
  }
});

/**
 * GET /copy-trading/investors/:address/copies
 * Returns individual copy trade activity for an investor (ticker, direction, result, timestamp)
 */
app.get('/copy-trading/investors/:address/copies', (req, res) => {
  try {
    const addr = req.params.address.toLowerCase();
    const profile = profiles.get(addr);
    const copyTrades = profile?.copyTrades || [];
    
    // Separate active (PENDING) vs settled trades
    const active = copyTrades.filter(t => t.result === 'PENDING');
    const history = copyTrades.filter(t => t.result !== 'PENDING');
    
    res.json({ success: true, active, history });
  } catch (err) {
    console.error('[copy-trading/copies] error:', err.message);
    res.status(500).json({ error: "Failed to fetch copy trades" });
  }
});

/**
 * POST /copy-trading/trade
 * Records an individual copy trade for an investor (called when a provider takes a trade)
 */
app.post('/copy-trading/trade', (req, res) => {
  try {
    const { investorAddress, providerAddress, providerName, asset, direction, amount } = req.body;
    if (!investorAddress || !asset) return res.status(400).json({ error: "Missing required fields" });

    const provider = profiles.get(providerAddress?.toLowerCase());
    const trade = profiles.pushCopyTrade(investorAddress, {
      providerAddress,
      providerName: providerName || provider?.providerApplication?.contactInfo?.name || provider?.username || `${providerAddress?.substring(0, 6)}...`,
      asset,
      direction: direction || 'UP',
      result: 'PENDING',
      amount: amount || 0,
      timestamp: Date.now()
    });

    // Emit real-time update
    io.to(investorAddress.toLowerCase()).emit('copy_trade_update', { trade });

    res.json({ success: true, trade });
  } catch (err) {
    console.error('[copy-trading/trade] error:', err.message);
    res.status(500).json({ error: "Failed to record trade" });
  }
});

/**
 * GET /copy-trading/providers
 * Fetch list of approved providers for the investor dashboard (REAL DATA ONLY)
 */
app.get('/copy-trading/providers', (req, res) => {
  try {
    const providers = [];
    for (const addr in profiles.profiles) {
      const p = profiles.profiles[addr];
      if (p.isProvider) {
        const stats = profiles.getProfileStats(addr);
        const totalPnl = (p.providerStats?.profitGenerated || 0);
        const totalVolume = stats.totalVolume || 0;
        providers.push({
          address: addr,
          username: p.providerApplication?.contactInfo?.name || p.discord?.username || p.username || `${addr.substring(0, 6)}...`,
          avatar: p.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${addr.substring(2, 8)}`,
          totalTrades: stats.totalTrades || 0,
          winRate: stats.totalTrades > 0 ? ((stats.totalWins / stats.totalTrades) * 100).toFixed(1) : '0.0',
          followers: p.providerStats?.followers || 0,
          aum: p.providerStats?.aum || 0,
          roi: totalVolume > 0 ? ((totalPnl / totalVolume) * 100).toFixed(2) : '0.00',
          copyFee: p.providerApplication?.copyFee || 0
        });
      }
    }
    // Sort by winRate descending
    providers.sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate));
    res.json({ success: true, providers });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch providers" });
  }
});

/**
 * POST /copy-trading/activate
 * Investor activates copy trading on a specific provider.
 * Validates balance, deducts activation fee, persists copy relationship.
 */
app.post('/copy-trading/activate', (req, res) => {
  try {
    const { investorAddress, providerAddress, mode, allocated, stakePerTrade } = req.body;
    if (!investorAddress || !providerAddress) return res.status(400).json({ error: "Missing addresses" });

    const investorAddr = investorAddress.toLowerCase();
    const providerAddr = providerAddress.toLowerCase();

    const investor = profiles.get(investorAddr);
    if (!investor || !investor.copyTradingWallet) {
      return res.status(400).json({ error: "Investor does not have a copy trading wallet" });
    }

    const provider = profiles.get(providerAddr);
    if (!provider || !provider.isProvider) {
      return res.status(400).json({ error: "Provider not found or not approved" });
    }

    const ACTIVATION_FEE = 1; // 1 USDC
    const allocatedAmount = mode === 'isolated' ? (parseFloat(allocated) || 0) : 0;
    const stakeAmount = parseFloat(stakePerTrade) || 0;
    const requiredBalance = allocatedAmount + stakeAmount + ACTIVATION_FEE;
    const walletBalance = parseFloat(investor.copyTradingWallet.balance) || 0;

    if (walletBalance < requiredBalance) {
      return res.status(400).json({ 
        error: `Insufficient balance. Need ${requiredBalance} USDC (including ${ACTIVATION_FEE} USDC activation fee). Current balance: ${walletBalance} USDC.`
      });
    }

    // Deduct activation fee from investor balance
    investor.copyTradingWallet.balance = walletBalance - ACTIVATION_FEE;

    // If isolated, reserve the allocated funds
    if (mode === 'isolated') {
      investor.copyTradingWallet.balance -= allocatedAmount;
      investor.copyTradingAllocated = (parseFloat(investor.copyTradingAllocated) || 0) + allocatedAmount;
    }

    // Create copy relationship
    if (!investor.activeCopies) investor.activeCopies = [];
    investor.activeCopies.push({
      providerAddress: providerAddr,
      providerName: provider.providerApplication?.contactInfo?.name || provider.username || providerAddr.substring(0, 8),
      mode,
      allocated: allocatedAmount,
      stakePerTrade: stakeAmount,
      activatedAt: Date.now(),
      pnl: 0
    });

    // Update provider stats
    if (!provider.providerStats) provider.providerStats = { followers: 0, aum: 0, profitGenerated: 0 };
    provider.providerStats.followers = (provider.providerStats.followers || 0) + 1;
    provider.providerStats.aum = (provider.providerStats.aum || 0) + allocatedAmount + stakeAmount;

    // Split activation fee: 50% provider portfolio wallet, 50% protocol treasury
    const providerShare = ACTIVATION_FEE / 2;
    if (provider.providerPortfolioWallet) {
      provider.providerPortfolioWallet.balance = (provider.providerPortfolioWallet.balance || 0) + providerShare;
    } else {
      provider.pendingPortfolioRevenue = (provider.pendingPortfolioRevenue || 0) + providerShare;
    }
    provider.providerStats.profitGenerated = (provider.providerStats.profitGenerated || 0) + ACTIVATION_FEE;

    profiles.upsert(investorAddr, investor);
    profiles.upsert(providerAddr, provider);

    // Notify both parties via socket
    io.to(investorAddr).emit('copy_activated', { providerAddress: providerAddr, mode, allocated: allocatedAmount, stakePerTrade: stakeAmount, newBalance: investor.copyTradingWallet.balance });
    io.to(providerAddr).emit('new_follower', { investorAddress: investorAddr, mode, allocated: allocatedAmount, portfolioShare: providerShare });

    res.json({ 
      success: true, 
      message: 'Copy trading activated',
      newBalance: investor.copyTradingWallet.balance,
      activeCopies: investor.activeCopies.length,
      portfolioShare: providerShare
    });
  } catch (err) {
    console.error('[copy-trading/activate] error:', err.message);
    res.status(500).json({ error: "Failed to activate copy trading" });
  }
});

/**
 * GET /copy-trading/providers/:address/followers
 * Returns list of investors actively copying this provider
 */
app.get('/copy-trading/providers/:address/followers', (req, res) => {
  try {
    const providerAddr = req.params.address.toLowerCase();
    const followers = [];
    for (const addr in profiles.profiles) {
      const p = profiles.profiles[addr];
      if (p.activeCopies && Array.isArray(p.activeCopies)) {
        const copyRelation = p.activeCopies.find(c => c.providerAddress?.toLowerCase() === providerAddr);
        if (copyRelation) {
          followers.push({
            address: addr,
            username: p.discord?.username || p.username || `${addr.substring(0, 6)}...`,
            avatar: p.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${addr.substring(2, 8)}`,
            mode: copyRelation.mode,
            allocated: copyRelation.allocated || 0,
            stakePerTrade: copyRelation.stakePerTrade || 0,
            pnl: copyRelation.pnl || 0,
            activatedAt: copyRelation.activatedAt
          });
        }
      }
    }
    followers.sort((a, b) => (b.allocated || 0) - (a.allocated || 0));
    res.json({ success: true, followers });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch followers" });
  }
});

/**
 * GET /copy-trading/providers/:address/performance
 * Returns provider's own trade performance metrics and revenue history
 */
app.get('/copy-trading/providers/:address/performance', (req, res) => {
  try {
    const providerAddr = req.params.address.toLowerCase();
    const provider = profiles.get(providerAddr);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const stats = profiles.getProfileStats(providerAddr);
    const activationTime = provider.providerApplication?.appliedAt || provider.providerStats?.activatedAt || Date.now() - 86400000 * 30;
    const providerTrades = (provider.trades || []).filter(t => (t.timestamp || 0) >= activationTime);

    const totalTrades = providerTrades.length;
    const wins = providerTrades.filter(t => t.won || t.status === 'WON').length;
    const losses = totalTrades - wins;
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0.0';
    const totalVolume = providerTrades.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    const totalPnl = providerTrades.reduce((sum, t) => sum + parseFloat(t.pnl || t.profit || 0), 0);

    const revenue = provider.providerStats?.profitGenerated || 0;

    // Group trades by month for monthly breakdown
    const monthlyBuckets = {};
    providerTrades.forEach(t => {
      const d = new Date(t.timestamp || Date.now());
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyBuckets[key]) monthlyBuckets[key] = { trades: 0, wins: 0, volume: 0, pnl: 0 };
      monthlyBuckets[key].trades++;
      if (t.won || t.status === 'WON') monthlyBuckets[key].wins++;
      monthlyBuckets[key].volume += parseFloat(t.amount || 0);
      monthlyBuckets[key].pnl += parseFloat(t.pnl || t.profit || 0);
    });
    const monthlyPerformance = Object.entries(monthlyBuckets).map(([month, data]) => ({
      month,
      trades: data.trades,
      winRate: data.trades > 0 ? ((data.wins / data.trades) * 100).toFixed(1) : '0.0',
      volume: data.volume,
      pnl: data.pnl
    })).sort((a, b) => a.month.localeCompare(b.month));

    res.json({
      success: true,
      performance: {
        totalTrades,
        wins,
        losses,
        winRate: parseFloat(winRate),
        totalVolume,
        totalPnl,
        revenue,
        followers: provider.providerStats?.followers || 0,
        aum: provider.providerStats?.aum || 0,
        monthlyPerformance
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch performance" });
  }
});

/**
 * GET /copy-trading/providers/:address/reports?period=daily|weekly|monthly|annual|all
 * Returns aggregated reports for the given period
 */
app.get('/copy-trading/providers/:address/reports', (req, res) => {
  try {
    const providerAddr = req.params.address.toLowerCase();
    const period = req.query.period || 'all';
    const provider = profiles.get(providerAddr);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const now = Date.now();
    const dayMs = 86400000;
    let fromTime = 0;
    let groupFormat = 'day';

    switch (period) {
      case 'daily':   fromTime = now - dayMs; groupFormat = 'hour'; break;
      case 'weekly':  fromTime = now - 7 * dayMs; groupFormat = 'day'; break;
      case 'monthly': fromTime = now - 30 * dayMs; groupFormat = 'day'; break;
      case 'annual':  fromTime = now - 365 * dayMs; groupFormat = 'month'; break;
      default: fromTime = 0; groupFormat = 'month'; break;
    }

    const providerTrades = (provider.trades || []).filter(t => (t.timestamp || 0) >= fromTime);
    const totalTrades = providerTrades.length;
    const wins = providerTrades.filter(t => t.won || t.status === 'WON').length;
    const losses = totalTrades - wins;
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0.0';
    const totalVolume = providerTrades.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    const totalPnl = providerTrades.reduce((sum, t) => sum + parseFloat(t.pnl || t.profit || 0), 0);

    // Count followers added in this period
    let newFollowers = 0;
    const activationTime = provider.providerApplication?.appliedAt || 0;
    for (const addr in profiles.profiles) {
      const p = profiles.profiles[addr];
      if (p.activeCopies && Array.isArray(p.activeCopies)) {
        const rel = p.activeCopies.find(c => c.providerAddress?.toLowerCase() === providerAddr);
        if (rel && (rel.activatedAt || 0) >= fromTime) newFollowers++;
      }
    }

    res.json({
      success: true,
      report: {
        period,
        from: fromTime,
        to: now,
        totalTrades,
        wins,
        losses,
        winRate: parseFloat(winRate),
        totalVolume,
        totalPnl,
        revenue: provider.providerStats?.profitGenerated || 0,
        totalFollowers: provider.providerStats?.followers || 0,
        newFollowers,
        aum: provider.providerStats?.aum || 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate report" });
  }
});

/**
 * GET /copy-trading/providers/:address/portfolio
 * Returns the provider's portfolio wallet balance (earnings from activation fees).
 */
app.get('/copy-trading/providers/:address/portfolio', (req, res) => {
  try {
    const providerAddr = req.params.address.toLowerCase();
    const provider = profiles.get(providerAddr);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const wallet = provider.providerPortfolioWallet || null;
    res.json({
      success: true,
      portfolio: {
        wallet: wallet ? { address: wallet.address, balance: wallet.balance || 0 } : null,
        pendingRevenue: provider.pendingPortfolioRevenue || 0,
        balance: wallet ? (wallet.balance || 0) : 0,
        totalEarned: provider.providerStats?.profitGenerated || 0,
        activationRevenue: provider.providerStats?.profitGenerated || 0,
        feeRevenue: 0
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch portfolio" });
  }
});

/**
 * POST /copy-trading/providers/:address/generate-portfolio-wallet
 * Generates a portfolio wallet for the provider. If there is pending revenue,
 * applies a 10% penalty and credits the balance.
 */
app.post('/copy-trading/providers/:address/generate-portfolio-wallet', (req, res) => {
  try {
    const providerAddr = req.params.address.toLowerCase();
    const provider = profiles.get(providerAddr);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    if (provider.providerPortfolioWallet) {
      return res.json({ success: true, wallet: { address: provider.providerPortfolioWallet.address, balance: provider.providerPortfolioWallet.balance || 0 }, alreadyGenerated: true });
    }

    const newWallet = ethers.Wallet.createRandom();
    let credited = 0;
    let penalty = 0;
    const pending = provider.pendingPortfolioRevenue || 0;

    if (pending > 0) {
      penalty = pending * 0.1;
      credited = pending - penalty;
      provider.providerStats.profitGenerated = (provider.providerStats.profitGenerated || 0) - pending + credited;
    }

    provider.providerPortfolioWallet = {
      address: newWallet.address,
      privateKey: newWallet.privateKey,
      balance: credited
    };
    provider.pendingPortfolioRevenue = 0;

    profiles.upsert(providerAddr, { providerPortfolioWallet: provider.providerPortfolioWallet, pendingPortfolioRevenue: 0, providerStats: provider.providerStats });

    res.json({
      success: true,
      wallet: { address: newWallet.address, balance: credited },
      claimed: pending > 0 ? { gross: pending, penalty, net: credited } : null
    });
  } catch (err) {
    console.error('[generate-portfolio-wallet] error:', err.message);
    res.status(500).json({ error: "Failed to generate portfolio wallet" });
  }
});

/**
 * POST /copy-trading/providers/:address/claim-revenue
 * Claims pending portfolio revenue with 10% penalty.
 */
app.post('/copy-trading/providers/:address/claim-revenue', (req, res) => {
  try {
    const providerAddr = req.params.address.toLowerCase();
    const provider = profiles.get(providerAddr);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    const pending = provider.pendingPortfolioRevenue || 0;
    if (pending <= 0) return res.status(400).json({ error: "No pending revenue to claim" });
    if (!provider.providerPortfolioWallet) return res.status(400).json({ error: "Generate portfolio wallet first" });

    const penalty = pending * 0.1;
    const net = pending - penalty;

    provider.providerPortfolioWallet.balance = (provider.providerPortfolioWallet.balance || 0) + net;
    provider.pendingPortfolioRevenue = 0;

    profiles.upsert(providerAddr, { providerPortfolioWallet: provider.providerPortfolioWallet, pendingPortfolioRevenue: 0 });

    res.json({
      success: true,
      newBalance: provider.providerPortfolioWallet.balance,
      claimed: { gross: pending, penalty, net }
    });
  } catch (err) {
    console.error('[claim-revenue] error:', err.message);
    res.status(500).json({ error: "Failed to claim revenue" });
  }
});

/**
 * POST /copy-trading/providers/:address/withdraw
 * Withdraws portfolio earnings to the provider's main wallet.
 * Deducts from tracked portfolio balance and sends on-chain from treasury.
 */
app.post('/copy-trading/providers/:address/withdraw', async (req, res) => {
  try {
    const providerAddr = req.params.address.toLowerCase();
    const { amount, targetAddress } = req.body;

    if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid withdrawal amount" });
    if (!targetAddress) return res.status(400).json({ error: "Target address required" });

    const provider = profiles.get(providerAddr);
    if (!provider) return res.status(404).json({ error: "Provider not found" });

    if (!provider.providerPortfolioWallet) return res.status(400).json({ error: "No portfolio wallet" });
    const currentBalance = provider.providerPortfolioWallet.balance || 0;
    if (amount > currentBalance) {
      return res.status(400).json({ error: `Insufficient portfolio balance. Have ${currentBalance} USDC, need ${amount} USDC.` });
    }

    // Deduct from tracked balance
    provider.providerPortfolioWallet.balance = currentBalance - amount;

    // Attempt on-chain transfer from treasury to target address
    try {
      if (config.TREASURY_ADDRESS && config.TREASURY_ADDRESS !== ethers.ZeroAddress && config.PRIVATE_KEY) {
        const nonce = await rpc.getNonce(rpc.wallet.address);
        const tx = await rpc.broadcastWithFailover(
          config.PRIVATE_KEY,
          {
            to: targetAddress,
            value: ethers.parseEther(String(amount)),
            gasLimit: 21000n,
            gasPrice: ethers.parseUnits("60", "gwei"),
            nonce,
            chainId: rpc.chainId
          }
        );
        const receipt = await rpc.waitForReceipt(tx.hash);
        if (!receipt || receipt.status !== 1) {
          console.error('[withdraw] Transfer reverted on-chain');
        } else {
          console.log(`[withdraw] Sent ${amount} USDC to ${targetAddress} (tx: ${tx.hash})`);
        }
      } else {
        console.log(`[withdraw] On-chain transfer skipped (no treasury key). Recorded ${amount} USDC withdrawal for ${targetAddress}`);
      }
    } catch (e) {
      console.warn('[withdraw] On-chain transfer failed, balance already deducted:', e.message?.substring(0, 100));
    }

    profiles.upsert(providerAddr, { providerPortfolioWallet: provider.providerPortfolioWallet });

    res.json({
      success: true,
      message: `Withdrawal of ${amount} USDC submitted to ${targetAddress}`,
      newBalance: provider.providerPortfolioWallet.balance
    });
  } catch (err) {
    console.error('[copy-trading/withdraw] error:', err.message);
    res.status(500).json({ error: "Failed to process withdrawal" });
  }
});

// --- Start ---
// Exported so services (e.g. chainReconciler) can push real-time socket
// updates without duplicating the server handle. Required lazily at call time,
// never at module load, to avoid a circular import.
module.exports = { app, server, io };

server.listen(config.PORT, '0.0.0.0', () => {
  console.log(`\nðŸš€ Nexus Core (Embedded Wallet Mode) listening on port ${config.PORT}\n`);
});
