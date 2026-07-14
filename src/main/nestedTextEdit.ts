/**
 * Nested (Form XObject) in-place text editing.
 *
 * PDFium's FPDFPage_GenerateContent only rewrites TOP-LEVEL page content, so text
 * that design tools (Canva, InDesign, Office) wrap in a Form XObject can be READ
 * by PDFium but never SAVED in place — replaceLineAt throws and the tool drops to a
 * cover-and-replace overlay in a substitute font. This module does the write PDFium
 * can't: direct content-stream surgery on the Form XObject stream via pdf-lib, so
 * the edited word keeps the document's own embedded font byte-for-byte.
 *
 * Read path stays PDFium (hit-testing / line text). This module only needs the old
 * line text (from PDFium) and the new text; it finds the unique text block in a
 * form stream, rewrites the minimal changed glyph run, and folds the removed
 * positioning into one Td so untouched glyphs render pixel-identically.
 *
 * Conservative by contract: ANY uncertainty throws, so the caller's existing
 * substitute/overlay fallback still applies and a wrong edit is never written.
 */
import zlib from 'zlib'
import { PDFDocument, PDFName, PDFDict, PDFRawStream, PDFRef, PDFArray, PDFNumber } from 'pdf-lib'

// ── Font info ─────────────────────────────────────────────────────────────────
// All target fonts are Type0 / Identity-H / CIDFontType2: 2-byte codes where the
// code equals the CID equals the glyph id. The /ToUnicode CMap (bfchar + bfrange)
// gives code → unicode (inverting it gives unicode → code for the replacement);
// the descendant CIDFont's /W array (default /DW) gives code → glyph advance in
// 1000-unit text space, needed to shift the rest of the line by the width delta.
interface FontInfo {
  fwd: Map<number, string>
  inv: Map<string, number[]>
  widths: Map<number, number>
  dw: number
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
  return { fwd, inv, widths, dw }
}

// Read code → advance from the descendant CIDFont's /W array (and default /DW).
// /W is [ c [w1 w2 …]  cFirst cLast w  … ] — a run either lists per-glyph widths
// after a start code, or a shared width for an inclusive code range.
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

// ── Glyph model ───────────────────────────────────────────────────────────────
// One shown glyph run = a string operand rendered by Tj. In the target document
// each Tj shows exactly one 2-byte code, and a `tx ty Td` between consecutive Tj's
// carries all positioning. We record each glyph's Tj byte range, the following Td
// (end offset + tx/ty), active font, decoded unicode, and raw codes so the line
// text can be rebuilt/diffed and re-encoded. A glyph whose following op is NOT a
// plain Td has adv=null, barring it from a replaced span (only real Td advances can
// be re-folded). usesTJ marks array shows, which are never edited here.
interface Glyph {
  chars: string
  codes: number[]
  tjStart: number; tjEnd: number
  font: string
  size: number
  usesTJ: boolean
  adv: { end: number; tx: number; ty: number } | null
}
interface Block { glyphs: Glyph[]; text: string }

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

  const flush = (): void => {
    if (glyphs.length) blocks.push({ glyphs, text: glyphs.map(g => g.chars).join('') })
    glyphs = []
  }
  const resetOperands = (): void => { n1 = 0; n2 = 0; lastStr = null }

  for (let k = 0; k < toks.length; k++) {
    const t = toks[k]
    if (t.type === 'num') { n2 = n1; n1 = parseFloat(t.text); continue }
    if (t.type === 'name') { lastName = t.text; continue }
    if (t.type === 'str') { lastStr = t; continue }
    if (t.type !== 'op') continue
    const op = t.text
    if (op === 'BT') { flush(); inBT = true; resetOperands(); continue }
    if (op === 'ET') { flush(); inBT = false; resetOperands(); continue }
    if (!inBT) { resetOperands(); continue }
    if (op === 'Tf') { curFont = lastName; curSize = n1; resetOperands(); continue }
    if (op === 'Td') {
      const g = glyphs[glyphs.length - 1]
      if (g) g.adv = { end: t.end, tx: n2, ty: n1 }
      resetOperands(); continue
    }
    if (op === 'TD' || op === 'Tm' || op === 'T*') {
      const g = glyphs[glyphs.length - 1]
      if (g) g.adv = null // non-plain-Td positioning cannot be re-folded
      resetOperands(); continue
    }
    if (op === 'Tj' || op === "'" || op === '"') {
      const map = fonts.get(curFont)
      if (lastStr) {
        const d = map ? decode2(lastStr.bytes ?? '', map.fwd) : { chars: '�', codes: [] }
        glyphs.push({ chars: d.chars, codes: d.codes, tjStart: lastStr.start, tjEnd: t.end, font: curFont, size: curSize, usesTJ: false, adv: null })
      }
      resetOperands(); continue
    }
    if (op === 'TJ') {
      const g = reconstructTJ(toks, k, fonts.get(curFont), curFont, curSize)
      if (g) glyphs.push(g)
      resetOperands(); continue
    }
    resetOperands()
  }
  flush()
  return blocks
}

