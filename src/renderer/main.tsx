import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { installBrowserApi } from './devBrowserApi'
import { logger } from './utils/logger'
import { toast } from './store/useToastStore'
import './styles/global.css'

// When there is no Electron preload bridge (i.e. running in a plain browser for
// dev/testing), install a functional browser shim so the app is clickable.
// In the packaged Windows app the real bridge is always present and this is a
// no-op, so none of the shim code runs in production.
if (!window.electronAPI) {
  installBrowserApi()
}

// Global safety nets: previously a rejected promise anywhere (a failed IPC call,
// a page op) vanished silently. Now they're logged and surfaced to the user.
// Benign, self-recovering rejections we log but never toast: PDF.js render races
// (a superseded render on a reused canvas) surface as these and are harmless —
// the stale result is discarded anyway.
const BENIGN_REJECTION = /same canvas|multiple render|RenderingCancelled|rendering cancelled|AbortException|worker was (destroyed|terminated)/i
window.addEventListener('unhandledrejection', (e) => {
  logger.error('Unhandled promise rejection:', e.reason)
  const msg = e.reason instanceof Error ? e.reason.message : String(e.reason ?? 'Unknown error')
  if (msg && msg !== 'Unknown error' && !BENIGN_REJECTION.test(msg)) toast.error(`Something went wrong: ${msg}`)
})
window.addEventListener('error', (e) => {
  logger.error('Uncaught error:', e.error ?? e.message)
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
