import { useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'

interface Props { onClose: () => void }

interface DupGroup { hash: string; pages: number[] }

export default function FindDuplicatesDialog({ onClose }: Props) {
  const pdfDoc    = usePdfStore(s => s.pdfDoc)
  const numPages  = usePdfStore(s => s.numPages)
  const applyEdit = usePdfStore(s => s.applyEdit)
  const getBakedBytes = usePdfStore(s => s.getBakedBytes)

  const [scanning,  setScanning]  = useState(false)
  const [groups,    setGroups]    = useState<DupGroup[] | null>(null)
  const [status,    setStatus]    = useState('')
  const [toDelete,  setToDelete]  = useState<Set<number>>(new Set())

  const scan = async () => {
    if (!pdfDoc) return
    setScanning(true); setStatus('Scanning pages…'); setGroups(null); setToDelete(new Set())
    const hashes = new Map<string, number[]>()

    for (let p = 1; p <= numPages; p++) {
      setStatus(`Hashing page ${p} of ${numPages}…`)
      const page = await pdfDoc.getPage(p)
      const vp   = page.getViewport({ scale: 0.25 })
      const canvas = document.createElement('canvas')
      canvas.width  = Math.ceil(vp.width)
      canvas.height = Math.ceil(vp.height)
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      // Simple hash: sample every 16th pixel
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let hash = ''
      for (let i = 0; i < data.length; i += 64) hash += (data[i] >> 3).toString(16)
      const list = hashes.get(hash) ?? []
      list.push(p)
      hashes.set(hash, list)
    }

    const dups: DupGroup[] = []
    for (const [hash, pages] of hashes) {
      if (pages.length > 1) dups.push({ hash, pages })
    }

    setGroups(dups)
    setStatus(dups.length === 0 ? 'No duplicate pages found.' : `Found ${dups.length} group${dups.length !== 1 ? 's' : ''} of duplicate pages.`)
    setScanning(false)
  }

  const toggleDelete = (page: number) => {
    setToDelete(prev => {
      const next = new Set(prev)
      if (next.has(page)) next.delete(page)
      else next.add(page)
      return next
    })
  }

  const autoSelect = () => {
    // For each dup group, keep the first page, mark rest for deletion
    const del = new Set<number>()
    for (const g of groups ?? []) {
      for (const p of g.pages.slice(1)) del.add(p)
    }
    setToDelete(del)
  }

  const deleteSelected = async () => {
    if (toDelete.size === 0) return
    const bytes = await getBakedBytes()
    const { deletePages } = await import('../utils/pdfEdits')
    const result = await deletePages(bytes, [...toDelete].sort((a, b) => a - b))
    applyEdit(result)
    onClose()
  }

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 480, maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="modal-title">🔍 Find Duplicate Pages</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          Compares page renderings to detect visually identical pages.
        </p>

        {!groups && (
          <button className="modal-btn-primary" onClick={scan} disabled={scanning}>
            {scanning ? status : 'Scan for Duplicates'}
          </button>
        )}

        {scanning && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{status}</div>
        )}

        {groups !== null && !scanning && (
          <>
            <div style={{ fontSize: 13, marginBottom: 12, color: groups.length > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
              {status}
            </div>
            {groups.length > 0 && (
              <>
                <button className="modal-btn-secondary" style={{ marginBottom: 12, fontSize: 12 }} onClick={autoSelect}>
                  Auto-select duplicates (keep first of each group)
                </button>
                {groups.map((g, gi) => (
                  <div key={gi} style={{ marginBottom: 12, border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px' }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                      Duplicate group {gi + 1} — {g.pages.length} identical pages
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {g.pages.map(p => (
                        <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer',
                          padding: '3px 8px', borderRadius: 4,
                          background: toDelete.has(p) ? 'rgba(244,67,54,0.1)' : 'var(--bg-secondary)',
                          border: `1px solid ${toDelete.has(p) ? '#f44336' : 'var(--border)'}` }}>
                          <input type="checkbox" checked={toDelete.has(p)} onChange={() => toggleDelete(p)} />
                          Page {p}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
          {groups !== null && groups.length > 0 && (
            <button className="modal-btn-primary" onClick={deleteSelected}
              disabled={toDelete.size === 0}
              style={{ background: toDelete.size > 0 ? '#f44336' : undefined }}>
              Delete {toDelete.size > 0 ? `${toDelete.size} Page${toDelete.size !== 1 ? 's' : ''}` : 'Selected'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
