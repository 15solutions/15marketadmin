const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');
const profiles = require('../profiles');

const resendApiKey = process.env.RESEND_API_KEY;
let resend = null;
if (resendApiKey) {
    try {
        resend = new Resend(resendApiKey);
        console.log('[NotificationService] Resend SDK initialized successfully.');
    } catch (e) {
        console.error('[NotificationService] Failed to initialize Resend:', e.message);
    }
} else {
    console.warn('[NotificationService] RESEND_API_KEY environment variable is not defined. Email notifications will be mock-logged.');
}

// ─── OneSignal (phone notifications) ──────────────────────────────────────
// The browser identifies itself to OneSignal via OneSignal.login(address) on
// the frontend (external_id = wallet address). Win/lose settlements then target
// the user server-side with include_external_user_ids. Requires the App API
// key from the dashboard (Settings > Keys & IDs).
const onesignalAppId = process.env.ONESIGNAL_APP_ID;
const onesignalApiKey = process.env.ONESIGNAL_API_KEY;
const onesignalReady = Boolean(onesignalAppId && onesignalApiKey);
if (onesignalReady) {
    console.log(`[NotificationService] OneSignal initialized (app ${onesignalAppId}).`);
} else {
    console.warn('[NotificationService] ONESIGNAL_APP_ID / ONESIGNAL_API_KEY not set. Phone push notifications disabled.');
}

let socketIo = null;

let notificationStats = { sent: 0, failed: 0, emailsSent: 0, emailsFailed: 0, pushSent: 0, pushFailed: 0 };

// ─── Email design + outbox ───────────────────────────────────────────────
// One plain design for EVERY email the platform sends: the 15market logo
// sits on the plain dark background, title + message below, and a shared
// footer carrying the company line.
//
// MAILBOX-PROOF: email clients strip <style> blocks (Gmail limits them,
// Outlook desktop deletes them wholesale), refuse web fonts, and know
// nothing about CSS `filter:` — the old version's logo came through the
// filter chain either invisible or dark, the fonts fell back, and clients
// without the body background showed a white page. Everything now lives
// in inline styles + bgcolor attributes on a table layout, and the logo
// is a PRE-WHITENED asset (gowlogo-white.png — the exact pixels the old
// brightness(0) invert(1) filter produced, pre-scaled so it is a 5 KB
// download instead of 1.7 MB).
const EMAIL_LOGO_URL = process.env.EMAIL_LOGO_URL || 'https://15market.online/gowlogo-white.png';
// Light-scheme counterpart: the SAME logo pre-inverted (pixels baked via
// pngjs), so devices whose system theme is light get a visible-on-light
// logo without depending on CSS filter chains (which mail clients strip —
// the reason the pre-whitened asset exists in the first place).
const EMAIL_LOGO_URL_LIGHT = process.env.EMAIL_LOGO_URL_LIGHT || 'https://15market.online/gowlogo-dark.png';
// Header/Footer baked assets (SVG never renders in mail clients — the
// pattern tile and social icons are pre-drawn bitmaps hosted next to the
// logo). Cells carry bgcolor fallbacks, so a client that refuses remote
// background images still renders a clean solid banner.
const EMAIL_PATTERN_URL = process.env.EMAIL_PATTERN_URL || 'https://15market.online/mail-banner-tile.png';
// The full header canvas as one baked bitmap (solid-left fade into the
// rings motif) — gradients/fades cannot be done reliably in mail CSS.
const EMAIL_BANNER_BG_URL = process.env.EMAIL_BANNER_BG_URL || 'https://15market.online/mail-banner-bg.png';
const EMAIL_ICON_X_URL = process.env.EMAIL_ICON_X_URL || 'https://15market.online/mail-icon-x.png?v=2';
const EMAIL_ICON_DISCORD_URL = process.env.EMAIL_ICON_DISCORD_URL || 'https://15market.online/mail-icon-discord.png?v=2';
// Footer strip canvas: the pulse motif mirrored — emitter on the left edge.
const EMAIL_FOOTER_BG_URL = process.env.EMAIL_FOOTER_BG_URL || 'https://15market.online/mail-footer-bg.png';
// Notifications go out from the info@ address. The support@ mailbox is the
// send-and-receive inbox and is never used as the automated sender.
const EMAIL_FROM_DEFAULT = '15MARKET <info@15market.online>';
// support@ is the two-way address: admin-composed mail goes out from it and
// every reply (to any 15market message) is routed back to it, where the
// inbound webhook lands it in the admin Mail console.
const EMAIL_SUPPORT_ADDRESS = process.env.SUPPORT_EMAIL || 'support@15market.online';
const EMAIL_FROM_SUPPORT = process.env.RESEND_FROM_SUPPORT || `15MARKET Support <${EMAIL_SUPPORT_ADDRESS}>`;
const EMAIL_OUTBOX_PATH = path.join(__dirname, '..', '..', 'data', 'email-outbox.json');

