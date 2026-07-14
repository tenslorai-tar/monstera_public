/**
 * Nested (Form XObject) in-place text editing — v2.
 *
 * PDFium's FPDFPage_GenerateContent only rewrites TOP-LEVEL page content, so text
 * that design tools (Canva, InDesign, Office/LibreOffice) wrap in a Form XObject can
 * be READ by PDFium but never SAVED in place — replaceLineAt throws and the tool
 * drops to a cover-and-replace overlay in a substitute font. This module does the
 * write PDFium can't: direct content-stream surgery on the Form XObject stream via
 * pdf-lib, so the edited word keeps the document's own embedded font byte-for-byte.
 *
 * v2 adds three capabilities over v1's "one BT…ET block whose text equals the whole
 * line":
 *   1. Segmented-line matching — a visual line PDFium reports (e.g. "Emem NDON,Msc.")
 *      is often several Tj/TJ segments, possibly across several BT…ET blocks or even
 *      separate Form XObjects (side-by-side columns PDFium merges into one line). We
 *      route the edit to the single segment/block that actually covers the changed
 *      region and leave the others untouched.
 *   2. TJ-array handling — kerned TJ arrays are decoded per glyph and rewritten with
 *      the untouched glyphs' kerning numbers preserved.
 *   3. Subset-font glyph extension — when the replacement needs a character absent
 *      from the embedded subset, embed the matching INSTALLED full font as a new
 *      resource and switch to it (Tf) for only the edited run (see subsetExtend.ts).
 *
 * Read path stays PDFium (hit-testing / line text). Conservative by contract: ANY
 * uncertainty throws, so the caller's existing overlay fallback still applies and a
 * wrong edit is never written. Every successful surgery is re-parsed before return
 * to assert the intended text is present.
 */
import zlib from 'zlib'
import { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFRef, PDFArray, PDFNumber } from 'pdf-lib'
import { buildExtendedFont, buildSubstituteFont, type ExtendedFont, type SubstituteFont } from './subsetExtend'

// ── Font info ─────────────────────────────────────────────────────────────────
// All target fonts are Type0 / Identity-H / CIDFontType2: 2-byte codes where the
// code equals the CID equals the glyph id. The /ToUnicode CMap gives code → unicode
// (inverting it gives unicode → code for the replacement); the descendant CIDFont's
// /W array (default /DW) gives code → glyph advance in 1000-unit text space.
interface FontInfo {
  fwd: Map<number, string>
  inv: Map<string, number[]>
  widths: Map<number, number>
  dw: number
  fontData: Buffer          // embedded FontFile2/FontFile3 program (for family resolution)
  baseName: string          // PostScript base name (e.g. "CAAAAA+Calibri")
}

function readFontProgram(fd: PDFDict): Buffer {
  const df = fd.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray)
  const cid = df?.lookup(0)
  if (!(cid instanceof PDFDict)) return Buffer.alloc(0)
  const desc = cid.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict)
  if (!desc) return Buffer.alloc(0)
  for (const k of ['FontFile2', 'FontFile3', 'FontFile']) {
    const ff = desc.lookup(PDFName.of(k))
    if (ff instanceof PDFRawStream) {
      try { return Buffer.from(zlib.inflateSync(Buffer.from(ff.contents))) }
      catch { try { return Buffer.from(ff.contents) } catch { return Buffer.alloc(0) } }
    }
  }
  return Buffer.alloc(0)
}

