const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'profiles.json');
// Durability outbox: every trade that reached a store durably EXCEPT the one
// that was down at the time. Two lists — bets missing from the Redis
// open-trade registry, and settled records whose Supabase upsert failed.
// Replayed on an interval until the store confirms, so an outage delays
// settlement visibility but can never silently drop a result.
const OUTBOX_PATH = path.join(DATA_DIR, 'durability.json');

// Ensure data directory exists
try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) { }

// ─── Persistence model ─────────────────────────────────────────
// Memory  = hot cache (authoritative at runtime).
// Supabase = durable store of record (survives restarts / disk wipes).
// File    = local fallback snapshot only (loaded when Supabase is
//           unreachable or empty; written as a safety net).
// Redis is NOT used for profiles anymore — it was duplicating the
// whole user DB (incl. wallet private keys). It stays reserved for
// genuine cache/pub-sub needs elsewhere (trade results, charts, prices).
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_ENABLED = !!(SUPABASE_URL && SUPABASE_KEY);

function supabaseHeaders() {
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
    };
}

// undici reports every transport-level problem as a bare "fetch failed" and
// hides the actionable part on err.cause (ECONNRESET, UND_ERR_SOCKET, ENOTFOUND,
// CERT_HAS_EXPIRED, ...). Callers only ever logged err.message, so a dropped
// connection and a TLS failure were indistinguishable from the log alone.
// Render the whole chain instead.
const describeFetchError = (err) => {
    const parts = [];
    let e = err;
    let depth = 0;
    while (e && depth < 5) {
        parts.push(`${e.name || 'Error'}${e.code ? ` [${e.code}]` : ''}: ${e.message}`);
        e = e.cause;
        depth++;
    }
    return parts.join(' <- ');
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const supabaseRequest = async (path, options = {}) => {
    // Supabase is cross-region from Render and measured ~8.4s for a bare
    // reachability check, so the previous 8s default sat right on the edge: profile
    // loads aborted mid-flight and silently degraded to the local file fallback. On
    // Render's ephemeral disk that fallback is effectively an empty profile store,
    // which loses onboarding state, the chain baseline and the persisted balance.
    // Durability beats speed here, so allow a slow-but-valid response to land.
    const { timeout = 25000, retries = 2, ...fetchOptions } = options;

    // `timeout` is the TOTAL budget across all attempts, not per attempt, so
    // adding retries does not change how long any caller waits - including the
    // 30s AbortController on the frontend's /session/execute request.
    const deadline = Date.now() + timeout;
    let lastErr = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), remaining);
        try {
            return await fetch(`${SUPABASE_URL}${path}`, {
                ...fetchOptions,
                signal: controller.signal,
                headers: { ...supabaseHeaders(), ...(fetchOptions.headers || {}) }
            });
        } catch (e) {
            lastErr = e;
            if (attempt === retries) break;

            // Backoff with jitter, and only for transport failures - an HTTP
            // status is a real answer and is returned to the caller untouched.
            //
            // The wait is the actual fix. Supabase sits behind Cloudflare, which
            // reaps idle connections, while undici keeps them pooled: a request
            // handed a socket the peer already closed fails with ECONNRESET /
            // UND_ERR_SOCKET. undici evicts a socket once it errors, so the retry
            // has to wait for that to happen. syncToSupabase used to retry four
            // times with no delay at all, so all four landed within milliseconds
            // on the same poisoned connection and all four failed identically -
            // one "fetch failed" for what was really a single dropped socket.
            const backoff = 250 * Math.pow(2, attempt) + Math.floor(Math.random() * 150);
            if (Date.now() + backoff >= deadline) break;
            await sleep(backoff);
        } finally {
            clearTimeout(timer);
        }
    }

    throw new Error(`Supabase request failed: ${describeFetchError(lastErr)}`);
};

function normalizeStoredTrade(trade) {
    const normalized = { ...trade };
    for (const [key, value] of Object.entries(normalized)) {
        if (typeof value === 'bigint') normalized[key] = value.toString();
    }
    return normalized;
}

function tradeToSupabaseRow(address, trade) {
    const status = trade.status || (trade.won ? 'WON' : 'LOST');
    const direction = trade.direction === 1 || String(trade.direction).toUpperCase() === '1' || String(trade.direction).toUpperCase() === 'UP'
        ? 'UP'
        : 'DOWN';
    return {
        id: String(trade.betId || trade.id),
        user_address: address.toLowerCase(),
        symbol: String(trade.symbol || trade.asset || '').toLowerCase(),
        direction,
        amount: Number(trade.amount || 0),
        entry_price: trade.entryPrice ?? null,
        exit_price: trade.exitPrice ?? trade.settlementPrice ?? null,
        duration: trade.duration ?? null,
        status,
        won: !!(trade.won || ['WON', 'PAID'].includes(status)),
        payout: Number(trade.payout || trade.payoutAmount || 0),
        fee: Number(trade.fee || 0),
        pnl: Number(trade.pnl || trade.profit || 0),
        tx_hash: trade.txHash || trade.tx || null,
        stake_tx_hash: trade.stakeTxHash || trade.tx || null,
        settlement_tx_hash: trade.settlementTxHash || null,
        settled_at: trade.settledAt || null,
        timestamp: trade.timestamp || trade.createdAt || Date.now(),
        raw_data: normalizeStoredTrade(trade)
    };
}

// The `trades` table is a mixed ledger: real bets AND funding rows. A deposit
// writes a row with type 'DEPOSIT' and status 'CONFIRMED' (see POST /fund/confirm
// and the chain reconciler's auto-credit), and copy-trade bookkeeping lands here
// too. None of those are bets, but they were returned by getHistoryAsync as if
// they were, so the client rendered them in the trade history labelled
// CONFIRMED - which reads as "a trade that is somehow already settled" when it
// is really a deposit receipt. Worse, CONFIRMED is not a settled bet status, so
// tapping one opened the "still processing" disclaimer.
//
// Funding rows are filtered out of bet history entirely. They stay in the table
// and in the transaction/deposit views, which is where they belong; they are
// simply not trades and must never be presented as one.
const FUNDING_ROW_TYPES = new Set(['DEPOSIT', 'FUNDING', 'CREDIT', 'TOPUP', 'TOP_UP']);

function isBetRecord(trade) {
    if (!trade) return false;
    const type = String(trade.type || '').toUpperCase();
    if (type && FUNDING_ROW_TYPES.has(type)) return false;
    // A synthetic DEPOSIT-<txhash> id is a funding row even when the type column
    // was never persisted.
    if (/^DEPOSIT-/i.test(String(trade.id || trade.betId || ''))) return false;
    // Funding rows carry no market. A real bet always does.
    if (!trade.symbol) return false;
    return true;
}

function tradeStatusRank(status) {
    return {
        PENDING: 1,
        RESOLVING: 2,
        // DISPUTE is a decided-to-be-undecided state: the platform has given up
        // on deciding it automatically and is waiting for an admin. It must rank
        // ABOVE the in-flight states or a stale PENDING copy of the same bet
        // would win the merge and quietly undo the dispute.
        DISPUTE: 3,
        WON: 4,
        LOST: 4,
        PAID: 5,
        PAYOUT_FAILED: 5,
        CANCELLED: 5
    }[status] || 0;
}

function supabaseTradeToRecord(row) {
    const parsed = parseJsonField(row.raw_data);
    const raw = parsed && typeof parsed === 'object' ? parsed : {};
    return {
        ...raw,
        id: String(row.id),
        betId: String(row.id),
        userAddr: row.user_address || raw.userAddr,
        symbol: String(row.symbol || raw.symbol || '').toUpperCase(),
        direction: row.direction || raw.direction,
        amount: Number(row.amount ?? raw.amount ?? 0),
        entryPrice: row.entry_price != null ? Number(row.entry_price) : raw.entryPrice,
        exitPrice: row.exit_price != null ? Number(row.exit_price) : raw.exitPrice,
        duration: row.duration ?? raw.duration,
        status: row.status || raw.status,
        won: row.won ?? raw.won,
        payout: Number(row.payout ?? raw.payout ?? 0),
        fee: Number(row.fee ?? raw.fee ?? 0),
        pnl: Number(row.pnl ?? raw.pnl ?? 0),
        txHash: row.tx_hash || raw.txHash || raw.tx,
        stakeTxHash: row.stake_tx_hash || raw.stakeTxHash,
        settlementTxHash: row.settlement_tx_hash || raw.settlementTxHash,
        settledAt: row.settled_at || raw.settledAt,
        timestamp: Number(row.timestamp || raw.timestamp || 0)
    };
}

// jsonb/text columns can arrive as JSON strings or as native values.
function parseJsonField(v) {
    if (typeof v === 'string' && (v.trim().startsWith('{') || v.trim().startsWith('['))) {
        try { return JSON.parse(v); } catch (e) { return v; }
    }
    return v;
}

