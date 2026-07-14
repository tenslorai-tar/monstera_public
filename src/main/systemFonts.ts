/**
 * System-font substitution for the Edit Text cover-and-replace path.
 *
 * When text is nested in a form group, PDFium can't save an in-place edit, so the
 * tool covers the original and redraws the new text. The document's embedded font
 * is usually a SUBSET (only the glyphs originally used), which can't render newly
 * typed characters — so we substitute the closest INSTALLED font, matched by name
 * and style. That font is real and complete, so it renders on screen (by family
 * name) and embeds cleanly into the saved PDF (by file bytes).
 */
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import fontkit from '@pdf-lib/fontkit'

// Installed-font index: lowercased display name (without the "(TrueType)" suffix) → file path.
let index: Map<string, string> | null = null

function buildIndex(): Map<string, string> {
  const map = new Map<string, string>()
  if (process.platform !== 'win32') return map
  const fontsDir = path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts')
  for (const hive of ['HKLM', 'HKCU']) {
    try {
      const out = execFileSync('reg',
        ['query', `${hive}\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Fonts`],
        { encoding: 'utf8', windowsHide: true })
      for (const line of out.split(/\r?\n/)) {
        // e.g. "    Arial Narrow Bold (TrueType)    REG_SZ    ARIALNB.TTF"
        const m = line.match(/^\s+(.+?)\s+\((?:TrueType|OpenType)\)\s+REG_SZ\s+(.+?)\s*$/)
        if (!m) continue
        let file = m[2].trim()
        if (!path.isAbsolute(file)) file = path.join(fontsDir, file)
        try { if (fs.existsSync(file)) map.set(m[1].trim().toLowerCase(), file) } catch { /* skip */ }
      }
    } catch { /* hive missing or reg unavailable */ }
  }
  return map
}

// Strip a PDF subset prefix ("BCDLEE+"), the ",Style" tail, and bold/italic/foundry
// tokens (in any order) from a PostScript base name → a plain family name. Keeps
// width words like "Narrow"/"Condensed". "Aptos Narrow,Bold" → "Aptos Narrow";
// "Arial-BoldMT" → "Arial". The narrow/style detection works off the full name.
function familyOf(baseName: string): string {
  let n = baseName.replace(/^[A-Z]{6}\+/, '').split(',')[0]
  n = n.split('+').pop() || n
  n = n.replace(/(MT|PS|Std)\b/gi, '')          // foundry tag: "Arial-BoldMT" → "Arial-Bold"
  n = n.replace(/[-\s]?(BoldItalic|BoldOblique|SemiBold|Bold|Italic|Oblique|Regular|Medium|Light|Black|Heavy)\b/gi, '') // → "Arial"
  n = n.replace(/[-\s]+$/, '').trim()
  // de-camel a run-together PS name: "ArialNarrow" → "Arial Narrow"
  if (!n.includes(' ')) n = n.replace(/([a-z])([A-Z])/g, '$1 $2')
  return n.trim()
}

export interface ResolvedFont { family: string; data: Buffer }

/**
 * Find the best installed font for a document font name + style. Returns the CSS
 * family + the actual font file bytes, or null when nothing suitable is installed
 * (the renderer then keeps its existing fallback, so behaviour never regresses).
 */
export function resolveSystemFont(baseName: string, bold: boolean, italic: boolean): ResolvedFont | null {
  if (!baseName) return null
  if (!index) index = buildIndex()
  if (index.size === 0) return null

  const fam = familyOf(baseName)
  const narrow = /narrow|condensed|\bcond\b|compressed/i.test(baseName)

  // Try the document's own family first, then a narrow stand-in if it reads as a
  // narrow/condensed face. We never fall through to an unrelated generic — only a
  // confident match substitutes; otherwise the caller keeps its current font.
  const families = [fam]
  if (narrow) families.push('Arial Narrow', 'Liberation Sans Narrow')

  for (const f of families) {
    const variants = [
      bold && italic ? `${f} bold italic` : null,
      bold ? `${f} bold` : null,
      italic ? `${f} italic` : null,
      f,
    ].filter(Boolean) as string[]
    for (const v of variants) {
      const hit = index.get(v.toLowerCase())
      if (hit) { try { return { family: f, data: fs.readFileSync(hit) } } catch { /* unreadable */ } }
    }
  }
  return null
}