function baseNameOf(fd: PDFDict): string {
  const bf = fd.lookup(PDFName.of('BaseFont'))
  if (bf instanceof PDFName) return String(bf).replace(/^\//, '')
  return ''
}

function parseFont(fd: PDFDict): FontInfo | null {
  const tu = fd.lookup(PDFName.of('ToUnicode'))
  if (!(tu instanceof PDFRawStream)) return null
  const fwd = new Map<number, string>()
  const inv = new Map<string, number[]>()
  let s: string
  try { s = Buffer.from(zlib.inflateSync(Buffer.from(tu.contents))).toString('latin1') }
  catch { s = Buffer.from(tu.contents).toString('latin1') }
  const uni = (h: string): string => {
    let out = ''
    for (let i = 0; i + 4 <= h.length; i += 4) out += String.fromCharCode(parseInt(h.slice(i, i + 4), 16))
    return out
  }
  const add = (code: number, u: string): void => {
    fwd.set(code, u)
    const arr = inv.get(u)
    if (arr) arr.push(code); else inv.set(u, [code])
  }
  for (const blk of s.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? []) {
    for (const m of blk.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) add(parseInt(m[1], 16), uni(m[2]))
  }
  for (const blk of s.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? []) {
    for (const m of blk.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const lo = parseInt(m[1], 16), hi = parseInt(m[2], 16), base = parseInt(m[3].slice(0, 4), 16)
      if (hi < lo || hi - lo > 0xFFFF) continue
      for (let c = lo; c <= hi; c++) add(c, String.fromCharCode(base + (c - lo)))
    }
  }
  if (!fwd.size) return null
  const { widths, dw } = parseCidWidths(fd)
  return { fwd, inv, widths, dw, fontData: readFontProgram(fd), baseName: baseNameOf(fd) }
}

// Read code → advance from the descendant CIDFont's /W array (and default /DW).
function parseCidWidths(fd: PDFDict): { widths: Map<number, number>; dw: number } {
  const widths = new Map<number, number>()
  let dw = 1000
  const df = fd.lookupMaybe(PDFName.of('DescendantFonts'), PDFArray)
  const cid = df?.lookup(0)
  if (!(cid instanceof PDFDict)) return { widths, dw }
  const dwv = cid.lookup(PDFName.of('DW'))
  if (dwv instanceof PDFNumber) dw = dwv.asNumber()
  const w = cid.lookupMaybe(PDFName.of('W'), PDFArray)
  if (!w) return { widths, dw }
  const items = w.asArray()
  let i = 0
  while (i < items.length) {
    const a = items[i]
    if (!(a instanceof PDFNumber)) { i++; continue }
    const first = a.asNumber()
    const b = w.lookup(i + 1)
    if (b instanceof PDFArray) {
      const arr = b.asArray()
      for (let k = 0; k < arr.length; k++) { const wv = arr[k]; if (wv instanceof PDFNumber) widths.set(first + k, wv.asNumber()) }
      i += 2
    } else if (b instanceof PDFNumber) {
      const c = w.lookup(i + 2)
      const last = b.asNumber()
      if (c instanceof PDFNumber) { const wv = c.asNumber(); for (let code = first; code <= last && code - first <= 0xFFFF; code++) widths.set(code, wv) }
      i += 3
    } else i++
  }
  return { widths, dw }
}

function isIdentityType0(fd: PDFDict): boolean {
  if (String(fd.lookup(PDFName.of('Subtype'))) !== '/Type0') return false
  const enc = fd.lookup(PDFName.of('Encoding'))
  return enc instanceof PDFName && String(enc) === '/Identity-H'
}

// ── Content-stream lexer ──────────────────────────────────────────────────────
// Tokens over the inflated content (latin1: 1 char = 1 byte, so char indices ARE
// byte offsets — required for exact splice-back into the stream).
type TokType = 'num' | 'str' | 'name' | 'op' | 'arr_open' | 'arr_close' | 'dict_open' | 'dict_close'
interface Tok { type: TokType; start: number; end: number; text: string; bytes?: string }

const WS = new Set([' ', '\t', '\r', '\n', '\f', '\0'])
const DELIM = new Set(['(', ')', '<', '>', '[', ']', '{', '}', '/', '%'])

function unescapeLiteral(s: string): string {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '\\') { out += s[i]; continue }
    const n = s[i + 1]
    if (n === 'n') { out += '\n'; i++ }
    else if (n === 'r') { out += '\r'; i++ }
    else if (n === 't') { out += '\t'; i++ }
    else if (n === 'b') { out += '\b'; i++ }
    else if (n === 'f') { out += '\f'; i++ }
    else if (n === '(' || n === ')' || n === '\\') { out += n; i++ }
    else if (n === '\n') { i++ }
    else if (n === '\r') { i++; if (s[i + 1] === '\n') i++ }
    else if (n >= '0' && n <= '7') {
      let o = n; i++
      for (let k = 0; k < 2 && s[i + 1] >= '0' && s[i + 1] <= '7'; k++) { o += s[i + 1]; i++ }
      out += String.fromCharCode(parseInt(o, 8) & 0xFF)
    } else { out += n; i++ }
  }
  return out
}

function hexToBytes(h: string): string {
  const clean = h.replace(/[^0-9A-Fa-f]/g, '')
  const padded = clean.length % 2 ? clean + '0' : clean
  let out = ''
  for (let i = 0; i < padded.length; i += 2) out += String.fromCharCode(parseInt(padded.slice(i, i + 2), 16))
  return out
}

function lex(content: string): Tok[] {
  const toks: Tok[] = []
  let i = 0
  const n = content.length
  while (i < n) {
    const c = content[i]
    if (WS.has(c)) { i++; continue }
    if (c === '%') { while (i < n && content[i] !== '\n' && content[i] !== '\r') i++; continue }
    if (c === '(') {
      const start = i; i++
      let depth = 1
      while (i < n && depth > 0) {
        if (content[i] === '\\') { i += 2; continue }
        if (content[i] === '(') { depth++; i++; continue }
        if (content[i] === ')') { depth--; if (depth === 0) break; i++; continue }
        i++
      }
      i++ // consume ')'
      toks.push({ type: 'str', start, end: i, text: content.slice(start, i), bytes: unescapeLiteral(content.slice(start + 1, i - 1)) })
      continue
    }
    if (c === '<' && content[i + 1] === '<') { toks.push({ type: 'dict_open', start: i, end: i + 2, text: '<<' }); i += 2; continue }
    if (c === '>' && content[i + 1] === '>') { toks.push({ type: 'dict_close', start: i, end: i + 2, text: '>>' }); i += 2; continue }
    if (c === '<') {
      const start = i; i++
      while (i < n && content[i] !== '>') i++
      const inner = content.slice(start + 1, i)
      i++ // consume '>'
      toks.push({ type: 'str', start, end: i, text: content.slice(start, i), bytes: hexToBytes(inner) })
      continue
    }
    if (c === '[') { toks.push({ type: 'arr_open', start: i, end: i + 1, text: '[' }); i++; continue }
    if (c === ']') { toks.push({ type: 'arr_close', start: i, end: i + 1, text: ']' }); i++; continue }
    if (c === '/') {
      const start = i; i++
      while (i < n && !WS.has(content[i]) && !DELIM.has(content[i])) i++
      toks.push({ type: 'name', start, end: i, text: content.slice(start, i) })
      continue
    }
    const start = i
    while (i < n && !WS.has(content[i]) && !DELIM.has(content[i])) i++
    const text = content.slice(start, i)
    if (text.length === 0) { i++; continue }
    toks.push({ type: /^[-+]?(\d+\.?\d*|\.\d+)$/.test(text) ? 'num' : 'op', start, end: i, text })
  }
  return toks
}

// ── Affine matrices ─────────────────────────────────────────────────────────
// PDF row-vector convention: [a b c d e f] maps (x,y) → (a·x+c·y+e, b·x+d·y+f).
type Mat = [number, number, number, number, number, number]
const IDENT: Mat = [1, 0, 0, 1, 0, 0]
// Compose so `b` is applied first, then `a` (matches PDF: cm pre-multiplies CTM,
// and a form's /Matrix maps form space before the CTM at its Do).
function mul(a: Mat, b: Mat): Mat {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ]
}
function applyMat(m: Mat, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }
}

