import { useState } from 'react'
import { X, Layers } from 'lucide-react'
import { usePdfStore } from '../store/usePdfStore'
import type { FormField } from '../types/forms'
import { exportFormAsJson, exportFormAsFdf, applyValueToField, parseFormDataFile } from '../utils/formPdfLib'

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
  const updateFormField = usePdfStore(s => s.updateFormField)
  const filePath      = usePdfStore(s => s.filePath)

  const [exportMsg, setExportMsg] = useState('')

  // Apply a fieldName→value map to matching fields.
  const applyMap = (map: Record<string, unknown>): number => {
    let n = 0
    for (const f of formFields) {
      if (!(f.fieldName in map)) continue
      const patch = applyValueToField(f, map[f.fieldName])
      if (patch) { updateFormField(f.id, patch); n++ }
    }
    return n
  }

  const handleImportData = async () => {
    try {
      const path = await window.electronAPI.openAnyFile([{ name: 'Form data', extensions: ['fdf', 'xfdf', 'json'] }])
      if (!path) return
      const buf = await window.electronAPI.readFileBytes(path)
      const text = new TextDecoder().decode(buf)
      const map = /\.json$/i.test(path) ? JSON.parse(text) : parseFormDataFile(text)
      const n = applyMap(map)
      setExportMsg(`Filled ${n} field${n !== 1 ? 's' : ''}`); setTimeout(() => setExportMsg(''), 2500)
    } catch (e: any) { setExportMsg(`Error: ${e?.message ?? 'import failed'}`); setTimeout(() => setExportMsg(''), 3000) }
  }

  const handleImportCsv = async () => {
    try {
      const path = await window.electronAPI.openAnyFile([{ name: 'CSV', extensions: ['csv', 'txt'] }])
      if (!path) return
      const buf = await window.electronAPI.readFileBytes(path)
      const text = new TextDecoder().decode(buf)
      const XLSX = await import('xlsx')
      const wb = XLSX.read(text, { type: 'string' })
      const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false })
      const map: Record<string, string> = {}
      if (rows.length >= 2 && rows[0].length > 2) {
        // header row = field names, second row = values
        rows[0].forEach((name, i) => { if (name) map[String(name)] = String(rows[1][i] ?? '') })
      } else {
        // name,value pairs per row
        for (const r of rows) if (r[0]) map[String(r[0])] = String(r[1] ?? '')
      }
      const n = applyMap(map)
      setExportMsg(`Filled ${n} field${n !== 1 ? 's' : ''} from CSV`); setTimeout(() => setExportMsg(''), 2500)
    } catch (e: any) { setExportMsg(`Error: ${e?.message ?? 'CSV import failed'}`); setTimeout(() => setExportMsg(''), 3000) }
  }

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
            <Layers size={13} /> Flatten
          </button>
          <button
            className="annot-tool-btn"
            style={{ fontSize: 12, padding: '2px 5px' }}
            onClick={toggleFormsPanel}
            title="Close forms panel"
          ><X size={13} /></button>
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
          <button className="annot-tool-btn" style={{ fontSize: 10, padding: '2px 6px' }}
            onClick={handleImportData} title="Import field values from JSON / FDF / XFDF">
            ↙ Import
          </button>
          <button className="annot-tool-btn" style={{ fontSize: 10, padding: '2px 6px' }}
            onClick={handleImportCsv} title="Populate fields from a CSV (header=names+values row, or name,value rows)">
            ↙ CSV
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
                  ><X size={13} /></button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
