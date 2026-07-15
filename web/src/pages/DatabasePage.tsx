import {useEffect, useMemo, useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import {APIClient} from '../api/client'
import {DatabaseWorkbench, type WorkbenchAPI} from '../app/DatabaseWorkbench'
import {connectionsClient, type ConnectionsClient} from '../connections/client'
import type {WorkbenchTarget} from '../connections/types'
import {toWorkbenchTarget} from '../features/database/connectionAdapter'

export function DatabasePage({client = connectionsClient, api: providedAPI}: {client?: Pick<ConnectionsClient, 'list'>; api?: WorkbenchAPI}) {
  const defaultAPI = useMemo(() => new APIClient(), [])
  const api = providedAPI ?? defaultAPI
  const [searchParams, setSearchParams] = useSearchParams()
  const [connections, setConnections] = useState<WorkbenchTarget[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const selectedConnectionId = searchParams.get('connection') ?? ''

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void client.list({kind: 'database'}).then((items) => {
      if (!active) return
      const targets = items.map(toWorkbenchTarget)
      setConnections(targets)
      if (selectedConnectionId && !targets.some((connection) => connection.id === selectedConnectionId)) {
        setSearchParams({}, {replace: true})
        setError('连接不存在或无权访问')
      }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : '无法加载数据库连接')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [client, selectedConnectionId, setSearchParams])

  return <div className="product-database-page">
    {(loading || error) && <div className={`database-page-feedback${error ? ' error' : ''}`} role={error ? 'alert' : 'status'}>{error || '正在同步数据库连接…'}</div>}
    <DatabaseWorkbench
      api={api}
      connections={connections}
      selectedConnectionId={selectedConnectionId}
      onSelectConnection={(id) => setSearchParams({connection: id})}
    />
  </div>
}