// ── Glyph model ───────────────────────────────────────────────────────────────
// One shown glyph run = a Tj string (possibly multiple codes) or a TJ array. For a
// plain Tj, `adv` is the following `tx ty Td` (only real Td advances can be folded).
// For TJ, tjUnits holds one entry per 2-byte code and tjKernAfter holds the kerning
// number appearing AFTER that unit, so an in-array edit can re-emit the array with
// untouched kerns preserved.
interface TJUnit { code: number; char: string }
interface Glyph {
  chars: string
  codes: number[]
  tjStart: number; tjEnd: number
  font: string
  size: number
  usesTJ: boolean
  adv: { end: number; tx: number; ty: number } | null
  tjUnits?: TJUnit[]
  tjKernAfter?: Map<number, number>
}
// originX/originY: the first glyph's baseline origin in this form's CONTENT space
// (from the text matrix in effect at that glyph). size: that glyph's font size.
// Used only for position-based duplicate-line disambiguation.
interface Block { glyphs: Glyph[]; text: string; originX: number; originY: number; size: number }

function decode2(bytes: string, fwd: Map<number, string>): { chars: string; codes: number[] } {
  let chars = ''
  const codes: number[] = []
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const code = (bytes.charCodeAt(i) << 8) | bytes.charCodeAt(i + 1)
    codes.push(code)
    chars += fwd.get(code) ?? '�'
  }
  if (bytes.length % 2 === 1) chars += '�'
  return { chars, codes }
}

function extractBlocks(toks: Tok[], fonts: Map<string, FontInfo>): Block[] {
  const blocks: Block[] = []
  let glyphs: Glyph[] = []
  let inBT = false
  let curFont = ''
  let curSize = 0
  let lastName = ''
  let n1 = 0, n2 = 0
  let lastStr: Tok | null = null
  const nums: number[] = []
  // Text matrix (tm) and text line matrix (tlm) tracked so we can capture each
  // block's first-glyph origin in form-content space for position disambiguation.
  let tm: Mat = IDENT
  let tlm: Mat = IDENT
  let leading = 0
  let haveOrigin = false
  let originX = 0, originY = 0, originSize = 0

  const flush = (): void => {
    if (glyphs.length) blocks.push({ glyphs, text: glyphs.map(g => g.chars).join(''), originX, originY, size: originSize })
    glyphs = []
    haveOrigin = false; originX = 0; originY = 0; originSize = 0
  }
  const resetOperands = (): void => { n1 = 0; n2 = 0; lastStr = null; nums.length = 0 }
  const captureOrigin = (): void => {
    if (haveOrigin) return
    originX = tm[4]; originY = tm[5]; originSize = curSize; haveOrigin = true
  }

  for (let k = 0; k < toks.length; k++) {
    const t = toks[k]
    if (t.type === 'num') { n2 = n1; n1 = parseFloat(t.text); nums.push(n1); continue }
    if (t.type === 'name') { lastName = t.text; continue }
    if (t.type === 'str') { lastStr = t; continue }
    if (t.type !== 'op') continue
    const op = t.text
    if (op === 'BT') { flush(); inBT = true; tm = IDENT; tlm = IDENT; resetOperands(); continue }
    if (op === 'ET') { flush(); inBT = false; resetOperands(); continue }
    if (!inBT) { resetOperands(); continue }
    if (op === 'Tf') { curFont = lastName; curSize = n1; resetOperands(); continue }
    if (op === 'TL') { leading = n1; resetOperands(); continue }
    if (op === 'Td') {
      const g = glyphs[glyphs.length - 1]
      if (g) g.adv = { end: t.end, tx: n2, ty: n1 }
      tlm = mul(tlm, [1, 0, 0, 1, n2, n1]); tm = tlm
      resetOperands(); continue
    }
    if (op === 'TD') {
      const g = glyphs[glyphs.length - 1]
      if (g) g.adv = null // non-plain-Td positioning cannot be re-folded
      leading = -n1
      tlm = mul(tlm, [1, 0, 0, 1, n2, n1]); tm = tlm
      resetOperands(); continue
    }
    if (op === 'Tm') {
      const g = glyphs[glyphs.length - 1]
      if (g) g.adv = null
      if (nums.length >= 6) { const m = nums.slice(-6) as Mat; tm = m; tlm = m }
      resetOperands(); continue
    }
    if (op === 'T*') {
      const g = glyphs[glyphs.length - 1]
      if (g) g.adv = null
      tlm = mul(tlm, [1, 0, 0, 1, 0, -leading]); tm = tlm
      resetOperands(); continue
    }
    if (op === 'Tj' || op === "'" || op === '"') {
      const map = fonts.get(curFont)
      if (lastStr) {
        captureOrigin()
        const d = map ? decode2(lastStr.bytes ?? '', map.fwd) : { chars: '�', codes: [] }
        glyphs.push({ chars: d.chars, codes: d.codes, tjStart: lastStr.start, tjEnd: t.end, font: curFont, size: curSize, usesTJ: false, adv: null })
      }
      resetOperands(); continue
    }
    if (op === 'TJ') {
      const g = reconstructTJ(toks, k, fonts.get(curFont), curFont, curSize)
      if (g) { captureOrigin(); glyphs.push(g) }
      resetOperands(); continue
    }
    resetOperands()
  }
  flush()
  return blocks
}

