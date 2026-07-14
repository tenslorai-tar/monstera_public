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
import { readFileSync } from 'fs'
import type { PDFDocument, PDFRef } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { resolveSystemFont, pickSubstituteFontPath, classifySerif, type SubstituteQuery } from './systemFonts'

interface FontkitFont {
  fonts?: FontkitFont[]
  familyName?: string | null
  subfamilyName?: string | null
  fullName?: string | null
  unitsPerEm?: number
  capHeight?: number
  xHeight?: number
  'OS/2'?: { usWeightClass?: number; sFamilyClass?: number; panose?: number[] | Uint8Array; xAvgCharWidth?: number; fsSelection?: number }
  post?: { isFixedPitch?: number | boolean }
  head?: { macStyle?: number }
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
  return embedBytes(doc, resolved.data)
}

// Embed arbitrary installed-font bytes as a Type0/CIDFontType2 subset and expose the
// glyph-encoding + width helpers the stream surgery needs.
async function embedBytes(doc: PDFDocument, data: Buffer): Promise<ExtendedFontInternal> {
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

/**
 * Resolve the closest metric-compatible installed substitute font BYTES for an
 * embedded program whose family isn't installed — used by the top-level (non-nested)
 * line editor to supplement its name-based lookup. Returns null when the serif class
 * is unknown or nothing of the right class covers `neededText`.
 */
export function resolveSubstituteBytes(
  embeddedData: Buffer, baseName: string, neededText: string,
): { data: Buffer; family: string } | null {
  const prof = resolveEmbeddedProfile(embeddedData, baseName)
  if (!prof.serifKnown) return null
  const q: SubstituteQuery = {
    serif: prof.serif, bold: prof.bold, italic: prof.italic, weight: prof.weight,
    avgWidth: prof.avgWidth, xHeight: prof.xHeight, capHeight: prof.capHeight, fixedPitch: prof.fixedPitch,
  }
  const pick = pickSubstituteFontPath(q, (data) => coversAll(data, neededText))
  if (!pick) return null
  try { return { data: readFileSync(pick.path), family: pick.family } } catch { return null }
}

// ── Tier 2: closest metric-compatible substitute (family not installed) ────────
export interface SubstituteFont { font: ExtendedFont; family: string }
interface SubstituteFontInternal extends SubstituteFont { covers(text: string): boolean }

// Full metric/class profile of the embedded font program, for scoring a substitute.
// serifKnown=false when the program won't parse — we then refuse to substitute
// (a wrong-class glyph must never be rendered silently).
interface EmbeddedProfile extends SubstituteQuery { family: string; serifKnown: boolean }

function resolveEmbeddedProfile(embeddedData: Buffer, baseName: string): EmbeddedProfile {
  const base = resolveFamily(embeddedData, baseName)
  const prof: EmbeddedProfile = {
    family: base.family, bold: base.bold, italic: base.italic, serif: false, serifKnown: false,
    weight: base.bold ? 700 : 400, avgWidth: 0, xHeight: 0, capHeight: 0, fixedPitch: false,
  }
  const fk = embeddedData.length ? (firstFont(embeddedData) as FontkitFont | null) : null
  if (fk) {
    const upm = fk.unitsPerEm && fk.unitsPerEm > 0 ? fk.unitsPerEm : 1000
    const os2 = fk['OS/2'] ?? {}
    prof.weight = os2.usWeightClass ?? prof.weight
    prof.avgWidth = os2.xAvgCharWidth && os2.xAvgCharWidth > 0 ? os2.xAvgCharWidth / upm : 0
    prof.xHeight = fk.xHeight && fk.xHeight > 0 ? fk.xHeight / upm : 0
    prof.capHeight = fk.capHeight && fk.capHeight > 0 ? fk.capHeight / upm : 0
    prof.fixedPitch = !!(fk.post?.isFixedPitch)
    // Serif class is only "known" when OS/2 or PANOSE actually carry the signal.
    const hasSignal = (typeof os2.sFamilyClass === 'number' && ((os2.sFamilyClass >> 8) & 0xff) > 0)
      || (!!os2.panose && (os2.panose as number[]).length >= 2 && (os2.panose as number[])[0] === 2)
      || /sans|serif|times|georgia|garamond|roman|cambria|constantia|palatino/i.test(prof.family)
    prof.serif = classifySerif(os2.sFamilyClass, os2.panose, prof.family)
    prof.serifKnown = hasSignal
  }
  return prof
}

/**
 * Build (or reuse) an installed SUBSTITUTE font of the same serif class + style that
 * fully covers `neededText`, when the embedded font's own family is NOT installed.
 * Returns null when the class is unknown or nothing confident covers the glyphs.
 */
export async function buildSubstituteFont(
  doc: PDFDocument,
  embeddedData: Buffer,
  baseName: string,
  neededText: string,
  cache: Map<string, SubstituteFont | null>,
): Promise<SubstituteFont | null> {
  const prof = resolveEmbeddedProfile(embeddedData, baseName)
  if (!prof.serifKnown) return null
  const key = `${prof.serif ? 's' : 'x'}|${prof.bold ? 'b' : ''}|${prof.italic ? 'i' : ''}`
  const cached = cache.get(key) as SubstituteFontInternal | null | undefined
  if (cached !== undefined && cached !== null && cached.covers(neededText)) return cached

  const q: SubstituteQuery = {
    serif: prof.serif, bold: prof.bold, italic: prof.italic, weight: prof.weight,
    avgWidth: prof.avgWidth, xHeight: prof.xHeight, capHeight: prof.capHeight, fixedPitch: prof.fixedPitch,
  }
  const pick = pickSubstituteFontPath(q, (data) => coversAll(data, neededText))
  if (!pick) { cache.set(key, null); return null }
  let data: Buffer
  try { data = readFileSync(pick.path) } catch { cache.set(key, null); return null }
  const font = await embedBytes(doc, data)
  const result: SubstituteFontInternal = { font, family: pick.family, covers: (t) => coversAll(data, t) }
  cache.set(key, result)
  return result
}
