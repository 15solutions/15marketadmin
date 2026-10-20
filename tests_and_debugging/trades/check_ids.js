require('dotenv').config();
const { ethers } = require('ethers');

const ARC_RPC = "https://rpc.testnet.arc.io";
const CONTRACT_ADDRESS = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";

const ABI = [
    "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)"
];

async function check() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

    // Check IDs 1 through 10
    for (let i = 1; i <= 10; i++) {
        const b = await contract.bets(i);
        if (b.user !== ethers.ZeroAddress) {
            console.log(`Bet #${i} exists: user=${b.user}`);
        }
    }

    // Check a very recent Date.now() ID if we have one from logs
    // I'll check the one I used in test_frontend_params.js if I can find it
}

check();
