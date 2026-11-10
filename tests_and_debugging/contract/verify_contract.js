// Verify contract deployment
require('dotenv').config();
const { ethers } = require('ethers');

const ARC_RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.io";
const CONTRACT_ADDRESS = process.env.ARC_CONTRACT_ADDRESS;

async function verifyContract() {
    console.log("🔍 Verifying Contract Deployment...\n");
    console.log(`📍 Contract Address: ${CONTRACT_ADDRESS}\n`);

    const provider = new ethers.JsonRpcProvider(ARC_RPC);

    try {
        // Check if contract exists
        const code = await provider.getCode(CONTRACT_ADDRESS);

        if (code === '0x') {
            console.log("❌ NO CONTRACT FOUND AT THIS ADDRESS!");
            console.log("The contract is not deployed or the address is wrong.\n");
            return;
        }

        console.log("✅ Contract exists!");
        console.log(`📝 Bytecode length: ${code.length} characters\n`);

        // Check contract balance
        const balance = await provider.getBalance(CONTRACT_ADDRESS);
        console.log(`💰 Contract Balance:`);
        console.log(`   Raw: ${balance.toString()}`);
        console.log(`   As 18 decimals: ${ethers.formatUnits(balance, 18)}`);
        console.log(`   As 6 decimals: ${ethers.formatUnits(balance, 6)}\n`);

        // Try to call owner function
        const ABI = ["function owner() view returns (address)"];
        const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

        try {
            const owner = await contract.owner();
            console.log(`👤 Contract Owner: ${owner}\n`);
        } catch (e) {
            console.log(`⚠️  Could not fetch owner: ${e.message}\n`);
        }

    } catch (error) {
        console.error("❌ Error:", error.message);
    }
}

verifyContract();