// Decode a TJ array into a single glyph carrying its per-unit codes/chars and the
// kern number after each unit, so an in-array edit can preserve untouched kerns.
function reconstructTJ(toks: Tok[], opIndex: number, map: FontInfo | undefined, font: string, size: number): Glyph | null {
  let j = opIndex - 1
  while (j >= 0 && toks[j].type !== 'arr_close') j--
  if (j < 0) return null
  const close = j
  while (j >= 0 && toks[j].type !== 'arr_open') j--
  if (j < 0) return null
  const open = j
  const units: TJUnit[] = []
  const kernAfter = new Map<number, number>()
  let chars = ''
  const codes: number[] = []
  for (let m = open + 1; m < close; m++) {
    const tk = toks[m]
    if (tk.type === 'str' && map) {
      const d = decode2(tk.bytes ?? '', map.fwd)
      for (let u = 0; u < d.codes.length; u++) {
        units.push({ code: d.codes[u], char: d.chars[u] ?? '�' })
        codes.push(d.codes[u])
      }
      chars += d.chars
    } else if (tk.type === 'num') {
      if (units.length) kernAfter.set(units.length - 1, parseFloat(tk.text))
    }
  }
  return {
    chars, codes, tjStart: toks[open].start, tjEnd: toks[opIndex].end,
    font, size, usesTJ: true, adv: null, tjUnits: units, tjKernAfter: kernAfter,
  }
}

// ── Form traversal ────────────────────────────────────────────────────────────
interface FormStream {
  ref: PDFRef
  stream: PDFRawStream
  fonts: Map<string, FontInfo>
  content: string
  fontDict: PDFDict | null      // the form's Resources/Font dict, for adding an extended font
  placements: Mat[]             // form-content → page-space matrices (one per Do that draws it)
}

function inflateStream(stream: PDFRawStream): Uint8Array {
  const filter = stream.dict.lookup(PDFName.of('Filter'))
  if (filter instanceof PDFArray) {
    if (filter.size() !== 1 || filter.get(0)?.toString() !== '/FlateDecode') throw new Error('unsupported filter chain')
  } else if (filter?.toString() !== '/FlateDecode') {
    throw new Error('unsupported filter')
  }
  return zlib.inflateSync(Buffer.from(stream.contents))
}

function collectForms(page: PDFDict): FormStream[] {
  const out: FormStream[] = []
  const seen = new Set<PDFRef>()
  const visit = (resources: PDFDict | undefined, depth: number): void => {
    if (!resources || depth > 12) return
    const xobjs = resources.lookupMaybe(PDFName.of('XObject'), PDFDict)
    if (!xobjs) return
    for (const key of xobjs.keys()) {
      const ref = xobjs.get(key)
      if (!(ref instanceof PDFRef) || seen.has(ref)) continue
      const stream = xobjs.lookup(key)
      if (!(stream instanceof PDFRawStream)) continue
      if (String(stream.dict.lookup(PDFName.of('Subtype'))) !== '/Form') continue
      seen.add(ref)
      const fres = stream.dict.lookupMaybe(PDFName.of('Resources'), PDFDict)
      const fonts = new Map<string, FontInfo>()
      const fdict = fres?.lookupMaybe(PDFName.of('Font'), PDFDict) ?? null
      if (fdict) {
        for (const fk of fdict.keys()) {
          const fd = fdict.lookupMaybe(fk, PDFDict)
          if (fd && isIdentityType0(fd)) {
            const info = parseFont(fd)
            if (info) fonts.set(fk.toString(), info)
          }
        }
      }
      let content = ''
      try { content = Buffer.from(inflateStream(stream)).toString('latin1') } catch { content = '' }
      if (content) out.push({ ref, stream, fonts, content, fontDict: fdict, placements: [] })
      visit(fres, depth + 1)
    }
  }
  visit(page.lookupMaybe(PDFName.of('Resources'), PDFDict), 0)
  return out
}

// Read the /Matrix of a form XObject stream (defaults to identity).
function formMatrix(stream: PDFRawStream): Mat {
  const m = stream.dict.lookupMaybe(PDFName.of('Matrix'), PDFArray)
  if (!m || m.size() < 6) return IDENT
  const v: number[] = []
  for (let i = 0; i < 6; i++) { const n = m.get(i); v.push(n instanceof PDFNumber ? n.asNumber() : (i === 0 || i === 3 ? 1 : 0)) }
  return v as Mat
}

// Concatenate a page's content stream bytes (Contents may be a single stream or an array).
function pageContent(page: PDFDict): string {
  const c = page.lookup(PDFName.of('Contents'))
  const streams: PDFRawStream[] = []
  if (c instanceof PDFRawStream) streams.push(c)
  else if (c instanceof PDFArray) for (let i = 0; i < c.size(); i++) { const s = c.lookup(i); if (s instanceof PDFRawStream) streams.push(s) }
  let out = ''
  for (const s of streams) {
    try { out += Buffer.from(inflateStream(s)).toString('latin1') + '\n' }
    catch { try { out += Buffer.from(s.contents).toString('latin1') + '\n' } catch { /* skip */ } }
  }
  return out
}