// Map in-memory camelCase profile -> Supabase snake_case row.
// Undefined keys are dropped (JSON.stringify) so absent fields do not
// overwrite existing column values on merge-upserts.
function profileToRow(profile, includeTrades, includeOnboarding = true, includeChainRecon = true) {
    const row = {
        address: profile.address,
        username: profile.username ?? null,
        // Country of residence (ISO alpha-2, set at onboarding). Dropped per
        // payload in syncToSupabase while migration 006 is unapplied, so a
        // missing column can never break profile sync.
        country: (typeof profile.country === 'string' && /^[A-Za-z]{2}$/.test(profile.country.trim()))
            ? profile.country.trim().toUpperCase()
            : null,
        x_handle: profile.xHandle ?? null,
        x_id: profile.xId ?? null,
        x_connected: profile.xConnected ?? false,
        avatar: profile.avatar ?? null,
        email: profile.email ?? null,
        email_verified: profile.emailVerified ?? false,
        verified_email: profile.verifiedEmail ?? null,
        discord: profile.discord ?? null,
        balance: profile.balance ?? 0,
        solana_wallet: (typeof profile.solanaWallet === 'object' && profile.solanaWallet)
            ? JSON.stringify(profile.solanaWallet) : (profile.solanaWallet ?? null),
        copy_trading_wallet: (typeof profile.copyTradingWallet === 'object' && profile.copyTradingWallet)
            ? JSON.stringify(profile.copyTradingWallet) : (profile.copyTradingWallet ?? null),
        copy_trading_allocated: profile.copyTradingAllocated ?? 0,
        copy_trading_pnl: profile.copyTradingPnl ?? 0,
        active_copies: profile.activeCopies ?? [],
        access_code: profile.accessCode ?? null,
        waitlist_status: profile.waitlistStatus ?? 'pending',
        // applied_at is a bigint column (unix ms), unlike the timestamptz audit columns.
        applied_at: profile.appliedAt != null ? (typeof profile.appliedAt === 'number' ? profile.appliedAt : (Number.isFinite(Date.parse(profile.appliedAt)) ? Date.parse(profile.appliedAt) : profile.appliedAt)) : null,
        is_provider: profile.isProvider ?? false,
        provider_application: profile.providerApplication ?? null,
        provider_stats: profile.providerStats ?? null,
        provider_portfolio_wallet: profile.providerPortfolioWallet ?? null,
        pending_portfolio_revenue: profile.pendingPortfolioRevenue ?? 0,
        trading_wallet: profile.tradingWallet ?? null,
        wallet_address: profile.walletAddress ?? null,
        // Referral program (migration 009). Kept explicit so a profile write
        // can never silently drop a referral link the user applied once.
        referral_code: profile.referralCode ?? null,
        referred_by: profile.referredBy ?? null,
        referred_at: profile.referredAt != null ? profile.referredAt : null,
        referral_enrolled: profile.referralEnrolled ?? false,
        referral_enrolled_at: profile.referralEnrolledAt != null ? profile.referralEnrolledAt : null,
        updated_at: new Date().toISOString()
    };
    if (includeChainRecon) {
        // NULL (not 0) means "never reconciled" — that distinction is what
        // stops a restart from re-crediting an already-counted balance.
        row.chain_baseline = profile.chainBaseline != null ? profile.chainBaseline : null;
        row.chain_gas_owed = profile.chainGasOwed != null ? profile.chainGasOwed : null;
    }
    if (includeOnboarding) {
        row.onboarded = profile.onboarded === true || !!profile.onboardedAt || !!profile.username;
        row.onboarded_at = profile.onboardedAt != null
            ? (typeof profile.onboardedAt === 'number' ? profile.onboardedAt : Date.parse(profile.onboardedAt))
            : null;
        if (typeof profile.firstName === 'string' && profile.firstName.trim()) {
            row.first_name = profile.firstName.trim().slice(0, 60);
        }
        if (typeof profile.lastName === 'string' && profile.lastName.trim()) {
            row.last_name = profile.lastName.trim().slice(0, 60);
        }
    }
    // Optional columns (added via supabase-migration.sql). Only sent when
    // the columns actually exist on the table.
    if (includeTrades) {
        if (Array.isArray(profile.trades)) row.trades = profile.trades.map(normalizeStoredTrade);
        if (Array.isArray(profile.copyTrades)) row.copy_trades = profile.copyTrades;
    }
    return row;
}

// Map Supabase row -> in-memory camelCase profile.
function rowToProfile(row) {
    const onboardedAt = typeof row.onboarded_at === 'number'
        ? row.onboarded_at
        : (row.onboarded_at ? Date.parse(row.onboarded_at) : undefined);
    const p = {
        address: row.address,
        username: row.username,
        country: (typeof row.country === 'string' && /^[A-Za-z]{2}$/.test(row.country.trim()))
            ? row.country.trim().toUpperCase()
            : undefined,
        firstName: (typeof row.first_name === 'string' && row.first_name.trim())
            ? row.first_name.trim().slice(0, 60)
            : undefined,
        lastName: (typeof row.last_name === 'string' && row.last_name.trim())
            ? row.last_name.trim().slice(0, 60)
            : undefined,
        xHandle: row.x_handle,
        xId: row.x_id,
        xConnected: row.x_connected,
        avatar: row.avatar,
        email: row.email,
        emailVerified: row.email_verified,
        verifiedEmail: row.verified_email,
        discord: row.discord,
        balance: row.balance != null ? Number(row.balance) : undefined,
        solanaWallet: parseJsonField(row.solana_wallet),
        copyTradingWallet: parseJsonField(row.copy_trading_wallet),
        copyTradingAllocated: row.copy_trading_allocated != null ? Number(row.copy_trading_allocated) : undefined,
        copyTradingPnl: row.copy_trading_pnl != null ? Number(row.copy_trading_pnl) : undefined,
        activeCopies: row.active_copies,
        accessCode: row.access_code,
        waitlistStatus: row.waitlist_status,
        appliedAt: typeof row.applied_at === 'number' ? row.applied_at : (row.applied_at ? Date.parse(row.applied_at) : undefined),
        isProvider: row.is_provider,
        providerApplication: parseJsonField(row.provider_application),
        providerStats: parseJsonField(row.provider_stats),
        providerPortfolioWallet: row.provider_portfolio_wallet,
        pendingPortfolioRevenue: row.pending_portfolio_revenue != null ? Number(row.pending_portfolio_revenue) : undefined,
        tradingWallet: row.trading_wallet,
        walletAddress: row.wallet_address,
        referralCode: row.referral_code || undefined,
        referredBy: row.referred_by || undefined,
        referredAt: typeof row.referred_at === 'number' ? row.referred_at : (row.referred_at ? Date.parse(row.referred_at) : undefined),
        referralEnrolled: row.referral_enrolled === true ? true : undefined,
        referralEnrolledAt: typeof row.referral_enrolled_at === 'number' ? row.referral_enrolled_at : (row.referral_enrolled_at ? Date.parse(row.referral_enrolled_at) : undefined),
        onboarded: row.onboarded === true || onboardedAt != null || !!row.username,
        onboardedAt,
        chainBaseline: row.chain_baseline != null ? Number(row.chain_baseline) : null,
        chainGasOwed: row.chain_gas_owed != null ? Number(row.chain_gas_owed) : null,
        createdAt: row.created_at ? Date.parse(row.created_at) : undefined,
        updatedAt: row.updated_at ? Date.parse(row.updated_at) : undefined
    };
    // Optional columns (present once added to the table).
    if (row.trades !== undefined) p.trades = row.trades;
    if (row.copy_trades !== undefined) p.copyTrades = row.copy_trades;
    return p;
}

class ProfileService {
    constructor() {
        this.profiles = {};
        this.sbFullPayload = true;       // false once optional columns are known to be missing
        this.sbChainReconAvailable = true; // false once the chain-recon columns are known to be missing
        this.sbColumnsProbed = false;
        this.sbTradeTableAvailable = null;
        this.sbIdempotencyAvailable = null; // null = unprobed, false = table missing
    this.sbReferralAvailable = null;    // same, for referral columns (009)
    this.sbRefWithdrawalsAvailable = null; // same, for referral_withdrawals (009)
    this.sbBetIdempotencyAvailable = null; // same, for placed_bets (005)
    this.sbCountryAvailable = null; // null = unprobed, false = column missing (006 not applied)
        this.sbInitPromise = null;
        this.sbLoggedDisabled = false;

        // Load from file first (local fallback snapshot)
        this.loadFromFile();

        // Then Supabase (durable store): load + one-time local→Supabase migration.
        this.initSupabase();

        // Periodic local fallback snapshot (file only — Redis is not used for profiles).
        setInterval(() => this.save(), 10000);

        // Durability outbox: replay failed registry/persistence writes until
        // the store confirms. An outage delays, never drops.
        this._durability = { unregistered: [], unsynced: [] };
        this._loadDurability();
        setInterval(() => this.replayDurability().catch(e =>
            console.warn('[Durability] replay failed:', e.message)), 20000);
    }

    _loadDurability() {
        try {
            if (fs.existsSync(OUTBOX_PATH)) {
                const data = JSON.parse(fs.readFileSync(OUTBOX_PATH, 'utf8'));
                if (Array.isArray(data.unregistered)) this._durability.unregistered = data.unregistered;
                if (Array.isArray(data.unsynced)) this._durability.unsynced = data.unsynced;
                const n = this._durability.unregistered.length + this._durability.unsynced.length;
                if (n > 0) console.log(`[Durability] Loaded ${n} pending write(s) from outbox.`);
            }
        } catch (e) {
            console.warn('[Durability] Failed to load outbox:', e.message);
        }
    }

    _saveDurability() {
        try {
            fs.writeFileSync(OUTBOX_PATH, JSON.stringify(this._durability));
        } catch (e) { /* never throw upward from bookkeeping */ }
    }

    // A placed bet that never reached the Redis open-trade registry (Redis was
    // down after the on-chain broadcast). Without this entry the settlement
    // engine has nothing to find after a restart — the trade would sit PENDING
    // forever with no verdict.
    enqueueUnregistered(trade) {
        const id = String(trade?.id || trade?.betId || '');
        if (!id) return;
        const list = this._durability.unregistered;
        if (!list.some(e => String(e.id) === id)) {
            list.push({ ...trade, id, attempts: 0, updatedAt: Date.now() });
            if (list.length > 2000) console.error('[Durability] unregistered list over 2000 — check Redis.');
            this._saveDurability();
        }
    }

