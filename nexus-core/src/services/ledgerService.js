// nexus-core/src/services/ledgerService.js
//
// Per-wallet transaction ledger — deposits, withdrawals and internal
// transfers. Deliberately NEVER trade entries: trades live in their own
// tables, and the Transfer Hub Activity feed plus the dashboard
// Transactions cards are fed from here, so trade history is excluded from
// the money ledger by construction (the user requirement).
//
// Durability stack (same pattern as the mail console):
//   1. Supabase `transactions` table (migration 015) - store of record
//   2. local JSON mirror - survives a node restart when the migration
//      has not been applied yet, and covers read paths while offline
//   3. in-memory map - zero-latency reads

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SUPABASE_ENABLED, supabaseUpsert, supabaseSelect } = require('../supabaseRest');

const MIRROR_PATH = path.join(__dirname, '..', '..', 'data', 'transactions-ledger.json');

// Canonical kinds. Anything unknown is coerced to TRANSFER so a buggy
// caller can never poison the feed with an unrenderable type.
const KINDS = new Set(['DEPOSIT', 'WITHDRAW', 'TRANSFER', 'IN', 'OUT', 'SWAP']);

const memory = new Map(); // address(lowercase) -> [row, ...] newest first
let hydrated = false;

function normKind(t) {
    const up = String(t || '').toUpperCase();
    return KINDS.has(up) ? up : 'TRANSFER';
}

function normAmount(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Number(n.toFixed(6)) : 0;
}

