import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { installBrowserApi } from './devBrowserApi'
import './styles/global.css'

// When there is no Electron preload bridge (i.e. running in a plain browser for
// dev/testing), install a functional browser shim so the app is clickable.
// In the packaged Windows app the real bridge is always present and this is a
// no-op, so none of the shim code runs in production.
if (!window.electronAPI) {
  installBrowserApi()
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
