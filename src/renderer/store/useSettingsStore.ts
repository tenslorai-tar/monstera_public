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
}

const STORAGE_KEY = 'monstera-settings'

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaults(), ...JSON.parse(raw) }
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
  }
}

function persist(s: AppSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

interface SettingsStore {
  settings: AppSettings
  updateSettings: (patch: Partial<AppSettings>) => void
  resetSettings: () => void
}

const initial = load()
applyTheme(initial.theme)

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: initial,

  updateSettings: (patch) => set(s => {
    const next = { ...s.settings, ...patch }
    persist(next)
    if (patch.theme) applyTheme(patch.theme)
    return { settings: next }
  }),

  resetSettings: () => set(() => {
    const d = defaults()
    persist(d)
    applyTheme(d.theme)
    return { settings: d }
  }),
}))
