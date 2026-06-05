interface Props { onClose: () => void }

const SECTIONS = [
  {
    title: 'File',
    rows: [
      ['Ctrl+O',           'Open PDF'],
      ['Ctrl+S',           'Save'],
      ['Ctrl+Shift+S',     'Save As…'],
    ],
  },
  {
    title: 'Edit',
    rows: [
      ['Ctrl+Z',           'Undo'],
      ['Ctrl+Y',           'Redo'],
      ['Delete / Backspace','Delete selected annotation'],
      ['Escape',           'Deselect / close search'],
    ],
  },
  {
    title: 'Navigation',
    rows: [
      ['PageUp / PageDown', 'Previous / next page'],
      ['Alt+← / Alt+→',    'Previous / next page'],
      ['Home',             'First page'],
      ['End',              'Last page'],
    ],
  },
  {
    title: 'View',
    rows: [
      ['Ctrl++',           'Zoom in'],
      ['Ctrl+−',           'Zoom out'],
      ['Ctrl+0',           'Fit page'],
      ['Ctrl+Shift+0',     'Fit width'],
      ['Ctrl+Scroll',      'Zoom in / out'],
    ],
  },
  {
    title: 'Search',
    rows: [
      ['Ctrl+F',           'Open / close Find'],
      ['Enter',            'Next match'],
      ['Shift+Enter',      'Previous match'],
    ],
  },
  {
    title: 'Tools',
    rows: [
      ['Ctrl+P',           'Print'],
      ['Ctrl+,',           'Settings'],
      ['F1',               'Keyboard shortcuts (this dialog)'],
    ],
  },
  {
    title: 'Annotation tools (when toolbar is focused)',
    rows: [
      ['H',  'Highlight'],
      ['U',  'Underline'],
      ['I',  'Ink / freehand draw'],
      ['T',  'Text box'],
      ['E',  'Eraser'],
    ],
  },
]

export default function ShortcutsDialog({ onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-box" style={{ width: 560, maxHeight: '80vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div className="modal-title" style={{ margin: 0 }}>⌨ Keyboard Shortcuts</div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '0 4px',
          }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
          {SECTIONS.map(sec => (
            <div key={sec.title} style={{ marginBottom: 20 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.6px', color: 'var(--accent)', marginBottom: 8,
              }}>{sec.title}</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {sec.rows.map(([key, desc]) => (
                    <tr key={key}>
                      <td style={{ paddingBottom: 5, paddingRight: 10, verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                        <kbd style={{
                          display: 'inline-block',
                          padding: '1px 6px', fontSize: 11,
                          background: 'var(--bg-toolbar)',
                          border: '1px solid var(--border)',
                          borderRadius: 4, fontFamily: 'monospace',
                          color: 'var(--text-primary)',
                        }}>{key}</kbd>
                      </td>
                      <td style={{ paddingBottom: 5, fontSize: 12, color: 'var(--text-muted)', verticalAlign: 'top' }}>
                        {desc}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="modal-btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
