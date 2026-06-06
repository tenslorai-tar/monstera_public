/**
 * Loads an embedded PDF font program (extracted by PDFium) as a browser FontFace
 * so the in-place caret editor can render text in the exact page font. Fonts are
 * cached by content so the same font is registered once.
 */
const loaded = new Map<string, string>()
let counter = 0

function keyFor(data: ArrayBuffer): string {
  const v = new Uint8Array(data)
  let h = 2166136261 >>> 0
  const step = Math.max(1, Math.floor(v.length / 1024))
  for (let i = 0; i < v.length; i += step) {
    h ^= v[i]
    h = Math.imul(h, 16777619) >>> 0
  }
  return v.length + ':' + h.toString(16)
}

/** Register the font and return its CSS family name, or null if it can't load. */
export async function loadPdfFont(data: ArrayBuffer): Promise<string | null> {
  if (!data || data.byteLength === 0) return null
  const key = keyFor(data)
  const existing = loaded.get(key)
  if (existing) return existing
  const family = 'pdfedit-font-' + (++counter)
  try {
    const ff = new FontFace(family, data)
    await ff.load()
    document.fonts.add(ff)
    loaded.set(key, family)
    return family
  } catch {
    return null
  }
}
