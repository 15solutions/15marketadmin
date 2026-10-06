import { io } from 'socket.io-client';
import { KEEPER_URL_ARC } from '../constants';

const ALL_KEYS = ['btc', 'eth', 'sol'];

const MEXC_SYMBOLS = { btc: 'BTCUSDT', eth: 'ETHUSDT', sol: 'SOLUSDT' };

class PriceSocketService {
    constructor() {
        this.listeners = new Set();
        this.latestPrices = { btc: 0, eth: 0, sol: 0 };
        this.lastMessageAt = 0;
        this.priceSocket = null;
        this.pollingInterval = null;
        this.isSocketConnecting = false;
        this.isConnecting = false;
    }

    connect() {
        // Relay-only, by policy: the backend aggregates MEXC + Kraken +
        // Binance server-side, so a direct browser stream adds no data —
        // only a second failure domain plus handshake spam on links that
        // cannot reach Binance. Frontend prices are display-only anyway;
        // settlement runs on backend prices.
        this._connectBackendPriceStream();
        this._startMexcPolling();

        if (!this.pollingInterval) {
            this.pollingInterval = setInterval(() => {
                if (Date.now() - this.lastMessageAt > 5000) {
                    this._mexcPoll();
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

    _connectBackendPriceStream() {
        if (this.isSocketConnecting || (this.priceSocket && this.priceSocket.connected)) return;
        if (!KEEPER_URL_ARC) return;

        this.isSocketConnecting = true;

        try {
            const socket = io(KEEPER_URL_ARC, {
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 30000,
                reconnectionAttempts: Infinity,
                // Slow links need more than 5s to finish the handshake; same
                // reasoning as the adaptive timeout in utils/socket.js.
                timeout: 15000,
            });
            this.priceSocket = socket;

            socket.on('connect', () => {
                this.isSocketConnecting = false;
                console.log('[PriceStream] Backend price relay connected');
            });

            socket.on('price', (data) => {
                if (data && data.key && data.price) {
                    const key = data.key.toLowerCase();
                    if (ALL_KEYS.includes(key)) {
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

    _startMexcPolling() {
        this._mexcPoll();
    }

    async _mexcPoll() {
        // Browser fetch to exchange REST APIs is ALWAYS CORS-blocked (MEXC/Binance/
        // Kraken send no Access-Control-Allow-Origin), so the "REST fallback" goes
        // through the backend relay which performs the exchange call server-side.
        try {
            const results = await Promise.allSettled(
                Object.entries(MEXC_SYMBOLS).map(async ([key, symbol]) => {
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
