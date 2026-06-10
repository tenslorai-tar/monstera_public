// Reproduce the EXACT Edit Text font stack the app builds for the Aptos Narrow
// table cell: ['<embedded subset>', '<full installed>', 'Aptos Narrow', sans-serif]
// and measure the rendered text width in an SVG <foreignObject>. If this comes
// out WIDE (~sans-serif), the embedded subset (first in the stack) is hijacking
// the render — which is what the user sees (wide font → wrap → truncation).
const { app, BrowserWindow } = require('electron')
const { readFileSync } = require('node:fs')
const zlib = require('node:zlib')
const { PDFDocument, PDFName, PDFDict, PDFRawStream } = require('pdf-lib')

const PDF = process.argv.find(a => a.endsWith('.pdf')) || 'C:/Users/emiso/Downloads/pages14.pdf'
const FULL = 'C:/Users/emiso/AppData/Local/Microsoft/Windows/Fonts/Aptos-Narrow-Bold.ttf'

async function extractAptosSubset() {
  const doc = await PDFDocument.load(readFileSync(PDF), { ignoreEncryption: true })
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue
    if (obj.get(PDFName.of('Type')) !== PDFName.of('Font')) continue
    const bn = obj.get(PDFName.of('BaseFont'))?.toString() ?? ''
    if (!/Aptos.*Narrow.*Bold/i.test(bn)) continue
    const fd = obj.lookupMaybe(PDFName.of('FontDescriptor'), PDFDict)
    const s = fd && fd.lookupMaybe(PDFName.of('FontFile2'), PDFRawStream)
    if (!s) continue
    const raw = Buffer.from(s.getContents())
    const isFlate = (s.dict.get(PDFName.of('Filter'))?.toString() ?? '').includes('Flate')
    return isFlate ? zlib.inflateSync(raw) : raw
  }
  return null
}

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const sub = await extractAptosSubset()
  if (!sub) { console.error('could not extract Aptos subset'); app.quit(); return }
  const subB64 = Buffer.from(sub).toString('base64')
  const fullB64 = readFileSync(FULL).toString('base64')
  console.log('subset bytes:', sub.length, ' full bytes:', readFileSync(FULL).length)

  const win = new BrowserWindow({ show: false, width: 900, height: 400 })
  await win.loadURL('data:text/html;charset=utf-8,<!doctype html><html><body></body></html>')

  const script = `(async () => {
    const dec = (b64) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i=0;i<s.length;i++) u[i]=s.charCodeAt(i); return u; };
    const sub = dec(${JSON.stringify(subB64)});
    const full = dec(${JSON.stringify(fullB64)});
    const out = {};
    let subLoaded = true, fullLoaded = true;
    const ffSub = new FontFace('subset', sub);
    try { await ffSub.load(); document.fonts.add(ffSub); } catch(e){ subLoaded = 'THREW: '+e.message; }
    const ffFull = new FontFace('fullfont', full);
    try { await ffFull.load(); document.fonts.add(ffFull); } catch(e){ fullLoaded = 'THREW: '+e.message; }
    out.subLoaded = subLoaded; out.fullLoaded = fullLoaded;
    await document.fonts.ready;
    out.subHasDigits = document.fonts.check("40px 'subset'");      // true if claims coverage
    out.subHasGlyph2 = (() => { try { return document.fonts.check("40px 'subset'", '2'); } catch { return '?' } })();

    const svgNS = 'http://www.w3.org/2000/svg';
    const measure = (fam, txt) => {
      const svg = document.createElementNS(svgNS,'svg'); svg.setAttribute('width','600'); svg.setAttribute('height','80');
      const fo = document.createElementNS(svgNS,'foreignObject'); fo.setAttribute('width','600'); fo.setAttribute('height','80');
      const d = document.createElement('div');
      d.style.cssText = "display:inline-block;font-size:40px;font-weight:bold;white-space:nowrap;font-family:"+fam;
      d.textContent = txt; fo.appendChild(d); svg.appendChild(fo); document.body.appendChild(svg);
      const w = Math.round(d.getBoundingClientRect().width); return w;
    };
    const TXT = '13-3/8\\" 10567';
    out.w_sansserif = measure('sans-serif', TXT);
    out.w_fullOnly  = measure("'fullfont', sans-serif", TXT);
    out.w_subOnly   = measure("'subset', sans-serif", TXT);
    // The REAL app stack: subset first, then full, then name, then generic.
    out.w_appStack  = measure("'subset', 'fullfont', 'Aptos Narrow', sans-serif", TXT);
    // Same but full first.
    out.w_fullFirst = measure("'fullfont', 'subset', sans-serif", TXT);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return out;
  })()`;

  try {
    const r = await win.webContents.executeJavaScript(script)
    console.log(JSON.stringify(r, null, 2))
    console.log('\nWIDE (~' + r.w_sansserif + ') = wrong font;  NARROW (~' + r.w_fullOnly + ') = correct Aptos Narrow Bold')
    console.log('app stack renders:', r.w_appStack === r.w_sansserif ? 'WIDE (subset hijacked → BUG)' :
      Math.abs(r.w_appStack - r.w_fullOnly) <= 3 ? 'NARROW (correct)' : 'OTHER (' + r.w_appStack + ')')
  } catch (e) { console.error('ERROR', e) }
  win.destroy(); app.quit()
})
