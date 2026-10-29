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
 *
 * IP choke: admins can BLOCK any flagged or suspicious IP. A blocked address
 * gets 403 on every route — user side AND admin side — and the set is
 * persisted to disk so blocks survive restarts.
 */
const fs = require('fs');
const path = require('path');

const BACKUP = path.join(__dirname, '..', 'data', 'siem.backup.json');
const IPBLOCK_PATH = path.join(__dirname, '..', 'data', 'siem.ipblocks.json');
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

// ── IP blocklist (admin-driven choke) ────────────────────────────────────
// ip -> { ip, at, by, reason }; persisted so blocks survive restarts.
let blockedIPs = new Map();
try {
    const stored = JSON.parse(fs.readFileSync(IPBLOCK_PATH, 'utf8'));
    if (Array.isArray(stored)) {
        for (const b of stored) if (b && b.ip) blockedIPs.set(b.ip, b);
    }
} catch (e) { /* blank */ }

function persistBlocked() {
    try { fs.writeFileSync(IPBLOCK_PATH, JSON.stringify([...blockedIPs.values()])); }
    catch (e) { /* disk hiccup — memory choke stays enforce */ }
}

function isBlocked(ip) {
    return blockedIPs.has(String(ip || ''));
}

function blockIP(ip, { by = 'admin', reason = '' } = {}) {
    const key = String(ip || '').trim();
    if (!key) return { ok: false, error: 'IP required' };
    blockedIPs.delete(key); // keep last block metadata when re-blocked
    const rec = { ip: key, at: Date.now(), by, reason: String(reason || '').slice(0, 200) };
    blockedIPs.set(key, rec);
    persistBlocked();
    addEvent({
        type: 'IP_BLOCKED',
        severity: 'high',
        message: `IP ${key} blocked from the entire platform${reason ? ` — ${reason}` : ''}`,
        ip: key,
        meta: { by, reason }
    });
    return { ok: true, blocked: [...blockedIPs.values()] };
}

function unblockIP(ip, { by = 'admin' } = {}) {
    const key = String(ip || '').trim();
    if (!blockedIPs.delete(key)) return { ok: false, error: 'IP not blocked' };
    persistBlocked();
    addEvent({
        type: 'IP_UNBLOCKED',
        severity: 'info',
        message: `IP ${key} unblocked — platform access restored`,
        ip: key,
        meta: { by }
    });
    return { ok: true, blocked: [...blockedIPs.values()] };
}

function listBlocked() {
    return [...blockedIPs.values()].sort((a, b) => b.at - a.at);
}

// IPs that crossed the admin brute-force threshold (5 failures in 10m) —
// flagged for blocking in the SIEM console but NOT auto-choked.
function flaggedIPs() {
    const out = [];
    for (const [ip, arr] of authFailWindow) {
        if (Array.isArray(arr) && arr.length >= AUTH_FAIL_LIMIT) {
            out.push({ ip, attempts: arr.length, lastAt: arr[arr.length - 1] });
        }
    }
    return out.sort((a, b) => b.lastAt - a.lastAt);
}

// Successful admin sign-in clears the failure window for that IP so a
// stale half-window can never linger as a false "flagged" chip.
function clearFailures(ip) {
    authFailWindow.delete(String(ip || ''));
}

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
    blockIP,
    unblockIP,
    isBlocked,
    listBlocked,
    flaggedIPs,
    clearFailures,
    setBroadcaster: (fn) => { broadcast = fn; }
};
