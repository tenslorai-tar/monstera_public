// Builds a plain, fully-editable .docx from recognized paragraphs (one text
// block each, page breaks between source pages). Used by the handwriting →
// Word flow, whose paragraphs come from the local TrOCR or Azure read engines.

export interface DocxPage { page: number; paragraphs: string[] }

export async function buildParagraphsDocx(pages: DocxPage[]): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const docx = require('docx')
  const { Document, Paragraph, TextRun, Packer, PageBreak } = docx

  const children: unknown[] = []
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }))
    const paras = pages[i].paragraphs.filter(p => p.trim().length > 0)
    if (paras.length === 0) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `[Page ${pages[i].page} — no text recognized.]`, italics: true, color: '888888', size: 20 })],
      }))
      continue
    }
    for (const text of paras) {
      children.push(new Paragraph({
        spacing: { after: 120 },
        children: [new TextRun({ text, size: 24 })],
      }))
    }
  }
  if (children.length === 0) {
    children.push(new Paragraph({ children: [new TextRun({ text: '[No text recognized.]', italics: true, color: '888888', size: 20 })] }))
  }

  const wordDoc = new Document({ creator: 'Monstera PDF Editor', sections: [{ properties: {}, children }] })
  return Packer.toBuffer(wordDoc)
}
