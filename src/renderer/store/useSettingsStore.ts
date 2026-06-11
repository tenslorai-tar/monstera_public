import { create } from 'zustand'

export type Theme = 'dark' | 'light'
export type DefaultZoom = number | 'fit-width' | 'fit-page'

export interface AppSettings {
  theme: Theme
  defaultZoom: DefaultZoom
  ocrLanguage: string
  autosaveIntervalMinutes: number   // 0 = disabled
  showPageNumbers: boolean
  showRulers: boolean
  showGrid: boolean
  autoscrollSpeed: number           // 0 = disabled, 1-10 scale
  darkPageMode: boolean
  loupeEnabled: boolean
  pdfiumRender: boolean             // render pages with PDFium instead of PDF.js
  renderQuality: number             // extra supersample ×1–×3 on top of devicePixelRatio (1 = pixel-perfect)
  settingsVersion: number
  measureUnit: string
  measureScale: number
  // UX / personalization
  accentColor: string               // '' = theme default, else a hex that repaints the UI
  reduceMotion: boolean             // disable transitions/animations
  restoreLastSession: boolean       // reopen the most recent file on launch
  defaultToolColor: string          // default colour for new annotations
  zoomStep: number                  // zoom in/out increment (0.1–0.5)
  confirmRedaction: boolean         // warn before applying redactions
  highContrast: boolean             // stronger borders/text contrast
  // Tier 3
  anthropicApiKey: string
  aiModel: string
  rtlText: boolean
  gdToken: string         // Google Drive OAuth token
  dropboxToken: string    // Dropbox access token
  onedriveToken?: string  // OneDrive / Graph API token
  boxToken?: string       // Box.com access token
  sharepointToken?: string
  sharepointSite?: string
  docusignKey: string     // DocuSign integration key
  docusignAccountId: string
  docusignBasePath: string
  azureDiEndpoint: string // Azure Document Intelligence resource endpoint
  azureDiKey: string      // Azure Document Intelligence API key
}

const STORAGE_KEY = 'monstera-settings'

// Secret fields encrypted at rest via the OS keychain (Electron safeStorage).
// Everything degrades to plaintext passthrough when the bridge is unavailable
// (e.g. the browser dev preview), so settings never break.
export const SECRET_KEYS: (keyof AppSettings)[] = [
  'anthropicApiKey', 'gdToken', 'dropboxToken', 'onedriveToken',
  'boxToken', 'sharepointToken', 'docusignKey', 'azureDiKey',
]

function encSecret(v: string): string {
  try {
    const r = window.electronAPI?.secureEncryptSync?.(v)
    return typeof r === 'string' ? r : v
  } catch { return v }
}
function decSecret(v: string): string {
  try {
    const r = window.electronAPI?.secureDecryptSync?.(v)
    return typeof r === 'string' ? r : v
  } catch { return v }
}

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const stored = JSON.parse(raw) as Partial<AppSettings>
      const parsed = { ...defaults(), ...stored } as AppSettings
      const rec = parsed as unknown as Record<string, unknown>
      for (const k of SECRET_KEYS) {
        const val = rec[k]
        if (typeof val === 'string' && val) rec[k] = decSecret(val)
      }
      // Migrate persisted settings that point at a retired model id.
      if (parsed.aiModel === 'claude-opus-4-20250514') parsed.aiModel = 'claude-opus-4-8'
      // v2: renderQuality changed meaning. It used to be an absolute supersample
      // factor (1–5, default 3) whose fractional CSS downscale blurred text on
      // HiDPI displays; it is now an extra multiplier on top of devicePixelRatio
      // where 1 means pixel-perfect. Old values would massively over-render.
      // The version must be read from what was STORED — the defaults() spread
      // above already injects the current version.
      if ((stored.settingsVersion ?? 1) < 2) {
        parsed.renderQuality = 1
        parsed.settingsVersion = 2
      }
      return parsed
    }
  } catch {}
  return defaults()
}

function defaults(): AppSettings {
  return {
    theme: 'dark',
    defaultZoom: 1.5,
    ocrLanguage: 'eng',
    autosaveIntervalMinutes: 0,
    showPageNumbers: true,
    showRulers: false,
    showGrid: false,
    autoscrollSpeed: 0,
    darkPageMode: false,
    loupeEnabled: false,
    pdfiumRender: false,
    renderQuality: 1,
    settingsVersion: 2,
    measureUnit: 'pt',
    measureScale: 1.0,
    accentColor: '',
    reduceMotion: false,
    restoreLastSession: false,
    defaultToolColor: '#16a34a',
    zoomStep: 0.25,
    confirmRedaction: true,
    highContrast: false,
    // Tier 3
    anthropicApiKey: '',
    aiModel: 'claude-opus-4-8',
    rtlText: false,
    gdToken: '',
    dropboxToken: '',
    onedriveToken: '',
    boxToken: '',
    sharepointToken: '',
    sharepointSite: '',
    docusignKey: '',
    docusignAccountId: '',
    docusignBasePath: 'https://demo.docusign.net/restapi',
    azureDiEndpoint: '',
    azureDiKey: '',
  }
}

function persist(s: AppSettings) {
  try {
    const toStore = { ...s } as AppSettings
    const rec = toStore as unknown as Record<string, unknown>
    for (const k of SECRET_KEYS) {
      const val = rec[k]
      if (typeof val === 'string' && val) rec[k] = encSecret(val)
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
  } catch {}
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

function applyAccent(hex: string) {
  const el = document.documentElement
  if (hex) el.style.setProperty('--accent', hex)
  else el.style.removeProperty('--accent')
}

function applyToggle(attr: string, on: boolean) {
  if (on) document.documentElement.setAttribute(attr, '')
  else document.documentElement.removeAttribute(attr)
}

interface SettingsStore {
  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => void
  resetSettings: () => void
}

const initial = load()
applyTheme(initial.theme)
applyAccent(initial.accentColor)
applyToggle('data-reduce-motion', initial.reduceMotion)
applyToggle('data-high-contrast', initial.highContrast)

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: initial,

  updateSettings: (patch) => set(s => {
    const next = { ...s.settings, ...patch }
    persist(next)
    if (patch.theme) applyTheme(patch.theme)
    if (patch.accentColor !== undefined) applyAccent(next.accentColor)
    if (patch.reduceMotion !== undefined) applyToggle('data-reduce-motion', next.reduceMotion)
    if (patch.highContrast !== undefined) applyToggle('data-high-contrast', next.highContrast)
    return { settings: next }
  }),

  resetSettings: () => set(() => {
    const d = defaults()
    persist(d)
    applyTheme(d.theme)
    applyAccent(d.accentColor)
    applyToggle('data-reduce-motion', d.reduceMotion)
    applyToggle('data-high-contrast', d.highContrast)
    return { settings: d }
  }),
}))
