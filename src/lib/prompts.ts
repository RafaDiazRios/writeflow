import raw from '@/data/prompts.json'
import exercisesRaw from '@/data/therapyExercises.json'
import templatesRaw from '@/data/essayTemplates.json'
import type { DailyPrompt, EssayTemplate, PromptStream, TherapyExercise } from './types'
import { getMeta, one, run, setMeta } from './db'
import { toISODate } from './dates'

export const PROMPTS = raw as DailyPrompt[]
export const EXERCISES = exercisesRaw as TherapyExercise[]
export const TEMPLATES = templatesRaw as EssayTemplate[]

export const STREAM_LABEL: Record<PromptStream, string> = {
  estoico: 'Estoico',
  filosofico: 'Filosófico',
  psicologico: 'Psicológico',
}

export const STREAM_DESC: Record<PromptStream, string> = {
  estoico: 'Marco Aurelio, Séneca, Epicteto: la dicotomía del control, el examen vespertino, amor fati.',
  filosofico: 'Existencialismo, fenomenología, ética de la virtud, Montaigne, Weil, Nietzsche.',
  psicologico: 'Autocompasión, valores ACT, partes internas, apego, escritura expresiva.',
}

/** Hash determinista: el mismo día produce siempre el mismo prompt. */
function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/**
 * Prompt del día. Es determinista por fecha + corrientes elegidas, así que
 * abrir la app dos veces el mismo día muestra el mismo texto, y funciona
 * exactamente igual sin conexión.
 */
export function promptForDay(date: string, streams: PromptStream[]): DailyPrompt {
  const pool = PROMPTS.filter((p) => streams.includes(p.stream))
  const list = pool.length ? pool : PROMPTS
  return list[hashString(date + streams.join(',')) % list.length]
}

/** Otro prompt distinto para el mismo día (botón «dame otro»). */
export function rerollPrompt(date: string, streams: PromptStream[], exclude: string[]): DailyPrompt {
  const pool = PROMPTS.filter((p) => streams.includes(p.stream) && !exclude.includes(p.id))
  const list = pool.length ? pool : PROMPTS.filter((p) => !exclude.includes(p.id))
  if (!list.length) return promptForDay(date, streams)
  return list[Math.floor(Math.random() * list.length)]
}

export function promptById(id: string | null | undefined): DailyPrompt | undefined {
  if (!id) return undefined
  return PROMPTS.find((p) => p.id === id)
}

// ── preferencias de corrientes ──

const STREAMS_KEY = 'prompt_streams'

export async function getStreams(): Promise<PromptStream[]> {
  const v = await getMeta(STREAMS_KEY)
  if (!v) return ['estoico', 'filosofico', 'psicologico']
  const parsed = v.split(',').filter(Boolean) as PromptStream[]
  return parsed.length ? parsed : ['estoico', 'filosofico', 'psicologico']
}

export async function setStreams(streams: PromptStream[]) {
  await setMeta(STREAMS_KEY, streams.join(','))
}

// ── historial (para no repetir y para estadísticas) ──

export async function markPromptShown(id: string) {
  await run(
    `INSERT INTO prompt_history (prompt_id, shown_on, used) VALUES (?, ?, 0)
     ON CONFLICT(prompt_id) DO UPDATE SET shown_on = excluded.shown_on`,
    [id, toISODate()],
  )
}

export async function markPromptUsed(id: string) {
  await run(
    `INSERT INTO prompt_history (prompt_id, shown_on, used) VALUES (?, ?, 1)
     ON CONFLICT(prompt_id) DO UPDATE SET used = 1`,
    [id, toISODate()],
  )
}

export async function usedPromptCount(): Promise<number> {
  const r = await one<{ n: number }>('SELECT COUNT(*) n FROM prompt_history WHERE used = 1')
  return r?.n ?? 0
}

// ── terapia narrativa ──

export const LEVEL_LABEL: Record<number, string> = {
  1: 'Nivel 1 · Entrada suave',
  2: 'Nivel 2 · Trabajo medio',
  3: 'Nivel 3 · Profundo',
}

export const LEVEL_HELP: Record<number, string> = {
  1: 'Ejercicios de apertura: describir, nombrar, observar. Poco riesgo emocional.',
  2: 'Reescritura de la historia: excepciones, valores, partes en conflicto.',
  3: 'Material sensible: pérdida, vergüenza, trauma. Escribe cuando tengas tiempo y calma.',
}

export function exercisesByLevel(level: number): TherapyExercise[] {
  return EXERCISES.filter((e) => e.level === level)
}

export function exerciseById(id: string | null | undefined): TherapyExercise | undefined {
  if (!id) return undefined
  return EXERCISES.find((e) => e.id === id)
}

export function schools(): string[] {
  return Array.from(new Set(EXERCISES.map((e) => e.school))).sort()
}

/** Sugerencia: primero los ejercicios del nivel que aún no has hecho. */
export function suggestExercise(level: number, usage: Record<string, number>): TherapyExercise {
  const pool = exercisesByLevel(level)
  const unseen = pool.filter((e) => !usage[e.id])
  const list = unseen.length ? unseen : pool
  return list[Math.floor(Math.random() * list.length)]
}

// ── ensayos ──

export function templateById(id: string | null | undefined): EssayTemplate | undefined {
  if (!id) return undefined
  return TEMPLATES.find((t) => t.id === id)
}

export const TRADITION_LABEL: Record<string, string> = {
  academic: 'Académico',
  literary: 'Literario',
  journalistic: 'Periodístico',
}
