// ============================================================
// nexus-core/src/cache.js
// In-process cache layer for the unified backend.
// ============================================================
// Local-first by design: every cache lives in server memory, so there is no
// connection to fail, no handshake to time out, no external dependency in any
// hot path. The open-trade registry additionally persists to a local file so
// it survives restarts (Supabase rows + this file are the recovery sources).
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OPEN_TRADES_PATH = path.join(DATA_DIR, 'open-trades.json');

try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) { }

class Cache {
  constructor() {
    this.sessions = new Map(); // address/identityKey -> session object
    this.trades = new Map(); // tradeId -> trade object
    this.userHistory = new Map(); // address -> array of history records
    // Settled-result cache: tradeId -> { result, exp }. Best-effort and
    // memory-only by nature (1h TTL); a restart simply starts it empty.
    this.tradeResults = new Map();
    // Balance snapshots: addr -> { bal, exp }. Served instantly without a
    // chain read; 24h TTL like the old snapshot store.
    this.sessionSnapshots = new Map();
    // Durable open-trade registry, loaded once below.
    this.openTradesStore = this._loadRegistry();
    
    // In-memory queues (unused)
    this.settlementQueue = [];
    
    // Market data
    // Market data
    this.prices = { btc: 0, eth: 0, sol: 0, mon: 0, avax: 0 };
    this.priceMeta = {
      btc: { updatedAt: 0 },
      eth: { updatedAt: 0 },
      sol: { updatedAt: 0 },
      mon: { updatedAt: 0 },
      avax: { updatedAt: 0 },
    };
    
    // Rounds state
    this.roundsState = new Map();

    // Price History (Stable settlement buffer)
    this.priceHistory = {}; // key -> array of {price, time}

    // 24h change calculation — 5-minute rolling window snapshots
    this.dailySnapshots = {}; // key -> array of {price, time} (max 288 = 24h at 5min intervals)
    this.lastSnapshotMinute = 0;

    // Binance-sourced 24h changes (instant, no warmup needed)
    this.binance24h = {}; // key -> percentage change number

    // Last successfully polled price per asset — survives transient API
    // failures so cache.prices never drops to 0 (priceService.js writes these).
    this.lastPollPrice = {}; // key -> last successful price
    this.lastPollTime = {}; // key -> last successful poll timestamp

    // Latest odds computed by the Odds Engine (read by the classic engine).
    this.liveOdds = {}; // symbol -> { duration -> multiplier }
  }

  /**
   * Take 5-minute rolling window snapshots for 24h change calculation.
   * Used for assets without Binance pairs (e.g. MON).
   * Called every 60s, stores once per 5 minutes.
   */
  takeDailySnapshot() {
    const now = Date.now();
    const currentMinute = Math.floor(now / 60000);
    if (currentMinute === this.lastSnapshotMinute) return;
    // Only store every 5 minutes
    if (currentMinute % 5 !== 0) return;
    this.lastSnapshotMinute = currentMinute;

    for (const key of Object.keys(this.prices)) {
      const price = this.prices[key];
      if (!price || price <= 0) continue;
      if (!this.dailySnapshots[key]) this.dailySnapshots[key] = [];
      this.dailySnapshots[key].push({ price, time: now });
      // Keep 288 entries (24h at 5min intervals)
      if (this.dailySnapshots[key].length > 288) this.dailySnapshots[key].shift();
    }
  }

  /**
   * Store a Binance-sourced 24h percentage change (instant, no warmup).
   */
  setBinance24h(key, change) {
    this.binance24h[key] = change;
  }

  /**
   * Calculate 24h % change.
   * Prefers Binance-sourced data (instant). Falls back to rolling window.
   * Returns the percentage change, or null if no data available.
   */
  get24hChange(key) {
    // Prefer Binance 24h ticker data (instant, accurate)
    if (this.binance24h[key] !== undefined && this.binance24h[key] !== null) {
      return this.binance24h[key];
    }

    // Fallback: rolling window snapshots (for assets without Binance pairs)
    const snaps = this.dailySnapshots[key];
    if (!snaps || snaps.length < 2) return null;
    const oldest = snaps[0];
    const current = this.prices[key];
    if (!current || !oldest.price || oldest.price <= 0) return null;
    return ((current - oldest.price) / oldest.price) * 100;
  }

  /**
   * Snapshot the current price into the high-resolution history buffer.
   * Called every 250ms so we get ~4 captures per second around expiry.
   */
  snapshotPrice(key) {
    const price = this.prices[key];
    if (!price || price <= 0) return;
    if (!this.priceHistory[key]) this.priceHistory[key] = [];
    const now = Date.now();
    this.priceHistory[key].push({ price, time: now });
    // Keep 20 minutes of 250ms snapshots ≈ 4800 entries per asset
    if (this.priceHistory[key].length > 4800) this.priceHistory[key].shift();
  }

