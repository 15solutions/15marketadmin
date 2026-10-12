const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Email/password credentials for natively registered users ────────────
// Bayse-style email signup collects a password. Privy has no password auth,
// so the password lives HERE (scrypt hash, file-backed like profiles) and a
// successful password login mints a Privy custom JWT, landing the user back
// in the SAME Privy identity + embedded wallet as the OTP path.
//
// Security notes, read before touching:
// - File-backed (data/auth.json, gitignored with nexus-core/data/). Single
//   instance only: two processes would diverge. Move to a table if scaled.
// - Password hashes are NEVER returned by any endpoint and NEVER enter the
//   profiles store (which syncs to Supabase and is partly anon-readable).
// - set-password is first-write-wins + old-password-change-only, rate
//   limited. Residual risk (pre-registration squatting denies password
//   setup, never grants access — minting requires the stored privyUserId,
//   which an attacker cannot know) is documented, not solved, here.
// - Login is rate limited per email; brute force is the main threat model.

const DATA_DIR = path.join(__dirname, '..', 'data');
const AUTH_PATH = path.join(DATA_DIR, 'auth.json');

try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) { }

function loadCredentials() {
    try {
        if (fs.existsSync(AUTH_PATH)) {
            const data = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));
            if (data && typeof data === 'object') return data;
        }
    } catch (e) {
        console.warn('[Auth] Failed to load credentials:', e.message);
    }
    return {};
}

function saveCredentials(creds) {
    try {
        fs.writeFileSync(AUTH_PATH, JSON.stringify(creds));
    } catch (e) {
        console.warn('[Auth] Failed to save credentials:', e.message);
    }
}

// scrypt parameters: ~50ms per hash on commodity hardware. Fast enough for
// login UX, expensive enough to blunt offline brute force combined with the
// per-email rate limit below.
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, keyLen: 64 };

