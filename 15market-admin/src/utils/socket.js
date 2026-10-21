import { io } from "socket.io-client";
import { KEEPER_URL_ARC } from "../constants";

class SocketService {
    constructor() {
        this.socket = null;
        this.listeners = new Map(); // event -> Set of callbacks
        this.connectHandlers = new Set(); // fired on every (re)connect
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 15;
        this.userRoom = null; // last joined user room — re-joined on every connect
    }

    connect() {
        if (this.socket?.connected) return;

        // Adaptive timeout based on network conditions
        const getTimeout = () => {
            if (navigator.connection && navigator.connection.effectiveType) {
                switch (navigator.connection.effectiveType) {
                    case 'slow-2g': return 15000;
                    case '2g': return 10000;
                    case '3g': return 7000;
                    default: return 5000;
                }
            }
            return 5000;
        };

        this.socket = io(KEEPER_URL_ARC, {
            transports: ['websocket', 'polling'],
            // Never stop trying: on a flaky link 15 attempts burn through in
            // ~a minute and the socket used to die permanently after that —
            // no live events until a full page reload. Back off hard instead
            // (up to 30s between tries) and keep going forever.
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 30000,
            timeout: getTimeout(),
            randomizationFactor: 0.5
        });

        // "connect" fires on the INITIAL connection AND on every successful
        // reconnect (socket.io keeps the same Socket object, so registered
        // listeners survive — no re-attachment needed).
        // The backend only delivers per-user events (trade_expired, trade_settled,
        // balance_update, trade_tick...) when the socket has joined the user's room,
        // and a reconnect spawns a NEW server-side socket with NO rooms. Re-emit
        // join_user here so settlement events are never emitted into the void —
        // that was causing trades to sit in "Resolving…" forever after a reconnect
        // or a backend restart.
        this.socket.on("connect", () => {
            console.log("[Socket] Platform Link Active");
            this.reconnectAttempts = 0;
            if (this.userRoom) {
                this.socket.emit('join_user', this.userRoom);
            }
            // A reconnect means every live event in the gap was missed. Tell
            // subscribers so the UI reconciles immediately instead of showing
            // stale PENDING rows until the next poll cycle.
            for (const cb of this.connectHandlers) {
                try { cb(); } catch (_) {}
            }
        });

        this.socket.on("disconnect", (reason) => {
            console.log("[Socket] Platform Link Lost:", reason);
            if (reason !== "io server disconnect" && reason !== "io client disconnect") {
                this.reconnectAttempts++;
                if (this.reconnectAttempts <= this.maxReconnectAttempts) {
                    console.log(`[Socket] Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
                }
            }
        });

        this.socket.on("reconnect_attempt", (attemptNumber) => {
            console.log(`[Socket] Reconnect attempt #${attemptNumber}`);
        });

        this.socket.on("reconnect_error", (error) => {
            console.error("[Socket] Reconnection error:", error);
        });

        this.socket.on("reconnect_failed", () => {
            console.error("[Socket] Reconnection failed after max attempts");
        });

        this.socket.on("connect_error", (error) => {
            console.error("[Socket] Connection error:", error);
        });
    }

    /**
     * Join the user's personal room. Remembers the address so it is re-sent
     * automatically after every reconnect (see "connect" handler above).
     */
    joinUser(address) {
        this.userRoom = String(address || '').toLowerCase();
        if (!this.userRoom) return;
        this.emit('join_user', this.userRoom);
    }

    on(event, callback) {
        if (!this.socket) this.connect();
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        this.socket.on(event, callback);
        return () => this.off(event, callback);
    }

    // Subscribe to (re)connects — e.g. to re-pull history the moment the
    // link comes back, instead of waiting out the next poll cycle.
    onConnect(callback) {
        this.connectHandlers.add(callback);
        return () => this.connectHandlers.delete(callback);
    }

    off(event, callback) {
        if (!this.socket) return;
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.delete(callback);
            if (callbacks.size === 0) {
                this.listeners.delete(event);
            }
        }
        this.socket.off(event, callback);
    }

    emit(event, data) {
        if (!this.socket) this.connect();
        const emitWithRetry = (retries = 3) => {
            if (!this.socket || !this.socket.connected) {
                if (retries > 0) {
                    setTimeout(() => emitWithRetry(retries - 1), 1000);
                    return;
                }
                console.warn("[Socket] Cannot emit event, not connected and retries exhausted");
                return;
            }
            this.socket.emit(event, data);
        };
        emitWithRetry();
    }

    isConnected() {
        return this.socket?.connected || false;
    }

    reconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.connect();
        }
    }
}

export const socketService = new SocketService();
