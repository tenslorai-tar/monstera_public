// src/renderer/utils/extractTables.ts
import * as XLSX from "xlsx";
function median(nums) {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function clusterRows(items) {
  if (items.length === 0) return [];
  const tol = Math.min(16, Math.max(4, median(items.map((i) => i.h).filter((h) => h > 0)) * 0.55));
  const sorted = [...items].sort((a, b) => b.y + b.h / 2 - (a.y + a.h / 2) || a.x - b.x);
  const rows = [];
  let cur = [];
  let sum = 0;
  for (const it of sorted) {
    const yc = it.y + it.h / 2;
    if (cur.length === 0 || Math.abs(yc - sum / cur.length) <= tol) {
      cur.push(it);
      sum += yc;
    } else {
      rows.push(cur);
      cur = [it];
      sum = yc;
    }
  }
  if (cur.length) rows.push(cur);
  return rows;
}
function whitespaceSeparators(rows) {
  if (rows.length < 2) return [];
  let maxX = 0;
  for (const r of rows) for (const it of r) maxX = Math.max(maxX, it.x + it.w);
  const W = Math.ceil(maxX) + 2;
  if (W <= 0 || W > 2e4) return [];
  const cover = new Uint16Array(W);
  for (const r of rows) {
    const hit = new Uint8Array(W);
    for (const it of r) {
      const a = Math.max(0, Math.floor(it.x));
      const b = Math.min(W - 1, Math.ceil(it.x + it.w));
      for (let x = a; x <= b; x++) hit[x] = 1;
    }
    for (let x = 0; x < W; x++) cover[x] += hit[x];
  }
  const R = rows.length;
  const gapThr = Math.max(0, Math.floor(R * 0.12));
  const sideThr = Math.max(2, Math.ceil(R * 0.15));
  let minX = -1, maxCov = -1;
  for (let x = 0; x < W; x++) if (cover[x] > gapThr) {
    if (minX < 0) minX = x;
    maxCov = x;
  }
  if (minX < 0) return [];
  const sideWin = Math.max(40, Math.round((maxCov - minX) * 0.08));
  const minGap = Math.max(5, Math.round((maxCov - minX) * 5e-3));
  const seps = [];
  let gapStart = -1;
  for (let x = minX; x <= maxCov + 1; x++) {
    const inGap = x <= maxCov && cover[x] <= gapThr;
    if (inGap && gapStart < 0) gapStart = x;
    else if (!inGap && gapStart >= 0) {
      const gapEnd = x - 1;
      if (gapEnd - gapStart + 1 >= minGap) {
        let lOk = false, rOk = false;
        for (let l = gapStart - 1; l >= Math.max(minX, gapStart - sideWin); l--) if (cover[l] >= sideThr) {
          lOk = true;
          break;
        }
        for (let r = gapEnd + 1; r <= Math.min(maxCov, gapEnd + sideWin); r++) if (cover[r] >= sideThr) {
          rOk = true;
          break;
        }
        if (lOk && rOk) seps.push((gapStart + gapEnd) / 2);
      }
      gapStart = -1;
    }
  }
  return seps;
}
function detectRuledColumnSeparators(px, renderScale) {
  const { data, width, height } = px;
  const n = px.channels ?? 4;
  const minRun = Math.floor(height * 0.45);
  const lineXs = [];
  let runStart = -1;
  for (let x = 0; x < width; x++) {
    let dark = 0;
    for (let y = 0; y < height; y++) {
      const o = (y * width + x) * n;
      const luma = data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114;
      if (luma < 140) dark++;
    }
    const isLine = dark >= minRun;
    if (isLine && runStart < 0) runStart = x;
    else if (!isLine && runStart >= 0) {
      if (x - runStart <= 12) lineXs.push((runStart + x - 1) / 2);
      runStart = -1;
    }
  }
  if (runStart >= 0 && width - runStart <= 12) lineXs.push((runStart + width - 1) / 2);
  if (lineXs.length < 2) return null;
  return lineXs.map((x) => x / renderScale);
}
function trimGrid(grid) {
  const rows = grid.filter((r) => r.some((c) => c !== ""));
  if (rows.length === 0) return [];
  const nCols = Math.max(...rows.map((r) => r.length));
  const keep = [];
  for (let c = 0; c < nCols; c++) if (rows.some((r) => (r[c] ?? "") !== "")) keep.push(c);
  return rows.map((r) => keep.map((c) => r[c] ?? ""));
}
function itemsToGrid(items, separators) {
  const rows = clusterRows(items);
  if (rows.length === 0) return [];
  const seps = separators && separators.length >= 1 ? separators : whitespaceSeparators(rows);
  if (seps.length >= 1) {
    const sorted = [...seps].sort((a, b) => a - b);
    return trimGrid(rows.map((r) => {
      const cells = new Array(sorted.length + 1).fill("");
      for (const it of [...r].sort((a, b) => a.x - b.x)) {
        const xc = it.x + it.w / 2;
        let ci = 0;
        while (ci < sorted.length && xc > sorted[ci]) ci++;
        cells[ci] = cells[ci] ? `${cells[ci]} ${it.str}` : it.str;
      }
      return cells;
    }));
  }
  const xs = items.map((i) => i.x).sort((a, b) => a - b);
  const colTol = 14;
  const cols = [];
  for (const x of xs) {
    if (cols.length === 0 || x - cols[cols.length - 1] > colTol) cols.push(x);
  }
  return trimGrid(rows.map((r) => {
    const cells = new Array(cols.length).fill("");
    for (const it of [...r].sort((a, b) => a.x - b.x)) {
      let ci = 0;
      for (let c = 0; c < cols.length; c++) if (cols[c] <= it.x + 2) ci = c;
      cells[ci] = cells[ci] ? `${cells[ci]} ${it.str}` : it.str;
    }
    return cells;
  }));
}
async function nativeItems(pdfDoc, pageNum) {
  const page = await pdfDoc.getPage(pageNum);
  const tc = await page.getTextContent();
  return tc.items.filter((it) => "str" in it && it.str.trim()).map((it) => ({ str: it.str.trim(), x: it.transform[4], y: it.transform[5], w: it.width, h: it.height || 0 }));
}
function ocrWordsToItems(words) {
  return words.filter((w) => w.text.trim()).map((w) => ({ str: w.text.trim(), x: w.x, y: w.y, w: w.w, h: w.h }));
}
function segmentTableCells(px) {
  const { data, width: w, height: h } = px;
  const n = px.channels ?? 4;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * n;
      if (data[o] * 0.299 + data[o + 1] * 0.587 + data[o + 2] * 0.114 < 160) mask[y * w + x] = 1;
    }
  }
  const ink = new Uint8Array(mask);
  const Lh = Math.max(30, Math.round(w * 0.04));
  for (let y = 0; y < h; y++) {
    let start = -1;
    for (let x = 0; x <= w; x++) {
      const on = x < w && mask[y * w + x] === 1;
      if (on && start < 0) start = x;
      else if (!on && start >= 0) {
        if (x - start >= Lh) for (let i = start; i < x; i++) ink[y * w + i] = 0;
        start = -1;
      }
    }
  }
  const Lv = Math.max(30, Math.round(h * 0.04));
  for (let x = 0; x < w; x++) {
    let start = -1;
    for (let y = 0; y <= h; y++) {
      const on = y < h && mask[y * w + x] === 1;
      if (on && start < 0) start = y;
      else if (!on && start >= 0) {
        if (y - start >= Lv) for (let i = start; i < y; i++) ink[i * w + x] = 0;
        start = -1;
      }
    }
  }
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (!ink[start] || visited[start]) continue;
    let head = 0, tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    let minX = w, maxX = 0, minY = h, maxY = 0;
    while (head < tail) {
      const idx = queue[head++];
      const y = idx / w | 0, x = idx - y * w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          const n2 = ny * w + nx;
          if (ink[n2] && !visited[n2]) {
            visited[n2] = 1;
            queue[tail++] = n2;
          }
        }
      }
    }
    const bw = maxX - minX + 1, bh = maxY - minY + 1;
    if (tail <= 2 || bh <= 4 && bw >= 10 && bw >= 3 * bh || bw <= 5 && bh >= 45 || bw >= w * 0.35 || bh >= h * 0.35) {
      for (let i = 0; i < tail; i++) ink[queue[i]] = 0;
    }
  }
  const inkRow = new Uint32Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (ink[y * w + x]) inkRow[y]++;
    }
  }
  const rowFloor = Math.max(2, Math.round(w * 4e-3));
  const bandsFromInk = (proj, size, floor, mergeGap, minLen) => {
    const runs = [];
    let start = -1;
    for (let i = 0; i <= size; i++) {
      const on = i < size && proj[i] > floor;
      if (on && start < 0) start = i;
      else if (!on && start >= 0) {
        runs.push([start, i - 1]);
        start = -1;
      }
    }
    const merged = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && r[0] - last[1] <= mergeGap) last[1] = r[1];
      else merged.push([...r]);
    }
    return merged.filter((b) => b[1] - b[0] + 1 >= minLen);
  };
  const rowBands = bandsFromInk(inkRow, h, rowFloor, 3, 5);
  if (rowBands.length === 0) return { cells: [], rows: 0, cols: 0 };
  const bandHeights = rowBands.map(([y1, y2]) => y2 - y1 + 1).sort((a, b) => a - b);
  const minRunH = Math.max(4, Math.round(bandHeights[Math.floor(bandHeights.length / 2)] * 0.2));
  const rowRuns = rowBands.map(([y1, y2]) => {
    const proj = new Uint32Array(w);
    for (let y = y1; y <= y2; y++) for (let x = 0; x < w; x++) if (ink[y * w + x]) proj[x]++;
    return bandsFromInk(proj, w, 0, Math.max(6, Math.round(w * 8e-3)), 3).map(([x1, x2]) => {
      let a = y2, b = y1, count = 0;
      for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) {
          if (ink[y * w + x]) {
            count++;
            if (y < a) a = y;
            if (y > b) b = y;
          }
        }
      }
      return { x1, x2, y1: a, y2: b, count };
    }).filter((r) => r.y2 - r.y1 + 1 >= minRunH && r.count >= 8);
  });
  const itemRows = rowRuns.map((rs) => rs.map((r) => ({ str: "x", x: r.x1, y: 0, w: r.x2 - r.x1 + 1, h: r.y2 - r.y1 + 1 })));
  const seps = whitespaceSeparators(itemRows);
  const nCols = seps.length + 1;
  if (typeof process !== "undefined" && process.env?.MONSTERA_SEG_DEBUG) {
    console.log("[seg] minRunH", minRunH, "bands", rowBands.length, "seps", seps);
    rowRuns.slice(0, 16).forEach((rs, i) => console.log("[seg] row", i, rs.map((r) => `${r.x1}..${r.x2}(h${r.y2 - r.y1 + 1})`).join(" ")));
  }
  const cells = [];
  for (let ri = 0; ri < rowBands.length; ri++) {
    const merged = /* @__PURE__ */ new Map();
    for (const run of rowRuns[ri]) {
      const center = (run.x1 + run.x2) / 2;
      let ci = 0;
      while (ci < seps.length && center > seps[ci]) ci++;
      const m = merged.get(ci);
      if (!m) merged.set(ci, { ...run });
      else {
        m.x1 = Math.min(m.x1, run.x1);
        m.x2 = Math.max(m.x2, run.x2);
        m.y1 = Math.min(m.y1, run.y1);
        m.y2 = Math.max(m.y2, run.y2);
        m.count += run.count;
      }
    }
    for (const [ci, m] of merged) {
      if (m.count < 15) continue;
      const pad = 4;
      const cx = Math.max(0, m.x1 - pad);
      const cy = Math.max(0, m.y1 - pad);
      cells.push({
        row: ri,
        col: ci,
        x: cx,
        y: cy,
        w: Math.min(w - 1, m.x2 + pad) - cx + 1,
        h: Math.min(h - 1, m.y2 + pad) - cy + 1
      });
    }
  }
  return { cells, rows: rowBands.length, cols: nCols };
}
function azureResultToGrids(result, wantedPages) {
  const r = result ?? {};
  const tablesByPage = /* @__PURE__ */ new Map();
  for (const t of r.tables ?? []) {
    const pn = t.boundingRegions?.[0]?.pageNumber ?? t.cells?.[0]?.boundingRegions?.[0]?.pageNumber;
    if (!pn) continue;
    if (!tablesByPage.has(pn)) tablesByPage.set(pn, []);
    tablesByPage.get(pn).push(t);
  }
  const pagesByNum = /* @__PURE__ */ new Map();
  for (const p of r.pages ?? []) pagesByNum.set(p.pageNumber, p);
  const grids = [];
  for (const pn of wantedPages) {
    const tables = tablesByPage.get(pn) ?? [];
    if (tables.length > 0) {
      const grid = [];
      for (const t of tables) {
        if (grid.length > 0) grid.push([]);
        const base = grid.length;
        for (let ri = 0; ri < t.rowCount; ri++) grid.push(new Array(t.columnCount).fill(""));
        for (const c of t.cells ?? []) {
          if (c.rowIndex < t.rowCount && c.columnIndex < t.columnCount)
            grid[base + c.rowIndex][c.columnIndex] = (c.content ?? "").replace(/\n/g, " ").trim();
        }
      }
      grids.push({ page: pn, grid: trimGrid(grid), source: "azure" });
      continue;
    }
    const page = pagesByNum.get(pn);
    if (!page?.words?.length) {
      grids.push({ page: pn, grid: [], source: "azure" });
      continue;
    }
    const mult = page.unit === "inch" ? 72 : 1;
    const pageH = (page.height ?? 11) * mult;
    const items = [];
    for (const w of page.words) {
      const poly = w.polygon ?? [];
      if (poly.length < 8 || !w.content.trim()) continue;
      const xsP = [poly[0], poly[2], poly[4], poly[6]].map((v) => v * mult);
      const ysP = [poly[1], poly[3], poly[5], poly[7]].map((v) => v * mult);
      const x0 = Math.min(...xsP), x1 = Math.max(...xsP);
      const y0 = Math.min(...ysP), y1 = Math.max(...ysP);
      items.push({ str: w.content.trim(), x: x0, y: pageH - y1, w: x1 - x0, h: y1 - y0 });
    }
    grids.push({ page: pn, grid: itemsToGrid(items), source: "azure" });
  }
  return grids;
}
var NUM_RE = /^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;
function toCellValue(s) {
  const t = s.trim();
  if (NUM_RE.test(t) && !/^0\d/.test(t)) {
    const n = Number(t.replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return s;
}
function gridsToXlsx(grids) {
  const wb = XLSX.utils.book_new();
  let any = false;
  for (const g of grids) {
    if (g.grid.length === 0) continue;
    const aoa = g.grid.map((row) => row.map(toCellValue));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), `Page ${g.page}`.slice(0, 31));
    any = true;
  }
  if (!any) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["(no extractable text)"]]), "Empty");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }));
}
export {
  azureResultToGrids,
  clusterRows,
  detectRuledColumnSeparators,
  gridsToXlsx,
  itemsToGrid,
  nativeItems,
  ocrWordsToItems,
  segmentTableCells,
  trimGrid,
  whitespaceSeparators
};
