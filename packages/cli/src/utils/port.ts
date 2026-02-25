import { createServer } from 'node:net'

/**
 * Check if a TCP port is in use on a specific host.
 */
function checkPort(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true)
      } else {
        resolve(false)
      }
    })
    server.once('listening', () => {
      server.close(() => resolve(false))
    })
    server.listen(port, host)
  })
}

/**
 * Check if a TCP port is currently in use.
 * Checks both IPv4 (0.0.0.0) and IPv6 (::) since Next.js/Vite
 * bind on :: by default, and another process might bind on 0.0.0.0.
 */
export async function isPortInUse(port: number): Promise<boolean> {
  const ipv4 = await checkPort(port, '0.0.0.0')
  if (ipv4) return true
  const ipv6 = await checkPort(port, '::')
  return ipv6
}

/**
 * Find a free port starting from `preferred`, scanning up to preferred+19.
 * Returns the first available port.
 */
export async function findFreePort(preferred: number): Promise<number> {
  for (let port = preferred; port < preferred + 20; port++) {
    const inUse = await isPortInUse(port)
    if (!inUse) return port
  }
  // Last resort — let the OS pick
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.once('listening', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : preferred
      server.close(() => resolve(port))
    })
    server.listen(0)
  })
}