  /**
   * Return the most recently captured price from the history buffer.
   * Used as a zero-latency fallback when no historical match is found.
   */
  getLatestPrice(key) {
    const history = this.priceHistory[key];
    if (!history || history.length === 0) return this.prices[key] || 0;
    return history[history.length - 1].price;
  }

  /**
   * Find the historical price at (or just before) `targetTime`.
   *
   * SETTLEMENT ACCURACY: for a PAST target (the normal trade-settlement path),
   * this NEVER returns a snapshot captured after `targetTime`. The price feed
   * keeps streaming past the countdown, so a "closest match" can land on a
   * post-expiry capture and flip a trade that was won the instant the timer
   * hit 0. We therefore lock to the LAST snapshot at-or-before the target.
   */
  getHistoricalPrice(key, targetTime) {
    const history = this.priceHistory[key];
    if (!history || history.length === 0) return this.prices[key] || 0;

    if (targetTime < Date.now()) {
      // Past target — settlement. Use the last capture at or before the target
      // so the exit price is locked at the countdown end, never beyond it.
      let lastAtOrBefore = null;
      for (const entry of history) {
        if (entry.time <= targetTime && (!lastAtOrBefore || entry.time >= lastAtOrBefore.time)) {
          lastAtOrBefore = entry;
        }
      }
      if (lastAtOrBefore) {
        const gap = targetTime - lastAtOrBefore.time;
        if (gap > 1000) {
          console.warn(`[Cache] Large gap (${gap}ms) for ${key} at ${targetTime}. Locking to last known price before expiry.`);
        }
        return lastAtOrBefore.price;
      }
      // No capture before the target yet — fall through to closest match below.
    }

    // Future / current target (live estimates): pick the closest capture.
    let closest = history[0];
    let minDiff = Math.abs(targetTime - closest.time);
    for (const entry of history) {
      const diff = Math.abs(targetTime - entry.time);
      if (diff < minDiff) {
        minDiff = diff;
        closest = entry;
      }
    }
    return closest.price;
  }

  // --- Classic Trade Helpers ---
  
  getOrCreateSession(identityKey, defaultData) {
    if (!this.sessions.has(identityKey)) {
      this.sessions.set(identityKey, defaultData);
    }
    return this.sessions.get(identityKey);
  }

  pushHistory(userAddr, trade) {
    const profiles = require('./profiles');
    return profiles.pushTrade(userAddr, trade);
  }

  getHistory(userAddr) {
    const profiles = require('./profiles');
    return profiles.getHistory(userAddr);
  }

  // --- Rounds Helpers ---
  
  getRoundState(asset) {
    if (!this.roundsState.has(asset)) {
      this.roundsState.set(asset, { live: null, next: { pools: { long: 1.0, short: 1.0, participants: 0 } } });
    }
    return this.roundsState.get(asset);
  }

  setRoundState(asset, state) {
    this.roundsState.set(asset, state);
  }

  // --- Trade Result Caching (memory, 1h TTL) ---
  // Pre-locks the result (exit price + won/lost) so the backend
  // settler can read it instantly when the countdown hits 0.

  async cacheTradeResult(tradeId, result) {
    try {
      const id = String(tradeId || '');
      if (!id) return;
      this.tradeResults.set(id, { result, exp: Date.now() + 3600 * 1000 });
      if (this.tradeResults.size > 5000) {
        const oldest = this.tradeResults.keys().next().value;
        this.tradeResults.delete(oldest);
      }
    } catch (e) {}
  }

  async getCachedTradeResult(tradeId) {
    try {
      const entry = this.tradeResults.get(String(tradeId || ''));
      if (!entry) return null;
      if (Date.now() > entry.exp) {
        this.tradeResults.delete(String(tradeId || ''));
        return null;
      }
      return entry.result;
    } catch (e) {
      return null;
    }
  }

  async deleteCachedTradeResult(tradeId) {
    try {
      this.tradeResults.delete(String(tradeId || ''));
    } catch (e) {}
  }

  // --- Durable Open-Trade Registry (local file) ---
  //
  // Every bet that has been broadcast but not yet given a final verdict.
  //
  // cache.trades is memory-only, so after a restart the settlement engine has
  // no working set at all and the only way an open trade can come back is a
  // durable store. This file is that store: written on every mutation, so a
  // restart loses nothing, with zero network involved. Keyed by bet id, so
  // both operations stay idempotent: re-registering overwrites, resolving
  // removes.