function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, SCRYPT_OPTS.keyLen, { N: SCRYPT_OPTS.N, r: SCRYPT_OPTS.r, p: SCRYPT_OPTS.p });
    return `scrypt$${SCRYPT_OPTS.N}$${SCRYPT_OPTS.r}$${SCRYPT_OPTS.p}$${salt}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
    try {
        const parts = String(stored || '').split('$');
        if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
        const N = parseInt(parts[1], 10);
        const r = parseInt(parts[2], 10);
        const p = parseInt(parts[3], 10);
        const salt = parts[4];
        const expected = Buffer.from(parts[5], 'hex');
        if (!Number.isFinite(N) || !salt || expected.length === 0) return false;
        const hash = crypto.scryptSync(String(password || ''), salt, expected.length, { N, r, p });
        return crypto.timingSafeEqual(hash, expected);
    } catch (e) {
        return false;
    }
}

function validPassword(password) {
    return typeof password === 'string' && password.length >= 8 && password.length <= 128;
}

// ─── Rate limiting (in-process; single instance, see note above) ──────────
const loginAttempts = new Map(); // email -> { count, lockedUntil }
const setAttempts = new Map(); // addr -> timestamps[]

function loginAllowed(email) {
    const key = String(email || '').toLowerCase();
    const rec = loginAttempts.get(key);
    if (rec && Date.now() < rec.lockedUntil) return false;
    return true;
}

function recordLoginFailure(email) {
    const key = String(email || '').toLowerCase();
    const rec = loginAttempts.get(key) || { count: 0, lockedUntil: 0 };
    rec.count += 1;
    if (rec.count >= 5) {
        rec.lockedUntil = Date.now() + 10 * 60 * 1000;
        rec.count = 0;
    }
    loginAttempts.set(key, rec);
}

function recordLoginSuccess(email) {
    loginAttempts.delete(String(email || '').toLowerCase());
}

function setAllowed(addr) {
    const key = String(addr || '').toLowerCase();
    const now = Date.now();
    const ts = (setAttempts.get(key) || []).filter(t => now - t < 10 * 60 * 1000);
    if (ts.length >= 5) return false;
    ts.push(now);
    setAttempts.set(key, ts);
    return true;
}

// ─── Credential store API ─────────────────────────────────────────────────
function getCredentialByAddress(address) {
    const creds = loadCredentials();
    return creds[String(address || '').toLowerCase()] || null;
}

function getCredentialByEmail(email) {
    const creds = loadCredentials();
    const key = String(email || '').toLowerCase();
    for (const addr of Object.keys(creds)) {
        if (String(creds[addr].email || '').toLowerCase() === key) {
            return { address: addr, ...creds[addr] };
        }
    }
    return null;
}

function setCredential({ address, privyUserId, email, password }) {
    const creds = loadCredentials();
    const addr = String(address || '').toLowerCase();
    creds[addr] = {
        privyUserId: String(privyUserId || ''),
        email: String(email || '').toLowerCase(),
        hash: hashPassword(password),
        createdAt: creds[addr]?.createdAt || Date.now(),
        updatedAt: Date.now()
    };
    saveCredentials(creds);
    return true;
}

// ─── Custom JWT minting (Privy custom auth) ───────────────────────────────
// The frontend exchanges this token via linkWithCustomJwt and lands in the
// SAME Privy user (by sub = privyUserId) as the OTP path — one identity,
// one embedded wallet, whichever way the user logs in.
//
// Requires, once, in the Privy dashboard + env:
//   CUSTOM_JWT_ISSUER  - must match the issuer/JWKS trust you configure in
//                        Privy dashboard custom-auth settings
//   CUSTOM_JWT_AUDIENCE - the audience Privy expects (your Privy app id)
//   CUSTOM_AUTH_EC_PRIV_PEM - path to a prime256v1 EC private key whose public
//                        half is registered with Privy:
//                        openssl ecparam -genkey -name prime256v1 -noout \
//                          -out custom-auth-priv.pem
//                        openssl ec -in custom-auth-priv.pem -pubout \
//                          -out custom-auth-pub.pem
// Without these, minting throws a clear configuration error (never a token).
function base64url(buf) {
    return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function mintCustomJwt(privyUserId) {
    const issuer = process.env.CUSTOM_JWT_ISSUER || '';
    const audience = process.env.CUSTOM_JWT_AUDIENCE || '';
    const keyPath = process.env.CUSTOM_AUTH_EC_PRIV_PEM || '';
    if (!issuer || !audience || !keyPath) {
        throw new Error('Password login is not configured (CUSTOM_JWT_ISSUER / CUSTOM_JWT_AUDIENCE / CUSTOM_AUTH_EC_PRIV_PEM). Enable custom auth in the Privy dashboard first.');
    }
    let key;
    try {
        key = crypto.createPrivateKey(fs.readFileSync(keyPath, 'utf8'));
    } catch (e) {
        throw new Error('Password login misconfigured (unreadable private key).');
    }
    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'ES256', typ: 'JWT' }));
    const payload = base64url(JSON.stringify({
        iss: issuer,
        aud: audience,
        sub: String(privyUserId),
        iat: now,
        exp: now + 15 * 60
    }));
    const signingInput = `${header}.${payload}`;
    const sig = crypto.sign('sha256', Buffer.from(signingInput), key);
    // ES256 signatures must be raw R||S for JWT, not DER. Parse properly:
    // SEQ len [INT len R] [INT len S], tolerating long-form lengths.
    let idx = 0;
    if (sig[idx++] !== 0x30) throw new Error('Password login misconfigured (bad key type).');
    let seqLen = sig[idx++];
    if (seqLen & 0x80) idx += (seqLen & 0x7f);
    if (sig[idx++] !== 0x02) throw new Error('Password login misconfigured (bad key type).');
    const rLen = sig[idx++];
    const r = sig.slice(idx, idx + rLen);
    idx += rLen;
    if (sig[idx++] !== 0x02) throw new Error('Password login misconfigured (bad key type).');
    const sLen = sig[idx++];
    const s = sig.slice(idx, idx + sLen);
    // Strip DER zero-padding, then right-align into 32-byte halves.
    const norm = (b) => {
        let v = b;
        while (v.length > 1 && v[0] === 0) v = v.slice(1);
        if (v.length > 32) v = v.slice(v.length - 32);
        return v;
    };
    const rn = norm(r);
    const sn = norm(s);
    const raw = Buffer.alloc(64, 0);
    rn.copy(raw, 32 - rn.length);
    sn.copy(raw, 64 - sn.length);
    return `${signingInput}.${base64url(raw)}`;
}

module.exports = {
    validPassword,
    hashPassword,
    verifyPassword,
    loginAllowed,
    recordLoginFailure,
    recordLoginSuccess,
    setAllowed,
    getCredentialByAddress,
    getCredentialByEmail,
    setCredential,
    mintCustomJwt
};
