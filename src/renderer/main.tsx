import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/global.css'

// In the browser preview (no Electron preload), stub electronAPI so the UI
// renders without crashing. All IPC calls become no-ops or return sensible defaults.
if (!window.electronAPI) {
  const noop = async () => {}
  const nullAsync = async () => null
  const emptyArr = async () => []
  const emptyBuf = async () => new ArrayBuffer(0)
  ;(window as unknown as Record<string, unknown>).electronAPI = {
    openFileDialog: nullAsync, openMultipleFiles: emptyArr, openImageFile: nullAsync,
    saveFileDialog: nullAsync, chooseDirectory: nullAsync,
    readFileBytes: emptyBuf, getMimeType: async () => 'application/pdf',
    writeFile: noop, writeBytesToDir: noop,
    mupdfGetMetadata: async () => ({ title:'', author:'', subject:'', keywords:'', creator:'', producer:'', needsPassword:false, encryption:'' }),
    mupdfSetMetadata: emptyBuf, mupdfEncrypt: emptyBuf, mupdfRemovePassword: emptyBuf,
    mupdfApplyRedactions: emptyBuf, mupdfGetOutline: emptyArr, mupdfWriteOutline: emptyBuf,
    pdfSign: emptyBuf, pdfVerifySignatures: emptyArr,
    exportToDocx: emptyBuf, setWindowTitle: noop, printWindow: noop,
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
