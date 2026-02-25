/**
 * End-to-end test for the API scaffold endpoint.
 *
 * Tests all 4 token variants: standard, tax, meme, reflection.
 * 1. Starts the API in dev mode (no auth required)
 * 2. Tests scaffolding with various parameters
 * 3. Verifies file rendering and conditional code generation
 */

import { setTimeout } from 'node:timers/promises'

const API_URL = 'http://localhost:3001'

async function waitForApi(maxRetries = 20) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${API_URL}/health`)
      if (res.ok) return true
    } catch {}
    await setTimeout(500)
  }
  throw new Error('API did not start in time')
}

let allPassed = true

function check(condition, label) {
  console.log(`  ${condition ? '✓' : '✗'} ${label}`)
  if (!condition) allPassed = false
}

async function testScaffold() {
  console.log('Waiting for API to be ready...')
  await waitForApi()
  console.log('API is ready!\n')

  // ===== Test 1: List scaffoldable templates =====
  console.log('--- Test 1: GET /api/templates/scaffoldable ---')
  const listRes = await fetch(`${API_URL}/api/templates/scaffoldable`)
  const listData = await listRes.json()
  console.log(`Status: ${listRes.status}`)
  const ids = listData.templates?.map(t => t.id) || []
  console.log(`Templates: ${ids.join(', ') || 'none'}`)

  check(ids.includes('token-standard'), 'Standard token template listed')
  check(ids.includes('token-tax'), 'Tax token template listed')
  check(ids.includes('token-meme'), 'Meme token template listed')
  check(ids.includes('token-reflection'), 'Reflection token template listed')
  check(!ids.includes('staking'), 'No staking template')
  check(!ids.includes('presale'), 'No presale template')

  // ===== Test 2: Standard token scaffold =====
  console.log('\n--- Test 2: POST /api/templates/token-standard/scaffold ---')
  const stdRes = await fetch(`${API_URL}/api/templates/token-standard/scaffold`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectName: 'my-token',
      params: {
        tokenName: 'Test Token',
        tokenSymbol: 'TST',
        initialSupply: '1000000',
        mintable: true,
        burnable: true,
        pausable: false,
      },
    }),
  })
  const stdData = await stdRes.json()
  check(stdData.success, 'Standard token scaffold succeeded')
  console.log(`  Files: ${stdData.files.length}`)

  const stdPaths = stdData.files.map(f => f.path)
  check(stdPaths.includes('contracts/src/TSTToken.sol'), 'TSTToken.sol generated')
  check(stdPaths.includes('web/hooks/useToken.ts'), 'useToken.ts generated')
  check(!stdData.postInstall.shadcnComponents, 'No shadcnComponents in postInstall')

  const stdContract = stdData.files.find(f => f.path === 'contracts/src/TSTToken.sol')
  if (stdContract) {
    check(stdContract.content.includes('"Test Token"'), 'Token name in contract')
    check(stdContract.content.includes('function mint'), 'Mint function present')
    check(stdContract.content.includes('ERC20Burnable'), 'Burnable extension present')
    check(!stdContract.content.includes('ERC20Pausable'), 'Pausable absent (false)')
  }

  // ===== Test 3: Tax token scaffold =====
  console.log('\n--- Test 3: POST /api/templates/token-tax/scaffold ---')
  const taxRes = await fetch(`${API_URL}/api/templates/token-tax/scaffold`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectName: 'my-tax-token',
      params: {
        tokenName: 'Tax Token',
        tokenSymbol: 'TAX',
        initialSupply: '1000000',
        buyTaxPercent: '5',
        sellTaxPercent: '5',
        maxWalletPercent: '2',
      },
    }),
  })
  const taxData = await taxRes.json()
  check(taxData.success, 'Tax token scaffold succeeded')
  console.log(`  Files: ${taxData.files.length}`)

  const taxPaths = taxData.files.map(f => f.path)
  check(taxPaths.includes('contracts/src/TAXToken.sol'), 'TAXToken.sol generated')
  check(taxPaths.includes('contracts/test/TAXToken.t.sol'), 'TAXToken.t.sol generated')
  check(taxPaths.includes('contracts/script/DeployTAXToken.s.sol'), 'DeployTAXToken.s.sol generated')
  check(taxPaths.includes('web/hooks/useToken.ts'), 'useToken.ts generated')

  const taxContract = taxData.files.find(f => f.path === 'contracts/src/TAXToken.sol')
  if (taxContract) {
    check(taxContract.content.includes('"Tax Token"'), 'Token name in contract')
    check(taxContract.content.includes('taxWallet'), 'taxWallet present')
    check(taxContract.content.includes('buyTaxBps'), 'buyTaxBps present')
    check(taxContract.content.includes('sellTaxBps'), 'sellTaxBps present')
    check(taxContract.content.includes('lpPair'), 'lpPair present')
    check(taxContract.content.includes('maxWalletAmount'), 'maxWalletAmount present')
    check(taxContract.content.includes('500'), 'Buy tax = 5% in BPS (500)')
  }

  // ===== Test 4: Meme token scaffold =====
  console.log('\n--- Test 4: POST /api/templates/token-meme/scaffold ---')
  const memeRes = await fetch(`${API_URL}/api/templates/token-meme/scaffold`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectName: 'my-meme-token',
      params: {
        tokenName: 'Meme Token',
        tokenSymbol: 'MEME',
        totalSupply: '1000000000',
        maxTxPercent: '1',
        maxWalletPercent: '2',
        burnPercent: '1',
      },
    }),
  })
  const memeData = await memeRes.json()
  check(memeData.success, 'Meme token scaffold succeeded')
  console.log(`  Files: ${memeData.files.length}`)

  const memePaths = memeData.files.map(f => f.path)
  check(memePaths.includes('contracts/src/MEMEToken.sol'), 'MEMEToken.sol generated')

  const memeContract = memeData.files.find(f => f.path === 'contracts/src/MEMEToken.sol')
  if (memeContract) {
    check(memeContract.content.includes('"Meme Token"'), 'Token name in contract')
    check(memeContract.content.includes('tradingEnabled'), 'tradingEnabled present')
    check(memeContract.content.includes('maxTxAmount'), 'maxTxAmount present')
    check(memeContract.content.includes('burnBps'), 'burnBps present')
    check(memeContract.content.includes('enableTrading'), 'enableTrading function present')
    check(!memeContract.content.includes('function mint'), 'No mint function (fixed supply)')
  }

  // ===== Test 5: Reflection token scaffold =====
  console.log('\n--- Test 5: POST /api/templates/token-reflection/scaffold ---')
  const refRes = await fetch(`${API_URL}/api/templates/token-reflection/scaffold`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectName: 'my-reflect-token',
      params: {
        tokenName: 'Reflect Token',
        tokenSymbol: 'RFL',
        totalSupply: '1000000000',
        reflectionPercent: '3',
        maxTxPercent: '1',
        maxWalletPercent: '2',
      },
    }),
  })
  const refData = await refRes.json()
  check(refData.success, 'Reflection token scaffold succeeded')
  console.log(`  Files: ${refData.files.length}`)

  const refPaths = refData.files.map(f => f.path)
  check(refPaths.includes('contracts/src/RFLToken.sol'), 'RFLToken.sol generated')

  const refContract = refData.files.find(f => f.path === 'contracts/src/RFLToken.sol')
  if (refContract) {
    check(refContract.content.includes('"Reflect Token"'), 'Token name in contract')
    check(refContract.content.includes('reflectionFeeBps'), 'reflectionFeeBps present')
    check(refContract.content.includes('_rOwned'), 'Reflected supply pattern (_rOwned)')
    check(refContract.content.includes('_tOwned'), 'Token supply pattern (_tOwned)')
    check(refContract.content.includes('_tokenFromReflection'), '_tokenFromReflection function')
    check(refContract.content.includes('excludeFromReflection'), 'excludeFromReflection function')
    check(refContract.content.includes('300'), 'Reflection fee = 3% in BPS (300)')
  }

  // ===== Summary =====
  if (allPassed) {
    console.log('\n✅ All tests passed!')
  } else {
    console.log('\n❌ Some tests failed!')
    process.exit(1)
  }
}

testScaffold().catch((err) => {
  console.error('Test error:', err)
  process.exit(1)
})
