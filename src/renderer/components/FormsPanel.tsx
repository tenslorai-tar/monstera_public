import { useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import type { FormField } from '../types/forms'
import { exportFormAsJson, exportFormAsFdf } from '../utils/formPdfLib'

const TYPE_LABEL: Record<FormField['type'], string> = {
  text: 'Text',
  checkbox: 'Checkbox',
  radio: 'Radio',
  dropdown: 'Dropdown',
  listbox: 'List Box',
  signature: 'Signature',
  date: 'Date',
  button: 'Button',
  barcode: 'Barcode',
}

function fieldPreview(f: FormField): string {
  switch (f.type) {
    case 'text':      return f.value || '—'
    case 'date':      return f.value || '—'
    case 'checkbox':  return f.checked ? '☑ Checked' : '☐ Unchecked'
    case 'radio':     return f.selected ? `● ${f.exportValue}` : `○ ${f.exportValue}`
    case 'dropdown':  return f.value || '—'
    case 'listbox':   return f.values.join(', ') || '—'
    case 'signature': return '(signature area)'
    case 'button':    return f.label || '(button)'
    case 'barcode':   return f.value ? `[${f.barcodeType}] ${f.value.slice(0, 20)}` : '—'
  }
}

export default function FormsPanel() {
  const formFields    = usePdfStore(s => s.formFields)
  const scrollToPage  = usePdfStore(s => s.scrollToPage)
  const toggleFormsPanel = usePdfStore(s => s.toggleFormsPanel)
  const flattenForm   = usePdfStore(s => s.flattenForm)
  const deleteFormField = usePdfStore(s => s.deleteFormField)
  const filePath      = usePdfStore(s => s.filePath)

  const [exportMsg, setExportMsg] = useState('')

  const byPage = new Map<number, FormField[]>()
  for (const f of formFields) {
    if (!byPage.has(f.pageNum)) byPage.set(f.pageNum, [])
    byPage.get(f.pageNum)!.push(f)
  }
  const sortedPages = Array.from(byPage.keys()).sort((a, b) => a - b)

  const handleExportJson = async () => {
    const json = exportFormAsJson(formFields)
    const path = await window.electronAPI.saveFileDialog('form-data.json')
    if (!path) return
    const enc = new TextEncoder()
    await window.electronAPI.writeFile(path, enc.encode(json).buffer as ArrayBuffer)
    setExportMsg('Exported JSON')
    setTimeout(() => setExportMsg(''), 2500)
  }

  const handleExportFdf = async () => {
    const fdf = exportFormAsFdf(formFields, filePath)
    const path = await window.electronAPI.saveFileDialog('form-data.fdf')
    if (!path) return
    const enc = new TextEncoder()
    await window.electronAPI.writeFile(path, enc.encode(fdf).buffer as ArrayBuffer)
    setExportMsg('Exported FDF')
    setTimeout(() => setExportMsg(''), 2500)
  }

  return (
    <div className="annot-panel">
      <div className="annot-panel-header">
        <span>Forms</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span className="annot-panel-count">{formFields.length}</span>
          <button
            className="annot-tool-btn"
            style={{ fontSize: 11, padding: '2px 7px' }}
            title="Flatten form — bake all field values into the page content (irreversible after save)"
            disabled={formFields.filter(f => !f.isNew).length === 0}
            onClick={flattenForm}
          >
            ⊞ Flatten
          </button>
          <button
            className="annot-tool-btn"
            style={{ fontSize: 12, padding: '2px 5px' }}
            onClick={toggleFormsPanel}
            title="Close forms panel"
          >✕</button>
        </div>
      </div>

      {formFields.length > 0 && (
        <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)',
          display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="annot-tool-btn" style={{ fontSize: 10, padding: '2px 6px' }}
            onClick={handleExportJson} title="Export field values as JSON">
            {} JSON
          </button>
          <button className="annot-tool-btn" style={{ fontSize: 10, padding: '2px 6px' }}
            onClick={handleExportFdf} title="Export field values as FDF (standard PDF form data)">
            {} FDF
          </button>
          {exportMsg && <span style={{ fontSize: 10, color: 'var(--accent)', opacity: 0.8 }}>{exportMsg}</span>}
        </div>
      )}

      {formFields.length === 0 ? (
        <div className="annot-panel-empty">
          No form fields found.<br />
          Use the form creation tools to add fields, or open a PDF that contains an AcroForm.
        </div>
      ) : (
        <div className="annot-panel-scroll">
          {sortedPages.map(pageNum => (
            <div key={pageNum} className="annot-page-group">
              <div className="annot-page-label">Page {pageNum}</div>
              {byPage.get(pageNum)!.map(field => (
                <div
                  key={field.id}
                  className="annot-panel-item"
                  onClick={() => scrollToPage(field.pageNum)}
                  title={`${TYPE_LABEL[field.type]} — ${field.fieldName}`}
                >
                  <div className="annot-panel-info">
                    <span className="annot-panel-type">
                      {TYPE_LABEL[field.type]}
                      {field.isNew && <span style={{ color: 'var(--accent)', marginLeft: 4, fontSize: 10 }}>NEW</span>}
                    </span>
                    <span className="annot-panel-text" style={{ maxWidth: 130 }}>
                      {field.fieldName}
                    </span>
                    <span className="annot-panel-text" style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                      {fieldPreview(field)}
                    </span>
                  </div>
                  <button
                    className="annot-panel-del"
                    title="Remove field"
                    onClick={e => { e.stopPropagation(); deleteFormField(field.id) }}
                  >✕</button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
