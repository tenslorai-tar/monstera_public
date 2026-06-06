#!/usr/bin/env node
// scripts/download-bins.js
// Downloads mutool.exe from the latest MuPDF release and places it in assets/bin/
// Usage: node scripts/download-bins.js [--force]

const https = require('https')
const http  = require('http')
const fs    = require('fs')
const path  = require('path')
const os    = require('os')
const { execSync } = require('child_process')

const BIN_DIR = path.join(__dirname, '../assets/bin')
fs.mkdirSync(BIN_DIR, { recursive: true })

// ── HTTP/S downloader with redirect following ─────────────────────────────────

function download(url, dest) {
  return new Promise((resolve, reject) => {
    function follow(u, hops = 0) {
      if (hops > 8) { reject(new Error('Too many redirects')); return }
      const mod = u.startsWith('https') ? https : http
      const req = mod.get(u, { headers: { 'User-Agent': 'monstera-pdf-editor/1.0' } }, res => {
        if ([301,302,303,307,308].includes(res.statusCode)) {
          follow(res.headers.location, hops + 1); return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${u}`)); return
        }
        const total = parseInt(res.headers['content-length'] || '0')
        let received = 0
        const file = fs.createWriteStream(dest)
        res.on('data', chunk => {
          received += chunk.length
          if (total > 0) {
            const pct = Math.round(received / total * 100)
            const mb  = (received / 1024 / 1024).toFixed(1)
            process.stdout.write(`\r  ${pct}% (${mb} MB / ${(total/1024/1024).toFixed(1)} MB)   `)
          }
        })
        res.pipe(file)
        file.on('finish', () => { file.close(); process.stdout.write('\n'); resolve() })
        res.on('error', reject)
        file.on('error', reject)
      })
      req.on('error', reject)
    }
    follow(url)
  })
}

// ── Fetch latest MuPDF release URL from GitHub API ────────────────────────────

function getLatestMutoolUrl() {
  return new Promise(resolve => {
    const req = https.get(
      'https://api.github.com/repos/ArtifexSoftware/mupdf/releases/latest',
      { headers: { 'User-Agent': 'monstera-pdf-editor/1.0' } },
      res => {
        let data = ''
        res.on('data', d => { data += d })
        res.on('end', () => {
          try {
            const release = JSON.parse(data)
            const tag = release.tag_name ?? '1.24.11'
            const asset = (release.assets || []).find(a =>
              a.name.toLowerCase().includes('windows') && a.name.endsWith('.zip')
            )
            if (asset) { resolve(asset.browser_download_url); return }
            resolve(`https://github.com/ArtifexSoftware/mupdf/releases/download/${tag}/mupdf-${tag}-windows.zip`)
          } catch {
            resolve('https://github.com/ArtifexSoftware/mupdf/releases/download/1.24.11/mupdf-1.24.11-windows.zip')
          }
        })
        res.on('error', () => resolve('https://github.com/ArtifexSoftware/mupdf/releases/download/1.24.11/mupdf-1.24.11-windows.zip'))
      }
    )
    req.on('error', () => resolve('https://github.com/ArtifexSoftware/mupdf/releases/download/1.24.11/mupdf-1.24.11-windows.zip'))
    req.setTimeout(8000, () => {
      req.destroy()
      resolve('https://github.com/ArtifexSoftware/mupdf/releases/download/1.24.11/mupdf-1.24.11-windows.zip')
    })
  })
}

// ── Extract mutool.exe from ZIP using PowerShell ──────────────────────────────

function findFile(dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findFile(full, name)
      if (found) return found
    } else if (entry.name.toLowerCase() === name.toLowerCase()) {
      return full
    }
  }
  return null
}

function extractMutool(zipPath) {
  const extractDir = path.join(os.tmpdir(), `mupdf-extract-${Date.now()}`)
  fs.mkdirSync(extractDir, { recursive: true })
  console.log('  Extracting archive...')
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`,
    { stdio: 'inherit' }
  )
  const src = findFile(extractDir, 'mutool.exe')
  if (!src) throw new Error('mutool.exe not found inside the downloaded archive.')
  const dest = path.join(BIN_DIR, 'mutool.exe')
  fs.copyFileSync(src, dest)
  try { fs.rmSync(extractDir, { recursive: true, force: true }) } catch {}
  return dest
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\nMonstera PDF Editor — Binary Setup')
  console.log('====================================\n')

  const mutoolDest = path.join(BIN_DIR, 'mutool.exe')
  const force = process.argv.includes('--force')

  if (fs.existsSync(mutoolDest) && !force) {
    console.log(`✓  mutool.exe already installed (${mutoolDest})`)
    console.log('   Pass --force to re-download.\n')
  } else {
    console.log('Fetching latest MuPDF release info from GitHub...')
    const url = await getLatestMutoolUrl()
    console.log(`Downloading: ${url}`)

    const zipPath = path.join(os.tmpdir(), `mupdf-${Date.now()}.zip`)
    try {
      await download(url, zipPath)
      const dest = extractMutool(zipPath)
      console.log(`✓  mutool.exe installed: ${dest}`)
    } finally {
      try { if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath) } catch {}
    }
  }

  console.log('\n──────────────────────────────────────────────')
  console.log('REMAINING SETUP (required for full functionality)')
  console.log('──────────────────────────────────────────────\n')

  console.log('1. Ghostscript  ← PDF/A, PDF/X, color conversion, professional optimization')
  console.log('   Download the AGPL Release (Windows 64-bit):')
  console.log('   https://www.ghostscript.com/releases/gsdnld.html\n')

  console.log('2. LibreOffice  ← layout-faithful Office→PDF import, PDF→DOCX/PPTX export')
  console.log('   Download the Windows 64-bit installer:')
  console.log('   https://www.libreoffice.org/download/download/\n')

  console.log('Both installers use standard Windows install paths.')
  console.log('Monstera detects them automatically — no manual configuration needed.\n')
}

main().catch(e => { console.error('\n✗  Setup failed:', e.message); process.exit(1) })
