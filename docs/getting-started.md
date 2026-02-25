# Getting Started

This guide walks you through creating and running a full-stack dApp using the Web3 Market CLI.

## Prerequisites

- **Node.js >= 20**
- **pnpm** (recommended) -- npm, yarn, and bun are also supported
- **Foundry** (forge, anvil, cast) -- required for smart contract compilation, testing, and local development

## Creating a Project

### From a template

```bash
w3m new my-token --template token-standard
```

Available templates:

| Template | Description |
|----------|-------------|
| `token-standard` | Standard ERC-20 token (mintable, burnable) |
| `token-tax` | Tax token with buy/sell tax and max wallet |
| `token-meme` | Meme token with trading controls and burn |
| `token-reflection` | Reflection token with holder rewards |

Each template generates a complete project with Solidity contracts, Foundry tests, deployment scripts, and a Next.js frontend with React hooks.

### Interactive setup

```bash
w3m new
```

If you omit `--template`, you'll be prompted to pick a template or create a blank project with custom options (framework, frontend, components, chains).

### Blank project (advanced)

When you select "Blank project" in the interactive wizard, you choose:

1. Contract framework (Foundry or Hardhat)
2. Frontend framework (Next.js, Vite + React, or None)
3. Components to include
4. Target chains
5. Package manager

## What Gets Created

After scaffolding, you'll see a summary showing what succeeded:

```
┌  my-token is ready ─────────────────────────────────╮
│                                                      │
│  ✓ 28 files generated                                │
│  ✓ Dependencies installed                            │
│  ✓ Solidity deps installed                           │
│  ✓ Codegen complete                                  │
│                                                      │
├──────────────────────────────────────────────────────╯
```

If any step fails (e.g. pnpm or forge not found), it will show a warning with the manual command to run.

### Project structure

```
my-token/
  kit.config.ts          # Project configuration
  package.json           # Root workspace package
  .env.example           # Environment variable template
  contracts/
    src/                 # Solidity source files
    test/                # Foundry test files
    script/              # Deployment scripts
    foundry.toml
  web/                   # Next.js frontend
    app/
    components/
    hooks/
  deployments/           # Deployment records (created on deploy)
```

## What Next?

After scaffolding, you're prompted with context-aware options:

**For projects with a frontend** (all token templates):
- **Start dev environment** -- Starts Anvil, deploys contracts, runs Next.js at `localhost:3000`
- **Enter workspace** -- Opens the interactive menu

**For contracts-only projects:**
- **Deploy locally** -- Starts Anvil and deploys contracts
- **Enter workspace** -- Opens the interactive menu

## Development Workflow

### Starting the dev environment

```bash
w3m dev
```

This single command:
1. Starts an Anvil local chain on `http://127.0.0.1:8545`
2. Compiles contracts with `forge build`
3. Deploys contracts to the local chain
4. Runs codegen to generate TypeScript bindings
5. Starts the Next.js dev server at `http://localhost:3000`

Press Ctrl+C to stop everything.

### Using the interactive workspace

```bash
w3m
```

Running `w3m` with no arguments opens the interactive workspace. The menu adapts to your context:

- **Inside a project directory** -- Goes directly to the project workspace menu (works without auth)
- **Not in a project directory** -- Shows recent projects and options to create or open one

### Running tests

```bash
w3m test
```

Runs `forge test` on your Solidity contracts.

### Deploying contracts

**Local deployment (no auth required):**

From the workspace menu, select "Deploy contracts" > "Local (Anvil)". This starts Anvil, builds, deploys, and shows a summary.

**Testnet/mainnet deployment (requires auth):**

```bash
w3m deploy --chain sepolia
```

Required environment variables:
- `SEPOLIA_RPC_URL` (or `{CHAIN}_RPC_URL` for other chains)
- `DEPLOYER_PRIVATE_KEY`

## Authentication

Authentication is only required for deploying to testnets and mainnets. Local development, project creation, and the workspace menu all work without auth.

```bash
# Authenticate with your API key
w3m auth <your-api-key>

# Check auth status
w3m auth --status

# Log out
w3m auth --logout
```

Get your API key at [web3.market/dashboard/plan](https://web3.market/dashboard/plan).

## All CLI Commands

| Command | Description |
|---------|-------------|
| `w3m` | Open interactive workspace |
| `w3m new [name]` | Create a new project (aliases: `init`, `create`) |
| `w3m dev` | Start local dev environment (Anvil + frontend) |
| `w3m deploy --chain <chain>` | Deploy contracts to a chain (requires auth) |
| `w3m test` | Run contract tests |
| `w3m auth <key>` | Authenticate with API key |
| `w3m add <component>` | Add a component to your project |
| `w3m generate` | Run codegen pipeline |
| `w3m audit` | Run security audit |
| `w3m status` | Show account and project info |
| `w3m deployments` | View deployment history |
| `w3m templates` | Browse available templates |

The CLI binary is available as both `web3market` and `w3m`.
