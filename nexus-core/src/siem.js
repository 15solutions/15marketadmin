/**
 * Minimal SIEM (Security Information & Event Management) for the platform.
 *
 * Catches abuse patterns that plague both the user side and the admin portal:
 *   AUTH_BRUTEFORCE  — repeated failed admin authentications from one IP
 *   ADMIN_TAMPER     — authenticated calls hitting admin endpoints the admin
 *                      row has no permission for (privilege probing)
 *   RATE_ABUSE       — a single IP hammering the API far beyond normal
 *
 * Events live in a ring buffer (Last ~250), are mirrored to disk so they
 * survive restarts/deploys, and every HIGH/CRITICAL event is broadcast to
 * live admin dashboards over the socket (`siem_alert`).
 */
const fs = require('fs');
const path = require('path');

const BACKUP = path.join(__dirname, '..', 'data', 'siem.backup.json');
if (!fs.existsSync(path.dirname(BACKUP))) fs.mkdirSync(path.dirname(BACKUP), { recursive: true });

const MAX_EVENTS = 250;

// ── Trackers ─────────────────────────────────────────────────────────────
// Failed admin auth attempts: sliding 10-minute window per IP.
const authFailWindow = new Map(); // ip -> [timestamps]
const AUTH_FAIL_LIMIT = 5;
const AUTH_FAIL_WINDOW_MS = 10 * 60 * 1000;

// Global request volume: sliding 60-second window per IP.
const rateWindow = new Map(); // ip -> [timestamps]
const RATE_LIMIT = 180; // req/min — well above any normal console clickstream
const RATE_WINDOW_MS = 60 * 1000;

let events = [];
try { events = JSON.parse(fs.readFileSync(BACKUP, 'utf8')); } catch (e) { /* blank */ }
if (!Array.isArray(events)) events = [];

let broadcast = null; // cb set via setBroadcaster(event)
const WHISPERED = new Set((events.slice(-1) || []).map(e => e.id));

let persistTimer = null;
function persist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        try {
            fs.writeFileSync(BACKUP, JSON.stringify(events.slice(0, MAX_EVENTS)));
        } catch (e) { /* disk hiccup — buffer keeps going */ }
    }, 500);
}

function addEvent({ type, severity = 'info', message, ip = 'unknown', meta = {} }) {
    const ev = {
        id: `${Date.now()}${Math.floor(Math.random() * 1e4).toString().padStart(4, '0')}`,
        type,
        severity,
        message,
        ip,
        meta,
        at: Date.now()
    };
    events = [ev, ...events].slice(0, MAX_EVENTS);
    persist();
    if ((broadcast) && (severity === 'high' || severity === 'critical')) try { broadcast(ev); } catch (e) {}
    return ev;
}

function pruneMap(map, windowMs) {
    const now = Date.now();
    for (const [k, arr] of map) {
        const kept = arr.filter(t => now - t < windowMs);
        if (kept.length) map.set(k, kept); else map.delete(k);
    }
}

function trackAdminAuthFailure(ip, detail = {}) {
    const now = Date.now();
    const arr = (authFailWindow.get(ip) || []).filter(t => now - t < AUTH_FAIL_WINDOW_MS);
    arr.push(now);
    authFailWindow.set(ip, arr);
    const burst = arr.length;
    // Log every failure as info (the audit trail); escalate the burst itself.
    addEvent({
        type: 'AUTH_FAILURE',
        severity: 'info',
        message: `Failed admin authentication (attempt ${burst})`,
        ip,
        meta: detail
    });
    if (burst === AUTH_FAIL_LIMIT) {
        addEvent({
            type: 'AUTH_BRUTEFORCE',
            severity: 'high',
            message: `${AUTH_FAIL_LIMIT} failed admin logins in ${AUTH_FAIL_WINDOW_MS / 60000}m from one address — brute force suspected`,
            ip,
            meta: { ...detail, attempts: burst }
        });
    } else if (burst > AUTH_FAIL_LIMIT && burst % 10 === 0) {
        addEvent({
            type: 'AUTH_BRUTEFORCE',
            severity: 'critical',
            message: `${burst} failed admin logins within ${AUTH_FAIL_WINDOW_MS / 60000}m from one address — ongoing brute force`,
            ip,
            meta: { ...detail, attempts: burst }
        });
    }
}

function trackAdminTamper(ip, detail = {}) {
    addEvent({
        type: 'ADMIN_TAMPER',
        severity: 'high',
        message: `Privileged action denied (permission or route probing)`,
        ip,
        meta: detail
    });
}

function trackRequest(ip) {
    const now = Date.now();
    const arr = (rateWindow.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
    arr.push(now);
    rateWindow.set(ip, arr);
    if (arr.length === RATE_LIMIT) {
        addEvent({
            type: 'RATE_ABUSE',
            severity: 'medium',
            message: `${arr.length} requests in ${RATE_WINDOW_MS / 1000}s from one address — abuse pattern`,
            ip,
        });
    } else if (arr.length > RATE_LIMIT && arr.length % (RATE_LIMIT * 2) === 0) {
        addEvent({
            type: 'RATE_ABUSE',
            severity: 'high',
            message: `${arr.length} requests within the last minute from one address — sustained flood`,
            ip,
        });
    }
    if (rateWindow.size > 2000) pruneMap(rateWindow, RATE_WINDOW_MS);
    if (authFailWindow.size > 2000) pruneMap(authFailWindow, AUTH_FAIL_WINDOW_MS);
}

function listEvents(limit = MAX_EVENTS) {
    return events.slice(0, limit);
}

function summary() {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recent = events.filter(e => e.at >= dayAgo);
    const count = (t) => recent.filter(e => e.type === t).length;
    return {
        total24h: recent.length,
        authFailures: count('AUTH_FAILURE'),
        bruteforce: count('AUTH_BRUTEFORCE'),
        tamper: count('ADMIN_TAMPER'),
        rateAbuse: count('RATE_ABUSE'),
        critical: recent.filter(e => e.severity === 'critical').length,
        lastEventAt: events[0]?.at || null,
        watching: Math.max(authFailWindow.size, rateWindow.size)
    };
}

function clearAll() {
    events = [];
    authFailWindow.clear();
    rateWindow.clear();
    persist();
}

module.exports = {
    addEvent,
    trackAdminAuthFailure,
    trackAdminTamper,
    trackRequest,
    listEvents,
    summary,
    clearAll,
    setBroadcaster: (fn) => { broadcast = fn; }
};
