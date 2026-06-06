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
    pdfiumStatus: async () => ({ available: false }),
    pdfiumEditText: emptyBuf,
    pdfiumTextInRegion: async () => ({ text: '', fontSize: 0, found: false }),
    pdfiumTextObjectAt: async () => ({ found: false, text: '', fontSize: 0, color: '#000000', x1: 0, y1: 0, x2: 0, y2: 0, fontData: new ArrayBuffer(0), fontLoadable: false }),
    pdfiumObjectAt: async () => ({ found: false, index: -1, type: 0, color: '', x1: 0, y1: 0, x2: 0, y2: 0 }),
    pdfiumTransformObject: emptyBuf,
    pdfiumSetObjectFill: emptyBuf,
    pdfiumDeleteObject: emptyBuf,
    pdfiumRenderPage: async () => ({ data: new ArrayBuffer(0), width: 0, height: 0 }),
    pdfiumEnsureSession: async () => false,
    pdfiumCloseSession: noop,
    pdfiumRenderSession: async () => ({ stale: true }),
    writeFile: noop, writeBytesToDir: noop,
    mupdfGetMetadata: async () => ({ title:'', author:'', subject:'', keywords:'', creator:'', producer:'', needsPassword:false, encryption:'' }),
    mupdfSetMetadata: emptyBuf, mupdfEncrypt: emptyBuf, mupdfRemovePassword: emptyBuf,
    mupdfApplyRedactions: emptyBuf, mupdfGetOutline: emptyArr, mupdfWriteOutline: emptyBuf,
    pdfSign: emptyBuf, pdfVerifySignatures: emptyArr,
    exportToDocx: emptyBuf, setWindowTitle: noop, printWindow: noop,
    onMenuAction: () => {},
    removeMenuActionListener: () => {},
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
