const { ethers } = require("ethers");
require("dotenv").config();

// Apply DNS Patch
const dns = require('dns');
const originalLookup = dns.lookup;
dns.lookup = (hostname, options, callback) => {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    if (hostname === 'rpc.testnet.arc.io') {
        if (options && options.all) {
            return callback(null, [{ address: '64.130.40.38', family: 4 }]);
        }
        return callback(null, '64.130.40.38', 4);
    }
    return originalLookup(hostname, options, callback);
};

const ARC_RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.io";
const CONTRACT_ADDRESS = "0x2E8DC6aBd23fC5CCB75940C8D389D9DDB21eDb31";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const ABI = [
    "function nextBetId() view returns (uint256)",
    "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)"
];

async function main() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

    try {
        const nextId = await contract.nextBetId();
        console.log(`Current Next Bet ID: ${nextId}`);

        if (nextId > 0) {
            const lastId = nextId - 1n;
            console.log(`Inspecting Bet ${lastId}...`);
            const bet = await contract.bets(lastId);
            console.log(`Bet ${lastId}:`);
            console.log(`- Amount: ${ethers.formatEther(bet.amount)} ARC`);
            console.log(`- Timestamp: ${bet.timestamp} (${new Date(Number(bet.timestamp) * 1000).toLocaleString()})`);
            console.log(`- Duration: ${bet.duration}`);
            console.log(`- Settled: ${bet.settled}`);
            console.log(`- Won: ${bet.won}`);

            // Check potential payout
            const payout = (bet.amount * 198n) / 100n;
            console.log(`- Potential Payout: ${ethers.formatEther(payout)} ARC`);
        }
    } catch (e) {
        console.error("Error:", e.message);
    }
}

main();
