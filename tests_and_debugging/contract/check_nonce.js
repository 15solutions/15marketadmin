require('dotenv').config();
const { ethers } = require('ethers');

const ARC_RPC = "https://rpc.testnet.arc.io";
const CONTRACT_ADDRESS = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";

async function check() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const count = await provider.getTransactionCount(CONTRACT_ADDRESS);
    console.log("Contract Nonce (outbound txs):", count);
}

check();
