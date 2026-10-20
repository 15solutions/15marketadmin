// Check contract owner and permissions
require('dotenv').config();
const { ethers } = require('ethers');

const ARC_RPC = "https://rpc.testnet.arc.io";
const CONTRACT_ADDRESS = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";
const KEEPER_PRIVATE_KEY = process.env.PRIVATE_KEY;

const ABI = [
    "function owner() view returns (address)"
];

async function checkOwner() {
    console.log("👤 Checking Contract Ownership...\n");

    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);
    const keeper = new ethers.Wallet(KEEPER_PRIVATE_KEY, provider);

    try {
        const owner = await contract.owner();

        console.log(`📍 Contract Address: ${CONTRACT_ADDRESS}`);
        console.log(`👑 Contract Owner: ${owner}`);
        console.log(`🔑 Keeper Address: ${keeper.address}\n`);

        if (owner.toLowerCase() === keeper.address.toLowerCase()) {
            console.log("✅ Keeper IS the contract owner");
            console.log("   Keeper can settle bets\n");
        } else {
            console.log("❌ Keeper is NOT the contract owner!");
            console.log("   Keeper CANNOT settle bets");
            console.log("   This will cause settlement failures\n");
        }

    } catch (error) {
        console.error("❌ Error:", error.message);
    }
}

checkOwner();
