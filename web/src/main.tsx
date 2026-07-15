import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppRouter } from './app/AppRouter'
import { AuthProvider } from './auth/AuthProvider'
import { applyTheme, getTheme } from './storage/theme'
import './app/tokens.css'
import './layout/AppShell.css'
import './layout/unified-shell.css'
import './app/workbench.css'

applyTheme(getTheme())

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  </BrowserRouter>,
)
