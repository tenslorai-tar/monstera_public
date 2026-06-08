import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(process.cwd(), 'src', 'renderer', 'components')

// file → { icon, title }  (title keeps meaningful arrows/dashes; only the
// leading emoji is replaced by a Lucide icon)
const MAP = {
  'BackgroundDialog.tsx':        { icon: 'Palette',        title: 'Page Background' },
  'BatesDialog.tsx':             { icon: 'Hash',           title: 'Bates Numbering' },
  'CommentStylesPanel.tsx':      { icon: 'Palette',        title: 'Comment Styles' },
  'CropDialog.tsx':              { icon: 'Crop',           title: 'Crop Pages' },
  'CsvPdfDialog.tsx':            { icon: 'Table',          title: 'CSV → PDF' },
  'DeskewDialog.tsx':            { icon: 'Ruler',          title: 'Deskew & Enhance Scanned Pages' },
  'CloudStorageDialog.tsx':      { icon: 'Cloud',          title: 'Cloud Storage' },
  'DigitalSignDialog.tsx':       { icon: 'FileSignature',  title: 'Digital Signature' },
  'DocuSignDialog.tsx':          { icon: 'Signature',      title: 'DocuSign — Send for Signature' },
  'DocumentScanDialog.tsx':      { icon: 'Wand2',          title: 'Scan / Enhance Document' },
  'EmailDialog.tsx':             { icon: 'Mail',           title: 'Email Document' },
  'EditExternalDialog.tsx':      { icon: 'SquarePen',      title: 'Edit Page in External App' },
  'FindDuplicatesDialog.tsx':    { icon: 'Search',         title: 'Find Duplicate Pages' },
  'ExportDialog.tsx':            { icon: 'Upload',         title: 'Export' },
  'FindRedactDialog.tsx':        { icon: 'SearchX',        title: 'Find & Redact' },
  'HeaderFooterDialog.tsx':      { icon: 'PanelTop',       title: 'Add Headers & Footers' },
  'ImportToLayerDialog.tsx':     { icon: 'Layers',         title: 'Import Pages to Layer' },
  'MarkdownPdfDialog.tsx':       { icon: 'FileCode',       title: 'Markdown → PDF' },
  'MeasureCalibrationDialog.tsx':{ icon: 'PencilRuler',    title: 'Measurement Calibration' },
  'MultiPageStampDialog.tsx':    { icon: 'CopyPlus',       title: 'Stamp on Multiple Pages' },
  'NativeBinsDialog.tsx':        { icon: 'Settings',       title: 'Native Tools Setup' },
  'OcrDialog.tsx':               { icon: 'ScanText',       title: 'OCR — Make Scanned Pages Searchable' },
  'OfficeImportDialog.tsx':      { icon: 'Import',         title: 'Import Office Document' },
  'OcrRegionDialog.tsx':         { icon: 'ScanText',       title: 'OCR Selected Region' },
  'OpenUrlDialog.tsx':           { icon: 'Globe',          title: 'Open PDF from URL' },
  'OptimizeDialog.tsx':          { icon: 'Minimize2',      title: 'Optimize PDF' },
  'PasswordDialog.tsx':          { icon: 'Lock',           title: 'Security' },
  'PdfConvertDialog.tsx':        { icon: 'RefreshCw',      title: 'Document Conversion & Repair' },
  'PageTransitionsDialog.tsx':   { icon: 'Film',           title: 'Page Transitions' },
  'ReplacePageDialog.tsx':       { icon: 'RefreshCw',      title: 'Replace Page' },
  'ResizePagesDialog.tsx':       { icon: 'Scaling',        title: 'Resize Pages' },
  'SignaturePad.tsx':            { icon: 'Signature',      title: 'Capture Signature' },
  'SpellCheckDialog.tsx':        { icon: 'SpellCheck',     title: 'Spell Check' },
  'SwapPagesDialog.tsx':         { icon: 'ArrowLeftRight', title: 'Swap Pages' },
  'SummarizeCommentsDialog.tsx': { icon: 'ClipboardList',  title: 'Comment Summary' },
  'TaggedPdfDialog.tsx':         { icon: 'Tags',           title: 'Tagged PDF / Reading Order' },
  'WebcamDialog.tsx':            { icon: 'Camera',         title: 'Webcam Capture' },
  'WatermarkDialog.tsx':         { icon: 'Droplets',       title: 'Add Watermark' },
  'TocGeneratorDialog.tsx':      { icon: 'ListTree',       title: 'Generate Table of Contents' },
}

function addImport(content, icon) {
  const re = /import\s*\{([^}]*)\}\s*from\s*'lucide-react'/
  const m = content.match(re)
  if (m) {
    const names = m[1].split(',').map(s => s.trim()).filter(Boolean)
    if (names.includes(icon)) return content
    names.push(icon)
    return content.replace(re, `import { ${names.join(', ')} } from 'lucide-react'`)
  }
  // No lucide import yet — add a line right after the first import statement.
  const firstNl = content.indexOf('\n', content.indexOf('import'))
  return content.slice(0, firstNl + 1) + `import { ${icon} } from 'lucide-react'\n` + content.slice(firstNl + 1)
}

let changed = 0
for (const [file, { icon, title }] of Object.entries(MAP)) {
  const path = join(root, file)
  let content
  try { content = readFileSync(path, 'utf8') } catch { console.log('SKIP (missing):', file); continue }

  // Replace the leading emoji/symbol run inside the first modal-title with a Lucide icon.
  const titleRe = /(<div className="modal-title">)[^A-Za-z0-9<]*\s*/
  if (!titleRe.test(content)) { console.log('SKIP (no emoji title):', file); continue }
  content = content.replace(titleRe, `$1<${icon} size={18} /> `)
  content = addImport(content, icon)

  writeFileSync(path, content, 'utf8')
  console.log('OK  ', file, '→', icon, '·', title)
  changed++
}
console.log(`\nUpdated ${changed} dialog titles.`)