// Find an installed file for `family` in the requested style, by the same variant
// name matching resolveSystemFont uses. Returns the file path or null.
function resolveVariantPath(family: string, bold: boolean, italic: boolean): string | null {
  if (!index) index = buildIndex()
  const variants = [
    bold && italic ? `${family} bold italic` : null,
    bold ? `${family} bold` : null,
    italic ? `${family} italic` : null,
    family,
  ].filter(Boolean) as string[]
  for (const v of variants) { const hit = index.get(v.toLowerCase()); if (hit) return hit }
  return null
}

// ── Metric-matched substitute selection (XChange-style closest match) ──────────
// A parsed, cached index of EVERY installed named face with the metadata needed to
// score a closest metric-compatible substitute. Built once (lazily, only when the
// substitute tier is actually reached) so we never parse hundreds of fonts per edit.

export interface FontMetric {
  path: string
  family: string          // original-case family name
  serif: boolean
  bold: boolean
  italic: boolean
  weight: number
  avgWidth: number        // xAvgCharWidth / unitsPerEm (0 if unknown)
  xHeight: number         // / unitsPerEm (0 if unknown)
  capHeight: number       // / unitsPerEm (0 if unknown)
  fixedPitch: boolean
}

export interface SubstituteQuery {
  serif: boolean
  bold: boolean
  italic: boolean
  weight: number
  avgWidth: number
  xHeight: number
  capHeight: number
  fixedPitch: boolean
}

interface FKFace {
  fonts?: FKFace[]
  familyName?: string | null
  subfamilyName?: string | null
  fullName?: string | null
  unitsPerEm?: number
  italicAngle?: number
  capHeight?: number
  xHeight?: number
  'OS/2'?: { usWeightClass?: number; sFamilyClass?: number; panose?: number[] | Uint8Array; xAvgCharWidth?: number; fsSelection?: number }
  post?: { isFixedPitch?: number | boolean }
  head?: { macStyle?: number }
  hasGlyphForCodePoint?(cp: number): boolean
}

let metricIndex: FontMetric[] | null = null
// In-flight build so concurrent callers await ONE build (never parse twice at once).
let metricBuildPromise: Promise<FontMetric[]> | null = null
// Directory for the persistent parsed-metric cache (app userData). Unset in tests,
// where persistence is simply skipped.
let fontCacheDir: string | null = null

// One persisted cache entry per registry font NAME: the file it resolved to plus its
// size+mtime (the invalidation key) and the parsed metric. A launch reuses entries
// whose file is byte-for-byte unchanged and only re-parses new/changed files.
interface MetricCacheEntry { path: string; size: number; mtime: number; metric: FontMetric }
type MetricCache = Record<string, MetricCacheEntry>

export function setFontCacheDir(dir: string): void { fontCacheDir = dir }

function metricCacheFile(): string | null {
  return fontCacheDir ? path.join(fontCacheDir, 'font-metric-cache.json') : null
}
function loadMetricCache(): MetricCache {
  const p = metricCacheFile()
  if (!p) return {}
  try { return JSON.parse(fs.readFileSync(p, 'utf8')) as MetricCache } catch { return {} }
}
function saveMetricCache(c: MetricCache): void {
  const p = metricCacheFile()
  if (!p) return
  try { fs.writeFileSync(p, JSON.stringify(c)) } catch { /* cache is best-effort */ }
}

// serif class from OS/2 sFamilyClass (authoritative) then PANOSE, then name.
export function classifySerif(sFamilyClass: number | undefined, panose: number[] | Uint8Array | undefined, name: string): boolean {
  if (typeof sFamilyClass === 'number' && sFamilyClass > 0) {
    const cls = (sFamilyClass >> 8) & 0xff
    if (cls === 8) return false                 // Sans Serif
    if (cls >= 1 && cls <= 7) return true        // Oldstyle…Slab/Freeform serifs
  }
  if (panose && panose.length >= 2 && panose[0] === 2) { // Latin Text
    const serifStyle = panose[1]
    if (serifStyle >= 11 && serifStyle <= 15) return false // sans variants
    if (serifStyle >= 2 && serifStyle <= 10) return true   // cove…triangle serifs
  }
  if (/sans/i.test(name)) return false
  if (/serif|times|georgia|garamond|roman|minion|cambria|constantia|book antiqua|palatino/i.test(name)) return true
  return false
}

