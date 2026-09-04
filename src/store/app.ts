import { create } from 'zustand'
import { getMeta, setMeta } from '@/lib/db'
import { CORRIENTES, PROMPT_PX_DEFECTO, TAMANOS_PROMPT } from '@/lib/types'
import type { PromptStream } from '@/lib/types'
import { getStreams, setStreams } from '@/lib/prompts'
import {
  idiomaDelSistema,
  resolverEscritura,
  setIdiomaContenido,
  setIdiomaEscritura,
  setIdiomaUI,
  type Idioma,
  type PrefEscritura,
} from '@/i18n'
import { setInicioSemana, type InicioSemana } from '@/lib/dates'

export type Theme = 'light' | 'dark' | 'system'

interface AppState {
  ready: boolean
  theme: Theme
  focusMode: boolean
  typewriter: boolean
  fontScale: number
  streams: PromptStream[]

  // idioma. Son preferencias del equipo: ni se cifran ni se sincronizan.
  uiLang: Idioma
  contentLang: Idioma
  /* La preferencia tal cual la eligió el usuario, con 'auto' incluido. El
   * idioma ya resuelto vive en el módulo de i18n, que es donde lo consultan
   * el editor y los exportadores. */
  writeLang: PrefEscritura
  /* Tamaño en píxeles con el que se leen todos los prompts, en los tres
   * módulos que los tienen: diario, terapia y ensayo. Ver TAMANOS_PROMPT. */
  promptPx: number
  weekStart: InicioSemana

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
  setUiLang: (l: Idioma) => Promise<void>
  setContentLang: (l: Idioma) => Promise<void>
  setWriteLang: (v: PrefEscritura) => Promise<void>
  setPromptPx: (n: number) => Promise<void>
  setWeekStart: (v: InicioSemana) => Promise<void>
  set: (patch: Partial<AppState>) => void
  notify: (kind: 'ok' | 'error' | 'info', text: string) => void
}

/** Al primero o al último de la lista; nunca a un número de en medio inventado. */
function limitarPrompt(n: number): number {
  const min = TAMANOS_PROMPT[0]
  const max = TAMANOS_PROMPT[TAMANOS_PROMPT.length - 1]
  if (!Number.isFinite(n)) return PROMPT_PX_DEFECTO
  return Math.min(max, Math.max(min, Math.round(n)))
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
  streams: [...CORRIENTES],

  uiLang: 'es',
  contentLang: 'es',
  writeLang: 'auto',
  promptPx: PROMPT_PX_DEFECTO,
  weekStart: 1,

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

    // La primera vez se acierta con el idioma del sistema; a partir de ahí
    // manda lo que el usuario haya elegido, aunque cambie el del equipo.
    const uiLang = ((await getMeta('ui_lang')) as Idioma) || idiomaDelSistema()
    const contentLang = ((await getMeta('content_lang')) as Idioma) || uiLang
    /* 'auto' por defecto, y a propósito: quien venga de la 0.3.0 no tiene nada
     * guardado aquí y hasta ahora escribía en el idioma de la interfaz. Con
     * 'auto' sigue igual, sin migración ni sorpresas. */
    const writeLang = ((await getMeta('write_lang')) as PrefEscritura) || 'auto'
    /* Se limita al leerlo, como los anchos de los paneles: un valor escrito por
     * una versión más nueva —o a mano en la tabla— no puede dejar el prompt
     * ilegible ni gigante. */
    const promptPx = limitarPrompt(Number(await getMeta('prompt_px')) || PROMPT_PX_DEFECTO)
    // El lunes por defecto vale para España y para el Reino Unido.
    const weekStart = (Number((await getMeta('week_start')) ?? 1) === 0 ? 0 : 1) as InicioSemana

    setIdiomaUI(uiLang)
    setIdiomaContenido(contentLang)
    setIdiomaEscritura(resolverEscritura(writeLang, uiLang))
    setInicioSemana(weekStart)
    applyTheme(theme)
    set({
      ready: true, theme, fontScale, streams,
      uiLang, contentLang, writeLang, promptPx, weekStart,
    })
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

  async setUiLang(l) {
    await setMeta('ui_lang', l)
    setIdiomaUI(l)
    /* Mientras el idioma de escritura esté en 'auto' va detrás de este. Si no
     * se recalculara aquí, cambiar la interfaz dejaría el corrector y el
     * `.docx` en el idioma anterior hasta el siguiente arranque. */
    setIdiomaEscritura(resolverEscritura(get().writeLang, l))
    set({ uiLang: l })
  },

  async setContentLang(l) {
    await setMeta('content_lang', l)
    setIdiomaContenido(l)
    set({ contentLang: l })
  },

  async setWriteLang(v) {
    await setMeta('write_lang', v)
    setIdiomaEscritura(resolverEscritura(v, get().uiLang))
    set({ writeLang: v })
  },

  async setPromptPx(n) {
    const limitado = limitarPrompt(n)
    await setMeta('prompt_px', String(limitado))
    set({ promptPx: limitado })
  },

  async setWeekStart(v) {
    await setMeta('week_start', String(v))
    setInicioSemana(v)
    set({ weekStart: v })
  },

  set: (patch) => set(patch),

  notify: (kind, text) => {
    set({ toast: { kind, text } })
    window.setTimeout(() => set({ toast: null }), 4000)
  },
}))
