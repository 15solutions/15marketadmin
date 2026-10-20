require('dotenv').config();
const { ethers } = require('ethers');

const ARC_RPC = "https://rpc.testnet.arc.io";
const CONTRACT_ADDRESS = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const ABI = [
    "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable"
];

async function check() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

    const tradeId = Date.now() + 1000000; // unique ID
    const amount = ethers.parseUnits("0.1", 6); // TRYING 6 DECIMALS

    console.log("Trying with 6 decimals. Value:", amount.toString());

    try {
        await contract.placeBet.staticCall(
            BigInt(tradeId),
            1,
            10,
            10000000000n,
            5,
            wallet.address,
            { value: amount, from: wallet.address }
        );
        console.log("✅ SUCCESS with 6 decimals!");
    } catch (e) {
        console.log("❌ FAILED with 6 decimals.");
    }
}

check();
