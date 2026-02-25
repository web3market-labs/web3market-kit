# Authentication

Authentication in web3market-kit is simple: you get an API key from the web dashboard and pass it to the CLI. Authentication is only required for deploying to testnets and mainnets. Everything else works without it.

## What Requires Auth

| Feature | Auth required? |
|---|---|
| Create a project (`w3m new`) | No |
| Start dev environment (`w3m dev`) | No |
| Deploy locally (Anvil) | No |
| Run tests (`w3m test`) | No |
| Security audit (`w3m audit`) | No |
| Interactive workspace (`w3m`) | No |
| Deploy to testnet (`w3m deploy --chain sepolia`) | **Yes** |
| Deploy to mainnet (`w3m deploy --chain ethereum`) | **Yes** |
| Browse templates (`w3m templates`) | **Yes** |

## Authenticating

### Step 1: Get an API key

Visit [web3.market/dashboard/plan](https://web3.market/dashboard/plan) and generate an API key.

API keys follow the format: `wm_sk_live_<32 hex chars>` or `wm_sk_test_<32 hex chars>`.

### Step 2: Authenticate via CLI

```bash
w3m auth wm_sk_live_a3f8c92d1e4b7f6a0c5d2e9b8a7f4c3d
```

The CLI validates the key against the API and stores it locally.

### Step 3: Verify

```bash
w3m auth --status
```

Shows your name, email, tier, and key hint.

## Logging Out

```bash
w3m auth --logout
```

Clears the stored API key from `~/.web3market/credentials.json`.

## Credential Storage

Credentials are stored at:

```
~/.web3market/credentials.json
```

This file contains just the API key. It is created by `w3m auth` and deleted by `w3m auth --logout`.

## Tier System

| Tier | Deploy to testnets | Deploy to mainnets |
|---|---|---|
| Free | Yes | No |
| Pro | Yes | Yes |
| Enterprise | Yes | Yes |

Tier restrictions are enforced server-side via a preflight check before deployment.

## Using the API Key in Requests

When making direct API calls, pass the key via:

```bash
# Preferred
curl https://api.web3.market/v1/resource \
  -H "X-API-Key: wm_sk_live_..."

# Fallback
curl https://api.web3.market/v1/resource \
  -H "Authorization: Bearer wm_sk_live_..."
```
