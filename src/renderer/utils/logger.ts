// Minimal ring-buffer logger for the renderer. Previously the renderer had a
// single console statement in the whole codebase, so diagnosing a user report
// meant guessing. This keeps the last N entries in memory (inspectable from
// DevTools as `window.__monsteraLog.dump()`) and mirrors to the console.
type Level = 'debug' | 'info' | 'warn' | 'error'
interface Entry { t: number; level: Level; args: unknown[] }

const MAX = 500
const buf: Entry[] = []

function record(level: Level, args: unknown[]): void {
  buf.push({ t: Date.now(), level, args })
  if (buf.length > MAX) buf.shift()
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  try { fn('[monstera]', ...args) } catch { /* console unavailable */ }
}

export const logger = {
  debug: (...a: unknown[]) => record('debug', a),
  info:  (...a: unknown[]) => record('info', a),
  warn:  (...a: unknown[]) => record('warn', a),
  error: (...a: unknown[]) => record('error', a),
  dump:  (): Entry[] => buf.slice(),
}

try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).__monsteraLog = logger
} catch { /* ignore */ }
