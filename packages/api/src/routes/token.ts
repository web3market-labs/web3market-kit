import { Hono } from 'hono'
import { MOCK_TOKENS } from '../mock-data.js'

const token = new Hono()

token.get('/:chainId/:address', async (c) => {
  const chainId = c.req.param('chainId')
  const address = c.req.param('address')

  try {
    const { fetchTokenInfo } = await import('@web3marketlabs/sdk')
    const info = await fetchTokenInfo(address as `0x${string}`, Number(chainId))
    return c.json({ success: true, data: info })
  } catch { /* fall back to mock */ }

  const chainTokens = MOCK_TOKENS[chainId]
  if (!chainTokens) return c.json({ success: false, error: `No data for chain ${chainId}` }, 404)
  const tokenData = chainTokens[address]
  if (!tokenData) return c.json({ success: false, error: `Token ${address} not found on chain ${chainId}` }, 404)
  return c.json({ success: true, data: tokenData })
})

export { token }
