import { useCallback, useState, useEffect, useRef } from 'react'
import RibbonToolbar from './components/RibbonToolbar'
import StatusBar from './components/StatusBar'
import LeftPalette from './components/LeftPalette'
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
import CommentStylesPanel from './components/CommentStylesPanel'
import SummarizeCommentsDialog from './components/SummarizeCommentsDialog'
import HeaderFooterDialog from './components/HeaderFooterDialog'
import WatermarkDialog from './components/WatermarkDialog'
import BackgroundDialog from './components/BackgroundDialog'
import BatesDialog from './components/BatesDialog'
import CropDialog from './components/CropDialog'
import CompareDialog from './components/CompareDialog'
import AccessibilityDialog from './components/AccessibilityDialog'
import WordCountDialog from './components/WordCountDialog'
import TranslateDialog from './components/TranslateDialog'
import SpellCheckDialog from './components/SpellCheckDialog'
import ResizePagesDialog from './components/ResizePagesDialog'
import SwapPagesDialog from './components/SwapPagesDialog'
import FindRedactDialog from './components/FindRedactDialog'
import OpenUrlDialog from './components/OpenUrlDialog'
import OptimizeDialog from './components/OptimizeDialog'
import MeasureCalibrationDialog from './components/MeasureCalibrationDialog'
import ReplacePageDialog from './components/ReplacePageDialog'
import LoupeOverlay from './components/LoupeOverlay'
import AiAssistantDialog from './components/AiAssistantDialog'
import OfficeImportDialog from './components/OfficeImportDialog'
import CloudStorageDialog from './components/CloudStorageDialog'
import DocuSignDialog from './components/DocuSignDialog'
import NativeBinsDialog from './components/NativeBinsDialog'
import PdfConvertDialog from './components/PdfConvertDialog'
import * as docEnhance from './utils/documentEnhance'
import { usePdfStore } from './store/usePdfStore'
import { useSettingsStore } from './store/useSettingsStore'
import { useRecentFiles } from './hooks/useRecentFiles'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { usePdfOperations } from './hooks/usePdfOperations'
import './styles/app.css'

type PasswordPromptState = { path: string; name: string } | null

