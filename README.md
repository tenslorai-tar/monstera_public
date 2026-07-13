# Monstera PDF Editor

A feature-rich desktop PDF editor for Windows, built with Electron + React + TypeScript.
It aims for PDF-XChange-level capability: viewing, page management, annotations, forms,
OCR, redaction, digital signatures, in-place text editing, and export to Office formats.

> Personal-use project. Not distributed. See `CLAUDE.md` for the full feature checklist
> and per-feature test steps.

## Tech stack

| Layer | Library | Responsibility |
|---|---|---|
| Desktop shell | Electron 42 | Window management, native OS integration, packaging |
| UI | React 18 + Vite 6 + TypeScript | All renderer UI and state (zustand stores) |
| PDF rendering | pdfjs-dist (PDF.js) v6 | Canvas render, text layer, search |
| PDF editing | pdf-lib (aliased to `@cantoo/pdf-lib`) | Page ops, annotations, forms, metadata |
| Heavy PDF ops | mupdf (WASM) v1.27 | Redaction, outline, appearance streams, print |
| In-place text edit | PDFium via koffi FFI (main process) | Line-level content-stream text editing |
| OCR | tesseract.js v7 / TrOCR / Azure | Scanned-page OCR and handwriting |
| Packaging | electron-builder | NSIS installer + portable .exe |

## Project layout

```
src/
  main/        Electron main process (Node): app lifecycle, IPC handlers, native engines
  preload/     contextBridge — the only surface the renderer can call (window.electronAPI)
  renderer/    React app (browser context, no direct Node access)
    components/ UI components and dialogs
    hooks/      Custom hooks (keyboard, page operations)
    store/      zustand stores (usePdfStore, useTabsStore, useSettingsStore, useToastStore)
    utils/      Pure helpers (annotation geometry, tab snapshots, logger, …)
scripts/       Build script + `prove-*.mjs` verification harnesses
```

## Commands

```bash
npm run dev        # Live-reload dev (Vite + Electron)
npm run typecheck  # Strict tsc over renderer AND main/preload (no emit)
npm run lint       # ESLint (flat config; lenient baseline, 0 errors expected)
npm run check      # typecheck + lint — run before committing
npm run build      # typecheck → Vite build → tsc(main) → electron-builder (installer + portable)
```

Build output (after `npm run build`):

- Installer: `release/Monstera PDF Editor Setup <version>.exe`
- Portable:  `release/Monstera PDF Editor <version>.exe`
- Unpacked:  `release/win-unpacked/Monstera PDF Editor.exe`

## Verification harnesses

The `scripts/prove-*.mjs` files exercise the trickiest engines end-to-end and assert on
the result (they are the project's tests). Notable ones:

- `prove-sig-verify.mjs` — signs a PDF, verifies it (valid), tampers one byte, re-verifies (detected).
- `prove-line-edit.mjs`  — line-level Edit Text preserves fonts/colours/spacing; subset fonts stay in-place.
- `prove-pdfa.mjs`, `prove-styled-excel.mjs`, `prove-trocr-excel.mjs`, … — export fidelity.

Run any with `node scripts/<name>.mjs` (needs `npm run build:electron` first for the ones
that import the compiled engine).

## Security posture

- `contextIsolation: true`, `nodeIntegration: false`; the renderer only reaches the main
  process through the `preload` contextBridge.
- In-app navigation is blocked; external links open in the OS browser.
- Permission requests are denied except camera/mic (for the Webcam Capture tool).
- Saves are atomic (temp-file + rename, with retry on Windows AV/lock) and refuse to
  overwrite a target with non-PDF bytes.

## Crash recovery

While a document is dirty, Monstera writes a self-contained recovery copy to `userData/recovery`.
A clean save/close clears it; anything left after an unexpected exit is offered back on next launch.
