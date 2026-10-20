// Check if there are any existing bets with recent IDs
require('dotenv').config();
const { ethers } = require('ethers');

const ARC_RPC = "https://rpc.testnet.arc.io";
const CONTRACT_ADDRESS = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";

const ABI = [
    "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)"
];

async function checkRecentBetIds() {
    console.log("🔍 Checking for bet ID collisions...\n");

    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

    // Check recent timestamp-based IDs
    const now = Date.now();
    const idsToCheck = [
        now,
        now - 1000,
        now - 2000,
        now - 5000,
        now - 10000,
        now - 60000,
        now - 300000
    ];

    console.log(`Current timestamp: ${now}\n`);

    let foundBets = 0;

    for (const id of idsToCheck) {
        try {
            const bet = await contract.bets(id);

            if (bet.user !== ethers.ZeroAddress) {
                foundBets++;
                console.log(`✅ FOUND BET #${id}`);
                console.log(`   User: ${bet.user}`);
                console.log(`   Amount: ${ethers.formatUnits(bet.amount, 18)} USDC`);
                console.log(`   Direction: ${bet.direction === 1 ? 'UP' : 'DOWN'}`);
                console.log(`   Settled: ${bet.settled}`);
                console.log(`   Won: ${bet.won}\n`);
            }
        } catch (e) {
            // Ignore errors
        }
    }

    if (foundBets === 0) {
        console.log("❌ No bets found with recent timestamp IDs");
        console.log("This suggests the issue is NOT bet ID collision.\n");
    } else {
        console.log(`📊 Found ${foundBets} existing bets`);
        console.log("⚠️  Bet ID collision is possible if using Date.now()\n");
    }

    // Try a completely random ID
    const randomId = Math.floor(Math.random() * 1000000000000000);
    console.log(`Testing random ID: ${randomId}`);

    try {
        const bet = await contract.bets(randomId);
        if (bet.user === ethers.ZeroAddress) {
            console.log("✅ Random ID is available\n");
        } else {
            console.log("❌ Even random ID exists! Something is wrong.\n");
        }
    } catch (e) {
        console.log(`Error checking random ID: ${e.message}\n`);
    }
}

checkRecentBetIds();