function faceMetric(f: FKFace, regName: string, filePath: string): FontMetric | null {
  if (typeof f.hasGlyphForCodePoint !== 'function') return null
  const upm = f.unitsPerEm && f.unitsPerEm > 0 ? f.unitsPerEm : 1000
  const os2 = f['OS/2'] ?? {}
  const sub = (f.subfamilyName ?? '').toLowerCase()
  const weight = os2.usWeightClass ?? 400
  const fsSel = os2.fsSelection ?? 0
  const macStyle = f.head?.macStyle ?? 0
  const bold = weight >= 600 || /bold|black|heavy/.test(sub) || (fsSel & 0x20) !== 0 || (macStyle & 0x1) !== 0
  const italic = /italic|oblique/.test(sub) || Math.abs(f.italicAngle ?? 0) > 4 || (fsSel & 0x01) !== 0 || (macStyle & 0x2) !== 0
  const panose = os2.panose
  const family = (f.familyName ?? regName).trim()
  const serif = classifySerif(os2.sFamilyClass, panose, family)
  const avgWidth = os2.xAvgCharWidth && os2.xAvgCharWidth > 0 ? os2.xAvgCharWidth / upm : 0
  const xHeight = f.xHeight && f.xHeight > 0 ? f.xHeight / upm : 0
  const capHeight = f.capHeight && f.capHeight > 0 ? f.capHeight / upm : 0
  const fixedPitch = !!(f.post?.isFixedPitch)
  return { path: filePath, family, serif, bold, italic, weight, avgWidth, xHeight, capHeight, fixedPitch }
}

// For a TrueType/OpenType Collection, pick the face whose name best matches the
// registry display name (so "Cambria Bold" out of cambria.ttc is the bold face).
function pickFace(faces: FKFace[], regName: string): FKFace {
  const want = regName.toLowerCase()
  let best = faces[0]
  let bestScore = -1
  for (const f of faces) {
    const full = `${f.familyName ?? ''} ${f.subfamilyName ?? ''}`.trim().toLowerCase()
    const fn = (f.fullName ?? '').toLowerCase()
    let s = 0
    if (fn === want || full === want) s = 100
    else if (want.includes((f.familyName ?? '').toLowerCase()) && (f.familyName ?? '')) s = 10 + (f.subfamilyName ?? '').length
    if (s > bestScore) { bestScore = s; best = f }
  }
  return best
}

function buildMetricIndex(): FontMetric[] {
  if (!index) index = buildIndex()
  const out: FontMetric[] = []
  if (process.platform !== 'win32' || index.size === 0) return out
  const parsedByPath = new Map<string, FKFace | null>()
  for (const [regName, filePath] of index) {
    const lower = filePath.toLowerCase()
    if (lower.endsWith('.fon') || lower.endsWith('.pfb') || lower.endsWith('.pfm') || lower.endsWith('.pfa')) continue
    let parsed = parsedByPath.get(filePath)
    if (parsed === undefined) {
      try { parsed = fontkit.create(fs.readFileSync(filePath)) as unknown as FKFace } catch { parsed = null }
      parsedByPath.set(filePath, parsed)
    }
    if (!parsed) continue
    const face = parsed.fonts && parsed.fonts.length ? pickFace(parsed.fonts, regName) : parsed
    try { const m = faceMetric(face, regName, filePath); if (m) out.push(m) } catch { /* skip unparseable metrics */ }
  }
  return out
}

// Async twin of buildMetricIndex: reuses the persistent cache for unchanged files,
// re-parses only new/changed ones, and yields to the event loop between files so a
// warmup (or a cold first edit) never blocks IPC for the whole parse. Result and the
// refreshed cache are written back only when something actually changed.
async function buildMetricIndexAsync(): Promise<FontMetric[]> {
  if (!index) index = buildIndex()
  const out: FontMetric[] = []
  if (process.platform !== 'win32' || index.size === 0) return out
  const cache = loadMetricCache()
  const next: MetricCache = {}
  const parsedByPath = new Map<string, FKFace | null>()
  let changed = false
  let seen = 0
  for (const [regName, filePath] of index) {
    const lower = filePath.toLowerCase()
    if (lower.endsWith('.fon') || lower.endsWith('.pfb') || lower.endsWith('.pfm') || lower.endsWith('.pfa')) continue
    let st: fs.Stats
    try { st = fs.statSync(filePath) } catch { changed = true; continue }
    const hit = cache[regName]
    if (hit && hit.path === filePath && hit.size === st.size && hit.mtime === st.mtimeMs && hit.metric) {
      out.push(hit.metric); next[regName] = hit
    } else {
      let parsed = parsedByPath.get(filePath)
      if (parsed === undefined) {
        try { parsed = fontkit.create(fs.readFileSync(filePath)) as unknown as FKFace } catch { parsed = null }
        parsedByPath.set(filePath, parsed)
      }
      if (parsed) {
        const face = parsed.fonts && parsed.fonts.length ? pickFace(parsed.fonts, regName) : parsed
        try {
          const m = faceMetric(face, regName, filePath)
          if (m) { out.push(m); next[regName] = { path: filePath, size: st.size, mtime: st.mtimeMs, metric: m }; changed = true }
        } catch { /* skip unparseable metrics */ }
      } else changed = true
    }
    if ((++seen % 12) === 0) await new Promise<void>(r => setImmediate(r))
  }
  if (Object.keys(cache).length !== Object.keys(next).length) changed = true
  if (changed) saveMetricCache(next)
  return out
}

