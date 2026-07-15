import { useEffect, useMemo, useState } from 'react'
import { APIClient } from '../api/client'
import { App } from '../app/App'

export function DatabasePage() {
  const api = useMemo(() => new APIClient(), [])
  const [sessionBootstrap, setSessionBootstrap] = useState<Promise<string>>()

  useEffect(() => {
    setSessionBootstrap(api.createSession())
  }, [api])

  return <div className="product-database-page"><App api={api} sessionBootstrap={sessionBootstrap} embedded /></div>
}