// Walk page (and nested form) content streams tracking the CTM (q/Q/cm) so every
// `Do` that draws a Form XObject records the form-content → page-space matrix.
// A form drawn by several `Do`s (or inside a form itself drawn several times)
// accumulates several placements; a form with ≠1 placement can't have one instance
// edited in isolation, so callers treat that as ambiguous.
function collectPlacements(page: PDFDict): Map<PDFRef, Mat[]> {
  const out = new Map<PDFRef, Mat[]>()
  const add = (ref: PDFRef, m: Mat): void => { const a = out.get(ref); if (a) a.push(m); else out.set(ref, [m]) }
  const visit = (content: string, resources: PDFDict | undefined, ctm: Mat, depth: number, path: Set<PDFRef>): void => {
    if (!resources || depth > 12) return
    const xobjs = resources.lookupMaybe(PDFName.of('XObject'), PDFDict)
    if (!xobjs) return
    const toks = lex(content)
    const stack: Mat[] = []
    let cur = ctm
    let lastName = ''
    const nums: number[] = []
    for (const t of toks) {
      if (t.type === 'num') { nums.push(parseFloat(t.text)); continue }
      if (t.type === 'name') { lastName = t.text; continue }
      if (t.type !== 'op') { if (t.type === 'arr_open' || t.type === 'arr_close' || t.type === 'str') nums.length = 0; continue }
      const op = t.text
      if (op === 'q') stack.push(cur)
      else if (op === 'Q') { const p = stack.pop(); if (p) cur = p }
      else if (op === 'cm') { if (nums.length >= 6) cur = mul(cur, nums.slice(-6) as Mat) }
      else if (op === 'Do') {
        const key = lastName.replace(/^\//, '')
        const ref = xobjs.get(PDFName.of(key))
        const st = xobjs.lookup(PDFName.of(key))
        if (ref instanceof PDFRef && st instanceof PDFRawStream && String(st.dict.lookup(PDFName.of('Subtype'))) === '/Form' && !path.has(ref)) {
          const placement = mul(cur, formMatrix(st))
          add(ref, placement)
          const fres = st.dict.lookupMaybe(PDFName.of('Resources'), PDFDict)
          let inner = ''
          try { inner = Buffer.from(inflateStream(st)).toString('latin1') } catch { inner = '' }
          if (inner) visit(inner, fres, placement, depth + 1, new Set([...path, ref]))
        }
      }
      nums.length = 0
      lastName = ''
    }
  }
  visit(pageContent(page), page.lookupMaybe(PDFName.of('Resources'), PDFDict), IDENT, 0, new Set())
  return out
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const trimEnd = (s: string): string => s.replace(/[ \t]+$/, '')

function fmtNum(v: number): string {
  if (Number.isInteger(v)) return String(v)
  return v.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

// Encode `text` to the block's own Identity-H codes. Prefer, per character, a code
// actually used in this block (proves the glyph is present in the embedded subset);
// fall back to any inverse-map code. Returns null if ANY character is absent from
// the embedded font — the caller then tries subset extension.
function encodeCodes(text: string, block: Block, font: FontInfo): { hex: string; codes: number[] } | null {
  const used = new Map<string, number>()
  for (const g of block.glyphs) {
    if (g.usesTJ) {
      for (const u of g.tjUnits ?? []) if (u.char.length === 1 && !used.has(u.char)) used.set(u.char, u.code)
      continue
    }
    // map each character of a multi-code Tj to its code
    if (g.codes.length === g.chars.length) {
      for (let i = 0; i < g.chars.length; i++) if (!used.has(g.chars[i])) used.set(g.chars[i], g.codes[i])
    }
  }
  let hex = ''
  const codes: number[] = []
  for (const ch of text) {
    let code = used.get(ch)
    if (code === undefined) {
      const opts = font.inv.get(ch)
      if (!opts || opts.length === 0) return null
      code = opts.find(c => font.fwd.get(c) === ch) ?? opts[0]
    }
    if (code < 0 || code > 0xFFFF) return null
    codes.push(code)
    hex += code.toString(16).toUpperCase().padStart(4, '0')
  }
  return { hex, codes }
}

// Advance width of a glyph run in text space (Td units), from the CID /W widths.
function runAdvance(codes: number[], font: FontInfo, fontSize: number): number {
  let w = 0
  for (const c of codes) w += (font.widths.get(c) ?? font.dw) / 1000 * fontSize
  return w
}

export type NestedOutcome = 'in-place-form' | 'in-place-extended' | 'in-place-substituted'
export interface NestedResult { bytes: Buffer; outcome: NestedOutcome; substituteFamily?: string }

// Result of routing an edit to one covering block.
interface Target { form: FormStream; block: Block; localCs: number; localCe: number }

// Find every occurrence of `needle` in `hay` (may overlap-free is fine; needles
// here are whole segments so occurrences don't overlap themselves).
function occurrences(hay: string, needle: string): number[] {
  const out: number[] = []
  if (!needle) return out
  let from = 0
  for (;;) {
    const idx = hay.indexOf(needle, from)
    if (idx < 0) break
    out.push(idx)
    from = idx + 1
  }
  return out
}

// The clicked line's bounding box in PDF PAGE space (y-up), from PDFium's getLineAt.
// Used only to disambiguate byte-identical duplicate lines by position.
export interface LineBBox { x1: number; y1: number; x2: number; y2: number }

// Distance of scalar v from the closed interval [lo,hi] (0 inside).
function distToInterval(v: number, lo: number, hi: number): number {
  if (v < lo) return lo - v
  if (v > hi) return v - hi
  return 0
}

/**
 * Route the change region [cs,ce) of the visual line `oldT` to the single block
 * that covers it. The visual line PDFium reports may be several blocks (segments)
 * concatenated — possibly with single spaces PDFium inserts between side-by-side
 * columns — so we find the block whose text sits at an oldT offset range fully
 * containing [cs,ce). Throws (→ overlay fallback) when the edit spans a block
 * boundary.
 *
 * Duplicate handling: when the covering block's text is NOT unique in the document,
 * two lines could be rewritten. If the caller passed the clicked line's page-space
 * bbox, the duplicate whose form-content origin (mapped to page space via its Form
 * XObject placement CTM) sits inside/nearest that bbox — by a clear margin — wins.
 * Without a bbox (or without a clear winner) it still throws, so a duplicate line is
 * never silently edited.
 */
function routeEdit(forms: FormStream[], oldT: string, cs: number, ce: number, bbox?: LineBBox): Target {
  const all: Array<{ form: FormStream; block: Block }> = []
  for (const form of forms) {
    for (const block of extractBlocks(lex(form.content), form.fonts)) {
      if (block.text.trim() !== '') all.push({ form, block })
    }
  }
  interface Cand { form: FormStream; block: Block; bs: number; be: number }
  const cands: Cand[] = []
  for (const { form, block } of all) {
    const bt = trimEnd(block.text)
    for (const bs of occurrences(oldT, bt)) {
      const be = bs + bt.length
      if (bs <= cs && ce <= be) cands.push({ form, block, bs, be })
    }
  }
  if (cands.length === 0) throw new Error('no form block covers the edited region (edit may span a segment boundary)')

  // Prefer a block equal to the whole line; else the smallest covering block.
  cands.sort((a, b) => (b.be - b.bs) - (a.be - a.bs))
  const whole = cands.find(c => trimEnd(c.block.text) === trimEnd(oldT))
  const chosen = whole ?? cands[cands.length - 1]

  if (!whole) {
    const minLen = chosen.be - chosen.bs
    const tied = cands.filter(c => (c.be - c.bs) === minLen)
    if (tied.length > 1 && !bbox) throw new Error('ambiguous: multiple blocks cover the edited region')
  }
  const chosenText = trimEnd(chosen.block.text)
  const dupCount = all.filter(x => trimEnd(x.block.text) === chosenText).length

  if (dupCount > 1) {
    // Byte-identical duplicate line(s) exist. Position-disambiguate among the
    // covering candidates that share the chosen text, using the passed bbox.
    if (!bbox) throw new Error('ambiguous: the edited segment text is not unique in the document')
    const group = cands.filter(c => trimEnd(c.block.text) === chosenText)
    const scored = group
      .map(c => {
        // Only a form drawn by exactly one Do can have this instance edited in
        // isolation; a form drawn several times shares one stream across copies.
        if (c.form.placements.length !== 1) return null
        const p = applyMat(c.form.placements[0], c.block.originX, c.block.originY)
        const vy = distToInterval(p.y, bbox.y1, bbox.y2)
        const vx = distToInterval(p.x, bbox.x1, bbox.x2)
        return { c, vy, vx }
      })
      .filter((x): x is { c: Cand; vy: number; vx: number } => x !== null)
    if (scored.length === 0) throw new Error('ambiguous duplicate line: no isolable placement to match against the clicked position')
    // Vertical position dominates (lines stack vertically); horizontal breaks ties
    // for side-by-side duplicates.
    scored.sort((a, b) => (a.vy - b.vy) || (a.vx - b.vx))
    const win = scored[0]
    const lineH = Math.max(bbox.y2 - bbox.y1, chosen.block.size || 0, 1)
    const lineW = Math.max(bbox.x2 - bbox.x1, 1)
    if (win.vy > lineH + 4 || win.vx > lineW + 8) {
      throw new Error('ambiguous duplicate line: best candidate is not near the clicked position')
    }
    if (scored.length > 1) {
      const next = scored[1]
      const vyMargin = Math.max(lineH * 0.5, 3)
      const vxMargin = Math.max(lineW * 0.3, 3)
      const clearOnY = next.vy - win.vy >= vyMargin
      const clearOnX = Math.abs(next.vy - win.vy) < 1 && next.vx - win.vx >= vxMargin
      if (!clearOnY && !clearOnX) {
        throw new Error('ambiguous duplicate line: no clear positional winner near the clicked position')
      }
    }
    return { form: win.c.form, block: win.c.block, localCs: cs - win.c.bs, localCe: ce - win.c.bs }
  }

  return { form: chosen.form, block: chosen.block, localCs: cs - chosen.bs, localCe: ce - chosen.bs }
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Rewrite the visual line whose PDFium text is `oldText` to `newText`, editing the
 * Form XObject content stream directly. Returns the saved PDF bytes plus which path
 * was taken. Throws on any condition it can't handle with certainty, so the caller
 * falls back to the overlay path and never writes a wrong edit.
 */
export async function replaceNestedLineAt(
  bytes: Buffer, pageIndex: number, oldText: string, newText: string, bbox?: LineBBox,
): Promise<Buffer> {
  return (await replaceNestedLineAtEx(bytes, pageIndex, oldText, newText, bbox)).bytes
}

export async function replaceNestedLineAtEx(
  bytes: Buffer, pageIndex: number, oldText: string, newText: string, bbox?: LineBBox,
): Promise<NestedResult> {
  const oldT = trimEnd(oldText)
  const newT = trimEnd(newText.replace(/[\r\n]+/g, ' '))
  if (oldT === newT) return { bytes: Buffer.from(bytes), outcome: 'in-place-form' }
  if (oldT.trim() === '' || newT.trim() === '') throw new Error('empty source/target line')

  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const page = doc.getPage(pageIndex).node
  const forms = collectForms(page)
  const placements = collectPlacements(page)
  for (const form of forms) form.placements = placements.get(form.ref) ?? []

  // Minimal changed character range via common prefix/suffix (mirrors replaceLineAt).
  let p = 0
  const maxP = Math.min(oldT.length, newT.length)
  while (p < maxP && oldT[p] === newT[p]) p++
  let sfx = 0
  while (sfx < maxP - p && oldT[oldT.length - 1 - sfx] === newT[newT.length - 1 - sfx]) sfx++
  const cs = p
  const ce = oldT.length - sfx
  const newMiddle = newT.slice(p, newT.length - sfx)

  const target = routeEdit(forms, oldT, cs, ce, bbox)
  const extCache = new Map<string, ExtendedFont | null>()
  const subCache = new Map<string, SubstituteFont | null>()
  const edit = await buildBlockEdit(doc, target, newMiddle, extCache, subCache)

  const before = target.form.content.slice(0, edit.removeStart)
  const after = target.form.content.slice(edit.removeEnd)
  const glue = edit.replacement && after && !WS.has(after[0]) ? '\n' : ''
  const newContent = before + edit.replacement + glue + after

  const deflated = zlib.deflateSync(Buffer.from(newContent, 'latin1'))
  const newStream = PDFRawStream.of(target.form.stream.dict, new Uint8Array(deflated))
  newStream.dict.set(PDFName.of('Length'), doc.context.obj(deflated.length))
  newStream.dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'))
  doc.context.assign(target.form.ref, newStream)

  const outBytes = Buffer.from(await doc.save({ useObjectStreams: false }))

  // Self-verification: re-parse the saved bytes and confirm some block on the page
  // now decodes to the intended block text. A stream we can't prove correct must not
  // be returned (the caller's overlay fallback is safer than a corrupt write). For an
  // extended-font run the new glyphs come from a DIFFERENT font resource (not this
  // form's subset), so the re-decode can't read them back — skip the text assertion
  // in that case and only require the stream to re-parse cleanly.
  await verifyEdit(outBytes, pageIndex, edit.expectBlockText, edit.outcome)

  return { bytes: outBytes, outcome: edit.outcome, substituteFamily: edit.substituteFamily }
}

interface BlockEdit { removeStart: number; removeEnd: number; replacement: string; outcome: NestedOutcome; expectBlockText: string; substituteFamily?: string }

async function buildBlockEdit(
  doc: PDFDocument, target: Target, newMiddle: string,
  extCache: Map<string, ExtendedFont | null>, subCache: Map<string, SubstituteFont | null>,
): Promise<BlockEdit> {
  const { form, block, localCs, localCe } = target
  const blockText = block.text
  const expectBlockText = blockText.slice(0, localCs) + newMiddle + blockText.slice(localCe)

  // Map the local char range onto glyphs, expanding to whole-glyph boundaries.
  const spans: Array<{ g: Glyph; start: number; end: number }> = []
  let acc = 0
  for (const g of block.glyphs) { spans.push({ g, start: acc, end: acc + g.chars.length }); acc += g.chars.length }

  let gStart = spans.findIndex(s => s.end > localCs && s.start < Math.max(localCs + 1, localCe))
  if (gStart < 0) {
    gStart = spans.findIndex(s => s.end === localCs)
    if (gStart < 0) gStart = spans.findIndex(s => s.start >= localCs)
  }
  if (gStart < 0) throw new Error('could not map edit start to a glyph')
  let gEnd = gStart
  while (gEnd < spans.length && spans[gEnd].start < localCe) gEnd++
  if (gEnd <= gStart) gEnd = gStart + 1

  const changed = spans.slice(gStart, gEnd)
  const font = changed[0].g.font
  if (changed.some(s => s.g.font !== font)) throw new Error('edit spans multiple fonts')
  const fontInfo = form.fonts.get(font)
  if (!fontInfo) throw new Error('font is not an Identity-H Type0 font')
  const fontSize = changed[0].g.size
  if (!(fontSize > 0)) throw new Error('missing font size for the edited run')

  // TJ path: only when the whole change is inside a single TJ operator.
  if (changed.some(s => s.g.usesTJ)) {
    if (changed.length !== 1 || !changed[0].g.usesTJ) throw new Error('edit spans a TJ array and other runs; cannot edit in place')
    return buildTJEdit(changed[0], localCs, localCe, newMiddle, block, fontInfo, expectBlockText)
  }

  // Plain Tj path (v1 behaviour, extended with subset-font fallback).
  const first = spans[gStart]
  const last = spans[gEnd - 1]
  const editText = blockText.slice(first.start, localCs) + newMiddle + blockText.slice(localCe, last.end)

  const followedByKeptGlyph = gEnd < spans.length
  const removeStart = first.g.tjStart
  for (let gi = gStart; gi < gEnd - 1; gi++) {
    const adv = spans[gi].g.adv
    if (!adv) throw new Error('non-Td gap inside the edited run')
    if (Math.abs(adv.ty) > 0.001) throw new Error('vertical text layout not supported')
  }
  const exitAdv = last.g.adv
  let removeEnd: number
  if (followedByKeptGlyph) {
    if (!exitAdv) throw new Error('missing Td before the next glyph')
    if (Math.abs(exitAdv.ty) > 0.001) throw new Error('vertical text layout not supported')
    removeEnd = exitAdv.end
  } else {
    removeEnd = exitAdv ? exitAdv.end : last.g.tjEnd
  }

  const oldCodes = changed.flatMap(s => s.g.codes)

  const enc = encodeCodes(editText, block, fontInfo)
  if (enc !== null) {
    const foldX = runAdvance(enc.codes, fontInfo, fontSize)
    const tj = editText ? `<${enc.hex}> Tj` : ''
    const foldOp = followedByKeptGlyph ? `${fmtNum(foldX)} 0 Td` : ''
    const replacement = [tj, foldOp].filter(Boolean).join('\n')
    return { removeStart, removeEnd, replacement, outcome: 'in-place-form', expectBlockText }
  }

  // Tier 1 — subset-font glyph EXTENSION: the embedded font's own family IS
  // installed, so embed that installed cut and render ONLY this run through it. The
  // edited run is visually the same typeface as the rest of the line.
  let ext: ExtendedFont | null = await buildExtendedFont(doc, fontInfo.fontData, fontInfo.baseName, editText, extCache)
  let outcome: NestedOutcome = 'in-place-extended'
  let substituteFamily: string | undefined

  // Tier 2 — closest metric-compatible SUBSTITUTE (XChange-style): the family is not
  // installed, so pick the nearest installed font of the same serif class + style
  // that fully covers the new glyphs. Visually differs but stays class/style-
  // consistent, and the caller toasts it explicitly (never silent).
  if (!ext) {
    const sub = await buildSubstituteFont(doc, fontInfo.fontData, fontInfo.baseName, editText, subCache)
    if (!sub) throw new Error('replacement uses characters absent from the embedded font and no confident matching installed font covers them')
    ext = sub.font
    outcome = 'in-place-substituted'
    substituteFamily = sub.family
  }

  const extKey = ensureExtendedFontKey(doc, form, ext.ref)
  const newHex = ext.encodeHex(editText)
  const oldWidth = runAdvance(oldCodes, fontInfo, fontSize)
  const newWidth = ext.widthOfText(editText, fontSize)
  const delta = newWidth - oldWidth
  // Restore the original font resource after the run so following glyphs (if any)
  // keep rendering in the document's own subset font.
  const restore = `/${font} ${fmtNum(fontSize)} Tf`
  const tj = `/${extKey} ${fmtNum(fontSize)} Tf\n<${newHex}> Tj\n${restore}`
  // When kept glyphs follow, keep their ORIGINAL inter-glyph Td but insert a fold so
  // the tail shifts by exactly the width delta of the changed run.
  const foldOp = followedByKeptGlyph ? `${fmtNum(oldWidth + delta)} 0 Td` : ''
  const replacement = [tj, foldOp].filter(Boolean).join('\n')
  return { removeStart, removeEnd, replacement, outcome, expectBlockText, substituteFamily }
}

// Rewrite a single TJ operator, preserving untouched glyphs' kerning numbers.
function buildTJEdit(
  span: { g: Glyph; start: number; end: number }, localCs: number, localCe: number,
  newMiddle: string, block: Block, fontInfo: FontInfo, expectBlockText: string,
): BlockEdit {
  const g = span.g
  const units = g.tjUnits ?? []
  const kernAfter = g.tjKernAfter ?? new Map<number, number>()
  // Char offsets are unit indices only when every unit maps to exactly one char.
  if (units.some(u => u.char.length !== 1)) throw new Error('TJ contains multi-char (ligature) units; cannot edit in place')
  const a = localCs - span.start
  const b = localCe - span.start
  if (a < 0 || b > units.length || a > b) throw new Error('TJ edit range out of bounds')

  const encMiddle = newMiddle ? encodeCodes(newMiddle, block, fontInfo) : { hex: '', codes: [] }
  if (encMiddle === null) throw new Error('TJ replacement uses characters absent from the embedded font')

  type Elem = { s: true; hex: string } | { s: false; num: number }
  const elems: Elem[] = []
  let acc = ''
  const flush = (): void => { if (acc) { elems.push({ s: true, hex: acc }); acc = '' } }
  const hexOf = (code: number): string => code.toString(16).toUpperCase().padStart(4, '0')

  for (let i = 0; i < a; i++) {
    acc += hexOf(units[i].code)
    if (i < a - 1 && kernAfter.has(i)) { flush(); elems.push({ s: false, num: kernAfter.get(i)! }) }
  }
  flush()
  if (encMiddle.hex) elems.push({ s: true, hex: encMiddle.hex })
  for (let i = b; i < units.length; i++) {
    acc += hexOf(units[i].code)
    if (i < units.length - 1 && kernAfter.has(i)) { flush(); elems.push({ s: false, num: kernAfter.get(i)! }) }
  }
  flush()

  const arr = elems.map(e => (e.s ? `<${e.hex}>` : ` ${fmtNum(e.num)} `)).join('')
  const replacement = `[${arr}] TJ`
  return { removeStart: g.tjStart, removeEnd: g.tjEnd, replacement, outcome: 'in-place-form', expectBlockText }
}

// Add `ref` to the form's Resources/Font dict under a fresh key and return it.
// Reuses an existing key that already points at this ref (idempotent within a save).
function ensureExtendedFontKey(doc: PDFDocument, form: FormStream, ref: PDFRef): string {
  let dict = form.fontDict
  if (!dict) {
    // No Font resource dict on this form — create one on its Resources.
    const res = form.stream.dict.lookupMaybe(PDFName.of('Resources'), PDFDict)
    if (!res) throw new Error('form has no Resources dict for an extended font')
    dict = doc.context.obj({}) as PDFDict
    res.set(PDFName.of('Font'), dict)
    form.fontDict = dict
  }
  for (const k of dict.keys()) {
    if (dict.get(k) === ref) return k.toString().replace(/^\//, '')
  }
  let i = 0
  let key = `MEx${i}`
  const has = (name: string): boolean => dict!.keys().some(k => k.toString() === `/${name}`)
  while (has(key)) { i++; key = `MEx${i}` }
  dict.set(PDFName.of(key), ref)
  return key
}

// Re-open the saved bytes and assert some block on the page decodes to the intended
// block text. Guards against a splice that silently produced the wrong glyphs. For
// extended-font edits the new glyphs live in a separate font resource this decoder
// doesn't map, so we only require a clean re-parse (no text assertion).
async function verifyEdit(outBytes: Buffer, pageIndex: number, expectBlockText: string, outcome: NestedOutcome): Promise<void> {
  const marker = trimEnd(expectBlockText).replace(/\s+/g, ' ').trim()
  let forms: FormStream[]
  try {
    const doc = await PDFDocument.load(outBytes, { updateMetadata: false })
    forms = collectForms(doc.getPage(pageIndex).node)
  } catch (e) {
    throw new Error('post-edit verification failed: saved PDF did not re-parse (' + (e as Error).message + ')')
  }
  if (outcome === 'in-place-extended' || outcome === 'in-place-substituted' || !marker) return
  for (const form of forms) {
    for (const block of extractBlocks(lex(form.content), form.fonts)) {
      if (block.text.replace(/\s+/g, ' ').includes(marker)) return
    }
  }
  throw new Error('post-edit verification failed: edited text not found in any re-parsed form block')
}
