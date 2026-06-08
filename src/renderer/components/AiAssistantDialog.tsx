import { useState, useRef, useEffect } from 'react'
import { Bot, Settings, FileText, ListChecks, ListTodo, Trash2, CornerDownLeft } from 'lucide-react'
import { usePdfStore } from '../store/usePdfStore'
import { useSettingsStore } from '../store/useSettingsStore'

interface Message { role: 'user' | 'assistant'; content: string }

interface Props { onClose: () => void }

export default function AiAssistantDialog({ onClose }: Props) {
  const pdfBytes    = usePdfStore(s => s.pdfBytes)
  const fileName    = usePdfStore(s => s.fileName)
  const { settings, updateSettings } = useSettingsStore()

  const [messages,    setMessages]    = useState<Message[]>([])
  const [input,       setInput]       = useState('')
  const [busy,        setBusy]        = useState(false)
  const [docText,     setDocText]     = useState<string | null>(null)
  const [apiKeyEdit,  setApiKeyEdit]  = useState(settings.anthropicApiKey)
  const [modelEdit,   setModelEdit]   = useState(settings.aiModel)
  const [showKeyEdit, setShowKeyEdit] = useState(!settings.anthropicApiKey)
  const [error,       setError]       = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  const extractDocText = async (): Promise<string> => {
    if (docText !== null) return docText
    if (!pdfBytes) return ''
    const pages = await window.electronAPI.mupdfExtractAllText(pdfBytes.buffer as ArrayBuffer)
    const text = pages.map(p => `=== Page ${p.pageNum} ===\n${p.text}`).join('\n\n').slice(0, 80000)
    setDocText(text)
    return text
  }

  const buildSystemPrompt = (ctx: string) =>
    ctx
      ? `You are an AI assistant helping a user analyze a PDF document called "${fileName}". Here is the document text:\n\n${ctx}\n\nAnswer questions concisely and accurately based on the document content.`
      : `You are an AI assistant. No document text is available.`

  const send = async (userMsg: string) => {
    if (!userMsg.trim()) return
    const key = settings.anthropicApiKey
    if (!key) { setError('Please enter your Anthropic API key above.'); return }

    const newMsg: Message = { role: 'user', content: userMsg }
    const updated = [...messages, newMsg]
    setMessages(updated)
    setInput('')
    setBusy(true)
    setError('')

    try {
      const ctx = await extractDocText()
      const reply = await (window.electronAPI as any).aiQuery(key, updated, buildSystemPrompt(ctx), settings.aiModel)
      setMessages(m => [...m, { role: 'assistant', content: reply }])
    } catch (e: unknown) {
      setError(`API error: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  const summarize = async () => {
    await send('Please provide a concise summary of this document. Include the main topics, key points, and any important conclusions.')
  }

  const keyPoints = async () => {
    await send('List the key points, findings, or important information from this document as bullet points.')
  }

  const saveKey = () => {
    updateSettings({ anthropicApiKey: apiKeyEdit.trim(), aiModel: modelEdit.trim() || 'claude-opus-4-20250514' })
    setShowKeyEdit(false)
    setError('')
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Bot size={18} /> AI Assistant</span>
          {fileName && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>— {fileName}</span>}
          <button style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}
            onClick={() => setShowKeyEdit(v => !v)}><Settings size={13} /> API Key</button>
        </div>

        {showKeyEdit && (
          <div style={{ padding: '10px 16px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
              Enter your <strong>Anthropic API key</strong> (stored locally in settings).
              Get one at <span style={{ color: 'var(--accent)' }}>console.anthropic.com</span>.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="password" className="modal-input" style={{ flex: 1, fontSize: 12 }}
                value={apiKeyEdit} onChange={e => setApiKeyEdit(e.target.value)}
                placeholder="sk-ant-..." />
              <button className="modal-btn-primary" style={{ fontSize: 12 }} onClick={saveKey}>Save</button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '8px 0 4px' }}>
              Model <span style={{ opacity: 0.7 }}>(set the exact id your key supports, e.g. claude-opus-4-20250514, claude-3-5-sonnet-latest)</span>
            </div>
            <input type="text" className="modal-input" style={{ width: '100%', fontSize: 12 }}
              value={modelEdit} onChange={e => setModelEdit(e.target.value)}
              placeholder="claude-opus-4-20250514" />
          </div>
        )}

        {/* Quick actions */}
        <div style={{ display: 'flex', gap: 6, padding: '8px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <button className="modal-btn-secondary" style={{ fontSize: 11 }} onClick={summarize} disabled={busy || !pdfBytes}>
            <FileText size={14} /> Summarize Document
          </button>
          <button className="modal-btn-secondary" style={{ fontSize: 11 }} onClick={keyPoints} disabled={busy || !pdfBytes}>
            <ListChecks size={14} /> Key Points
          </button>
          <button className="modal-btn-secondary" style={{ fontSize: 11 }}
            onClick={() => send('What are the main conclusions or action items from this document?')}
            disabled={busy || !pdfBytes}>
            <ListTodo size={14} /> Action Items
          </button>
          <button className="modal-btn-secondary" style={{ fontSize: 11 }}
            onClick={() => { setMessages([]); setDocText(null) }}>
            <Trash2 size={14} /> Clear
          </button>
        </div>

        {/* Chat messages */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', paddingTop: 20 }}>
              Ask anything about your document, or use a quick action above.
              {!pdfBytes && <div style={{ marginTop: 8, color: '#ff9800' }}>⚠ No document open — general Q&A only.</div>}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} style={{
              display: 'flex', flexDirection: m.role === 'user' ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-start',
            }}>
              <div style={{
                borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                padding: '8px 12px', maxWidth: '80%', fontSize: 13, lineHeight: 1.5,
                background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-secondary)',
                color: m.role === 'user' ? '#fff' : 'var(--text-primary)',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: '8px 14px', fontSize: 13, color: 'var(--text-muted)' }}>
                ⏳ Thinking…
              </div>
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: '6px 16px', color: '#ff5555', fontSize: 12, background: 'rgba(255,0,0,0.06)' }}>
            {error}
          </div>
        )}

        {/* Input */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <textarea className="modal-input" style={{ flex: 1, resize: 'none', height: 64, fontSize: 13, lineHeight: 1.4 }}
            placeholder="Ask a question about the document…"
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }} />
          <button className="modal-btn-primary" style={{ alignSelf: 'flex-end', padding: '8px 16px' }}
            onClick={() => send(input)} disabled={busy || !input.trim()}>
            Send <CornerDownLeft size={13} />
          </button>
        </div>

        <div className="modal-actions" style={{ paddingTop: 0 }}>
          <button className="modal-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
