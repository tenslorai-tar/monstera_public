// Headless proof of how Electron/Chromium paints a dynamically-loaded FontFace
// in the exact contexts the Edit Text overlay uses: a plain <div>, an SVG
// <foreignObject> (where the replacement text actually renders), and a 2D
// <canvas>. Measures text width per context against sans-serif/serif baselines:
// if a context's width tracks the loaded narrow face, that context paints it.
const { app, BrowserWindow } = require('electron')
const { readFileSync } = require('node:fs')

const FONT = 'C:/Users/emiso/AppData/Local/Microsoft/Windows/Fonts/Aptos-Narrow-Bold.ttf'
const b64 = readFileSync(FONT).toString('base64')

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 900, height: 600,
    webPreferences: { offscreen: false } })
  await win.loadURL('data:text/html;charset=utf-8,<!doctype html><html><body></body></html>')

  const script = `(async () => {
    const out = {};
    const b64 = ${JSON.stringify(b64)};
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);

    // Replicate the app: FontFace from a Uint8Array VIEW (as IPC delivers it).
    const ffView = new FontFace('faceView', u8);
    // And from a fresh ArrayBuffer (control).
    const ffBuf  = new FontFace('faceBuf', u8.buffer.slice(0));
    await Promise.all([ffView.load(), ffBuf.load()]);
    document.fonts.add(ffView); document.fonts.add(ffBuf);
    out.checkView = document.fonts.check("40px 'faceView'");
    out.checkBuf  = document.fonts.check("40px 'faceBuf'");
    await document.fonts.ready;

    const TXT = '13-3/8\\" 10567 TBA';
    const widthDiv = (fam) => {
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;left:-9999px;top:0;font-size:40px;font-weight:bold;white-space:nowrap;font-family:' + fam;
      d.textContent = TXT; document.body.appendChild(d);
      const w = d.getBoundingClientRect().width; return Math.round(w);
    };
    out.div_sans  = widthDiv('sans-serif');
    out.div_serif = widthDiv('serif');
    out.div_faceView = widthDiv("'faceView', sans-serif");
    out.div_faceBuf  = widthDiv("'faceBuf', sans-serif");

    // SVG <foreignObject> — the EXACT context the overlay uses.
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '600'); svg.setAttribute('height', '120');
    const fo = document.createElementNS(svgNS, 'foreignObject');
    fo.setAttribute('width', '600'); fo.setAttribute('height', '120');
    const fod = document.createElement('div');
    // inline-block so the box shrink-wraps to the TEXT width (a block div would
    // just fill the 600px foreignObject and tell us nothing).
    fod.style.cssText = "display:inline-block;font-size:40px;font-weight:bold;white-space:nowrap;font-family:'faceView', sans-serif";
    fod.textContent = TXT;
    fo.appendChild(fod); svg.appendChild(fo); document.body.appendChild(svg);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    out.foreignObject_faceView = Math.round(fod.getBoundingClientRect().width);
    // Also: a <span> (inline) inside foreignObject, and SVG <text>.
    const fospan = document.createElement('span');
    fospan.style.cssText = "font-size:40px;font-weight:bold;white-space:nowrap;font-family:'faceView', sans-serif";
    fospan.textContent = TXT; fod.parentNode.appendChild(fospan);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    out.foreignObject_span = Math.round(fospan.getBoundingClientRect().width);
    const svgText = document.createElementNS(svgNS, 'text');
    svgText.setAttribute('x', '0'); svgText.setAttribute('y', '60');
    svgText.setAttribute('style', "font-size:40px;font-weight:bold;font-family:'faceView', sans-serif");
    svgText.textContent = TXT; svg.appendChild(svgText);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    out.svgText_faceView = Math.round(svgText.getBBox().width);

    // Canvas 2D — known-reliable FontFace consumer.
    await document.fonts.load("bold 40px 'faceView'");
    const c = document.createElement('canvas').getContext('2d');
    c.font = "bold 40px sans-serif";          const wcSans = c.measureText(TXT).width;
    c.font = "bold 40px 'faceView'";          const wcFace = c.measureText(TXT).width;
    out.canvas_sans = Math.round(wcSans);
    out.canvas_faceView = Math.round(wcFace);
    return out;
  })()`;

  try {
    const r = await win.webContents.executeJavaScript(script);
    console.log(JSON.stringify(r, null, 2));
    const narrow = r.div_faceView < r.div_sans - 5;
    console.log('\\nInterpretation:');
    console.log('  loaded face paints narrower than sans-serif (div):  ', narrow);
    console.log('  foreignObject uses the face:                         ', r.foreignObject_faceView < r.div_sans - 5);
    console.log('  canvas uses the face:                                ', r.canvas_faceView < r.canvas_sans - 5);
  } catch (e) {
    console.error('ERROR', e);
  }
  win.destroy(); app.quit();
})
