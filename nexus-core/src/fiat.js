// ─── Fiat withdrawal requests ─────────────────────────────────────────────
// A request-driven payout rail: the user picks the funding account (trading
// or main), enters their country, and available methods reveal themselves.
// Nigerians get bank transfers; every other country is "coming soon" for
// now. Confirming a request pushes it to the admin console (event-driven:
// every lifecycle step is stamped into the request's own timeline) where it
// can be approved or denied — each decision emails the user automatically.

const fs = require('fs');
const path = require('path');

const STORE = path.join(__dirname, '..', 'data', 'fiat.withdrawals.json');
const MAX_STORED = 500;

// ─── Country methods ──────────────────────────────────────────────────────
// Currently only Nigeria is live (bank transfer). Everything else reports
// "coming soon" — add a block here to open a new country.
const METHODS = {
    nigeria: {
        name: 'Nigeria',
        flag: 'NG',
        currencies: 'NGN',
        available: true,
        method: 'Bank Transfer',
        handle: 'account',
        banks: [
            { name: 'Access Bank', code: '044' },
            { name: 'Citibank Nigeria', code: '023' },
            { name: 'ECOBANK Nigeria', code: '050' },
            { name: 'Fidelity Bank', code: '070' },
            { name: 'First Bank of Nigeria', code: '011' },
            { name: 'First City Monument Bank (FCMB)', code: '214' },
            { name: 'Guaranty Trust Bank (GTBank)', code: '058' },
            { name: 'Heritage Bank', code: '030' },
            { name: 'Jaiz Bank', code: '301' },
            { name: 'Keystone Bank', code: '082' },
            { name: 'Kuda Microfinance Bank', code: '502' },
            { name: 'Moniepoint MFB', code: '505' },
            { name: 'OPay Digital Services', code: '999' },
            { name: 'Palmpay', code: '99999' },
            { name: 'Polaris Bank', code: '076' },
            { name: 'Providus Bank', code: '101' },
            { name: 'Stanbic IBTC Bank', code: '221' },
            { name: 'Standard Chartered Bank', code: '068' },
            { name: 'Sterling Bank', code: '232' },
            { name: 'Union Bank of Nigeria', code: '032' },
            { name: 'United Bank for Africa (UBA)', code: '033' },
            { name: 'Unity Bank', code: '215' },
            { name: 'Wema Bank', code: '089' },
            { name: 'Zenith Bank', code: '057' }
        ]
    },
    _default: {
        available: false,
        method: null,
        comingSoon: true
    }
};

function methodsFor(countryRaw) {
    const key = String(countryRaw || '').trim().toLowerCase();
    if (!key) return { available: false, error: 'Country required' };
    const m = METHODS[key] || METHODS._default;
    return { country: key, ...JSON.parse(JSON.stringify(m)), banks: m.banks || undefined };
}

// ─── Store ────────────────────────────────────────────────────────────────
let requests = []; // newest first
try {
    const stored = JSON.parse(fs.readFileSync(STORE, 'utf8'));
    if (Array.isArray(stored)) requests = stored.slice(0, MAX_STORED);
} catch (e) { /* blank */ }

let persistTimer = null;
function persist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
        try { fs.writeFileSync(STORE, JSON.stringify(requests, null, 2)); } catch (e) { /* disk */ }
    }, 400);
}

function newId() {
    return `fiat-${Date.now()}-${Math.floor(Math.random() * 1e4).toString().padStart(4, '0')}`;
}

/**
 * Create a request. `debit` should already have happened server-side (the
 * router debits the trading ledger) — here we only record + index.
 */
function createRequest({ address, source, amount, country, method, bankName, bankCode, accountName, accountNumber, note }) {
    const addr = String(address || '').toLowerCase();
    const src = String(source || '').toLowerCase();
    const amt = Number(amount);
    if (!addr) return { ok: false, status: 400, error: 'Account address required' };
    if (!['trading', 'main'].includes(src)) return { ok: false, status: 400, error: 'Choose which account to withdraw from' };
    if (!Number.isFinite(amt) || amt <= 0) return { ok: false, status: 400, error: 'A valid withdrawal amount is required' };
    if (!country) return { ok: false, status: 400, error: 'Country required' };

    const methods = methodsFor(country);
    if (methods.available === false) {
        return { ok: false, status: 400, error: `Fiat withdrawal is coming soon for ${methods.name || 'your country'}` };
    }
    // Bank-transfer specifics (Nigeria today)
    if (!bankName || !methods.banks?.some(b => b.name === bankName)) return { ok: false, status: 400, error: 'Select a bank from the list' };
    const acctNo = String(accountNumber || '').replace(/\s+/g, '');
    if (!/^\d{10}$/.test(acctNo)) return { ok: false, status: 400, error: 'Nigerian account numbers are 10 digits' };
    if (!accountName || String(accountName).trim().length < 3) return { ok: false, status: 400, error: 'Account name required' };

    const rec = {
        id: newId(),
        address: addr,
        source: src,
        amount: Math.round(amt * 100) / 100,
        country: methods.name || country,
        countryCode: country.toLowerCase(),
        method: 'Bank Transfer',
        bankName,
        bankCode: methods.banks.find(b => b.name === bankName).code,
        accountName: String(accountName).trim(),
        accountNumber: acctNo,
        status: 'pending',           // pending | approved | denied
        note: note || '',
        timeline: [
            { at: Date.now(), event: 'requested', by: addr, detail: { source: src, amount: Math.round(amt * 100) / 100 } }
        ],
        createdAt: Date.now()
    };
    requests = [rec, ...requests].slice(0, MAX_STORED);
    persist();
    return { ok: true, request: rec };
}

function listAll() {
    return requests.map(r => ({ ...r }));
}

function listFor(address) {
    const addr = String(address || '').toLowerCase();
    return requests.filter(r => r.address === addr).map(r => ({ ...r }));
}

function get(id) {
    return requests.find(r => r.id === String(id || '')) || null;
}

/** Approve or deny. Always appends to the per-request timeline. */
function decide(id, action, { by = 'admin', detail = {} } = {}) {
    const rec = get(id);
    if (!rec) return { ok: false, status: 404, error: 'Request not found' };
    if (rec.status !== 'pending') return { ok: false, status: 400, error: `Request already ${rec.status}` };
    if (!['approve', 'deny'].includes(action)) return { ok: false, status: 400, error: 'Unknown action' };
    rec.status = action === 'approve' ? 'approved' : 'denied';
    rec.timeline.push({ at: Date.now(), event: rec.status, by, detail });
    persist();
    return { ok: true, request: rec };
}

module.exports = { methodsFor, createRequest, listAll, listFor, get, decide };
