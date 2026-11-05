/**
 * Treasury liquidity management — the admin console's Liquidity section.
 *
 * The treasury contract holds the platform's liquidity (the "USDC" coin, which
 * on Arc is the native gas ledger itself — see tower.js / the verified
 * shared-ledger fact). The root wallet (config.PRIVATE_KEY) is the treasury
 * owner, so it can:
 *
 *   DRAIN — treasuryContract.withdraw(amount) pulls native funds out of the
 *           treasury contract into the operator wallet. The full balance is
 *           supported (balanceWei passed straight through).
 *
 *   SEND  — a direct native transfer from the operator wallet to any address.
 *           The operator must always keep enough to pay for gas, so the send
 *           refuses amounts that would strand the wallet below its next gas
 *           bill.
 *
 * Both actions are admin-only routes (/admin/liquidity/*), and both write a
 * SIEM event so treasury movement is always auditable in the threat feed.
 */
const { ethers } = require('ethers');
const config = require('./config');
const rpc = require('./rpc');

const TREASURY_ABI = [
    "function withdraw(uint256 _amount) external",
    "function owner() view returns (address)"
];

const treasury = (config.TREASURY_ADDRESS && config.TREASURY_ADDRESS !== ethers.ZeroAddress && rpc.wallet)
    ? new ethers.Contract(config.TREASURY_ADDRESS, TREASURY_ABI, rpc.wallet)
    : null;

/** Native balance of an address via the fallback provider; null on failure. */
async function nativeBalance(address) {
    if (!address || address === ethers.ZeroAddress) return null;
    try {
        const wei = await (rpc.provider || rpc.writeProvider).getBalance(address);
        return { wei, human: ethers.formatEther(wei) };
    } catch {
        return null;
    }
}

/**
 * Everything the console needs in one read: where the money lives, how much
 * of it there is, and whether the operator can actually pull from it.
 */
async function snapshot() {
    const [treasuryBal, operatorBal] = await Promise.all([
        nativeBalance(config.TREASURY_ADDRESS),
        nativeBalance(rpc.wallet?.address)
    ]);

    let owner = null;
    if (treasury) {
        try { owner = await treasury.owner(); } catch { owner = null; }
    }

    const operator = rpc.wallet?.address || null;
    return {
        treasuryAddress: config.TREASURY_ADDRESS && config.TREASURY_ADDRESS !== ethers.ZeroAddress ? config.TREASURY_ADDRESS : null,
        treasuryBalance: treasuryBal?.human ?? null,
        operatorAddress: operator,
        operatorBalance: operatorBal?.human ?? null,
        operatorIsOwner: !!(owner && operator && owner.toLowerCase() === operator.toLowerCase()),
        ready: !!(treasury && rpc.wallet)
    };
}

/** Estimated worst-case gas for the SEND path, to protect the gas reserve. */
async function gasReserveWei() {
    try {
        const fee = await (rpc.writeProvider || rpc.provider).getFeeData();
        const gasPrice = fee.gasPrice || fee.maxFeePerGas || 0n;
        return gasPrice * 120000n; // native transfer ~21k; generous headroom
    } catch {
        return ethers.parseEther('1'); // conservative floor if the RPC won't quote
    }
}

/**
 * DRAIN — move treasury liquidity into the operator wallet.
 * @param {string} amount 'all' or a decimal string ("45.5").
 */
async function drain(amount, { by = 'admin' } = {}) {
    if (!treasury || !rpc.wallet) throw new Error('Treasury drain is not configured (missing TREASURY_ADDRESS or PRIVATE_KEY)');

    const bal = await nativeBalance(config.TREASURY_ADDRESS);
    if (!bal || bal.wei === 0n) throw new Error('Treasury is empty — nothing to drain');

    // Refuse a doomed tx: if the operator is not the owner the contract will
    // revert on sight (the migrate tooling proved withdraw pulls to msg.sender,
    // so an owner mismatch equals a dead transaction).
    let owner = null;
    try { owner = await treasury.owner(); } catch { /* owner() missing: proceed */ }
    if (owner && owner.toLowerCase() !== rpc.wallet.address.toLowerCase()) {
        throw new Error(`Operator ${rpc.wallet.address.slice(0, 6)}…${rpc.wallet.address.slice(-4)} is not the treasury owner — drain would revert`);
    }

    let wei;
    if (String(amount).toLowerCase() === 'all' || amount === '' || amount === undefined || amount === null) {
        wei = bal.wei;
    } else {
        try {
            wei = ethers.parseEther(String(amount));
        } catch {
            throw new Error('Drain amount must be a number or "all"');
        }
        if (wei <= 0n) throw new Error('Drain amount must be above zero');
        if (wei > bal.wei) throw new Error(`Treasury only holds ${bal.human} — drain requested exceeds it`);
    }

    const tx = await treasury.withdraw(wei);
    const receipt = await tx.wait();
    return {
        ok: true,
        hash: receipt?.hash || tx.hash,
        drained: ethers.formatEther(wei),
        to: rpc.wallet.address
    };
}

/**
 * SEND — push native treasury funds ("USDC") from the operator wallet to any
 * address. The wallet keeps its gas reserve: the send is refused if it would
 * leave the operator unable to pay for the next transaction.
 */
async function send(address, amount, { by = 'admin' } = {}) {
    if (!rpc.wallet) throw new Error('Operator wallet is not configured (missing PRIVATE_KEY)');
    const to = String(address || '').trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(to)) throw new Error('A valid destination wallet address is required');
    if (to.toLowerCase() === rpc.wallet.address.toLowerCase()) throw new Error('Destination is the operator wallet itself');

    let wei;
    try {
        wei = ethers.parseEther(String(amount));
    } catch {
        throw new Error('Amount must be a decimal number of USDC');
    }
    if (wei <= 0n) throw new Error('Amount must be above zero');

    const opBal = await nativeBalance(rpc.wallet.address);
    if (!opBal) throw new Error('Could not read the operator wallet balance — try again');
    const reserve = await gasReserveWei();
    if (wei + reserve > opBal.wei) {
        throw new Error(`Insufficient liquidity: sending ${ethers.formatEther(wei)} would leave the operator below its gas reserve. Available: ${opBal.human}`);
    }

    const tx = await rpc.wallet.sendTransaction({ to, value: wei });
    const receipt = await tx.wait();
    return {
        ok: true,
        hash: receipt?.hash || tx.hash,
        amount: ethers.formatEther(wei),
        to
    };
}

module.exports = { snapshot, drain, send };
