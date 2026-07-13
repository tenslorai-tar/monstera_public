import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FolderOpen, Save, SaveAll, Printer, X as XIcon, Upload, Combine, Scissors,
  Undo2, Redo2, PanelLeft, Bookmark, MessageSquare, FormInput, ZoomIn, ZoomOut,
  Maximize, MoveHorizontal, Scan, SunMoon, Search, ScanText, Calculator,
  SpellCheck, Languages, GitCompare, Bot, Settings, Keyboard, Info, Lock,
  FileSignature, EyeOff, FilePlus2, Trash2, RotateCw, RotateCcw, FileOutput,
  ArrowDownUp, PanelTop, Droplets, Hash, Crop, Highlighter, Underline,
  Strikethrough, Pen, Type, Square, Circle, StickyNote, CornerDownLeft,
  Volume2, VolumeX,
} from 'lucide-react'

type IconCmp = React.ComponentType<{ size?: number | string; className?: string }>

interface Cmd {
  id: string
  label: string
  action: string
  icon: IconCmp
  group: string
  keywords?: string
  needsPdf?: boolean
}

const COMMANDS: Cmd[] = [
  // File
  { id: 'open', label: 'Open PDF…', action: 'open', icon: FolderOpen, group: 'File', keywords: 'file load' },
  { id: 'save', label: 'Save', action: 'save', icon: Save, group: 'File', needsPdf: true },
  { id: 'saveAs', label: 'Save As…', action: 'saveAs', icon: SaveAll, group: 'File', needsPdf: true },
  { id: 'print', label: 'Print', action: 'print', icon: Printer, group: 'File', needsPdf: true },
  { id: 'close', label: 'Close Document', action: 'close', icon: XIcon, group: 'File', needsPdf: true },
  { id: 'export', label: 'Export…', action: 'export', icon: Upload, group: 'File', keywords: 'png jpeg word text', needsPdf: true },
  { id: 'merge', label: 'Merge PDFs…', action: 'merge', icon: Combine, group: 'File', needsPdf: true },
  { id: 'split', label: 'Split Document…', action: 'split', icon: Scissors, group: 'File', needsPdf: true },
  // Edit / History
  { id: 'undo', label: 'Undo', action: 'undo', icon: Undo2, group: 'Edit', needsPdf: true },
  { id: 'redo', label: 'Redo', action: 'redo', icon: Redo2, group: 'Edit', needsPdf: true },
  { id: 'find', label: 'Find in Document', action: 'find', icon: Search, group: 'Edit', keywords: 'search replace', needsPdf: true },
  // View
  { id: 'thumbs', label: 'Toggle Thumbnails', action: 'toggleSidebar', icon: PanelLeft, group: 'View', needsPdf: true },
  { id: 'bookmarks', label: 'Toggle Bookmarks', action: 'toggleBookmarks', icon: Bookmark, group: 'View', needsPdf: true },
  { id: 'comments', label: 'Toggle Comments Panel', action: 'toggleAnnotationsPanel', icon: MessageSquare, group: 'View', needsPdf: true },
  { id: 'fields', label: 'Toggle Form Fields Panel', action: 'toggleFormsPanel', icon: FormInput, group: 'View', needsPdf: true },
  { id: 'zoomIn', label: 'Zoom In', action: 'zoomIn', icon: ZoomIn, group: 'View', needsPdf: true },
  { id: 'zoomOut', label: 'Zoom Out', action: 'zoomOut', icon: ZoomOut, group: 'View', needsPdf: true },
  { id: 'fitPage', label: 'Fit Page', action: 'fitPage', icon: Maximize, group: 'View', needsPdf: true },
  { id: 'fitWidth', label: 'Fit Width', action: 'fitWidth', icon: MoveHorizontal, group: 'View', needsPdf: true },
  { id: 'zoom100', label: 'Actual Size (100%)', action: 'zoom100', icon: Scan, group: 'View', needsPdf: true },
  { id: 'theme', label: 'Toggle Light / Dark Theme', action: 'toggleTheme', icon: SunMoon, group: 'View', keywords: 'dark light appearance' },
  // Annotate
  { id: 't-highlight', label: 'Highlight Tool', action: 'tool:highlight', icon: Highlighter, group: 'Annotate', needsPdf: true },
  { id: 't-underline', label: 'Underline Tool', action: 'tool:underline', icon: Underline, group: 'Annotate', needsPdf: true },
  { id: 't-strike', label: 'Strikethrough Tool', action: 'tool:strikethrough', icon: Strikethrough, group: 'Annotate', needsPdf: true },
  { id: 't-ink', label: 'Ink / Pen Tool', action: 'tool:ink', icon: Pen, group: 'Annotate', needsPdf: true },
  { id: 't-text', label: 'Typewriter Tool', action: 'tool:typewriter', icon: Type, group: 'Annotate', needsPdf: true },
  { id: 't-rect', label: 'Rectangle Tool', action: 'tool:rectangle', icon: Square, group: 'Annotate', needsPdf: true },
  { id: 't-ellipse', label: 'Ellipse Tool', action: 'tool:ellipse', icon: Circle, group: 'Annotate', needsPdf: true },
  { id: 't-note', label: 'Sticky Note Tool', action: 'tool:stickynote', icon: StickyNote, group: 'Annotate', needsPdf: true },
  // Organize
  { id: 'insertBlank', label: 'Insert Blank Page', action: 'insertBlankAfter', icon: FilePlus2, group: 'Organize', needsPdf: true },
  { id: 'delete', label: 'Delete Page(s)', action: 'deletePages', icon: Trash2, group: 'Organize', needsPdf: true },
  { id: 'rotCW', label: 'Rotate Clockwise', action: 'rotateCW', icon: RotateCw, group: 'Organize', needsPdf: true },
  { id: 'rotCCW', label: 'Rotate Counter-clockwise', action: 'rotateCCW', icon: RotateCcw, group: 'Organize', needsPdf: true },
  { id: 'extract', label: 'Extract Page(s)…', action: 'extractPages', icon: FileOutput, group: 'Organize', needsPdf: true },
  { id: 'reverse', label: 'Reverse Page Order', action: 'reverseOrder', icon: ArrowDownUp, group: 'Organize', needsPdf: true },
  { id: 'header', label: 'Header & Footer…', action: 'headerFooter', icon: PanelTop, group: 'Organize', needsPdf: true },
  { id: 'watermark', label: 'Watermark…', action: 'watermark', icon: Droplets, group: 'Organize', needsPdf: true },
  { id: 'bates', label: 'Bates Numbering…', action: 'batesNumbers', icon: Hash, group: 'Organize', needsPdf: true },
  { id: 'crop', label: 'Crop Pages…', action: 'cropPages', icon: Crop, group: 'Organize', needsPdf: true },
  // Tools
  { id: 'ocr', label: 'Run OCR…', action: 'ocr', icon: ScanText, group: 'Tools', needsPdf: true },
  { id: 'wordCount', label: 'Word Count', action: 'wordCount', icon: Calculator, group: 'Tools', needsPdf: true },
  { id: 'spell', label: 'Spell Check', action: 'spellCheck', icon: SpellCheck, group: 'Tools', needsPdf: true },
  { id: 'translate', label: 'Translate…', action: 'translate', icon: Languages, group: 'Tools', needsPdf: true },
  { id: 'compare', label: 'Compare Documents…', action: 'compare', icon: GitCompare, group: 'Tools', needsPdf: true },
  { id: 'ai', label: 'AI Assistant…', action: 'aiAssistant', icon: Bot, group: 'Tools', needsPdf: true },
  { id: 'readAloud', label: 'Read Page Aloud', action: 'readAloud', icon: Volume2, group: 'Tools', keywords: 'tts speech voice accessibility narrate', needsPdf: true },
  { id: 'stopReading', label: 'Stop Reading Aloud', action: 'stopReading', icon: VolumeX, group: 'Tools', keywords: 'tts speech stop silence', needsPdf: true },
  // Protect
  { id: 'props', label: 'Document Properties…', action: 'metadata', icon: Info, group: 'Protect', needsPdf: true },
  { id: 'security', label: 'Password & Permissions…', action: 'security', icon: Lock, group: 'Protect', needsPdf: true },
  { id: 'sign', label: 'Sign PDF…', action: 'digitalSign', icon: FileSignature, group: 'Protect', needsPdf: true },
  { id: 'redact', label: 'Apply Redactions', action: 'applyRedactions', icon: EyeOff, group: 'Protect', needsPdf: true },
  // App
  { id: 'settings', label: 'Settings / Preferences…', action: 'settings', icon: Settings, group: 'App' },
  { id: 'shortcuts', label: 'Keyboard Shortcuts', action: 'shortcuts', icon: Keyboard, group: 'App' },
]