    // A settled record whose Supabase upsert failed. Replayed verbatim until
    // the database confirms the write.
    enqueueUnsynced(addr, trade) {
        const id = String(trade?.id || trade?.betId || '');
        if (!id) return;
        const list = this._durability.unsynced;
        const existing = list.find(e => String(e.id) === id);
        if (existing) {
            existing.trade = trade;
            existing.updatedAt = Date.now();
        } else {
            list.push({ id, addr: String(addr || '').toLowerCase(), trade, attempts: 0, updatedAt: Date.now() });
            if (list.length > 2000) console.error('[Durability] unsynced list over 2000 — check Supabase.');
        }
        this._saveDurability();
    }

    removeDurability(id) {
        const key = String(id || '');
        if (!key) return;
        let changed = false;
        for (const listName of ['unregistered', 'unsynced']) {
            const list = this._durability[listName];
            const idx = list.findIndex(e => String(e.id) === key);
            if (idx !== -1) { list.splice(idx, 1); changed = true; }
        }
        if (changed) this._saveDurability();
    }

    async replayDurability() {
        const cache = require('./cache');
        for (const entry of [...this._durability.unregistered]) {
            try {
                if (await cache.registerOpenTrade(entry)) {
                    this.removeDurability(entry.id);
                    console.log(`[Durability] Registered #${entry.id} in open-trade set (attempt ${entry.attempts + 1}).`);
                } else {
                    entry.attempts = (entry.attempts || 0) + 1;
                    entry.updatedAt = Date.now();
                    console.warn(`[Durability] #${entry.id} still unregistered (attempt ${entry.attempts}).`);
                }
            } catch (e) {
                entry.attempts = (entry.attempts || 0) + 1;
                console.warn(`[Durability] #${entry.id} register failed:`, e.message);
            }
        }
        for (const entry of [...this._durability.unsynced]) {
            try {
                if (await this.persistTradeToSupabase(entry.addr, entry.trade, true)) {
                    this.removeDurability(entry.id);
                    console.log(`[Durability] Synced #${entry.id} to Supabase (attempt ${entry.attempts + 1}).`);
                } else {
                    entry.attempts = (entry.attempts || 0) + 1;
                    entry.updatedAt = Date.now();
                    console.warn(`[Durability] #${entry.id} still unsynced (attempt ${entry.attempts}).`);
                }
            } catch (e) {
                entry.attempts = (entry.attempts || 0) + 1;
                console.warn(`[Durability] #${entry.id} sync failed:`, e.message);
            }
        }
        this._saveDurability();
    }

    // ── Supabase durability layer ──────────────────────────────
    async initSupabase() {
        if (!SUPABASE_ENABLED) {
            if (!this.sbLoggedDisabled) {
                console.log('[Supabase] Disabled — set SUPABASE_URL + SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) to persist profiles across restarts.');
                this.sbLoggedDisabled = true;
            }
            return;
        }
        if (this.sbInitPromise) return this.sbInitPromise;
        this.sbInitPromise = (async () => {
            await this.probeSupabaseColumns();
            await this.probeSupabaseTradeTable();
            await this.probeSupabaseIdempotencyTable();
            await this.probeSupabaseBetIdempotencyTable();
            await this.probeSupabaseCountryColumn();
            if (this.sbTradeTableAvailable === null) {
                // Transient probe failure. Drop the memo so the next caller
                // retries instead of running degraded for the whole process.
                this.sbInitPromise = null;
            }
            await this.loadFromSupabase();
            await this.migrateLocalToSupabase();
        })().catch(e => {
            this.sbInitPromise = null;
            console.warn('[Supabase] Init failed, will retry:', e.message);
        });
        return this.sbInitPromise;
    }

    async probeSupabaseColumns() {
        if (this.sbColumnsProbed) return;
        this.sbColumnsProbed = true;
        try {
            const res = await supabaseRequest('/rest/v1/profiles?select=trades,copy_trades&limit=1');
            this.sbFullPayload = res.ok; // 200 = columns exist; 400 (missing column) = slim payloads
            console.log(`[Supabase] Optional columns (trades/copy_trades): ${this.sbFullPayload ? 'present' : 'NOT present — run supabase-migration.sql to persist trade history'}`);
        } catch (e) {
            this.sbFullPayload = true;
            console.warn('[Supabase] Column probe failed:', e.message);
        }
        // Referral columns (migration 009) probed separately so a missing
        // referral column never forces the wide trade payloads off.
        try {
            const refRes = await supabaseRequest('/rest/v1/profiles?select=referral_code,referred_by,referred_at,referral_enrolled,referral_enrolled_at&limit=1', { timeout: 20000 });
            this.sbReferralAvailable = refRes.ok;
            if (!refRes.ok) console.warn('[Supabase] Referral columns NOT present — run 009_referrals.sql; referral writes are disabled until then.');
        } catch (e) {
            this.sbReferralAvailable = true;
            console.warn('[Supabase] Referral column probe failed:', e.message);
        }
        // Withdrawal-request ledger (009) probed the same way.
        try {
            const wdRes = await supabaseRequest('/rest/v1/referral_withdrawals?select=id&limit=1', { timeout: 20000 });
            this.sbRefWithdrawalsAvailable = wdRes.ok;
            if (!wdRes.ok) console.warn('[Supabase] referral_withdrawals NOT present — run 009_referrals.sql; manual withdrawals are disabled until then.');
        } catch (e) {
            this.sbRefWithdrawalsAvailable = true;
            console.warn('[Supabase] Withdrawal table probe failed:', e.message);
        }
    }

    async probeSupabaseTradeTable() {
        if (!SUPABASE_ENABLED || this.sbTradeTableAvailable !== null) return;
        try {
            const res = await supabaseRequest('/rest/v1/trades?select=id&limit=1', { timeout: 20000 });
            this.sbTradeTableAvailable = res.ok;
            if (!res.ok) {
                console.warn('[Supabase] Trades table unavailable — history will use the local fallback until the migration is applied.');
            }
        } catch (e) {
            // A timeout or network blip must not latch the table off for the life
            // of the process: every trade placed afterwards would silently fail
            // to persist, so a crash would lose it. Leave the flag null so the
            // next call probes again once Supabase is reachable.
            this.sbTradeTableAvailable = null;
            console.warn('[Supabase] Trades table probe failed, will retry:', e.message);
        }
    }

