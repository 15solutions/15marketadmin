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
// footer carrying the company line + the no-reply warning.
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
// console. Ring buffer of ~200, mirrored to disk so it survives deploys.
let emailOutbox = [];
try {
    const stored = JSON.parse(fs.readFileSync(EMAIL_OUTBOX_PATH, 'utf8'));
    if (Array.isArray(stored)) emailOutbox = stored.slice(0, 200);
} catch (e) { /* blank */ }

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
    emailOutbox = [rec, ...emailOutbox].slice(0, 200);
    try {
        clearTimeout(recordOutbox._t);
        recordOutbox._t = setTimeout(() => {
            try { fs.writeFileSync(EMAIL_OUTBOX_PATH, JSON.stringify(emailOutbox)); } catch (e) { /* disk */ }
        }, 400);
    } catch (e) { /* never break the send path */ }
    return rec;
}

function listOutbox() {
    return emailOutbox.map(r => ({ ...r, html: undefined }));
}

// One full entry (with the stored HTML) for the admin Mail reader pane.
function getEmail(id) {
    return emailOutbox.find(r => r.id === String(id || '')) || null;
}

function getEmailShell(innerHtml) {
    // One 100%-width bgcolor'd table wraps a 540px content table so no
    // client can ever show a white page around the design. Everything is
    // inline styles + bgcolor: mail clients strip <style> blocks and do
    // not fetch web fonts, so nothing here may depend on either.
    return `
    <!DOCTYPE html>
    <html lang="en" xmlns="http://www.w3.org/1999/xhtml">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>@import url('https://fonts.googleapis.com/css2?family=Comfortaa:wght@700;900&family=Inter:wght@400;600;700&display=swap');</style>
    </head>
    <body style="margin:0; padding:0; background-color:#070a09;">
        <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#070a09" style="width:100%; background-color:#070a09; margin:0; padding:0; border-collapse:collapse;">
            <tr>
                <td align="center" bgcolor="#070a09" style="background-color:#070a09; padding:52px 20px 44px;">
                    <table role="presentation" width="540" border="0" cellpadding="0" cellspacing="0" style="width:100%; max-width:540px; border-collapse:collapse; text-align:left;">
                        <!-- Logo row — the pre-whitened asset. Mail clients do not
                             run CSS filter chains; the old brightness/invert trick
                             left the raw (dark) logo on the dark background. -->
                        <tr>
                            <td align="center" style="padding:0 0 30px; text-align:center;">
                                <img src="${EMAIL_LOGO_URL}" alt="15market" width="115" height="115" style="display:inline-block; width:115px; height:115px; border:0; outline:none; text-decoration:none;" />
                            </td>
                        </tr>
                        <tr>
                            <td style="padding:0 0 34px; font-size:0; line-height:0;">
                                <div style="height:1px; background-color:rgba(255,255,255,0.12); line-height:1px; font-size:0px;">&nbsp;</div>
                            </td>
                        </tr>
                        ${innerHtml}
                        <tr>
                            <td style="padding:40px 0 26px; font-size:0; line-height:0;">
                                <div style="height:1px; background-color:rgba(255,255,255,0.12); line-height:1px; font-size:0px;">&nbsp;</div>
                            </td>
                        </tr>
                        <!-- Footer — company line + no-reply warning, inlined. -->
                        <tr>
                            <td align="center" style="text-align:center; font-size:11px; line-height:1.6; color:#6f7f77; font-family:${EMAIL_FONT_BODY};">
                                <p style="margin:0 0 6px;"><span style="font-family:${EMAIL_FONT_BRAND}; font-weight:700; color:#ffffff;">15market</span> (c) 2026 &#183; All rights reserved</p>
                                <p style="margin:0; color:#e0a166; font-weight:600;">Warning: this is a no-reply email address. Replies to this email will not be read or processed.</p>
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
    // Body-only layout: title + message directly under the header divider.
    // No type badge, no buttons — the email IS the message. Every style is
    // inline: nothing here may depend on a <style> block or a web font.
    return getEmailShell(`
        <tr>
            <td style="padding:0;">
                <h2 style="font-family:${EMAIL_FONT_BRAND}; font-weight:900; font-size:24px; color:#ffffff; margin:0 0 18px; line-height:1.3; text-align:left;">${title}</h2>
                <p style="font-family:${EMAIL_FONT_BODY}; font-size:15px; line-height:1.7; color:#b9c9c0; margin:0;">${message}</p>
            </td>
        </tr>
    `);
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
            from: process.env.RESEND_FROM || '15MARKET <onboarding@resend.dev>',
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
                <h2 style="font-family:${EMAIL_FONT_BRAND}; font-weight:900; font-size:24px; color:#ffffff; margin:0 0 18px; line-height:1.3; text-align:left;">Verify Your Email</h2>
                <p style="font-family:${EMAIL_FONT_BODY}; font-size:15px; line-height:1.7; color:#b9c9c0; margin:0 0 30px;">Use the code below to complete your verification.</p>
                <div style="text-align:center;">
                    <div style="font-family:${EMAIL_FONT_BODY}; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:2px; color:#6f7f77; margin:0 0 16px;">Verification Code</div>
                    <div style="font-family:${EMAIL_FONT_CODE}; font-weight:900; font-size:44px; letter-spacing:14px; color:#2ecc8f; line-height:1.2;">${code}</div>
                </div>
                <p style="font-family:${EMAIL_FONT_BODY}; font-size:13px; line-height:1.7; color:#8fa097; margin:30px 0 0;">Enter this <strong style="color:#e2ece5;">one-time code</strong> on the application page. It expires in <strong style="color:#e2ece5;">10 minutes</strong>. If you did not request this code, ignore this email.</p>
            </td>
        </tr>
    `);
}

async function sendOtpEmail(emailAddress, code) {
    if (!resend) {
        console.log(`[OTP-Email] Resend not configured. Would send code ${code} to ${emailAddress}`);
        return true;
    }
    try {
        const htmlContent = getOtpEmailTemplate(code);
        const { data, error } = await resend.emails.send({
            from: process.env.RESEND_FROM || '15MARKET <onboarding@resend.dev>',
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
            from: process.env.RESEND_FROM || '15MARKET <onboarding@resend.dev>',
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
    getStats
};
