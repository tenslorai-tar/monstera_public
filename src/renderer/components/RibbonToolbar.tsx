import { useState, useRef } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import { useSettingsStore } from '../store/useSettingsStore'
import type { AnnotationTool, StampName, PlacedImageAnn } from '../types/annotations'
import type { FormCreationTool } from '../types/forms'
import type { ZoomMode } from '../store/usePdfStore'
import { newId } from '../utils/annotationUtils'

type RibbonTab = 'home' | 'comment' | 'organize' | 'forms' | 'review' | 'tools'

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
}

const ZOOM_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0]
const STAMP_NAMES: StampName[] = ['Approved', 'Draft', 'Confidential', 'Rejected', 'Custom']

export default function RibbonToolbar(props: Props) {
  const {
    onOpen, onClose, onMerge, onSplit, onMetadata, onSecurity, onOcr, onDigitalSign,
    onSettings, onShortcuts, onPrint, onExport, onRequestRedactConfirm, onOpenSignaturePad,
    onInsertBlankBefore, onInsertBlankAfter, onInsertFromPdf, onInsertFromImage,
    onDeletePages, onExtractPages, onDuplicatePages, onRotateCW, onRotateCCW, onRotate180, onReverseOrder,
  } = props

  const [activeTab, setActiveTab] = useState<RibbonTab>('home')

  // ── Store ─────────────────────────────────────────────────────────────────
  const fileName          = usePdfStore(s => s.fileName)
  const numPages          = usePdfStore(s => s.numPages)
  const currentPage       = usePdfStore(s => s.currentPage)
  const scale             = usePdfStore(s => s.scale)
  const zoomMode          = usePdfStore(s => s.zoomMode)
  const sidebarOpen       = usePdfStore(s => s.sidebarOpen)
  const bookmarksPanelOpen = usePdfStore(s => s.bookmarksPanelOpen)
  const searchOpen        = usePdfStore(s => s.searchOpen)
  const isDirty           = usePdfStore(s => s.isDirty)
  const undoStack         = usePdfStore(s => s.undoStack)
  const redoStack         = usePdfStore(s => s.redoStack)
  const encryptionSettings = usePdfStore(s => s.encryptionSettings)
  const selectedPages     = usePdfStore(s => s.selectedPages)
  const activeTool        = usePdfStore(s => s.activeTool)
  const toolColor         = usePdfStore(s => s.toolColor)
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

  const setScale          = usePdfStore(s => s.setScale)
  const setZoomMode       = usePdfStore(s => s.setZoomMode)
  const toggleSidebar     = usePdfStore(s => s.toggleSidebar)
  const toggleBookmarksPanel = usePdfStore(s => s.toggleBookmarksPanel)
  const setSearchOpen     = usePdfStore(s => s.setSearchOpen)
  const scrollToPage      = usePdfStore(s => s.scrollToPage)
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
  const addAnnotation     = usePdfStore(s => s.addAnnotation)

  const { settings, updateSettings } = useSettingsStore()
  const theme = settings.theme

  const stampFileRef = useRef<HTMLInputElement>(null)
  const imageFileRef = useRef<HTMLInputElement>(null)

  const [pageInput,   setPageInput]   = useState('')
  const [editingPage, setEditingPage] = useState(false)
  const [zoomInput,   setZoomInput]   = useState('')
  const [editingZoom, setEditingZoom] = useState(false)

  const hasPdf   = numPages > 0
  const zoomPct  = Math.round(scale * 100)
  const hasSel   = selectedPages.size > 0
  const pendingRedact = annotations.filter(a => a.type === 'redact').length
  const showLineWidth = ['ink','rectangle','ellipse','line','arrow'].includes(activeTool ?? '')
  const showFontSize  = ['textbox','typewriter'].includes(activeTool ?? '')

  const toggle     = (t: AnnotationTool) => setActiveTool(activeTool === t ? null : t)
  const toggleFTool= (t: FormCreationTool) => setFormCreationTool(formCreationTool === t ? null : t)

  const commitPage = () => {
    const n = parseInt(pageInput, 10)
    if (!isNaN(n) && n >= 1 && n <= numPages) scrollToPage(n)
    setEditingPage(false)
  }
  const commitZoom = () => {
    const p = parseFloat(zoomInput)
    if (!isNaN(p) && p > 0) setScale(Math.min(500, Math.max(10, p)) / 100)
    setEditingZoom(false)
  }
  const zoomIn  = () => setScale(Math.min(5,    Math.round((scale + 0.25) * 100) / 100))
  const zoomOut = () => setScale(Math.max(0.1, Math.round((scale - 0.25) * 100) / 100))

  const handleZoomSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value as ZoomMode | string
    if (v === 'fit-width' || v === 'fit-page') setZoomMode(v)
    else setScale(parseFloat(v))
  }
  const zoomVal = zoomMode === 'fit-width' ? 'fit-width'
    : zoomMode === 'fit-page' ? 'fit-page'
    : ZOOM_PRESETS.includes(scale) ? String(scale) : 'custom'

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

  // Large button: icon stacked above label
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

  // Small button: compact single-line (icon + optional text label)
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

  // Tool group with bottom label
  const Group = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <>
      <div className="rbn-group">
        <div className="rbn-group-tools">{children}</div>
        <div className="rbn-group-label">{label}</div>
      </div>
      <div className="rbn-group-sep" />
    </>
  )

  // ── Nav + zoom (always on right of content row) ───────────────────────────
  const NavZoom = () => hasPdf ? (
    <div className="rbn-right">
      <button className="rbn-nav-btn" onClick={zoomOut} title="Zoom out (Ctrl+−)">−</button>
      {editingZoom ? (
        <input className="rbn-zoom-input" type="number" min={10} max={500} autoFocus
          value={zoomInput} onChange={e => setZoomInput(e.target.value)} onBlur={commitZoom}
          onKeyDown={e => { if (e.key === 'Enter') commitZoom(); if (e.key === 'Escape') setEditingZoom(false) }} />
      ) : (
        <select className="rbn-zoom-select" value={zoomVal} onChange={handleZoomSelect}
          onDoubleClick={() => { setEditingZoom(true); setZoomInput(String(zoomPct)) }}>
          {zoomVal === 'custom' && <option value="custom" disabled>{zoomPct}%</option>}
          <option value="fit-page">Fit Page</option>
          <option value="fit-width">Fit Width</option>
          <option value="0.5">50%</option>
          <option value="0.75">75%</option>
          <option value="1">100%</option>
          <option value="1.25">125%</option>
          <option value="1.5">150%</option>
          <option value="2">200%</option>
          <option value="3">300%</option>
        </select>
      )}
      <button className="rbn-nav-btn" onClick={zoomIn} title="Zoom in (Ctrl++)">+</button>
      <div className="rbn-nav-sep" />
      {editingPage ? (
        <input className="rbn-page-input" type="number" min={1} max={numPages} autoFocus
          value={pageInput} onChange={e => setPageInput(e.target.value)} onBlur={commitPage}
          onKeyDown={e => { if (e.key === 'Enter') commitPage(); if (e.key === 'Escape') setEditingPage(false) }} />
      ) : (
        <span className="rbn-page-display"
          onClick={() => { setEditingPage(true); setPageInput(String(currentPage)) }}
          title="Click to jump to page">{currentPage}
        </span>
      )}
      <span className="rbn-page-total">/ {numPages}</span>
    </div>
  ) : null

  // ── Tab content ───────────────────────────────────────────────────────────

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
            <div className="rbn-stack">
              <SBtn icon="▤" label="Thumbnails" active={sidebarOpen} onClick={toggleSidebar} title="Page thumbnails sidebar (F4)" />
              <SBtn icon="🔖" label="Bookmarks" active={bookmarksPanelOpen} onClick={toggleBookmarksPanel} title="Bookmarks panel (F5)" />
              <SBtn icon="💬" label="Annotations" active={annotationsPanelOpen} onClick={toggleAnnotationsPanel} title="Annotations panel (F6)" />
            </div>
          </Group>

          <Group label="Document">
            <div className="rbn-stack">
              <SBtn icon="ℹ" label="Properties" onClick={onMetadata} title="View / edit document properties" />
              <SBtn icon="🔒" label="Security" active={!!encryptionSettings} onClick={onSecurity} title="Password-protect / set permissions" />
              <SBtn icon="🔍" label="OCR" onClick={onOcr} title="Run OCR on scanned pages" />
            </div>
            <div className="rbn-stack">
              <SBtn icon="🔏" label="Sign" onClick={onDigitalSign} title="Digitally sign / verify" />
              <SBtn icon="↗" label="Export" onClick={onExport} title="Export to images, text, or Word" />
            </div>
          </Group>

          <Group label="Organize">
            <LBtn icon="⊕" label="Merge" onClick={onMerge} title="Merge other PDFs into this document" />
            <LBtn icon="✂" label="Split" onClick={onSplit} title="Split document by page ranges" />
          </Group>
        </>
      )}
    </>
  )

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
        <div className="rbn-grid2">
          <SBtn icon="□" label="Rect" active={activeTool === 'rectangle'} onClick={() => toggle('rectangle')} title="Rectangle" />
          <SBtn icon="○" label="Ellipse" active={activeTool === 'ellipse'} onClick={() => toggle('ellipse')} title="Ellipse / circle" />
          <SBtn icon="╱" label="Line" active={activeTool === 'line'} onClick={() => toggle('line')} title="Line" />
          <SBtn icon="→" label="Arrow" active={activeTool === 'arrow'} onClick={() => toggle('arrow')} title="Arrow" />
        </div>
      </Group>

      <Group label="Add Text">
        <LBtn icon={<span style={{ fontFamily:'monospace', fontSize:16 }}>Ꭲ</span>} label="Typewriter" active={activeTool === 'typewriter'} onClick={() => toggle('typewriter')} title="Typewriter — click anywhere to type" />
        <LBtn icon="T" label="Text Box" active={activeTool === 'textbox'} onClick={() => toggle('textbox')} title="Text box — drag area then type" />
      </Group>

      <Group label="Notes">
        <LBtn icon="📌" label="Sticky Note" active={activeTool === 'stickynote'} onClick={() => toggle('stickynote')} title="Sticky note / comment bubble" />
      </Group>

      <Group label="Stamps">
        <LBtn icon="⬡" label="Stamp" active={activeTool === 'stamp'} onClick={() => toggle('stamp')} title="Place a stamp" />
        {activeTool === 'stamp' && (
          <div className="rbn-stack" style={{ gap: 3 }}>
            <select className="rbn-select-sm" value={stampName} onChange={e => setStampName(e.target.value as StampName)}>
              {STAMP_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            {stampName === 'Custom' && (
              <SBtn icon="🖼" label="Browse" onClick={() => stampFileRef.current?.click()} title="Load custom stamp image" />
            )}
          </div>
        )}
        <LBtn icon="✍" label="Signature" onClick={onOpenSignaturePad} title="Draw / upload a visible signature image" />
        <input ref={stampFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCustomStamp} />
      </Group>

      <Group label="Edit Content">
        <div className="rbn-stack">
          <SBtn icon={<span style={{ fontSize:10 }}>ab→cd</span>} label="Edit Text" active={activeTool === 'text-edit'} onClick={() => toggle('text-edit')} title="Cover text region and type replacement" />
          <SBtn icon="🖼" label="Insert Image" onClick={() => imageFileRef.current?.click()} title="Insert a PNG / JPEG onto the page" />
        </div>
        <input ref={imageFileRef} type="file" accept="image/png,image/jpeg,image/jpg" style={{ display:'none' }} onChange={handleInsertImage} />
      </Group>

      <Group label="Redact">
        <LBtn
          icon={<span style={{ background:'#1a1a1a', color:'#f55', padding:'0 3px', borderRadius:2, fontSize:10, fontWeight:700, border:'1px solid #f55' }}>REDACT</span>}
          label="Mark Area" active={activeTool === 'redact'} onClick={() => toggle('redact')}
          title="Drag to mark an area for permanent redaction" danger />
        {pendingRedact > 0 && (
          <LBtn icon="⚠" label={`Apply ${pendingRedact}`} onClick={onRequestRedactConfirm}
            title="Permanently remove all marked areas" danger />
        )}
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
        <div className="rbn-stack">
          <SBtn icon="≡" label="Panel" active={annotationsPanelOpen} onClick={toggleAnnotationsPanel} title="Annotations panel (F6)" />
          <SBtn icon="⊞" label="Flatten" onClick={onExport} disabled={annotations.filter(a => a.type !== 'redact').length === 0} title="Export / flatten annotations" />
        </div>
      </Group>
    </>
  )

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
          <SBtn icon="🗑" label="Delete" onClick={onDeletePages} disabled={!hasSel} title="Delete selected pages" />
          <SBtn icon="⟳" label="Rot CW" onClick={onRotateCW} disabled={!hasSel} title="Rotate selected pages clockwise 90°" />
          <SBtn icon="⟲" label="Rot CCW" onClick={onRotateCCW} disabled={!hasSel} title="Rotate selected pages counter-clockwise 90°" />
          <SBtn icon="⧉" label="Duplicate" onClick={onDuplicatePages} disabled={!hasSel} title="Duplicate selected pages" />
        </div>
      </Group>

      <Group label="Extract & Split">
        <LBtn icon="📤" label="Extract" onClick={onExtractPages} disabled={!hasSel} title="Extract selected pages to a new PDF" />
        <LBtn icon="✂" label="Split" onClick={onSplit} title="Split document into multiple files by page ranges" />
      </Group>

      <Group label="Combine">
        <LBtn icon="⊕" label="Merge" onClick={onMerge} title="Merge other PDF files into this document" />
      </Group>

      <Group label="Order">
        <div className="rbn-stack">
          <SBtn icon="↕" label="Reverse Order" onClick={onReverseOrder} title="Reverse the order of all pages" />
          <SBtn icon="↻" label="Rotate 180°" onClick={onRotate180} disabled={!hasSel} title="Rotate selected pages 180°" />
        </div>
      </Group>
    </>
  )

  const FormsTab = () => (
    <>
      <Group label="Mode">
        <LBtn icon="📋" label={formMode ? 'Exit Forms' : 'Edit Forms'}
          active={formMode} onClick={() => setFormMode(!formMode)}
          title="Toggle interactive form editing mode" />
      </Group>

      {formMode && (
        <>
          <Group label="Add Fields">
            <div className="rbn-stack">
              <SBtn
                icon={<span style={{ fontFamily:'monospace', border:'1px solid currentColor', padding:'0 2px', borderRadius:2, fontSize:10 }}>T</span>}
                label="Text Field" active={formCreationTool === 'form-text'}
                onClick={() => toggleFTool('form-text')} title="Draw a text input field" />
              <SBtn icon="☑" label="Checkbox" active={formCreationTool === 'form-checkbox'}
                onClick={() => toggleFTool('form-checkbox')} title="Draw a checkbox" />
              <SBtn icon="✍" label="Signature" active={formCreationTool === 'form-signature'}
                onClick={() => toggleFTool('form-signature')} title="Draw a signature field area" />
            </div>
          </Group>

          <Group label="Operations">
            <div className="rbn-stack">
              <SBtn icon="⊞" label="Flatten" onClick={flattenForm}
                disabled={formFields.filter(f => !f.isNew).length === 0}
                title="Bake all field values permanently into the page content" />
              <SBtn icon="↺" label="Reset" onClick={() => {}} title="Reset all fields to default values" />
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

  const ReviewTab = () => (
    <>
      <Group label="OCR">
        <LBtn icon="🔍" label="Run OCR" onClick={onOcr} title="Run Optical Character Recognition on scanned pages" />
      </Group>

      <Group label="Search">
        <LBtn icon="🔎" label="Find" active={searchOpen} onClick={() => setSearchOpen(!searchOpen)} title="Find in document (Ctrl+F)" />
        <LBtn icon="↔" label="Replace" onClick={() => setSearchOpen(true)} title="Find & replace text in annotations (Ctrl+H)" />
      </Group>

      <Group label="Export">
        <LBtn icon="↗" label="Export" onClick={onExport} title="Export pages as PNG/JPEG, extract text, or convert to Word" />
      </Group>

      <Group label="Signatures">
        <div className="rbn-stack">
          <SBtn icon="🔏" label="Sign PDF" onClick={onDigitalSign} title="Digitally sign this document with a certificate" />
          <SBtn icon="✅" label="Verify" onClick={onDigitalSign} title="Verify existing digital signatures" />
        </div>
      </Group>
    </>
  )

  const ToolsTab = () => (
    <>
      <Group label="Document">
        <LBtn icon="ℹ" label="Properties" onClick={onMetadata} title="View and edit document metadata" />
        <LBtn icon="🔒" label="Security" active={!!encryptionSettings} onClick={onSecurity} title="Password-protect and set document permissions" />
      </Group>

      <Group label="OCR & Text">
        <LBtn icon="🔍" label="Run OCR" onClick={onOcr} title="Run OCR on scanned / image-only pages" />
      </Group>

      <Group label="Digital Signatures">
        <LBtn icon="🔏" label="Sign" onClick={onDigitalSign} title="Sign document with a PFX/P12 certificate" />
        <LBtn icon="✅" label="Verify" onClick={onDigitalSign} title="Verify digital signatures in this document" />
      </Group>

      <Group label="Preferences">
        <div className="rbn-stack">
          <SBtn icon="⚙" label="Settings" onClick={onSettings} title="Application preferences (Ctrl+,)" />
          <SBtn icon="⌨" label="Shortcuts" onClick={onShortcuts} title="Keyboard shortcut reference (F1)" />
        </div>
      </Group>
    </>
  )

  // ── Main render ───────────────────────────────────────────────────────────

  const TABS: { id: RibbonTab; label: string }[] = [
    { id: 'home',     label: 'Home'     },
    { id: 'comment',  label: 'Comment'  },
    { id: 'organize', label: 'Organize' },
    { id: 'forms',    label: 'Forms'    },
    { id: 'review',   label: 'Review'   },
    { id: 'tools',    label: 'Tools'    },
  ]

  return (
    <div className="ribbon">
      {/* ── Tab row ────────────────────────────────────────── */}
      <div className="ribbon-tabs">
        <div className="ribbon-logo">
          <span className="ribbon-logo-icon">🌿</span>
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
        {activeTab === 'organize' && (hasPdf ? <OrganizeTab /> : <NoPdfMsg tab="Organize" />)}
        {activeTab === 'forms'    && (hasPdf ? <FormsTab    /> : <NoPdfMsg tab="Forms"    />)}
        {activeTab === 'review'   && (hasPdf ? <ReviewTab   /> : <NoPdfMsg tab="Review"   />)}
        {activeTab === 'tools'    && (hasPdf ? <ToolsTab    /> : <NoPdfMsg tab="Tools"    />)}
        <NavZoom />
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
