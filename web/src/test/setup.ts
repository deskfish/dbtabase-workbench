import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(cleanup)

Object.defineProperty(document, 'queryCommandSupported', {value: () => false, configurable: true})
const localValues = new Map<string, string>()
const memoryStorage: Storage = {
  get length() { return localValues.size },
  clear: () => localValues.clear(),
  getItem: (key) => localValues.get(key) ?? null,
  key: (index) => [...localValues.keys()][index] ?? null,
  removeItem: (key) => { localValues.delete(key) },
  setItem: (key, value) => { localValues.set(key, value) },
}
Object.defineProperty(window, 'localStorage', {value: memoryStorage, configurable: true})
Object.defineProperty(globalThis, 'localStorage', {value: memoryStorage, configurable: true})
