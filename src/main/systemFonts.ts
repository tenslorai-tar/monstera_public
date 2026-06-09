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
