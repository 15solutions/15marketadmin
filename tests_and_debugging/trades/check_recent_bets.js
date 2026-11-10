// Check recent transactions on the contract
require('dotenv').config();
const { ethers } = require('ethers');

const ARC_RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.io";
const CONTRACT_ADDRESS = process.env.ARC_CONTRACT_ADDRESS;

const ABI = [
    "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)",
    "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)"
];

async function checkRecentBets() {
    console.log("🔍 Checking recent bets on contract...\n");

    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

    try {
        const currentBlock = await provider.getBlockNumber();
        console.log(`📦 Current Block: ${currentBlock}\n`);

        // Check last 1000 blocks for BetPlaced events
        const fromBlock = Math.max(0, currentBlock - 1000);
        console.log(`🔍 Scanning blocks ${fromBlock} to ${currentBlock}...\n`);

        const filter = contract.filters.BetPlaced();
        const events = await contract.queryFilter(filter, fromBlock, currentBlock);

        console.log(`📊 Found ${events.length} BetPlaced events\n`);

        if (events.length > 0) {
            // Show last 5 events
            const recentEvents = events.slice(-5);
            for (const event of recentEvents) {
                const { id, user, amount, direction, entryPrice } = event.args;
                console.log(`\n🎲 Bet #${id}`);
                console.log(`   User: ${user}`);
                console.log(`   Amount (raw): ${amount.toString()}`);
                console.log(`   Amount (18 decimals): ${ethers.formatUnits(amount, 18)}`);
                console.log(`   Amount (6 decimals): ${ethers.formatUnits(amount, 6)}`);
                console.log(`   Direction: ${direction === 1 ? 'UP' : 'DOWN'}`);
                console.log(`   Entry Price: ${Number(entryPrice) / 100000000}`);

                // Check the bet details from contract
                try {
                    const betDetails = await contract.bets(id);
                    console.log(`   Settled: ${betDetails.settled}`);
                    if (betDetails.settled) {
                        console.log(`   Won: ${betDetails.won}`);
                    }
                } catch (e) {
                    console.log(`   Could not fetch bet details: ${e.message}`);
                }
            }
        } else {
            console.log("❌ No bets found in recent blocks.");
            console.log("This suggests either:");
            console.log("1. No trades have been placed recently");
            console.log("2. The contract address is incorrect");
            console.log("3. The RPC is not synced");
        }

    } catch (error) {
        console.error("\n❌ Error:", error.message);
    }
}

checkRecentBets();