// The design's typefaces cannot be fetched by most mail clients — keep
// Comfortaa first for the clients that honour the Google Fonts import
// (Apple Mail / iOS Mail), with the closest web-safe rounded face as the
// universal fallback so the proportions still read.
const EMAIL_FONT_BRAND = "'Comfortaa','Trebuchet MS','Verdana',cursive,sans-serif";
const EMAIL_FONT_BODY = "'Inter','Trebuchet MS','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const EMAIL_FONT_CODE = "'Inter','SFMono-Regular',Consolas,'Arial Black',monospace";

// Trade outcomes and copy-trading events carry NO email — they already fire
// as in-app notices + phone push. Blocked at the dispatch layer so nobody
// can ever re-enable them accidentally.
const EMAIL_BLOCKED_TITLES = /trade (won|lost)|copy trad|trades copied|provider application/i;

// Outbox: every email (automated + admin-sent) recorded for the admin Mail
// console. Supabase is the DURABLE STORE OF RECORD (survives restarts and
// Render's per-deploy disk wipes); the local JSON mirror is a fallback
// snapshot, hydrated at boot — same split profiles.js / mailbox.js use.
const { supabaseUpsert, supabaseSelect } = require('../supabaseRest');
const OUTBOX_CAP = 500; // hot in-memory window; Supabase keeps everything ever
let emailOutbox = [];
try {
    const stored = JSON.parse(fs.readFileSync(EMAIL_OUTBOX_PATH, 'utf8'));
    if (Array.isArray(stored)) emailOutbox = stored.slice(0, OUTBOX_CAP);
} catch (e) { /* blank */ }

/** Outbox record → durable row shape (mail_outbox on Supabase). */
function outboxToRow(rec) {
    return {
        id: rec.id,
        kind: rec.kind || 'system',
        to: rec.to || '',
        subject: rec.subject || '',
        type: rec.type || 'info',
        title: rec.title || '',
        message: rec.message || '',
        status: rec.status || 'sent',
        detail: rec.detail || '',
        html: rec.html || '',
        at: rec.at || 0
    };
}

/** Durable row → record (boot hydration). */
function outboxFromRow(row) {
    return {
        id: row.id,
        kind: row.kind || 'system',
        to: row.to || '',
        subject: row.subject || '',
        type: row.type || 'info',
        title: row.title || '',
        message: row.message || '',
        html: row.html || '',
        status: row.status || 'sent',
        detail: row.detail || '',
        at: Number(row.at) || 0
    };
}

/** Fire-and-forget durable write; failures only warn. */
function mirrorOutboxToSupabase(rec) {
    supabaseUpsert('mail_outbox', [outboxToRow(rec)]).then(ok => {
        if (!ok) console.warn(`[MailOutbox] Supabase mirror failed for ${rec.id}`);
    }).catch(() => { /* never break the send path */ });
}

