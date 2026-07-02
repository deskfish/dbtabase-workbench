import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PrototypeApp } from './PrototypeApp'

createRoot(document.getElementById('prototype-root')!).render(
  <StrictMode>
    <PrototypeApp />
  </StrictMode>,
)
