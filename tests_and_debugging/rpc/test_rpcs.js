const { ethers } = require('ethers');

const RPCs = [
    { name: "Alchemy", url: "https://arc-testnet.g.alchemy.com/v2/gmklUsP-qeITLeu6a8Pw1" },
    { name: "Arc Official 1", url: "https://rpc.testnet.arc.io" },
    { name: "Arc Official 2", url: "https://rpc-test-1.arc.market" }
];

async function test() {
    for (const rpc of RPCs) {
        try {
            console.log(`[Testing] ${rpc.name} (${rpc.url})...`);
            const provider = new ethers.JsonRpcProvider(rpc.url);

            const start = Date.now();
            const network = await Promise.race([
                provider.getNetwork(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
            ]);
            const end = Date.now();

            console.log(`✅ [${rpc.name}] Success! ChainId: ${network.chainId} | Latency: ${end - start}ms`);
        } catch (e) {
            console.log(`❌ [${rpc.name}] Failed: ${e.message}`);
        }
    }
    process.exit(0);
}

test();