function recordOutbox(entry) {
    const rec = {
        id: entry.id || `mail-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
        kind: entry.kind || 'system',      // system | manual
        to: entry.to || '',
        subject: entry.subject || '',
        type: entry.type || 'info',
        title: entry.title || '',
        message: entry.message || '',
        html: entry.html || '',
        status: entry.status || 'sent',   // sent | failed
        detail: entry.detail || '',
        at: Date.now()
    };
    emailOutbox = [rec, ...emailOutbox].slice(0, OUTBOX_CAP);
    mirrorOutboxToSupabase(rec);
    try {
        clearTimeout(recordOutbox._t);
        recordOutbox._t = setTimeout(() => {
            try { fs.writeFileSync(EMAIL_OUTBOX_PATH, JSON.stringify(emailOutbox)); } catch (e) { /* disk */ }
        }, 400);
    } catch (e) { /* never break the send path */ }
    return rec;
}

/**
 * Boot hydration — called once at startup. Supabase is the store of record:
 * the hot cache is rebuilt from it, and any local-only records are folded in
 * and pushed up so nothing recorded anywhere is ever lost.
 */
async function initOutbox() {
    const rows = await supabaseSelect('mail_outbox?select=*&order=at.desc&limit=2000');
    if (!rows || !Array.isArray(rows)) {
        console.warn('[MailOutbox] Supabase hydration unavailable — serving from the local file mirror until it connects.');
        return { hydrated: 0, pushed: emailOutbox.length };
    }

    const durable = rows.map(outboxFromRow).filter(r => r.id);
    const durableIds = new Set(durable.map(r => r.id));
    const localOnly = emailOutbox.filter(r => !durableIds.has(r.id));

    emailOutbox = [...durable, ...localOnly]
        .sort((a, b) => (b.at || 0) - (a.at || 0))
        .slice(0, OUTBOX_CAP);
    try { fs.writeFileSync(EMAIL_OUTBOX_PATH, JSON.stringify(emailOutbox)); } catch (e) { /* disk */ }

    let pushed = 0;
    for (const rec of localOnly) { mirrorOutboxToSupabase(rec); pushed++; }
    console.log(`[MailOutbox] hydrated ${durable.length} from Supabase, backfilled ${pushed} local-only records.`);
    return { hydrated: durable.length, pushed };
}

function listOutbox() {
    return emailOutbox.map(r => ({ ...r, html: undefined }));
}

// One full entry (with the stored HTML) for the admin Mail reader pane.
function getEmail(id) {
    return emailOutbox.find(r => r.id === String(id || '')) || null;
}

function getEmailShell(innerHtml, headline) {
    // One 100%-width table wraps a 540px content table. It sets NO page
    // background: the design sits directly on the mail app's own system
    // background (dark or light). Everything is inline styles: mail clients strip <style> blocks and do
    // not fetch web fonts, so nothing here may depend on either.
    //
    // SYSTEM DARK/LIGHT: the device's theme decides the palette. The inline
    // styles carry the DARK design (the universal fallback — clients that
    // understand nothing render exactly as before), and the media query
    // below re-skins the TEXT hooks to the light palette when the OS is
    // light. Author `!important` declarations beat inline styles, which is
    // why the hooks work despite the fully inlined markup. The banner,
    // footer strip and social icons are CONSTANT brand-green canvases —
    // they carry their own white ink and look identical in every theme,
    // so they get no media-query treatment at all.
    return `
    <!DOCTYPE html>
    <html lang="en" xmlns="http://www.w3.org/1999/xhtml">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>@import url('https://fonts.googleapis.com/css2?family=Comfortaa:wght@700;900&family=Inter:wght@400;600;700&display=swap');</style>
        <style>
            /* System light theme: dark ink. No background is ever set, so the
               mail app's own background shows through in both themes. */
            @media (prefers-color-scheme: light) {
                .em-body { color: #3b4a43 !important; }
                .em-foot { color: #7d8d85 !important; }
                .em-soft { color: #6b7c74 !important; }
                .em-strong { color: #133a2a !important; }
                .em-code { color: #159b62 !important; }
                .em-codelabel { color: #7d8d85 !important; }
            }
        </style>
    </head>
    <body style="margin:0; padding:0;">
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%; margin:0; padding:0; border-collapse:collapse;">
            <tr>
                <td align="center" style="padding:0 0 36px;">
                    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; text-align:left;">
                        <!-- Header banner: ONE baked canvas (pattern fading
                             to solid toward the left where the logo sits,
                             Glassdoor-style) used as the td background with
                             a solid bgcolor fallback. Logo-only mark blown
                             up 2.2x, no wordmark; the headline is the big
                             bold white line inside the banner. -->
                        <tr>
                            <td style="padding:0 0 22px;">
                                <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#0E4D30" background="${EMAIL_BANNER_BG_URL}" style="width:100%; background-color:#0E4D30; background-image:url('${EMAIL_BANNER_BG_URL}'); background-repeat:no-repeat; background-size:cover; border-collapse:collapse;">
                                    <tr>
                                        <td style="padding:17px 24px 11px;">
                                            <img src="${EMAIL_LOGO_URL}" alt="15market" width="76" height="76" style="display:block; width:76px; height:76px; border:0; outline:none; text-decoration:none;" />
                                            <h1 style="font-family:${EMAIL_FONT_BRAND}; font-weight:900; font-size:22px; line-height:1.15; color:#ffffff; margin:3px 0 0; text-align:left;">${headline || ''}</h1>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:0 24px;">
                                <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%; max-width:540px; margin:0 auto; border-collapse:collapse; text-align:left;">
                                    ${innerHtml}
                                </table>
                            </td>
                        </tr>
                        <!-- Footer: constant brand-green strip mirroring the
                             header's pulse motif — emitter + ripples on the
                             LEFT edge, fading right so the right-aligned
                             wordmark sits on calm ground. bgcolor fallback
                             keeps it a clean bar if remote images are off. -->
                        <tr>
                            <td style="padding:34px 0 18px;">
                                <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#0E4D30" background="${EMAIL_FOOTER_BG_URL}" style="width:100%; background-color:#0E4D30; background-image:url('${EMAIL_FOOTER_BG_URL}'); background-repeat:no-repeat; background-size:cover; border-collapse:collapse;">
                                    <tr>
                                        <td align="right" style="padding:15px 24px; font-family:${EMAIL_FONT_BRAND}; font-weight:900; font-size:17px; color:#ffffff;">15market</td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td align="center" style="padding:0 0 18px; text-align:center;">
                                <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto; border-collapse:collapse;">
                                    <tr>
                                        <td style="padding:0 6px;"><a href="https://x.com/15_markets" target="_blank" style="text-decoration:none;"><img src="${EMAIL_ICON_X_URL}" alt="X" width="28" height="28" style="display:block; width:28px; height:28px; border:0; outline:none;" /></a></td>
                                        <td style="padding:0 6px;"><a href="https://discord.gg/15market" target="_blank" style="text-decoration:none;"><img src="${EMAIL_ICON_DISCORD_URL}" alt="Discord" width="28" height="28" style="display:block; width:28px; height:28px; border:0; outline:none;" /></a></td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td align="center" class="em-foot" style="text-align:center; font-size:11px; line-height:1.7; color:#6f7f77; font-family:${EMAIL_FONT_BODY}; padding:2px 24px 0;">
                                <p style="margin:0;">Copyright &#169; 2026 15market &#183; All rights reserved</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;
}

function init(io) {
    socketIo = io;
    console.log('[NotificationService] Socket.io reference initialized.');
}

function getEmailTemplate(title, message, type) {
    // The headline lives INSIDE the banner (Glassdoor-style); the body cell
    // below carries the message alone. No type badge, no buttons — the
    // email IS the message. Every style is inline: nothing here may depend
    // on a <style> block or a web font. The em-* classes re-skin these to
    // the light palette on light devices.
    return getEmailShell(`
        <tr>
            <td style="padding:0;">
                <p class="em-body" style="font-family:${EMAIL_FONT_BODY}; font-size:15px; line-height:1.7; color:#b9c9c0; margin:2px 0 0;">${message}</p>
            </td>
        </tr>
    `, title);
}

// ─── OneSignal push dispatch ─────────────────────────────────────────────
// Fire-and-forget notification to every device the identified user has.
// Targeting uses the wallet address as external_id (lowercased to match the
// frontend's OneSignal.login(address.toLowerCase())).

async function sendOneSignalPush(addr, title, message, type = 'info') {
    if (!onesignalReady) return;
    const targetAddr = String(addr).toLowerCase();
    try {
        const payload = {
            app_id: onesignalAppId,
            name: `trade-${type}-${Date.now()}`,
            target_channel: 'push',
            include_external_user_ids: [targetAddr],
            headings: { en: title },
            contents: { en: message },
            web_push_topic: 'trade-settlement'
        };
        const res = await fetch('https://api.onesignal.com/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                Authorization: `Key ${onesignalApiKey}`
            },
            body: JSON.stringify(payload)
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && (body.id || body.notification_id || body.errors === undefined)) {
            notificationStats.pushSent++;
            console.log(`[Notification-Push] OneSignal ${body.id || body.notification_id || 'sent'} → ${addr}.`);
        } else {
            notificationStats.pushFailed++;
            console.error(`[Notification-Push] OneSignal rejected for ${addr} (${res.status}):`,
                JSON.stringify(body).slice(0, 300));
        }
    } catch (e) {
        notificationStats.pushFailed++;
        console.error(`[Notification-Push] OneSignal send failed for ${addr}:`, e.message);
    }
}

async function notifyUser(userAddr, title, message, type = 'info', emailEnabled = false, pushEnabled = false) {
    if (!userAddr) return;
    const addr = userAddr.toLowerCase();

    const notification = {
        id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title,
        message,
        type,
        timestamp: Date.now(),
        read: false
    };

    console.log(`[Notification] Creating for ${addr}: "${title}" - ${message}`);

    try {
        const profile = profiles.get(addr);
        if (profile) {
            profile.notifications = profile.notifications || [];
            profile.notifications.unshift(notification);
            if (profile.notifications.length > 50) {
                profile.notifications = profile.notifications.slice(0, 50);
            }
            profiles.upsert(addr, { notifications: profile.notifications });
        } else {
            profiles.upsert(addr, { notifications: [notification] });
        }
        notificationStats.sent++;
    } catch (e) {
        console.error(`[Notification] Failed to persist notification for ${addr}:`, e.message);
        notificationStats.failed++;
    }

    try {
        if (socketIo) {
            socketIo.to(addr).emit('notification', notification);
        }
    } catch (e) {
        console.error(`[Notification] Failed to emit socket notification for ${addr}:`, e.message);
    }

    if (pushEnabled) {
        sendOneSignalPush(addr, title, message, type).catch(e => {
            console.error(`[Notification] Push send failed for ${addr}:`, e.message);
        });
    }

    if (emailEnabled) {
        sendNotificationEmail(addr, title, message, type, notification).catch(e => {
            console.error(`[Notification] Email send failed for ${addr}:`, e.message);
        });
    }
}

// Fires an in-app + phone push notification. Used for high-priority events
// (trade wins/losses) on settlement paths.
async function notifyUserWithPush(userAddr, title, message, type = 'info') {
    return notifyUser(userAddr, title, message, type, false, true);
}

async function sendNotificationEmail(addr, title, message, type, notification) {
    // Trade outcomes and copy-trading events never email — in-app + push only.
    if (EMAIL_BLOCKED_TITLES.test(String(title))) return;

    try {
        const profile = profiles.get(addr);
        let emailAddress = profile?.email || profile?.verifiedEmail || null;

        if (!emailAddress) {
            if (process.env.TEST_EMAIL) {
                emailAddress = process.env.TEST_EMAIL;
            } else if (process.env.NODE_ENV !== 'production') {
                emailAddress = 'delivered@resend.dev';
            }
        }

        if (!emailAddress || !resend) return;

        const htmlContent = getEmailTemplate(title, message, type);
        const eventType = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const idempotencyKey = `${eventType}/${notification.id}`;

        console.log(`[Notification-Email] Sending to ${emailAddress} for ${addr}...`);
        const { data, error } = await resend.emails.send({
            from: process.env.RESEND_FROM || EMAIL_FROM_DEFAULT,
            replyTo: EMAIL_SUPPORT_ADDRESS,
            to: [emailAddress],
            subject: title,
            html: htmlContent,
            idempotencyKey: idempotencyKey
        });

        if (error) {
            console.error('[Notification-Email] Resend error:', error.message);
            notificationStats.emailsFailed++;
            recordOutbox({ kind: 'system', to: emailAddress, subject: title, title, message, type, html: htmlContent, status: 'failed', detail: error.message });
        } else {
            console.log('[Notification-Email] Sent. ID:', data.id);
            notificationStats.emailsSent++;
            recordOutbox({ kind: 'system', to: emailAddress, subject: title, title, message, type, html: htmlContent, status: 'sent', detail: data.id });
        }
    } catch (emailErr) {
        console.error('[Notification-Email] Error:', emailErr.message);
        notificationStats.emailsFailed++;
    }
}

function getOtpEmailTemplate(code) {
    return getEmailShell(`
        <tr>
            <td style="padding:0;">
                <p class="em-body" style="font-family:${EMAIL_FONT_BODY}; font-size:15px; line-height:1.7; color:#b9c9c0; margin:2px 0 30px;">Use the code below to complete your verification.</p>
                <div style="text-align:center;">
                    <div class="em-codelabel" style="font-family:${EMAIL_FONT_BODY}; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:2px; color:#6f7f77; margin:0 0 16px;">Verification Code</div>
                    <div class="em-code" style="font-family:${EMAIL_FONT_CODE}; font-weight:900; font-size:44px; letter-spacing:14px; color:#2ecc8f; line-height:1.2;">${code}</div>
                </div>
                <p class="em-soft" style="font-family:${EMAIL_FONT_BODY}; font-size:13px; line-height:1.7; color:#8fa097; margin:30px 0 0;">Enter this <strong class="em-strong" style="color:#e2ece5;">one-time code</strong> on the application page. It expires in <strong class="em-strong" style="color:#e2ece5;">10 minutes</strong>. If you did not request this code, ignore this email.</p>
            </td>
        </tr>
    `, 'Verify Your Email');
}

async function sendOtpEmail(emailAddress, code) {
    if (!resend) {
        console.log(`[OTP-Email] Resend not configured. Would send code ${code} to ${emailAddress}`);
        return true;
    }
    try {
        const htmlContent = getOtpEmailTemplate(code);
        const { data, error } = await resend.emails.send({
            from: process.env.RESEND_FROM || EMAIL_FROM_DEFAULT,
            replyTo: EMAIL_SUPPORT_ADDRESS,
            to: [emailAddress],
            subject: 'Your Email Verification Code',
            html: htmlContent
        });
        if (error) {
            console.error('[OTP-Email] Resend error:', error.message);
            recordOutbox({ kind: 'system', to: emailAddress, subject: 'Your Email Verification Code', title: 'Email verification', message: `A verification code was issued (delivery failed: ${error.message})`, html: htmlContent, status: 'failed', detail: error.message });
            return false;
        }
        console.log('[OTP-Email] Sent to', emailAddress, 'ID:', data?.id);
        recordOutbox({ kind: 'system', to: emailAddress, subject: 'Your Email Verification Code', title: 'Email verification', message: 'A verification code was issued and delivered.', html: htmlContent, status: 'sent', detail: data?.id || '' });
        return true;
    } catch (err) {
        console.error('[OTP-Email] Failed:', err.message);
        return false;
    }
}

// ─── Admin-composed email (Mail console) ────────────────────────────────
// Same plain design, composed from the admin panel. Records to the outbox
// as a 'manual' entry on every attempt.
async function sendAdminEmail({ to, subject, message, type = 'info' }) {
    const title = String(subject || 'A message from 15market').trim();
    const body = String(message || '').trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, error: 'A valid recipient email is required' };
    if (!body) return { ok: false, error: 'Message body required' };
    const htmlContent = getEmailTemplate(title, body, type);
    if (!resend) {
        console.log(`[Admin-Email] Resend not configured. Would send "${title}" to ${to}`);
        recordOutbox({ kind: 'manual', to, subject: title, title, message: body, type, html: htmlContent, status: 'failed', detail: 'RESEND_API_KEY not configured' });
        return { ok: true, mock: true };
    }
    try {
        const { data, error } = await resend.emails.send({
            from: EMAIL_FROM_SUPPORT,
            replyTo: EMAIL_SUPPORT_ADDRESS,
            to: [to],
            subject: title,
            html: htmlContent
        });
        if (error) {
            recordOutbox({ kind: 'manual', to, subject: title, title, message: body, type, html: htmlContent, status: 'failed', detail: error.message });
            return { ok: false, error: error.message };
        }
        recordOutbox({ kind: 'manual', to, subject: title, title, message: body, type, html: htmlContent, status: 'sent', detail: data?.id || '' });
        return { ok: true, id: data?.id };
    } catch (err) {
        recordOutbox({ kind: 'manual', to, subject: title, title, message: body, type, html: htmlContent, status: 'failed', detail: err.message });
        return { ok: false, error: err.message };
    }
}

function getStats() {
    return { ...notificationStats };
}

module.exports = {
    init,
    notifyUser,
    notifyUserWithPush,
    sendOneSignalPush,
    sendNotificationEmail,
    sendOtpEmail,
    sendAdminEmail,
    listOutbox,
    getEmail,
    getEmailTemplate,
    getOtpEmailTemplate,
    getStats,
    initOutbox
};
