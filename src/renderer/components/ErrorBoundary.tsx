import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logger } from '../utils/logger'

interface Props { children: ReactNode }
interface State { error: Error | null }

// React error boundaries MUST be class components — there is no hook equivalent.
// This is the one sanctioned class in the app: it stops a render-time exception
// anywhere in the tree from blanking the whole window, and gives the user a way
// out (reload) instead of a frozen screen.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('React render error:', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div style={{
        position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg-primary, #1e1e1e)', color: 'var(--text-primary, #e5e5e5)', padding: 24,
      }}>
        <div style={{ maxWidth: 560, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🌿</div>
          <h2 style={{ margin: '0 0 8px' }}>Monstera hit an unexpected error</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted, #999)', marginBottom: 16 }}>
            The interface stopped rendering. Reloading keeps your open files; if you had unsaved
            changes, Monstera will offer to restore them from its recovery copy.
          </p>
          <pre style={{
            textAlign: 'left', fontSize: 11, background: 'rgba(0,0,0,0.3)', borderRadius: 6,
            padding: 12, maxHeight: 160, overflow: 'auto', whiteSpace: 'pre-wrap', marginBottom: 16,
          }}>{String(error.stack || error.message || error)}</pre>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={() => window.location.reload()} style={{
              padding: '8px 18px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: 'var(--accent, #4a90d9)', color: '#fff', fontSize: 13,
            }}>Reload</button>
            <button onClick={() => this.setState({ error: null })} style={{
              padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
              background: 'transparent', color: 'var(--text-primary, #e5e5e5)',
              border: '1px solid var(--border, #444)',
            }}>Try to continue</button>
          </div>
        </div>
      </div>
    )
  }
}
