// ============================================================
// nexus-core/src/tower.js
// Tower Exchange (DEX aggregator on Arc) — server-side proxy.
// The developer API key never leaves the server: the client only
// talks to our local /swap/quote and /swap/build-tx routes.
// ============================================================
const { ethers } = require('ethers');
const config = require('./config');
const rpc = require('./rpc');

const TOWER_API_URL = 'https://www.tower.exchange/api/public';
const TOWER_API_KEY = config.TOWER_API_KEY || '';

// The zero address on Arc means the chain's native coin (18 decimals).
const NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000';

// Token registry for the hub's swap list — addresses are fixed on-chain
// facts (Arc testnet, read directly from the chain) and supplying them
// skips Tower's symbol resolution entirely.
const KNOWN_TOKENS = {
    'USDC': '0x3600000000000000000000000000000000000000',
    'USD Coin': '0x3600000000000000000000000000000000000000',
    'EURC': '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
    'Euro Coin': '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
    'cirBTC': '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF'
};

const isAddress = (v) => /^0x[a-fA-F0-9]{40}$/.test(String(v || ''));

// Canonical decimals read off-chain and cached. Tower swaps in canonical
// atomic units per asset (verified: the built calldata for 100 USDC carried
// 99700000 — a raw 6-dec amount). USDC 6, EURC 6, cirBTC 8 on Arc testnet.
const decimalsCache = new Map(); // address(lower) -> number

async function readDecimals(tokenAddress) {
    const addr = String(tokenAddress || '').toLowerCase();
    if (!isAddress(addr)) return 18;
    if (decimalsCache.has(addr)) return decimalsCache.get(addr);
    if (addr === NATIVE_ADDRESS) { decimalsCache.set(addr, 18); return 18; }
    try {
        const out = await rpc.callWithTimeout(
            rpc.provider.call({ to: addr, data: ethers.id('decimals()') }),
            8000
        );
        const [dec] = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], out);
        const decNum = Number(dec);
        if (Number.isFinite(decNum) && decNum > 0 && decNum <= 36) {
            decimalsCache.set(addr, decNum);
            return decNum;
        }
    } catch (_) { /* fall through */ }
    decimalsCache.set(addr, 18);
    return 18;
}

