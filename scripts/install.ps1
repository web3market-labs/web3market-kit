# w3m installer for Windows — https://install.web3.market
# Usage: irm https://install.web3.market/ps1 | iex

$ErrorActionPreference = "Stop"

$RequiredNodeMajor = 20
$CliPackage = "@web3marketlabs/cli"

# ── Colors ───────────────────────────────────────────────────────────
function Write-Info  { param($msg) Write-Host $msg -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host $msg -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "warn: $msg" -ForegroundColor Yellow }
function Write-Err   { param($msg) Write-Host "error: $msg" -ForegroundColor Red }

# ── Helpers ──────────────────────────────────────────────────────────
function Test-Command { param($Name) $null -ne (Get-Command $Name -ErrorAction SilentlyContinue) }

function Get-NodeMajorVersion {
    try {
        $ver = (node --version) -replace '^v', ''
        return [int]($ver.Split('.')[0])
    } catch {
        return 0
    }
}

function Refresh-PathFromRegistry {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$userPath;$machinePath"
}

function Add-ToUserPath {
    param($Dir)
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$Dir*") {
        [Environment]::SetEnvironmentVariable("Path", "$Dir;$currentPath", "User")
        $env:Path = "$Dir;$env:Path"
        Write-Info "Added $Dir to user PATH"
    }
}

# ── Start ────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "w3m installer" -ForegroundColor White -NoNewline
Write-Host "  (Windows $([System.Environment]::OSVersion.Version.Major))" -ForegroundColor DarkGray
Write-Host ""

# ── Step 1: Node.js ─────────────────────────────────────────────────
Write-Host "  Node.js >= $RequiredNodeMajor ... " -NoNewline

if (Test-Command "node") {
    $nodeMajor = Get-NodeMajorVersion
    if ($nodeMajor -ge $RequiredNodeMajor) {
        $nodeVer = (node --version) -replace '^v', ''
        Write-Ok "found v$nodeVer"
    } else {
        $nodeVer = (node --version) -replace '^v', ''
        Write-Warn "found v$nodeVer (need >= $RequiredNodeMajor)"
        Write-Info "  Installing Node.js..."

        if (Test-Command "winget") {
            winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
            Refresh-PathFromRegistry
        } elseif (Test-Command "fnm") {
            fnm install --lts
            fnm use lts-latest
        } else {
            # Install fnm first, then Node
            Write-Info "  Installing fnm..."
            irm https://fnm.vercel.app/install | iex
            Refresh-PathFromRegistry
            fnm install --lts
            fnm use lts-latest
        }

        $nodeVer = (node --version) -replace '^v', ''
        Write-Ok "  installed v$nodeVer"
    }
} else {
    Write-Warn "not found"
    Write-Info "  Installing Node.js..."

    if (Test-Command "winget") {
        winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements --silent
        Refresh-PathFromRegistry
    } else {
        # Install fnm, then Node
        Write-Info "  Installing fnm..."
        irm https://fnm.vercel.app/install | iex
        Refresh-PathFromRegistry
        fnm install --lts
        fnm use lts-latest
    }

    Refresh-PathFromRegistry
    if (Test-Command "node") {
        $nodeVer = (node --version) -replace '^v', ''
        Write-Ok "  installed v$nodeVer"
    } else {
        Write-Err "Node.js installation failed. Please install manually from https://nodejs.org/"
        exit 1
    }
}

# ── Step 2: Foundry ─────────────────────────────────────────────────
Write-Host "  Foundry (forge) ... " -NoNewline

if (Test-Command "forge") {
    try {
        $forgeVer = (forge --version 2>&1 | Select-Object -First 1) -replace '.*?([\d.]+).*', '$1'
        Write-Ok "found $forgeVer"
    } catch {
        Write-Ok "found"
    }
} else {
    Write-Warn "not found — installing..."
    try {
        # Official Foundry installer for Windows
        $foundryBin = "$env:USERPROFILE\.foundry\bin"

        # Download and run foundryup-init
        Invoke-WebRequest -Uri "https://foundry.paradigm.xyz" -OutFile "$env:TEMP\foundry-install.ps1" -UseBasicParsing
        powershell -ExecutionPolicy Bypass -File "$env:TEMP\foundry-install.ps1"

        Add-ToUserPath $foundryBin
        Refresh-PathFromRegistry

        if (Test-Command "foundryup") {
            foundryup 2>$null
            Write-Ok "  installed forge"
        } else {
            Write-Warn "foundryup not found after install — you can install Foundry later"
        }
    } catch {
        Write-Warn "Foundry install failed — this is optional, w3m works without it for non-contract tasks"
    }
}

# ── Step 3: Install @web3marketlabs/cli globally ─────────────────────────
Write-Host "  $CliPackage ... " -NoNewline

if (Test-Command "w3m") {
    try {
        $w3mVer = w3m --version 2>&1
        Write-Ok "found $w3mVer"
    } catch {
        Write-Ok "found"
    }
} else {
    try {
        npm install -g $CliPackage 2>$null
        Refresh-PathFromRegistry
        Write-Ok "installed"
    } catch {
        # Fallback: use a custom prefix
        Write-Warn "global install failed, trying custom prefix..."
        $npmGlobal = "$env:USERPROFILE\.npm-global"
        if (-not (Test-Path $npmGlobal)) { New-Item -ItemType Directory -Path $npmGlobal -Force | Out-Null }
        npm config set prefix $npmGlobal
        Add-ToUserPath "$npmGlobal"
        npm install -g $CliPackage
        Refresh-PathFromRegistry
        Write-Ok "installed"
    }
}

# ── Done ─────────────────────────────────────────────────────────────
Write-Host ""
Write-Ok "  w3m installed successfully!"
Write-Host ""
Write-Host "  Run " -NoNewline
Write-Host "w3m" -ForegroundColor Cyan -NoNewline
Write-Host " to get started."
Write-Host "  Run " -NoNewline
Write-Host "w3m new my-app" -ForegroundColor Cyan -NoNewline
Write-Host " to scaffold a new project."
Write-Host ""
