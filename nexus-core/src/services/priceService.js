// ==================================================================================
// PRICE SERVICE — Multi-Source Aggregated Feeds (CONCURRENT)
// ==================================================================================
// Architecture:
// 1. Individual Binance WebSocket streams (concurrent real-time, sub-100ms)
// 2. MEXC/Kraken REST fallback polling (1s, only if WS degrades)
// 3. All sources write to shared cache.prices for chart + settlement + odds.
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

// Track which sources are actively streaming
const wsHealthStatus = { btc: 0, eth: 0, sol: 0, xrp: 0, jup: 0, avax: 0 };
const lastWsUpdate = { btc: 0, eth: 0, sol: 0, xrp: 0, jup: 0, avax: 0 };

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

    const lastPrice = cache.prices[key] || cache.lastPollPrice[key] || asset.fallbackPrice || 0;
    if (lastPrice > 0) {
        const drift = (Math.random() - 0.5) * (lastPrice * 0.001);
        return { key, price: Number(Math.max(0.001, lastPrice + drift).toFixed(6)), source: 'oracle_stale' };
    }

    return null;
}

async function pollPrices() {
    const keys = Object.keys(ASSETS);
    const results = await Promise.all(keys.map(key => fetchPriceForAsset(key)));

    const now = Date.now();
    for (const r of results) {
        if (r && r.price > 0) {
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

// ════════════════════════════════════════════════════════════════[CONCURRENT WS]
// BINANCE WEBSOCKET — Individual streams per asset (HIGH CONCURRENCY)
// ════════════════════════════════════════════════════════════════[CONCURRENT WS]
const binanceWsSockets = {};
const binanceReconnectTimers = {};

function _connectBinanceWsForAsset(key) {
    if (!WebSocket) return;
    if (binanceWsSockets[key]) return;

    try {
        const asset = ASSETS[key];
        if (!asset || !asset.binanceWs) return;

        // Important: do NOT use the combined-stream endpoint here.
        // The combined stream degrades and silently drops ticks under load,
        // which is why the mobile widget was lagging every 15-30 seconds.
        const ws = new WebSocket(`wss://stream.binance.com:9443/ws/${asset.binanceWs}@trade`);

        ws.on('open', () => {
            console.log(`[PriceService] Binance WS connected for ${key} (concurrent stream active)`);
            binanceWsSockets[key] = ws;
            wsHealthStatus[key] = 1;

            if (binanceReconnectTimers[key]) {
                clearTimeout(binanceReconnectTimers[key]);
                binanceReconnectTimers[key] = null;
            }
        });

        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw);
                if ((msg && msg.s && msg.p) || (msg && msg.data && msg.data.s && msg.data.p)) {
                    const payload = msg.data || msg;
                    const msgKey = SYMBOL_TO_KEY[payload.s];
                    if (msgKey === key) {
                        const price = parseFloat(payload.p);
                        if (price > 0) {
                            cache.prices[msgKey] = price;
                            cache.priceMeta[msgKey] = { updatedAt: payload.T || Date.now(), source: 'binance_ws' };

                            const now = Date.now();
                            if (!cache.priceHistory[msgKey]) cache.priceHistory[msgKey] = [];
                            cache.priceHistory[msgKey].push({ price, time: now });
                            if (cache.priceHistory[msgKey].length > 4800) cache.priceHistory[msgKey].shift();

                            lastWsUpdate[msgKey] = now;

                            if (ioRef) {
                                ioRef.emit('price', { key: msgKey, price, ts: now });
                            }
                        }
                    }
                }
            } catch (e) {}
        });

        ws.on('error', (err) => {
            console.warn(`[PriceService] WS error for ${key}:`, err.message);
            wsHealthStatus[key] = 0;
        });

        ws.on('close', () => {
            binanceWsSockets[key] = null;
            wsHealthStatus[key] = 0;

            if (!binanceReconnectTimers[key]) {
                binanceReconnectTimers[key] = setTimeout(() => {
                    _connectBinanceWsForAsset(key);
                }, 5000);
            }
        });
    } catch (err) {
        console.error(`[PriceService] Failed to connect WS for ${key}:`, err.message);
        wsHealthStatus[key] = 0;

        if (!binanceReconnectTimers[key]) {
            binanceReconnectTimers[key] = setTimeout(() => {
                _connectBinanceWsForAsset(key);
            }, 5000);
        }
    }
}

function _connectAllBinanceWs() {
    const keys = Object.keys(ASSETS).filter(k => !!ASSETS[k].binanceWs);
    keys.forEach(key => _connectBinanceWsForAsset(key));
}

let ioRef = null;
let pollInterval = null;
let snapshotInterval = null;
let wsHealthCheckInterval = null;
let polling = false;

function start(io) {
    ioRef = io;
    console.log('[PriceService] Starting CONCURRENT multi-source price feeds...');
    console.log('[PriceService] - Binance individual WebSocket streams (concurrent, sub-100ms)');
    console.log('[PriceService] - MEXC/Kraken REST fallback (1s poll)');

    // Initialize all individual Binance WebSocket streams immediately
    _connectAllBinanceWs();

    // REST polling as fallback only when the per-asset WS feeds stall.
    pollInterval = setInterval(async () => {
        const now = Date.now();
        const keys = Object.keys(ASSETS);
        const needsFallback = keys.some(key => (now - lastWsUpdate[key]) > 3000);

        if (!needsFallback) return;
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
                        if (r.source !== 'oracle_fallback' && r.source !== 'oracle_stale') {
                            cache.appendChartTick(r.key, nowTs, r.price).catch(() => {});
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[PriceService] REST fallback poll error:', e.message);
        } finally {
            polling = false;
        }
    }, 1000);

    snapshotInterval = setInterval(snapshotPrices, 250);

    // Health check: monitor per-asset feeds and reconnect stalled sockets.
    wsHealthCheckInterval = setInterval(() => {
        const now = Date.now();
        const keys = Object.keys(ASSETS).filter(k => !!ASSETS[k].binanceWs);

        for (const key of keys) {
            const timeSinceLastUpdate = now - lastWsUpdate[key];
            const isConnected = !!binanceWsSockets[key] && wsHealthStatus[key] === 1;

            if (isConnected && timeSinceLastUpdate > 10000) {
                console.warn(`[PriceService] WS for ${key} stalled (no update in ${timeSinceLastUpdate}ms), reconnecting...`);
                binanceWsSockets[key]?.close();
                binanceWsSockets[key] = null;
                wsHealthStatus[key] = 0;
                _connectBinanceWsForAsset(key);
            }
        }
    }, 5000);

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
 * Returns the most recent price from the real-time WS feed.
 * Used by the classic engine for settlement at countdown zero.
 */
function getLivePrice(key) {
    if (!key) return 0;
    const price = cache.prices[key] || cache.lastPollPrice[key] || 0;
    return price;
}

function stop() {
    if (pollInterval) clearInterval(pollInterval);
    if (snapshotInterval) clearInterval(snapshotInterval);
    if (wsHealthCheckInterval) clearInterval(wsHealthCheckInterval);

    Object.values(binanceWsSockets).forEach(ws => {
        if (ws) ws.close();
    });

    Object.values(binanceReconnectTimers).forEach(timer => {
        if (timer) clearTimeout(timer);
    });

    pollInterval = null;
    snapshotInterval = null;
    wsHealthCheckInterval = null;
}

module.exports = { start, stop, pollPrices, ASSETS, getLivePrice, fetchPriceForAsset };
