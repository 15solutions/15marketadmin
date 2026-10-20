const { ethers } = require('ethers');

async function check(rpc, addr) {
    const provider = new ethers.JsonRpcProvider(rpc);
    try {
        const bal = await provider.getBalance(addr);
        console.log(`Balance of ${addr} on ${rpc}: ${ethers.formatUnits(bal, 18)} ARC`);
    } catch (e) {
        console.log(`Failed to get balance of ${addr}: ${e.message}`);
    }
}

async function run() {
    await check("https://rpc.testnet.arc.io", "0xd8F519179d16Fb4B791Cd12eF027bD29ABeBC71e");
    await check("https://5042002.rpc.thirdweb.com", "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8");
}

run();