/**
 * Resolve the metric index, building it once in the background if needed. Concurrent
 * callers share a single in-flight build. Cheap (returns immediately) once warm.
 */
export function ensureMetricIndex(): Promise<FontMetric[]> {
  if (metricIndex) return Promise.resolve(metricIndex)
  if (!metricBuildPromise) {
    metricBuildPromise = buildMetricIndexAsync()
      .then(m => { metricIndex = m; return m })
      .catch(e => { metricBuildPromise = null; throw e })
  }
  return metricBuildPromise
}

/**
 * Kick off the substitute-font metric index a few seconds after startup so it is warm
 * before the first Edit Text substitute, without competing with first-frame work.
 * Pass the app's userData dir to enable the cross-launch parsed-metric cache.
 */
export function warmSubstituteFontIndex(cacheDir?: string): void {
  if (cacheDir) setFontCacheDir(cacheDir)
  setTimeout(() => { void ensureMetricIndex().catch(() => { /* warmup is best-effort */ }) }, 4000)
}

function scoreMetric(q: SubstituteQuery, f: FontMetric): number {
  let s = 0
  if (f.bold !== q.bold) s += 3
  if (f.italic !== q.italic) s += 3
  if (f.fixedPitch !== q.fixedPitch) s += 2
  // Missing text metrics (titling/caps/symbol faces report no x-height or avg width)
  // are PENALISED, not skipped — otherwise they score deceptively close to a body
  // font and get picked ahead of a real Georgia/Times match.
  if (q.avgWidth > 0) s += f.avgWidth > 0 ? Math.abs(f.avgWidth - q.avgWidth) * 10 : 0.6
  if (q.xHeight > 0) s += f.xHeight > 0 ? Math.abs(f.xHeight - q.xHeight) * 10 : 1.0
  if (q.capHeight > 0) s += f.capHeight > 0 ? Math.abs(f.capHeight - q.capHeight) * 8 : 0.4
  s += Math.abs((f.weight || 400) - (q.weight || 400)) / 400
  return s
}

/**
 * Pick the closest metric-compatible installed font of the SAME serif class that
 * fully covers the needed glyphs (`covers` is called with candidate file bytes, in
 * score order, and must return true). Falls back to a curated serif/sans shortlist
 * when scoring is inconclusive. Returns null when nothing of the right class covers
 * the text — the caller then throws so a wrong-class glyph is never rendered.
 */
export function pickSubstituteFontPath(
  q: SubstituteQuery, covers: (data: Buffer) => boolean,
): { path: string; family: string } | null {
  if (!metricIndex) metricIndex = buildMetricIndex()
  if (metricIndex.length === 0) return null

  const pool = metricIndex.filter(f => f.serif === q.serif)
  const scored = pool.map(f => ({ f, s: scoreMetric(q, f) })).sort((a, b) => a.s - b.s)
  for (const { f } of scored) {
    try { if (covers(fs.readFileSync(f.path))) return { path: f.path, family: f.family } } catch { /* unreadable */ }
  }

  // Curated shortlist — same serif class + style, tried in order.
  const shortlist = q.serif
    ? ['Georgia', 'Times New Roman', 'Cambria', 'Constantia']
    : ['Segoe UI', 'Arial', 'Calibri', 'Tahoma', 'Verdana']
  for (const fam of shortlist) {
    const hit = resolveVariantPath(fam, q.bold, q.italic) ?? resolveVariantPath(fam, false, false)
    if (hit) { try { if (covers(fs.readFileSync(hit))) return { path: hit, family: fam } } catch { /* unreadable */ } }
  }
  return null
}
