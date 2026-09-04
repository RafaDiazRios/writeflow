// Tipos compartidos. Reflejan 1:1 el esquema SQLite (src-tauri/src/migrations.rs)
// y el esquema Postgres de Supabase (supabase/migrations/0001_init.sql).

export type ISODate = string // YYYY-MM-DD
export type ISOStamp = string // 2026-08-12T09:30:00.000Z

export interface SyncFields {
  created_at: ISOStamp
  updated_at: ISOStamp
  deleted_at: ISOStamp | null
  rev: number
  dirty: number // 1 = pendiente de subir
}

export interface JournalEntry extends SyncFields {
  id: string
  entry_date: ISODate
  entry_time: string | null
  title: string
  content_json: string
  content_text: string
  mood: number | null
  energy: number | null
  place: string | null
  weather: string | null
  prompt_id: string | null
  prompt_text: string | null
  word_count: number
  is_favorite: number
}

export interface Tag extends SyncFields {
  id: string
  name: string
  color: string
}

export type ProjectKind = 'novel' | 'essay'

export interface Project extends SyncFields {
  id: string
  kind: ProjectKind
  title: string
  subtitle: string | null
  author: string | null
  genre: string | null
  logline: string | null
  synopsis: string | null
  template_id: string | null
  target_words: number
  deadline: ISODate | null
  status: string
  color: string
}

export type DocKind = 'folder' | 'chapter' | 'scene' | 'note' | 'section' | 'research'

export interface Doc extends SyncFields {
  id: string
  project_id: string
  parent_id: string | null
  position: number
  kind: DocKind
  title: string
  synopsis: string | null
  notes: string | null
  guide: string | null
  content_json: string
  content_text: string
  label: string | null
  status: string | null
  pov: string | null
  place: string | null
  time_frame: string | null
  word_count: number
  target_words: number
  in_compile: number
}

export interface Character extends SyncFields {
  id: string
  project_id: string
  name: string
  alias: string | null
  role: string | null
  age: string | null
  occupation: string | null
  appearance: string | null
  personality: string | null
  goal: string | null
  motivation: string | null
  conflict: string | null
  arc: string | null
  backstory: string | null
  voice: string | null
  secrets: string | null
  relationships: string | null
  notes: string | null
  color: string
  image_path: string | null
}

export interface Place extends SyncFields {
  id: string
  project_id: string
  name: string
  kind: string | null
  description: string | null
  atmosphere: string | null
  history: string | null
  notes: string | null
}

export interface PlotThread extends SyncFields {
  id: string
  project_id: string
  name: string
  kind: 'main' | 'subplot' | 'arc'
  color: string
  description: string | null
  position: number
}

export interface PlotBeat extends SyncFields {
  id: string
  project_id: string
  thread_id: string | null
  document_id: string | null
  title: string
  description: string | null
  status: string
  position: number
}

export interface TherapyEntry extends SyncFields {
  id: string
  exercise_id: string | null
  exercise_name: string | null
  school: string | null
  level: number
  prompt_text: string | null
  content_json: string
  content_text: string
  followups: string // JSON [{q,a}]
  word_count: number
  session_date: ISODate
}

// ── Contenido semilla (archivos JSON en src/data) ──

/* Las corrientes de las que sale la sugerencia diaria. La lista es el origen
 * de todo lo demás: el tipo, el orden en Ajustes, los valores por defecto y
 * las comprobaciones de `npm test`. Añadir una corriente es añadirla aquí,
 * escribir sus prompts en los dos idiomas y darle sus dos claves de idioma
 * (`corriente.x` y `corriente.x.desc`). */
export const CORRIENTES = [
  'estoico',
  'filosofico',
  'psicologico',
  'creativo',
  'memoria',
  'asombro',
  'oficio',
] as const

export type PromptStream = (typeof CORRIENTES)[number]

export interface DailyPrompt {
  id: string
  stream: PromptStream
  text: string
  source?: string
}

export interface TherapyExercise {
  id: string
  name: string
  school: string
  level: 1 | 2 | 3
  prompt: string
  followups: string[]
  source?: string
}

export interface EssayTemplateSection {
  title: string
  guide: string
  suggested_words: number
}

export interface EssayTemplate {
  id: string
  name: string
  /** El nombre inglés, como subtítulo del selector. Solo en el juego español:
   *  en el inglés repetiría el nombre principal. */
  name_en?: string
  description: string
  tradition: 'academic' | 'literary' | 'journalistic'
  sections: EssayTemplateSection[]
}

export interface FollowupAnswer {
  q: string
  a: string
}

/* Los tamaños en los que se pueden leer los prompts: la tarjeta del diario y el
 * epígrafe que queda sobre el editor. Son **píxeles, no porcentajes**: se eligió
 * así porque un porcentaje obliga a saber de qué, y aquí lo que se quiere es
 * decir «quiero esta letra de este tamaño».
 *
 * Los dos sitios leen el mismo número, así que no pueden separarse por
 * descuido: es el mismo texto en dos pantallas y verlo a dos tamaños confunde.
 *
 * Vive aquí y no en un CSS porque es un ajuste del usuario y se aplica en
 * línea; una clase de Tailwind no puede llevar un número variable.
 */
export const TAMANOS_PROMPT = [14, 16, 18, 20, 22, 24] as const

export const PROMPT_PX_DEFECTO = 18

/* El cuerpo del editor, en píxeles, tal y como lo declara `.wf-prose` en
 * `index.css`. Aquí solo se usa para poder enseñar en la barra a cuántos
 * píxeles equivale cada porcentaje. Si se cambia el CSS hay que cambiarlo
 * también aquí; una comprobación del banco de pruebas mide el tamaño real y
 * falla si los dos números dejan de coincidir. */
export const EDITOR_PX = 17