// Decode a TJ array into a single glyph carrying its concatenated text (for line
// matching only); usesTJ bars it from being edited (fold math assumes Tj+Td).
function reconstructTJ(toks: Tok[], opIndex: number, map: FontInfo | undefined, font: string, size: number): Glyph | null {
  let j = opIndex - 1
  while (j >= 0 && toks[j].type !== 'arr_close') j--
  if (j < 0) return null
  const close = j
  while (j >= 0 && toks[j].type !== 'arr_open') j--
  if (j < 0) return null
  const open = j
  let chars = ''
  for (let m = open + 1; m < close; m++) if (toks[m].type === 'str' && map) chars += decode2(toks[m].bytes ?? '', map.fwd).chars
  return { chars, codes: [], tjStart: toks[open].start, tjEnd: toks[opIndex].end, font, size, usesTJ: true, adv: null }
}

// ── Form traversal ────────────────────────────────────────────────────────────
interface FormStream { ref: PDFRef; stream: PDFRawStream; fonts: Map<string, FontInfo>; content: string }

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
      const fdict = fres?.lookupMaybe(PDFName.of('Font'), PDFDict)
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
      if (content) out.push({ ref, stream, fonts, content })
      visit(fres, depth + 1)
    }
  }
  visit(page.lookupMaybe(PDFName.of('Resources'), PDFDict), 0)
  return out
}

// ── Public API ────────────────────────────────────────────────────────────────
const trimEnd = (s: string): string => s.replace(/[ \t]+$/, '')

