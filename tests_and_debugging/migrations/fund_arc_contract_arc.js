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

async function main() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log(`Checking balances...`);
    const contractBalance = await provider.getBalance(CONTRACT_ADDRESS);
    console.log(`📊 Contract Balance: ${ethers.formatEther(contractBalance)} ARC`);

    const walletBalance = await provider.getBalance(wallet.address);
    console.log(`💰 Wallet Balance: ${ethers.formatEther(walletBalance)} ARC`);

    const amountToFund = ethers.parseEther("1.0");

    if (walletBalance > amountToFund) {
        console.log(`\n🚀 Funding contract with 1.0 ARC...`);
        const tx = await wallet.sendTransaction({
            to: CONTRACT_ADDRESS,
            value: amountToFund
        });
        console.log(`📤 TX sent: ${tx.hash}`);
        await tx.wait();
        console.log(`✅ Funded!`);
    } else {
        console.error("❌ Not enough funds in wallet to fund contract.");
    }
}

main().catch(console.error);
