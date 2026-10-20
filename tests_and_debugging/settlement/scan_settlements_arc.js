require('dotenv').config();
const { ethers } = require('ethers');

const ARC_RPC = "https://rpc.testnet.arc.io";
const CONTRACT_ADDRESS = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";

async function check() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const block = await provider.getBlockNumber();

    // Scan last 1000 blocks for BetSettled
    const abi = ["event BetSettled(uint256 indexed id, address indexed user, uint256 settlementPrice, bool won, uint256 payout)"];
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

    const fromBlock = block - 1000;
    console.log(`Scanning since block ${fromBlock}...`);
    const events = await contract.queryFilter("BetSettled", fromBlock);
    console.log(`Found ${events.length} BetSettled events.`);

    for (const e of events) {
        console.log(`Settled #${e.args.id}: User ${e.args.user}, Won ${e.args.won}, Payout ${ethers.formatUnits(e.args.payout, 18)} USDC`);
    }
}

check();
