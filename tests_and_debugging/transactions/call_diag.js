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

    const tradeId = Date.now();
    const amount = ethers.parseUnits("0.1", 18);
    const iface = new ethers.Interface(ABI);
    const data = iface.encodeFunctionData("placeBet", [
        BigInt(tradeId),
        1,
        10,
        10000000000n,
        5,
        wallet.address
    ]);

    console.log("Encoded Data:", data);

    try {
        const result = await provider.call({
            to: CONTRACT_ADDRESS,
            from: wallet.address,
            data: data,
            value: amount
        });
        console.log("Call Success (result):", result);
    } catch (e) {
        console.log("Call Failed.");
        if (e.data) {
            console.log("Revert Data:", e.data);
            if (e.data.startsWith("0x08c379a0")) {
                const reason = ethers.AbiCoder.defaultAbiCoder().decode(["string"], "0x" + e.data.slice(10))[0];
                console.log("REVERT REASON:", reason);
            }
        } else {
            console.log("Raw Error:", e);
        }
    }
}

check();
