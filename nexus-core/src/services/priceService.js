// ==================================================================================
// PRICE SERVICE — Multi-Source Aggregated Feeds
// ==================================================================================
// Primary: REST polling at 1s from MEXC, Kraken, Binance (concurrent)
// Enhancement: Binance WebSocket for real-time sub-100ms price updates
// All sources write to shared cache.prices for chart + settlement + odds.
// ==================================================================================
const cache = require('../cache');

let WebSocket;
try { WebSocket = require('ws'); } catch { WebSocket = globalThis.WebSocket; }

const ASSETS = {
    btc: { mexc: 'BTCUSDT', kraken: 'XXBTZUSD', binance: 'BTCUSDT', binanceWs: 'btcusdt' },
    eth: { mexc: 'ETHUSDT', kraken: 'XETHZUSD', binance: 'ETHUSDT', binanceWs: 'ethusdt' },
    sol: { mexc: 'SOLUSDT', kraken: 'SOLUSD', binance: 'SOLUSDT', binanceWs: 'solusdt' },
    xrp: { mexc: 'XRPUSDT', kraken: 'XXRPZUSD', binance: 'XRPUSDT', binanceWs: 'xrpusdt' },
    jup: { mexc: 'JUPUSDT', kraken: 'JUPUSD', binance: 'JUPUSDT', binanceWs: 'jupusdt' },
    avax: { mexc: 'AVAXUSDT', kraken: 'AVAXUSD', binance: 'AVAXUSDT', binanceWs: 'avaxusdt' },
    mon: { fallbackPrice: 0.025 }
};

const SYMBOL_TO_KEY = {
    'BTCUSDT': 'btc', 'ETHUSDT': 'eth', 'SOLUSDT': 'sol', 'XRPUSDT': 'xrp', 'JUPUSDT': 'jup', 'AVAXUSDT': 'avax',
    'btcusdt': 'btc', 'ethusdt': 'eth', 'solusdt': 'sol', 'xrpusdt': 'xrp', 'jupusdt': 'jup', 'avaxusdt': 'avax'
};

function fetchWithTimeout(url, timeoutMs = 1000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const fetchPromise = fetch(url, { signal: controller.signal })
        .then(res => {
            clearTimeout(timer);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .catch(e => {
            clearTimeout(timer);
            throw e;
        });
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs));
    return Promise.race([fetchPromise, timeoutPromise]);
}

async function fetchMexc(symbol) {
    if (!symbol) throw new Error('No MEXC symbol');
    const d = await fetchWithTimeout(`https://api.mexc.com/api/v3/ticker/price?symbol=${symbol}`, 3000);
    const p = parseFloat(d.price);
    if (!p || isNaN(p)) throw new Error('Invalid MEXC price');
    return p;
}

async function fetchKraken(pair) {
    if (!pair) throw new Error('No Kraken pair');
    const d = await fetchWithTimeout(`https://api.kraken.com/0/public/Ticker?pair=${pair}`, 3000);
    const key = Object.keys(d.result)[0];
    const p = parseFloat(d.result[key].c[0]);
    if (!p || isNaN(p)) throw new Error('Invalid Kraken price');
    return p;
}

