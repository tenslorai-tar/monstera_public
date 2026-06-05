import { useRef } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import type { AnnotationTool, StampName } from '../types/annotations'
import type { FormCreationTool } from '../types/forms'

const STAMP_NAMES: StampName[] = ['Approved', 'Draft', 'Confidential', 'Rejected', 'Custom']

interface ToolBtnProps {
  tool: AnnotationTool
  active: boolean
  title: string
  children: React.ReactNode
  onClick: () => void
}
function ToolBtn({ active, title, children, onClick }: ToolBtnProps) {
  return (
    <button
      className={`annot-tool-btn${active ? ' annot-tool-active' : ''}`}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

interface Props { onRequestRedactConfirm: () => void }

export default function AnnotationToolbar({ onRequestRedactConfirm }: Props) {
  const activeTool = usePdfStore(s => s.activeTool)
  const toolColor = usePdfStore(s => s.toolColor)
  const toolOpacity = usePdfStore(s => s.toolOpacity)
  const toolLineWidth = usePdfStore(s => s.toolLineWidth)
  const toolFontSize = usePdfStore(s => s.toolFontSize)
  const stampName = usePdfStore(s => s.stampName)
  const annotationsPanelOpen = usePdfStore(s => s.annotationsPanelOpen)
  const annotations = usePdfStore(s => s.annotations)
  const formMode = usePdfStore(s => s.formMode)
  const formCreationTool = usePdfStore(s => s.formCreationTool)
  const formsPanelOpen = usePdfStore(s => s.formsPanelOpen)

  const setActiveTool = usePdfStore(s => s.setActiveTool)
  const setToolColor = usePdfStore(s => s.setToolColor)
  const setToolOpacity = usePdfStore(s => s.setToolOpacity)
  const setToolLineWidth = usePdfStore(s => s.setToolLineWidth)
  const setToolFontSize = usePdfStore(s => s.setToolFontSize)
  const setStampName = usePdfStore(s => s.setStampName)
  const setCustomStampDataUrl = usePdfStore(s => s.setCustomStampDataUrl)
  const toggleAnnotationsPanel = usePdfStore(s => s.toggleAnnotationsPanel)
  const setFormMode = usePdfStore(s => s.setFormMode)
  const setFormCreationTool = usePdfStore(s => s.setFormCreationTool)
  const toggleFormsPanel = usePdfStore(s => s.toggleFormsPanel)
  const flattenForm = usePdfStore(s => s.flattenForm)
  const formFields = usePdfStore(s => s.formFields)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const toggle = (tool: AnnotationTool) =>
    setActiveTool(activeTool === tool ? null : tool)

  const toggleFormTool = (tool: FormCreationTool) =>
    setFormCreationTool(formCreationTool === tool ? null : tool)

  const pendingRedactCount = annotations.filter(a => a.type === 'redact').length

  const showLineWidth = activeTool === 'ink' ||
    activeTool === 'rectangle' || activeTool === 'ellipse' ||
    activeTool === 'line' || activeTool === 'arrow'

  const showFontSize = activeTool === 'textbox'

  const showStamp = activeTool === 'stamp'

  const handleCustomStamp = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setCustomStampDataUrl(ev.target?.result as string)
    reader.readAsDataURL(file)
    setStampName('Custom')
  }

  return (
    <div className="annot-toolbar">
      {/* ── Select / Erase ─────────────────────────────── */}
      <div className="annot-group">
        <ToolBtn tool="select" active={activeTool === 'select'} title="Select annotation" onClick={() => toggle('select')}>↖</ToolBtn>
        <ToolBtn tool="eraser" active={activeTool === 'eraser'} title="Erase annotation (click to delete)" onClick={() => toggle('eraser')}>⌫</ToolBtn>
      </div>

      <div className="annot-sep" />

      {/* ── Text markup ────────────────────────────────── */}
      <div className="annot-group">
        <ToolBtn tool="highlight" active={activeTool === 'highlight'} title="Highlight text" onClick={() => toggle('highlight')}>
          <span style={{ background: '#ffcc00', color: '#000', padding: '0 2px', borderRadius: 2 }}>H</span>
        </ToolBtn>
        <ToolBtn tool="underline" active={activeTool === 'underline'} title="Underline text" onClick={() => toggle('underline')}>
          <span style={{ textDecoration: 'underline' }}>U</span>
        </ToolBtn>
        <ToolBtn tool="strikethrough" active={activeTool === 'strikethrough'} title="Strikethrough text" onClick={() => toggle('strikethrough')}>
          <span style={{ textDecoration: 'line-through' }}>S</span>
        </ToolBtn>
      </div>

      <div className="annot-sep" />

      {/* ── Drawing ────────────────────────────────────── */}
      <div className="annot-group">
        <ToolBtn tool="ink" active={activeTool === 'ink'} title="Freehand drawing" onClick={() => toggle('ink')}>✏</ToolBtn>
      </div>

      <div className="annot-sep" />

      {/* ── Shapes ─────────────────────────────────────── */}
      <div className="annot-group">
        <ToolBtn tool="rectangle" active={activeTool === 'rectangle'} title="Rectangle" onClick={() => toggle('rectangle')}>□</ToolBtn>
        <ToolBtn tool="ellipse" active={activeTool === 'ellipse'} title="Ellipse / Circle" onClick={() => toggle('ellipse')}>○</ToolBtn>
        <ToolBtn tool="line" active={activeTool === 'line'} title="Line" onClick={() => toggle('line')}>╱</ToolBtn>
        <ToolBtn tool="arrow" active={activeTool === 'arrow'} title="Arrow" onClick={() => toggle('arrow')}>→</ToolBtn>
      </div>

      <div className="annot-sep" />

      {/* ── Content ────────────────────────────────────── */}
      <div className="annot-group">
        <ToolBtn tool="textbox" active={activeTool === 'textbox'} title="Text box" onClick={() => toggle('textbox')}>T</ToolBtn>
        <ToolBtn tool="stickynote" active={activeTool === 'stickynote'} title="Sticky note / Comment" onClick={() => toggle('stickynote')}>📌</ToolBtn>
        <ToolBtn tool="stamp" active={activeTool === 'stamp'} title="Stamp" onClick={() => toggle('stamp')}>⬡</ToolBtn>
      </div>

      <div className="annot-sep" />

      {/* ── Redact ─────────────────────────────────────── */}
      <div className="annot-group">
        <ToolBtn tool="redact" active={activeTool === 'redact'}
          title="Redact — drag to mark an area for permanent content removal"
          onClick={() => toggle('redact')}
        >
          <span style={{ background: '#1a1a1a', color: '#ff4444', padding: '0 3px', borderRadius: 2, fontSize: 11, fontWeight: 700, border: '1px solid #ff4444' }}>
            REDACT
          </span>
        </ToolBtn>
      </div>

      {pendingRedactCount > 0 && (
        <>
          <button
            className="annot-tool-btn"
            style={{ color: '#ff4444', borderColor: '#ff4444', fontSize: 11, padding: '3px 9px', background: 'rgba(255,68,68,0.08)' }}
            title="Apply all redaction marks — permanently removes content from the file"
            onClick={onRequestRedactConfirm}
          >
            ⚠ Apply {pendingRedactCount} Redaction{pendingRedactCount !== 1 ? 's' : ''}
          </button>
        </>
      )}

      <div className="annot-sep" />

      {/* ── Controls ───────────────────────────────────── */}
      <div className="annot-group annot-controls">
        <label className="annot-control-label" title="Color">
          <input
            type="color"
            value={toolColor}
            onChange={e => setToolColor(e.target.value)}
            className="annot-color-input"
          />
        </label>

        <label className="annot-control-label" title="Opacity">
          <span className="annot-ctrl-caption">Opacity</span>
          <input
            type="range" min={10} max={100} step={5}
            value={Math.round(toolOpacity * 100)}
            onChange={e => setToolOpacity(parseInt(e.target.value) / 100)}
            className="annot-range"
            style={{ width: 60 }}
          />
          <span className="annot-ctrl-value">{Math.round(toolOpacity * 100)}%</span>
        </label>

        {showLineWidth && (
          <label className="annot-control-label" title="Line width">
            <span className="annot-ctrl-caption">Width</span>
            <input
              type="number" min={1} max={20} step={1}
              value={toolLineWidth}
              onChange={e => setToolLineWidth(Math.max(1, parseInt(e.target.value) || 1))}
              className="annot-number-input"
            />
          </label>
        )}

        {showFontSize && (
          <label className="annot-control-label" title="Font size">
            <span className="annot-ctrl-caption">Size</span>
            <input
              type="number" min={6} max={72} step={1}
              value={toolFontSize}
              onChange={e => setToolFontSize(Math.max(6, parseInt(e.target.value) || 12))}
              className="annot-number-input"
            />
          </label>
        )}

        {showStamp && (
          <label className="annot-control-label" title="Stamp type">
            <span className="annot-ctrl-caption">Stamp</span>
            <select
              className="annot-select"
              value={stampName}
              onChange={e => setStampName(e.target.value as StampName)}
            >
              {STAMP_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            {stampName === 'Custom' && (
              <>
                <button className="annot-tool-btn" onClick={() => fileInputRef.current?.click()} title="Load custom stamp image">🖼</button>
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCustomStamp} />
              </>
            )}
          </label>
        )}
      </div>

      <div className="annot-sep" style={{ marginLeft: 'auto' }} />

      {/* ── Forms mode ────────────────────────────────── */}
      <button
        className={`annot-tool-btn${formMode ? ' annot-tool-active' : ''}`}
        onClick={() => setFormMode(!formMode)}
        title="Toggle form editing mode"
        style={{ fontSize: 12 }}
      >
        📋 Forms
      </button>

      {formMode && (
        <>
          <div className="annot-sep" />
          <div className="annot-group">
            <button
              className={`annot-tool-btn${formCreationTool === 'form-text' ? ' annot-tool-active' : ''}`}
              title="Draw text field"
              onClick={() => toggleFormTool('form-text')}
            >
              <span style={{ fontFamily: 'monospace', border: '1px solid currentColor', padding: '0 3px', borderRadius: 2, fontSize: 11 }}>T</span>
            </button>
            <button
              className={`annot-tool-btn${formCreationTool === 'form-checkbox' ? ' annot-tool-active' : ''}`}
              title="Draw checkbox"
              onClick={() => toggleFormTool('form-checkbox')}
            >
              ☑
            </button>
            <button
              className={`annot-tool-btn${formCreationTool === 'form-signature' ? ' annot-tool-active' : ''}`}
              title="Draw signature field"
              onClick={() => toggleFormTool('form-signature')}
            >
              ✍
            </button>
          </div>
          <div className="annot-sep" />
          <button
            className="annot-tool-btn"
            title="Flatten form — bake all field values into page content"
            disabled={formFields.filter(f => !f.isNew).length === 0}
            onClick={flattenForm}
            style={{ fontSize: 11 }}
          >
            ⊞ Flatten
          </button>
          <button
            className={`annot-tool-btn${formsPanelOpen ? ' annot-tool-active' : ''}`}
            onClick={toggleFormsPanel}
            title="Forms panel"
          >
            ≡ Fields
          </button>
        </>
      )}

      {/* ── Annotation panel toggle ────────────────────── */}
      <div className="annot-sep" />
      <button
        className={`annot-tool-btn${annotationsPanelOpen ? ' annot-tool-active' : ''}`}
        onClick={toggleAnnotationsPanel}
        title="Annotations panel"
      >
        ≡ Panel
      </button>
    </div>
  )
}
