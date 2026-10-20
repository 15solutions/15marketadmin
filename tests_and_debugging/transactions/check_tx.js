const { ethers } = require("ethers");
require("dotenv").config();

const ARC_RPC = "https://rpc.testnet.arc.io";
const TX_HASH = "0x61c32f6b7b00e1b791fb27c48711df87423ba8e3232050c4ed76f417b2e5dcf4";

async function main() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);

    console.log(`🔍 Checking TX: ${TX_HASH}`);
    const tx = await provider.getTransaction(TX_HASH);
    const receipt = await provider.getTransactionReceipt(TX_HASH);

    if (!receipt) {
        console.log("❌ Transaction not found or not yet mined.");
        return;
    }

    console.log(`✅ Status: ${receipt.status === 1 ? 'SUCCESS' : 'FAILED'}`);
    console.log(`📦 Block Number: ${receipt.blockNumber}`);
    console.log(`⛽ Gas Used: ${receipt.gasUsed.toString()}`);

    // Check if there are any internal transfers or logs
    console.log(`📜 Logs Count: ${receipt.logs.length}`);
    receipt.logs.forEach((log, i) => {
        console.log(`  Log ${i}: ${log.topics[0]}`);
    });

}

main().catch(console.error);
