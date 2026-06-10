import { useCallback, useState, useEffect, useRef } from 'react'
import { Lock as LockIcon, Trash2 as TrashIcon } from 'lucide-react'
import RibbonToolbar from './components/RibbonToolbar'
import CommandPalette from './components/CommandPalette'
import StatusBar from './components/StatusBar'
import LeftPalette from './components/LeftPalette'
import PdfViewer from './components/PdfViewer'
import SearchPanel from './components/SearchPanel'
import StartScreen from './components/StartScreen'
import SplitDialog from './components/SplitDialog'
import PrintDialog from './components/PrintDialog'
import MetadataDialog from './components/MetadataDialog'
import PasswordDialog from './components/PasswordDialog'
import RedactConfirmDialog from './components/RedactConfirmDialog'
import OcrDialog from './components/OcrDialog'
import SignaturePad from './components/SignaturePad'
import DigitalSignDialog from './components/DigitalSignDialog'
import ExportDialog from './components/ExportDialog'
import SettingsDialog from './components/SettingsDialog'
import ShortcutsDialog from './components/ShortcutsDialog'
import AboutDialog from './components/AboutDialog'
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
import BarcodeDialog from './components/BarcodeDialog'
import DocumentScanDialog from './components/DocumentScanDialog'
import BarcodeReadDialog from './components/BarcodeReadDialog'
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
import MarkdownPdfDialog from './components/MarkdownPdfDialog'
import CsvPdfDialog from './components/CsvPdfDialog'
import EditExternalDialog from './components/EditExternalDialog'
import TaggedPdfDialog from './components/TaggedPdfDialog'
import ImportToLayerDialog from './components/ImportToLayerDialog'
import EmailDialog from './components/EmailDialog'
import FindDuplicatesDialog from './components/FindDuplicatesDialog'
import MultiPageStampDialog from './components/MultiPageStampDialog'
import WebcamDialog from './components/WebcamDialog'
import PageTransitionsDialog from './components/PageTransitionsDialog'
import TocGeneratorDialog from './components/TocGeneratorDialog'
import OcrRegionDialog from './components/OcrRegionDialog'
import DeskewDialog from './components/DeskewDialog'
import SplitViewPanel from './components/SplitViewPanel'
import SideBySidePanel from './components/SideBySidePanel'
import { useTabsStore } from './store/useTabsStore'
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
  const numPages             = usePdfStore(s => s.numPages)
  const annotations          = usePdfStore(s => s.annotations)
  const applyRedactions      = usePdfStore(s => s.applyRedactions)
  const flattenAnnotations   = usePdfStore(s => s.flattenAnnotations)
  const setCustomStampDataUrl = usePdfStore(s => s.setCustomStampDataUrl)
  const setStampName         = usePdfStore(s => s.setStampName)
  const setActiveTool        = usePdfStore(s => s.setActiveTool)
  const isDirty              = usePdfStore(s => s.isDirty)
  const fileName             = usePdfStore(s => s.fileName)
  const currentFilePath      = usePdfStore(s => s.filePath)
  const bookmarks            = usePdfStore(s => s.bookmarks)
  const setZoomMode          = usePdfStore(s => s.setZoomMode)
  const setScale             = usePdfStore(s => s.setScale)
  const save                 = usePdfStore(s => s.save)
  const applyEdit            = usePdfStore(s => s.applyEdit)
  const getBakedBytes        = usePdfStore(s => s.getBakedBytes)

  const { settings, updateSettings } = useSettingsStore()
  const { recentFiles, addRecentFile, removeRecentFile } = useRecentFiles()
  const ops = usePdfOperations()

  // Close the document, prompting to save first if there are unsaved changes.
  const requestClose = useCallback(async () => {
    const s = usePdfStore.getState()
    if (s.numPages === 0) return
    if (s.isDirty) {
      const choice = await window.electronAPI.confirmUnsaved(s.fileName)
      if (choice === 'cancel') return
      if (choice === 'save') {
        if (s.filePath) await s.save()
        else await s.saveAs()
        // Save As was cancelled (still dirty) → abort the close.
        if (usePdfStore.getState().isDirty) return
      }
    }
    usePdfStore.getState().closePdf()
  }, [])

  // Quitting the whole app (the OS window X). Main defers the close and asks us
  // to run the same save prompt; we tell it when it's safe to actually close.
  const handleAppClose = useCallback(async () => {
    const s = usePdfStore.getState()
    if (s.numPages > 0 && s.isDirty) {
      const choice = await window.electronAPI.confirmUnsaved(s.fileName)
      if (choice === 'cancel') return                 // stay open
      if (choice === 'save') {
        if (s.filePath) await s.save()
        else await s.saveAs()
        if (usePdfStore.getState().isDirty) return    // Save As cancelled → stay open
      }
    }
    window.electronAPI.confirmAppClose().catch(() => {})
  }, [])

  const [splitOpen,         setSplitOpen]         = useState(false)
  const [printOpen,         setPrintOpen]          = useState(false)
  const [metadataOpen,      setMetadataOpen]       = useState(false)
  const [securityOpen,      setSecurityOpen]       = useState(false)
  const [redactConfirmOpen, setRedactConfirmOpen]  = useState(false)
  const [ocrOpen,           setOcrOpen]            = useState(false)
  const [signaturePadOpen,  setSignaturePadOpen]   = useState(false)
  const [digitalSignOpen,   setDigitalSignOpen]    = useState(false)
  const [exportOpen,        setExportOpen]         = useState(false)
  const [settingsOpen,      setSettingsOpen]       = useState(false)
  const [shortcutsOpen,     setShortcutsOpen]      = useState(false)
  const [aboutOpen,         setAboutOpen]          = useState(false)
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
  const [barcodeOpen,       setBarcodeOpen]         = useState(false)
  const [scanOpen,          setScanOpen]            = useState(false)
  const [barcodeReadOpen,   setBarcodeReadOpen]     = useState(false)
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
  const [markdownPdfOpen,      setMarkdownPdfOpen]      = useState(false)
  const [csvPdfOpen,           setCsvPdfOpen]           = useState(false)
  const [editExternalOpen,     setEditExternalOpen]     = useState(false)
  const [taggedPdfOpen,        setTaggedPdfOpen]        = useState(false)
  const [importToLayerOpen,    setImportToLayerOpen]    = useState(false)
  const [emailOpen,            setEmailOpen]            = useState(false)
  const [findDuplicatesOpen,   setFindDuplicatesOpen]   = useState(false)
  const [multiPageStampOpen,   setMultiPageStampOpen]   = useState(false)
  const [webcamOpen,           setWebcamOpen]           = useState(false)
  const [pageTransitionsOpen,  setPageTransitionsOpen]  = useState(false)
  const [tocGeneratorOpen,     setTocGeneratorOpen]     = useState(false)
  const [ocrRegionOpen,        setOcrRegionOpen]        = useState(false)
  const [deskewOpen,           setDeskewOpen]           = useState(false)
  const [splitViewOpen,        setSplitViewOpen]        = useState(false)
  const [sideBySideOpen,       setSideBySideOpen]       = useState(false)
  const [appVersion,           setAppVersion]           = useState('')

  const [passwordPrompt,    setPasswordPrompt]     = useState<PasswordPromptState>(null)
  const [passwordError,     setPasswordError]      = useState('')
  const [passwordInput,     setPasswordInput]      = useState('')
  const [openError,         setOpenError]          = useState('')
  const [autosaveError,     setAutosaveError]      = useState('')

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

      // Snapshot current PDF into its tab (if any tab is open)
      const tabsState = useTabsStore.getState()
      if (tabsState.activeTabId && currentFilePath) {
        try {
          const currentBytes = await getBakedBytes()
          tabsState.updateTab(tabsState.activeTabId, {
            pdfBytes: currentBytes, annotations, formFields: usePdfStore.getState().formFields,
            bookmarks, isDirty, currentPage: usePdfStore.getState().currentPage,
            scale: usePdfStore.getState().scale,
          })
        } catch { /* ignore snapshot errors */ }
      }

      await loadPdf(bytes, resolvedPath, name, password)
      addRecentFile(resolvedPath, name)
      const dz = settings.defaultZoom
      if (dz === 'fit-width' || dz === 'fit-page') setZoomMode(dz)
      else setScale(dz as number)
      setPasswordPrompt(null)
      setPasswordError('')
      setPasswordInput('')

      // Register new tab (deduplicate by path)
      const existingTab = tabsState.tabs.find(t => t.filePath === resolvedPath)
      if (!existingTab) {
        tabsState.addTab({
          id: Math.random().toString(36).slice(2),
          fileName: name, filePath: resolvedPath,
          pdfBytes: new Uint8Array(bytes instanceof ArrayBuffer ? bytes : (bytes as any)),
          annotations: [], formFields: [], bookmarks: [],
          isDirty: false, currentPage: 1, scale: 1.5,
        })
      } else {
        tabsState.setActiveTab(existingTab.id)
      }
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

  // Open one or more PDFs at once (multi-select) — each is loaded into its own tab.
  const openMany = useCallback(async () => {
    let paths: string[] = []
    try { paths = await window.electronAPI.openMultipleFiles() } catch { paths = [] }
    for (const p of paths) {
      // sequential so each open snapshots the previous tab before switching
      // eslint-disable-next-line no-await-in-loop
      await openFile(p)
    }
  }, [openFile])

  // Open a file handed over by the OS — double-click in a folder, or "Open with
  // Monstera". The main process forwards the path on launch and for already-running
  // instances (single-instance lock).
  useEffect(() => {
    if (!window.electronAPI.onOpenFile) return
    window.electronAPI.onOpenFile((filePath: string) => { if (filePath) openFile(filePath) })
    return () => { window.electronAPI.removeOpenFileListener?.() }
  }, [openFile])

  // Pull the path this app was launched with (folder double-click) once, on mount.
  useEffect(() => {
    let cancelled = false
    window.electronAPI.getPendingOpenPath?.()
      .then(p => { if (p && !cancelled) openFile(p) })
      .catch(() => {})
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Build version, shown in the title bar + start screen so users can confirm the build.
  useEffect(() => {
    window.electronAPI.getAppVersion?.().then(v => setAppVersion(v || '')).catch(() => {})
  }, [])

  // ── Autosave ─────────────────────────────────────────────────────────────────

  const autosaveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    if (autosaveRef.current) clearInterval(autosaveRef.current)
    const mins = settings.autosaveIntervalMinutes
    if (mins > 0 && numPages > 0) {
      autosaveRef.current = setInterval(() => {
        if (usePdfStore.getState().isDirty) {
          save()
            .then(() => setAutosaveError(''))
            .catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err)
              console.error('Autosave failed:', err)
              setAutosaveError(msg)
            })
        }
      }, mins * 60_000)
    }
    return () => { if (autosaveRef.current) clearInterval(autosaveRef.current) }
  }, [settings.autosaveIntervalMinutes, numPages, save])

  // ── First-launch: default annotation colour + optional session restore ────────

  const didInitRef = useRef(false)
  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true
    if (settings.defaultToolColor) usePdfStore.getState().setToolColor(settings.defaultToolColor)
    if (settings.restoreLastSession && usePdfStore.getState().numPages === 0 && recentFiles.length > 0) {
      openFile(recentFiles[0].filePath)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Window title sync ────────────────────────────────────────────────────────

  useEffect(() => {
    const suffix = `Monstera PDF Editor${appVersion ? ` v${appVersion}` : ''}`
    const title = fileName
      ? `${isDirty ? '● ' : ''}${fileName} — ${suffix}`
      : suffix
    window.electronAPI.setWindowTitle(title).catch(() => {})
    // Mirror unsaved state to main so the window-close (X) can prompt to save.
    window.electronAPI.setDirty?.(isDirty)?.catch(() => {})
  }, [fileName, isDirty, appVersion])

  // ── Action dispatch (shared by the native menu and the ⌘K command palette) ──

  const runAction = useCallback((action: string) => {
      const s = usePdfStore.getState()
      const rawSel = [...s.selectedPages]
      const sel = rawSel.length > 0 ? rawSel : (s.numPages > 0 ? [s.currentPage] : [])
      switch (action) {
        case 'open':         openMany(); break
        case 'close':        requestClose(); break
        case 'app-close-request': handleAppClose(); break
        case 'save':         if (s.isDirty) s.save(); break
        case 'saveAs':       s.saveAs(); break
        case 'undo':         s.undo(); break
        case 'redo':         s.redo(); break
        case 'print':        if (s.numPages > 0) setPrintOpen(true); break
        case 'metadata':     setMetadataOpen(true); break
        case 'security':     setSecurityOpen(true); break
        case 'ocr':          setOcrOpen(true); break
        case 'digitalSign':  setDigitalSignOpen(true); break
        case 'settings':     setSettingsOpen(true); break
        case 'shortcuts':    setShortcutsOpen(true); break
        case 'about':        setAboutOpen(true); break
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
        case 'zoomIn':   { const z = useSettingsStore.getState().settings.zoomStep || 0.25; s.setScale(Math.min(5,   Math.round((s.scale + z) * 100) / 100)); break }
        case 'zoomOut':  { const z = useSettingsStore.getState().settings.zoomStep || 0.25; s.setScale(Math.max(0.1, Math.round((s.scale - z) * 100) / 100)); break }
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
        case 'markdownToPdf':   setMarkdownPdfOpen(true); break
        case 'csvToPdf':        setCsvPdfOpen(true); break
        case 'editExternal':    setEditExternalOpen(true); break
        case 'taggedPdf':       setTaggedPdfOpen(true); break
        case 'importToLayer':   setImportToLayerOpen(true); break
        case 'email':           setEmailOpen(true); break
        case 'findDuplicates':  setFindDuplicatesOpen(true); break
        case 'webcam':          setWebcamOpen(true); break
        case 'pageTransitions': setPageTransitionsOpen(true); break
        case 'tocGenerator':    setTocGeneratorOpen(true); break
        case 'ocrRegion':       setOcrRegionOpen(true); break
        case 'deskew':          setDeskewOpen(true); break
        case 'flattenForm':    s.flattenForm(); break
        case 'resetForm':      s.resetFormFields(); break
        case 'applyRedactions':
          if (useSettingsStore.getState().settings.confirmRedaction) setRedactConfirmOpen(true)
          else usePdfStore.getState().applyRedactions()
          break
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
  }, [openFile, openMany, ops, settings.theme, updateSettings, requestClose]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Native menu actions ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!window.electronAPI.onMenuAction) return
    window.electronAPI.onMenuAction(runAction)
    return () => {
      if (window.electronAPI.removeMenuActionListener)
        window.electronAPI.removeMenuActionListener()
    }
  }, [runAction])

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────

  useKeyboardShortcuts({
    onOpen: openMany,
    onSettings: () => setSettingsOpen(true),
    onShortcuts: () => setShortcutsOpen(true),
    onPrint: () => { if (usePdfStore.getState().numPages > 0) setPrintOpen(true) },
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
  // Page ops act on selected thumbnails, or fall back to the current page
  const opPages = selList.length > 0 ? selList : (numPages > 0 ? [currentPage] : [])

  return (
    <div className="app">
      {autosaveError && (
        <div role="alert" style={{
          position: 'fixed', top: 8, left: '50%', transform: 'translateX(-50%)',
          zIndex: 100000, maxWidth: 640, display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px', borderRadius: 8,
          background: '#7f1d1d', color: '#fff', fontSize: 12.5,
          boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
        }}>
          <span>⚠ Autosave failed — your changes are <strong>not</strong> saved: {autosaveError}</span>
          <button onClick={() => setAutosaveError('')} style={{
            background: 'rgba(255,255,255,0.18)', border: 'none', color: '#fff',
            borderRadius: 4, cursor: 'pointer', padding: '2px 8px', flexShrink: 0,
          }}>Dismiss</button>
        </div>
      )}
      <RibbonToolbar
        onOpen={openMany}
        onMerge={ops.mergePdfs}
        onSplit={() => setSplitOpen(true)}
        onMetadata={() => setMetadataOpen(true)}
        onSecurity={() => setSecurityOpen(true)}
        onOcr={() => setOcrOpen(true)}
        onDigitalSign={() => setDigitalSignOpen(true)}
        onSettings={() => setSettingsOpen(true)}
        onShortcuts={() => setShortcutsOpen(true)}
        onExport={() => setExportOpen(true)}
        onRequestRedactConfirm={() => {
          if (settings.confirmRedaction) setRedactConfirmOpen(true)
          else applyRedactions()
        }}
        onOpenSignaturePad={() => setSignaturePadOpen(true)}
        onInsertBlankBefore={() => ops.insertBlankPage(currentPage - 1)}
        onInsertBlankAfter={() => ops.insertBlankPage(currentPage)}
        onInsertFromPdf={() => ops.insertFromPdf(currentPage)}
        onInsertFromImage={() => ops.insertFromImage(currentPage)}
        onDeletePages={() => { if (opPages.length > 0) ops.deletePages(opPages) }}
        onExtractPages={() => { if (opPages.length > 0) ops.extractPages(opPages) }}
        onDuplicatePages={() => { if (opPages.length > 0) ops.duplicatePage(opPages[0]) }}
        onRotateCW={() => { if (opPages.length > 0) ops.rotatePages(opPages, 90) }}
        onRotateCCW={() => { if (opPages.length > 0) ops.rotatePages(opPages, 270) }}
        onRotate180={() => { if (opPages.length > 0) ops.rotatePages(opPages, 180) }}
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
        onBarcode={() => setBarcodeOpen(true)}
        onReadBarcode={() => setBarcodeReadOpen(true)}
        onExtractImages={async () => {
          const s = usePdfStore.getState()
          try {
            const b = await s.getBakedBytes()
            const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
            const imgs = await window.electronAPI.popplerExtractImages(ab)
            if (imgs.length === 0) { alert('No embedded images found in this document.'); return }
            const dir = await window.electronAPI.chooseDirectory()
            if (!dir) return
            const files = imgs.map(im => ({
              name: im.name,
              bytes: Uint8Array.from(atob(im.dataBase64), c => c.charCodeAt(0)).buffer as ArrayBuffer,
            }))
            await window.electronAPI.writeBytesToDir(dir, files)
            alert(`Extracted ${imgs.length} image${imgs.length !== 1 ? 's' : ''} to the chosen folder.`)
          } catch (e: any) {
            alert(`Extract images failed: ${e?.message ?? 'requires Poppler'}`)
          }
        }}
        onScan={() => setScanOpen(true)}
        onEmailImport={async () => {
          try {
            const path = await window.electronAPI.openAnyFile([{ name: 'Email', extensions: ['eml'] }])
            if (!path) return
            const bytes = await window.electronAPI.emailToPdf(path)
            if (bytes && bytes.byteLength > 0) {
              const name = (path.split(/[\\/]/).pop() ?? 'email').replace(/\.eml$/i, '') + '.pdf'
              await loadPdf(bytes, name, name)
              addRecentFile(name, name)
            }
          } catch (e: any) {
            alert(`Email import failed: ${e?.message ?? 'could not convert .eml'}`)
          }
        }}
        onSanitize={async () => {
          const s = usePdfStore.getState()
          try {
            const b = await s.getBakedBytes()
            const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
            const out = await window.electronAPI.mutoolClean(ab, { sanitize: true, garbage: 4, compress: true })
            await s.applyEdit(new Uint8Array(out))
          } catch (e: any) {
            alert(`Sanitize failed: ${e?.message ?? 'mutool unavailable'}\n\nInstall native tools via Tools → Native Tools → Setup.`)
          }
        }}
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
        onMarkdownToPdf={() => setMarkdownPdfOpen(true)}
        onCsvToPdf={() => setCsvPdfOpen(true)}
        onEditExternal={() => setEditExternalOpen(true)}
        onTaggedPdf={() => setTaggedPdfOpen(true)}
        onImportToLayer={() => setImportToLayerOpen(true)}
        onEmail={() => setEmailOpen(true)}
        onFindDuplicates={() => setFindDuplicatesOpen(true)}
        onWebcam={() => setWebcamOpen(true)}
        onPageTransitions={() => setPageTransitionsOpen(true)}
        onTocGenerator={() => setTocGeneratorOpen(true)}
        onOcrRegion={() => setOcrRegionOpen(true)}
        onDeskew={() => setDeskewOpen(true)}
        onMultiPageStamp={() => setMultiPageStampOpen(true)}
        onSplitView={() => setSplitViewOpen(true)}
        onSideBySide={() => setSideBySideOpen(true)}
      >
        {hasPdf ? (
          <div className="main-row">
            <div className="content-area">
              <PdfViewer />
              <SearchPanel />
              <LeftPalette />
            </div>
          </div>
        ) : (
          <StartScreen
            recentFiles={recentFiles}
            version={appVersion}
            onOpen={openMany}
            onOpenRecent={path => openFile(path)}
            onRemoveRecent={removeRecentFile}
            openError={openError}
            onClearError={() => setOpenError('')}
          />
        )}
      </RibbonToolbar>

      <CommandPalette runAction={runAction} hasPdf={hasPdf} />

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
      {printOpen      && <PrintDialog      onClose={() => setPrintOpen(false)} />}
      {metadataOpen   && <MetadataDialog   onClose={() => setMetadataOpen(false)} />}
      {securityOpen   && <PasswordDialog   onClose={() => setSecurityOpen(false)} />}
      {ocrOpen        && <OcrDialog        onClose={() => setOcrOpen(false)} />}
      {exportOpen     && <ExportDialog     onClose={() => setExportOpen(false)} />}
      {settingsOpen   && <SettingsDialog   onClose={() => setSettingsOpen(false)} />}
      {shortcutsOpen  && <ShortcutsDialog  onClose={() => setShortcutsOpen(false)} />}
      {aboutOpen      && <AboutDialog      onClose={() => setAboutOpen(false)} />}
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
      {barcodeOpen    && <BarcodeDialog      onClose={() => setBarcodeOpen(false)} />}
      {scanOpen       && <DocumentScanDialog onClose={() => setScanOpen(false)} />}
      {barcodeReadOpen && <BarcodeReadDialog onClose={() => setBarcodeReadOpen(false)} />}
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
            <div className="modal-title"><TrashIcon size={18} /> Delete Empty Pages</div>
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
      {markdownPdfOpen    && <MarkdownPdfDialog   onClose={() => setMarkdownPdfOpen(false)} />}
      {csvPdfOpen         && <CsvPdfDialog        onClose={() => setCsvPdfOpen(false)} />}
      {editExternalOpen   && <EditExternalDialog  onClose={() => setEditExternalOpen(false)} />}
      {taggedPdfOpen      && <TaggedPdfDialog     onClose={() => setTaggedPdfOpen(false)} />}
      {importToLayerOpen  && <ImportToLayerDialog onClose={() => setImportToLayerOpen(false)} />}
      {emailOpen          && <EmailDialog         onClose={() => setEmailOpen(false)} />}
      {findDuplicatesOpen && <FindDuplicatesDialog onClose={() => setFindDuplicatesOpen(false)} />}
      {webcamOpen         && <WebcamDialog        onClose={() => setWebcamOpen(false)} />}
      {pageTransitionsOpen && <PageTransitionsDialog onClose={() => setPageTransitionsOpen(false)} />}
      {tocGeneratorOpen   && <TocGeneratorDialog  onClose={() => setTocGeneratorOpen(false)} />}
      {ocrRegionOpen      && <OcrRegionDialog     onClose={() => setOcrRegionOpen(false)} />}
      {deskewOpen         && <DeskewDialog        onClose={() => setDeskewOpen(false)} />}
      {splitViewOpen      && <SplitViewPanel     onClose={() => setSplitViewOpen(false)} />}
      {sideBySideOpen     && <SideBySidePanel    onClose={() => setSideBySideOpen(false)} />}
      {multiPageStampOpen && (() => {
        const sel = annotations.find(a => a.id === (usePdfStore.getState().selectedAnnotationId ?? ''))
        return sel ? <MultiPageStampDialog onClose={() => setMultiPageStampOpen(false)} sourceAnnotation={sel} /> : null
      })()}

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
            <div className="modal-title"><LockIcon size={18} /> Password Required</div>
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
