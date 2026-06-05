import { useRef, useState, useCallback } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import { newId } from '../utils/annotationUtils'
import type {
  FormField, TextFormField, CheckboxFormField, RadioFormField,
  DropdownFormField, ListBoxFormField, SignatureFormField,
} from '../types/forms'

interface Props {
  pageNum: number
  scale: number
  pageW: number
  pageH: number
}

type DrawState =
  | { k: 'idle' }
  | { k: 'drawing'; sx: number; sy: number; cx: number; cy: number }

export default function FormOverlay({ pageNum, scale, pageW, pageH }: Props) {
  const formFields = usePdfStore(s => s.formFields)
  const formCreationTool = usePdfStore(s => s.formCreationTool)
  const activeTool = usePdfStore(s => s.activeTool)
  const addFormField = usePdfStore(s => s.addFormField)
  const updateFormField = usePdfStore(s => s.updateFormField)
  const setRadioSelected = usePdfStore(s => s.setRadioSelected)

  const overlayRef = useRef<HTMLDivElement>(null)
  const [draw, setDraw] = useState<DrawState>({ k: 'idle' })

  const pageFields = formFields.filter(f => f.pageNum === pageNum)

  // When a drawing annotation tool is active, form inputs lose pointer events
  const isAnnotDrawing = activeTool !== null &&
    !['select', 'eraser', 'highlight', 'underline', 'strikethrough'].includes(activeTool)
  const fieldPointerEvents: React.CSSProperties['pointerEvents'] =
    isAnnotDrawing || formCreationTool ? 'none' : 'auto'

  // ── coordinate helpers ──────────────────────────────────────────────────

  const getLocalXY = (e: React.MouseEvent): [number, number] => {
    const rect = overlayRef.current!.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }

  // Convert PDF rect [x1,y1_bot,x2,y2_top] to screen {left,top,width,height}
  const rectToScreen = useCallback((r: [number, number, number, number]) => ({
    left: r[0] * scale,
    top: (pageH - r[3]) * scale,
    width: (r[2] - r[0]) * scale,
    height: (r[3] - r[1]) * scale,
  }), [scale, pageH])

  // ── form creation drawing ───────────────────────────────────────────────

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!formCreationTool || e.button !== 0) return
    e.preventDefault()
    const [sx, sy] = getLocalXY(e)
    setDraw({ k: 'drawing', sx, sy, cx: sx, cy: sy })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draw.k !== 'drawing') return
    const [cx, cy] = getLocalXY(e)
    setDraw(d => ({ ...d, cx, cy } as DrawState))
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    if (draw.k !== 'drawing' || !formCreationTool) return
    const [ex, ey] = getLocalXY(e)
    setDraw({ k: 'idle' })

    const minSize = 12
    if (Math.abs(ex - draw.sx) < minSize || Math.abs(ey - draw.sy) < minSize) return

    const x1 = Math.min(draw.sx, ex) / scale
    const x2 = Math.max(draw.sx, ex) / scale
    const y_top = pageH - Math.min(draw.sy, ey) / scale
    const y_bot = pageH - Math.max(draw.sy, ey) / scale
    const rect: [number, number, number, number] = [x1, y_bot, x2, y_top]
    const id = newId()

    if (formCreationTool === 'form-text') {
      addFormField({
        id, pageNum, fieldName: `text_${id}`,
        rect, readOnly: false, isNew: true,
        type: 'text', value: '', multiline: false,
      } as TextFormField)
    } else if (formCreationTool === 'form-checkbox') {
      addFormField({
        id, pageNum, fieldName: `check_${id}`,
        rect, readOnly: false, isNew: true,
        type: 'checkbox', checked: false, exportValue: 'Yes',
      } as CheckboxFormField)
    } else if (formCreationTool === 'form-signature') {
      addFormField({
        id, pageNum, fieldName: `sig_${id}`,
        rect, readOnly: false, isNew: true,
        type: 'signature',
      } as SignatureFormField)
    }
  }

  // ── field renderers ─────────────────────────────────────────────────────

  const renderField = (field: FormField) => {
    const { left, top, width, height } = rectToScreen(field.rect)
    const commonStyle: React.CSSProperties = {
      position: 'absolute',
      left, top, width, height,
      pointerEvents: fieldPointerEvents,
      boxSizing: 'border-box',
    }

    if (field.type === 'text') {
      const tf = field as TextFormField
      const inputStyle: React.CSSProperties = {
        ...commonStyle,
        background: 'rgba(198,225,255,0.35)',
        border: '1px solid rgba(74,158,255,0.6)',
        borderRadius: 2,
        padding: '2px 4px',
        fontSize: Math.max(10, Math.min(height * 0.7, 14)),
        color: '#1a1a1a',
        outline: 'none',
        fontFamily: 'inherit',
        resize: 'none',
      }
      if (tf.multiline) {
        return (
          <textarea key={field.id} style={inputStyle}
            value={tf.value}
            readOnly={field.readOnly}
            onChange={e => updateFormField(field.id, { value: e.target.value } as Partial<TextFormField>)}
          />
        )
      }
      return (
        <input key={field.id} type="text" style={inputStyle}
          value={tf.value}
          readOnly={field.readOnly}
          maxLength={tf.maxLen}
          onChange={e => updateFormField(field.id, { value: e.target.value } as Partial<TextFormField>)}
        />
      )
    }

    if (field.type === 'checkbox') {
      const cf = field as CheckboxFormField
      const sz = Math.min(width, height)
      return (
        <input key={field.id} type="checkbox"
          style={{ ...commonStyle, width: sz, height: sz, accentColor: '#4a9eff', cursor: 'pointer' }}
          checked={cf.checked}
          readOnly={field.readOnly}
          onChange={e => updateFormField(field.id, { checked: e.target.checked } as Partial<CheckboxFormField>)}
        />
      )
    }

    if (field.type === 'radio') {
      const rf = field as RadioFormField
      const sz = Math.min(width, height)
      return (
        <input key={field.id} type="radio"
          style={{ ...commonStyle, width: sz, height: sz, accentColor: '#4a9eff', cursor: 'pointer' }}
          checked={rf.selected}
          readOnly={field.readOnly}
          onChange={() => setRadioSelected(rf.groupName, rf.exportValue)}
        />
      )
    }

    if (field.type === 'dropdown') {
      const df = field as DropdownFormField
      return (
        <select key={field.id}
          style={{
            ...commonStyle,
            background: 'rgba(198,225,255,0.35)',
            border: '1px solid rgba(74,158,255,0.6)',
            borderRadius: 2,
            fontSize: Math.max(10, Math.min(height * 0.7, 14)),
            color: '#1a1a1a',
            outline: 'none',
            cursor: 'pointer',
          }}
          value={df.value}
          disabled={field.readOnly}
          onChange={e => updateFormField(field.id, { value: e.target.value } as Partial<DropdownFormField>)}
        >
          {df.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    }

    if (field.type === 'listbox') {
      const lf = field as ListBoxFormField
      return (
        <select key={field.id} multiple
          style={{
            ...commonStyle,
            background: 'rgba(198,225,255,0.35)',
            border: '1px solid rgba(74,158,255,0.6)',
            borderRadius: 2,
            fontSize: Math.max(10, Math.min(14, 13)),
            color: '#1a1a1a',
            outline: 'none',
          }}
          value={lf.values}
          disabled={field.readOnly}
          onChange={e => {
            const vals = Array.from(e.target.selectedOptions).map(o => o.value)
            updateFormField(field.id, { values: vals } as Partial<ListBoxFormField>)
          }}
        >
          {lf.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    }

    if (field.type === 'signature') {
      return (
        <div key={field.id} style={{
          ...commonStyle,
          border: '1.5px dashed rgba(74,158,255,0.7)',
          borderRadius: 3,
          background: 'rgba(198,225,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.max(9, Math.min(height * 0.35, 12)),
          color: 'rgba(74,158,255,0.8)',
          fontStyle: 'italic',
          userSelect: 'none',
        }}>
          {height * scale > 20 ? 'Sign here' : ''}
        </div>
      )
    }

    return null
  }

  // ── draw preview ────────────────────────────────────────────────────────

  const renderPreview = () => {
    if (draw.k !== 'drawing') return null
    const x = Math.min(draw.sx, draw.cx)
    const y = Math.min(draw.sy, draw.cy)
    const w = Math.abs(draw.cx - draw.sx)
    const h = Math.abs(draw.cy - draw.sy)
    const isDashed = formCreationTool === 'form-signature'
    return (
      <div style={{
        position: 'absolute', left: x, top: y, width: w, height: h,
        border: `1.5px ${isDashed ? 'dashed' : 'solid'} rgba(74,158,255,0.8)`,
        background: 'rgba(74,158,255,0.06)',
        borderRadius: 2,
        pointerEvents: 'none',
        boxSizing: 'border-box',
      }} />
    )
  }

  return (
    <div
      ref={overlayRef}
      className="form-overlay"
      style={{
        position: 'absolute', top: 0, left: 0,
        width: pageW * scale, height: pageH * scale,
        pointerEvents: formCreationTool ? 'all' : 'none',
        zIndex: 15,
      }}
      onMouseDown={formCreationTool ? handleMouseDown : undefined}
      onMouseMove={formCreationTool ? handleMouseMove : undefined}
      onMouseUp={formCreationTool ? handleMouseUp : undefined}
    >
      {pageFields.map(renderField)}
      {renderPreview()}
    </div>
  )
}
