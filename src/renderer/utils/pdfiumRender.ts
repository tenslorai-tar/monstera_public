/**
 * Coordinates HD (PDFium) page rendering against a persistent main-process
 * document session. The session is keyed by a content token derived from the
 * bytes, so a token match provably means identical content — the renderer only
 * ships the full PDF over IPC when the token changes (i.e. the document version
 * changed), not on every page render. Always falls back to a stateless render
 * if the session is stale or unavailable, so correctness never depends on it.
 */
let ensuredToken = ''
let ensuring: Promise<boolean> | null = null

/** Cheap content token: length + FNV-1a over ~4096 sampled bytes. */
export function pageTokenFor(bytes: Uint8Array): string {
  let h = 2166136261 >>> 0
  const step = Math.max(1, Math.floor(bytes.length / 4096))
  for (let i = 0; i < bytes.length; i += step) {
    h ^= bytes[i]
    h = Math.imul(h, 16777619) >>> 0
  }
  return bytes.length.toString(36) + ':' + h.toString(16)
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

async function ensureSession(token: string, bytes: Uint8Array): Promise<boolean> {
  if (token === ensuredToken) return true
  if (!ensuring) {
    ensuring = window.electronAPI.pdfiumEnsureSession(token, toArrayBuffer(bytes))
      .then(ok => { if (ok) ensuredToken = token; return ok })
      .catch(() => false)
      .finally(() => { ensuring = null })
  }
  return ensuring
}

export async function hdRenderPage(
  bytes: Uint8Array, pageIndex: number, scale: number,
): Promise<{ data: ArrayBuffer; width: number; height: number } | null> {
  const token = pageTokenFor(bytes)
  // Preferred: render from the open session (no bytes transfer when unchanged).
  try {
    await ensureSession(token, bytes)
    const r = await window.electronAPI.pdfiumRenderSession(token, pageIndex, scale)
    if (!r.stale && r.data && r.width && r.height) {
      return { data: r.data, width: r.width, height: r.height }
    }
  } catch { /* fall through */ }
  // Fallback: stateless one-shot render (always correct).
  try {
    const r = await window.electronAPI.pdfiumRenderPage(toArrayBuffer(bytes), pageIndex, scale)
    if (r.width > 0) return { data: r.data, width: r.width, height: r.height }
  } catch { /* give up → caller uses PDF.js */ }
  return null
}
