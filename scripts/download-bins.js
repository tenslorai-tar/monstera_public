#!/usr/bin/env node
// scripts/download-bins.js
// Installs/updates native binaries required by Monstera PDF Editor:
//   mutool.exe  — MuPDF command-line tool (PDF repair, extract, clean)
//   Ghostscript — PDF/A, PDF/X, colour conversion, quality optimisation
//   LibreOffice — Layout-faithful Office→PDF import, PDF→DOCX/PPTX export
//
// Uses Chocolatey (choco) if available; falls back to direct-download for mutool.
// Requires admin privileges (run from an elevated shell or choco will prompt UAC).
//
// Usage:
//   node scripts/download-bins.js           # install missing only
//   node scripts/download-bins.js --force   # reinstall all

const { execSync, spawnSync } = require('child_process')
const fs   = require('fs')
const path = require('path')
const os   = require('os')
const https = require('https')
const http  = require('http')

const BIN_DIR = path.join(__dirname, '../assets/bin')
fs.mkdirSync(BIN_DIR, { recursive: true })

const force = process.argv.includes('--force')

// ── Helpers ───────────────────────────────────────────────────────────────────

function run(cmd) {
  try { execSync(cmd, { stdio: 'inherit' }); return true }
  catch { return false }
}

function exists(p) { return fs.existsSync(p) }

function findMutool() {
  const bundled = path.join(BIN_DIR, 'mutool.exe')
  if (exists(bundled)) return bundled
  const choco = 'C:\\ProgramData\\chocolatey\\lib\\mupdf\\mutool.exe'
  if (exists(choco)) return choco
  try {
    const r = execSync('where mutool.exe', { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] })
    const p = r.trim().split('\n')[0].trim()
    if (p && exists(p)) return p
  } catch {}
  return null
}

function findGhostscript() {
  for (const base of ['C:\\Program Files\\gs', 'C:\\Program Files (x86)\\gs']) {
    if (!exists(base)) continue
    const versions = fs.readdirSync(base).filter(d => d.toLowerCase().startsWith('gs')).sort().reverse()
    for (const v of versions) {
      const exe = path.join(base, v, 'bin', 'gswin64c.exe')
      if (exists(exe)) return exe
    }
  }
  try {
    const r = execSync('where gswin64c.exe', { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] })
    const p = r.trim().split('\n')[0].trim()
    if (p && exists(p)) return p
  } catch {}
  return null
}

function findLibreOffice() {
  for (const p of [
    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  ]) { if (exists(p)) return p }
  try {
    const r = execSync('where soffice.exe', { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] })
    const p = r.trim().split('\n')[0].trim()
    if (p && exists(p)) return p
  } catch {}
  return null
}

function hasCholocolatey() {
  try { execSync('choco --version', { stdio: 'pipe' }); return true } catch { return false }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    function follow(u, hops = 0) {
      if (hops > 8) { reject(new Error('Too many redirects')); return }
      const mod = u.startsWith('https') ? https : http
      const req = mod.get(u, { headers: { 'User-Agent': 'monstera-pdf-editor/1.0' } }, res => {
        if ([301,302,303,307,308].includes(res.statusCode)) { follow(res.headers.location, hops + 1); return }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} for ${u}`)); return }
        const total = parseInt(res.headers['content-length'] || '0')
        let received = 0
        const file = fs.createWriteStream(dest)
        res.on('data', chunk => {
          received += chunk.length
          if (total > 0) {
            const pct = Math.round(received / total * 100)
            process.stdout.write(`\r  ${pct}% (${(received/1048576).toFixed(1)} MB / ${(total/1048576).toFixed(1)} MB)   `)
          }
        })
        res.pipe(file)
        file.on('finish', () => { file.close(); process.stdout.write('\n'); resolve() })
        res.on('error', reject); file.on('error', reject)
      })
      req.on('error', reject)
    }
    follow(url)
  })
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\nMonstera PDF Editor — Binary Setup')
  console.log('====================================\n')

  const useChoco = hasCholocolatey()
  if (useChoco) console.log('Chocolatey detected — using it for all installs.\n')

  // ── mutool ──────────────────────────────────────────────────────────────────
  const mutoolPath = findMutool()
  if (mutoolPath && !force) {
    console.log(`✓  mutool.exe  ${mutoolPath}`)
  } else {
    console.log(force ? 'Reinstalling mutool...' : 'Installing mutool...')
    let installed = false
    if (useChoco) {
      installed = run('choco install mupdf -y --no-progress')
      if (installed) {
        const chocoExe = 'C:\\ProgramData\\chocolatey\\lib\\mupdf\\mutool.exe'
        if (exists(chocoExe)) {
          fs.copyFileSync(chocoExe, path.join(BIN_DIR, 'mutool.exe'))
          console.log(`✓  mutool.exe  ${path.join(BIN_DIR, 'mutool.exe')} (copied from choco)`)
        } else {
          console.log('✓  mutool.exe installed via Chocolatey')
        }
      }
    }
    if (!installed) {
      console.error('✗  Failed to install MuPDF. Install manually: choco install mupdf')
      process.exitCode = 1
    }
  }

  // ── Ghostscript ─────────────────────────────────────────────────────────────
  const gsPath = findGhostscript()
  if (gsPath && !force) {
    console.log(`✓  Ghostscript  ${gsPath}`)
  } else {
    console.log(force ? 'Reinstalling Ghostscript...' : 'Installing Ghostscript...')
    let installed = false
    if (useChoco) {
      installed = run('choco install Ghostscript -y --no-progress')
      const newPath = findGhostscript()
      if (installed && newPath) console.log(`✓  Ghostscript  ${newPath}`)
      else if (installed) console.log('✓  Ghostscript installed via Chocolatey')
    }
    if (!installed) {
      console.error('✗  Failed to install Ghostscript. Install manually: choco install Ghostscript')
      process.exitCode = 1
    }
  }

  // ── LibreOffice ─────────────────────────────────────────────────────────────
  const loPath = findLibreOffice()
  if (loPath && !force) {
    console.log(`✓  LibreOffice  ${loPath}`)
  } else {
    console.log(force ? 'Reinstalling LibreOffice (large download ~355 MB)...' : 'Installing LibreOffice (large download ~355 MB)...')
    let installed = false
    if (useChoco) {
      installed = run('choco install libreoffice-fresh -y --no-progress')
      const newPath = findLibreOffice()
      if (installed && newPath) console.log(`✓  LibreOffice  ${newPath}`)
      else if (installed) console.log('✓  LibreOffice installed via Chocolatey')
    }
    if (!installed) {
      console.error('✗  Failed to install LibreOffice. Install manually: choco install libreoffice-fresh')
      process.exitCode = 1
    }
  }

  console.log('\nDone. All native tools are ready.\n')
}

main().catch(e => { console.error('\n✗  Setup failed:', e.message); process.exit(1) })
