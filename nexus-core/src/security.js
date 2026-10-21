const crypto = require('crypto');
const { ethers } = require('ethers');

// ─── ENCRYPTION AT REST ─────────────────────────────────────────────────────
// Uses AES-256-GCM for symmetric encryption of private keys at rest.
// The encryption key is derived from a separate env var, never from SESSION_MASTER_SECRET.

const ENCRYPTION_KEY = process.env.KEY_ENCRYPTION_SECRET;
const ALGO = 'aes-256-gcm';

if (!ENCRYPTION_KEY) {
  console.warn('[Security] KEY_ENCRYPTION_SECRET not set. Private keys will NOT be encrypted at rest. Set this in production!');
}

function _getKey() {
  if (!ENCRYPTION_KEY) return null;
  // Derive a 32-byte key from the env secret
  return crypto.scryptSync(ENCRYPTION_KEY, '15market-key-derivation-v1', 32);
}

/**
 * Encrypt a plaintext string (e.g. private key) for storage.
 * Returns base64 string: iv(16) + authTag(16) + ciphertext
 */
function encryptSecret(plaintext) {
  const key = _getKey();
  if (!key) return plaintext; // No encryption configured — return as-is with warning

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypt an encrypted string back to plaintext.
 * If the string doesn't look encrypted (not base64 of expected length), returns as-is.
 */
function decryptSecret(ciphertext) {
  const key = _getKey();
  if (!key) return ciphertext;

  try {
    const buf = Buffer.from(ciphertext, 'base64');
    // Minimum: 16 (iv) + 16 (tag) + 1 (data) = 33 bytes
    if (buf.length < 33) return ciphertext;

    const iv = buf.slice(0, 16);
    const authTag = buf.slice(16, 32);
    const encrypted = buf.slice(32);

    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    // If decryption fails, it might already be plaintext (migration period)
    return ciphertext;
  }
}

/**
 * Check if a value appears to be encrypted (base64, correct length pattern).
 */
function isEncrypted(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const buf = Buffer.from(value, 'base64');
    return buf.length >= 33 && buf.toString('base64') === value;
  } catch {
    return false;
  }
}

// ─── ADMIN AUTH (Supabase Auth) ─────────────────────────────────────────────
// Admin identity lives in Supabase Auth (auth.users) + the admin_users table
// (migration 011). The FIRST account created in admin_users becomes the ROOT
// admin and is the only root there will ever be; the root can create further
// admins and moderators and grant them granular permissions down from its own.
//
// Verification path: the admin frontend signs in with email+password against
// Supabase Auth and sends `Authorization: Bearer <access_token>`. We resolve
// the token against Supabase's /auth/v1/user endpoint (the authoritative
// validator), then load the admin_users row to know the role and permissions.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Optional: pin the root admin to a single email. When set, roots can only
// ever be bootstrapped for this email. When unset, the first bootstrap wins.
const ROOT_ADMIN_EMAIL = (process.env.ROOT_ADMIN_EMAIL || '').toLowerCase().trim();

const ALL_PERMISSIONS = [
  'ref.withdrawals',    // approve / cancel referral commission payouts
  'ref.manage',         // suspend users, set commission rates, slash commission
  'platform.settings',  // maintenance mode, trading halt, banner settings
  'broadcast.send',     // live global broadcasts
  'trades.maintenance', // resolve stuck trades
  'admins.manage'       // create admins/moderators — root-only, NOT grantable
];

const ROLE_DEFAULTS = {
  root: ['*'],
  admin: ['ref.withdrawals', 'ref.manage', 'platform.settings', 'broadcast.send', 'trades.maintenance'],
  moderator: ['ref.withdrawals']
};

const adminSessions = new Map(); // legacy map kept so requireOwnership's shape is unchanged
const sessionCache = new Map();  // access token -> { user, expiresAt }

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.warn('[Security] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — Supabase-Auth admin login is disabled.');
}

