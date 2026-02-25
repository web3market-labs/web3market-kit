# CLI Reference

Web3 Market dApp Kit CLI (`@web3market/cli` v0.2.0)

## Installation

The CLI is distributed as `@web3market/cli`. It exposes two binaries:

- `web3market` -- primary binary
- `w3m` -- shorthand alias

---

## Interactive Workspace

Running `w3m` with no arguments opens the interactive workspace menu.

### Behavior by context

| Auth state | In project directory? | What happens |
|---|---|---|
| Any | Yes | Opens project workspace menu |
| Authenticated | No | Shows recent projects, create, browse templates |
| Not authenticated | No | Shows recent projects, create, authenticate |

The workspace stays open in a loop -- commands run inline and return to the menu.

### Project workspace menu

When inside a project directory, the workspace shows:

| Option | Description |
|---|---|
| Start dev environment | Anvil + deploy + Next.js at localhost:3000 |
| Deploy contracts | Pick a chain (Local, testnet, mainnet) |
| Customize with AI / Connect AI agent | AI-powered code modification |
| View deployments | Shows deployed contracts (if any) |
| Run tests | Forge test suite |
| Security audit | Slither + AI review |
| Switch project | Open a different project |
| Exit | Close the workspace |

**Local (Anvil) deployment** from the workspace menu works without authentication. It starts Anvil, builds, deploys, runs codegen, and shows a deployment summary.

**Remote chain deployment** (testnets, mainnets) routes through `w3m deploy` which requires authentication and environment variables.

---

## Commands

### `w3m new [name]`

Create a new project.

**Aliases:** `init`, `create`

```bash
w3m new my-token --template token-standard
```

**Arguments:**

| Argument | Required | Description |
|---|---|---|
| `name` | No | Project name (lowercase alphanumeric with dashes). Prompted if omitted. |

**Options:**

| Option | Description |
|---|---|
| `--template <id>` | Use a specific template: `token-standard`, `token-tax`, `token-meme`, `token-reflection` |

**What it does:**

1. Prompts for project name (if not provided)
2. Loads templates (tries API with 3s timeout, falls back to local templates)
3. If `--template` specified or template selected interactively: collects template parameters, scaffolds files
4. If blank project selected: prompts for framework, frontend, components, chains, package manager
5. Writes files to disk
6. Installs pnpm dependencies
7. Installs Solidity dependencies via `forge install`
8. Runs codegen
9. Registers project in `~/.web3market/projects.json`
10. Shows an honest setup summary (checkmarks for successes, warnings for failures)
11. Prompts for next action (dev environment, deploy locally, workspace, or exit)

**Template parameters** vary by template. For example, `token-standard` prompts for: token name, symbol, initial supply, mintable, burnable.

---

### `w3m dev`

Start the local development environment.

```bash
w3m dev [options]
```

**Options:**

| Option | Default | Description |
|---|---|---|
| `-p, --port <port>` | `3000` | Frontend dev server port |
| `--no-anvil` | Anvil starts | Skip starting local Anvil chain |

**What it does (in order):**

1. Loads `kit.config.ts`
2. Starts Anvil on `http://127.0.0.1:8545` (unless `--no-anvil`)
3. Compiles contracts with `forge build`
4. Deploys contracts to local chain using the default Anvil private key
5. Runs codegen to generate TypeScript bindings
6. Starts the frontend dev server (Next.js or Vite) on the configured port
7. If no frontend configured, keeps Anvil running until Ctrl+C

All subprocesses are cleaned up on Ctrl+C.

**Does not require authentication.**

---

### `w3m deploy`

Deploy contracts to a target chain.

```bash
w3m deploy --chain <chain> [options]
```

**Requires authentication** via `w3m auth`.

**Options:**

| Option | Required | Description |
|---|---|---|
| `--chain <chain>` | Yes | Target chain name |
| `--skip-tests` | No | Skip running tests before deployment |
| `--verify` | No | Verify contracts on block explorer |
| `--vercel` | No | Deploy frontend to Vercel after |

**Supported chains:**

| Chain | Chain ID | Tier |
|---|---|---|
| `localhost` / `anvil` | 31337 | Free (use workspace menu for local) |
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

**Required environment variables:**

- `{CHAIN}_RPC_URL` -- RPC endpoint (e.g., `SEPOLIA_RPC_URL`). Chain name is uppercased, dashes become underscores.
- `DEPLOYER_PRIVATE_KEY` -- Deployer wallet private key.

**What it does:**

1. Validates authentication (API key required)
2. Runs API preflight check (validates chain + tier)
3. Validates environment variables
4. Builds contracts (`forge build`)
5. Runs tests (`forge test`, unless `--skip-tests`)
6. Deploys via `forge script`
7. Writes deployment to `deployments/{chainId}.json`
8. Registers deployment with API
9. Runs codegen to update TypeScript bindings
10. Optionally deploys frontend to Vercel

---

### `w3m auth`

Authenticate with Web3 Market.

```bash
# Authenticate
w3m auth <api-key>

# Check status
w3m auth --status

# Log out
w3m auth --logout
```

**Arguments:**

| Argument | Description |
|---|---|
| `key` | API key (format: `wm_sk_live_xxx` or `wm_sk_test_xxx`) |

**Options:**

| Option | Description |
|---|---|
| `--status` | Show current authentication status |
| `--logout` | Clear stored credentials |

Credentials are stored at `~/.web3market/credentials.json`.

Get your API key at [web3.market/dashboard/plan](https://web3.market/dashboard/plan).

---

### `w3m test`

Run contract tests.

```bash
w3m test [options]
```

**Options:**

| Option | Description |
|---|---|
| `--contracts` | Run only contract tests |
| `--ts` | Run only TypeScript tests |
| `-v, --verbose` | Verbose output |

By default, runs both contract tests (`forge test`) and TypeScript tests (`vitest`).

---

### `w3m add <component>`

Add a component to your project.

```bash
w3m add <component>
```

Resolves the component from the registry, installs it, prompts for parameters, renders templates, updates config, installs dependencies, and runs codegen.

---

### `w3m generate`

Run the codegen pipeline.

**Alias:** `gen`

```bash
w3m generate [--watch]
```

Generates TypeScript ABI bindings, address registries, and React hooks from compiled contracts.

---

### `w3m audit`

Run a security audit on your contracts.

```bash
w3m audit
```

Runs Slither static analysis and optionally an AI-powered review.

---

### `w3m status`

Show account and project information.

```bash
w3m status
```

Displays auth status, project details, and deployment info.

---

### `w3m deployments`

View deployment history for the current project.

```bash
w3m deployments
```

Lists all deployments from the `deployments/` directory.

---

### `w3m templates`

Browse available templates.

```bash
w3m templates
```

Lists templates available from the API.

---

### `w3m projects`

Manage tracked projects.

```bash
w3m projects
```

Lists projects tracked in `~/.web3market/projects.json`.

---

## Credential Storage

| File | Content |
|---|---|
| `~/.web3market/credentials.json` | API key for authentication |
| `~/.web3market/projects.json` | Tracked project paths and metadata |

---

## Global Behavior

- Commands that fail print an error and exit with code `1`.
- Interactive prompts can be cancelled with Ctrl+C.
- The CLI uses `@clack/prompts` for terminal UI and `picocolors` for colored output.
- All local development features (dev, test, workspace menu, local deploy) work without authentication.
- Authentication is only required for remote chain deployment and some API features.
