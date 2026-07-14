/**
 * Subset-font glyph extension for in-place text editing.
 *
 * The embedded font in a design-tool PDF is almost always a SUBSET — only the
 * glyphs the document originally drew. Editing text to include a character the
 * subset lacks (say typing "PhD" where the page never used a 'P') normally forces
 * the tool to bail to the cover-and-replace overlay in a wrong font.
 *
 * Instead of the impossible-in-JS surgery of merging a glyph into an existing
 * CFF/TrueType subset, we take the safe additive route: embed the matching
 * INSTALLED full font as a NEW Type0/Identity-H CIDFontType2 (pdf-lib does the
 * subsetting + /W + ToUnicode + CIDToGIDMap), reference it in the target form's
 * resources, and switch to it (Tf) for ONLY the edited run. Every untouched run
 * keeps its own font resource and program byte-for-byte, so nothing else on the
 * page can change. The edited run renders in the installed cut of the same family
 * (e.g. Calibri), which is visually identical to the subset it came from.
 *
 * If no installed font of the right family covers the new characters, we return
 * null and the caller throws → the overlay fallback still applies. We NEVER
 * substitute a visually wrong family silently.
 */
import type { PDFDocument, PDFRef } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { resolveSystemFont } from './systemFonts'

interface FontkitFont {
  fonts?: FontkitFont[]
  familyName?: string | null
  subfamilyName?: string | null
  'OS/2'?: { usWeightClass?: number }
  italicAngle?: number
  hasGlyphForCodePoint(cp: number): boolean
}

function firstFont(data: Buffer): FontkitFont | null {
  try {
    let f = fontkit.create(data) as unknown as FontkitFont
    if (f.fonts && f.fonts.length) f = f.fonts[0]
    return f
  } catch {
    return null
  }
}

// The REAL family + weight/style out of the embedded font program. PDF base names
// are frequently anonymised (CAAAAA+Calibri, CIDFont+F1), so trust the program's
// own name/OS2 tables; fall back to the base name only when the program won't parse.
function resolveFamily(embeddedData: Buffer, baseName: string): { family: string; bold: boolean; italic: boolean } {
  let family = ''
  let bold = /bold|black|heavy|semibold/i.test(baseName)
  let italic = /italic|oblique/i.test(baseName)
  const fk = embeddedData.length ? firstFont(embeddedData) : null
  if (fk) {
    family = (fk.familyName ?? '').trim()
    const sub = (fk.subfamilyName ?? '').toLowerCase()
    const weight = fk['OS/2']?.usWeightClass ?? 0
    bold = bold || /bold|black|heavy/.test(sub) || weight >= 600
    italic = italic || /italic|oblique/.test(sub) || Math.abs(fk.italicAngle ?? 0) > 4
  }
  if (!family) family = baseName.replace(/^[A-Z]{6}\+/, '').replace(/^CIDFont\+/i, '').split(/[-,]/)[0]
  return { family, bold, italic }
}

function coversAll(data: Buffer, text: string): boolean {
  const f = firstFont(data)
  if (!f) return false
  for (const ch of new Set(text)) {
    const cp = ch.codePointAt(0)!
    if (cp === 9 || cp === 10 || cp === 13) continue
    if (!f.hasGlyphForCodePoint(cp)) return false
  }
  return true
}

export interface ExtendedFont {
  ref: PDFRef
  // Hex of the 2-byte Identity-H glyph codes for `text` (no angle brackets).
  encodeHex(text: string): string
  // Advance width of `text` at `size`, in text-space units (matches Td/glyph-space math).
  widthOfText(text: string, size: number): number
}

/**
 * Build (or reuse) an installed full-font embedding that covers `neededText`,
 * matched to the embedded font's real family/weight/style. Returns null when no
 * confident, fully-covering installed font exists — the caller then throws so the
 * overlay fallback applies rather than rendering a wrong glyph.
 *
 * `cache` lets one edit reuse a single embedding across characters/runs and, more
 * importantly, guarantees we don't embed the same family twice in one save.
 */
export async function buildExtendedFont(
  doc: PDFDocument,
  embeddedData: Buffer,
  baseName: string,
  neededText: string,
  cache: Map<string, ExtendedFont | null>,
): Promise<ExtendedFont | null> {
  const meta = resolveFamily(embeddedData, baseName)
  const key = `${meta.family}|${meta.bold ? 'b' : ''}|${meta.italic ? 'i' : ''}`
  let ext = cache.get(key)
  if (ext === undefined) {
    ext = await embed(doc, meta, baseName)
    cache.set(key, ext)
  }
  if (!ext) return null
  // Coverage is validated against the resolved installed program up front so a
  // partial cover never reaches the stream. We re-check here per call because a
  // cached font from an earlier run may not cover THIS run's characters.
  if (!(ext as ExtendedFontInternal).covers(neededText)) return null
  return ext
}

interface ExtendedFontInternal extends ExtendedFont {
  covers(text: string): boolean
}

async function embed(
  doc: PDFDocument,
  meta: { family: string; bold: boolean; italic: boolean },
  baseName: string,
): Promise<ExtendedFontInternal | null> {
  const resolved = resolveSystemFont(meta.family, meta.bold, meta.italic)
    ?? resolveSystemFont(baseName, meta.bold, meta.italic)
  if (!resolved) return null
  const data = resolved.data
  doc.registerFontkit(fontkit)
  // subset:true so only the glyphs we actually encode() are written; the font is
  // finalised into a proper Type0 CIDFontType2 (FontFile2 + /W + ToUnicode +
  // Identity CIDToGIDMap) at doc.save().
  const font = await doc.embedFont(data, { subset: true }) as unknown as {
    ref: PDFRef
    encodeText(text: string): { toString(): string }
    widthOfTextAtSize(text: string, size: number): number
  }
  return {
    ref: font.ref,
    covers: (t: string) => coversAll(data, t),
    encodeHex: (t: string) => {
      const s = font.encodeText(t).toString()   // "<AABB...>"
      const inner = s.replace(/^\s*<|>\s*$/g, '')
      if (!/^[0-9A-Fa-f]*$/.test(inner) || inner.length % 4 !== 0) {
        throw new Error('extended font produced an unexpected encoding')
      }
      return inner.toUpperCase()
    },
    widthOfText: (t: string, size: number) => font.widthOfTextAtSize(t, size),
  }
}
