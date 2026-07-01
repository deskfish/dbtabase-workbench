import { describe, expect, it } from 'vitest'
import { createVault, unlockVault } from './vault'

describe('browser credential vault', () => {
  it('encrypts without retaining plaintext and decrypts with the unlock password', async () => {
    const vault = await createVault('correct horse battery staple')
    const encrypted = await vault.encryptSecret('db-secret')
    expect(JSON.stringify(encrypted)).not.toContain('db-secret')
    expect(encrypted.kdf.iterations).toBe(600_000)
    const unlocked = await unlockVault('correct horse battery staple', encrypted.kdf)
    await expect(unlocked.decryptSecret(encrypted)).resolves.toBe('db-secret')
  })

  it('rejects a wrong unlock password', async () => {
    const vault = await createVault('right-password')
    const encrypted = await vault.encryptSecret('db-secret')
    const wrong = await unlockVault('wrong-password', encrypted.kdf)
    await expect(wrong.decryptSecret(encrypted)).rejects.toThrow()
  })

  it('uses a fresh IV for every encryption', async () => {
    const vault = await createVault('password')
    const first = await vault.encryptSecret('same')
    const second = await vault.encryptSecret('same')
    expect(first.cipher.iv).not.toBe(second.cipher.iv)
    expect(first.cipher.ciphertext).not.toBe(second.cipher.ciphertext)
  })
})
