/**
 * Hunspell-grade spell checking via nspell + dictionary-en, run in the main
 * process (Node) so the dictionary can be read from disk. dictionary-en is
 * ESM-only, so it's loaded with a dynamic import that TypeScript won't down-level
 * to require().
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dynImport = new Function('m', 'return import(m)') as (m: string) => Promise<any>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let speller: any = null

async function getSpeller(): Promise<unknown> {
  if (speller) return speller
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nspell = require('nspell')
  const dict = (await dynImport('dictionary-en')).default
  speller = nspell(dict)
  return speller
}

export interface SpellIssue { word: string; suggestions: string[] }

/** Return each unique misspelled word in `text` with up to 6 suggestions. */
export async function spellCheck(text: string): Promise<SpellIssue[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sp = await getSpeller() as any
  const out: SpellIssue[] = []
  const seen = new Set<string>()
  const words = text.match(/[A-Za-z][A-Za-z'’-]*/g) || []
  for (const w of words) {
    const key = w.toLowerCase()
    if (w.length < 2 || seen.has(key)) continue
    seen.add(key)
    if (!sp.correct(w)) out.push({ word: w, suggestions: (sp.suggest(w) as string[]).slice(0, 6) })
  }
  return out
}