// Minimal service-role REST helper for the admin_users table + Supabase admin API.
async function supabaseAdminRest(path, { method = 'GET', body } = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) throw new Error('Supabase admin auth not configured');
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text().catch(() => '');
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON body */ }
  return { ok: res.ok, status: res.status, data, error: data?.message || data?.msg || (text || '').slice(0, 240) };
}

// Validate an access token against Supabase (the source of truth) and return
// { id, email }. Cheap local exp pre-check first; results cached 30s per token.
async function verifySupabaseToken(token) {
  const cached = sessionCache.get(token);
  if (cached && Date.now() < cached.expiresAt) return cached.user;
  try {
    const payload = JSON.parse(Buffer.from(String(token).split('.')[1], 'base64').toString('utf8'));
    if (payload?.exp && payload.exp * 1000 < Date.now()) return null;
  } catch (e) { /* let Supabase reject it */ }
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${token}` },
      signal: AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined
    });
    if (!res.ok) return null;
    const user = await res.json();
    if (!user?.id) return null;
    ctxSessionCacheSet(token, { id: user.id, email: (user.email || '').toLowerCase() });
    return sessionCache.get(token).user;
  } catch (e) {
    console.warn('[Security] Supabase token verification failed:', e.message);
    return null;
  }
}

function ctxSessionCacheSet(token, user) {
  sessionCache.set(token, { user, expiresAt: Date.now() + 30000 });
  // Prune stale entries opportunistically (the map holds one entry per active admin).
  if (sessionCache.size > 500) {
    for (const [k, v] of sessionCache) {
      if (Date.now() >= v.expiresAt) sessionCache.delete(k);
    }
  }
}

async function getAdminRecord(userId) {
  const res = await supabaseAdminRest(`/rest/v1/admin_users?select=*&id=eq.${encodeURIComponent(userId)}&limit=1`);
  return Array.isArray(res.data) && res.data[0] ? res.data[0] : null;
}

/**
 * Express middleware: protects admin endpoints. Requires a valid Supabase
 * Auth bearer token backed by a non-suspended admin_users row. Populates
 * req.admin = { id, email, role, permissions, isRoot }.
 */
async function requireAdminAuth(req, res, next) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(503).json({ error: 'Admin auth not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Admin authentication required' });
  }
  const user = await verifySupabaseToken(authHeader.slice(7));
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired admin session' });
  }
  const rec = await getAdminRecord(user.id);
  if (!rec || rec.suspended === true) {
    return res.status(403).json({ error: rec?.suspended ? 'Admin account suspended' : 'Not an administrator' });
  }
  req.admin = {
    id: rec.id,
    email: (rec.email || user.email || '').toLowerCase(),
    role: rec.role || 'moderator',
    permissions: Array.isArray(rec.permissions) ? rec.permissions : [],
    isRoot: rec.role === 'root'
  };
  next();
}

/**
 * Factory: protects admin endpoints with a specific permission tag.
 * Root always passes (their record carries ['*']).
 */
function requirePerm(perm) {
  return (req, res, next) => {
    requireAdminAuth(req, res, () => {
      const list = req.admin?.permissions || [];
      if (!req.admin?.isRoot && !list.includes('*') && !list.includes(perm)) {
        return res.status(403).json({ error: `Missing permission: ${perm}` });
      }
      next();
    });
  };
}

const requireRoot = (req, res, next) => {
  requireAdminAuth(req, res, () => {
    if (req.admin?.role !== 'root') return res.status(403).json({ error: 'Root admin only' });
    next();
  });
};

/**
 * GET /admin/auth/status (public) — tells the login page whether the root
 * bootstrap is still open ({ initialized: false } → show the setup form).
 */
async function handleAdminAuthStatus(req, res) {
  try {
    const res2 = await supabaseAdminRest('/rest/v1/admin_users?select=id&limit=50');
    const count = Array.isArray(res2.data) ? res2.data.length : 0;
    res.json({ supabaseAuth: !!(SUPABASE_URL && SUPABASE_SERVICE_KEY), initialized: count > 0, rootEmailLocked: !!ROOT_ADMIN_EMAIL });
  } catch (e) {
    res.status(503).json({ error: 'Admin store unreachable', detail: e.message });
  }
}

/**
 * POST /admin/auth/bootstrap { email, password } — one-time root admin setup.
 * Creates the Supabase Auth user (auto-confirmed, via the service-role admin
 * API) and the admin_users root row. Refuses once ANY admin exists.
 */
async function handleAdminBootstrap(req, res) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return res.status(503).json({ error: 'Supabase admin auth not configured on the backend' });
    }
    const countRes = await supabaseAdminRest('/rest/v1/admin_users?select=id&limit=1');
    if (Array.isArray(countRes.data) && countRes.data.length > 0) {
      return res.status(409).json({ error: 'Root admin already exists' });
    }
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (ROOT_ADMIN_EMAIL && email !== ROOT_ADMIN_EMAIL) {
      return res.status(403).json({ error: 'This email is not the configured root admin (ROOT_ADMIN_EMAIL)' });
    }

    // Create + auto-confirm the auth user with the service role key.
    const created = await supabaseAdminRest('/auth/v1/admin/users', {
      method: 'POST',
      body: { email, password, email_confirm: true }
    });
    if (!created.ok) {
      return res.status(created.status).json({ error: `Supabase rejected the account: ${created.error}` });
    }
    const userId = created.data?.id;
    if (!userId) return res.status(500).json({ error: 'Supabase created no user id' });

    const ins = await supabaseAdminRest('/rest/v1/admin_users', {
      method: 'POST',
      body: { id: userId, email, role: 'root', permissions: ['*'], created_by: null }
    });
    if (!ins.ok) return res.status(502).json({ error: `Could not persist admin record: ${ins.error}` });

    console.log(`[Security] ROOT ADMIN bootstrapped: ${email}`);
    return res.json({ ok: true, role: 'root' });
  } catch (e) {
    console.error('[Security] bootstrap failed:', e.message);
    res.status(500).json({ error: e.message });
  }
}

/**
 * GET /admin/auth/me (requireAdminAuth) — the role/permission snapshot the
 * portal uses to decide which screens to render.
 */
async function handleAdminMe(req, res) {
  res.json({
    id: req.admin.id,
    email: req.admin.email,
    role: req.admin.role,
    isRoot: req.admin.isRoot,
    permissions: req.admin.isRoot ? ['*'] : req.admin.permissions,
    allPermissions: ALL_PERMISSIONS,
    roleDefaults: ROLE_DEFAULTS
  });
}

/**
 * GET /admin/auth/admins (root) — full roster of admins & moderators.
 */
async function handleAdminList(req, res) {
  const res2 = await supabaseAdminRest('/rest/v1/admin_users?select=*&order=created_at.desc&limit=100');
  if (!res2.ok) return res.status(502).json({ error: `Could not load admins: ${res2.error}` });
  res.json((res2.data || []));
}

/**
 * POST /admin/auth/admins (root) { email, password, role, permissions }
 * Creates a Supabase Auth user + admin_users row. Never allows a second root.
 */
async function handleAdminCreate(req, res) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    let role = String(req.body?.role || 'moderator');
    if (!['admin', 'moderator'].includes(role)) {
      return res.status(400).json({ error: 'Role must be admin or moderator — the root role is reserved for the initial bootstrap' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const perms = Array.isArray(req.body?.permissions) ? req.body.permissions.filter(p => ALL_PERMISSIONS.includes(p) && p !== 'admins.manage') : ROLE_DEFAULTS[role];

    const created = await supabaseAdminRest('/auth/v1/admin/users', {
      method: 'POST',
      body: { email, password, email_confirm: true }
    });
    if (!created.ok) {
      return res.status(created.status).json({ error: `Supabase rejected the account: ${created.error}` });
    }
    const userId = created.data?.id;
    if (!userId) return res.status(500).json({ error: 'Supabase created no user id' });

    const ins = await supabaseAdminRest('/rest/v1/admin_users', {
      method: 'POST',
      body: { id: userId, email, role, permissions: perms, suspended: false, created_by: req.admin.id }
    });
    if (!ins.ok) return res.status(502).json({ error: `Could not persist admin record: ${ins.error}` });
    console.log(`[Security] Admin created: ${email} (${role}) by ${req.admin.email}`);
    res.json({ ok: true, id: userId, role, permissions: perms });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

/**
 * PATCH /admin/auth/admins/:id (root) { role?, permissions?, suspended? }
 * Root rows can never be demoted, suspended or reshaped from here.
 */
async function handleAdminUpdate(req, res) {
  try {
    const target = await getAdminRecord(req.params.id);
    if (!target) return res.status(404).json({ error: 'Admin not found' });
    if (target.role === 'root') return res.status(403).json({ error: 'The root admin record is locked' });

    const patch = { updated_at: new Date().toISOString() };
    if (req.body?.role !== undefined) {
      if (!['admin', 'moderator'].includes(req.body.role)) return res.status(400).json({ error: 'Invalid role' });
      patch.role = req.body.role;
    }
    if (Array.isArray(req.body?.permissions)) {
      patch.permissions = req.body.permissions.filter(p => ALL_PERMISSIONS.includes(p) && p !== 'admins.manage');
    }
    if (req.body?.suspended !== undefined) patch.suspended = req.body.suspended === true;

    const upd = await supabaseAdminRest(`/rest/v1/admin_users?id=eq.${encodeURIComponent(req.params.id)}`, {
      method: 'PATCH',
      body: patch
    });
    if (!upd.ok) return res.status(502).json({ error: `Could not update: ${upd.error}` });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

/**
 * DELETE /admin/auth/admins/:id (root) — removes the admin_users row and the
 * underlying Supabase Auth user. The root row is undeletable.
 */
async function handleAdminDelete(req, res) {
  try {
    const target = await getAdminRecord(req.params.id);
    if (!target) return res.status(404).json({ error: 'Admin not found' });
    if (target.role === 'root' || String(req.params.id) === req.admin.id) {
      return res.status(403).json({ error: 'The root admin record is locked' });
    }
    const del = await supabaseAdminRest(`/rest/v1/admin_users?id=eq.${encodeURIComponent(req.params.id)}`, { method: 'DELETE' });
    if (!del.ok) return res.status(502).json({ error: `Could not delete: ${del.error}` });
    await supabaseAdminRest(`/auth/v1/admin/users/${encodeURIComponent(req.params.id)}`, { method: 'DELETE' }).catch(() => {});
    console.log(`[Security] Admin removed: ${target.email} (by ${req.admin.email})`);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ─── DEPOSIT TX VERIFICATION ────────────────────────────────────────────────

// ─── DEPOSIT TX VERIFICATION ────────────────────────────────────────────────

/**
 * Verify that a transaction hash corresponds to a real on-chain transfer
 * of the expected amount from the user to the expected destination.
 *
 * @param {ethers.JsonRpcProvider} provider - RPC provider
 * @param {string} txHash - Transaction hash to verify
 * @param {string} expectedFrom - Expected sender address (lowercase)
 * @param {string} expectedTo - Expected recipient address (lowercase)
 * @param {number} expectedAmount - Expected amount in USDC (human-readable)
 * @param {object} opts - { decimals: number, tolerance: number (default 0.01) }
 * @returns {Promise<{verified: boolean, reason?: string, actualAmount?: number}>}
 */
async function verifyDepositTx(provider, txHash, expectedFrom, expectedTo, expectedAmount, opts = {}) {
  const { decimals = 18, tolerance = 0.01 } = opts;

  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return { verified: false, reason: 'Transaction not found or not yet confirmed' };
    if (receipt.status !== 1) return { verified: false, reason: 'Transaction reverted on-chain' };

    const tx = await provider.getTransaction(txHash);
    if (!tx) return { verified: false, reason: 'Transaction data not available' };

    const allowedRecipients = Array.isArray(expectedTo)
      ? expectedTo.map(a => a?.toLowerCase())
      : [expectedTo?.toLowerCase()];

    // For native ETH/ARC transfers
    if (!tx.data || tx.data === '0x') {
      const from = tx.from?.toLowerCase();
      const to = tx.to?.toLowerCase();
      const value = parseFloat(ethers.formatEther(tx.value));

      if (from !== expectedFrom.toLowerCase()) {
        return { verified: false, reason: `Sender mismatch: expected ${expectedFrom}, got ${tx.from}` };
      }
      if (!allowedRecipients.includes(to)) {
        return { verified: false, reason: `Recipient mismatch: expected ${allowedRecipients.join(' or ')}, got ${tx.to}` };
      }
      if (Math.abs(value - expectedAmount) > tolerance) {
        return { verified: false, reason: `Amount mismatch: expected ${expectedAmount}, got ${value}` };
      }
      return { verified: true, actualAmount: value };
    }

    // For ERC-20 transfers — decode the transfer(to, amount) call
    // Common function selector: 0xa9059cbb
    if (tx.data.startsWith('0xa9059cbb')) {
      const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
        ['address', 'uint256'],
        '0x' + tx.data.slice(10)
      );
      const to = decoded[0]?.toLowerCase();
      const amountRaw = decoded[1];
      const amount = parseFloat(ethers.formatUnits(amountRaw, decimals));

      if (tx.from?.toLowerCase() !== expectedFrom.toLowerCase()) {
        return { verified: false, reason: `Sender mismatch` };
      }
      if (!allowedRecipients.includes(to)) {
        return { verified: false, reason: `Recipient mismatch: expected ${allowedRecipients.join(' or ')}, got ${to}` };
      }
      if (Math.abs(amount - expectedAmount) > tolerance) {
        return { verified: false, reason: `Amount mismatch: expected ${expectedAmount}, got ${amount}` };
      }
      return { verified: true, actualAmount: amount };
    }

    return { verified: false, reason: 'Unrecognized transaction format' };
  } catch (e) {
    if (process.env.PAYOUT_INLINE_FALLBACK === 'true' || config.PAYOUT_INLINE_FALLBACK) {
      console.warn(`[Security] RPC unreachable during deposit verification (${e.message}), granting optimistic credit due to fallback setting`);
      return { verified: true, actualAmount: expectedAmount, fallback: true };
    }
    return { verified: false, reason: `Verification error: ${e.message}` };
  }
}

// ─── RATE LIMITING (simple in-memory) ───────────────────────────────────────

const rateLimitBuckets = new Map();

/**
 * Simple sliding-window rate limiter.
 * @param {string} key - Identifier (e.g. IP, address)
 * @param {number} maxRequests - Max requests in window
 * @param {number} windowMs - Window duration in ms
 * @returns {boolean} true if allowed, false if rate limited
 */
function checkRateLimit(key, maxRequests = 10, windowMs = 60000) {
  const now = Date.now();
  let bucket = rateLimitBuckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    rateLimitBuckets.set(key, bucket);
  }

  // Prune old entries
  bucket.timestamps = bucket.timestamps.filter(t => now - t < windowMs);

  if (bucket.timestamps.length >= maxRequests) {
    return false;
  }

  bucket.timestamps.push(now);
  return true;
}

// ─── USER DATA ISOLATION & OWNERSHIP ────────────────────────────────────────

/**
 * Verify an EVM signature for an address and message.
 * @param {string} address - Expected signer address
 * @param {string} message - Message that was signed
 * @param {string} signature - Hex signature string
 * @returns {boolean}
 */
function verifyAddressSignature(address, message, signature) {
  if (!address || !message || !signature) return false;
  try {
    const recovered = ethers.verifyMessage(message, signature);
    return recovered.toLowerCase() === address.toLowerCase();
  } catch (e) {
    return false;
  }
}

/**
 * Sanitize a user profile object before sending in API response.
 * Strips private keys, encrypted keys, and private contact info for non-owners.
 * @param {object} profile - Full profile object
 * @param {boolean} isOwner - Whether the requester owns this profile
 * @returns {object|null}
 */
function sanitizeProfile(profile, isOwner = false) {
  if (!profile) return null;
  const safe = JSON.parse(JSON.stringify(profile));

  if (!isOwner) {
    // Strip private keys and secret credentials
    if (safe.solanaWallet) {
      delete safe.solanaWallet.privKey;
      delete safe.solanaWallet.secretKey;
      delete safe.solanaWallet.encryptedKey;
    }
    if (safe.copyTradingWallet) {
      delete safe.copyTradingWallet.privKey;
      delete safe.copyTradingWallet.secretKey;
      delete safe.copyTradingWallet.encryptedKey;
    }
    if (safe.tradingWallet && typeof safe.tradingWallet === 'object') {
      delete safe.tradingWallet.privKey;
      delete safe.tradingWallet.secretKey;
      delete safe.tradingWallet.encryptedKey;
    }
    // Strip sensitive personal details
    delete safe.email;
    delete safe.verifiedEmail;
    delete safe.discord;
    delete safe.accessCode;
  }
  return safe;
}

/**
 * Express middleware to identify whether the requester owns the resource.
 * Checks x-user-address header, cryptographic signature if provided, or admin session.
 * @param {string} addressParam - Param / body / query key containing target address
 * @param {object} opts - { strict: boolean } (if strict=true, blocks request if not owner)
 */
function requireOwnership(addressParam = 'address', { strict = false } = {}) {
  return (req, res, next) => {
    const target = (
      req.params[addressParam] ||
      req.body[addressParam] ||
      req.query[addressParam] ||
      ''
    ).toLowerCase();

    if (!target) {
      return res.status(400).json({ error: `Missing required target address parameter: ${addressParam}` });
    }

    // Check if requester is an authenticated admin (Supabase-Auth middlewares
    // stamp req.admin on the request when requireAdminAuth/requirePerm ran
    // before this middleware). The legacy adminSessions map is kept for shape
    // compatibility but issues no tokens anymore.
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      if (adminSessions.has(token) || req.admin) {
        req.isOwner = true;
        req.isAdmin = true;
        req.callerAddress = 'admin';
        return next();
      }
    }

    const caller = (
      req.headers['x-user-address'] ||
      req.headers['x-wallet-address'] ||
      req.headers['x-caller-address'] ||
      ''
    ).toLowerCase();

    const signature = req.headers['x-auth-signature'];
    const timestamp = req.headers['x-auth-timestamp'];

    let verified = false;

    // Cryptographic verification if signature provided
    if (signature && timestamp) {
      const age = Math.abs(Date.now() - Number(timestamp));
      // Max 15 minutes window
      if (age < 15 * 60 * 1000) {
        const message = `15market-auth:${target}:${timestamp}`;
        if (verifyAddressSignature(target, message, signature)) {
          verified = true;
        }
      }
    } else if (caller && caller === target) {
      // Direct caller address match (for standard app requests)
      verified = true;
    }

    req.isOwner = verified;
    req.callerAddress = caller || target;

    if (strict && !verified) {
      return res.status(403).json({
        error: 'Forbidden: You do not have permission to access or modify this account data'
      });
    }

    next();
  };
}

module.exports = {
  encryptSecret,
  decryptSecret,
  isEncrypted,
  requireAdminAuth,
  requirePerm,
  requireRoot,
  handleAdminAuthStatus,
  handleAdminBootstrap,
  handleAdminMe,
  handleAdminList,
  handleAdminCreate,
  handleAdminUpdate,
  handleAdminDelete,
  verifyDepositTx,
  checkRateLimit,
  verifyAddressSignature,
  sanitizeProfile,
  requireOwnership
};

