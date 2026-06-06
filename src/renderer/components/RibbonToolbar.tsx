import { useState, useRef } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import { useSettingsStore } from '../store/useSettingsStore'
import type { AnnotationTool, StampName, PlacedImageAnn } from '../types/annotations'
import type { FormCreationTool } from '../types/forms'
import { newId } from '../utils/annotationUtils'
import logoUrl from '../assets/monstera-logo.png'

type RibbonTab = 'home' | 'comment' | 'edit' | 'organize' | 'forms' | 'review' | 'protect' | 'tools'

interface Props {
  onOpen: () => void
  onClose: () => void
  onMerge: () => void
  onSplit: () => void
  onMetadata: () => void
  onSecurity: () => void
  onOcr: () => void
  onDigitalSign: () => void
  onSettings: () => void
  onShortcuts: () => void
  onPrint: () => void
  onExport: () => void
  onRequestRedactConfirm: () => void
  onOpenSignaturePad: () => void
  onInsertBlankBefore: () => void
  onInsertBlankAfter: () => void
  onInsertFromPdf: () => void
  onInsertFromImage: () => void
  onDeletePages: () => void
  onExtractPages: () => void
  onDuplicatePages: () => void
  onRotateCW: () => void
  onRotateCCW: () => void
  onRotate180: () => void
  onReverseOrder: () => void
  onCommentStyles: () => void
  onSummarizeComments: () => void
  onFlattenAnnotations: () => void
  onHeaderFooter: () => void
  onWatermark: () => void
  onBackground: () => void
  onBatesNumbers: () => void
  onCropPages: () => void
  onCompare: () => void
  onAccessibility: () => void
  onWordCount: () => void
  onTranslate: () => void
  onSpellCheck: () => void
  onSwapPages: () => void
  onResizePages: () => void
  onDeleteEmptyPages: () => void
  onNormalizePages: () => void
  // Tier 2 new props
  onFindRedact: () => void
  onOptimize: () => void
  onOpenUrl: () => void
  onReplacePage: () => void
  onMeasureCalibration: () => void
  // Tier 3 new props
  onAiAssistant: () => void
  onOfficeImport: () => void
  onCloudStorage: () => void
  onDocuSign: () => void
  // Native binary ops
  onNativeBins: () => void
  onPdfConvert: () => void
  // Batch 8 new features
  onMarkdownToPdf: () => void
  onCsvToPdf: () => void
  onEditExternal: () => void
  onTaggedPdf: () => void
  onImportToLayer: () => void
  onEmail: () => void
  onFindDuplicates: () => void
  onWebcam: () => void
  onPageTransitions: () => void
  onTocGenerator: () => void
  onOcrRegion: () => void
  onDeskew: () => void
  onMultiPageStamp: () => void
  onSplitView: () => void
  onBarcode: () => void
  onScan: () => void
  onSanitize: () => void
  onEmailImport: () => void
  onReadBarcode: () => void
}

const STAMP_NAMES: StampName[] = ['Approved', 'Draft', 'Confidential', 'Rejected', 'Custom']
const DYNAMIC_STAMP_NAMES = ['Today', 'Received', 'Revised', 'Void', 'For Review']

function resolveDynamicStamp(name: StampName): StampName {
  const d = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  if (name === 'Today') return `TODAY ${d}` as StampName
  if (name === 'Received') return `RECEIVED ${d}` as StampName
  if (name === 'Revised') return `REVISED ${d}` as StampName
  return name
}

