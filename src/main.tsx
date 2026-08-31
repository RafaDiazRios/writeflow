import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { idiomaDelSistema, setIdiomaUI } from '@/i18n'

/* El idioma del sistema, antes de pintar nada. La preferencia guardada llega
 * un poco después, con `app.init()`, pero para entonces ya se ha visto la
 * pantalla de «Abriendo WriteFlow…»: sin esto saldría siempre en español. */
setIdiomaUI(idiomaDelSistema())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)
