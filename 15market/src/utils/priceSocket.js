import { io } from 'socket.io-client';
import { KEEPER_URL_ARC, PRICE_FEED_URL } from '../constants';

// All keys supported across the platform
const ALL_KEYS = ['btc', 'eth', 'sol', 'avax', 'mon'];

// Direct Binance WS symbols for real-time sub-50ms browser stream
const BINANCE_WS_SYMBOLS = {
    btc: 'btcusdt',
    eth: 'ethusdt',
    sol: 'solusdt',
    avax: 'avaxusdt',
};

const BINANCE_SYMBOL_TO_KEY = {
    'BTCUSDT': 'btc', 'ETHUSDT': 'eth', 'SOLUSDT': 'sol', 'AVAXUSDT': 'avax',
    'btcusdt': 'btc', 'ethusdt': 'eth', 'solusdt': 'sol', 'avaxusdt': 'avax',
};

// REST fallback via backend relay (CORS-safe)
const REST_SYMBOLS = { btc: 'BTCUSDT', eth: 'ETHUSDT', sol: 'SOLUSDT', avax: 'AVAXUSDT' };

class PriceSocketService {
    constructor() {
        this.listeners = new Set();
        this.latestPrices = { btc: 0, eth: 0, sol: 0, avax: 0, mon: 0 };
        this.lastMessageAt = 0;
        this.priceSocket = null;
        this.binanceWs = null;
        this.binanceReconnectTimer = null;
        this.pollingInterval = null;
        this.isSocketConnecting = false;
        this.isConnecting = false;
    }

    connect() {
        if (this.isConnecting) return;
        this.isConnecting = true;

        // 1. Direct Binance combined-stream WS for real-time sub-50ms ticks
        //    This is what made the chart smooth two months ago — each price
        //    tick arrives as soon as Binance publishes it, without a server hop.
        this._connectBinanceWs();

        // 2. Backend relay socket as authoritative source (settlement prices)
        //    The backend uses concurrent per-asset WS feeds (priceService.js)
        //    and broadcasts to all clients. This is the ONLY source for MON
        //    (no Binance pair) and ensures chart prices match settlement.
        this._connectBackendPriceStream();

        // 3. REST polling fallback — fires immediately on connect, then every 3s
        //    if both WS feeds go silent for > 5s.
        this._restPoll(); // immediate seed on first connect
        if (!this.pollingInterval) {
            this.pollingInterval = setInterval(() => {
                if (Date.now() - this.lastMessageAt > 5000) {
                    this._restPoll();
                }
            }, 3000);
        }
    }

    _emitPrice(key, price, ts = Date.now(), source = 'live') {
        if (!key || isNaN(price) || price <= 0) return;
        this.lastMessageAt = Date.now();
        this.latestPrices[key] = price;

        this.listeners.forEach(cb => {
            try { cb({ key, price, ts, source }); } catch (e) {}
        });
    }

    // ─── Direct Binance combined-stream WebSocket ────────────────────────────
    _connectBinanceWs() {
        if (this.binanceWs && this.binanceWs.readyState === WebSocket.OPEN) return;

        try {
            // Combined stream: one WS handles all assets simultaneously.
            // Binance's combined endpoint: wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade/...
            const streams = Object.values(BINANCE_WS_SYMBOLS).map(s => `${s}@trade`).join('/');
            const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);

            ws.onopen = () => {
                this.binanceWs = ws;
                if (this.binanceReconnectTimer) {
                    clearTimeout(this.binanceReconnectTimer);
                    this.binanceReconnectTimer = null;
                }
                console.log('[PriceStream] Binance direct WS connected (real-time stream active)');
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    // Combined stream wraps: { stream: "btcusdt@trade", data: { s, p, T } }
                    const payload = msg.data || msg;
                    if (payload && payload.s && payload.p) {
                        const key = BINANCE_SYMBOL_TO_KEY[payload.s] || BINANCE_SYMBOL_TO_KEY[payload.s.toLowerCase()];
                        if (key) {
                            const price = parseFloat(payload.p);
                            if (price > 0) {
                                this._emitPrice(key, price, payload.T || Date.now(), 'binance_ws');
                            }
                        }
                    }
                } catch (e) {}
            };