  _loadRegistry() {
    try {
      if (fs.existsSync(OPEN_TRADES_PATH)) {
        const data = JSON.parse(fs.readFileSync(OPEN_TRADES_PATH, 'utf8'));
        if (data && typeof data === 'object') return data;
      }
    } catch (e) {
      console.warn('[Registry] Failed to load open-trades file:', e.message);
    }
    return {};
  }

  _saveRegistry() {
    try {
      fs.writeFileSync(OPEN_TRADES_PATH, JSON.stringify(this.openTradesStore));
    } catch (e) {
      console.warn('[Registry] Failed to save open-trades file:', e.message);
    }
  }

  async registerOpenTrade(trade) {
    try {
      const id = String(trade?.id || trade?.betId || '');
      if (!id) return false;
      this.openTradesStore[id] = {
        id,
        userAddr: trade.userAddr,
        symbol: trade.symbol,
        amount: trade.amount,
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        duration: trade.duration,
        settleAt: trade.settleAt,
        timestamp: trade.timestamp || Date.now(),
        status: trade.status || 'PENDING',
        sessionAddress: trade.sessionAddress,
        stakeTxHash: trade.stakeTxHash || null
      };
      this._saveRegistry();
      return true;
    } catch (e) {
      // Never throw upward: losing the registry must not block placing a trade.
      console.warn('[Registry] registerOpenTrade failed:', e.message);
      return false;
    }
  }

  // Awaited registration with bounded retries for the placement path. A trade
  // that never reaches this set is invisible to every recovery mechanism, so
  // placement must know whether it landed — never fire-and-forget.
  async registerOpenTradeWithRetry(trade, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 300 * attempt));
      if (await this.registerOpenTrade(trade)) return true;
    }
    return false;
  }

  // A trade has reached a final state (settled, cancelled, or parked in dispute)
  // and no longer needs the recovery sweep to find it.
  async resolveOpenTrade(betId) {
    try {
      const id = String(betId || '');
      if (!id) return;
      if (this.openTradesStore[id]) {
        delete this.openTradesStore[id];
        this._saveRegistry();
      }
    } catch (e) {}
  }

  // Everything currently awaiting a verdict. Entries are re-registered on every
  // place, so this reflects the live working set.
  async listOpenTrades() {
    try {
      return Object.entries(this.openTradesStore || {})
        .map(([id, record]) => {
          if (!record || typeof record !== 'object') return null;
          return { ...record, id: String(record.id || id) };
        })
        .filter(t => t && t.id);
    } catch (e) {
      console.warn('[Registry] listOpenTrades failed:', e.message);
      return [];
    }
  }

  // Drop registry entries that are no longer awaiting a verdict. The settle path
  // removes them inline; this is the backstop that stops the hash growing without
  // bound if a removal was lost (e.g. the process died between settle and HDEL).
  async pruneOpenTrades(isTerminal) {
    try {
      const rows = await this.listOpenTrades();
      const stale = rows.filter(t => isTerminal(t));
      if (!stale.length) return 0;
      for (const t of stale) delete this.openTradesStore[String(t.id)];
      this._saveRegistry();
      return stale.length;
    } catch (e) {
      return 0;
    }
  }

  // --- Session Snapshot (memory, 24h TTL) ---
  //
  // The last known good trading balance per user, so a cold instance can answer
  // /session/balance immediately instead of waiting on a chain read. Deliberately
  // NOT a client-side cache: localStorage is per-device, so a phone and a desktop
  // would each show their own number and disagree until the next server response.
  // One shared value, written by the server, is the only way two devices can be
  // guaranteed to agree.

  async saveSessionSnapshot(userAddr, balance) {
    try {
      const addr = String(userAddr || '').toLowerCase();
      const bal = Number(balance);
      if (!addr || !isFinite(bal) || bal < 0) return false;
      this.sessionSnapshots.set(addr, { bal, exp: Date.now() + 86400 * 1000 });
      return true;
    } catch (e) {
      return false;
    }
  }

  async loadSessionSnapshot(userAddr) {
    try {
      const addr = String(userAddr || '').toLowerCase();
      if (!addr) return null;
      const entry = this.sessionSnapshots.get(addr);
      if (!entry) return null;
      if (Date.now() > entry.exp) {
        this.sessionSnapshots.delete(addr);
        return null;
      }
      return isFinite(entry.bal) && entry.bal >= 0 ? entry.bal : null;
    } catch (e) {
      return null;
    }
  }

  // NOTE: chart history is deliberately NOT stored anywhere. Every login
  // starts from an empty buffer that fills with live streamed ticks — no
  // stored, shifted, seeded or synthetic values, ever.
}

module.exports = new Cache();