function score(cmd: Cmd, q: string): number {
  if (!q) return 1
  const needle = q.toLowerCase()
  const label = cmd.label.toLowerCase()
  if (label.startsWith(needle)) return 4
  if (label.includes(needle)) return 3
  if ((cmd.group + ' ' + (cmd.keywords ?? '')).toLowerCase().includes(needle)) return 2
  // word-boundary subsequence (tight): each query char starts a word
  const words = label.split(/[\s/&]+/)
  if (needle.length >= 2 && needle.split('').every((ch, i) => words[i]?.startsWith(ch))) return 1
  return 0
}

export default function CommandPalette({ runAction, hasPdf }: { runAction: (a: string) => void; hasPdf: boolean }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) { setQuery(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 20) }
  }, [open])

  const results = useMemo(() => {
    return COMMANDS
      .filter(c => !c.needsPdf || hasPdf)
      .map(c => ({ c, s: score(c, query) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map(x => x.c)
      .slice(0, 40)
  }, [query, hasPdf])

  useEffect(() => { setSel(0) }, [query])
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  if (!open) return null

  const run = (cmd?: Cmd) => {
    const c = cmd ?? results[sel]
    if (!c) return
    setOpen(false)
    // defer so the palette unmounts before any dialog it opens
    setTimeout(() => runAction(c.action), 0)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(results.length - 1, s + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); run() }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  let lastGroup = ''
  return (
    <div className="cmdk-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div className="cmdk-box" role="dialog" aria-label="Command palette">
        <div className="cmdk-search">
          <Search size={17} className="cmdk-search-icon" />
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Type a command or search…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className="cmdk-esc">ESC</kbd>
        </div>
        <div className="cmdk-list" ref={listRef}>
          {results.length === 0 && <div className="cmdk-empty">No matching commands</div>}
          {results.map((c, i) => {
            const showGroup = c.group !== lastGroup
            lastGroup = c.group
            const Icon = c.icon
            return (
              <div key={c.id}>
                {showGroup && <div className="cmdk-group">{c.group}</div>}
                <div
                  data-i={i}
                  className={`cmdk-item${i === sel ? ' cmdk-item-active' : ''}`}
                  onMouseMove={() => setSel(i)}
                  onClick={() => run(c)}
                >
                  <Icon size={16} className="cmdk-item-icon" />
                  <span className="cmdk-item-label">{c.label}</span>
                </div>
              </div>
            )
          })}
        </div>
        <div className="cmdk-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd><CornerDownLeft size={11} /></kbd> select</span>
          <span><kbd>Ctrl</kbd><kbd>K</kbd> toggle</span>
        </div>
      </div>
    </div>
  )
}