            ws.onerror = () => {};

            ws.onclose = () => {
                this.binanceWs = null;
                if (!this.binanceReconnectTimer) {
                    this.binanceReconnectTimer = setTimeout(() => {
                        this.binanceReconnectTimer = null;
                        this._connectBinanceWs();
                    }, 5000);
                }
            };
        } catch (e) {
            // WebSocket not available (SSR, etc.) — fall back to backend relay only
        }
    }

    // ─── Backend socket relay ────────────────────────────────────────────────
    _connectBackendPriceStream() {
        if (this.isSocketConnecting || (this.priceSocket && this.priceSocket.connected)) return;
        // Use PRICE_FEED_URL which is the dedicated price relay (port 3012 in dev,
        // same as KEEPER_URL_ARC in production where the relay is colocated).
        const streamUrl = PRICE_FEED_URL || KEEPER_URL_ARC;
        if (!streamUrl) return;

        this.isSocketConnecting = true;

        try {
            const socket = io(streamUrl, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 30000,
                reconnectionAttempts: Infinity,
                // Slow links need more than 5s to finish the handshake
                timeout: 15000,
            });
            this.priceSocket = socket;

            socket.on('connect', () => {
                this.isSocketConnecting = false;
                console.log('[PriceStream] Backend relay connected');
            });

            socket.on('price', (data) => {
                if (data && data.key && data.price) {
                    const key = data.key.toLowerCase();
                    if (ALL_KEYS.includes(key)) {
                        // Backend prices are authoritative for MON and settlement.
                        // For BTC/ETH/SOL/AVAX the Binance WS already covers it in
                        // real-time, but the backend value is also accepted so charts
                        // that filter for source==='backend' still receive ticks.
                        this._emitPrice(key, parseFloat(data.price), data.ts || Date.now(), 'backend');
                    }
                }
            });

            socket.on('disconnect', () => { this.isSocketConnecting = false; });
            socket.on('connect_error', () => { this.isSocketConnecting = false; });
        } catch (e) {
            this.isSocketConnecting = false;
        }
    }

    // ─── REST fallback (CORS-safe via backend relay) ─────────────────────────
    async _restPoll() {
        try {
            const results = await Promise.allSettled(
                Object.entries(REST_SYMBOLS).map(async ([key, symbol]) => {
                    const res = await fetch(`${KEEPER_URL_ARC}/price/${key}`, { signal: AbortSignal.timeout(4000) });
                    if (res.ok) {
                        const data = await res.json();
                        return { key, price: parseFloat(data.price) };
                    }
                    return null;
                })
            );

            results.forEach(r => {
                if (r.status === 'fulfilled' && r.value) {
                    const { key, price } = r.value;
                    if (price > 0) {
                        this._emitPrice(key, price, Date.now(), 'relay_rest');
                    }
                }
            });
        } catch (e) {}
    }

    on(event, callback) {
        if (event !== 'price') return () => {};

        this.connect();
        this.listeners.add(callback);

        // Replay cached prices to newly attached listener so the chart
        // doesn't wait for the next tick before showing a value.
        Object.entries(this.latestPrices).forEach(([key, price]) => {
            if (price > 0) {
                try { callback({ key, price, ts: Date.now(), source: 'cache' }); } catch (e) {}
            }
        });

        return () => { this.listeners.delete(callback); };
    }

    getLatestPrice(symbol) {
        const key = symbol.replace('USDT', '').toLowerCase();
        return this.latestPrices[key] || 0;
    }
}

export const priceSocketService = new PriceSocketService();
