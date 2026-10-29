// Supabase-Auth session helpers for the admin portal.
// The portal is the only consumer of Supabase Auth in the app: admins sign in
// with email+password (REST, no SDK needed) and every admin API call carries
// `Authorization: Bearer <access_token>` — the backend validates the token
// against Supabase and the admin_users row (migrations 011).
import { SUPABASE_AUTH_URL, SUPABASE_ANON_KEY, KEEPER_URL_ARC } from "../constants";

export const ADMIN_SESSION_KEY = '15market_admin_session_v1';

export function getSession() {
    try {
        const raw = localStorage.getItem(ADMIN_SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

export function saveSession(data) {
    try { localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(data)); } catch (e) {}
}

export function clearSession() {
    try { localStorage.removeItem(ADMIN_SESSION_KEY); } catch (e) {}
}

export function sessionValid(session = getSession()) {
    if (!session?.accessToken) return false;
    if (session.expiresAt && Date.now() > session.expiresAt - 30000) return false;
    return true;
}

/**
 * Email+password sign-in — PROXIED through the backend `/admin/auth/login`.
 *
 * The grant used to fire straight from the browser to Supabase, which meant
 * the backend never saw a failed attempt and the SIEM brute-force watcher
 * (5 failures → flag for blocking) was blind in production. Behind the proxy
 * the backend tracks every failure against the caller's IP before handing
 * the same { user, session } payload back.
 */
export async function loginWithPassword(email, password) {
    let res;
    try {
        res = await fetch(`${KEEPER_URL_ARC}/admin/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
            signal: AbortSignal.timeout(15000),
        });
    } catch (e) {
        const isTimeout = e?.name === 'TimeoutError' || e?.name === 'AbortError';
        const hint = isTimeout
            ? 'The request timed out.'
            : 'Could not reach the platform security gateway.';
        throw new Error(`${hint}`);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = data.error_description || data.error || data.msg || 'Invalid email or password';
        throw new Error(String(msg).replace(/^Invalid login credentials$/i, 'Invalid email or password'));
    }
    // Never persist a token-less session: it would pass the login step and then
    // fail silently on the first authenticated call.
    if (!(data.session?.access_token || data.access_token)) {
        throw new Error('Sign-in succeeded but no session was returned. Please try again.');
    }
    saveSession({
        accessToken: data.session?.access_token || data.access_token,
        refreshToken: data.session?.refresh_token || data.refresh_token,
        expiresAt: Date.now() + (data.session?.expires_in || data.expires_in || 3600) * 1000,
        email: data.user?.email || ''
    });
    return data;
}

/** Rotate the access token with the refresh token (called opportunistically). */
export async function refreshSession() {
    const session = getSession();
    if (!session?.refreshToken) throw new Error('No session to refresh');
    const res = await fetch(`${SUPABASE_AUTH_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refreshToken })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error('Session expired');
    saveSession({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
        email: data.user?.email || session.email
    });
    return data;
}

/** fetch() wrapper that always carries the admin bearer token. 401s clear the session. */
export async function adminFetch(url, opts = {}) {
    let session = getSession();
    if (!sessionValid(session) && session?.refreshToken) {
        try { await refreshSession(); session = getSession(); } catch (e) { clearSession(); }
    }
    const res = await fetch(url, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            ...opts.headers,
            Authorization: `Bearer ${session?.accessToken || ''}`
        }
    });
    if (res.status === 401) {
        // Token can no longer be trusted — force the login screen.
        clearSession();
    }
    return res;
}
