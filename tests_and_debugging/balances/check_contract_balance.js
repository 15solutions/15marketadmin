const { ethers } = require('ethers');
require('dotenv').config();

const ARC_RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.io";
const CONTRACT_ADDRESS = process.env.ARC_CONTRACT_ADDRESS || "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";

async function checkContractBalance() {
    console.log("🔍 Checking Contract Balance...\n");
    console.log(`RPC: ${ARC_RPC}`);
    console.log(`Contract: ${CONTRACT_ADDRESS}\n`);

    const provider = new ethers.JsonRpcProvider(ARC_RPC);

    // Get contract balance
    const balance = await provider.getBalance(CONTRACT_ADDRESS);
    const formattedBalance = ethers.formatUnits(balance, 18);

    console.log(`💰 Contract Balance: ${formattedBalance} USDC`);
    console.log(`📊 Raw Wei: ${balance.toString()}\n`);

    // Check if there are active bets
    const ABI = [
        "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)"
    ];

    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

    // Try to read a few recent bet IDs
    console.log("📋 Checking recent bets...");
    const now = Date.now();
    let totalStaked = 0n;
    let activeBets = 0;

    for (let i = 0; i < 10; i++) {
        const betId = now - (i * 10000); // Check recent IDs
        try {
            const bet = await contract.bets(betId);
            if (bet.user !== ethers.ZeroAddress && !bet.settled) {
                console.log(`\n  Bet #${betId}:`);
                console.log(`    User: ${bet.user}`);
                console.log(`    Amount: ${ethers.formatUnits(bet.amount, 18)} USDC`);
                console.log(`    Direction: ${bet.direction === 1 ? 'UP' : 'DOWN'}`);
                console.log(`    Settled: ${bet.settled}`);
                totalStaked += bet.amount;
                activeBets++;
            }
        } catch (e) {
            // Bet doesn't exist, skip
        }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Active Bets Found: ${activeBets}`);
    console.log(`   Total Staked: ${ethers.formatUnits(totalStaked, 18)} USDC`);
    console.log(`   Contract Balance: ${formattedBalance} USDC`);

    if (parseFloat(formattedBalance) > 0) {
        console.log(`\n✅ CONTRACT IS HOLDING FUNDS - Stakes are NOT bouncing back!`);
    } else {
        console.log(`\n⚠️  CONTRACT BALANCE IS ZERO - This could indicate an issue`);
    }
}

checkContractBalance().catch(console.error);
