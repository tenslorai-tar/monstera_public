// Builds a plain, fully-editable .docx from recognized paragraphs (one text
// block each, page breaks between source pages). Used by the handwriting →
// Word flow, whose paragraphs come from the local TrOCR or Azure read engines.
//
// A page may instead carry `markdown` (from the Claude vision engine): its
// headings, lists and paragraphs are rendered as real Word structure. Pages
// that only carry `paragraphs` render exactly as before.

export interface DocxPage { page: number; paragraphs?: string[]; markdown?: string }

export type DocxBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'bullet'; text: string }
  | { kind: 'ordered'; text: string }
  | { kind: 'paragraph'; text: string }

// Minimal GitHub-flavored-markdown structuring: heading lines (#/##/###),
// bullet lines (-,*,+) and numbered lines (1.) become their own blocks; runs of
// consecutive plain lines join into one paragraph.
export function markdownToBlocks(md: string): DocxBlock[] {
  const blocks: DocxBlock[] = []
  let para: string[] = []
  const flush = () => { if (para.length) { blocks.push({ kind: 'paragraph', text: para.join(' ') }); para = [] } }

  for (const rawLine of (md ?? '').split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    if (line.trim() === '') { flush(); continue }
    const h = line.match(/^(#{1,3})\s+(.*)$/)
    if (h) { flush(); blocks.push({ kind: 'heading', level: h[1].length as 1 | 2 | 3, text: h[2].trim() }); continue }
    const ul = line.match(/^\s*[-*+]\s+(.*)$/)
    if (ul) { flush(); blocks.push({ kind: 'bullet', text: ul[1].trim() }); continue }
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/)
    if (ol) { flush(); blocks.push({ kind: 'ordered', text: ol[1].trim() }); continue }
    para.push(line.trim())
  }
  flush()
  return blocks
}

// Strip inline markdown emphasis so the docx text reads cleanly (bold/italic/
// code markers, links → their text).
function stripInline(s: string): string {
  return s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .trim()
}

export async function buildParagraphsDocx(pages: DocxPage[]): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const docx = require('docx')
  const { Document, Paragraph, TextRun, Packer, PageBreak, HeadingLevel } = docx

  const ORDERED_REF = 'monstera-ol'
  const children: unknown[] = []
  const noText = (page: number) => new Paragraph({
    children: [new TextRun({ text: `[Page ${page} — no text recognized.]`, italics: true, color: '888888', size: 20 })],
  })

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }))
    const pg = pages[i]

    if (typeof pg.markdown === 'string') {
      const blocks = markdownToBlocks(pg.markdown).filter(b => b.text.trim().length > 0)
      if (blocks.length === 0) { children.push(noText(pg.page)); continue }
      for (const b of blocks) {
        const text = stripInline(b.text)
        if (b.kind === 'heading') {
          children.push(new Paragraph({
            heading: b.level === 1 ? HeadingLevel.HEADING_1 : b.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
            children: [new TextRun({ text })],
          }))
        } else if (b.kind === 'bullet') {
          children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text, size: 24 })] }))
        } else if (b.kind === 'ordered') {
          children.push(new Paragraph({ numbering: { reference: ORDERED_REF, level: 0 }, children: [new TextRun({ text, size: 24 })] }))
        } else {
          children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, size: 24 })] }))
        }
      }
      continue
    }

    const paras = (pg.paragraphs ?? []).filter(p => p.trim().length > 0)
    if (paras.length === 0) { children.push(noText(pg.page)); continue }
    for (const text of paras) {
      children.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text, size: 24 })] }))
    }
  }
  if (children.length === 0) {
    children.push(new Paragraph({ children: [new TextRun({ text: '[No text recognized.]', italics: true, color: '888888', size: 20 })] }))
  }

  const wordDoc = new Document({
    creator: 'Monstera PDF Editor',
    numbering: { config: [{ reference: ORDERED_REF, levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: 'left' }] }] },
    sections: [{ properties: {}, children }],
  })
  return Packer.toBuffer(wordDoc)
}