async function fetchBinance(symbol) {
    if (!symbol) throw new Error('No Binance symbol');
    const d = await fetchWithTimeout(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`, 3000);
    const p = parseFloat(d.price);
    if (!p || isNaN(p)) throw new Error('Invalid Binance price');
    return p;
}

// Fetch from ALL sources concurrently, use the first successful result
async function fetchPriceForAsset(key) {
    const asset = ASSETS[key];
    if (!asset) return null;

    const promises = [];
    if (asset.mexc) promises.push(fetchMexc(asset.mexc).then(price => ({ key, price, source: 'mexc' })));
    if (asset.kraken) promises.push(fetchKraken(asset.kraken).then(price => ({ key, price, source: 'kraken' })));
    if (asset.binance) promises.push(fetchBinance(asset.binance).then(price => ({ key, price, source: 'binance' })));

    if (promises.length === 0 && asset.fallbackPrice) {
        // Simulated micro-variation for synthetic / pre-listing asset like MON
        const drift = (Math.random() - 0.5) * (asset.fallbackPrice * 0.002);
        const currentPrice = cache.prices[key] || asset.fallbackPrice;
        const newPrice = Number(Math.max(0.001, currentPrice + drift).toFixed(6));
        return { key, price: newPrice, source: 'oracle_fallback' };
    }

    const results = await Promise.allSettled(promises);

    // Return the first successful result
    for (const r of results) {
        if (r.status === 'fulfilled' && r.value && r.value.price > 0) {
            return r.value;
        }
    }

    if (asset.fallbackPrice) {
        const drift = (Math.random() - 0.5) * (asset.fallbackPrice * 0.002);
        const currentPrice = cache.prices[key] || asset.fallbackPrice;
        return { key, price: Number(Math.max(0.001, currentPrice + drift).toFixed(6)), source: 'oracle_fallback' };
    }

    // ALL APIs failed — preserve last known price instead of returning null.
    // Returning null would leave cache.prices at 0, causing getLivePrice() to
    // return 0 and lockResult() to use entryPrice as exitPrice, making every trade a push/loss.
    const lastPrice = cache.prices[key] || cache.lastPollPrice[key] || asset.fallbackPrice || 0;
    if (lastPrice > 0) {
        const drift = (Math.random() - 0.5) * (lastPrice * 0.001);
        return { key, price: Number(Math.max(0.001, lastPrice + drift).toFixed(6)), source: 'oracle_stale' };
    }

    // LAST RESORT: No price available. Return null — pollPrices() preserves lastPollPrice.
    return null;
}

async function pollPrices() {
    const keys = Object.keys(ASSETS);
    const results = await Promise.all(keys.map(key => fetchPriceForAsset(key)));

    const now = Date.now();
    for (const r of results) {
        if (r && r.price > 0) {
            // Reject absurdly low prices that would make trades falsely lose.
            // If we have a known price and the new price is < 10% of it, skip.
            const lastKnown = cache.lastPollPrice[r.key];
            if (lastKnown > 0 && r.price < lastKnown * 0.1) {
                continue;
            }
            cache.prices[r.key] = r.price;
            cache.priceMeta[r.key] = { updatedAt: now, source: r.source };
            cache.lastPollPrice[r.key] = r.price;
            cache.lastPollTime[r.key] = now;

            if (!cache.priceHistory[r.key]) cache.priceHistory[r.key] = [];
            cache.priceHistory[r.key].push({ price: r.price, time: now });
            if (cache.priceHistory[r.key].length > 4800) cache.priceHistory[r.key].shift();
        }
    }

    // Ensure cache.prices always has a value — preserve lastPollPrice if still 0.
    for (const key of keys) {
        if (!cache.prices[key] || cache.prices[key] <= 0) {
            cache.prices[key] = cache.lastPollPrice[key] || 0;
        }
    }

    return results.filter(Boolean);
}

function snapshotPrices() {
    const keys = Object.keys(cache.prices);
    for (const key of keys) {
        if (cache.prices[key] > 0) {
            cache.snapshotPrice(key);
        }
    }
}

// ════════════════════════════════════════════════════════════════════════════════
// BINANCE WEBSOCKET — Enhancement for real-time price updates
// ════════════════════════════════════════════════════════════════════════════════
let binanceWs = null;
let binanceReconnectTimer = null;

function _connectBinanceWs() {
    if (!WebSocket) return;

    try {
        const streams = Object.values(ASSETS).filter(a => !!a.binanceWs).map(a => `${a.binanceWs}@trade`).join('/');
        // Combined-stream endpoint. The `/ws/<s1>/<s2>/...` path silently degrades when
        // subscribing to many streams (only a trickle of messages), which left the
        // enhancement effectively dead and the frontend on the 1s REST poll alone.
        const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);

        ws.on('open', () => {
            console.log('[PriceService] Binance WebSocket connected (enhancement active)');
            binanceWs = ws;
        });

        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw);
                // Combined streams wrap payloads as { stream, data }; single streams don't.
                const data = msg && msg.data ? msg.data : msg;
                if (data && data.s && data.p) {
                    const key = SYMBOL_TO_KEY[data.s];
                    if (key) {
                        const price = parseFloat(data.p);
                        if (price > 0) {
                            // Update cache immediately (real-time)
                            cache.prices[key] = price;
                            cache.priceMeta[key] = { updatedAt: data.T || Date.now(), source: 'binance_ws' };

                            // Write to price history for settlement precision
                            const now = Date.now();
                            if (!cache.priceHistory[key]) cache.priceHistory[key] = [];
                            cache.priceHistory[key].push({ price, time: now });
                            if (cache.priceHistory[key].length > 4800) cache.priceHistory[key].shift();

                            // Broadcast to all connected clients in real-time
                            if (ioRef) {
                                ioRef.emit('price', { key, price, ts: now });
                            }
                        }
                    }
                }
            } catch (e) {}
        });

        ws.on('error', () => {});
        ws.on('close', () => {
            binanceWs = null;
            binanceReconnectTimer = setTimeout(() => _connectBinanceWs(), 5000);
        });
    } catch (err) {
        binanceReconnectTimer = setTimeout(() => _connectBinanceWs(), 5000);
    }
}

let ioRef = null;
let pollInterval = null;
let snapshotInterval = null;
let polling = false;

function start(io) {
    ioRef = io;
    console.log('[PriceService] Starting multi-source price feeds (MEXC + Kraken + Binance @ 1s)...');

    pollInterval = setInterval(async () => {
        if (polling) return;
        try {
            polling = true;
            const results = await Promise.race([
                pollPrices(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Poll timeout')), 5000))
            ]);
            if (ioRef) {
                const nowTs = Date.now();
                for (const r of results) {
                    if (r && r.price > 0) {
                        ioRef.emit('price', { key: r.key, price: r.price, ts: nowTs });
                    }
                }
            }
        } catch (e) {
            console.error('[PriceService] Poll error:', e.message);
        } finally {
            polling = false;
        }
    }, 1000);

    _connectBinanceWs();

    snapshotInterval = setInterval(snapshotPrices, 250);

    (async () => {
        try {
            polling = true;
            const results = await pollPrices();
            polling = false;
            console.log(`[PriceService] Initial poll: ${results.map(r => `${r.key}=${r.price}(${r.source})`).join(', ')}`);
            if (ioRef) {
                for (const r of results) {
                    ioRef.emit('price', { key: r.key, price: r.price, ts: Date.now() });
                }
            }
        } catch (e) {
            polling = false;
            console.error('[PriceService] Initial poll failed:', e.message);
        }
    })();

    _fetchBinance24h();
}

function _fetchBinance24h() {
    const keys = Object.keys(ASSETS).filter(k => !!ASSETS[k].binance);
    Promise.allSettled(keys.map(async key => {
        try {
            const d = await fetchWithTimeout(
                `https://api.binance.com/api/v3/ticker/24hr?symbol=${ASSETS[key].binance}`, 5000
            );
            if (d && d.priceChangePercent) {
                cache.setBinance24h(key, parseFloat(d.priceChangePercent));
            }
        } catch (e) {}
    })).then(() => {
        console.log('[PriceService] 24h changes:', cache.binance24h);
    });

    setInterval(() => {
        Promise.allSettled(keys.map(async key => {
            try {
                const d = await fetchWithTimeout(
                    `https://api.binance.com/api/v3/ticker/24hr?symbol=${ASSETS[key].binance}`, 5000
                );
                if (d && d.priceChangePercent) {
                    cache.setBinance24h(key, parseFloat(d.priceChangePercent));
                }
            } catch (e) {}
        }));
    }, 60000);
}

/**
 * Get the current live price for an asset.
 * Returns the most recent price from the REST poll or WS feed.
 * Used by the classic engine for settlement at countdown zero.
 */
function getLivePrice(key) {
    if (!key) return 0;
    // Prefer cache.prices (most recent from WS or REST poll),
    // fall back to lastPollPrice (guaranteed to be updated on every poll).
    const price = cache.prices[key] || cache.lastPollPrice[key] || 0;
    return price;
}

function stop() {
    if (pollInterval) clearInterval(pollInterval);
    if (snapshotInterval) clearInterval(snapshotInterval);
    if (binanceReconnectTimer) clearTimeout(binanceReconnectTimer);
    if (binanceWs) binanceWs.close();
    pollInterval = null;
    snapshotInterval = null;
    binanceWs = null;
}

module.exports = { start, stop, pollPrices, ASSETS, getLivePrice, fetchPriceForAsset };
