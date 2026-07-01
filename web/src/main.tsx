import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { APIClient } from './api/client'
import { App } from './app/App'
import { ConnectionProvider } from './features/connections/ConnectionProvider'
import './app/tokens.css'
import './app/workbench.css'

const api = new APIClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode><ConnectionProvider><App api={api} /></ConnectionProvider></StrictMode>,
)
