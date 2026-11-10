/**
 * Minimal Supabase REST helper for durable stores — same auth pattern
 * profiles.js uses (service-role key over REST fetch), trimmed to the three
 * operations the mail stores need: upsert, patch, select.
 *
 * Every call is failure-tolerant: Supabase being off or unreachable returns
 * null/false and logs a warning — stores must never break the mail path.
 */
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_ENABLED = !!(SUPABASE_URL && SUPABASE_KEY);

async function supabaseFetch(path, options = {}, retries = 1) {
    if (!SUPABASE_ENABLED) return null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 15000);
            try {
                const res = await fetch(`${SUPABASE_URL}${path}`, {
                    ...options,
                    signal: controller.signal,
                    headers: {
                        apikey: SUPABASE_KEY,
                        Authorization: `Bearer ${SUPABASE_KEY}`,
                        'Content-Type': 'application/json',
                        ...(options.headers || {})
                    }
                });
                if (!res.ok) {
                    const body = await res.text().catch(() => '');
                    console.warn(`[SupabaseRest] ${path} → ${res.status} ${body.slice(0, 200)}`);
                    return null;
                }
                return res;
            } finally {
                clearTimeout(timer);
            }
        } catch (e) {
            if (attempt === retries) {
                console.warn(`[SupabaseRest] ${path} → ${e.message}`);
                return null;
            }
        }
    }
    return null;
}

/** Upsert full rows (merge on the conflict column). */
async function supabaseUpsert(table, rows, conflictColumn = 'id') {
    if (!Array.isArray(rows) || rows.length === 0) return false;
    const res = await supabaseFetch(`/rest/v1/${table}?on_conflict=${conflictColumn}`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(rows)
    });
    return !!res;
}

/** Patch partial columns on matched rows — never resets untouched columns. */
async function supabasePatch(table, matchPath, columns) {
    const res = await supabaseFetch(`/rest/v1/${table}?${matchPath}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(columns)
    });
    return !!res;
}

/** Select rows; returns an array, or null when Supabase is off/unreachable. */
async function supabaseSelect(query) {
    // Decide once: accept BOTH `'transactions?select=...'` (canonical) and a
    // legacy `/rest/v1/transactions?...` form so doubled prefixes cannot
    // happen again (ledger/notifications were 404ing on exactly that).
    const q = String(query || '').replace(/^\/?(rest\/v1\/)+/, '');
    const res = await supabaseFetch(`/rest/v1/${q}`, {
        method: 'GET',
        headers: { Accept: 'application/json' }
    });
    if (!res) return null;
    try { return await res.json(); } catch { return null; }
}

/** Delete rows matching a Supabase filter path — returns true on success. */
async function supabaseDelete(table, matchPath) {
    const res = await supabaseFetch(`/rest/v1/${table}?${matchPath}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }
    });
    return !!res;
}

module.exports = { SUPABASE_ENABLED, supabaseUpsert, supabasePatch, supabaseSelect, supabaseDelete };
