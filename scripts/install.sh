#!/usr/bin/env bash
set -euo pipefail

# w3m installer — https://install.web3.market
# Usage: curl -fsSL https://install.web3.market | bash

REQUIRED_NODE_MAJOR=20
CLI_PACKAGE="@web3marketlabs/cli"

# ── Colors ───────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()  { printf "${CYAN}%s${RESET}\n" "$*"; }
ok()    { printf "${GREEN}%s${RESET}\n" "$*"; }
warn()  { printf "${YELLOW}warn:${RESET} %s\n" "$*"; }
err()   { printf "${RED}error:${RESET} %s\n" "$*" >&2; }

# ── Detect OS / Arch ────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) OS_LABEL="macOS" ;;
  Linux)  OS_LABEL="Linux" ;;
  *)      err "Unsupported OS: $OS. Use the PowerShell installer on Windows."; exit 1 ;;
esac

case "$ARCH" in
  x86_64)  ARCH_LABEL="x64" ;;
  arm64|aarch64) ARCH_LABEL="arm64" ;;
  *)       err "Unsupported architecture: $ARCH"; exit 1 ;;
esac

printf "\n${BOLD}w3m installer${RESET}  (%s %s)\n\n" "$OS_LABEL" "$ARCH_LABEL"

# ── Helpers ──────────────────────────────────────────────────────────
command_exists() { command -v "$1" &>/dev/null; }

node_major_version() {
  node --version 2>/dev/null | sed 's/^v//' | cut -d. -f1
}

detect_profile() {
  if [ -n "${ZSH_VERSION:-}" ] || [ "$SHELL" = "/bin/zsh" ]; then
    echo "${HOME}/.zshrc"
  elif [ -f "${HOME}/.bashrc" ]; then
    echo "${HOME}/.bashrc"
  elif [ -f "${HOME}/.bash_profile" ]; then
    echo "${HOME}/.bash_profile"
  else
    echo "${HOME}/.profile"
  fi
}

ensure_in_path() {
  local dir="$1"
  local profile
  profile="$(detect_profile)"

  if [[ ":$PATH:" != *":$dir:"* ]]; then
    echo "export PATH=\"$dir:\$PATH\"" >> "$profile"
    export PATH="$dir:$PATH"
    info "Added $dir to PATH in $profile"
  fi
}

# ── Step 1: Node.js ─────────────────────────────────────────────────
install_node() {
  info "Installing Node.js via nvm..."

  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

  if [ ! -d "$NVM_DIR" ]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  fi

  # shellcheck source=/dev/null
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

  nvm install --lts
  nvm use --lts
}

printf "  Node.js ≥ %s ... " "$REQUIRED_NODE_MAJOR"

if command_exists node; then
  CURRENT_NODE="$(node_major_version)"
  if [ "$CURRENT_NODE" -ge "$REQUIRED_NODE_MAJOR" ]; then
    ok "found v$(node --version | sed 's/^v//')"
  else
    warn "found v$(node --version | sed 's/^v//') (need ≥ $REQUIRED_NODE_MAJOR)"
    install_node
    ok "installed v$(node --version | sed 's/^v//')"
  fi
else
  warn "not found"
  install_node
  ok "  installed v$(node --version | sed 's/^v//')"
fi

# ── Step 2: Foundry ─────────────────────────────────────────────────
printf "  Foundry (forge) ... "

if command_exists forge; then
  FORGE_VER="$(forge --version 2>/dev/null | head -1 | awk '{print $2}' || echo "unknown")"
  ok "found $FORGE_VER"
else
  warn "not found — installing..."
  if curl -fsSL https://foundry.paradigm.xyz | bash 2>/dev/null; then
    # foundryup is installed to ~/.foundry/bin
    ensure_in_path "${HOME}/.foundry/bin"
    if command_exists foundryup; then
      foundryup 2>/dev/null && ok "  installed forge" || warn "foundryup failed — you can install Foundry later"
    else
      warn "foundryup not found after install — you can install Foundry later"
    fi
  else
    warn "Foundry install failed — this is optional, w3m works without it for non-contract tasks"
  fi
fi

# ── Step 3: Install @web3marketlabs/cli globally ─────────────────────────
printf "  %s ... " "$CLI_PACKAGE"

install_cli() {
  # Try normal global install first
  if npm install -g "$CLI_PACKAGE" 2>/dev/null; then
    return 0
  fi

  # Fallback: use ~/.npm-global prefix (no sudo needed)
  warn "global install failed, trying ~/.npm-global prefix..."
  local NPM_GLOBAL="${HOME}/.npm-global"
  mkdir -p "$NPM_GLOBAL"
  npm config set prefix "$NPM_GLOBAL"
  ensure_in_path "$NPM_GLOBAL/bin"
  npm install -g "$CLI_PACKAGE"
}

if command_exists w3m; then
  W3M_VER="$(w3m --version 2>/dev/null || echo "installed")"
  ok "found $W3M_VER"
else
  install_cli
  ok "installed"
fi

# ── Done ─────────────────────────────────────────────────────────────
printf "\n"
printf "  ${GREEN}${BOLD}w3m installed successfully!${RESET}\n"
printf "\n"
printf "  Run ${CYAN}w3m${RESET} to get started.\n"
printf "  Run ${CYAN}w3m new my-app${RESET} to scaffold a new project.\n"
printf "\n"

# Hint if PATH was modified
PROFILE="$(detect_profile)"
if grep -q "npm-global\|\.foundry" "$PROFILE" 2>/dev/null; then
  printf "  ${YELLOW}Note:${RESET} PATH was updated. Run ${CYAN}source %s${RESET} or open a new terminal.\n\n" "$PROFILE"
fi
