require('dotenv').config();
const { ethers } = require('ethers');

const ARC_RPC = "https://rpc.testnet.arc.io";
const CONTRACT_ADDRESS = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";

async function check() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const balance = await provider.getBalance(CONTRACT_ADDRESS);
    console.log("Contract balance:", ethers.formatUnits(balance, 18), "USDC");

    // Check if we can see any recent blocks
    const block = await provider.getBlockNumber();
    console.log("Current block:", block);

    // We can't easily scan all txs without an indexer, but let's check events
    const abi = ["event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)"];
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

    // Scan last 5000 blocks
    const fromBlock = block - 5000;
    console.log(`Scanning since block ${fromBlock}...`);
    const events = await contract.queryFilter("BetPlaced", fromBlock);
    console.log(`Found ${events.length} BetPlaced events.`);

    for (const e of events) {
        console.log(`Trade #${e.args.id}: User ${e.args.user}, Amount ${ethers.formatUnits(e.args.amount, 18)} USDC`);
    }
}

check();
