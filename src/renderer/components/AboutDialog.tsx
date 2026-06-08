import { X } from 'lucide-react'
import logoUrl from '../assets/monstera-logo.png'

interface Props { onClose: () => void }

const APP_VERSION = '0.1.0'

export default function AboutDialog({ onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center' }}>
          <span>About</span>
          <button onClick={onClose} title="Close" style={{
            marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', display: 'inline-flex',
          }}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '14px 22px 4px' }}>
          <img src={logoUrl} alt="Monstera" draggable={false}
            style={{ width: 72, height: 72, objectFit: 'contain', marginBottom: 10,
              filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.4))' }} />
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 400, letterSpacing: '0.5px',
            background: 'linear-gradient(135deg, var(--text-primary) 30%, var(--accent))',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Monstera
          </div>
          <div style={{ fontSize: 11, letterSpacing: 5, color: 'var(--text-secondary)', fontWeight: 600, marginTop: 2 }}>
            PDF EDITOR
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
            Version {APP_VERSION}
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '12px 0 0', maxWidth: 320 }}>
            A modern, precise desktop PDF editor — annotate, edit, sign, convert, and export.
          </p>

          <div style={{ width: '100%', borderTop: '1px solid var(--border)', margin: '16px 0 12px' }} />

          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            © 2026 <strong>Tenslor Inc.</strong>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
            All rights reserved.
          </div>

          <p style={{ fontSize: 10.5, color: 'var(--text-dim, var(--text-muted))', lineHeight: 1.5, margin: '14px 0 0', maxWidth: 340 }}>
            Built with Electron, React, PDF.js, pdf-lib, MuPDF, PDFium and Tesseract.
          </p>
        </div>

        <div className="modal-actions">
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
