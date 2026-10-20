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
const OLD_CONTRACT = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";
const NEW_CONTRACT = "0xd8F519179d16Fb4B791Cd12eF027bD29ABeBC71e";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const ABI = [
    "function withdraw(uint256 amount) external",
    "function owner() view returns (address)"
];

async function main() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log(`🚀 Migrating funds from ${OLD_CONTRACT} to ${NEW_CONTRACT}...`);

    const oldBal = await provider.getBalance(OLD_CONTRACT);
    console.log(`📊 Old Contract Balance: ${ethers.formatEther(oldBal)} ARC`);

    if (oldBal > 0n) {
        const contract = new ethers.Contract(OLD_CONTRACT, ABI, wallet);

        console.log(`🔓 Withdrawing ${ethers.formatEther(oldBal)} ARC to owner wallet...`);
        const tx1 = await contract.withdraw(oldBal);
        await tx1.wait();
        console.log(`✅ Withdrawal complete! TX: ${tx1.hash}`);

        const walletBal = await provider.getBalance(wallet.address);
        console.log(`💰 New Wallet Balance: ${ethers.formatEther(walletBal)} ARC`);

        const amountToTransfer = oldBal; // Keep it simple
        console.log(`📥 Sending ${ethers.formatEther(amountToTransfer)} ARC to new contract...`);
        const tx2 = await wallet.sendTransaction({
            to: NEW_CONTRACT,
            value: amountToTransfer
        });
        await tx2.wait();
        console.log(`✅ Migration successful! TX: ${tx2.hash}`);
    } else {
        console.log("No funds to migrate.");
    }
}

main().catch(console.error);
