const { ethers } = require("ethers");
require("dotenv").config();

// Apply DNS Patch for Arc RPC
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

    console.log(`Checking balances for Contract: ${CONTRACT_ADDRESS}`);
    console.log(`Keeper Wallet: ${wallet.address}`);

    try {
        const contractBalance = await provider.getBalance(CONTRACT_ADDRESS);
        console.log(`📊 Contract Balance: ${ethers.formatEther(contractBalance)} ARC`);

        const walletBalance = await provider.getBalance(wallet.address);
        console.log(`💰 Wallet Balance: ${ethers.formatEther(walletBalance)} ARC`);
    } catch (e) {
        console.error("Error fetching balances:", e.message);
    }
}

main();
