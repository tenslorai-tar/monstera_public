# Monstera PDF Editor — Project Guide

## Goal
A feature-rich desktop PDF editor for **personal use only** on Windows.
It will never be distributed. Ignore all software-licensing obligations (AGPL fine)
and ignore code signing entirely. Target quality: comparable to PDF-XChange Editor.

---

## Locked Tech Stack (do not change without explicit instruction)

| Layer | Library | Responsibility |
|---|---|---|
| Desktop shell | Electron | Window management, native OS integration, .exe packaging |
| UI framework | React + Vite + TypeScript | All renderer-side UI and state |
| PDF rendering | pdfjs-dist (PDF.js) | Render pages to canvas, text layer, search |
| PDF editing | pdf-lib | Page operations, annotations, forms, metadata, encryption |
| Heavy PDF ops | mupdf (WASM) | Operations PDF.js/pdf-lib cannot do (redaction, advanced rendering, etc.) |
| OCR | tesseract.js | Optical character recognition on scanned pages |
| Packaging | electron-builder | Produce Windows NSIS installer + portable .exe |

> **Rule:** When a library cannot do something, propose swapping in a more capable
> library — never hand-roll PDF parsing.

---

## Folder Structure

```
Monstera PDF Editor/
├── src/
│   ├── main/           # Electron main process (Node context)
│   │   └── main.ts     # App lifecycle, BrowserWindow, IPC handlers
│   ├── preload/        # Preload script — bridges main ↔ renderer safely
│   │   └── preload.ts  # contextBridge exposures (electronAPI)
│   └── renderer/       # React app (browser context, no direct Node access)
│       ├── components/ # Reusable React components
│       ├── hooks/      # Custom React hooks
│       ├── store/      # Global state (zustand or similar)
│       ├── utils/      # Pure helper functions
│       ├── types/      # TypeScript type declarations
│       ├── styles/     # CSS files
│       ├── App.tsx     # Root component
│       └── main.tsx    # ReactDOM entry point
├── assets/
│   └── icons/          # App icons (.ico, .png)
├── dist/               # Vite build output (gitignored)
├── dist-electron/      # Compiled Electron main/preload (gitignored)
├── release/            # electron-builder output — installer + portable (gitignored)
├── index.html          # Vite HTML entry
├── vite.config.ts      # Vite configuration
├── tsconfig.json       # TypeScript config for renderer
├── tsconfig.electron.json  # TypeScript config for main + preload
└── package.json        # npm scripts, dependencies, electron-builder config
```

---

## Coding Conventions

- **TypeScript everywhere** — strict mode, no `any` except as last resort.
- **Functional React components** — no class components; hooks for all state/effects.
- **IPC pattern** — renderer calls `window.electronAPI.*` (exposed via contextBridge);
  main process handles `ipcMain.handle(...)`. Never enable nodeIntegration in renderer.
- **No comments** unless the *why* is non-obvious (hidden constraints, workarounds).
- **No premature abstractions** — three similar lines beats an early helper function.
- **Commit after each working feature** (see rule below).

> **Rule:** Commit to git after each working feature.

---

## Feature Checklist

### Phase 0 — Project Scaffold ✅
- [x] Electron + React + Vite + TypeScript scaffold
- [x] Secure Electron setup (contextIsolation, preload, IPC)
- [x] All libraries installed (pdfjs-dist, pdf-lib, mupdf, tesseract.js, electron-builder)
- [x] Minimal UI: toolbar with Open PDF button
- [x] PDF.js renders page 1 to canvas
- [x] electron-builder: NSIS installer + portable .exe (win, x64)
- [x] Git initialized with .gitignore and first commit
- [x] CLAUDE.md created

### Phase 1 — Core Viewer
- [ ] Multi-page rendering and scrolling
- [ ] Zoom controls (fit-width, fit-page, percentage)
- [ ] Page thumbnail panel (sidebar)
- [ ] Keyboard navigation (arrow keys, Page Up/Down)
- [ ] Recent files list

### Phase 2 — Text & Search
- [ ] PDF.js text layer overlay (selectable text)
- [ ] Find/Replace panel (Ctrl+F)
- [ ] Search highlight and navigation
- [ ] Copy selected text to clipboard

### Phase 3 — Annotations
- [ ] Highlight annotation tool
- [ ] Sticky note / comment tool
- [ ] Freehand draw tool
- [ ] Annotation list panel
- [ ] Save annotations back to PDF (pdf-lib)

### Phase 4 — Page Management
- [ ] Page reorder (drag-and-drop thumbnails)
- [ ] Delete pages
- [ ] Insert blank page
- [ ] Rotate pages
- [ ] Extract pages to new PDF
- [ ] Merge PDFs

### Phase 5 — Forms
- [ ] Render AcroForm fields (PDF.js)
- [ ] Fill in form fields
- [ ] Flatten form to PDF (pdf-lib)
- [ ] Export form data (FDF / JSON)

### Phase 6 — OCR
- [ ] Detect scanned (image-only) pages
- [ ] Run tesseract.js OCR on selected pages
- [ ] Overlay invisible text layer from OCR results
- [ ] Export OCR'd PDF

### Phase 7 — Advanced Editing (mupdf)
- [ ] Redaction tool (black-out and burn-in text/areas)
- [ ] Edit existing text in-place
- [ ] Image extraction and replacement
- [ ] Crop page

### Phase 8 — Security & Metadata
- [ ] View and edit document metadata (title, author, etc.)
- [ ] Password-protect PDF (pdf-lib encryption)
- [ ] Remove password from PDF
- [ ] Flatten/sanitize document

### Phase 9 — Polish & UX
- [ ] Dark/light theme toggle
- [ ] Customizable toolbar
- [ ] Print support
- [ ] Auto-updater (electron-updater, self-hosted or local)
- [ ] Keyboard shortcut reference panel
