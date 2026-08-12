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

export type PromptStream = 'estoico' | 'filosofico' | 'psicologico'

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
  name_en: string
  description: string
  tradition: 'academic' | 'literary' | 'journalistic'
  sections: EssayTemplateSection[]
}

export interface FollowupAnswer {
  q: string
  a: string
}
