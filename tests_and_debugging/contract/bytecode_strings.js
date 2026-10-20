require('dotenv').config();
const { ethers } = require('ethers');

const ARC_RPC = "https://rpc.testnet.arc.io";
const CONTRACT_ADDRESS = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";

async function check() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const code = await provider.getCode(CONTRACT_ADDRESS);

    // Look for common revert strings in hex
    // "Bet amount must be greater than 0"
    // "Invalid direction"
    // "Bet ID already exists"

    function hexToAscii(hex) {
        let str = '';
        for (let i = 0; i < hex.length; i += 2) {
            let ch = parseInt(hex.substr(i, 2), 16);
            if (ch >= 32 && ch <= 126) str += String.fromCharCode(ch);
        }
        return str;
    }

    console.log("Strings found in bytecode:");
    const ascii = hexToAscii(code.slice(2));
    console.log(ascii.split(/[^a-zA-Z0-9\s!?,."']+/).filter(s => s.length > 5));
}

check();
