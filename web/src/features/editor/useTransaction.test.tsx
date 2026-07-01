import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useTransactionGuard } from './useTransaction'

it('warns before leaving with an open transaction', () => {
  const {result} = renderHook(() => useTransactionGuard())
  act(() => result.current.open('tx-1'))
  const event = new Event('beforeunload', {cancelable:true})
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(true)
})
