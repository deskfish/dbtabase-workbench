const ITERATIONS = 600_000 as const

export type KDFConfig = {
  name: 'PBKDF2'
  hash: 'SHA-256'
  iterations: 600000
  salt: string
}

export type EncryptedSecret = {
  version: 1
  kdf: KDFConfig
  cipher: {
    name: 'AES-GCM'
    iv: string
    ciphertext: string
  }
}

export type Vault = {
  kdf: KDFConfig
  encryptSecret(secret: string): Promise<EncryptedSecret>
  decryptSecret(encrypted: EncryptedSecret): Promise<string>
}

export async function createVault(password: string): Promise<Vault> {
  if (!password) throw new Error('解锁密码不能为空')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const kdf: KDFConfig = {name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: encodeBase64(salt)}
  return buildVault(password, kdf)
}

export async function unlockVault(password: string, kdf: KDFConfig): Promise<Vault> {
  if (!password) throw new Error('解锁密码不能为空')
  if (kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256' || kdf.iterations !== ITERATIONS) {
    throw new Error('不支持的密码库格式')
  }
  return buildVault(password, kdf)
}

async function buildVault(password: string, kdf: KDFConfig): Promise<Vault> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    {name: 'PBKDF2', salt: decodeBase64(kdf.salt), iterations: kdf.iterations, hash: kdf.hash},
    material,
    {name: 'AES-GCM', length: 256},
    false,
    ['encrypt', 'decrypt'],
  )
  return {
    kdf,
    async encryptSecret(secret) {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, new TextEncoder().encode(secret))
      return {version: 1, kdf, cipher: {name: 'AES-GCM', iv: encodeBase64(iv), ciphertext: encodeBase64(new Uint8Array(ciphertext))}}
    },
    async decryptSecret(encrypted) {
      if (encrypted.version !== 1 || encrypted.cipher.name !== 'AES-GCM') throw new Error('不支持的密码格式')
      const plaintext = await crypto.subtle.decrypt(
        {name: 'AES-GCM', iv: decodeBase64(encrypted.cipher.iv)},
        key,
        decodeBase64(encrypted.cipher.ciphertext),
      )
      return new TextDecoder().decode(plaintext)
    },
  }
}

function encodeBase64(value: Uint8Array): string {
  let binary = ''
  value.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes.buffer
}
