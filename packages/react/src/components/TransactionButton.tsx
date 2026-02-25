'use client'

import type { CSSProperties } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useWaitForTransactionReceipt } from 'wagmi'
import type { Hash } from 'viem'

type TransactionState = 'idle' | 'confirming' | 'pending' | 'success' | 'error'

export interface TransactionButtonProps {
  onClick: () => Promise<Hash>
  label?: string
  pendingLabel?: string
  confirmingLabel?: string
  successLabel?: string
  errorLabel?: string
  disabled?: boolean
  className?: string
  style?: CSSProperties
  resetTimeout?: number
  onSuccess?: (hash: Hash) => void
  onError?: (error: Error) => void
}

const baseButtonStyle: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  padding: '12px 24px', fontSize: '14px', fontWeight: 600, fontFamily: 'inherit',
  borderRadius: '8px', border: 'none', cursor: 'pointer',
  transition: 'background-color 0.15s ease, opacity 0.15s ease', minWidth: '160px',
}

const stateStyles: Record<TransactionState, CSSProperties> = {
  idle: { backgroundColor: '#3182ce', color: '#ffffff' },
  confirming: { backgroundColor: '#d69e2e', color: '#ffffff', cursor: 'wait' },
  pending: { backgroundColor: '#d69e2e', color: '#ffffff', cursor: 'wait' },
  success: { backgroundColor: '#38a169', color: '#ffffff' },
  error: { backgroundColor: '#e53e3e', color: '#ffffff' },
}

export function TransactionButton({
  onClick, label = 'Submit Transaction', pendingLabel = 'Transaction Pending...',
  confirmingLabel = 'Confirm in Wallet...', successLabel = 'Transaction Successful',
  errorLabel = 'Transaction Failed', disabled = false, className, style,
  resetTimeout = 3000, onSuccess, onError,
}: TransactionButtonProps) {
  const [txState, setTxState] = useState<TransactionState>('idle')
  const [txHash, setTxHash] = useState<Hash | undefined>(undefined)
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { isSuccess: isConfirmed, isError: isReceiptError } = useWaitForTransactionReceipt({
    hash: txHash, query: { enabled: !!txHash },
  })

  useEffect(() => {
    if (isConfirmed && txState === 'pending') {
      setTxState('success')
      if (txHash && onSuccess) onSuccess(txHash)
    }
  }, [isConfirmed, txState, txHash, onSuccess])

  useEffect(() => {
    if (isReceiptError && txState === 'pending') {
      setTxState('error')
      const err = new Error('Transaction failed on-chain')
      setErrorMessage(err.message)
      if (onError) onError(err)
    }
  }, [isReceiptError, txState, onError])

  useEffect(() => {
    if (txState === 'success' || txState === 'error') {
      resetTimerRef.current = setTimeout(() => {
        setTxState('idle'); setTxHash(undefined); setErrorMessage(undefined)
      }, resetTimeout)
    }
    return () => { if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null } }
  }, [txState, resetTimeout])

  const handleClick = useCallback(async () => {
    if (txState !== 'idle' || disabled) return
    setTxState('confirming'); setErrorMessage(undefined)
    try {
      const hash = await onClick()
      setTxHash(hash); setTxState('pending')
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Transaction rejected')
      setTxState('error'); setErrorMessage(error.message)
      if (onError) onError(error)
    }
  }, [txState, disabled, onClick, onError])

  const isDisabled = disabled || txState !== 'idle'
  const currentLabel = txState === 'confirming' ? confirmingLabel : txState === 'pending' ? pendingLabel
    : txState === 'success' ? successLabel : txState === 'error' ? errorLabel : label
  const showSpinner = txState === 'confirming' || txState === 'pending'

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '4px' }}>
      <button type="button" className={className}
        style={{ ...baseButtonStyle, ...stateStyles[txState], ...(isDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}), ...style }}
        onClick={handleClick} disabled={isDisabled}>
        {showSpinner && <span style={{
          display: 'inline-block', width: '14px', height: '14px',
          border: '2px solid rgba(255, 255, 255, 0.3)', borderTopColor: '#ffffff',
          borderRadius: '50%', animation: 'web3kit-tx-spin 0.6s linear infinite',
        }} />}
        {currentLabel}
      </button>
      {txState === 'error' && errorMessage && (
        <div style={{
          padding: '6px 10px', fontSize: '12px', color: '#c53030', backgroundColor: '#fff5f5',
          border: '1px solid #fed7d7', borderRadius: '6px', maxWidth: '300px', wordBreak: 'break-word',
        }}>{errorMessage}</div>
      )}
      <style dangerouslySetInnerHTML={{ __html: '@keyframes web3kit-tx-spin { to { transform: rotate(360deg); } }' }} />
    </div>
  )
}
