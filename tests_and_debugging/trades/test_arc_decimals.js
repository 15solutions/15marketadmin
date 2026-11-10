// Test script to verify Arc network's native currency decimals
require('dotenv').config();
const { ethers } = require('ethers');

const ARC_RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.io";
const CONTRACT_ADDRESS = process.env.ARC_CONTRACT_ADDRESS;

async function testArcDecimals() {
    console.log("🔍 Testing Arc Network Native Currency Decimals...\n");

    const provider = new ethers.JsonRpcProvider(ARC_RPC);

    try {
        // Get network info
        const network = await provider.getNetwork();
        console.log(`✅ Connected to Chain ID: ${network.chainId}`);
        console.log(`📡 Network Name: ${network.name || 'Unknown'}\n`);

        // Check contract balance
        const contractBal = await provider.getBalance(CONTRACT_ADDRESS);
        console.log(`💰 Contract Balance (raw wei): ${contractBal.toString()}`);
        console.log(`💰 Contract Balance (18 decimals): ${ethers.formatUnits(contractBal, 18)}`);
        console.log(`💰 Contract Balance (6 decimals): ${ethers.formatUnits(contractBal, 6)}\n`);

        // Test: What does 1 USDC look like?
        console.log("📊 Test Values:");
        console.log(`1 USDC with 18 decimals: ${ethers.parseUnits("1", 18).toString()}`);
        console.log(`1 USDC with 6 decimals: ${ethers.parseUnits("1", 6).toString()}\n`);

        // Check if Arc uses USDC as native currency
        console.log("🔍 Arc Network Info:");
        console.log("Arc uses USDC as the native gas token.");
        console.log("Question: Does msg.value use 6 decimals (USDC) or 18 decimals (standard EVM)?");
        console.log("\nTo determine this, we need to:");
        console.log("1. Check a successful transaction on Arc explorer");
        console.log("2. See what value was sent in msg.value");
        console.log("3. Compare with the actual USDC amount\n");

    } catch (error) {
        console.error("❌ Error:", error.message);
    }
}

testArcDecimals();
