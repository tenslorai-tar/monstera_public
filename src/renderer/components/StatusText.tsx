import { Check, TriangleAlert } from 'lucide-react'

/**
 * Renders a status string with a leading Lucide icon derived from its state,
 * keeping the original glyph-prefixed strings (so existing `startsWith('✓')`
 * colour logic and `setStatus('✓ …')` calls stay intact) but showing a clean
 * icon instead of the raw ✓ / ⚠ glyph. The colour is inherited from the parent.
 */
export default function StatusText({ status }: { status: string }) {
  if (!status) return null
  const ok = status.startsWith('✓') || status.startsWith('✅') || status.startsWith('Saved')
  const warn = status.startsWith('⚠')
  const err = /^(error|❌)/i.test(status)
  const msg = status.replace(/^[✓⚠✅❌]️?\s*/, '')
  const Icon = ok ? Check : (warn || err) ? TriangleAlert : null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {Icon && <Icon size={14} style={{ flexShrink: 0 }} />}
      <span>{msg}</span>
    </span>
  )
}
