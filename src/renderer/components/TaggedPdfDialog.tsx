import { useState, useEffect } from 'react'
import { usePdfStore } from '../store/usePdfStore'

interface Props { onClose: () => void }

interface StructNode {
  title: string
  pageNum: number
  level: number
}

export default function TaggedPdfDialog({ onClose }: Props) {
  const pdfBytes      = usePdfStore(s => s.pdfBytes)
  const getBakedBytes = usePdfStore(s => s.getBakedBytes)
  const scrollToPage  = usePdfStore(s => s.scrollToPage)

  const [nodes,    setNodes]    = useState<StructNode[]>([])
  const [loading,  setLoading]  = useState(false)
  const [status,   setStatus]   = useState('')
  const [langCode, setLangCode] = useState('en-US')
  const [title,    setTitle]    = useState('')

  const loadStructure = async () => {
    if (!pdfBytes) return
    setLoading(true); setStatus('Detecting document structure…')
    try {
      const bytes   = await getBakedBytes()
      const result  = await window.electronAPI.mupdfGenerateBookmarks(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      )
      setNodes(result.map(r => ({ title: r.title, pageNum: r.pageNum, level: r.level })))
      const meta = await window.electronAPI.mupdfGetMetadata(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      )
      setTitle(meta.title || '')
      setStatus(result.length > 0 ? `Found ${result.length} structural element(s).` : 'No structural headings detected.')
    } catch (e: any) {
      setStatus(`Error: ${e?.message}`)
    } finally {
      setLoading(false)
    }
  }

  const applyLang = async () => {
    if (!pdfBytes) return
    setLoading(true); setStatus('Setting document language and title…')
    try {
      const bytes  = await getBakedBytes()
      const ab     = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      const meta: Record<string,string> = {}
      if (title) meta.title = title
      if (langCode) meta.lang = langCode
      const updated = await window.electronAPI.mupdfSetMetadata(ab, meta)
      await (usePdfStore.getState().applyEdit)(new Uint8Array(updated))
      setStatus('✓ Language and title saved.')
    } catch (e: any) {
      setStatus(`Error: ${e?.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (pdfBytes) loadStructure()
  }, [])

  const LEVEL_COLORS = ['#4a9eff', '#2ecc71', '#e67e22', '#9b59b6', '#e74c3c']
  const LEVEL_INDENT = [0, 16, 32, 48, 64]

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 540, maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="modal-title">🏷 Tagged PDF / Reading Order</div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          View the document's structural headings (reading order) and set accessibility metadata.
          For full PDF/UA tagging, run the PDF conversion tool.
        </p>

        <div className="modal-field">
          <label className="modal-label">Document Title (for screen readers)</label>
          <input className="modal-input" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Enter document title…" />
        </div>

        <div className="modal-field">
          <label className="modal-label">Document Language</label>
          <select className="modal-input" value={langCode} onChange={e => setLangCode(e.target.value)}>
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="fr-FR">French</option>
            <option value="de-DE">German</option>
            <option value="es-ES">Spanish</option>
            <option value="it-IT">Italian</option>
            <option value="pt-BR">Portuguese (BR)</option>
            <option value="nl-NL">Dutch</option>
            <option value="pl-PL">Polish</option>
            <option value="ja-JP">Japanese</option>
            <option value="zh-CN">Chinese (Simplified)</option>
            <option value="ar-SA">Arabic</option>
            <option value="he-IL">Hebrew</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button className="modal-btn-secondary" style={{ fontSize: 12 }} onClick={loadStructure} disabled={loading}>
            {loading ? '…' : '🔄 Refresh Structure'}
          </button>
          <button className="modal-btn-primary" style={{ fontSize: 12 }} onClick={applyLang} disabled={loading}>
            💾 Apply Accessibility Metadata
          </button>
        </div>

        {status && (
          <div style={{ fontSize: 12, color: status.startsWith('✓') ? '#4caf50' : status.startsWith('Error') ? '#f44336' : 'var(--text-muted)', marginBottom: 8 }}>
            {status}
          </div>
        )}

        {nodes.length > 0 && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 4, maxHeight: 300, overflowY: 'auto' }}>
            <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
              Document Structure — {nodes.length} headings detected
            </div>
            {nodes.map((n, i) => (
              <div key={i}
                onClick={() => scrollToPage(n.pageNum)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px',
                  paddingLeft: 10 + (LEVEL_INDENT[n.level - 1] ?? 0),
                  fontSize: 12, cursor: 'pointer', borderBottom: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                }}
                title={`Go to page ${n.pageNum}`}>
                <span style={{ color: LEVEL_COLORS[(n.level - 1) % LEVEL_COLORS.length], minWidth: 20, fontSize: 10, fontWeight: 700 }}>
                  H{n.level}
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>p.{n.pageNum}</span>
              </div>
            ))}
          </div>
        )}

        {nodes.length === 0 && !loading && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '16px', textAlign: 'center',
            border: '1px solid var(--border)', borderRadius: 4 }}>
            No structural headings detected. For tagged PDFs, export to PDF/A using the PDF Conversion tool.
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 12 }}>
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
