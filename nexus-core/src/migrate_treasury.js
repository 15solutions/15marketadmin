const { ethers } = require('ethers');
require('dotenv').config();

const ARC_RPC = process.env.ARC_RPC_1 || "https://rpc.testnet.arc.io";
const OLD_TREASURY = "0x345014899b42bF9034D9475760609e64B1433A6a";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

async function migrate() {
    console.log("🚀 [Migration] Starting Treasury Migration...");
    
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    const OLD_ABI = ["function withdraw(uint256 _amount) external", "function owner() view returns (address)"];
    const oldContract = new ethers.Contract(OLD_TREASURY, OLD_ABI, wallet);

    try {
        const balanceWei = await provider.getBalance(OLD_TREASURY);
        console.log(`💰 Old Treasury Balance: ${ethers.formatEther(balanceWei)} ARC`);

        if (balanceWei === 0n) {
            console.log("✅ Treasury already empty. Ready for new deployment.");
            return;
        }

        console.log("📤 Withdrawing all funds to Root Wallet...");
        const tx = await oldContract.withdraw(balanceWei, { gasLimit: 200000 });
        console.log(`📡 Transaction Sent: ${tx.hash}`);
        
        await tx.wait();
        console.log("✅ Funds successfully moved to Root Wallet.");
        
        const rootBal = await provider.getBalance(wallet.address);
        console.log(`👤 Root Wallet Balance: ${ethers.formatEther(rootBal)} ARC`);
        console.log("\n⚠️  NEXT STEP: Deploy the new ArcPrediction.sol and then send these funds to it.");

    } catch (err) {
        console.error("❌ Migration Failed:", err.message);
    }
}

migrate();
