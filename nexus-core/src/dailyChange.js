// ─── Daily change for admin metrics / KPIs ────────────────────────────────
// Each metric is compared against its own value at the START of the current
// day (UTC). The baseline is the first reading taken on a new day, so every
// day starts fresh:
//
//   treasury 200 at day start, 400 now   →  +100%
//   next day starts at 400, now 0        →  -100%   (new day, new baseline)
//
// Baselines are persisted so a server restart mid-day does not reset the day.
// A metric whose baseline is 0 has no finite percentage: it reports 0 while
// it is still 0, and `null` once it has grown from nothing (shown as "NEW").

const fs = require('fs');
const path = require('path');

const STORE = path.join(__dirname, '..', 'data', 'daily-baseline.json');

const dayKey = (ts = Date.now()) => new Date(ts).toISOString().slice(0, 10); // UTC day

let state = { day: null, baseline: {} };
try {
    const stored = JSON.parse(fs.readFileSync(STORE, 'utf8'));
    if (stored && typeof stored.day === 'string' && stored.baseline && typeof stored.baseline === 'object') {
        state = { day: stored.day, baseline: stored.baseline };
    }
} catch (e) { /* first run: baseline is taken on the first reading */ }

let persistTimer = null;
function persist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        try {
            fs.mkdirSync(path.dirname(STORE), { recursive: true });
            fs.writeFileSync(STORE, JSON.stringify(state, null, 2));
        } catch (e) { /* disk is best-effort */ }
    }, 400);
}

let lastChanges = {};

/**
 * Feed the current metric values ({ key: number }); returns
 * { key: { pct, base } } where pct is the percent change since the start of
 * the day (a number), or null when it cannot be expressed as a percentage.
 */
function update(values, now = Date.now()) {
    const today = dayKey(now);
    let dirty = false;
    if (state.day !== today) {
        // New day: today's baseline is whatever each metric reads right now.
        state = { day: today, baseline: {} };
        dirty = true;
    }

    const out = {};
    for (const [key, raw] of Object.entries(values || {})) {
        const cur = Number(raw);
        if (!Number.isFinite(cur)) continue;
        if (!(key in state.baseline)) {
            state.baseline[key] = cur; // first reading of the day for this metric
            dirty = true;
        }
        const base = state.baseline[key];
        let pct;
        if (base === 0) pct = cur === 0 ? 0 : null; // grew from nothing: no finite %
        else pct = ((cur - base) / Math.abs(base)) * 100;
        out[key] = { pct, base };
    }
    if (dirty) persist();
    lastChanges = out;
    return out;
}

function latest() {
    return lastChanges;
}

module.exports = { update, latest, dayKey };
