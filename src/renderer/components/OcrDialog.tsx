import { useEffect, useRef, useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'
import { detectScannedPages, OCR_LANGUAGES, runOcrOnPages } from '../utils/ocrUtils'
import { setOcrTextInCache } from '../utils/textCache'
import { embedOcrText } from '../utils/ocrPdfLib'

interface Props {
  onClose: () => void
}

type Phase = 'detecting' | 'setup' | 'running' | 'done'
type PageScope = 'scanned' | 'all'

export default function OcrDialog({ onClose }: Props) {
  const pdfDoc    = usePdfStore(s => s.pdfDoc)
  const pageSizes = usePdfStore(s => s.pageSizes)
  const numPages  = usePdfStore(s => s.numPages)
  const filePath  = usePdfStore(s => s.filePath)
  const fileName  = usePdfStore(s => s.fileName)
  const pdfBytes  = usePdfStore(s => s.pdfBytes)
  const ocrData   = usePdfStore(s => s.ocrData)
  const setOcrData = usePdfStore(s => s.setOcrData)
  const runSearch = usePdfStore(s => s.runSearch)
  const searchQuery = usePdfStore(s => s.searchQuery)

  const [phase, setPhase]               = useState<Phase>('detecting')
  const [scannedPages, setScannedPages] = useState<number[]>([])
  const [scope, setScope]               = useState<PageScope>('scanned')
  const [language, setLanguage]         = useState('eng')
  const [progress, setProgress]         = useState({ done: 0, total: 0, pageProgress: 0 })
  const [statusText, setStatusText]     = useState('')
  const [saving, setSaving]             = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!pdfDoc) return
    detectScannedPages(pdfDoc, numPages).then(pages => {
      setScannedPages(pages)
      setPhase('setup')
    })
  }, [pdfDoc, numPages])

  const targetPages = scope === 'scanned' ? scannedPages : Array.from({ length: numPages }, (_, i) => i + 1)

  const handleRun = async () => {
    if (!pdfDoc || targetPages.length === 0) return
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setPhase('running')
    setProgress({ done: 0, total: targetPages.length, pageProgress: 0 })

    await runOcrOnPages(
      pdfDoc,
      pageSizes,
      targetPages,
      language,
      (pageNum, words) => {
        setOcrData(pageNum, words)
        setOcrTextInCache(pageNum, words)
      },
      (done, total, pageProgress) => {
        if (done === -1) {
          setProgress(p => ({ ...p, pageProgress }))
          setStatusText(`Recognizing page ${progress.done + 1} of ${total}…`)
        } else {
          setProgress({ done, total, pageProgress: done / total })
          setStatusText(done < total ? `Processed ${done} of ${total} pages…` : '')
        }
      },
      ctrl.signal
    )

    // Refresh search results to include newly OCR'd text
    if (searchQuery) runSearch(searchQuery)

    setPhase('done')
    setStatusText(`Done — ${targetPages.length} page${targetPages.length !== 1 ? 's' : ''} processed.`)
  }

  const handleCancel = () => {
    abortRef.current?.abort()
    if (phase === 'running') {
      setPhase('done')
      setStatusText('Cancelled.')
    } else {
      onClose()
    }
  }

  const handleSaveOcr = async () => {
    if (!pdfBytes || ocrData.size === 0) return
    setSaving(true)
    try {
      const result = await embedOcrText(pdfBytes, ocrData)
      await window.electronAPI.writeFile(filePath, result.buffer as ArrayBuffer)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveOcrAs = async () => {
    if (!pdfBytes || ocrData.size === 0) return
    const defaultName = fileName.replace(/\.pdf$/i, '_ocr.pdf')
    const savePath = await window.electronAPI.saveFileDialog(defaultName)
    if (!savePath) return
    setSaving(true)
    try {
      const result = await embedOcrText(pdfBytes, ocrData)
      await window.electronAPI.writeFile(savePath, result.buffer as ArrayBuffer)
    } finally {
      setSaving(false)
    }
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="modal-overlay">
      <div className="modal-box" style={{ width: 480 }}>
        <div className="modal-title">📄 OCR — Make Scanned Pages Searchable</div>

        {phase === 'detecting' && (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '16px 0' }}>
            Detecting scanned pages…
          </p>
        )}

        {(phase === 'setup' || phase === 'running' || phase === 'done') && (
          <>
            {/* Page scope */}
            <div className="modal-field" style={{ marginTop: 14 }}>
              <label className="modal-label">Pages to process</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio" name="scope" value="scanned"
                    checked={scope === 'scanned'}
                    disabled={phase !== 'setup'}
                    onChange={() => setScope('scanned')}
                  />
                  {scannedPages.length > 0
                    ? `Detected scanned pages (${scannedPages.length}: ${scannedPages.slice(0, 6).join(', ')}${scannedPages.length > 6 ? '…' : ''})`
                    : 'Detected scanned pages (none found)'}
                </label>
                <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input
                    type="radio" name="scope" value="all"
                    checked={scope === 'all'}
                    disabled={phase !== 'setup'}
                    onChange={() => setScope('all')}
                  />
                  All pages ({numPages})
                </label>
              </div>
            </div>

            {/* Language */}
            <div className="modal-field" style={{ marginTop: 12 }}>
              <label className="modal-label">Language</label>
              <select
                className="modal-input"
                value={language}
                disabled={phase !== 'setup'}
                onChange={e => setLanguage(e.target.value)}
                style={{ marginTop: 4 }}
              >
                {OCR_LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
            </div>

            {/* Progress */}
            {(phase === 'running' || phase === 'done') && (
              <div style={{ marginTop: 16 }}>
                <div style={{
                  height: 8,
                  background: 'var(--border)',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: 'var(--accent)',
                    borderRadius: 4,
                    transition: 'width 0.2s',
                  }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>
                  {statusText || `${pct}% — ${progress.done} / ${progress.total} pages`}
                </div>
              </div>
            )}

            {/* Export buttons after done */}
            {phase === 'done' && ocrData.size > 0 && (
              <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="modal-btn-secondary"
                  onClick={handleSaveOcr}
                  disabled={saving}
                  title="Overwrite the current file with OCR text embedded"
                >
                  {saving ? 'Saving…' : '💾 Save (overwrite)'}
                </button>
                <button
                  className="modal-btn-secondary"
                  onClick={handleSaveOcrAs}
                  disabled={saving}
                  title="Save a new copy with OCR text embedded"
                >
                  Save OCR Copy As…
                </button>
              </div>
            )}
          </>
        )}

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="modal-btn-secondary" onClick={handleCancel}>
            {phase === 'done' ? 'Close' : 'Cancel'}
          </button>
          {phase === 'setup' && (
            <button
              className="modal-btn-primary"
              onClick={handleRun}
              disabled={targetPages.length === 0}
            >
              Run OCR ({targetPages.length} page{targetPages.length !== 1 ? 's' : ''})
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
