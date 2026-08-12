import { create } from 'zustand'
import { getMeta, setMeta } from '@/lib/db'
import type { PromptStream } from '@/lib/types'
import { getStreams, setStreams } from '@/lib/prompts'

export type Theme = 'light' | 'dark' | 'system'

interface AppState {
  ready: boolean
  theme: Theme
  focusMode: boolean
  typewriter: boolean
  fontScale: number
  streams: PromptStream[]

  // nube
  cloudConfigured: boolean
  signedIn: boolean
  userEmail: string | null
  online: boolean
  syncing: boolean
  lastSync: string | null
  pendingCount: number

  // cifrado
  e2eConfigured: boolean
  unlocked: boolean
  /** Cuando es true se muestra el diálogo de desbloqueo/configuración. */
  pendingUnlockRequest: boolean

  toast: { kind: 'ok' | 'error' | 'info'; text: string } | null

  init: () => Promise<void>
  setTheme: (t: Theme) => Promise<void>
  toggleFocus: () => void
  toggleTypewriter: () => void
  setFontScale: (n: number) => Promise<void>
  updateStreams: (s: PromptStream[]) => Promise<void>
  set: (patch: Partial<AppState>) => void
  notify: (kind: 'ok' | 'error' | 'info', text: string) => void
}

function applyTheme(theme: Theme) {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  theme: 'system',
  focusMode: false,
  typewriter: false,
  fontScale: 1,
  streams: ['estoico', 'filosofico', 'psicologico'],

  cloudConfigured: false,
  signedIn: false,
  userEmail: null,
  online: false,
  syncing: false,
  lastSync: null,
  pendingCount: 0,

  e2eConfigured: false,
  unlocked: false,
  pendingUnlockRequest: false,

  toast: null,

  async init() {
    const theme = ((await getMeta('theme')) as Theme) || 'system'
    const fontScale = Number((await getMeta('font_scale')) || '1')
    const streams = await getStreams()
    applyTheme(theme)
    set({ ready: true, theme, fontScale, streams })
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (get().theme === 'system') applyTheme('system')
    })
  },

  async setTheme(theme) {
    await setMeta('theme', theme)
    applyTheme(theme)
    set({ theme })
  },

  toggleFocus: () => set((s) => ({ focusMode: !s.focusMode })),
  toggleTypewriter: () => set((s) => ({ typewriter: !s.typewriter })),

  async setFontScale(n) {
    await setMeta('font_scale', String(n))
    set({ fontScale: n })
  },

  async updateStreams(s) {
    await setStreams(s)
    set({ streams: s })
  },

  set: (patch) => set(patch),

  notify: (kind, text) => {
    set({ toast: { kind, text } })
    window.setTimeout(() => set({ toast: null }), 4000)
  },
}))
