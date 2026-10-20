const fs = require('fs');
const path = require('path');
const solc = require('solc');
const { ethers } = require('ethers');
require('dotenv').config();

const RPC_URL = process.env.ARC_RPC_1 || "https://rpc.testnet.arc.io";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

async function deploy() {
    console.log("🛠️  [Manual Deployment] Compiling ArcPrediction.sol...");

    const contractPath = path.join(__dirname, '../../contracts/ArcPrediction.sol');
    const source = fs.readFileSync(contractPath, 'utf8');

    const input = {
        language: 'Solidity',
        sources: {
            'ArcPrediction.sol': {
                content: source,
            },
        },
        settings: {
            outputSelection: {
                '*': {
                    '*': ['abi', 'evm.bytecode'],
                },
            },
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input)));

    if (output.errors) {
        output.errors.forEach((err) => {
            if (err.severity === 'error') {
                console.error(`❌ Compilation Error: ${err.message}`);
                process.exit(1);
            } else {
                console.warn(`⚠️  Warning: ${err.message}`);
            }
        });
    }

    const contractData = output.contracts['ArcPrediction.sol']['ArcPrediction'];
    const abi = contractData.abi;
    const bytecode = contractData.evm.bytecode.object;

    console.log("✅ Compilation Successful.");
    console.log("📡 Connecting to Arc Network...");

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log(`👤 Deployer: ${wallet.address}`);
    const balance = await provider.getBalance(wallet.address);
    console.log(`💰 Balance: ${ethers.formatEther(balance)} ARC`);

    const factory = new ethers.ContractFactory(abi, bytecode, wallet);

    console.log("🚀 Deploying Contract...");
    try {
        const contract = await factory.deploy({
            gasLimit: 5000000
        });

        console.log(`⏳ Waiting for deployment... Hash: ${contract.deploymentTransaction().hash}`);
        await contract.waitForDeployment();

        const address = await contract.getAddress();
        console.log(`\n🎉 SUCCESS! ArcPrediction Deployed to: ${address}`);
        console.log(`\n👉 NEXT STEP: Update TREASURY_ADDRESS in your .env with this address.`);
        
        // Save ABI for reference
        const abiPath = path.join(__dirname, '../../15market/src/abi/ArcPrediction.json');
        fs.writeFileSync(abiPath, JSON.stringify({ abi }, null, 2));
        console.log(`📝 Updated ABI at: ${abiPath}`);

    } catch (err) {
        console.error("❌ Deployment Failed:", err.message);
    }
}

deploy();
