import { useState } from 'react'
import { usePdfStore } from '../store/usePdfStore'

const LANGUAGES = [
  { code: 'es', name: 'Spanish' }, { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' }, { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' }, { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' }, { code: 'ko', name: 'Korean' },
  { code: 'ru', name: 'Russian' }, { code: 'ar', name: 'Arabic' },
  { code: 'nl', name: 'Dutch' }, { code: 'pl', name: 'Polish' },
  { code: 'sv', name: 'Swedish' }, { code: 'tr', name: 'Turkish' },
]

export default function TranslateDialog({ onClose }: { onClose: () => void }) {
  const pdfBytes   = usePdfStore(s => s.pdfBytes)
  const numPages   = usePdfStore(s => s.numPages)
  const currentPage = usePdfStore(s => s.currentPage)

  const [targetLang, setTargetLang] = useState('es')
  const [pageRange, setPageRange]   = useState<'current' | 'all'>('current')
  const [extractedText, setExtractedText] = useState('')
  const [loading, setLoading]       = useState(false)
  const [step, setStep]             = useState<'setup' | 'review'>('setup')

  const handleExtract = async () => {
    if (!pdfBytes) return
    setLoading(true)
    try {
      const pages = await window.electronAPI.mupdfExtractAllText(pdfBytes.buffer as ArrayBuffer)
      const filtered = pageRange === 'current'
        ? pages.filter(p => p.pageNum === currentPage)
        : pages
      setExtractedText(filtered.map(p => `=== Page ${p.pageNum} ===\n${p.text}`).join('\n\n'))
      setStep('review')
    } catch (e) {
      setExtractedText(`Error extracting text: ${(e as Error).message}`)
      setStep('review')
    } finally {
      setLoading(false)
    }
  }

  const handleTranslateViaGoogle = () => {
    const text = extractedText.slice(0, 4500)  // Google Translate URL has limits
    const url = `https://translate.google.com/?sl=auto&tl=${targetLang}&text=${encodeURIComponent(text)}&op=translate`
    window.open(url, '_blank')
  }

  const handleCopyForTranslation = async () => {
    await navigator.clipboard.writeText(extractedText)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 600, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>Translate Document</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {step === 'setup' ? (
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, opacity: 0.7, display: 'block', marginBottom: 4 }}>Target language</label>
              <select value={targetLang} onChange={e => setTargetLang(e.target.value)}
                className="modal-select">
                {LANGUAGES.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, opacity: 0.7, display: 'block', marginBottom: 4 }}>Page scope</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {(['current', 'all'] as const).map(v => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 13 }}>
                    <input type="radio" value={v} checked={pageRange === v} onChange={() => setPageRange(v)} />
                    {v === 'current' ? `Current page (${currentPage})` : `All pages (${numPages})`}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 12, opacity: 0.6, background: 'var(--bg-primary)',
              padding: '8px 10px', borderRadius: 4, lineHeight: 1.5 }}>
              Text will be extracted from the PDF, then you can copy it or open Google Translate.
              Layout, images, and formatting are not preserved.
            </div>
          </div>
        ) : (
          <>
            <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)',
              display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Target: <strong>{LANGUAGES.find(l => l.code === targetLang)?.name}</strong></span>
              <button className="modal-btn" onClick={handleTranslateViaGoogle}>
                Open in Google Translate ↗
              </button>
              <button className="modal-btn-secondary" onClick={handleCopyForTranslation}>
                Copy Text
              </button>
              <button className="modal-btn-secondary" onClick={() => { setStep('setup'); setExtractedText('') }}>
                ← Back
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
              <textarea
                readOnly
                value={extractedText}
                style={{ width: '100%', height: '100%', minHeight: 300, background: 'var(--bg-primary)',
                  color: 'inherit', border: '1px solid var(--border)', borderRadius: 4,
                  padding: 8, fontSize: 12, fontFamily: 'inherit', resize: 'vertical',
                  boxSizing: 'border-box' }}
              />
            </div>
          </>
        )}

        <div className="modal-footer">
          {step === 'setup' ? (
            <>
              <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
              <button className="modal-btn" onClick={handleExtract} disabled={loading || !pdfBytes}>
                {loading ? 'Extracting…' : 'Extract Text →'}
              </button>
            </>
          ) : (
            <button className="modal-btn-secondary" onClick={onClose}>Close</button>
          )}
        </div>
      </div>
    </div>
  )
}