function normalizeRow(address, raw) {
    const addr = String(address || '').toLowerCase();
    if (!addr || !raw || typeof raw !== 'object') return null;
    const kind = normKind(raw.kind || raw.type);
    const amount = normAmount(raw.amount ?? raw.value);
    if (!amount) return null;
    const ts = Number(raw.timestamp) || Number(raw.createdAt) || Date.now();
    const id = (typeof raw.id === 'string' && raw.id.trim())
        ? raw.id.trim().slice(0, 80)
        : `srv_${kind}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    return {
        id,
        address: addr,
        kind,
        amount,
        txHash: (raw.tx || raw.txHash || null) ? String(raw.tx || raw.txHash).slice(0, 80) : null,
        toAddr: raw.to ? String(raw.to).toLowerCase().slice(0, 64) : null,
        network: raw.network ? String(raw.network).slice(0, 24) : null,
        timestamp: ts,
        createdAt: new Date(ts).toISOString()
    };
}

function toClientRow(r) {
    return {
        id: r.id,
        type: r.kind,
        amount: String(r.amount),
        timestamp: Number(r.timestamp) || Date.parse(r.createdAt) || Date.now(),
        tx: r.txHash || null,
        to: r.toAddr || null,
        network: r.network || null
    };
}

function toSupabaseRow(r) {
    return {
        id: r.id,
        address: r.address,
        kind: r.kind,
        amount: r.amount,
        tx_hash: r.txHash,
        to_addr: r.toAddr,
        network: r.network,
        created_at: r.createdAt
    };
}

function loadMirror() {
    try {
        if (!fs.existsSync(MIRROR_PATH)) return;
        const parsed = JSON.parse(fs.readFileSync(MIRROR_PATH, 'utf8'));
        if (Array.isArray(parsed)) {
            for (const item of parsed) {
                const rec = item && (!item.rows ? null : item) || null;
                const quad = rec || item;
                if (!quad || !quad.address) continue;
                const row = normalizeRow(quad.address, {
                    id: quad.id, kind: quad.kind || quad.type, amount: quad.amount,
                   tx: quad.txHash || quad.tx, to: quad.toAddr || quad.to,
                    network: quad.network, timestamp: quad.timestamp, createdAt: quad.createdAt
                });
                if (!row) continue;
                if (!memory.has(row.address)) memory.set(row.address, []);
                const list = memory.get(row.address);
                if (!list.some(x => x.id === row.id)) list.push(row);
            }
            for (const list of memory.values()) list.sort((a, b) => b.timestamp - a.timestamp);
        }
    } catch (e) {
        console.warn('[Ledger] mirror load failed:', e.message);
    }
}

function saveMirror() {
    try {
        const flat = [];
        for (const [addr, list] of memory.entries()) {
            for (const row of list.slice(0, 100)) {
                flat.push({
                    address: addr, id: row.id, kind: row.kind, amount: row.amount,
                    txHash: row.txHash, toAddr: row.toAddr, network: row.network,
                    timestamp: row.timestamp, createdAt: row.createdAt
                });
            }
        }
        fs.writeFileSync(MIRROR_PATH, JSON.stringify(flat));
    } catch (e) { /* mirror write is best-effort */ }
}

// Boot hydration: Supabase is the store of record, the JSON mirror the
// fallback. Merge both so nothing is ever lost during the switchover.
async function initLedger() {
    if (hydrated) return;
    loadMirror();
    if (SUPABASE_ENABLED) {
        try {
            const rows = await supabaseSelect('/rest/v1/transactions?select=id,address,kind,amount,tx_hash,to_addr,network,created_at&order=created_at.desc&limit=2000');
            let n = 0;
            for (const r of rows || []) {
                const restored = normalizeRow(r.address, {
                    id: r.id, kind: r.kind, amount: r.amount, tx: r.tx_hash,
                    to: r.to_addr, network: r.network,
                    timestamp: Date.parse(r.created_at)
                });
                if (!restored) continue;
                if (!memory.has(restored.address)) memory.set(restored.address, []);
                const list = memory.get(restored.address);
                if (!list.some(x => x.id === restored.id)) { list.push(restored); n++; }
            }
            for (const list of memory.values()) list.sort((a, b) => b.timestamp - a.timestamp);
            console.log(`[Ledger] hydrated ${n} transactions from Supabase`);
        } catch (e) {
            if (!/relation .* does not exist|404|not found/i.test(String(e.message || e))) {
                console.warn('[Ledger] Supabase hydration failed:', e.message || e);
            } else {
                console.log('[Ledger] Supabase table not ready - running on JSON mirror until migration 015 applies');
            }
        }
    }
    hydrated = true;
}

// Single entry point. Idempotent by (id) and by (address, kind, txHash) so
// a client retry pushed to /push-tx can never duplicate a server-recorded
// transaction or vice versa.
function recordTransaction(address, raw) {
    const row = normalizeRow(address, raw);
    if (!row) return { row: null, duplicate: false };
    if (!memory.has(row.address)) memory.set(row.address, []);
    const list = memory.get(row.address);
    if (list.some(x => x.id === row.id)) {
        const found = list.find(x => x.id === row.id);
        return { row: found, duplicate: true };
    }
    if (row.txHash && list.some(x => x.txHash === row.txHash && x.kind === row.kind)) {
        const found = list.find(x => x.txHash === row.txHash && x.kind === row.kind);
        return { row: found, duplicate: true };
    }
    list.unshift(row);
    list.sort((a, b) => b.timestamp - a.timestamp);
    saveMirror();
    if (SUPABASE_ENABLED) {
        supabaseUpsert('transactions', [toSupabaseRow(row)], 'id').then(ok => {
            if (!ok) console.warn('[Ledger] Supabase write failed for', row.id);
        }).catch(e => console.warn('[Ledger] Supabase write error:', e.message || e));
    }
    return { row, duplicate: false };
}

// Merged read - durable store first so a caller sees everything, not just
// what this node instance holds in RAM.
async function listTransactions(address, limit = 200) {
    const addr = String(address || '').toLowerCase();
    if (!addr) return [];
    let extra = [];
    if (SUPABASE_ENABLED) {
        try {
            const rows = await supabaseSelect(`/rest/v1/transactions?select=id,kind,amount,tx_hash,to_addr,network,created_at&address=eq.${encodeURIComponent(addr)}&order=created_at.desc&limit=${Math.min(500, limit * 2)}`);
            extra = (rows || []).map(r => normalizeRow(addr, {
                id: r.id, kind: r.kind, amount: r.amount, tx: r.tx_hash,
                to: r.to_addr, network: r.network, timestamp: Date.parse(r.created_at)
            })).filter(Boolean);
        } catch (e) { /* read falls back to memory */ }
    }
    const own = memory.get(addr) || [];
    const seen = new Set();
    const merged = [];
    for (const r of [...extra, ...own]) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        merged.push(r);
    }
    merged.sort((a, b) => b.timestamp - a.timestamp);
    return merged.slice(0, limit).map(toClientRow);
}

module.exports = { initLedger, recordTransaction, listTransactions };