export default function App() {
  const loadPdf              = usePdfStore(s => s.loadPdf)
  const closePdf             = usePdfStore(s => s.closePdf)
  const numPages             = usePdfStore(s => s.numPages)
  const annotations          = usePdfStore(s => s.annotations)
  const applyRedactions      = usePdfStore(s => s.applyRedactions)
  const flattenAnnotations   = usePdfStore(s => s.flattenAnnotations)
  const setCustomStampDataUrl = usePdfStore(s => s.setCustomStampDataUrl)
  const setStampName         = usePdfStore(s => s.setStampName)
  const setActiveTool        = usePdfStore(s => s.setActiveTool)
  const isDirty              = usePdfStore(s => s.isDirty)
  const fileName             = usePdfStore(s => s.fileName)
  const setZoomMode          = usePdfStore(s => s.setZoomMode)
  const setScale             = usePdfStore(s => s.setScale)
  const save                 = usePdfStore(s => s.save)
  const applyEdit            = usePdfStore(s => s.applyEdit)
  const getBakedBytes        = usePdfStore(s => s.getBakedBytes)

  const { settings, updateSettings } = useSettingsStore()
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
  const [commentStylesOpen, setCommentStylesOpen]  = useState(false)
  const [summarizeOpen,     setSummarizeOpen]       = useState(false)
  const [headerFooterOpen,  setHeaderFooterOpen]    = useState(false)
  const [watermarkOpen,     setWatermarkOpen]       = useState(false)
  const [backgroundOpen,    setBackgroundOpen]      = useState(false)
  const [batesOpen,         setBatesOpen]           = useState(false)
  const [cropOpen,          setCropOpen]            = useState(false)
  const [compareOpen,       setCompareOpen]         = useState(false)
  const [accessOpen,        setAccessOpen]          = useState(false)
  const [wordCountOpen,     setWordCountOpen]       = useState(false)
  const [translateOpen,     setTranslateOpen]       = useState(false)
  const [spellCheckOpen,    setSpellCheckOpen]      = useState(false)
  const [swapPagesOpen,        setSwapPagesOpen]        = useState(false)
  const [resizePagesOpen,      setResizePagesOpen]      = useState(false)
  const [deleteEmptyResult,    setDeleteEmptyResult]    = useState<number[] | null>(null)
  const [findRedactOpen,       setFindRedactOpen]       = useState(false)
  const [openUrlOpen,          setOpenUrlOpen]          = useState(false)
  const [optimizeOpen,         setOptimizeOpen]         = useState(false)
  const [measureCalOpen,       setMeasureCalOpen]       = useState(false)
  const [replacePageOpen,      setReplacePageOpen]      = useState(false)
  const [aiAssistantOpen,      setAiAssistantOpen]      = useState(false)
  const [officeImportOpen,     setOfficeImportOpen]     = useState(false)
  const [cloudStorageOpen,     setCloudStorageOpen]     = useState(false)
  const [docuSignOpen,         setDocuSignOpen]         = useState(false)
  const [nativeBinsOpen,       setNativeBinsOpen]       = useState(false)
  const [pdfConvertOpen,       setPdfConvertOpen]       = useState(false)

  const [passwordPrompt,    setPasswordPrompt]     = useState<PasswordPromptState>(null)
  const [passwordError,     setPasswordError]      = useState('')
  const [passwordInput,     setPasswordInput]      = useState('')
  const [openError,         setOpenError]          = useState('')

  const pendingRedactCount = annotations.filter(a => a.type === 'redact').length

  // ── Open file ────────────────────────────────────────────────────────────────

  const openFile = useCallback(async (filePath?: string, password?: string) => {
    const resolvedPath = typeof filePath === 'string' ? filePath
      : await window.electronAPI.openFileDialog()
    if (!resolvedPath) return
    setOpenError('')
    try {
      const bytes = await window.electronAPI.readFileBytes(resolvedPath)
      const name = resolvedPath.split(/[\\/]/).pop() ?? resolvedPath
      await loadPdf(bytes, resolvedPath, name, password)
      addRecentFile(resolvedPath, name)
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

  // ── Native menu actions ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!window.electronAPI.onMenuAction) return
    window.electronAPI.onMenuAction((action: string) => {
      const s = usePdfStore.getState()
      const sel = [...s.selectedPages]
      switch (action) {
        case 'open':         openFile(); break
        case 'close':        s.closePdf(); break
        case 'save':         if (s.isDirty) s.save(); break
        case 'saveAs':       s.saveAs(); break
        case 'undo':         s.undo(); break
        case 'redo':         s.redo(); break
        case 'print':        window.electronAPI.printWindow().catch(() => {}); break
        case 'metadata':     setMetadataOpen(true); break
        case 'security':     setSecurityOpen(true); break
        case 'ocr':          setOcrOpen(true); break
        case 'digitalSign':  setDigitalSignOpen(true); break
        case 'settings':     setSettingsOpen(true); break
        case 'shortcuts':    setShortcutsOpen(true); break
        case 'export':       setExportOpen(true); break
        case 'split':        setSplitOpen(true); break
        case 'find':         s.setSearchOpen(true); break
        case 'findReplace':  s.setSearchOpen(true); break
        case 'merge':        ops.mergePdfs(); break
        case 'toggleSidebar':          s.toggleSidebar(); break
        case 'toggleBookmarks':        s.toggleBookmarksPanel(); break
        case 'toggleAnnotationsPanel': s.toggleAnnotationsPanel(); break
        case 'toggleFormsPanel':       s.toggleFormsPanel(); break
        case 'toggleLinksPanel':       s.toggleLinksPanel(); break
        case 'toggleLayersPanel':      s.toggleLayersPanel(); break
        case 'toggleNamedDestsPanel':  s.toggleNamedDestsPanel(); break
        case 'compare':        setCompareOpen(true); break
        case 'accessibility':  setAccessOpen(true); break
        case 'aiAssistant':    setAiAssistantOpen(true); break
        case 'officeImport':   setOfficeImportOpen(true); break
        case 'cloudStorage':   setCloudStorageOpen(true); break
        case 'docuSign':       setDocuSignOpen(true); break
        case 'nativeBins':     setNativeBinsOpen(true); break
        case 'pdfConvert':     setPdfConvertOpen(true); break
        case 'wordCount':      setWordCountOpen(true); break
        case 'translate':      setTranslateOpen(true); break
        case 'spellCheck':     setSpellCheckOpen(true); break
        case 'toggleTheme':
          updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' }); break
        case 'zoomIn':   s.setScale(Math.min(5,    Math.round((s.scale + 0.25) * 100) / 100)); break
        case 'zoomOut':  s.setScale(Math.max(0.1,  Math.round((s.scale - 0.25) * 100) / 100)); break
        case 'fitPage':  s.setZoomMode('fit-page'); break
        case 'fitWidth': s.setZoomMode('fit-width'); break
        case 'zoom100':  s.setScale(1); break
        case 'insertBlankBefore': ops.insertBlankPage(s.currentPage - 1); break
        case 'insertBlankAfter':  ops.insertBlankPage(s.currentPage); break
        case 'insertFromPdf':   ops.insertFromPdf(s.currentPage); break
        case 'insertFromImage': ops.insertFromImage(s.currentPage); break
        case 'deletePages':    if (sel.length > 0) ops.deletePages(sel); break
        case 'extractPages':   if (sel.length > 0) ops.extractPages(sel); break
        case 'duplicatePages': if (sel.length > 0) ops.duplicatePage(sel[0]); break
        case 'rotateCW':   if (sel.length > 0) ops.rotatePages(sel, 90); break
        case 'rotateCCW':  if (sel.length > 0) ops.rotatePages(sel, 270); break
        case 'rotate180':  if (sel.length > 0) ops.rotatePages(sel, 180); break
        case 'reverseOrder': ops.reversePages(); break
        case 'toggleFormMode': s.setFormMode(!s.formMode); break
        case 'flattenForm':    s.flattenForm(); break
        case 'applyRedactions': setRedactConfirmOpen(true); break
        case 'headerFooter':  setHeaderFooterOpen(true); break
        case 'watermark':     setWatermarkOpen(true); break
        case 'background':    setBackgroundOpen(true); break
        case 'batesNumbers':  setBatesOpen(true); break
        case 'cropPages':     setCropOpen(true); break
        case 'swapPages':         setSwapPagesOpen(true); break
        case 'resizePages':       setResizePagesOpen(true); break
        case 'deleteEmptyPages':  ops.deleteEmptyPages().then(del => setDeleteEmptyResult(del)); break
        case 'normalizePages':    ops.normalizePages(); break
        default:
          if (action.startsWith('tool:')) {
            const tool = action.slice(5) as Parameters<typeof s.setActiveTool>[0]
            s.setActiveTool(s.activeTool === tool ? null : tool)
          } else if (action.startsWith('formTool:')) {
            const tool = action.slice(9) as Parameters<typeof s.setFormCreationTool>[0]
            s.setFormCreationTool(s.formCreationTool === tool ? null : tool)
            if (!s.formMode) s.setFormMode(true)
          }
          break
      }
    })
    return () => {
      if (window.electronAPI.removeMenuActionListener)
        window.electronAPI.removeMenuActionListener()
    }
  }, [openFile, ops, settings.theme, updateSettings])

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

  // ── Organize op helpers ──────────────────────────────────────────────────────
  const selectedPages = usePdfStore(s => s.selectedPages)
  const currentPage   = usePdfStore(s => s.currentPage)
  const selList = [...selectedPages]

  return (
    <div className="app">
      <RibbonToolbar
        onOpen={openFile}
        onClose={closePdf}
        onMerge={ops.mergePdfs}
        onSplit={() => setSplitOpen(true)}
        onMetadata={() => setMetadataOpen(true)}
        onSecurity={() => setSecurityOpen(true)}
        onOcr={() => setOcrOpen(true)}
        onDigitalSign={() => setDigitalSignOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onShortcuts={() => setShortcutsOpen(true)}
        onPrint={() => window.electronAPI.printWindow().catch(() => {})}
        onExport={() => setExportOpen(true)}
        onRequestRedactConfirm={() => setRedactConfirmOpen(true)}
        onOpenSignaturePad={() => setSignaturePadOpen(true)}
        onInsertBlankBefore={() => ops.insertBlankPage(currentPage - 1)}
        onInsertBlankAfter={() => ops.insertBlankPage(currentPage)}
        onInsertFromPdf={() => ops.insertFromPdf(currentPage)}
        onInsertFromImage={() => ops.insertFromImage(currentPage)}
        onDeletePages={() => { if (selList.length > 0) ops.deletePages(selList) }}
        onExtractPages={() => { if (selList.length > 0) ops.extractPages(selList) }}
        onDuplicatePages={() => { if (selList.length > 0) ops.duplicatePage(selList[0]) }}
        onRotateCW={() => { if (selList.length > 0) ops.rotatePages(selList, 90) }}
        onRotateCCW={() => { if (selList.length > 0) ops.rotatePages(selList, 270) }}
        onRotate180={() => { if (selList.length > 0) ops.rotatePages(selList, 180) }}
        onReverseOrder={ops.reversePages}
        onCommentStyles={() => setCommentStylesOpen(true)}
        onSummarizeComments={() => setSummarizeOpen(true)}
        onFlattenAnnotations={flattenAnnotations}
        onHeaderFooter={() => setHeaderFooterOpen(true)}
        onWatermark={() => setWatermarkOpen(true)}
        onBackground={() => setBackgroundOpen(true)}
        onBatesNumbers={() => setBatesOpen(true)}
        onCropPages={() => setCropOpen(true)}
        onCompare={() => setCompareOpen(true)}
        onAccessibility={() => setAccessOpen(true)}
        onWordCount={() => setWordCountOpen(true)}
        onTranslate={() => setTranslateOpen(true)}
        onSpellCheck={() => setSpellCheckOpen(true)}
        onSwapPages={() => setSwapPagesOpen(true)}
        onResizePages={() => setResizePagesOpen(true)}
        onDeleteEmptyPages={async () => {
          const del = await ops.deleteEmptyPages()
          setDeleteEmptyResult(del)
        }}
        onNormalizePages={ops.normalizePages}
        onFindRedact={() => setFindRedactOpen(true)}
        onOptimize={() => setOptimizeOpen(true)}
        onOpenUrl={() => setOpenUrlOpen(true)}
        onReplacePage={() => setReplacePageOpen(true)}
        onMeasureCalibration={() => setMeasureCalOpen(true)}
        onAiAssistant={() => setAiAssistantOpen(true)}
        onOfficeImport={() => setOfficeImportOpen(true)}
        onCloudStorage={() => setCloudStorageOpen(true)}
        onDocuSign={() => setDocuSignOpen(true)}
        onNativeBins={() => setNativeBinsOpen(true)}
        onPdfConvert={() => setPdfConvertOpen(true)}
      />

      {hasPdf ? (
        <div className="main-row">
          <LeftPalette />
          <div className="content-area">
            <PdfViewer />
            <SearchPanel />
          </div>
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

      <StatusBar />

      {/* ── Dialogs ──────────────────────────────────────────────────────── */}
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
      {metadataOpen   && <MetadataDialog   onClose={() => setMetadataOpen(false)} />}
      {securityOpen   && <PasswordDialog   onClose={() => setSecurityOpen(false)} />}
      {ocrOpen        && <OcrDialog        onClose={() => setOcrOpen(false)} />}
      {exportOpen     && <ExportDialog     onClose={() => setExportOpen(false)} />}
      {settingsOpen   && <SettingsDialog   onClose={() => setSettingsOpen(false)} />}
      {shortcutsOpen  && <ShortcutsDialog  onClose={() => setShortcutsOpen(false)} />}
      {commentStylesOpen && <CommentStylesPanel onClose={() => setCommentStylesOpen(false)} />}
      {summarizeOpen     && <SummarizeCommentsDialog onClose={() => setSummarizeOpen(false)} />}

      {headerFooterOpen && (
        <HeaderFooterDialog
          numPages={numPages} fileName={fileName}
          onClose={() => setHeaderFooterOpen(false)}
          onApply={async cfg => {
            applyEdit(await docEnhance.addHeadersFooters(await getBakedBytes(), cfg))
          }}
        />
      )}
      {watermarkOpen && (
        <WatermarkDialog
          numPages={numPages}
          onClose={() => setWatermarkOpen(false)}
          onApply={async cfg => {
            applyEdit(await docEnhance.addWatermark(await getBakedBytes(), cfg))
          }}
        />
      )}
      {backgroundOpen && (
        <BackgroundDialog
          numPages={numPages}
          onClose={() => setBackgroundOpen(false)}
          onApply={async cfg => {
            applyEdit(await docEnhance.addBackground(await getBakedBytes(), cfg))
          }}
        />
      )}
      {batesOpen && (
        <BatesDialog
          numPages={numPages}
          onClose={() => setBatesOpen(false)}
          onApply={async cfg => {
            applyEdit(await docEnhance.addBatesNumbers(await getBakedBytes(), cfg))
          }}
        />
      )}
      {cropOpen && (
        <CropDialog
          onClose={() => setCropOpen(false)}
          onApply={async cfg => {
            applyEdit(await docEnhance.cropPages(await getBakedBytes(), cfg))
          }}
        />
      )}
      {compareOpen    && <CompareDialog      onClose={() => setCompareOpen(false)} />}
      {accessOpen     && <AccessibilityDialog onClose={() => setAccessOpen(false)} />}
      {wordCountOpen  && <WordCountDialog    onClose={() => setWordCountOpen(false)} />}
      {translateOpen  && <TranslateDialog   onClose={() => setTranslateOpen(false)} />}
      {spellCheckOpen && <SpellCheckDialog  onClose={() => setSpellCheckOpen(false)} />}

      {swapPagesOpen && (
        <SwapPagesDialog
          numPages={numPages}
          onSwap={async (p1, p2) => { setSwapPagesOpen(false); await ops.swapPages(p1, p2) }}
          onClose={() => setSwapPagesOpen(false)}
        />
      )}
      {resizePagesOpen && (
        <ResizePagesDialog
          numPages={numPages}
          onApply={async (pageNums, w, h) => { setResizePagesOpen(false); await ops.resizePages(pageNums, w, h) }}
          onClose={() => setResizePagesOpen(false)}
        />
      )}
      {deleteEmptyResult !== null && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ width: 380 }}>
            <div className="modal-title">🗑 Delete Empty Pages</div>
            {deleteEmptyResult.length === 0
              ? <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>No empty pages found.</p>
              : <p style={{ fontSize: 13 }}>Deleted {deleteEmptyResult.length} empty page(s): {deleteEmptyResult.join(', ')}.</p>
            }
            <div className="modal-actions">
              <button className="modal-btn-primary" onClick={() => setDeleteEmptyResult(null)}>OK</button>
            </div>
          </div>
        </div>
      )}

      {findRedactOpen    && <FindRedactDialog    onClose={() => setFindRedactOpen(false)} />}
      {optimizeOpen      && <OptimizeDialog      onClose={() => setOptimizeOpen(false)} />}
      {measureCalOpen    && <MeasureCalibrationDialog onClose={() => setMeasureCalOpen(false)} />}
      {aiAssistantOpen   && <AiAssistantDialog   onClose={() => setAiAssistantOpen(false)} />}
      {officeImportOpen  && <OfficeImportDialog  onClose={() => setOfficeImportOpen(false)} />}
      {cloudStorageOpen  && <CloudStorageDialog  onClose={() => setCloudStorageOpen(false)} />}
      {docuSignOpen      && <DocuSignDialog      onClose={() => setDocuSignOpen(false)} />}
      {nativeBinsOpen    && <NativeBinsDialog    onClose={() => setNativeBinsOpen(false)} />}
      {pdfConvertOpen    && <PdfConvertDialog    onClose={() => setPdfConvertOpen(false)} />}
      {openUrlOpen && (
        <OpenUrlDialog
          onClose={() => setOpenUrlOpen(false)}
          onOpen={async (bytes, name) => {
            setOpenUrlOpen(false)
            await loadPdf(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, name, name)
            addRecentFile(name, name)
          }}
        />
      )}
      {replacePageOpen && (
        <ReplacePageDialog
          numPages={numPages}
          currentPage={currentPage}
          onReplace={async (pageNum, srcBytes, srcPageNum) => {
            setReplacePageOpen(false)
            await ops.replacePages(pageNum, srcBytes, srcPageNum)
          }}
          onClose={() => setReplacePageOpen(false)}
        />
      )}
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

      <LoupeOverlay />

      {/* ── Password prompt ───────────────────────────────────────────────── */}
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
