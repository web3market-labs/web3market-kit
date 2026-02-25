'use client'

import type { CSSProperties } from 'react'
import { useCallback, useState } from 'react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'

export interface ConnectButtonProps {
  className?: string
  style?: CSSProperties
  label?: string
  disconnectLabel?: string
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function ConnectButton({
  className,
  style,
  label = 'Connect Wallet',
  disconnectLabel = 'Disconnect',
}: ConnectButtonProps) {
  const { address, isConnected, isConnecting } = useAccount()
  const { connect, connectors, isPending, error } = useConnect()
  const { disconnect } = useDisconnect()
  const [showConnectors, setShowConnectors] = useState(false)

  const handleConnectClick = useCallback(() => {
    setShowConnectors((prev) => !prev)
  }, [])

  const handleConnectorSelect = useCallback(
    (connectorId: string) => {
      const connector = connectors.find((c) => c.id === connectorId)
      if (connector) {
        connect({ connector })
        setShowConnectors(false)
      }
    },
    [connectors, connect],
  )

  const handleDisconnect = useCallback(() => {
    disconnect()
  }, [disconnect])

  if (isConnected && address) {
    return (
      <div className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', ...style }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', padding: '10px 16px',
          fontSize: '14px', fontWeight: 500, fontFamily: 'monospace',
          borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#f7fafc',
        }}>
          {truncateAddress(address)}
        </span>
        <button
          type="button"
          onClick={handleDisconnect}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            padding: '10px 16px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit',
            borderRadius: '8px', border: '1px solid #fed7d7', backgroundColor: '#fff5f5',
            color: '#c53030', cursor: 'pointer',
          }}
        >
          {disconnectLabel}
        </button>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className={className}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          padding: '10px 20px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit',
          borderRadius: '8px', border: '1px solid #e2e8f0', backgroundColor: '#ffffff',
          color: '#1a202c', cursor: 'pointer', ...style,
        }}
        onClick={handleConnectClick}
        disabled={isConnecting || isPending}
      >
        {isConnecting || isPending ? 'Connecting...' : label}
      </button>

      {showConnectors && !isConnecting && !isPending && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          minWidth: '200px', backgroundColor: '#ffffff', border: '1px solid #e2e8f0',
          borderRadius: '8px', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          padding: '4px', zIndex: 50,
        }}>
          {connectors.map((connector) => (
            <button
              key={connector.id}
              type="button"
              style={{
                display: 'block', width: '100%', padding: '10px 12px', fontSize: '14px',
                fontFamily: 'inherit', textAlign: 'left', border: 'none', borderRadius: '6px',
                backgroundColor: 'transparent', color: '#1a202c', cursor: 'pointer',
              }}
              onClick={() => handleConnectorSelect(connector.id)}
            >
              {connector.name}
            </button>
          ))}
          {connectors.length === 0 && (
            <div style={{ padding: '10px 12px', fontSize: '13px', color: '#a0aec0', textAlign: 'center' }}>
              No wallets detected
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{
          marginTop: '8px', padding: '8px 12px', fontSize: '13px', color: '#c53030',
          backgroundColor: '#fff5f5', border: '1px solid #fed7d7', borderRadius: '6px',
        }}>
          {error.message}
        </div>
      )}
    </div>
  )
}