function fmtNum(v: number): string {
  if (Number.isInteger(v)) return String(v)
  return v.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

function encodeCodes(text: string, block: Block, font: FontInfo): { hex: string; codes: number[] } | null {
  // Prefer, per character, a code actually used in this block (proves the glyph is
  // present in the embedded subset); fall back to any inverse-map code.
  const used = new Map<string, number>()
  for (const g of block.glyphs) {
    if (g.usesTJ || g.chars.length !== 1 || g.codes.length !== 1) continue
    if (!used.has(g.chars)) used.set(g.chars, g.codes[0])
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

/**
 * Rewrite the visual line whose PDFium text is `oldText` to `newText`, editing the
 * Form XObject content stream directly. Returns the saved PDF bytes. Throws on any
 * condition it can't handle with certainty (unmatched/ambiguous line, TJ layout,
 * non-Td positioning, missing glyph code, multi-font edit span, non-Flate stream),
 * so the caller falls back to the overlay path and never writes a wrong edit.
 */
export async function replaceNestedLineAt(
  bytes: Buffer, pageIndex: number, oldText: string, newText: string,
): Promise<Buffer> {
  const oldT = trimEnd(oldText)
  const newT = trimEnd(newText.replace(/[\r\n]+/g, ' '))
  if (oldT === newT) return Buffer.from(bytes)
  if (oldT.trim() === '' || newT.trim() === '') throw new Error('empty source/target line')

  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const page = doc.getPage(pageIndex).node
  const forms = collectForms(page)

  const hits: Array<{ form: FormStream; block: Block }> = []
  for (const form of forms) {
    for (const block of extractBlocks(lex(form.content), form.fonts)) {
      if (trimEnd(block.text) === oldT) hits.push({ form, block })
    }
  }
  if (hits.length === 0) throw new Error('line not found in any form stream')
  if (hits.length > 1) throw new Error('ambiguous line: matches multiple form blocks')
  const { form, block } = hits[0]

  // Minimal changed character range via common prefix/suffix (mirrors replaceLineAt).
  let p = 0
  const maxP = Math.min(oldT.length, newT.length)
  while (p < maxP && oldT[p] === newT[p]) p++
  let sfx = 0
  while (sfx < maxP - p && oldT[oldT.length - 1 - sfx] === newT[newT.length - 1 - sfx]) sfx++
  const cs = p
  const ce = oldT.length - sfx
  const newMiddle = newT.slice(p, newT.length - sfx)

  // Map the character range onto glyphs, expanding to whole-glyph boundaries.
  const spans: Array<{ g: Glyph; start: number; end: number }> = []
  let acc = 0
  for (const g of block.glyphs) { spans.push({ g, start: acc, end: acc + g.chars.length }); acc += g.chars.length }

  let gStart = spans.findIndex(s => s.end > cs && s.start < Math.max(cs + 1, ce))
  if (gStart < 0) {
    gStart = spans.findIndex(s => s.end === cs)
    if (gStart < 0) gStart = spans.findIndex(s => s.start >= cs)
  }
  if (gStart < 0) throw new Error('could not map edit start to a glyph')
  let gEnd = gStart
  while (gEnd < spans.length && spans[gEnd].start < ce) gEnd++
  if (gEnd <= gStart) gEnd = gStart + 1

  const first = spans[gStart]
  const last = spans[gEnd - 1]
  const editText = oldT.slice(first.start, cs) + newMiddle + oldT.slice(ce, last.end)

  const changed = spans.slice(gStart, gEnd).map(s => s.g)
  if (changed.some(g => g.usesTJ)) throw new Error('line uses TJ arrays; cannot edit in place')
  const font = changed[0].font
  if (!font || changed.some(g => g.font !== font)) throw new Error('edit spans multiple fonts')
  const fontInfo = form.fonts.get(font)
  if (!fontInfo) throw new Error('font is not an Identity-H Type0 font')
  const fontSize = changed[0].size
  if (!(fontSize > 0)) throw new Error('missing font size for the edited run')

  const encoded = encodeCodes(editText, block, fontInfo)
  if (encoded === null) throw new Error('replacement uses characters absent from the embedded font')

  // Replace the changed glyphs (and every Td among them and the one leading to the
  // first kept glyph) with a single Tj, then a Td that advances by the NEW run's
  // width — so glyphs after the edit shift by the width delta and keep their
  // spacing (never overlapping, never leaving a spurious gap). Only horizontal
  // single-baseline layout is handled; a vertical advance in the run bails out.
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

  const foldX = runAdvance(encoded.codes, fontInfo, fontSize)
  const tj = editText ? `<${encoded.hex}> Tj` : ''
  const foldOp = followedByKeptGlyph ? `${fmtNum(foldX)} 0 Td` : ''
  const replacement = [tj, foldOp].filter(Boolean).join('\n')

  const before = form.content.slice(0, removeStart)
  const after = form.content.slice(removeEnd)
  const glue = replacement && after && !WS.has(after[0]) ? '\n' : ''
  const newContent = before + replacement + glue + after

  const deflated = zlib.deflateSync(Buffer.from(newContent, 'latin1'))
  const newStream = PDFRawStream.of(form.stream.dict, new Uint8Array(deflated))
  newStream.dict.set(PDFName.of('Length'), doc.context.obj(deflated.length))
  newStream.dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'))
  doc.context.assign(form.ref, newStream)

  return Buffer.from(await doc.save({ useObjectStreams: false }))
}
