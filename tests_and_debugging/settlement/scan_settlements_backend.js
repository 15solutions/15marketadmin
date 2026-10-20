const { ethers, FetchRequest } = require('ethers');
const dns = require('dns');
require('dotenv').config({ path: './backend/.env' });

const originalLookup = dns.lookup;
dns.lookup = (hostname, options, callback) => {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    if (hostname === 'rpc.testnet.arc.io' || hostname === 'rpc-test-1.arc.market') {
        const ip = '64.130.40.38';
        if (options && options.all) {
            return callback(null, [{ address: ip, family: 4 }]);
        }
        return callback(null, ip, 4);
    }
    return originalLookup(hostname, options, callback);
};

const RPC = "https://rpc.testnet.arc.io";
const CONTRACT = "0x345014899b42bF9034D9475760609e64B1433A6a";

async function main() {
    console.log("Scanning for BetSettled events on Arc...");
    const fetchReq = new FetchRequest(RPC);
    fetchReq.timeout = 30000;
    const provider = new ethers.JsonRpcProvider(fetchReq, ethers.Network.from(5042002), { staticNetwork: true });

    const abi = ["event BetSettled(uint256 indexed id, address indexed user, uint256 settlementPrice, bool won, uint256 payout)"];
    const contract = new ethers.Contract(CONTRACT, abi, provider);

    const currentBlock = await provider.getBlockNumber();
    console.log(`Current Block: ${currentBlock}`);

    // Scan last 100 blocks
    const filter = contract.filters.BetSettled();
    const events = await contract.queryFilter(filter, currentBlock - 500, currentBlock);

    console.log(`Found ${events.length} BetSettled events in the last 500 blocks.`);

    events.slice(-5).forEach(e => {
        console.log(`- Bet ${e.args[0]}: User ${e.args[1]}, Won: ${e.args[3]}, Payout: ${ethers.formatEther(e.args[4])}`);
    });
}

main().catch(console.error);
