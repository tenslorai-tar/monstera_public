import { useCallback, useState, useEffect, useRef } from 'react'
import Toolbar from './components/Toolbar'
import AnnotationToolbar from './components/AnnotationToolbar'
import PdfViewer from './components/PdfViewer'
import SearchPanel from './components/SearchPanel'
import StartScreen from './components/StartScreen'
import SplitDialog from './components/SplitDialog'
import MetadataDialog from './components/MetadataDialog'
import PasswordDialog from './components/PasswordDialog'
import RedactConfirmDialog from './components/RedactConfirmDialog'
import OcrDialog from './components/OcrDialog'
import SignaturePad from './components/SignaturePad'
import DigitalSignDialog from './components/DigitalSignDialog'
import ExportDialog from './components/ExportDialog'
import SettingsDialog from './components/SettingsDialog'
import ShortcutsDialog from './components/ShortcutsDialog'
import { usePdfStore } from './store/usePdfStore'
import { useSettingsStore } from './store/useSettingsStore'
import { useRecentFiles } from './hooks/useRecentFiles'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { usePdfOperations } from './hooks/usePdfOperations'
import './styles/app.css'

type PasswordPromptState = { path: string; name: string } | null

export default function App() {
  const loadPdf       = usePdfStore(s => s.loadPdf)
  const numPages      = usePdfStore(s => s.numPages)
  const annotations   = usePdfStore(s => s.annotations)
  const applyRedactions  = usePdfStore(s => s.applyRedactions)
  const setCustomStampDataUrl = usePdfStore(s => s.setCustomStampDataUrl)
  const setStampName  = usePdfStore(s => s.setStampName)
  const setActiveTool = usePdfStore(s => s.setActiveTool)
  const isDirty       = usePdfStore(s => s.isDirty)
  const fileName      = usePdfStore(s => s.fileName)
  const setZoomMode   = usePdfStore(s => s.setZoomMode)
  const setScale      = usePdfStore(s => s.setScale)
  const save          = usePdfStore(s => s.save)

  const { settings }   = useSettingsStore()
  const { recentFiles, addRecentFile, removeRecentFile } = useRecentFiles()
  const ops = usePdfOperations()

  const [splitOpen,         setSplitOpen]         = useState(false)
  const [metadataOpen,      setMetadataOpen]       = useState(false)
  const [securityOpen,      setSecurityOpen]       = useState(false)
  const [redactConfirmOpen, setRedactConfirmOpen]  = useState(false)
  const [ocrOpen,           setOcrOpen]            = useState(false)
  const [signaturePadOpen,  setSignaturePadOpen]   = useState(false)
  const [digitalSignOpen,   setDigitalSignOpen]    = useState(false)
  const [exportOpen,        setExportOpen]         = useState(false)
  const [settingsOpen,      setSettingsOpen]       = useState(false)
  const [shortcutsOpen,     setShortcutsOpen]      = useState(false)

  const [passwordPrompt,    setPasswordPrompt]     = useState<PasswordPromptState>(null)
  const [passwordError,     setPasswordError]      = useState('')
  const [passwordInput,     setPasswordInput]      = useState('')
  const [openError,         setOpenError]          = useState('')

  const pendingRedactCount = annotations.filter(a => a.type === 'redact').length

  // ── Open file ────────────────────────────────────────────────────────────────

  const openFile = useCallback(async (filePath?: string, password?: string) => {
    // Guard: button onClick passes a MouseEvent as first arg — ignore non-strings
    const resolvedPath = typeof filePath === 'string' ? filePath
      : await window.electronAPI.openFileDialog()
    if (!resolvedPath) return
    setOpenError('')
    try {
      const bytes = await window.electronAPI.readFileBytes(resolvedPath)
      const name = resolvedPath.split(/[\\/]/).pop() ?? resolvedPath
      await loadPdf(bytes, resolvedPath, name, password)
      addRecentFile(resolvedPath, name)
      // Apply default zoom from settings
      const dz = settings.defaultZoom
      if (dz === 'fit-width' || dz === 'fit-page') setZoomMode(dz)
      else setScale(dz as number)
      setPasswordPrompt(null)
      setPasswordError('')
      setPasswordInput('')
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string }
      if (err?.code === 'NeedsPassword') {
        const name = resolvedPath.split(/[\\/]/).pop() ?? ''
        setPasswordPrompt({ path: resolvedPath, name })
        setPasswordError('')
        setPasswordInput('')
      } else if (err?.code === 'WrongPassword') {
        setPasswordError('Incorrect password. Please try again.')
      } else {
        const msg = err?.message ?? 'Unknown error'
        setOpenError(`Could not open file: ${msg}`)
        console.error('Failed to open PDF:', e)
      }
    }
  }, [loadPdf, addRecentFile, settings.defaultZoom, setZoomMode, setScale])

  // ── Autosave ─────────────────────────────────────────────────────────────────

  const autosaveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (autosaveRef.current) clearInterval(autosaveRef.current)
    const mins = settings.autosaveIntervalMinutes
    if (mins > 0 && numPages > 0) {
      autosaveRef.current = setInterval(() => {
        if (usePdfStore.getState().isDirty) save()
      }, mins * 60_000)
    }
    return () => { if (autosaveRef.current) clearInterval(autosaveRef.current) }
  }, [settings.autosaveIntervalMinutes, numPages, save])

  // ── Window title sync ────────────────────────────────────────────────────────

  useEffect(() => {
    const title = fileName
      ? `${isDirty ? '● ' : ''}${fileName} — Monstera PDF Editor`
      : 'Monstera PDF Editor'
    window.electronAPI.setWindowTitle(title).catch(() => {})
  }, [fileName, isDirty])

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────

  useKeyboardShortcuts({
    onOpen: openFile,
    onSettings: () => setSettingsOpen(true),
    onShortcuts: () => setShortcutsOpen(true),
    onPrint: () => window.electronAPI.printWindow().catch(() => {}),
  })

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
        onOcr={() => setOcrOpen(true)}
        onDigitalSign={() => setDigitalSignOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onShortcuts={() => setShortcutsOpen(true)}
        onPrint={() => window.electronAPI.printWindow().catch(() => {})}
      />

      {hasPdf && (
        <AnnotationToolbar
          onRequestRedactConfirm={() => setRedactConfirmOpen(true)}
          onOpenSignaturePad={() => setSignaturePadOpen(true)}
          onOpenExport={() => setExportOpen(true)}
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
          openError={openError}
          onClearError={() => setOpenError('')}
        />
      )}

      {/* ── Dialogs ──────────────────────────────────────────────────── */}
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
      {metadataOpen  && <MetadataDialog   onClose={() => setMetadataOpen(false)} />}
      {securityOpen  && <PasswordDialog   onClose={() => setSecurityOpen(false)} />}
      {ocrOpen       && <OcrDialog        onClose={() => setOcrOpen(false)} />}
      {exportOpen    && <ExportDialog     onClose={() => setExportOpen(false)} />}
      {settingsOpen  && <SettingsDialog   onClose={() => setSettingsOpen(false)} />}
      {shortcutsOpen && <ShortcutsDialog  onClose={() => setShortcutsOpen(false)} />}
      {digitalSignOpen && <DigitalSignDialog onClose={() => setDigitalSignOpen(false)} />}

      {signaturePadOpen && (
        <SignaturePad
          onClose={() => setSignaturePadOpen(false)}
          onConfirm={dataUrl => {
            setCustomStampDataUrl(dataUrl)
            setStampName('Custom')
            setActiveTool('stamp')
            setSignaturePadOpen(false)
          }}
        />
      )}

      {redactConfirmOpen && (
        <RedactConfirmDialog
          count={pendingRedactCount}
          onConfirm={handleRedactConfirm}
          onCancel={() => setRedactConfirmOpen(false)}
        />
      )}

      {/* ── Password prompt ───────────────────────────────────────────── */}
      {passwordPrompt && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ width: 400 }}>
            <div className="modal-title">🔒 Password Required</div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
              <strong>{passwordPrompt.name || 'This file'}</strong> is password-protected.
            </p>
            <div className="modal-field">
              <label className="modal-label">Password</label>
              <input className="modal-input" type="password"
                value={passwordInput} autoFocus
                onChange={e => setPasswordInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && openFile(passwordPrompt.path, passwordInput)}
              />
            </div>
            {passwordError && <div className="modal-error" style={{ marginBottom: 8 }}>{passwordError}</div>}
            <div className="modal-actions">
              <button className="modal-btn-secondary"
                onClick={() => { setPasswordPrompt(null); setPasswordError('') }}>
                Cancel
              </button>
              <button className="modal-btn-primary"
                onClick={() => openFile(passwordPrompt.path, passwordInput)}>
                Open
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
