import requests

rpcs = [
    "https://arc-testnet.g.alchemy.com/v2/gmklUsP-qeITLeu6a8Pw1",
    "https://rpc.testnet.arc.io"
]

for rpc in rpcs:
    print(f"\nChecking {rpc}...")
    try:
        response = requests.post(rpc, json={"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}, timeout=10)
        print(f"Chain ID: {response.json().get('result')}")
        
        # Also check block number to see if it's lagging
        response = requests.post(rpc, json={"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}, timeout=10)
        print(f"Block Number: {response.json().get('result')}")
    except Exception as e:
        print(f"Error: {e}")
