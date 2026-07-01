import { expect, it, vi } from 'vitest'
import { createId } from './id'

it('generates a uuid-like id without randomUUID', () => {
  vi.stubGlobal('crypto', {getRandomValues: (bytes: Uint8Array) => bytes.fill(1)})
  expect(createId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  vi.unstubAllGlobals()
})
