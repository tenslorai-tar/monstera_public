import path from 'path'
import fs from 'fs'
import { spawn, execSync } from 'child_process'
import os from 'os'

// ── Binary discovery ──────────────────────────────────────────────────────────

export const BIN_DIR = path.join(__dirname, '../../assets/bin')

function findInPath(name: string): string {
  try {
    const r = execSync(`where "${name}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
    const p = r.trim().split('\n')[0].trim()
    return p && fs.existsSync(p) ? p : ''
  } catch { return '' }
}

export function getMutoolPath(): string {
  const bundled = path.join(BIN_DIR, 'mutool.exe')
  if (fs.existsSync(bundled)) return bundled
  return findInPath('mutool.exe')
}

export function getGhostscriptPath(): string {
  const bundled = path.join(BIN_DIR, 'gswin64c.exe')
  if (fs.existsSync(bundled)) return bundled

  for (const base of ['C:\\Program Files\\gs', 'C:\\Program Files (x86)\\gs']) {
    if (!fs.existsSync(base)) continue
    try {
      const versions = fs.readdirSync(base)
        .filter((d: string) => d.toLowerCase().startsWith('gs'))
        .sort()
        .reverse()
      for (const v of versions) {
        const exe = path.join(base, v, 'bin', 'gswin64c.exe')
        if (fs.existsSync(exe)) return exe
      }
    } catch { /* skip */ }
  }
  return findInPath('gswin64c.exe')
}

export function getLibreOfficePath(): string {
  for (const c of [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ]) {
    if (fs.existsSync(c)) return c
  }
  return findInPath('soffice.exe')
}

export interface BinStatus {
  mutool:      { path: string; available: boolean }
  ghostscript: { path: string; available: boolean }
  libreoffice: { path: string; available: boolean }
}

export function getBinStatus(): BinStatus {
  const m = getMutoolPath(), g = getGhostscriptPath(), l = getLibreOfficePath()
  return {
    mutool:      { path: m, available: !!m },
    ghostscript: { path: g, available: !!g },
    libreoffice: { path: l, available: !!l },
  }
}

// ── Process runner ────────────────────────────────────────────────────────────

export function runProcess(exe: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const outBufs: Buffer[] = [], errBufs: Buffer[] = []
    proc.stdout.on('data', (d: Buffer) => outBufs.push(d))
    proc.stderr.on('data', (d: Buffer) => errBufs.push(d))
    proc.on('close', code => {
      const stdout = Buffer.concat(outBufs).toString('utf8')
      const stderr = Buffer.concat(errBufs).toString('utf8')
      if (code !== 0) reject(new Error(`${path.basename(exe)} exited ${code}: ${stderr.slice(0, 800)}`))
      else resolve({ stdout, stderr })
    })
    proc.on('error', reject)
  })
}

// ── Temp file helpers ─────────────────────────────────────────────────────────

let _seq = 0
export function tmpPath(ext = '.pdf'): string {
  return path.join(os.tmpdir(), `monstera-${process.pid}-${Date.now()}-${++_seq}${ext}`)
}

function toBuffer(bytes: ArrayBuffer | Uint8Array): Buffer {
  if (bytes instanceof Uint8Array) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return Buffer.from(bytes)
}

export async function withTempIO(
  bytes: ArrayBuffer | Uint8Array,
  fn: (inPath: string, outPath: string) => Promise<void>,
  outExt = '.pdf',
): Promise<Buffer> {
  const inPath  = tmpPath('.pdf')
  const outPath = tmpPath(outExt)
  try {
    fs.writeFileSync(inPath, toBuffer(bytes))
    await fn(inPath, outPath)
    if (!fs.existsSync(outPath)) throw new Error('Operation produced no output file')
    return fs.readFileSync(outPath)
  } finally {
    for (const f of [inPath, outPath]) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f) } catch { /* ignore */ }
    }
  }
}

// ── Ghostscript operations ────────────────────────────────────────────────────

async function gsConvert(
  bytes: ArrayBuffer | Uint8Array,
  extraArgs: string[],
): Promise<Buffer> {
  const gs = getGhostscriptPath()
  if (!gs) throw new Error('Ghostscript not found.\nInstall from: https://www.ghostscript.com/releases/gsdnld.html\nThen restart Monstera.')

  return withTempIO(bytes, async (inPath, outPath) => {
    await runProcess(gs, [
      '-dBATCH', '-dNOPAUSE', '-dNOSAFER',
      '-sDEVICE=pdfwrite',
      ...extraArgs,
      `-sOutputFile=${outPath}`,
      inPath,
    ])
  })
}

export function gsToPdfA(bytes: ArrayBuffer | Uint8Array, level: 1 | 2 | 3 = 2): Promise<Buffer> {
  return gsConvert(bytes, [
    `-dPDFA=${level}`,
    '-dPDFACompatibilityPolicy=1',
    '-sColorConversionStrategy=sRGB',
    level === 1 ? '-dCompatibilityLevel=1.4' : '-dCompatibilityLevel=1.7',
    '-dEmbedAllFonts=true',
    '-dSubsetFonts=true',
  ])
}

export function gsToPdfX(bytes: ArrayBuffer | Uint8Array): Promise<Buffer> {
  return gsConvert(bytes, [
    '-dPDFX',
    '-dCompatibilityLevel=1.6',
    '-sColorConversionStrategy=CMYK',
    '-dEmbedAllFonts=true',
  ])
}

export function gsToGrayscale(bytes: ArrayBuffer | Uint8Array): Promise<Buffer> {
  return gsConvert(bytes, [
    '-dProcessColorModel=/DeviceGray',
    '-sColorConversionStrategy=Gray',
    '-dOverrideICC',
    '-dCompatibilityLevel=1.4',
  ])
}

export function gsToCmyk(bytes: ArrayBuffer | Uint8Array): Promise<Buffer> {
  return gsConvert(bytes, [
    '-sColorConversionStrategy=CMYK',
    '-dProcessColorModel=/DeviceCMYK',
    '-dCompatibilityLevel=1.4',
  ])
}

export type GsOptPreset = 'screen' | 'ebook' | 'printer' | 'prepress'

export function gsOptimize(bytes: ArrayBuffer | Uint8Array, preset: GsOptPreset = 'ebook'): Promise<Buffer> {
  return gsConvert(bytes, [
    `-dPDFSETTINGS=/${preset}`,
    '-dCompatibilityLevel=1.4',
    '-dEmbedAllFonts=true',
    '-dSubsetFonts=true',
    '-dCompressFonts=true',
    '-dCompressPages=true',
    '-dAutoRotatePages=/None',
  ])
}

export function gsLinearize(bytes: ArrayBuffer | Uint8Array): Promise<Buffer> {
  return gsConvert(bytes, [
    '-dFastWebView=true',
    '-dCompatibilityLevel=1.7',
    '-dEmbedAllFonts=true',
    '-dCompressFonts=true',
  ])
}

export function gsSanitize(bytes: ArrayBuffer | Uint8Array): Promise<Buffer> {
  return gsConvert(bytes, [
    '-dSAFER',
    '-dCompatibilityLevel=1.4',
    '-dEmbedAllFonts=true',
    '-dSubsetFonts=true',
    '-dCompressFonts=true',
  ])
}

export function gsRasterize(bytes: ArrayBuffer | Uint8Array, dpi = 150): Promise<Buffer> {
  return gsConvert(bytes, [
    `-dColorImageResolution=${dpi}`,
    `-dGrayImageResolution=${dpi}`,
    `-dMonoImageResolution=${dpi}`,
    '-dColorImageDownsampleType=/Bicubic',
    '-dGrayImageDownsampleType=/Bicubic',
    '-dDownsampleColorImages=true',
    '-dDownsampleGrayImages=true',
    '-dCompatibilityLevel=1.4',
  ])
}

// ── MuPDF mutool operations ───────────────────────────────────────────────────

function requireMutool(): string {
  const m = getMutoolPath()
  if (!m) throw new Error('mutool not found.\nRun: npm run setup-bins')
  return m
}

export function mutoolClean(
  bytes: ArrayBuffer | Uint8Array,
  opts: { repair?: boolean; garbage?: 0 | 1 | 2 | 3 | 4; compress?: boolean; linearize?: boolean; sanitize?: boolean } = {},
): Promise<Buffer> {
  return withTempIO(bytes, async (inPath, outPath) => {
    const mutool = requireMutool()
    const args = ['clean']
    if (opts.repair)    args.push('-r')
    if (opts.garbage)   args.push('-' + 'g'.repeat(opts.garbage))
    if (opts.compress)  args.push('-z')
    if (opts.linearize) args.push('-l')
    if (opts.sanitize)  args.push('-s')
    args.push(inPath, outPath)
    await runProcess(mutool, args)
  })
}

export async function mutoolInfo(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const mutool = requireMutool()
  const inPath = tmpPath('.pdf')
  try {
    fs.writeFileSync(inPath, toBuffer(bytes))
    const { stdout } = await runProcess(mutool, ['info', '-m', inPath])
    return stdout
  } finally {
    try { if (fs.existsSync(inPath)) fs.unlinkSync(inPath) } catch { /* ignore */ }
  }
}

export interface ExtractedFile {
  name: string
  size: number
  dataBase64: string
}

export async function mutoolExtractFiles(bytes: ArrayBuffer | Uint8Array): Promise<ExtractedFile[]> {
  const mutool = requireMutool()
  const inPath = tmpPath('.pdf')
  const outDir = path.join(os.tmpdir(), `monstera-extract-${process.pid}-${Date.now()}`)
  try {
    fs.writeFileSync(inPath, toBuffer(bytes))
    fs.mkdirSync(outDir, { recursive: true })
    await runProcess(mutool, ['extract', '-o', outDir, inPath])

    const results: ExtractedFile[] = []
    for (const name of fs.readdirSync(outDir)) {
      const filePath = path.join(outDir, name)
      const data = fs.readFileSync(filePath)
      results.push({ name, size: data.byteLength, dataBase64: data.toString('base64') })
    }
    return results
  } finally {
    try { if (fs.existsSync(inPath)) fs.unlinkSync(inPath) } catch { /* ignore */ }
    try { fs.rmSync(outDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

// ── LibreOffice operations ────────────────────────────────────────────────────

function requireLibreOffice(): string {
  const lo = getLibreOfficePath()
  if (!lo) throw new Error('LibreOffice not found.\nInstall from: https://www.libreoffice.org/download/download/')
  return lo
}

export async function libreOfficeConvert(
  inputBytes: ArrayBuffer | Uint8Array,
  inputExt: string,
  outputFormat: string,
  infilter?: string,
): Promise<Buffer> {
  const lo = requireLibreOffice()
  const inPath = tmpPath(inputExt)
  const outDir = path.join(os.tmpdir(), `monstera-lo-${process.pid}-${Date.now()}`)

  try {
    fs.writeFileSync(inPath, toBuffer(inputBytes))
    fs.mkdirSync(outDir, { recursive: true })

    await runProcess(lo, [
      '--headless', '--norestore', '--nofirststartwizard',
      ...(infilter ? ['--infilter=' + infilter] : []),
      '--convert-to', outputFormat,
      '--outdir', outDir,
      inPath,
    ])

    // LibreOffice names output using the input basename
    const baseName = path.basename(inPath, inputExt)
    const outExt = outputFormat.split(':')[0]
    const outFile = path.join(outDir, `${baseName}.${outExt}`)

    if (!fs.existsSync(outFile)) {
      // Try alternate: LibreOffice may use original basename without temp prefix
      const entries = fs.readdirSync(outDir).filter((f: string) => f.endsWith(`.${outExt}`))
      if (entries.length === 0) throw new Error(`LibreOffice did not produce .${outExt} output`)
      return fs.readFileSync(path.join(outDir, entries[0]))
    }
    return fs.readFileSync(outFile)
  } finally {
    try { if (fs.existsSync(inPath)) fs.unlinkSync(inPath) } catch { /* ignore */ }
    try { fs.rmSync(outDir, { recursive: true, force: true }) } catch { /* ignore */ }
  }
}

export function libreOfficeToPdf(bytes: ArrayBuffer | Uint8Array, ext: string): Promise<Buffer> {
  return libreOfficeConvert(bytes, ext, 'pdf')
}

export function libreOfficeToDocx(bytes: ArrayBuffer | Uint8Array): Promise<Buffer> {
  // writer_pdf_import opens the PDF in Writer (editable text flow) rather than Draw,
  // so the .docx has selectable/editable paragraphs instead of one big image.
  return libreOfficeConvert(bytes, '.pdf', 'docx:MS Word 2007 XML', 'writer_pdf_import')
}

export function libreOfficeToPptx(bytes: ArrayBuffer | Uint8Array): Promise<Buffer> {
  return libreOfficeConvert(bytes, '.pdf', 'pptx:Impress MS PowerPoint 2007 XML')
}

export function libreOfficeToXlsx(bytes: ArrayBuffer | Uint8Array): Promise<Buffer> {
  return libreOfficeConvert(bytes, '.pdf', 'xlsx:Calc MS Excel 2007 XML', 'calc_pdf_import')
}
