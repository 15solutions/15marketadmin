// ============================================================
// nexus-core/src/cache.js
// In-process cache layer for the unified backend.
// ============================================================
const Redis = require('ioredis');

let redis = null;
function getRedis() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      // These MUST stay bounded. With `maxRetriesPerRequest: null` a command
      // issued while the connection is down sits in the offline queue forever
      // and never settles — so the `try/catch` around every `await r.get(...)`
      // never runs and the HTTP response is never sent. A dead Redis endpoint
      // then shows up in the browser as a request that hangs and is finally
      // reported as a CORS / ERR_FAILED failure, with nothing in the server
      // logs. A finite retry count turns that hang into an ordinary thrown
      // error, which every caller already handles by degrading.
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
      // Keep backing off and reconnecting; just never let a single command
      // wait on it indefinitely.
      retryStrategy: (times) => Math.min(times * 1000, 30000)
    });

    // Rate-limit the noise: ioredis retries forever, and an unreachable
    // endpoint would otherwise print one line per retry, per process, forever.
    let lastLogged = 0;
    let loggedAny = false;
    redis.on('error', (err) => {
      const now = Date.now();
      if (!loggedAny || now - lastLogged > 30000) {
        loggedAny = true;
        lastLogged = now;
        console.error('[Redis] connection error (Redis-backed features are degraded):', err?.message);
      }
    });
    redis.on('ready', () => {
      console.log('[Redis] connected.');
    });
  }
  return redis;
}

class Cache {
  constructor() {
    this.sessions = new Map(); // address/identityKey -> session object
    this.trades = new Map(); // tradeId -> trade object
    this.userHistory = new Map(); // address -> array of history records
    
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

  // --- Redis Trade Result Caching ---
  // Pre-locks the result (exit price + won/lost) in Redis so the backend
  // settler can read it instantly when the countdown hits 0.

  async cacheTradeResult(tradeId, result) {
    try {
      const r = getRedis();
      const key = `trade:${tradeId}:result`;
      await r.set(key, JSON.stringify(result), 'EX', 3600); // 1h TTL
    } catch (e) {}
  }

  async getCachedTradeResult(tradeId) {
    try {
      const r = getRedis();
      const data = await r.get(`trade:${tradeId}:result`);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  async deleteCachedTradeResult(tradeId) {
    try {
      const r = getRedis();
      await r.del(`trade:${tradeId}:result`);
    } catch (e) {}
  }

  // --- Redis Open-Trade Registry ---
  //
  // Every bet that has been broadcast but not yet given a final verdict.
  //
  // cache.trades is in-memory, so after a restart the settlement engine has no
  // working set at all and the only way an open trade can come back is a durable
  // store. That used to mean Supabase alone: if it was unreachable, recovery
  // returned an empty list, which is indistinguishable from "nothing to do", and
  // every open trade was silently abandoned with no way to ever settle it.
  //
  // Redis is the right tier for this. It is shared across instances (so a deploy
  // that replaces the process does not lose the set), it survives a restart, and
  // unlike a local file it is not per-machine. A hash keyed by bet id keeps both
  // operations idempotent: HSET overwrites, HDEL removes, HGETALL enumerates.

  async registerOpenTrade(trade) {
    try {
      const id = String(trade?.id || trade?.betId || '');
      if (!id) return false;
      const r = getRedis();
      await r.hset('15market:open-trades', id, JSON.stringify({
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
      }));
      return true;
    } catch (e) {
      // Never throw upward: losing the registry must not block placing a trade.
      console.warn('[Redis] registerOpenTrade failed:', e.message);
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
      await getRedis().hdel('15market:open-trades', id);
    } catch (e) {}
  }

  // Everything currently awaiting a verdict. Entries are re-registered on every
  // place, so this reflects the live working set.
  async listOpenTrades() {
    try {
      const raw = await getRedis().hgetall('15market:open-trades');
      return Object.entries(raw || {})
        .map(([id, json]) => {
          try {
            return { ...JSON.parse(json), id };
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean);
    } catch (e) {
      console.warn('[Redis] listOpenTrades failed:', e.message);
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
      const r = getRedis();
      const pipeline = r.pipeline();
      for (const t of stale) pipeline.hdel('15market:open-trades', String(t.id));
      await pipeline.exec();
      return stale.length;
    } catch (e) {
      return 0;
    }
  }

  // --- Redis Session Snapshot ---
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
      await getRedis().set(`15market:session:${addr}:balance`, String(bal), 'EX', 86400);
      return true;
    } catch (e) {
      return false;
    }
  }

  async loadSessionSnapshot(userAddr) {
    try {
      const addr = String(userAddr || '').toLowerCase();
      if (!addr) return null;
      const raw = await getRedis().get(`15market:session:${addr}:balance`);
      if (raw === null) return null;
      const bal = parseFloat(raw);
      return isFinite(bal) && bal >= 0 ? bal : null;
    } catch (e) {
      return null;
    }
  }

  // --- Redis Chart History Caching ---
  // Persists chart price history across server restarts for all users.

  async saveChartHistory(symbol, history) {
    try {
      const r = getRedis();
      const key = `15market_chart:${symbol.toLowerCase()}`;
      const toSave = history.slice(-300); // last 300 points (~30s)
      await r.set(key, JSON.stringify(toSave), 'EX', 86400); // 24h TTL
    } catch (e) {}
  }

  async loadChartHistory(symbol) {
    try {
      const r = getRedis();
      const data = await r.get(`15market_chart:${symbol.toLowerCase()}`);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  // --- Server-recorded chart ticks ---
  // The backend appends its own polled price every second, so a login always
  // finds real shared history instead of depending on whichever browser
  // POSTed its buffer last (last-writer-wins) or starting from nothing.
  // Only real feed sources are recorded — synthetic oracle drift must never
  // become "history". 900 ticks ≈ 15 minutes at 1s cadence.
  async appendChartTick(symbol, t, p) {
    try {
      const r = getRedis();
      const key = `15market:chart:${String(symbol || '').toLowerCase()}:ticks`;
      const pipe = r.pipeline();
      pipe.rpush(key, JSON.stringify({ t: Number(t), p: Number(p) }));
      pipe.ltrim(key, -900, -1);
      pipe.expire(key, 86400);
      // exec() resolves even when individual commands fail ([err, res]
      // pairs), so verify rather than assuming the write landed.
      const res = await pipe.exec();
      if (!res || res.some(([err]) => !!err)) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  async loadChartTicks(symbol) {
    try {
      const r = getRedis();
      const key = `15market:chart:${String(symbol || '').toLowerCase()}:ticks`;
      const rows = await r.lrange(key, 0, -1);
      if (!rows || !rows.length) return [];
      const out = [];
      for (const json of rows) {
        try {
          const pt = JSON.parse(json);
          if (pt && isFinite(pt.t) && isFinite(pt.p) && pt.p > 0) out.push({ t: pt.t, p: pt.p });
        } catch {}
      }
      return out;
    } catch (e) {
      return [];
    }
  }
}

module.exports = new Cache();
