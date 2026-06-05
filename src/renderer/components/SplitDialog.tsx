import { useState } from 'react'
import { parsePageRanges } from '../utils/pdfEdits'

interface Props {
  numPages: number
  onConfirm: (ranges: number[][], mode: 'ranges' | 'all') => void
  onClose: () => void
}

export default function SplitDialog({ numPages, onConfirm, onClose }: Props) {
  const [mode, setMode] = useState<'ranges' | 'all'>('ranges')
  const [rangeInput, setRangeInput] = useState('')

  const parsed = mode === 'ranges' ? parsePageRanges(rangeInput, numPages) : null
  const rangeError = mode === 'ranges' && rangeInput.trim() && !parsed

  const handleConfirm = () => {
    if (mode === 'all') {
      onConfirm([], 'all')
      return
    }
    if (!parsed) return
    onConfirm(parsed, 'ranges')
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box">
        <h2 className="modal-title">Split PDF</h2>

        <div className="modal-field">
          <label className="modal-label">Split method</label>
          <div className="modal-radio-group">
            <label>
              <input type="radio" checked={mode === 'ranges'} onChange={() => setMode('ranges')} />
              {' '}By page ranges
            </label>
            <label>
              <input type="radio" checked={mode === 'all'} onChange={() => setMode('all')} />
              {' '}One file per page ({numPages} files)
            </label>
          </div>
        </div>

        {mode === 'ranges' && (
          <div className="modal-field">
            <label className="modal-label">
              Page ranges <span className="modal-hint">(e.g. 1-3, 4-6, 7)</span>
            </label>
            <input
              className={`modal-input${rangeError ? ' modal-input-error' : ''}`}
              type="text"
              value={rangeInput}
              onChange={e => setRangeInput(e.target.value)}
              placeholder={`1-${Math.ceil(numPages / 2)}, ${Math.ceil(numPages / 2) + 1}-${numPages}`}
              autoFocus
            />
            {rangeError && <span className="modal-error">Invalid page range</span>}
            {parsed && (
              <span className="modal-hint">{parsed.length} output file{parsed.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        )}

        {mode === 'all' && (
          <p className="modal-hint">
            You will be prompted to choose an output folder. Each page saves as a separate PDF.
          </p>
        )}

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="modal-btn-primary"
            onClick={handleConfirm}
            disabled={mode === 'ranges' && (!rangeInput.trim() || !parsed)}
          >
            Split
          </button>
        </div>
      </div>
    </div>
  )
}