export default function RibbonToolbar(props: Props) {
  const {
    onOpen, onClose, onMerge, onSplit, onMetadata, onSecurity, onOcr, onDigitalSign,
    onSettings, onShortcuts, onPrint, onExport, onRequestRedactConfirm, onOpenSignaturePad,
    onInsertBlankBefore, onInsertBlankAfter, onInsertFromPdf, onInsertFromImage,
    onDeletePages, onExtractPages, onDuplicatePages, onRotateCW, onRotateCCW, onRotate180, onReverseOrder,
    onCommentStyles, onSummarizeComments, onFlattenAnnotations,
    onHeaderFooter, onWatermark, onBatesNumbers, onCropPages,
    onCompare, onAccessibility, onWordCount, onTranslate, onSpellCheck,
    onFindRedact, onOptimize, onOpenUrl, onReplacePage, onMeasureCalibration,
    onAiAssistant, onOfficeImport,
    onMarkdownToPdf, onCsvToPdf, onEditExternal, onOcrRegion, onDeskew,
    onWebcam,
    onMultiPageStamp, onSplitView, onBarcode, onScan, onSanitize, onEmailImport, onReadBarcode,
  } = props

  const resetFormFields = usePdfStore(s => s.resetFormFields)
  const exportFormData  = usePdfStore(s => s.exportFormData)

  const [activeTab, setActiveTab] = useState<RibbonTab>('home')

  // ── Store ─────────────────────────────────────────────────────────────────
  const fileName          = usePdfStore(s => s.fileName)
  const numPages          = usePdfStore(s => s.numPages)
  const currentPage       = usePdfStore(s => s.currentPage)
  const sidebarOpen       = usePdfStore(s => s.sidebarOpen)
  const bookmarksPanelOpen = usePdfStore(s => s.bookmarksPanelOpen)
  const searchOpen        = usePdfStore(s => s.searchOpen)
  const isDirty           = usePdfStore(s => s.isDirty)
  const undoStack         = usePdfStore(s => s.undoStack)
  const redoStack         = usePdfStore(s => s.redoStack)
  const encryptionSettings = usePdfStore(s => s.encryptionSettings)
  const activeTool           = usePdfStore(s => s.activeTool)
  const selectedAnnotationId = usePdfStore(s => s.selectedAnnotationId)
  const toolColor            = usePdfStore(s => s.toolColor)
  const toolOpacity       = usePdfStore(s => s.toolOpacity)
  const toolLineWidth     = usePdfStore(s => s.toolLineWidth)
  const toolFontSize      = usePdfStore(s => s.toolFontSize)
  const stampName         = usePdfStore(s => s.stampName)
  const annotationsPanelOpen = usePdfStore(s => s.annotationsPanelOpen)
  const annotations       = usePdfStore(s => s.annotations)
  const formMode          = usePdfStore(s => s.formMode)
  const formCreationTool  = usePdfStore(s => s.formCreationTool)
  const formsPanelOpen    = usePdfStore(s => s.formsPanelOpen)
  const formFields        = usePdfStore(s => s.formFields)
  const pageSizes         = usePdfStore(s => s.pageSizes)

  const toggleSidebar     = usePdfStore(s => s.toggleSidebar)
  const toggleBookmarksPanel = usePdfStore(s => s.toggleBookmarksPanel)
  const setSearchOpen     = usePdfStore(s => s.setSearchOpen)
  const save              = usePdfStore(s => s.save)
  const saveAs            = usePdfStore(s => s.saveAs)
  const undo              = usePdfStore(s => s.undo)
  const redo              = usePdfStore(s => s.redo)
  const setActiveTool     = usePdfStore(s => s.setActiveTool)
  const setToolColor      = usePdfStore(s => s.setToolColor)
  const setToolOpacity    = usePdfStore(s => s.setToolOpacity)
  const setToolLineWidth  = usePdfStore(s => s.setToolLineWidth)
  const setToolFontSize   = usePdfStore(s => s.setToolFontSize)
  const setStampName      = usePdfStore(s => s.setStampName)
  const setCustomStampDataUrl = usePdfStore(s => s.setCustomStampDataUrl)
  const toggleAnnotationsPanel = usePdfStore(s => s.toggleAnnotationsPanel)
  const setFormMode       = usePdfStore(s => s.setFormMode)
  const setFormCreationTool = usePdfStore(s => s.setFormCreationTool)
  const toggleFormsPanel  = usePdfStore(s => s.toggleFormsPanel)
  const flattenForm       = usePdfStore(s => s.flattenForm)
  const identifyForms     = usePdfStore(s => s.identifyForms)
  const addAnnotation     = usePdfStore(s => s.addAnnotation)

  const { settings, updateSettings } = useSettingsStore()
  const theme = settings.theme

  const stampFileRef = useRef<HTMLInputElement>(null)
  const imageFileRef = useRef<HTMLInputElement>(null)

  const hasPdf   = numPages > 0
  const pendingRedact = annotations.filter(a => a.type === 'redact').length
  const showLineWidth = ['ink','rectangle','ellipse','line','arrow',
    'polygon','polyline','cloud','callout',
    'measure-distance','measure-area','measure-perimeter'].includes(activeTool ?? '')
  const showFontSize  = ['textbox','typewriter','callout'].includes(activeTool ?? '')

  const toggle     = (t: AnnotationTool) => setActiveTool(activeTool === t ? null : t)
  const toggleFTool= (t: FormCreationTool) => setFormCreationTool(formCreationTool === t ? null : t)

  const handleCustomStamp = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setCustomStampDataUrl(ev.target?.result as string)
    reader.readAsDataURL(file)
    setStampName('Custom')
  }
  const handleInsertImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      const img = new Image()
      img.onload = () => {
        const ps = pageSizes[currentPage - 1]; if (!ps) return
        const maxW = ps.width * 0.4
        const ratio = img.naturalHeight / img.naturalWidth
        const w = Math.min(maxW, img.naturalWidth), h = w * ratio
        const ann: PlacedImageAnn = {
          id: newId(), type: 'placed-image', pageNum: currentPage,
          color: '#000000', opacity: 1, createdAt: Date.now(),
          x: (ps.width - w) / 2, y: (ps.height - h) / 2, width: w, height: h, dataUrl,
        }
        addAnnotation(ann)
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  // ── Shared sub-components ─────────────────────────────────────────────────

  const LBtn = ({
    icon, label, active = false, disabled = false, title = '', onClick, danger = false,
  }: {
    icon: React.ReactNode; label: string; active?: boolean; disabled?: boolean
    title?: string; onClick?: () => void; danger?: boolean
  }) => (
    <button
      className={`rbn-btn-lg${active ? ' rbn-btn-lg-active' : ''}${danger ? ' rbn-btn-lg-danger' : ''}`}
      title={title} onClick={onClick} disabled={disabled}
    >
      <span className="rbn-btn-icon">{icon}</span>
      <span className="rbn-btn-label">{label}</span>
    </button>
  )

  const SBtn = ({
    icon, label = '', active = false, disabled = false, title = '', onClick, danger = false,
  }: {
    icon: React.ReactNode; label?: string; active?: boolean; disabled?: boolean
    title?: string; onClick?: () => void; danger?: boolean
  }) => (
    <button
      className={`rbn-btn-sm${active ? ' rbn-btn-sm-active' : ''}${danger ? ' rbn-btn-sm-danger' : ''}`}
      title={title} onClick={onClick} disabled={disabled}
    >
      <span className="rbn-btn-sm-icon">{icon}</span>
      {label && <span className="rbn-btn-sm-label">{label}</span>}
    </button>
  )

  const IBtn = ({
    icon, active = false, disabled = false, title = '', onClick, danger = false,
  }: {
    icon: React.ReactNode; active?: boolean; disabled?: boolean
    title?: string; onClick?: () => void; danger?: boolean
  }) => (
    <button
      className={`rbn-icon-btn${active ? ' rbn-btn-sm-active' : ''}${danger ? ' rbn-btn-sm-danger' : ''}`}
      title={title} onClick={onClick} disabled={disabled}
    >
      <span className="rbn-btn-sm-icon">{icon}</span>
    </button>
  )

  const Group = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <>
      <div className="rbn-group">
        <div className="rbn-group-tools">{children}</div>
        <div className="rbn-group-label">{label}</div>
      </div>
      <div className="rbn-group-sep" />
    </>
  )

  // ── Tab: Home ─────────────────────────────────────────────────────────────

  const HomeTab = () => (
    <>
      <Group label="File">
        <LBtn icon="📂" label="Open" onClick={onOpen} title="Open PDF (Ctrl+O)" />
        {hasPdf && (
          <div className="rbn-stack">
            <SBtn icon="💾" label="Save" onClick={save} disabled={!isDirty} title="Save (Ctrl+S)" />
            <SBtn icon="📄" label="Save As…" onClick={saveAs} title="Save As (Ctrl+Shift+S)" />
            <SBtn icon="🖨" label="Print" onClick={onPrint} title="Print (Ctrl+P)" />
          </div>
        )}
        {hasPdf && <SBtn icon="✕" label="Close" onClick={onClose} title="Close document (Ctrl+W)" />}
      </Group>

      {hasPdf && (
        <>
          <Group label="History">
            <LBtn icon="↩" label="Undo" onClick={() => undo()} disabled={undoStack.length === 0} title="Undo (Ctrl+Z)" />
            <LBtn icon="↪" label="Redo" onClick={() => redo()} disabled={redoStack.length === 0} title="Redo (Ctrl+Y)" />
          </Group>

          <Group label="View">
            <div className="rbn-grid2" style={{ gridTemplateColumns: '1fr 1fr', width: 'auto' }}>
              <SBtn icon="▤" label="Thumbnails" active={sidebarOpen} onClick={toggleSidebar} title="Page thumbnails sidebar (F4)" />
              <SBtn icon="🔖" label="Bookmarks" active={bookmarksPanelOpen} onClick={toggleBookmarksPanel} title="Bookmarks panel (F5)" />
              <SBtn icon="💬" label="Comments" active={annotationsPanelOpen} onClick={toggleAnnotationsPanel} title="Annotations panel (F6)" />
              <SBtn icon="📋" label="Fields" active={formsPanelOpen} onClick={toggleFormsPanel} title="Form fields panel (F7)" />
            </div>
            <LBtn icon="⧉" label="Split View" onClick={onSplitView} disabled={!hasPdf} title="Show two pages side by side" />
          </Group>

          <Group label="Combine">
            <LBtn icon="⊕" label="Merge" onClick={onMerge} title="Merge other PDFs into this document" />
            <LBtn icon="✂" label="Split" onClick={onSplit} title="Split document by page ranges" />
          </Group>

          <Group label="Export">
            <LBtn icon="↗" label="Export" onClick={onExport} title="Export pages as PNG/JPEG, text, Word, or annotations" />
          </Group>
        </>
      )}
    </>
  )

  // ── Tab: Comment ──────────────────────────────────────────────────────────

  const CommentTab = () => (
    <>
      <Group label="Select">
        <LBtn icon="↖" label="Select" active={activeTool === 'select'} onClick={() => toggle('select')} title="Select annotation" />
        <LBtn icon="⌫" label="Erase" active={activeTool === 'eraser'} onClick={() => toggle('eraser')} title="Click annotation to delete it" />
      </Group>

      <Group label="Text Markup">
        <div className="rbn-stack">
          <SBtn
            icon={<span style={{ background:'#ffcc00', color:'#000', padding:'0 3px', borderRadius:2, fontWeight:700 }}>H</span>}
            label="Highlight" active={activeTool === 'highlight'} onClick={() => toggle('highlight')} title="Highlight selected text" />
          <SBtn
            icon={<span style={{ textDecoration:'underline' }}>U</span>}
            label="Underline" active={activeTool === 'underline'} onClick={() => toggle('underline')} title="Underline selected text" />
          <SBtn
            icon={<span style={{ textDecoration:'line-through' }}>S</span>}
            label="Strikethrough" active={activeTool === 'strikethrough'} onClick={() => toggle('strikethrough')} title="Strikethrough selected text" />
        </div>
      </Group>

      <Group label="Drawing">
        <LBtn icon="✏" label="Ink / Pen" active={activeTool === 'ink'} onClick={() => toggle('ink')} title="Freehand drawing" />
      </Group>

      <Group label="Shapes">
        <div className="rbn-icon-grid">
          <IBtn icon="▭" active={activeTool === 'rectangle'} onClick={() => toggle('rectangle')} title="Rectangle" />
          <IBtn icon="◯" active={activeTool === 'ellipse'} onClick={() => toggle('ellipse')} title="Ellipse / circle" />
          <IBtn icon="╱" active={activeTool === 'line'} onClick={() => toggle('line')} title="Line" />
          <IBtn icon="→" active={activeTool === 'arrow'} onClick={() => toggle('arrow')} title="Arrow" />
          <IBtn icon="⬠" active={activeTool === 'polygon'} onClick={() => toggle('polygon')} title="Polygon — click points, DblClick to finish" />
          <IBtn icon="〰" active={activeTool === 'polyline'} onClick={() => toggle('polyline')} title="Polyline — click points, DblClick to finish" />
          <IBtn icon="☁" active={activeTool === 'cloud'} onClick={() => toggle('cloud')} title="Cloud — click points, DblClick to finish" />
          <IBtn icon="⌃" active={activeTool === 'caret'} onClick={() => toggle('caret')} title="Caret insertion mark — single click to place" />
        </div>
      </Group>

      <Group label="Notes">
        <LBtn icon="💬" label="Callout" active={activeTool === 'callout'} onClick={() => toggle('callout')} title="Callout — drag text box, leader arrow auto-placed" />
        <LBtn icon="📌" label="Sticky Note" active={activeTool === 'stickynote'} onClick={() => toggle('stickynote')} title="Sticky note / comment bubble" />
      </Group>

      <Group label="Stamps">
        <LBtn icon="⬡" label="Stamp" active={activeTool === 'stamp'} onClick={() => toggle('stamp')} title="Place a stamp" />
        {activeTool === 'stamp' && (
          <div className="rbn-stack" style={{ gap: 3 }}>
            <select className="rbn-select-sm" value={stampName}
              onChange={e => {
                const v = e.target.value as StampName
                const resolved = resolveDynamicStamp(v)
                setStampName(resolved)
              }}>
              <optgroup label="Standard">
                {STAMP_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
              </optgroup>
              <optgroup label="Dynamic (date inserted)">
                {DYNAMIC_STAMP_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
              </optgroup>
            </select>
            {stampName === 'Custom' && (
              <SBtn icon="🖼" label="Browse" onClick={() => stampFileRef.current?.click()} title="Load custom stamp image" />
            )}
          </div>
        )}
        <LBtn icon="✍" label="Signature" onClick={onOpenSignaturePad} title="Draw / upload a visible signature image" />
        {selectedAnnotationId && (
          <LBtn icon="⊕" label="Multi-Page" onClick={onMultiPageStamp} title="Copy selected annotation to multiple pages at once" />
        )}
        <input ref={stampFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCustomStamp} />
      </Group>

      <Group label="Measure & Link">
        <div className="rbn-icon-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          <IBtn icon="↔" active={activeTool === 'measure-distance'} onClick={() => toggle('measure-distance')} title="Measure distance — click 2 points" />
          <IBtn icon="⬡" active={activeTool === 'measure-area'} onClick={() => toggle('measure-area')} title="Measure area — click points, DblClick to close" />
          <IBtn icon="⬠" active={activeTool === 'measure-perimeter'} onClick={() => toggle('measure-perimeter')} title="Measure perimeter — click points, DblClick to close" />
          <IBtn icon="🔗" active={activeTool === 'link'} onClick={() => toggle('link')} title="Create a link — drag a rectangle, then enter URL or page number" />
        </div>
      </Group>

      <Group label="Style">
        <div className="rbn-control-block">
          <div className="rbn-ctrl-row">
            <span className="rbn-ctrl-lbl">Color</span>
            <input type="color" value={toolColor} onChange={e => setToolColor(e.target.value)}
              className="rbn-color-swatch" title="Annotation color" />
          </div>
          <div className="rbn-ctrl-row">
            <span className="rbn-ctrl-lbl">Opacity</span>
            <input type="range" min={10} max={100} step={5}
              value={Math.round(toolOpacity * 100)}
              onChange={e => setToolOpacity(parseInt(e.target.value) / 100)}
              className="rbn-range" style={{ width: 64 }} />
            <span className="rbn-ctrl-val">{Math.round(toolOpacity * 100)}%</span>
          </div>
          {showLineWidth && (
            <div className="rbn-ctrl-row">
              <span className="rbn-ctrl-lbl">Width</span>
              <input type="number" min={1} max={20} value={toolLineWidth}
                onChange={e => setToolLineWidth(Math.max(1, parseInt(e.target.value) || 1))}
                className="rbn-num-input" title="Line width" />
              <span className="rbn-ctrl-val">px</span>
            </div>
          )}
          {showFontSize && (
            <div className="rbn-ctrl-row">
              <span className="rbn-ctrl-lbl">Font</span>
              <input type="number" min={6} max={72} value={toolFontSize}
                onChange={e => setToolFontSize(Math.max(6, parseInt(e.target.value) || 12))}
                className="rbn-num-input" title="Font size" />
              <span className="rbn-ctrl-val">pt</span>
            </div>
          )}
        </div>
      </Group>

      <Group label="Manage">
        <div className="rbn-grid2">
          <SBtn icon="≡" label="Panel" active={annotationsPanelOpen} onClick={toggleAnnotationsPanel} title="Annotations panel (F6)" />
          <SBtn icon="🎨" label="Styles" onClick={onCommentStyles} title="Save and reuse annotation style presets" />
          <SBtn icon="📋" label="Summary" onClick={onSummarizeComments} disabled={annotations.length === 0} title="View comment summary and export to text" />
          <SBtn icon="⊞" label="Flatten" onClick={onFlattenAnnotations} disabled={annotations.filter(a => a.type !== 'redact').length === 0} title="Commit annotations to PDF structure (clear overlays)" />
        </div>
      </Group>
    </>
  )

  // ── Tab: Edit (NEW) ───────────────────────────────────────────────────────

  const EditTab = () => (
    <>
      <Group label="Add Text">
        <LBtn icon={<span style={{ fontFamily:'monospace', fontSize:16 }}>Ꭲ</span>} label="Typewriter" active={activeTool === 'typewriter'} onClick={() => toggle('typewriter')} title="Typewriter — click anywhere to type new text" />
        <LBtn icon="T" label="Text Box" active={activeTool === 'textbox'} onClick={() => toggle('textbox')} title="Text box — drag area then type" />
      </Group>

      <Group label="Objects">
        <LBtn icon="⬚" label="Edit Objects" active={activeTool === 'object-edit'} onClick={() => toggle('object-edit')}
          title="Select any text, image or shape on the page — move, resize, recolour or delete it" />
        <LBtn icon="▦" label="Barcode/QR" onClick={onBarcode}
          title="Generate a QR code or barcode and place it on the page" />
        <LBtn icon="🔎" label="Read Codes" onClick={onReadBarcode}
          title="Detect & decode barcodes/QR codes on the current page" />
      </Group>

      <Group label="Content">
        <div className="rbn-stack">
          <SBtn icon={<span style={{ fontSize:10 }}>ab→cd</span>} label="Edit Text" active={activeTool === 'text-edit'} onClick={() => toggle('text-edit')} title="Click any text to edit it in place (font preserved), or drag to replace a region" />
          <SBtn icon="🖼" label="Image" onClick={() => imageFileRef.current?.click()} title="Insert a PNG / JPEG onto the page" />
          <SBtn icon="📷" label="Snapshot" active={activeTool === 'snapshot'} onClick={() => toggle('snapshot')} title="Drag a region on the page to capture it as a PNG" />
        </div>
        <input ref={imageFileRef} type="file" accept="image/png,image/jpeg,image/jpg" style={{ display:'none' }} onChange={handleInsertImage} />
      </Group>

      <Group label="Redact">
        <LBtn
          icon={<span style={{ background:'#1a1a1a', color:'#f55', padding:'0 3px', borderRadius:2, fontSize:10, fontWeight:700, border:'1px solid #f55' }}>REDACT</span>}
          label="Mark Area" active={activeTool === 'redact'} onClick={() => toggle('redact')}
          title="Drag to mark an area for permanent redaction" danger />
        <LBtn icon="🔍" label="Find & Redact" onClick={onFindRedact}
          title="Search for text and mark all matches for redaction" danger />
        {pendingRedact > 0 && (
          <LBtn icon="⚠" label={`Apply ${pendingRedact}`} onClick={onRequestRedactConfirm}
            title="Permanently remove all marked areas" danger />
        )}
      </Group>

      <Group label="Enhance">
        <div className="rbn-stack">
          <SBtn icon="🔄" label="Replace Page" onClick={onReplacePage} title="Replace a page with a page from another PDF" />
          <SBtn icon="🗜" label="Optimize" onClick={onOptimize} title="Compress and optimize PDF file size" />
          <SBtn icon="🌐" label="Open URL" onClick={onOpenUrl} title="Download and open a PDF from a web URL" />
        </div>
      </Group>

      <Group label="Style">
        <div className="rbn-control-block">
          <div className="rbn-ctrl-row">
            <span className="rbn-ctrl-lbl">Color</span>
            <input type="color" value={toolColor} onChange={e => setToolColor(e.target.value)}
              className="rbn-color-swatch" title="Text / annotation color" />
          </div>
          {showFontSize && (
            <div className="rbn-ctrl-row">
              <span className="rbn-ctrl-lbl">Font</span>
              <input type="number" min={6} max={72} value={toolFontSize}
                onChange={e => setToolFontSize(Math.max(6, parseInt(e.target.value) || 12))}
                className="rbn-num-input" title="Font size" />
              <span className="rbn-ctrl-val">pt</span>
            </div>
          )}
        </div>
      </Group>
    </>
  )

  // ── Tab: Organize ─────────────────────────────────────────────────────────

  const OrganizeTab = () => (
    <>
      <Group label="Insert Pages">
        <LBtn icon="+" label="Blank Before" onClick={onInsertBlankBefore} title="Insert blank page before current page" />
        <LBtn icon="+" label="Blank After" onClick={onInsertBlankAfter} title="Insert blank page after current page" />
        <div className="rbn-stack">
          <SBtn icon="📄" label="From PDF" onClick={onInsertFromPdf} title="Insert pages from another PDF file" />
          <SBtn icon="🖼" label="From Image" onClick={onInsertFromImage} title="Insert image as a new page" />
        </div>
      </Group>

      <Group label="Page Operations">
        <div className="rbn-grid2">
          <SBtn icon="🗑" label="Delete" onClick={onDeletePages} title="Delete selected pages (or the current page)" />
          <SBtn icon="⟳" label="Rot CW" onClick={onRotateCW} title="Rotate clockwise 90° — selected pages, or the current page" />
          <SBtn icon="⟲" label="Rot CCW" onClick={onRotateCCW} title="Rotate counter-clockwise 90° — selected pages, or the current page" />
          <SBtn icon="↻" label="Rot 180°" onClick={onRotate180} title="Rotate 180° — selected pages, or the current page" />
          <SBtn icon="⧉" label="Duplicate" onClick={onDuplicatePages} title="Duplicate selected pages (or the current page)" />
          <SBtn icon="↕" label="Reverse" onClick={onReverseOrder} title="Reverse the order of all pages" />
        </div>
      </Group>

      <Group label="Extract & Split">
        <LBtn icon="📤" label="Extract" onClick={onExtractPages} title="Extract selected pages (or current page) to a new PDF" />
        <LBtn icon="✂" label="Split" onClick={onSplit} title="Split document into multiple files by page ranges" />
      </Group>

      <Group label="Combine">
        <LBtn icon="⊕" label="Merge" onClick={onMerge} title="Merge other PDF files into this document" />
        <SBtn icon="📥" label="Import Office" onClick={onOfficeImport} title="Convert and import Word or Excel file as PDF" />
      </Group>

      <Group label="Page Design">
        <div className="rbn-grid2">
          <SBtn icon="📑" label="Header/Footer" onClick={onHeaderFooter} title="Add headers and footers to pages" />
          <SBtn icon="💧" label="Watermark" onClick={onWatermark} title="Add a text watermark to pages" />
          <SBtn icon="🔢" label="Bates Nos." onClick={onBatesNumbers} title="Add Bates sequential numbering" />
          <SBtn icon="✂" label="Crop" onClick={onCropPages} title="Crop pages by setting the visible area" />
        </div>
      </Group>
    </>
  )

  // ── Tab: Forms ────────────────────────────────────────────────────────────

  const FormsTab = () => (
    <>
      <Group label="Mode">
        <LBtn icon="📋" label={formMode ? 'Exit Forms' : 'Edit Forms'}
          active={formMode} onClick={() => setFormMode(!formMode)}
          title="Toggle interactive form editing mode" />
        <LBtn icon="🔍" label="Identify" onClick={() => identifyForms().catch(() => {})}
          title="Auto-detect form areas on flat PDFs and create field overlays" />
      </Group>

      {formMode && (
        <>
          <Group label="Text & Date">
            <div className="rbn-stack">
              <SBtn
                icon={<span style={{ fontFamily:'monospace', border:'1px solid currentColor', padding:'0 2px', borderRadius:2, fontSize:10 }}>T</span>}
                label="Text" active={formCreationTool === 'form-text'}
                onClick={() => toggleFTool('form-text')} title="Draw a text input field" />
              <SBtn icon="📅" label="Date" active={formCreationTool === 'form-date'}
                onClick={() => toggleFTool('form-date')} title="Draw a date picker field" />
            </div>
          </Group>

          <Group label="Choice">
            <div className="rbn-stack">
              <SBtn icon="☑" label="Checkbox" active={formCreationTool === 'form-checkbox'}
                onClick={() => toggleFTool('form-checkbox')} title="Draw a checkbox" />
              <SBtn icon="◉" label="Radio" active={formCreationTool === 'form-radio'}
                onClick={() => toggleFTool('form-radio')} title="Draw a radio button" />
              <SBtn icon="▼" label="Dropdown" active={formCreationTool === 'form-dropdown'}
                onClick={() => toggleFTool('form-dropdown')} title="Draw a dropdown list" />
              <SBtn icon="≡" label="List Box" active={formCreationTool === 'form-listbox'}
                onClick={() => toggleFTool('form-listbox')} title="Draw a multi-select list box" />
            </div>
          </Group>

          <Group label="Other">
            <div className="rbn-stack">
              <SBtn icon="🖱" label="Button" active={formCreationTool === 'form-button'}
                onClick={() => toggleFTool('form-button')} title="Draw a push button" />
              <SBtn icon="▦" label="Barcode" active={formCreationTool === 'form-barcode'}
                onClick={() => toggleFTool('form-barcode')} title="Draw a QR / barcode field" />
              <SBtn icon="✍" label="Signature" active={formCreationTool === 'form-signature'}
                onClick={() => toggleFTool('form-signature')} title="Draw a signature field area" />
            </div>
          </Group>

          <Group label="Operations">
            <div className="rbn-stack">
              <SBtn icon="⊞" label="Flatten" onClick={flattenForm}
                disabled={formFields.filter(f => !f.isNew).length === 0}
                title="Bake all field values permanently into the page content" />
              <SBtn icon="↺" label="Reset" onClick={resetFormFields} title="Reset all fields to their default/empty values" />
              <SBtn icon="↗" label="Export" onClick={() => {
                const json = exportFormData()
                const blob = new Blob([json], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a'); a.href = url; a.download = 'form-data.json'; a.click()
                URL.revokeObjectURL(url)
              }} title="Export form field values as JSON" />
            </div>
          </Group>

          <Group label="Manage">
            <LBtn icon="≡" label="Fields Panel" active={formsPanelOpen}
              onClick={toggleFormsPanel} title="Form fields panel (F7)" />
          </Group>
        </>
      )}
    </>
  )

  // ── Tab: Review ───────────────────────────────────────────────────────────

  const ReviewTab = () => (
    <>
      <Group label="OCR">
        <LBtn icon="🔍" label="Run OCR" onClick={onOcr} title="Run Optical Character Recognition on scanned pages" />
      </Group>

      <Group label="Search">
        <LBtn icon="🔎" label="Find" active={searchOpen} onClick={() => setSearchOpen(!searchOpen)} title="Find in document (Ctrl+F)" />
        <LBtn icon="↔" label="Replace" onClick={() => setSearchOpen(true)} title="Find & replace text in annotations (Ctrl+H)" />
      </Group>

      <Group label="Compare">
        <LBtn icon="⊕" label="Compare" onClick={onCompare} title="Compare this document with another PDF" />
      </Group>

      <Group label="Proofing">
        <div className="rbn-stack">
          <SBtn icon="ABC" label="Spell Check" onClick={onSpellCheck} title="Spell-check all text annotations" />
          <SBtn icon="🔢" label="Word Count" onClick={onWordCount} title="Count words, characters, and pages" />
        </div>
      </Group>

      <Group label="Language">
        <LBtn icon="🌐" label="Translate" onClick={onTranslate} title="Translate document text using MyMemory API" />
        <LBtn icon="🤖" label="AI" onClick={onAiAssistant} title="AI Assistant — document Q&A and summarization" />
      </Group>

      <Group label="Export">
        <LBtn icon="↗" label="Export" onClick={onExport} title="Export pages as PNG/JPEG, extract text, or convert to Word" />
      </Group>
    </>
  )

  // ── Tab: Protect (NEW) ────────────────────────────────────────────────────

  const ProtectTab = () => (
    <>
      <Group label="Document Info">
        <LBtn icon="ℹ" label="Properties" onClick={onMetadata} title="View and edit document metadata (title, author, subject, keywords)" />
      </Group>

      <Group label="Security">
        <LBtn icon="🔒" label="Password" active={!!encryptionSettings} onClick={onSecurity}
          title="Password-protect document, set permissions (print, copy, edit)" />
        {encryptionSettings && (
          <LBtn icon="🔓" label="Remove Password" onClick={onSecurity}
            title="Remove password protection from this document" />
        )}
      </Group>

      <Group label="Signatures">
        <LBtn icon="🔏" label="Sign PDF" onClick={onDigitalSign} title="Sign document with a PFX/P12 certificate" />
        <LBtn icon="✅" label="Verify" onClick={onDigitalSign} title="Verify digital signatures in this document" />
      </Group>

      <Group label="Sanitize">
        <LBtn icon="🧹" label="Sanitize" onClick={onSanitize}
          title="Remove hidden data — metadata, scripts, embedded junk — and rewrite the file cleanly (mutool)" />
      </Group>

      <Group label="Accessibility">
        <LBtn icon="♿" label="Check" onClick={onAccessibility} title="Check document for accessibility issues (screen reader, tags, lang)" />
      </Group>
    </>
  )

  // ── Tab: Tools ────────────────────────────────────────────────────────────

  const ToolsTab = () => (
    <>
      <Group label="Display">
        <div className="rbn-grid2">
          <SBtn icon="🌙" label="Dark Pages" active={settings.darkPageMode}
            onClick={() => updateSettings({ darkPageMode: !settings.darkPageMode })}
            title="Invert page colors for comfortable night reading" />
          <SBtn icon="🔭" label="Loupe" active={settings.loupeEnabled}
            onClick={() => updateSettings({ loupeEnabled: !settings.loupeEnabled })}
            title="Enable circular magnifier that follows the cursor" />
          <SBtn icon="📏" label="Rulers" active={settings.showRulers}
            onClick={() => updateSettings({ showRulers: !settings.showRulers })}
            title="Show inch rulers around pages" />
          <SBtn icon="⊞" label="Grid" active={settings.showGrid}
            onClick={() => updateSettings({ showGrid: !settings.showGrid })}
            title="Show alignment grid on pages" />
          <SBtn icon="✨" label="HD Render" active={settings.pdfiumRender}
            onClick={() => updateSettings({ pdfiumRender: !settings.pdfiumRender })}
            title="Render pages with the PDFium engine — higher fidelity on complex fonts/vectors (uses more memory)" />
        </div>
        {settings.autoscrollSpeed > 0 && (
          <div className="rbn-ctrl-row" style={{ marginTop: 4 }}>
            <span className="rbn-ctrl-lbl" style={{ fontSize: 10 }}>Autoscroll</span>
            <input type="range" min={0} max={10} step={1}
              value={settings.autoscrollSpeed}
              onChange={e => updateSettings({ autoscrollSpeed: +e.target.value })}
              className="rbn-range" style={{ width: 60 }} />
          </div>
        )}
      </Group>

      <Group label="Calibration">
        <LBtn icon="📐" label="Measure" onClick={onMeasureCalibration}
          title={`Set measurement unit (current: ${settings.measureUnit})`} />
      </Group>

      <Group label="Import">
        <div className="rbn-stack">
          <SBtn icon="📥" label="Office" onClick={onOfficeImport}
            title="Convert Word, Excel, PowerPoint, ODF → PDF (LibreOffice when available)" />
          <SBtn icon="📝" label="Markdown" onClick={onMarkdownToPdf}
            title="Convert Markdown text to a PDF document" />
          <SBtn icon="📊" label="CSV" onClick={onCsvToPdf}
            title="Convert CSV data to a formatted PDF table" />
          <SBtn icon="📧" label="Email" onClick={onEmailImport}
            title="Convert an email (.eml) into a PDF" />
        </div>
      </Group>

      <Group label="Edit & OCR">
        <div className="rbn-grid2">
          <SBtn icon="🪄" label="Scan/Enhance" onClick={onScan}
            title="Turn a photo of a page into a clean scan — auto-crop, perspective correct, enhance (OpenCV)" />
          <SBtn icon="✏" label="Ext Edit" onClick={onEditExternal}
            title="Export a page as PNG and open in an external image editor" />
          <SBtn icon="🔍" label="OCR Region" onClick={onOcrRegion}
            title="Run OCR on a selected region of the current page" />
          <SBtn icon="📐" label="Deskew" onClick={onDeskew}
            title="Detect and correct skew in scanned pages" />
          <SBtn icon="📷" label="Webcam" onClick={onWebcam}
            title="Capture an image from webcam and insert into the PDF" />
        </div>
      </Group>

      <Group label="Preferences">
        <div className="rbn-stack">
          <SBtn icon="⚙" label="Settings" onClick={onSettings} title="Application preferences (Ctrl+,)" />
          <SBtn icon="⌨" label="Shortcuts" onClick={onShortcuts} title="Keyboard shortcut reference (F1)" />
        </div>
      </Group>

      <div className="rbn-more-hint">
        Cloud, PDF/A·X, Tagged PDF, TOC, Email, Duplicates, DocuSign &amp; more&nbsp;→&nbsp;
        <strong>Tools</strong> menu in the top menu bar
      </div>
    </>
  )

  // ── Main render ───────────────────────────────────────────────────────────

  const TABS: { id: RibbonTab; label: string }[] = [
    { id: 'home',     label: 'Home'     },
    { id: 'comment',  label: 'Comment'  },
    { id: 'edit',     label: 'Edit'     },
    { id: 'organize', label: 'Organize' },
    { id: 'forms',    label: 'Forms'    },
    { id: 'review',   label: 'Review'   },
    { id: 'protect',  label: 'Protect'  },
    { id: 'tools',    label: 'Tools'    },
  ]

  return (
    <div className="ribbon">
      {/* ── Tab row ────────────────────────────────────────── */}
      <div className="ribbon-tabs">
        <div className="ribbon-logo">
          <img src={logoUrl} alt="Monstera" className="ribbon-logo-img" draggable={false} />
          <span className="ribbon-logo-text">Monstera</span>
        </div>

        {TABS.map(t => (
          <button
            key={t.id}
            className={`ribbon-tab${activeTab === t.id ? ' ribbon-tab-active' : ''}${!hasPdf && t.id !== 'home' ? ' ribbon-tab-dim' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}

        <div className="ribbon-tabs-spacer" />

        {hasPdf && (
          <div className="ribbon-filename-pill">
            {isDirty && <span className="ribbon-dirty-dot">●</span>}
            <span className="ribbon-filename-text" title={fileName}>{fileName}</span>
          </div>
        )}

        <div className="ribbon-actions">
          <button
            className={`ribbon-action-btn${searchOpen ? ' ribbon-action-active' : ''}`}
            onClick={() => setSearchOpen(!searchOpen)} title="Find in document (Ctrl+F)">
            🔍
          </button>
          <button className="ribbon-action-btn"
            onClick={() => updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' })}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            {theme === 'dark' ? '☀' : '🌙'}
          </button>
          <button className="ribbon-action-btn" onClick={onSettings} title="Preferences (Ctrl+,)">⚙</button>
          <button className="ribbon-action-btn" onClick={onShortcuts} title="Keyboard shortcuts (F1)">?</button>
        </div>
      </div>

      {/* ── Content row ────────────────────────────────────── */}
      <div className="ribbon-content">
        {activeTab === 'home'     && <HomeTab />}
        {activeTab === 'comment'  && (hasPdf ? <CommentTab  /> : <NoPdfMsg tab="Comment"  />)}
        {activeTab === 'edit'     && (hasPdf ? <EditTab     /> : <NoPdfMsg tab="Edit"     />)}
        {activeTab === 'organize' && (hasPdf ? <OrganizeTab /> : <NoPdfMsg tab="Organize" />)}
        {activeTab === 'forms'    && (hasPdf ? <FormsTab    /> : <NoPdfMsg tab="Forms"    />)}
        {activeTab === 'review'   && (hasPdf ? <ReviewTab   /> : <NoPdfMsg tab="Review"   />)}
        {activeTab === 'protect'  && (hasPdf ? <ProtectTab  /> : <NoPdfMsg tab="Protect"  />)}
        {activeTab === 'tools'    && (hasPdf ? <ToolsTab    /> : <NoPdfMsg tab="Tools"    />)}
      </div>
    </div>
  )
}

function NoPdfMsg({ tab }: { tab: string }) {
  return (
    <div style={{ display:'flex', alignItems:'center', padding:'0 24px', color:'var(--text-muted)', fontSize:12, gap:8 }}>
      <span style={{ fontSize:16, opacity:0.5 }}>📄</span>
      Open a PDF to access {tab} tools
    </div>
  )
}
