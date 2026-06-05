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

### Phase 1 — Core Viewer ✅
- [x] Multi-page continuous scroll with lazy rendering (IntersectionObserver per page)
- [x] Zoom controls: fit-width, fit-page, percentage presets, +/- buttons, Ctrl+scroll
- [x] Collapsible thumbnail sidebar (lazy-rendered, click to jump)
- [x] Current page / total pages display with click-to-jump go-to-page input
- [x] Keyboard shortcuts: Ctrl+O, Ctrl+F, Ctrl++/-, Ctrl+0, PageUp/Down, Alt+Arrow
- [x] Recent files list on start screen (localStorage, up to 10)
- [x] PDF.js text layer (selectable + copyable text)
- [x] Full-text search with highlighted matches and Prev/Next navigation (Ctrl+F)

### Phase 2 — Page Management ✅
- [x] Delete page(s) — right-click context menu or Page Ops bar when multiple selected
- [x] Rotate page(s) 90°/180°/270° — context menu or Page Ops bar
- [x] Reorder pages by drag-and-drop in thumbnail sidebar
- [x] Duplicate a page — context menu
- [x] Insert blank page before/after — context menu
- [x] Insert pages from another PDF — context menu
- [x] Insert pages from an image (PNG, JPEG) — context menu
- [x] Extract selected pages to new PDF — context menu / Page Ops bar
- [x] Merge multiple PDFs into current document — toolbar Merge button
- [x] Split PDF by page ranges or one-per-page — toolbar Split button + dialog
- [x] Save (Ctrl+S) and Save As (Ctrl+Shift+S) with file dialogs via IPC
- [x] Undo/redo stack (up to 10 states) — Ctrl+Z / Ctrl+Y
- [x] Unsaved-changes indicator (● in title) and Save button enabled when dirty

### Phase 3 — Text & Search
- [ ] Find/Replace (replace not yet implemented)
- [x] Copy selected text to clipboard (works natively via text layer)

### Phase 4 — Annotations ✅
- [x] Highlight, underline, strikethrough text markup — select text with tool active, mouseup captures selection
- [x] Freehand ink / pen drawing — click-drag on page canvas
- [x] Shapes: rectangle, ellipse, line, arrow — click-drag to draw
- [x] Text box — drag to define area, type in inline textarea, blur/Enter to commit
- [x] Sticky note / comment — click to place; popup shows editable text
- [x] Stamps: Approved, Draft, Confidential, Rejected, Custom image — single click to place
- [x] Eraser tool — click any annotation to delete it
- [x] Select tool — click to select (highlight border); Delete key removes selected
- [x] Color, opacity, line-width, font-size controls in annotation toolbar
- [x] Annotations panel (≡ Panel button) — lists all annotations by page, click to jump
- [x] Annotations saved as real PDF annotation objects (pdf-lib) on Ctrl+S / Save As
- [x] Annotations loaded back when PDF is reopened (PDF.js getAnnotations)
- [x] Annotations survive page operations (delete, rotate, reorder) via baked-bytes path
- [x] PDF.js native annotation rendering disabled — overlay renders all annotations

**How to test each feature:**
| Feature | Steps |
|---|---|
| **Highlight** | Select "H" tool → click-drag over text in PDF → yellow highlight appears |
| **Underline** | Select "U" tool → click-drag over text → underline appears |
| **Strikethrough** | Select "S" tool → click-drag over text → strikethrough appears |
| **Ink** | Select ✏ tool → click-drag freely on page → freehand stroke drawn |
| **Rectangle** | Select □ tool → click-drag → rectangle outline drawn |
| **Ellipse** | Select ○ tool → click-drag → ellipse outline drawn |
| **Line** | Select ╱ tool → click-drag → line drawn |
| **Arrow** | Select → tool → click-drag → arrow with arrowhead |
| **Text Box** | Select T tool → click-drag box area → type text → click outside to commit |
| **Sticky Note** | Select 📌 tool → click on page → yellow popup appears; type note |
| **Stamp** | Select ⬡ tool, pick stamp type in dropdown → click on page → stamp appears |
| **Erase** | Select ⌫ tool → click any annotation → it disappears |
| **Select** | Select ↖ tool or no tool → click annotation → blue highlight; press Delete |
| **Color** | Pick color in toolbar color swatch → affects next annotation drawn |
| **Panel** | Click "≡ Panel" → right panel lists all annotations; click to jump to page |
| **Persist** | Add annotations → Ctrl+S → reopen file → annotations still present |
| **Page ops** | Add annotations → delete/rotate page → save → reopen → annotations on correct pages |

### Phase 5 — Forms ✅
- [x] Render AcroForm fields (PDF.js) — text, checkbox, radio, dropdown, list box, signature
- [x] Fill in form fields — interactive HTML overlays per field type
- [x] Flatten form to PDF (pdf-lib) — "⊞ Flatten" button bakes all values into page content
- [x] Form field creation — draw new text fields, checkboxes, signature areas onto any page
- [x] Forms panel — list all fields by page, click to jump, delete individual fields
- [ ] Export form data (FDF / JSON)

**How to test each feature:**
| Feature | Steps |
|---|---|
| **Fill text field** | Open a PDF with AcroForm fields → click any text field → type value |
| **Fill checkbox** | Open a form PDF → click a checkbox → it toggles checked/unchecked |
| **Fill radio button** | Open a form PDF → click a radio button → it selects that option |
| **Fill dropdown** | Open a form PDF → click a dropdown → pick an option |
| **Fill listbox** | Open a form PDF → click options in a list box |
| **Save filled form** | Fill fields → Ctrl+S → reopen → field values persist |
| **Forms mode** | Click "📋 Forms" button in toolbar → form creation tools appear |
| **Draw text field** | Forms mode → click T button → drag a rectangle on page → text field appears |
| **Draw checkbox** | Forms mode → click ☑ button → drag a small square → checkbox appears |
| **Draw signature** | Forms mode → click ✍ button → drag a rectangle → signature area appears |
| **Flatten** | Fill fields → click "⊞ Flatten" → Ctrl+S → reopen → fields are baked into content |
| **Forms panel** | Forms mode → click "≡ Fields" → panel lists all fields; click to jump |

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
