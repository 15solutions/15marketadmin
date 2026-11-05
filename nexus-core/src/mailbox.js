/**
 * Mail inbound — the receiving end of support@15market.online.
 *
 * Resend's inbound parse turns the domain into a real mailbox: any email sent
 * to @15market.online lands as a `POST /mail/inbound` webhook on this backend
 * (the catch-all endpoint configured in the Resend dashboard). The payload is
 * signed with Svix — `RESEND_WEBHOOK_SECRET` holds the signing secret.
 *
 * Storage mirrors the outbox (notificationService): a 200-message ring buffer,
 * mirrored to disk so the console's inbox survives restarts. Every record
 * carries the full stored HTML so the Mail reader pane can preview the email
 * exactly as the sender wrote it.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INBOX_PATH = path.join(__dirname, '..', 'data', 'email-inbox.json');

let inbox = [];
try {
    const stored = JSON.parse(fs.readFileSync(INBOX_PATH, 'utf8'));
    if (Array.isArray(stored)) inbox = stored.slice(0, 200);
} catch { /* first boot */ }

function persist() {
    try { fs.writeFileSync(INBOX_PATH, JSON.stringify(inbox)); } catch { /* disk */ }
}

/** First plain-text-ish preview line of a received email (list rows). */
function previewOf(text, html) {
    if (text && text.trim()) return text.replace(/\s+/g, ' ').trim().slice(0, 160);
    const body = String(html || '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]*>/g, ' ');
    return body.replace(/\s+/g, ' ').trim().slice(0, 160);
}

/**
 * Resend inbound-parse webhook payload → normalized inbox record.
 * Tolerant to both shapes: `{ type, data: {...} }` (webhook events) and a bare
 * email object. Duplicate email ids (Resend retry redelivery) are ignored.
 */
function recordInbound(payload = {}) {
    const d = payload.data || payload;
    const fromRaw = String(d.from || 'unknown@unknown');
    let fromName = '';
    let fromAddr = '';
    const m = fromRaw.match(/^(.*?)\s*<([^>]+)>\s*$/);
    if (m) {
        fromName = m[1].trim().replace(/^"|"$/g, '');
        fromAddr = m[2].trim().toLowerCase();
    } else {
        fromAddr = fromRaw.trim().toLowerCase();
        fromName = fromAddr.split('@')[0] || fromAddr;
    }

    const text = String(d.text || '');
    const rec = {
        id: String(d.email_id || d.id || `inb_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`),
        from: fromRaw,
        fromName,
        fromAddr,
        to: Array.isArray(d.to) ? d.to.join(', ') : String(d.to || ''),
        subject: String(d.subject || '(no subject)'),
        html: String(d.html || ''),
        text,
        preview: previewOf(text, d.html),
        attachments: Array.isArray(d.attachments) ? d.attachments.map(a => ({ filename: a.filename || a.name || 'attachment', size: a.size })) : [],
        receivedAt: Date.parse(String(d.created_at || payload.created_at || '')) || Date.now(),
        read: false
    };

    const existing = inbox.find(r => r.id === rec.id);
    if (existing) return { ok: true, email: { ...existing, html: undefined, text: undefined }, duplicate: true };

    inbox = [rec, ...inbox].slice(0, 200);
    persist();
    return { ok: true, email: { ...rec, html: undefined, text: undefined } };
}

/** Console rows: headers + preview only, never the (heavy) body. */
function listInbound() {
    return inbox.map(r => ({ ...r, html: undefined, text: undefined }));
}

function getInbound(id) {
    return inbox.find(r => r.id === String(id || '')) || null;
}

function unread() {
    return inbox.filter(r => !r.read).length;
}

function markRead(id) {
    const rec = inbox.find(r => r.id === String(id || ''));
    if (!rec) return { ok: false, error: 'Email not found', unread: unread() };
    if (!rec.read) {
        rec.read = true;
        persist();
    }
    return { ok: true, unread: unread() };
}

/**
 * Svix signature check — Resend webhooks (and inbound parse) are delivered
 * with svix-id / svix-timestamp / svix-signature headers, HMAC-SHA256 over
 * `{id}.{timestamp}.{raw body}`, base64, key = webhook secret sans `whsec_`.
 */
function verifyResendSignature(headers = {}, rawBody = '', secret = '') {
    if (!secret) return { verified: false, reason: 'no-secret' };
    const id = String(headers['svix-id'] || headers['Svix-Id'] || '');
    const ts = Number(String(headers['svix-timestamp'] || headers['Svix-Timestamp'] || '0'));
    const sigs = String(headers['svix-signature'] || headers['Svix-Signature'] || '')
        .split(/[\s,]+/)
        .map(s => s.trim())
        .filter(Boolean)
        .map(s => s.replace(/^v1,/, ''))
        .filter(Boolean);
    if (!id || !ts || sigs.length === 0) return { verified: false, reason: 'missing-headers' };
    if (Math.abs(Date.now() / 1000 - ts) > 600) return { verified: false, reason: 'stale-timestamp' };

    try {
        const expected = crypto.createHmac('sha256', secret.replace(/^whsec_/, ''))
            .update(Buffer.from(`${id}.${ts}.${rawBody}`, 'utf8'))
            .digest('base64');
        const ok = sigs.some(s => {
            try {
                return crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected));
            } catch {
                return false;
            }
        });
        return ok ? { verified: true } : { verified: false, reason: 'bad-signature' };
    } catch {
        return { verified: false, reason: 'verify-error' };
    }
}

module.exports = { recordInbound, listInbound, getInbound, markRead, unread, verifyResendSignature };
