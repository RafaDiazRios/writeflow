import { getMeta, one, query, run, setMeta } from './db'
import { toISODate } from './dates'

/**
 * Objetivo diario y actividad de escritura.
 *
 * Se cuenta el **incremento neto** de palabras de cada guardado, no el total del
 * documento: reescribir un párrafo no infla la cifra, y borrar no la hace negativa
 * en el acumulado del día. Es la medida que refleja el trabajo real de una sesión.
 *
 * `daily_stats` es local a cada ordenador. La actividad del diario se recupera
 * igualmente en un equipo nuevo porque se cruza con las fechas de las entradas
 * sincronizadas.
 */

export type WritingModule = 'journal' | 'novel' | 'essay' | 'therapy'

const GOAL_KEY = 'daily_goal'
export const DEFAULT_GOAL = 500

export async function getGoal(): Promise<number> {
  const v = await getMeta(GOAL_KEY)
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_GOAL
}

export async function setGoal(words: number) {
  await setMeta(GOAL_KEY, String(Math.max(0, Math.round(words))))
}

/** Suma el incremento de palabras de un guardado al día de hoy. */
export async function recordDelta(module: WritingModule, delta: number) {
  if (!Number.isFinite(delta) || delta <= 0) return
  const day = toISODate()
  await run(
    `INSERT INTO daily_stats (day, words, minutes, modules) VALUES (?, ?, 0, ?)
     ON CONFLICT(day) DO UPDATE SET
       words = daily_stats.words + excluded.words,
       modules = CASE
         WHEN instr(',' || daily_stats.modules || ',', ',' || excluded.modules || ',') > 0
           THEN daily_stats.modules
         WHEN daily_stats.modules = '' THEN excluded.modules
         ELSE daily_stats.modules || ',' || excluded.modules
       END`,
    [day, Math.round(delta), module],
  )
}

/** Minutos de escritura acumulados hoy (se llama desde el temporizador de sesión). */
export async function recordMinutes(minutes: number) {
  if (minutes <= 0) return
  const day = toISODate()
  await run(
    `INSERT INTO daily_stats (day, words, minutes, modules) VALUES (?, 0, ?, '')
     ON CONFLICT(day) DO UPDATE SET minutes = daily_stats.minutes + excluded.minutes`,
    [day, Math.round(minutes)],
  )
}

export interface DayActivity {
  day: string
  words: number
  modules: string
}

/**
 * Actividad por día en un rango. Cruza `daily_stats` con las palabras del diario
 * de esa fecha y se queda con el valor mayor, para que el mapa no salga vacío en un
 * ordenador donde el diario llegó por sincronización.
 */
export async function activityRange(from: string, to: string): Promise<DayActivity[]> {
  return query<DayActivity>(
    `SELECT day,
            MAX(words, COALESCE(journal_words, 0)) AS words,
            modules
       FROM (
         SELECT d.day AS day, d.words AS words, d.modules AS modules,
                (SELECT SUM(j.word_count) FROM journal_entries j
                  WHERE j.entry_date = d.day AND j.deleted_at IS NULL) AS journal_words
           FROM daily_stats d
          WHERE d.day BETWEEN ? AND ?
         UNION
         SELECT j.entry_date AS day, 0 AS words, 'journal' AS modules,
                SUM(j.word_count) AS journal_words
           FROM journal_entries j
          WHERE j.entry_date BETWEEN ? AND ? AND j.deleted_at IS NULL
            AND j.entry_date NOT IN (SELECT day FROM daily_stats)
          GROUP BY j.entry_date
       )
      ORDER BY day`,
    [from, to, from, to],
  )
}

export async function todayWords(): Promise<number> {
  const r = await one<{ words: number }>(
    `SELECT MAX(COALESCE((SELECT words FROM daily_stats WHERE day = ?), 0),
                COALESCE((SELECT SUM(word_count) FROM journal_entries
                           WHERE entry_date = ? AND deleted_at IS NULL), 0)) AS words`,
    [toISODate(), toISODate()],
  )
  return r?.words ?? 0
}

export interface StreakInfo {
  /** Días consecutivos cumpliendo el objetivo, contando hasta hoy (o ayer). */
  current: number
  /** La racha más larga registrada. */
  longest: number
  /** Días con el objetivo cumplido en los últimos 365. */
  daysMetYear: number
  /** Días con algo escrito en los últimos 365. */
  daysWrittenYear: number
}

export async function streaks(goal: number): Promise<StreakInfo> {
  const today = new Date()
  const from = new Date(today)
  from.setFullYear(from.getFullYear() - 1)
  const rows = await activityRange(toISODate(from), toISODate(today))

  const met = new Set(rows.filter((r) => r.words >= goal).map((r) => r.day))
  const written = new Set(rows.filter((r) => r.words > 0).map((r) => r.day))

  // racha actual: se permite que hoy aún no esté cerrado
  const cursor = new Date(today)
  if (!met.has(toISODate(cursor))) cursor.setDate(cursor.getDate() - 1)
  let current = 0
  while (met.has(toISODate(cursor))) {
    current++
    cursor.setDate(cursor.getDate() - 1)
  }

  // racha más larga dentro del año observado
  let longest = 0
  let runLen = 0
  const sorted = [...met].sort()
  let prev: Date | null = null
  for (const d of sorted) {
    const cur = new Date(d + 'T00:00:00')
    if (prev && (cur.getTime() - prev.getTime()) / 86_400_000 === 1) runLen++
    else runLen = 1
    longest = Math.max(longest, runLen)
    prev = cur
  }

  return { current, longest, daysMetYear: met.size, daysWrittenYear: written.size }
}

/** Total de palabras escritas en los últimos N días. */
export async function wordsInLastDays(days: number): Promise<number> {
  const to = new Date()
  const from = new Date(to)
  from.setDate(from.getDate() - days + 1)
  const rows = await activityRange(toISODate(from), toISODate(to))
  return rows.reduce((a, r) => a + r.words, 0)
}
