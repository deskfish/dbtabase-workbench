import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createVault, unlockVault, type KDFConfig, type Vault } from '../../crypto/vault'

type VaultContextValue = {
  status: 'locked' | 'unlocked'
  vault: Vault | null
  create(password: string): Promise<KDFConfig>
  unlock(password: string, kdf: KDFConfig): Promise<void>
  lock(): void
}

const VaultContext = createContext<VaultContextValue | null>(null)
const INACTIVITY_MS = 15 * 60 * 1000

export function ConnectionProvider({children, initialVault = null}: {children: ReactNode; initialVault?: Vault | null}) {
  const [vault, setVault] = useState<Vault | null>(initialVault)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const lock = useCallback(() => {
    setVault(null)
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const scheduleLock = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(lock, INACTIVITY_MS)
  }, [lock])

  useEffect(() => {
    if (!vault) return
    scheduleLock()
    const onActivity = () => scheduleLock()
    const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'focus']
    events.forEach((event) => window.addEventListener(event, onActivity, {passive: true}))
    return () => {
      events.forEach((event) => window.removeEventListener(event, onActivity))
      if (timer.current) clearTimeout(timer.current)
    }
  }, [vault, scheduleLock])

  const value = useMemo<VaultContextValue>(() => ({
    status: vault ? 'unlocked' : 'locked',
    vault,
    async create(password) {
      const created = await createVault(password)
      setVault(created)
      return created.kdf
    },
    async unlock(password, kdf) {
      setVault(await unlockVault(password, kdf))
    },
    lock,
  }), [lock, vault])

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>
}

export function useConnectionVault(): VaultContextValue {
  const value = useContext(VaultContext)
  if (!value) throw new Error('useConnectionVault must be used inside ConnectionProvider')
  return value
}
