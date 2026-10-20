const { ethers } = require('ethers');
require('dotenv').config({ path: '../backend/.env' });

const RPC_ENDPOINTS = [
    "https://rpc-test-1.arc.market",
    "https://5042002.rpc.thirdweb.com",
    "https://rpc.testnet.arc.io",
];

async function main() {
    let provider;
    for (const rpc of RPC_ENDPOINTS) {
        try {
            provider = new ethers.JsonRpcProvider(rpc);
            await provider.getBlockNumber();
            console.log(`Connected to ${rpc}`);
            break;
        } catch (e) {
            console.log(`Failed to connect to ${rpc}`);
        }
    }

    if (!provider) {
        console.error("All RPCs failed");
        return;
    }

    const contractAddress = process.env.ARC_CONTRACT_ADDRESS;
    const privateKey = process.env.PRIVATE_KEY;
    const wallet = new ethers.Wallet(privateKey, provider);

    const contractBal = await provider.getBalance(contractAddress);
    const walletBal = await provider.getBalance(wallet.address);

    console.log(`Contract: ${contractAddress}`);
    console.log(`Contract Balance: ${ethers.formatEther(contractBal)} ARC/USDC`);
    console.log(`Wallet address: ${wallet.address}`);
    console.log(`Wallet Balance: ${ethers.formatEther(walletBal)} ARC/USDC`);
}

main().catch(console.error);
