import { useToastStore } from '../store/useToastStore'

const COLORS: Record<string, { bg: string; fg: string }> = {
  info:    { bg: '#334155', fg: '#e2e8f0' },
  success: { bg: '#14532d', fg: '#dcfce7' },
  error:   { bg: '#7f1d1d', fg: '#fee2e2' },
}

export default function ToastHost() {
  const toasts  = useToastStore(s => s.toasts)
  const dismiss = useToastStore(s => s.dismiss)
  if (toasts.length === 0) return null
  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 200000,
      display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420, pointerEvents: 'none',
    }}>
      {toasts.map(t => {
        const c = COLORS[t.kind] ?? COLORS.info
        return (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            background: c.bg, color: c.fg, borderRadius: 8, padding: '10px 12px',
            fontSize: 12.5, lineHeight: 1.4, boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
            pointerEvents: 'auto',
          }}>
            <span style={{ flexShrink: 0 }}>{t.kind === 'error' ? '⛔' : t.kind === 'success' ? '✓' : 'ℹ'}</span>
            <span style={{ flex: 1, whiteSpace: 'pre-wrap' }}>{t.message}</span>
            <button onClick={() => dismiss(t.id)} style={{
              background: 'none', border: 'none', color: c.fg, cursor: 'pointer',
              fontSize: 15, lineHeight: 1, flexShrink: 0, opacity: 0.7,
            }} title="Dismiss">×</button>
          </div>
        )
      })}
    </div>
  )
}
