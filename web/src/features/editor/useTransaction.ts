import { useCallback, useEffect, useState } from 'react'

export function useTransactionGuard() {
  const [transactionId, setTransactionId] = useState('')
  useEffect(() => {
    if (!transactionId) return
    const warn = (event: BeforeUnloadEvent | Event) => { event.preventDefault(); if ('returnValue' in event) event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [transactionId])
  return {
    transactionId,
    open: useCallback((id:string) => setTransactionId(id), []),
    close: useCallback(() => setTransactionId(''), []),
  }
}
