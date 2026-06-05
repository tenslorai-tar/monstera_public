import { useCallback, useState } from 'react'
import Toolbar from './components/Toolbar'
import AnnotationToolbar from './components/AnnotationToolbar'
import PdfViewer from './components/PdfViewer'
import SearchPanel from './components/SearchPanel'
import StartScreen from './components/StartScreen'
import SplitDialog from './components/SplitDialog'
import MetadataDialog from './components/MetadataDialog'
import PasswordDialog from './components/PasswordDialog'
import RedactConfirmDialog from './components/RedactConfirmDialog'
import { usePdfStore } from './store/usePdfStore'
import { useRecentFiles } from './hooks/useRecentFiles'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { usePdfOperations } from './hooks/usePdfOperations'
import './styles/app.css'

type PasswordPromptState = { path: string; name: string; bytes: ArrayBuffer } | null

export default function App() {
  const loadPdf = usePdfStore(s => s.loadPdf)
  const numPages = usePdfStore(s => s.numPages)
  const annotations = usePdfStore(s => s.annotations)
  const applyRedactions = usePdfStore(s => s.applyRedactions)
  const { recentFiles, addRecentFile, removeRecentFile } = useRecentFiles()
  const ops = usePdfOperations()

  const [splitOpen,           setSplitOpen]           = useState(false)
  const [metadataOpen,        setMetadataOpen]        = useState(false)
  const [securityOpen,        setSecurityOpen]        = useState(false)
  const [redactConfirmOpen,   setRedactConfirmOpen]   = useState(false)
  const [passwordPrompt,      setPasswordPrompt]      = useState<PasswordPromptState>(null)
  const [passwordError,       setPasswordError]       = useState('')
  const [passwordInput,       setPasswordInput]       = useState('')

  const pendingRedactCount = annotations.filter(a => a.type === 'redact').length

  const openFile = useCallback(async (filePath?: string, password?: string) => {
    const path = filePath ?? await window.electronAPI.openFileDialog()
    if (!path) return
    const bytes = await window.electronAPI.readFileBytes(path)
    const name = path.split(/[\\/]/).pop() ?? path
    try {
      await loadPdf(bytes, path, name, password)
      addRecentFile(path, name)
      setPasswordPrompt(null)
      setPasswordError('')
      setPasswordInput('')
    } catch (e: any) {
      if (e?.code === 'NeedsPassword') {
        setPasswordPrompt({ path, name, bytes })
        setPasswordError('')
        setPasswordInput('')
      } else if (e?.code === 'WrongPassword') {
        setPasswordError('Incorrect password. Please try again.')
      } else {
        console.error('Failed to open PDF:', e)
      }
    }
  }, [loadPdf, addRecentFile])

  useKeyboardShortcuts(openFile)

  const hasPdf = numPages > 0

  const handleRedactConfirm = async () => {
    setRedactConfirmOpen(false)
    await applyRedactions()
  }

  return (
    <div className="app">
      <Toolbar
        onOpen={openFile}
        onMerge={ops.mergePdfs}
        onSplit={() => setSplitOpen(true)}
        onMetadata={() => setMetadataOpen(true)}
        onSecurity={() => setSecurityOpen(true)}
      />
      {hasPdf && (
        <AnnotationToolbar
          onRequestRedactConfirm={() => setRedactConfirmOpen(true)}
        />
      )}
      {hasPdf ? (
        <div className="content-area">
          <PdfViewer />
          <SearchPanel />
        </div>
      ) : (
        <StartScreen
          recentFiles={recentFiles}
          onOpen={openFile}
          onOpenRecent={path => openFile(path)}
          onRemoveRecent={removeRecentFile}
        />
      )}

      {/* ── Dialogs ─────────────────────────────────────── */}
      {splitOpen && (
        <SplitDialog
          numPages={numPages}
          onConfirm={async (ranges, mode) => {
            setSplitOpen(false)
            if (mode === 'all') await ops.splitOnePerPage()
            else await ops.splitByRanges(ranges)
          }}
          onClose={() => setSplitOpen(false)}
        />
      )}
      {metadataOpen && <MetadataDialog onClose={() => setMetadataOpen(false)} />}
      {securityOpen && <PasswordDialog onClose={() => setSecurityOpen(false)} />}
      {redactConfirmOpen && (
        <RedactConfirmDialog
          count={pendingRedactCount}
          onConfirm={handleRedactConfirm}
          onCancel={() => setRedactConfirmOpen(false)}
        />
      )}

      {/* ── Password prompt for encrypted PDFs ─────────── */}
      {passwordPrompt && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ width: 400 }}>
            <div className="modal-title">🔒 Password Required</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
              <strong>{passwordPrompt.name}</strong> is password-protected.
            </p>
            <div className="modal-field">
              <label className="modal-label">Password</label>
              <input
                className="modal-input" type="password"
                value={passwordInput} autoFocus
                onChange={e => setPasswordInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && openFile(passwordPrompt.path, passwordInput)}
              />
            </div>
            {passwordError && <div className="modal-error" style={{ marginBottom: 8 }}>{passwordError}</div>}
            <div className="modal-actions">
              <button className="modal-btn-secondary" onClick={() => { setPasswordPrompt(null); setPasswordError('') }}>
                Cancel
              </button>
              <button className="modal-btn-primary" onClick={() => openFile(passwordPrompt.path, passwordInput)}>
                Open
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
