import {createContext, useContext, useEffect, useMemo, useState, type ReactNode} from 'react'

export type UnifiedSidebarSlot = {
  content: ReactNode
  footer?: ReactNode
  label?: string
}

export type UnifiedContextSlot = UnifiedSidebarSlot
export type UnifiedRuntimeSlot = {path: string[]; detail?: ReactNode}

type UnifiedShellContextValue = {
  sidebar: UnifiedSidebarSlot | null
  setSidebar(slot: UnifiedSidebarSlot | null): void
  commandExtras: ReactNode
  setCommandExtras(node: ReactNode): void
  contextRail: UnifiedContextSlot | null
  setContextRail(slot: UnifiedContextSlot | null): void
  runtime: UnifiedRuntimeSlot | null
  setRuntime(slot: UnifiedRuntimeSlot | null): void
  status: ReactNode
  setStatus(node: ReactNode): void
}

const UnifiedShellContext = createContext<UnifiedShellContextValue | null>(null)

export {UnifiedShellContext}

export function UnifiedShellProvider({children}: {children: ReactNode}) {
  const [sidebar, setSidebar] = useState<UnifiedSidebarSlot | null>(null)
  const [commandExtras, setCommandExtras] = useState<ReactNode>(null)
  const [contextRail, setContextRail] = useState<UnifiedContextSlot | null>(null)
  const [runtime, setRuntime] = useState<UnifiedRuntimeSlot | null>(null)
  const [status, setStatus] = useState<ReactNode>(null)
  const value = useMemo(() => ({sidebar, setSidebar, commandExtras, setCommandExtras, contextRail, setContextRail, runtime, setRuntime, status, setStatus}), [sidebar, commandExtras, contextRail, runtime, status])
  return <UnifiedShellContext.Provider value={value}>{children}</UnifiedShellContext.Provider>
}

export function useUnifiedContext(content: ReactNode, options: {footer?: ReactNode; label?: string; deps?: readonly unknown[]} = {}) {
  const setContextRail = useContext(UnifiedShellContext)?.setContextRail
  const {footer, label, deps = []} = options
  useEffect(() => {
    if (!setContextRail) return
    setContextRail(content ? {content, footer, label} : null)
    return () => setContextRail(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setContextRail, label, ...deps])
}

export function useUnifiedRuntime(runtime: UnifiedRuntimeSlot | null, deps: readonly unknown[] = []) {
  const setRuntime = useContext(UnifiedShellContext)?.setRuntime
  useEffect(() => {
    if (!setRuntime) return
    setRuntime(runtime)
    return () => setRuntime(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setRuntime, ...deps])
}

export function useUnifiedStatus(node: ReactNode, deps: readonly unknown[] = []) {
  const setStatus = useContext(UnifiedShellContext)?.setStatus
  useEffect(() => {
    if (!setStatus) return
    setStatus(node)
    return () => setStatus(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setStatus, ...deps])
}

export function useUnifiedShell() {
  const ctx = useContext(UnifiedShellContext)
  if (!ctx) throw new Error('useUnifiedShell must be used within UnifiedShellProvider')
  return ctx
}

export function useUnifiedSidebar(content: ReactNode, options: {footer?: ReactNode; label?: string; deps?: readonly unknown[]} = {}) {
  const ctx = useContext(UnifiedShellContext)
  const setSidebar = ctx?.setSidebar
  const {footer, label, deps = []} = options

  useEffect(() => {
    if (!setSidebar) return
    if (!content) {
      setSidebar(null)
      return
    }
    setSidebar({content, footer, label})
    return () => setSidebar(null)
    // Only re-publish when caller-provided deps change. setSidebar is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSidebar, label, ...deps])
}

export function useCommandExtras(node: ReactNode, deps: readonly unknown[] = []) {
  const ctx = useContext(UnifiedShellContext)
  const setCommandExtras = ctx?.setCommandExtras

  useEffect(() => {
    if (!setCommandExtras) return
    setCommandExtras(node)
    return () => setCommandExtras(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setCommandExtras, ...deps])
}
