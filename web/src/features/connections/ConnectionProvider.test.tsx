import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConnectionProvider, useConnectionVault } from './ConnectionProvider'
import type { Vault } from '../../crypto/vault'

function Probe() {
  const vault = useConnectionVault()
  return <div>
    <span>{vault.status === 'unlocked' ? '已解锁' : '已锁定'}</span>
  </div>
}

afterEach(() => vi.useRealTimers())

it('locks after fifteen inactive minutes', async () => {
  vi.useFakeTimers()
  const initialVault = {kdf: {}, encryptSecret: vi.fn(), decryptSecret: vi.fn()} as unknown as Vault
  render(<ConnectionProvider initialVault={initialVault}><Probe /></ConnectionProvider>)
  expect(screen.getByText('已解锁')).toBeVisible()
  act(() => { vi.advanceTimersByTime(15 * 60 * 1000) })
  expect(screen.getByText('已锁定')).toBeVisible()
})