    /**
     * Claim the exclusive right to credit a deposit tx hash.
     *
     * The insert IS the lock: credited_deposits.tx_hash is the primary key, so
     * a second claim of the same transfer collides (Postgres 23505) and is
     * rejected. Durable across restarts and safe across multiple instances,
     * unlike the in-process Set this replaces.
     *
     * Fails CLOSED. If the table has not been migrated yet, or Supabase cannot
     * be reached, this returns { claimed: false, reason } rather than crediting
     * on a guess — double-crediting a deposit is far worse than refusing one.
     *
     * @returns {Promise<{claimed: boolean, reason?: string}>}
     */
    async claimDeposit(txHash, userAddress, amount, source = 'fund-confirm') {
        const hash = String(txHash || '').toLowerCase();
        if (!hash) return { claimed: false, reason: 'missing-tx-hash' };
        if (!SUPABASE_ENABLED) {
            return { claimed: false, reason: 'supabase-disabled' };
        }
        if (this.sbIdempotencyAvailable === false) {
            return { claimed: false, reason: 'table-missing' };
        }
        try {
            const res = await supabaseRequest('/rest/v1/credited_deposits', {
                method: 'POST',
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json',
                    // resolve=ignore-duplicates: swallow the 23505 conflict into
                    // an empty body instead of an error, so a genuine unique
                    // violation is distinguishable from a real failure below.
                    'Prefer': 'resolution=ignore-duplicates,return=minimal'
                },
                body: JSON.stringify({
                    tx_hash: hash,
                    user_address: String(userAddress || '').toLowerCase(),
                    amount: Number(amount || 0),
                    source
                })
            });

            // 201 = we inserted and now own the credit.
            if (res.status === 201) {
                this.sbIdempotencyAvailable = true;
                return { claimed: true };
            }
            // 409 = the tx hash is already present, someone else credited it.
            if (res.status === 409) {
                this.sbIdempotencyAvailable = true;
                return { claimed: false, reason: 'already-credited' };
            }

            const text = await res.text().catch(() => '');
            if (res.status === 400 || res.status === 404 || res.status === 401 || res.status === 403) {
                // Schema/auth problems. Latch off so we do not hammer a broken
                // table, and fail closed on every later deposit.
                if (res.status === 404) this.sbIdempotencyAvailable = false;
                console.error(`[Idempotency] claimDeposit rejected (${res.status}): ${text.slice(0, 200)}`);
                return { claimed: false, reason: this.sbIdempotencyAvailable === false ? 'table-missing' : 'rejected' };
            }

            throw new Error(`claimDeposit failed (${res.status}): ${text.slice(0, 200)}`);
        } catch (e) {
            // Network blip / timeout. Do NOT latch: the table may be fine and
            // the next attempt should retry rather than fail forever.
            console.error('[Idempotency] claimDeposit error, deposit NOT credited:', e.message);
            return { claimed: false, reason: 'unavailable' };
        }
    }

    /**
     * Claim a bet id before broadcasting placeBet.
     *
     * Mirrors claimDeposit: the PRIMARY KEY on placed_bets IS the idempotency
     * key, so the insert is the lock. Whoever inserts first gets to place the
     * bet; every replay gets a 23505 conflict and must do nothing.
     *
     * Fails CLOSED. If the claim cannot be made we cannot prove the bet is not a
     * replay, and placing it anyway risks a duplicate on-chain stake and a
     * second balance deduction - a direct house loss. Refusing is the safe
     * failure; the user retries and a healthy claim succeeds.
     *
     * @returns {Promise<{claimed: boolean, reason?: string}>}
     */
    async claimBet(betId, userAddress, amount, details = {}) {
        const id = String(betId || '');
        if (!id) return { claimed: false, reason: 'missing-bet-id' };
        if (!SUPABASE_ENABLED) {
            return { claimed: false, reason: 'supabase-disabled' };
        }
        if (this.sbBetIdempotencyAvailable === false) {
            return { claimed: false, reason: 'table-missing' };
        }
        const user = String(userAddress || '').toLowerCase();
        try {
            // NOTE: do NOT add `resolution=ignore-duplicates` here. PostgREST
            // then swallows the 23505 unique violation and answers 201, which we
            // would read as "we own the bet id" - silently passing every replay
            // straight through to a second on-chain placeBet. Without it, the
            // PK conflict surfaces as 409, which is the signal we need.
            const res = await supabaseRequest('/rest/v1/placed_bets', {
                method: 'POST',
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                    bet_id: id,
                    user_address: user,
                    amount: Number(amount || 0),
                    symbol: details.symbol || null,
                    duration: details.duration ?? null,
                    status: 'PENDING'
                })
            });

            // 201 = we inserted and now own the placeBet.
            if (res.status === 201) {
                this.sbBetIdempotencyAvailable = true;
                return { claimed: true };
            }
            // 409 = this bet id already exists, so this submit is a replay.
            if (res.status === 409) {
                this.sbBetIdempotencyAvailable = true;
                // The bet id is a global key. If the existing claim belongs to a
                // different wallet this is an id collision, not a retry, and we
                // must not hand that wallet's trade back to this caller.
                const owner = await this.betIdOwner(id);
                if (owner && owner !== user) {
                    console.error(`[Idempotency] #${id} already claimed by a different wallet. Refusing.`);
                    return { claimed: false, reason: 'id-collision' };
                }
                return { claimed: false, reason: 'already-placed' };
            }

            const text = await res.text().catch(() => '');
            if (res.status === 400 || res.status === 404 || res.status === 401 || res.status === 403) {
                if (res.status === 404) this.sbBetIdempotencyAvailable = false;
                console.error(`[Idempotency] claimBet rejected (${res.status}): ${text.slice(0, 200)}`);
                return { claimed: false, reason: this.sbBetIdempotencyAvailable === false ? 'table-missing' : 'rejected' };
            }

            throw new Error(`claimBet failed (${res.status}): ${text.slice(0, 200)}`);
        } catch (e) {
            // Network blip / timeout. Do NOT latch: the next attempt should retry.
            // Still fail closed - we cannot prove this is not a replay.
            console.error('[Idempotency] claimBet error, bet NOT placed:', e.message);
            return { claimed: false, reason: 'unavailable' };
        }
    }

    // Owner of an existing bet id, or null if unknown. Used only to tell our own
    // replay apart from an id collision with another wallet.
    async betIdOwner(betId) {
        try {
            const res = await supabaseRequest(
                `/rest/v1/placed_bets?bet_id=eq.${encodeURIComponent(betId)}&select=user_address&limit=1`,
                { timeout: 10000 }
            );
            if (!res.ok) return null;
            const rows = await res.json();
            const addr = rows?.[0]?.user_address;
            return addr ? String(addr).toLowerCase() : null;
        } catch (_) {
            return null;
        }
    }

    /**
     * Resolve a single trade by bet id or stake tx hash.
     *
     * Public lookup - no owner address is known up front, which is what a shared
     * card link carries. Used by GET /trade/:id so a scanned QR (and the
     * "verify" box, which accepts either form) can find the trade.
     *
     * Returns the same record shape as getHistoryAsync so the share card
     * renders it identically to a locally-known trade.
     */
    async findTradePublic(identifier) {
        const q = String(identifier || '').trim();
        if (!q || q.length > 200) return null;
        await this.initSupabase();
        if (!this.sbTradeTableAvailable) return null;

        // Bet ids are numeric; a tx hash is 0x-prefixed hex. Only the id is
        // worth an equality probe, otherwise send it as a hash filter.
        const isBetId = /^\d+$/.test(q);
        const path = isBetId
            ? `/rest/v1/trades?select=*&id=eq.${encodeURIComponent(q)}&limit=1`
            : `/rest/v1/trades?select=*&or=(stake_tx_hash.eq.${encodeURIComponent(q)},tx_hash.eq.${encodeURIComponent(q)})&limit=1`;

        try {
            const res = await supabaseRequest(path, { timeout: 10000 });
            if (!res.ok) {
                if (res.status >= 400 && res.status < 500) this.sbTradeTableAvailable = false;
                return null;
            }
            const rows = await res.json();
            if (!Array.isArray(rows) || !rows.length) return null;
            return supabaseTradeToRecord(rows[0]);
        } catch (e) {
            console.warn('[Profiles] findTradePublic failed:', e.message);
            return null;
        }
    }

    // Record the tx hash once broadcast succeeds, and mark the final status.
    // Failure here is logged, never thrown: the claim already guarantees the
    // bet cannot be replayed, so this row is audit data, not the lock.
    async recordBetResult(betId, patch = {}) {
        const id = String(betId || '');
        if (!id || !SUPABASE_ENABLED) return;
        try {
            const body = {};
            for (const [k, v] of Object.entries(patch)) {
                if (v !== undefined && v !== null) body[k] = v;
            }
            if (!Object.keys(body).length) return;
            await supabaseRequest(`/rest/v1/placed_bets?bet_id=eq.${encodeURIComponent(id)}`, {
                method: 'PATCH',
                timeout: 10000,
                headers: { 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
                body: JSON.stringify(body)
            });
        } catch (e) {
            console.warn(`[Idempotency] recordBetResult failed for #${id}: ${e.message}`);
        }
    }

    async probeSupabaseBetIdempotencyTable() {
        if (!SUPABASE_ENABLED || this.sbBetIdempotencyAvailable !== null) return;
        try {
            const res = await supabaseRequest('/rest/v1/placed_bets?select=bet_id&limit=1', { timeout: 20000 });
            this.sbBetIdempotencyAvailable = res.ok;
            if (!res.ok) {
                console.error('[Idempotency] placed_bets table unavailable — apply supabase/migrations/005_trade_idempotency.sql. Trades will be REFUSED (not duplicated) until then.');
            } else {
                console.log('[Idempotency] placed_bets table ready — bet submits are durably idempotent.');
            }
        } catch (e) {
            this.sbBetIdempotencyAvailable = false;
            console.error('[Idempotency] placed_bets probe failed:', e.message);
        }
    }

    async probeSupabaseCountryColumn() {
        if (this.sbCountryAvailable !== null) return;
        if (!SUPABASE_ENABLED) return;
        try {
            // One probe covers country (006) and legal names (007): any 400
            // means at least one is missing, and the sync path below strips
            // all three rather than letting one unknown column 400 the row.
            const res = await supabaseRequest('/rest/v1/profiles?select=country,first_name,last_name&limit=1', { timeout: 20000 });
            this.sbCountryAvailable = res.ok;
            if (!res.ok) console.warn('[Supabase] country/name columns missing — run supabase/migrations/006_profile_country.sql and 007_profile_names.sql. Those fields skip sync until then.');
        } catch (e) {
            this.sbCountryAvailable = null; // retry on next boot, don't latch
            console.warn('[Supabase] country probe failed:', e.message);
        }
    }

    async probeSupabaseIdempotencyTable() {
        if (!SUPABASE_ENABLED || this.sbIdempotencyAvailable !== null) return;
        try {
            const res = await supabaseRequest('/rest/v1/credited_deposits?select=tx_hash&limit=1', { timeout: 20000 });
            this.sbIdempotencyAvailable = res.ok;
            if (!res.ok) {
                console.error('[Idempotency] credited_deposits table unavailable — apply supabase/migrations/004_deposit_idempotency.sql. Deposits will be REFUSED (not double-credited) until then.');
            } else {
                console.log('[Idempotency] credited_deposits table ready — deposit credits are idempotent.');
            }
        } catch (e) {
            this.sbIdempotencyAvailable = null; // retry later, do not latch
            console.warn('[Idempotency] table probe failed, will retry:', e.message);
        }
    }

    async fetchSupabaseProfiles() {
        const url = `${SUPABASE_URL}/rest/v1/profiles?select=*&limit=1000&offset=0`;
        const res = await supabaseRequest('/rest/v1/profiles?select=*&limit=1000&offset=0');
        if (!res.ok) throw new Error(`GET ${url} failed (${res.status})`);
        return await res.json();
    }

    async loadFromSupabase() {
        if (!SUPABASE_ENABLED) return 0;
        try {
            const rows = await this.fetchSupabaseProfiles();
            let merged = 0;
            for (const row of rows) {
                const addr = String(row.address || '').toLowerCase();
                if (!addr) continue;
                const remote = { ...rowToProfile(row), address: addr };
                const local = this.profiles[addr];
                // Trades merge by id with status-rank precedence (same rule as
                // getHistoryAsync). A stale remote PENDING must NEVER overwrite
                // a locally settled verdict: a boot during an outage used to
                // destroy settled trades this way, and the periodic file save
                // then cemented the regression into every store at once.
                // Profile FIELDS still take remote values; only trades merge.
                if (local && Array.isArray(local.trades) && Array.isArray(remote.trades)) {
                    const byId = new Map();
                    for (const t of remote.trades) {
                        const key = String(t?.id || t?.betId || '');
                        if (key) byId.set(key, t);
                    }
                    for (const t of local.trades) {
                        if (!isBetRecord(t)) continue;
                        const key = String(t.id || t.betId || '');
                        if (!key) continue;
                        const r = byId.get(key);
                        const lr = tradeStatusRank(t.status);
                        const rr = tradeStatusRank(r?.status);
                        const lt = Number(t.settledAt || t.timestamp || 0);
                        const rt = Number(r?.settledAt || r?.timestamp || 0);
                        if (!r || lr > rr || (lr === rr && lt >= rt)) byId.set(key, t);
                    }
                    remote.trades = Array.from(byId.values());
                }
                // Supabase values win for fields; keep local-only fields (e.g.
                // trades when the optional columns aren't present yet).
                this.profiles[addr] = { ...(local || {}), ...remote, address: addr };
                merged++;
            }
            if (merged > 0) console.log(`[Supabase] Loaded ${merged} profile(s) into cache.`);
            return merged;
        } catch (e) {
            console.warn('[Supabase] Load failed — continuing with file fallback:', e.message);
            return 0;
        }
    }

    async migrateLocalToSupabase() {
        try {
            const rows = await this.fetchSupabaseProfiles();
            const remote = new Set(rows.map(r => String(r.address || '').toLowerCase()).filter(Boolean));
            let migrated = 0;
            for (const addr of Object.keys(this.profiles)) {
                if (!remote.has(addr)) {
                    await this.syncToSupabase(addr);
                    migrated++;
                }
            }
            if (migrated > 0) console.log(`[Supabase] Migrated ${migrated} local profile(s) → Supabase.`);

            if (this.sbTradeTableAvailable) {
                let migratedTrades = 0;
                for (const addr of Object.keys(this.profiles)) {
                    const trades = this.profiles[addr].trades || [];
                    for (const trade of trades) {
                        if (await this.persistTradeToSupabase(addr, trade, true)) migratedTrades++;
                    }
                }
                if (migratedTrades > 0) console.log(`[Supabase] Migrated ${migratedTrades} local trade(s) → Supabase.`);
            }
        } catch (e) {
            console.warn('[Supabase] Initial migration failed:', e.message);
        }
    }

    async syncToSupabase(addr) {
        if (!SUPABASE_ENABLED) return false;
        const profile = this.profiles[addr];
        if (!profile) return false;

        const withRecon = this.sbChainReconAvailable !== false;
        const attempts = [
            profileToRow(profile, this.sbFullPayload !== false, true, withRecon),
            profileToRow(profile, false, true, withRecon),
            profileToRow(profile, false, true, false),
            profileToRow(profile, false, false, false)
        ];
        // Migrations 006/007 not applied (or probe never ran green): strip
        // these fields from every variant rather than letting one unknown
        // column 400 the whole profile upsert.
        if (this.sbCountryAvailable === false) {
            for (const a of attempts) { delete a.country; delete a.first_name; delete a.last_name; }
        }
        // Same protection for the referral columns (009).
        if (this.sbReferralAvailable === false) {
            for (const a of attempts) { delete a.referral_code; delete a.referred_by; delete a.referred_at; }
        }
        let lastError = '';
        for (let i = 0; i < attempts.length; i++) {
            try {
                const res = await supabaseRequest('/rest/v1/profiles?on_conflict=address', {
                    method: 'POST',
                    body: JSON.stringify(attempts[i])
                });
                if (res.ok) {
                    // Remember the widest payload that worked so later upserts
                    // stop paying for rejected round-trips.
                    if (i === 2) this.sbFullPayload = false;
                    else if (i === 3) this.sbChainReconAvailable = false;
                    // Drain the body so undici can return the socket to the pool.
                    await res.text().catch(() => {});
                    return true;
                }
                if (i === 0 && this.sbFullPayload !== false) this.sbFullPayload = false;
                lastError = `${res.status} ${await res.text().catch(() => '')}`.slice(0, 300);
            } catch (e) {
                lastError = e.message;
                // The four payload variants exist to work around a *rejected
                // column* (HTTP 400). A transport failure rejects all of them
                // identically, so stop instead of burning 4x the timeout budget
                // re-sending the same dead request.
                break;
            }
        }
        console.warn(`[Supabase] Upsert failed for ${addr}: ${lastError}`);
        return false;
    }

    loadFromFile() {
        try {
            if (fs.existsSync(FILE_PATH)) {
                const data = fs.readFileSync(FILE_PATH, 'utf8');
                if (data) {
                    this.profiles = JSON.parse(data);
                    console.log(`[Profiles] Loaded ${Object.keys(this.profiles).length} profiles from file backup.`);
                }
            }
        } catch (e) {
            console.warn('[Profiles] Failed to load from file:', e.message);
        }
    }

    saveToFile() {
        try {
            if (Object.keys(this.profiles).length > 0) {
                fs.writeFileSync(FILE_PATH, JSON.stringify(this.profiles, null, 2));
            }
        } catch (e) {
            // Silently skip file write errors
        }
    }

    async save() {
        // Local fallback snapshot only — Supabase is the durable store of record.
        this.saveToFile();
    }

    get(address) {
        return this.profiles[address.toLowerCase()];
    }

    async getAsync(address) {
        await this.initSupabase();
        return this.get(address);
    }

    getAll() {
        return this.profiles;
    }

    upsert(address, data) {
        const addr = address.toLowerCase();
        this.profiles[addr] = {
            ...(this.profiles[addr] || {}),
            ...data,
            address: addr,
            updatedAt: Date.now()
        };
        this.save().catch(e => console.warn('[Profiles] Background save failed:', e.message));
        this.syncToSupabase(addr).catch(() => {});
        return this.profiles[addr];
    }

    // Username availability. Memory first (recent, unsynced signups live here),
    // then the durable store case-insensitively. Never returns profile data,
    // only taken/free (same exposure as any availability check).
    //
    // Two modes:
    // - hint (default, strict=false): FAIL-OPEN. When the database is
    //   unreachable we report available, because this only powers the live
    //   "Available ✓" line and blocking the field on a network blip is worse
    //   than a stale hint.
    // - strict (strict=true): FAIL-CLOSED. Used by the profile write gate, where
    //   a duplicate must never slip through. If we cannot prove the name is
    //   free, report it unavailable so the caller retries instead of writing a
    //   duplicate. The DB unique index (migration 008) is the final backstop.
    async isUsernameTaken(name, excludeAddr = '', { strict = false } = {}) {
        const lower = String(name || '').trim().toLowerCase();
        if (!/^[a-z0-9_]{3,20}$/.test(lower)) return { taken: true, reason: 'format' };
        const excl = String(excludeAddr || '').toLowerCase();
        for (const addr of Object.keys(this.profiles || {})) {
            if (addr === excl) continue;
            const u = this.profiles[addr]?.username;
            if (typeof u === 'string' && u.trim().toLowerCase() === lower) {
                return { taken: true, reason: 'taken' };
            }
        }
        try {
            await this.initSupabase();
            // Supabase not configured at all: the in-memory scan above is the
            // whole store (single-instance/file mode), so it is authoritative.
            if (!SUPABASE_ENABLED) return { taken: false, degraded: true };
            const res = await supabaseRequest(
                `/rest/v1/profiles?select=address,username&username=ilike.${encodeURIComponent(lower)}&limit=5`,
                { timeout: 10000 }
            );
            if (!res.ok) return strict ? { taken: true, reason: 'unavailable' } : { taken: false, degraded: true };
            const rows = await res.json();
            const hit = (rows || []).some(r =>
                String(r.address || '').toLowerCase() !== excl &&
                String(r.username || '').trim().toLowerCase() === lower);
            return hit ? { taken: true, reason: 'taken' } : { taken: false };
        } catch (e) {
            return strict ? { taken: true, reason: 'unavailable' } : { taken: false, degraded: true };
        }
    }

    // ─── Referral program ─────────────────────────────────────────────────
    // Referral code format: 7 chars from an unambiguous alphabet (no 0/O/1/I).
    genReferralCode() {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 7; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
        return code;
    }

    // Every profile gets a referral code lazily on first use (signup or when
    // the settings screen asks for it). Uniqueness is guarded three ways:
    // the in-memory cache, a Supabase existence check, and (as the backstop)
    // the DB unique constraint — a rejected duplicate just means this attempt
    // regenerates on the next signup touch.
    async ensureReferralCode(address) {
        const addr = String(address || '').toLowerCase();
        if (!addr) return null;
        await this.initSupabase();
        if (!this.get(addr)) this.upsert(addr, {});
        const existing = this.get(addr);
        if (existing?.referralCode) return existing.referralCode;
        for (let attempt = 0; attempt < 5; attempt++) {
            const code = this.genReferralCode();
            const inUseMem = Object.values(this.profiles || {}).some(p => (p.referralCode || '').toUpperCase() === code && p.address !== addr);
            if (inUseMem) continue;
            if (SUPABASE_ENABLED) {
                try {
                    const res = await supabaseRequest(`/rest/v1/profiles?select=address&referral_code=eq.${encodeURIComponent(code)}&limit=1`, { timeout: 10000 });
                    if (res.ok) {
                        const rows = await res.json();
                        if (Array.isArray(rows) && rows.length > 0) continue; // taken in the durable store
                    }
                } catch (e) { /* fall through — the DB unique index is the backstop */ }
            }
            this.upsert(addr, { referralCode: code });
            return code;
        }
        console.warn(`[Profiles] Referral code allocation exhausted for ${addr}`);
        return null;
    }

    // Apply a referral code exactly once per user. Fail-closed on lookup:
    // if we cannot prove the referrer holds the code, nothing is written.
    async applyReferralCode(address, code) {
        const addr = String(address || '').toLowerCase();
        const refCode = String(code || '').trim().toUpperCase();
        if (!refCode) return { ok: false, status: 400, error: 'Enter a referral code' };
        await this.initSupabase();
        const profile = this.get(addr);
        if (!profile) return { ok: false, status: 404, error: 'Create your profile first' };
        if (profile.referredBy) return { ok: false, status: 409, error: 'You already used a referral code' };
        // Resolve the referrer: memory first (fresh signups live here), then
        // the durable store.
        let referrer = Object.values(this.profiles || {}).find(p => (p.referralCode || '').toUpperCase() === refCode && p.address !== addr);
        if (!referrer && SUPABASE_ENABLED) {
            try {
                const res = await supabaseRequest(`/rest/v1/profiles?select=address,username&referral_code=eq.${encodeURIComponent(refCode)}&limit=1`, { timeout: 10000 });
                if (!res.ok) return { ok: false, status: 503, error: 'Referral lookup failed, try again' };
                const rows = await res.json();
                if (Array.isArray(rows) && rows.length > 0 && String(rows[0].address || '').toLowerCase() !== addr) {
                    referrer = { address: String(rows[0].address).toLowerCase(), username: rows[0].username || null };
                }
            } catch (e) {
                return { ok: false, status: 503, error: 'Referral lookup failed, try again' };
            }
        }
        if (!referrer || referrer.address === addr) return { ok: false, status: 404, error: 'Referral code not found' };
        this.upsert(addr, { referredBy: referrer.address, referredAt: Date.now() });
        return { ok: true, referrer: referrer.address, referrerUsername: referrer.username || null };
    }

    // Commission math: the referrer earns 10% of everything their referred
    // users DEPOSIT and 10% of everything they TRADE (staked amount),
    // computed on read from the two authoritative ledgers:
    //   deposits → credited_deposits (one row per credited inflow)
    //   volume   → placed_bets      (one row per placed bet)
    async getReferralStats(address) {
        const addr = String(address || '').toLowerCase();
        await this.initSupabase();
        const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
        const DEPOSIT_COMMISSION_RATE = 0.10;
        const VOLUME_COMMISSION_RATE = 0.10;

        // 1) Referred users (memory first, then the durable store by referred_by)
        const referred = new Map();
        for (const p of Object.values(this.profiles || {})) {
            if (String(p.referredBy || '').toLowerCase() === addr) {
                referred.set(p.address, { username: p.username || null, joinedAt: p.referredAt || null });
            }
        }
        if (SUPABASE_ENABLED) {
            try {
                const res = await supabaseRequest(
                    `/rest/v1/profiles?select=address,username,referred_at&referred_by=eq.${encodeURIComponent(addr)}&order=referred_at.desc&limit=200`,
                    { timeout: 15000 }
                );
                if (res.ok) {
                    for (const r of (await res.json()) || []) {
                        const ra = String(r.address || '').toLowerCase();
                        if (!ra) continue;
                        referred.set(ra, {
                            username: r.username || null,
                            joinedAt: typeof r.referred_at === 'number' ? r.referred_at : (r.referred_at ? Date.parse(r.referred_at) : null)
                        });
                    }
                }
            } catch (e) { /* memory layer still answers */ }
        }

        const referralCode = await this.ensureReferralCode(addr);
        const addresses = Array.from(referred.keys()).filter(Boolean);
        const empty = {
            referralCode,
            count: 0,
            totalDeposits: 0,
            totalVolume: 0,
            depositCommission: 0,
            volumeCommission: 0,
            totalCommission: 0,
            referrals: []
        };
        if (addresses.length === 0) return empty;

        const inList = `in.(${addresses.map(a => a.toLowerCase()).join(',')})`;

        // 2) Deposits of referred users
        let totalDeposits = 0;
        const perUserDeposits = {};
        if (SUPABASE_ENABLED && this.sbIdempotencyAvailable !== false) {
            try {
                const res = await supabaseRequest(`/rest/v1/credited_deposits?select=user_address,amount&user_address=${inList}`, { timeout: 20000 });
                if (res.ok) {
                    for (const r of (await res.json()) || []) {
                        const ua = String(r.user_address || '').toLowerCase();
                        if (!ua) continue;
                        perUserDeposits[ua] = (perUserDeposits[ua] || 0) + Number(r.amount || 0);
                    }
                } else if (res.status >= 400 && res.status < 500) {
                    this.sbIdempotencyAvailable = false;
                }
            } catch (e) { /* deposits stay 0 rather than failing the whole stats call */ }
        }
        totalDeposits = round2(Object.values(perUserDeposits).reduce((s, v) => s + v, 0));

        // 3) Traded volume of referred users (staked amounts, bets only)
        let totalVolume = 0;
        const perUserVolume = {};
        if (SUPABASE_ENABLED && this.sbBetIdempotencyAvailable !== false) {
            try {
                const res = await supabaseRequest(`/rest/v1/placed_bets?select=user_address,amount&user_address=${inList}`, { timeout: 20000 });
                if (res.ok) {
                    for (const r of (await res.json()) || []) {
                        const ua = String(r.user_address || '').toLowerCase();
                        if (!ua) continue;
                        perUserVolume[ua] = (perUserVolume[ua] || 0) + Number(r.amount || 0);
                    }
                } else if (res.status >= 400 && res.status < 500) {
                    this.sbBetIdempotencyAvailable = false;
                }
            } catch (e) { /* volume stays 0 rather than failing the whole stats call */ }
        }
        totalVolume = round2(Object.values(perUserVolume).reduce((s, v) => s + v, 0));

        const depositCommission = round2(totalDeposits * DEPOSIT_COMMISSION_RATE);
        const volumeCommission = round2(totalVolume * VOLUME_COMMISSION_RATE);

        const referrals = addresses
            .map(a => ({
                address: a,
                username: referred.get(a)?.username || null,
                joinedAt: referred.get(a)?.joinedAt || null,
                deposits: round2(perUserDeposits[a] || 0),
                volume: round2(perUserVolume[a] || 0),
                commission: round2((perUserDeposits[a] || 0) * DEPOSIT_COMMISSION_RATE + (perUserVolume[a] || 0) * VOLUME_COMMISSION_RATE)
            }))
            .sort((a, b) => (b.joinedAt || 0) - (a.joinedAt || 0));

        return {
            referralCode,
            count: referrals.length,
            totalDeposits,
            totalVolume,
            depositCommission,
            volumeCommission,
            totalCommission: round2(depositCommission + volumeCommission),
            referrals
        };
    }

    // The ref page requires an explicit enrollment. Enrolling mints the
    // referral code (and creates a minimal profile for users who somehow
    // reached the hub before onboarding wrote one).
    async enrollReferral(address) {
        const addr = String(address || '').toLowerCase();
        if (!addr) return { ok: false, status: 400, error: 'Address required' };
        await this.initSupabase();
        this.upsert(addr, { referralEnrolled: true, referralEnrolledAt: Date.now() });
        const code = await this.ensureReferralCode(addr);
        return { ok: true, referralCode: code };
    }

    // Manual withdrawal of referral commission. NOT on-chain, NO auto payout:
    // a request is a pending row an admin processes. The spendable balance is
    // derived on read — total computed commission minus every non-rejected
    // request — so approving/rejecting never double-spends.
    static REF_MIN_WITHDRAWAL = 25;
    async refAvailableCommission(address) {
        const addr = String(address || '').toLowerCase();
        const stats = await this.getReferralStats(addr);
        let owed = stats.totalCommission || 0;
        let paidOrPending = 0;
        if (SUPABASE_ENABLED && this.sbRefWithdrawalsAvailable !== false) {
            try {
                const res = await supabaseRequest(
                    `/rest/v1/referral_withdrawals?select=amount&user_address=eq.${encodeURIComponent(addr)}&status=in.(pending,paid)`,
                    { timeout: 15000 }
                );
                if (res.ok) {
                    for (const r of (await res.json()) || []) paidOrPending += Number(r.amount || 0);
                } else if (res.status >= 400 && res.status < 500) {
                    this.sbRefWithdrawalsAvailable = false;
                }
            } catch (e) { /* treat as 0 owed-out rather than failing */ }
        }
        return { stats, available: Math.max(0, Math.round((owed - paidOrPending) * 100) / 100) };
    }

    async requestRefWithdrawal(address, amount) {
        const addr = String(address || '').toLowerCase();
        const amt = Math.round((Number(amount) || 0) * 100) / 100;
        if (!addr) return { ok: false, status: 400, error: 'Address required' };
        if (!(amt > 0)) return { ok: false, status: 400, error: 'Enter an amount' };
        await this.initSupabase();
        const profile = this.get(addr);
        if (!profile?.referralEnrolled) return { ok: false, status: 403, error: 'Enroll in the referral program first' };
        const { available } = await this.refAvailableCommission(addr);
        if (available < ProfileService.REF_MIN_WITHDRAWAL) {
            return { ok: false, status: 400, error: `Minimum withdrawal is $${ProfileService.REF_MIN_WITHDRAWAL}.00 USDC` };
        }
        if (amt > available) {
            return { ok: false, status: 400, error: `Only $${available.toFixed(2)} available to withdraw` };
        }
        const row = {
            user_address: addr,
            amount: amt,
            status: 'pending',
            requested_at: new Date().toISOString()
        };
        if (SUPABASE_ENABLED && this.sbRefWithdrawalsAvailable !== false) {
            try {
                const res = await supabaseRequest('/rest/v1/referral_withdrawals', {
                    method: 'POST',
                    body: JSON.stringify([row]),
                    headers: { Prefer: 'return=representation,resolution=merge-duplicates' }
                });
                if (!res.ok) {
                    if (res.status >= 400 && res.status < 500) this.sbRefWithdrawalsAvailable = false;
                    throw new Error(`withdrawal insert failed: ${res.status} ${await res.text().catch(() => '')}`.slice(0, 200));
                }
                const rows = await res.json().catch(() => []);
                return { ok: true, withdrawal: Array.isArray(rows) && rows[0] ? rows[0] : row };
            } catch (e) {
                // Memory ledger (fresh deployments before migration) — still
                // record server-side so the request isn't silently lost.
                return { ok: false, status: 503, error: 'Withdrawals ledger unavailable — run migration 009' };
            }
        }
        return { ok: false, status: 503, error: 'Withdrawals ledger unavailable — run migration 009' };
    }

    async getRefWithdrawals(address) {
        const addr = String(address || '').toLowerCase();
        if (SUPABASE_ENABLED && this.sbRefWithdrawalsAvailable !== false) {
            try {
                const res = await supabaseRequest(
                    `/rest/v1/referral_withdrawals?select=*&user_address=eq.${encodeURIComponent(addr)}&order=requested_at.desc&limit=50`,
                    { timeout: 15000 }
                );
                if (res.ok) return (await res.json()) || [];
                if (res.status >= 400 && res.status < 500) this.sbRefWithdrawalsAvailable = false;
            } catch (e) { /* fall through */ }
        }
        return [];
    }

    async getAdminRefWithdrawals() {
        if (SUPABASE_ENABLED && this.sbRefWithdrawalsAvailable !== false) {
            try {
                const res = await supabaseRequest(
                    '/rest/v1/referral_withdrawals?select=*&order=requested_at.desc&limit=200',
                    { timeout: 20000 }
                );
                if (res.ok) {
                    const rows = (await res.json()) || [];
                    // Best-effort username decoration from the profile cache/DB.
                    const withNames = await Promise.all(rows.map(async r => {
                        let username = null;
                        try {
                            const p = this.get(String(r.user_address || '').toLowerCase())
                                || await this.getAsync(String(r.user_address || '').toLowerCase());
                            username = p?.username || null;
                        } catch (e) {}
                        return { ...r, username };
                    }));
                    return withNames;
                }
                if (res.status >= 400 && res.status < 500) this.sbRefWithdrawalsAvailable = false;
            } catch (e) { /* fall through */ }
        }
        return [];
    }

    async setRefWithdrawalStatus(id, status) {
        if (!['paid', 'rejected'].includes(status)) return { ok: false, status: 400, error: 'Invalid status' };
        if (SUPABASE_ENABLED && this.sbRefWithdrawalsAvailable !== false) {
            try {
                const res = await supabaseRequest(
                    `/rest/v1/referral_withdrawals?id=eq.${encodeURIComponent(id)}`,
                    {
                        method: 'PATCH',
                        body: JSON.stringify({ status, processed_at: new Date().toISOString() })
                    }
                );
                if (res.ok) return { ok: true };
                if (res.status >= 400 && res.status < 500) this.sbRefWithdrawalsAvailable = false;
                return { ok: false, status: 502, error: `update failed: ${res.status}` };
            } catch (e) {
                return { ok: false, status: 502, error: e.message };
            }
        }
        return { ok: false, status: 503, error: 'Withdrawals ledger unavailable — run migration 009' };
    }

    async getHistoryAsync(address) {
        const addr = address.toLowerCase();
        await this.initSupabase();
        if (!this.sbTradeTableAvailable) return this.getHistory(addr);

        try {
            const res = await supabaseRequest(`/rest/v1/trades?select=*&user_address=eq.${encodeURIComponent(addr)}&order=timestamp.desc&limit=100`);
            if (!res.ok) {
                if (res.status >= 400 && res.status < 500) this.sbTradeTableAvailable = false;
                return this.getHistory(addr);
            }
            const rows = await res.json();
            const byId = new Map();
            for (const trade of (rows || []).map(supabaseTradeToRecord)) {
                if (!isBetRecord(trade)) continue;
                const key = String(trade.id || trade.betId || '');
                if (key) byId.set(key, trade);
            }
            for (const trade of this.getHistory(addr)) {
                if (!isBetRecord(trade)) continue;
                const key = String(trade.id || trade.betId || '');
                if (!key) continue;
                const remote = byId.get(key);
                const localRank = tradeStatusRank(trade.status);
                const remoteRank = tradeStatusRank(remote?.status);
                const localTime = Number(trade.settledAt || trade.timestamp || 0);
                const remoteTime = Number(remote?.settledAt || remote?.timestamp || 0);
                if (!remote || localRank > remoteRank || (localRank === remoteRank && localTime >= remoteTime)) {
                    byId.set(key, trade);
                }
            }
            const trades = Array.from(byId.values())
                .sort((a, b) => (b.timestamp || b.settledAt || 0) - (a.timestamp || a.settledAt || 0))
                .slice(0, 100);
            this.profiles[addr] = {
                ...(this.profiles[addr] || { address: addr }),
                trades
            };
            return trades;
        } catch (e) {
            console.warn(`[Supabase] History read failed for ${addr}:`, e.message);
            return this.getHistory(addr);
        }
    }

    /**
     * Move a bet to a real terminal status without deleting the row.
     *
     * The audit trail is the point: these rows are the only evidence of what
     * happened to a user's stake, and of why a trade got stuck. Deleting them
     * would destroy that AND leave the debited stake unreturned, so the user
     * loses the money and the record at once.
     *
     * Updates the in-memory record, the local snapshot and Supabase. payout is
     * forced to 0 because the client treats any settled row with a non-zero
     * payout as a win, and a voided trade is not a win.
     *
     * @returns {Promise<boolean>} false if the row could not be located
     */
    async markTradeResolved(betId, userAddress, { status = 'CANCELLED', reason = 'admin-resolved' } = {}) {
        const id = String(betId || '');
        if (!id) return false;

        // Prefer the address that owns the row; fall back to scanning so an
        // operator does not have to know it.
        let addr = String(userAddress || '').toLowerCase();
        const findIn = (a) => {
            const trades = this.profiles[a]?.trades;
            if (!Array.isArray(trades)) return null;
            return trades.find(t => String(t.id || t.betId || '') === id) || null;
        };
        let trade = addr ? findIn(addr) : null;
        if (!trade) {
            for (const a of Object.keys(this.profiles || {})) {
                const hit = findIn(a);
                if (hit) { trade = hit; addr = a; break; }
            }
        }
        if (!trade) return false;

        Object.assign(trade, {
            status,
            won: false,
            payout: 0,
            settledAt: Date.now(),
            resolutionReason: reason
        });
        this.saveToFile();

        if (SUPABASE_ENABLED) {
            try {
                await this.initSupabase();
                if (this.sbTradeTableAvailable) {
                    const res = await supabaseRequest(
                        `/rest/v1/trades?id=eq.${encodeURIComponent(id)}`,
                        {
                            method: 'PATCH',
                            headers: { Prefer: 'return=minimal' },
                            body: JSON.stringify({
                                status,
                                won: false,
                                payout: 0,
                                settled_at: Date.now()
                            })
                        }
                    );
                    if (!res.ok) {
                        console.warn(`[Profiles] markTradeResolved DB update failed for ${id}: ${res.status}`);
                        return false;
                    }
                }
            } catch (e) {
                console.warn(`[Profiles] markTradeResolved DB error for ${id}:`, e.message);
                return false;
            }
        }
        console.log(`[Profiles] Trade ${id} for ${addr} resolved as ${status} (${reason})`);
        return true;
    }

    /**
     * Money the platform still owes a user.
     *
     *
     * cache.trades is in-memory, so a restart orphans any trade that was open
     * at the time: the monitor never sees it and the client polls a PENDING row
     * that nothing will ever settle. Trades are written here the moment they
     * are placed, so this is the record used to put those orphans back.
     */
    async getUnsettledTradesAsync() {
        await this.initSupabase();

        // ── Durable fallback: Redis, then the local snapshot ───────────────
        // Returning [] here used to be the single worst line in the settlement
        // path. cache.trades is in-memory, so the ONLY way a trade that was open
        // at shutdown comes back is this function. When Supabase was
        // unreachable it returned an empty list, which is indistinguishable from
        // "there is nothing to recover" - so every open trade was silently
        // abandoned in the database and nothing could ever settle it. The user
        // saw a permanently PENDING trade with no way out and no explanation.
        //
        // Redis is the primary fallback: it is shared across instances and
        // survives a redeploy, so a Supabase outage degrades settlement to
        // "slower", never to "stopped". The on-disk profile snapshot is the last
        // resort for a cold start where Redis is also unreachable.
        if (!SUPABASE_ENABLED || !this.sbTradeTableAvailable) {
            const recovered = await this.recoverUnsettledFromFallbacks('Supabase unavailable');
            return recovered;
        }

        try {
            const res = await supabaseRequest(
                '/rest/v1/trades?select=*&status=in.(PENDING,RESOLVING)&order=timestamp.asc&limit=500',
                { timeout: 20000 }
            );
            if (!res.ok) {
                // A failed read must never look like "nothing to do".
                console.warn(`[Recovery] Unsettled scan failed (${res.status}) — using fallbacks.`);
                return this.recoverUnsettledFromFallbacks(`scan returned ${res.status}`);
            }
            const rows = await res.json();
            const remote = (rows || []).map(supabaseTradeToRecord);
            // Merge the fallbacks too, so a trade whose write never landed is
            // still recovered rather than lost between the stores.
            return this.mergeUnsettled(remote, await this.collectUnsettledFallbacks());
        } catch (e) {
            console.warn('[Supabase] Unsettled trade recovery failed:', e.message, '— using fallbacks.');
            return this.recoverUnsettledFromFallbacks(e.message);
        }
    }

    // Redis open-trade registry first, then the local snapshot. Never throws.
    async collectUnsettledFallbacks() {
        const out = [];
        try {
            const cache = require('./cache');
            const open = await cache.listOpenTrades();
            for (const t of open) {
                const status = String(t.status || '').toUpperCase();
                if (status !== 'PENDING' && status !== 'RESOLVING') continue;
                if (!isBetRecord(t)) continue;
                out.push({ ...t, recoverySource: 'redis' });
            }
        } catch (e) {
            console.warn('[Recovery] Redis open-trade read failed:', e.message);
        }
        for (const t of this.getUnsettledFromMemory()) {
            out.push({ ...t, recoverySource: 'snapshot' });
        }
        return out;
    }

    async recoverUnsettledFromFallbacks(why) {
        const rows = await this.collectUnsettledFallbacks();
        if (rows.length) {
            console.warn(`[Recovery] ${why} — recovered ${rows.length} unsettled trade(s) from durable storage.`);
        }
        return rows;
    }

    // Union by bet id, remote first. Only PENDING/RESOLVING qualify: a DISPUTE
    // trade is waiting on an admin, so handing it back to the automatic settler
    // would only spin it.
    mergeUnsettled(remote, fallbacks) {
        const byId = new Map();
        for (const t of remote) {
            const key = String(t.id || t.betId || '');
            const status = String(t.status || '').toUpperCase();
            if (key && (status === 'PENDING' || status === 'RESOLVING')) byId.set(key, t);
        }
        for (const t of fallbacks) {
            const key = String(t.id || t.betId || '');
            if (key && !byId.has(key)) byId.set(key, t);
        }
        return Array.from(byId.values());
    }

    // Unsettled bets held in the in-memory / on-disk profile snapshot. Same
    // eligibility as the SQL scan, so the two sources are interchangeable.
    getUnsettledFromMemory() {
        const out = [];
        const seen = new Set();
        for (const addr of Object.keys(this.profiles || {})) {
            const trades = this.profiles[addr]?.trades;
            if (!Array.isArray(trades)) continue;
            for (const t of trades) {
                if (!t || !isBetRecord(t)) continue;
                const status = String(t.status || '').toUpperCase();
                if (status !== 'PENDING' && status !== 'RESOLVING') continue;
                const key = String(t.id || t.betId || '');
                if (!key || seen.has(key)) continue;
                seen.add(key);
                out.push({ ...t, userAddr: t.userAddr || addr });
            }
        }
        return out;
    }

    async persistTradeToSupabase(address, trade, skipInit = false) {
        if (!SUPABASE_ENABLED) return false;
        if (!skipInit) await this.initSupabase();
        if (!this.sbTradeTableAvailable) return false;
        const addr = address.toLowerCase();
        if (!this.profiles[addr]) return false;

        // The profile row and the trade row are independent tables, so a failed
        // profile upsert must NOT gate the trade insert. It used to: one dropped
        // connection during syncToSupabase made this return false before the
        // trade was ever attempted, and the trade then never reached the `trades`
        // table at all - so it silently vanished from history. Best-effort now.
        await this.syncToSupabase(addr);

        try {
            const res = await supabaseRequest('/rest/v1/trades?on_conflict=id', {
                method: 'POST',
                headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
                body: JSON.stringify(tradeToSupabaseRow(addr, trade))
            });
            if (!res.ok) {
                console.warn(`[Supabase] Trade upsert failed for ${addr}: ${res.status} ${await res.text().catch(() => '')}`.slice(0, 350));
                return false;
            }
            // Drain the body so undici can release the socket back to the pool.
            // Skipping it leaves the connection occupied until GC.
            await res.text().catch(() => {});
            return true;
        } catch (e) {
            console.warn(`[Supabase] Trade upsert error for ${addr}:`, e.message);
            return false;
        }
    }

    pushTrade(address, trade) {
        const addr = address.toLowerCase();
        if (!this.profiles[addr]) {
            this.profiles[addr] = { address: addr, trades: [], createdAt: Date.now() };
        }
        if (!this.profiles[addr].trades) {
            this.profiles[addr].trades = [];
        }

        const tradeId = String(trade.betId || trade.id || `${trade.type || 'record'}-${trade.timestamp || Date.now()}-${addr.slice(-8)}`);
        const record = normalizeStoredTrade({
            ...trade,
            id: trade.id || tradeId,
            betId: trade.betId || tradeId,
            status: trade.status || (trade.won ? 'WON' : 'LOST'),
            timestamp: trade.timestamp || Date.now()
        });
        const exists = this.profiles[addr].trades.some(t => String(t.betId || t.id) === tradeId);

        if (!exists) {
            this.profiles[addr].trades.unshift(record);
            if (this.profiles[addr].trades.length > 100) {
                this.profiles[addr].trades = this.profiles[addr].trades.slice(0, 100);
            }
        } else {
            const idx = this.profiles[addr].trades.findIndex(t => String(t.betId || t.id) === tradeId);
            this.profiles[addr].trades[idx] = { ...this.profiles[addr].trades[idx], ...record };
        }

        this.profiles[addr].updatedAt = Date.now();
        this.save().catch(e => console.warn('[Profiles] Background save failed:', e.message));
        return this.persistTradeToSupabase(addr, record)
            .catch(e => {
                console.warn(`[Supabase] Trade persistence failed for ${addr}:`, e.message);
                return false;
            })
            .then((ok) => {
                // A settled record that missed the database must be replayed,
                // not dropped: enqueue it so the replayer keeps trying until
                // Supabase confirms. Non-terminal records re-persist on every
                // later write of the same trade, so they need no entry.
                if (tradeStatusRank(record.status) >= 4) {
                    if (ok) this.removeDurability(record.id || record.betId);
                    else this.enqueueUnsynced(addr, record);
                }
                return record;
            });
    }

    updateTrade(address, betId, updates) {
        const addr = address.toLowerCase();
        const profile = this.profiles[addr];
        if (!profile || !profile.trades) return false;

        const tradeIdx = profile.trades.findIndex(t => String(t.betId || t.id) === String(betId));
        if (tradeIdx === -1) return false;

        profile.trades[tradeIdx] = {
            ...profile.trades[tradeIdx],
            ...updates
        };

        profile.updatedAt = Date.now();
        this.save().catch(e => console.warn('[Profiles] Background save failed:', e.message));
        this.persistTradeToSupabase(addr, profile.trades[tradeIdx])
            .then((ok) => {
                const rec = profile.trades[tradeIdx];
                if (tradeStatusRank(rec?.status) >= 4) {
                    if (ok) this.removeDurability(rec.id || rec.betId);
                    else this.enqueueUnsynced(addr, rec);
                }
            })
            .catch(() => {});
        return true;
    }

    getHistory(address) {
        const profile = this.get(address);
        return profile ? (profile.trades || []) : [];
    }

    pushCopyTrade(address, trade) {
        const addr = address.toLowerCase();
        if (!this.profiles[addr]) {
            this.profiles[addr] = { address: addr, copyTrades: [], createdAt: Date.now() };
        }
        if (!this.profiles[addr].copyTrades) {
            this.profiles[addr].copyTrades = [];
        }

        const record = {
            id: trade.id || `ct-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            providerAddress: trade.providerAddress?.toLowerCase() || '',
            providerName: trade.providerName || '',
            asset: trade.asset || '',
            direction: trade.direction || 'UP',
            result: trade.result || 'PENDING',
            amount: trade.amount || 0,
            providerTradeId: trade.providerTradeId || '',
            payout: trade.payout || 0,
            settledAt: trade.settledAt || 0,
            timestamp: trade.timestamp || Date.now()
        };

        this.profiles[addr].copyTrades.unshift(record);
        if (this.profiles[addr].copyTrades.length > 200) {
            this.profiles[addr].copyTrades = this.profiles[addr].copyTrades.slice(0, 200);
        }

        this.profiles[addr].updatedAt = Date.now();
        this.save().catch(e => console.warn('[Profiles] Background save failed:', e.message));
        this.syncToSupabase(addr).catch(() => {});
        return record;
    }

    getCopyTrades(address) {
        const profile = this.get(address);
        return profile ? (profile.copyTrades || []) : [];
    }

    getProfileStats(address, history = null) {
        const trades = history || this.getHistory(address);
        let totalWins = 0;
        let totalVolume = 0;

        trades.forEach(t => {
            if (t.won || t.status === 'WON') totalWins++;
            totalVolume += parseFloat(t.amount || 0);
        });

        return {
            totalTrades: trades.length,
            totalWins,
            totalVolume
        };
    }

    getGlobalStats() {
        let bulls = 0;
        let bears = 0;
        let totalStake = 0;
        let vol = 0;
        let totalWins = 0;
        let totalTrades = 0;
        let allTrades = [];

        let totalRevenue = 0;
        for (const addr in this.profiles) {
            const history = this.profiles[addr].trades || [];
            totalTrades += history.length;

            for (const trade of history) {
                const amt = parseFloat(trade.amount || 0);
                const fee = parseFloat(trade.fee || 0);
                if (String(trade.direction).toUpperCase().includes("UP") || trade.direction === 1) bulls++;
                else bears++;

                totalStake += amt;
                vol += amt;
                totalRevenue += fee;
                if (trade.won || trade.status === 'WON') totalWins++;

                allTrades.push(trade);
            }
        }

        const total = bulls + bears;

        allTrades.sort((a, b) => (b.timestamp || b.settledAt || 0) - (a.timestamp || a.settledAt || 0));

        return {
            bullBearRatio: total > 0 ? Math.round((bulls / total) * 100) : 50,
            sentiment: total > 0 ? (bulls > bears ? 'BULLISH' : bulls < bears ? 'BEARISH' : 'NEUTRAL') : 'NEUTRAL',
            avgStake: total > 0 ? (totalStake / total).toFixed(2) : '0.00',
            totalVolume: vol.toFixed(2),
            platformRevenue: totalRevenue.toFixed(6),
            activeTraders: Object.keys(this.profiles).length,
            globalWinRate: totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(1) : '0.0',
            totalTrades,
            recentTrades: allTrades.slice(0, 50),
            bullsInfo: bulls,
            bearsInfo: bears
        };
    }
}

module.exports = new ProfileService();
