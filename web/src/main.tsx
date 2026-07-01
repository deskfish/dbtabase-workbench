import { createRoot } from 'react-dom/client'
import { APIClient } from './api/client'
import { App } from './app/App'
import { applyTheme, getTheme } from './storage/theme'
import './app/tokens.css'
import './app/workbench.css'

const api = new APIClient()
const sessionBootstrap = api.createSession()
applyTheme(getTheme())

createRoot(document.getElementById('root')!).render(
  <App api={api} sessionBootstrap={sessionBootstrap} />,
)
