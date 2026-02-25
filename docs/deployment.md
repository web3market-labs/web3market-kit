# Deployment

web3market-kit supports two deployment paths: local deployment to Anvil (no auth required) and remote deployment to testnets/mainnets (requires auth). Both use Foundry's `forge` toolchain.

---

## Local Deployment (Anvil)

Local deployment works without authentication and is available from two places:

### From the workspace menu

Run `w3m` inside your project directory, then select "Deploy contracts" > "Local (Anvil)".

### From the post-scaffold menu

After `w3m new`, select "Deploy locally" (shown for contracts-only projects) or "Start dev environment" (shown for projects with a frontend -- also deploys locally).

### What local deployment does

1. Starts Anvil on `http://127.0.0.1:8545`
2. Builds contracts (`forge build`)
3. Deploys via `forge script` using the default Anvil private key
4. Writes deployment to `deployments/31337.json`
5. Runs codegen to update TypeScript bindings
6. Shows a deployment summary with contract addresses

The default Anvil private key (`0xac0974...`) is used automatically -- no environment variables needed.

---

## Remote Deployment (Testnets / Mainnets)

### CLI Usage

```bash
w3m deploy --chain <chain> [--skip-tests] [--verify] [--vercel]
```

| Flag | Description |
|---|---|
| `--chain <chain>` | Target chain name (required) |
| `--skip-tests` | Skip `forge test` before deployment |
| `--verify` | Verify contracts on block explorer |
| `--vercel` | Deploy frontend to Vercel afterward |

### Supported Chains

| Chain | Chain ID | Tier required |
|---|---|---|
| `sepolia` | 11155111 | Free |
| `base-sepolia` | 84532 | Free |
| `arbitrum-sepolia` | 421614 | Free |
| `polygon-amoy` | 80002 | Free |
| `optimism-sepolia` | 11155420 | Free |
| `ethereum` | 1 | Pro |
| `base` | 8453 | Pro |
| `arbitrum` | 42161 | Pro |
| `polygon` | 137 | Pro |
| `optimism` | 10 | Pro |

### Required Environment Variables

| Variable | Description |
|---|---|
| `{CHAIN}_RPC_URL` | RPC endpoint. Chain name uppercased, dashes to underscores (e.g., `SEPOLIA_RPC_URL`, `BASE_SEPOLIA_RPC_URL`). |
| `DEPLOYER_PRIVATE_KEY` | Deployer wallet private key. |

Set these in a `.env` file or export them in your shell.

### Deployment Steps

1. **Authentication** -- Validates your API key
2. **API preflight** -- Server checks if deployment is allowed for your tier + chain
3. **Environment validation** -- Checks for RPC URL and deployer key
4. **Build** -- `forge build` in `contracts/`
5. **Tests** -- `forge test` (unless `--skip-tests`)
6. **Deploy** -- `forge script` with `--broadcast`
7. **Save deployment** -- Writes to `deployments/{chainId}.json`
8. **Register** -- Reports deployment to the API
9. **Codegen** -- Updates TypeScript bindings
10. **Vercel** (optional) -- Deploys frontend

### Example

```bash
# Deploy to Sepolia (requires auth + env vars)
export SEPOLIA_RPC_URL="https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY"
export DEPLOYER_PRIVATE_KEY="0x..."
w3m deploy --chain sepolia

# Deploy to Base mainnet with verification (requires Pro tier)
w3m deploy --chain base --verify
```

---

## Deployment Output

Deployment results are saved to `deployments/{chainId}.json`:

```json
{
  "chainId": 11155111,
  "chain": "sepolia",
  "deployedAt": "2026-02-25T12:00:00.000Z",
  "contracts": [
    {
      "contractName": "MyToken",
      "address": "0x1234...5678",
      "txHash": "0xabcd...ef01",
      "blockNumber": 1234567
    }
  ]
}
```

View deployments with:

```bash
w3m deployments
```

Or from the workspace menu: "View deployments" (shown when deployments exist).