async function towerFetch(path, body) {
    if (!TOWER_API_KEY) {
        throw Object.assign(new Error('Tower swaps are not configured yet'), { status: 503 });
    }
    let res;
    try {
        res = await fetch(`${TOWER_API_URL}${path}`, {
            method: body ? 'POST' : 'GET',
            headers: {
                'Authorization': `Bearer ${TOWER_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: body ? JSON.stringify(body) : undefined
        });
    } catch (_) {
        throw Object.assign(new Error('Tower Exchange is unreachable right now'), { status: 502 });
    }
    let payload = null;
    try { payload = await res.json(); } catch (_) { /* non-JSON body */ }
    if (!res.ok || !payload || payload.success === false) {
        const msg = (payload && payload.error) || `Tower Exchange refused the request (${res.status})`;
        throw Object.assign(new Error(msg), { status: 400 });
    }
    return payload.data;
}

const slippage = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 5000)
    ? Number(v) : 50;

const round8 = (n) => Math.round(n * 1e8) / 1e8;

/**
 * Quote a swap from a DISPLAY amount ("12.5"). Tokens are addressed directly
 * (symbol resolution only happens for symbols outside the registry) and the
 * input runs in canonical atomic units with decimals from the chain.
 * Quote responses print output/minOut in 18-decimal-normalized units — that
 * is the human conversion.
 */
async function quote({ inputToken, outputToken, amount, slippageTolerance }) {
    const sell = String(inputToken || '').trim();
    const buy = String(outputToken || '').trim();
    const amtNum = Number(amount);
    if (!sell || !buy) throw Object.assign(new Error('Missing token pair'), { status: 400 });
    if (!Number.isFinite(amtNum) || amtNum <= 0) {
        throw Object.assign(new Error('Amount must be a positive number'), { status: 400 });
    }
    if (sell.toLowerCase() === buy.toLowerCase()) {
        throw Object.assign(new Error('Pick two different tokens'), { status: 400 });
    }

    let sellAddr = KNOWN_TOKENS[sell] || sell;
    let buyAddr = KNOWN_TOKENS[buy] || buy;

    // Symbols outside the registry resolve through one 1-unit quote, which
    // names both addresses; they seed the registry for every later call.
    if (!isAddress(sellAddr) || !isAddress(buyAddr)) {
        const probe = await towerFetch('/swap/quote', {
            inputToken: sell,
            outputToken: buy,
            inputAmount: '1',
            slippageTolerance: slippage(slippageTolerance),
            chainId: config.CHAIN_ID
        });
        if (isAddress(probe?.inputToken) && !KNOWN_TOKENS[sell]) KNOWN_TOKENS[sell] = probe.inputToken;
        if (isAddress(probe?.outputToken) && !KNOWN_TOKENS[buy]) KNOWN_TOKENS[buy] = probe.outputToken;
        sellAddr = isAddress(probe?.inputToken) ? probe.inputToken : sellAddr;
        buyAddr = isAddress(probe?.outputToken) ? probe.outputToken : buyAddr;
    }

    const canonDec = await readDecimals(sellAddr);

    // Exact atomic amount in the asset's canonical decimals (extra past-
    // decimal digits clipped).
    const s = String(amtNum);
    const dot = s.indexOf('.');
    const clipped = dot === -1 ? s : s.slice(0, dot + 1 + canonDec);
    const raw = await towerFetch('/swap/quote', {
        inputToken: sellAddr,
        outputToken: buyAddr,
        inputAmount: ethers.parseUnits(clipped, canonDec).toString(),
        slippageTolerance: slippage(slippageTolerance),
        chainId: config.CHAIN_ID
    });

    const output = Number(raw?.outputAmount || '0') / 1e18;
    const minOutRaw = Number(raw?.minOut || '0') / 1e18;
    return {
        quote: raw,
        outputTokenSymbol: buy,
        outputTokenAddress: buyAddr,
        inputTokenSymbol: sell,
        output: round8(output),
        minOut: round8(minOutRaw),
        rate: amtNum > 0 ? round8(output / amtNum) : 0,
        priceImpact: raw?.priceImpact ?? null,
        dexName: raw?.dexName ?? null,
        dexId: raw?.dexId ?? null,
        feeBps: raw?.feeBps ?? null
    };
}

/**
 * Balances for the hub's swap tokens — read through Tower's wallet indexer.
 * The swap executes against the on-chain tokens (the ERC-20 USDC at
 * KNOWN_TOKENS.USDC, not the native gas bucket), so these are the honest
 * sellable numbers for the card.
 */
async function balanceOf(address) {
    const addr = String(address || '').toLowerCase();
    if (!isAddress(addr)) {
        throw Object.assign(new Error('A valid wallet address is required'), { status: 400 });
    }
    const out = {};
    for (const symbol of Object.keys(KNOWN_TOKENS)) {
        try {
            const res = await towerFetch('/wallet/balance', {
                address: addr,
                chainId: 'arc-testnet',
                rpcUrl: 'https://rpc.testnet.arc.io',
                tokenAddress: KNOWN_TOKENS[symbol],
                balanceType: 'token'
            });
            out[symbol] = round8(Number(res?.balance) || 0);
        } catch (_) {
            out[symbol] = 0;
        }
    }
    return { balances: out };
}

/**
 * Build the unsigned approval + swap calldata for a user's wallet. The quote
 * runs HERE — a client cannot forge a stale/favourable quote because it never
 * supplies one. The signer address drives the upstream suspension gate.
 */
async function build({ inputToken, outputToken, amount, address, slippageTolerance }) {
    const userAddress = String(address || '').toLowerCase();
    if (!isAddress(userAddress)) {
        throw Object.assign(new Error('A valid wallet address is required'), { status: 400 });
    }
    const q = await quote({ inputToken, outputToken, amount, slippageTolerance });
    const built = await towerFetch('/swap/build-tx', { quote: q.quote, userAddress });
    return {
        quote: q,
        approval: built?.approval || null,
        swap: built?.swap || null
    };
}

module.exports = { quote, build, balanceOf };
