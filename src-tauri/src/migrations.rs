use tauri_plugin_sql::{Migration, MigrationKind};

/// Esquema local (SQLite). Es un espejo casi exacto del esquema de Supabase
/// (ver `supabase/migrations/0001_init.sql`) más las columnas de sincronización
/// `rev`, `sync_state` y `dirty`, que solo existen en el cliente.
pub const V1: &str = r#"
-- ─────────────────────────── núcleo ───────────────────────────
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  color      TEXT NOT NULL DEFAULT '#8b887e',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  rev        INTEGER NOT NULL DEFAULT 1,
  dirty      INTEGER NOT NULL DEFAULT 1
);

-- ─────────────────────────── diario ───────────────────────────
CREATE TABLE IF NOT EXISTS journal_entries (
  id           TEXT PRIMARY KEY,
  entry_date   TEXT NOT NULL,                 -- YYYY-MM-DD, fecha local
  entry_time   TEXT,                          -- HH:MM opcional
  title        TEXT NOT NULL DEFAULT '',
  content_json TEXT NOT NULL DEFAULT '',      -- documento TipTap serializado
  content_text TEXT NOT NULL DEFAULT '',      -- texto plano para búsqueda
  mood         INTEGER,                       -- 1..5
  energy       INTEGER,                       -- 1..5
  place        TEXT,
  weather      TEXT,
  prompt_id    TEXT,
  prompt_text  TEXT,
  word_count   INTEGER NOT NULL DEFAULT 0,
  is_favorite  INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT,
  rev          INTEGER NOT NULL DEFAULT 1,
  dirty        INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_journal_date  ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_dirty ON journal_entries(dirty);

CREATE TABLE IF NOT EXISTS entry_tags (
  entry_id TEXT NOT NULL,
  tag_id   TEXT NOT NULL,
  PRIMARY KEY (entry_id, tag_id)
);

CREATE TABLE IF NOT EXISTS prompt_history (
  prompt_id TEXT PRIMARY KEY,
  shown_on  TEXT NOT NULL,
  used      INTEGER NOT NULL DEFAULT 0
);

-- ──────────────────── proyectos: novela y ensayo ────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,
  kind         TEXT NOT NULL,                 -- 'novel' | 'essay'
  title        TEXT NOT NULL DEFAULT 'Sin título',
  subtitle     TEXT,
  author       TEXT,
  genre        TEXT,
  logline      TEXT,
  synopsis     TEXT,
  template_id  TEXT,                          -- solo ensayos
  target_words INTEGER NOT NULL DEFAULT 0,
  deadline     TEXT,
  status       TEXT NOT NULL DEFAULT 'draft',
  color        TEXT NOT NULL DEFAULT '#4573b4',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT,
  rev          INTEGER NOT NULL DEFAULT 1,
  dirty        INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_projects_kind ON projects(kind);

-- El «binder» de Scrivener: árbol de carpetas, capítulos, escenas y notas.
CREATE TABLE IF NOT EXISTS documents (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  parent_id     TEXT,
  position      REAL NOT NULL DEFAULT 0,
  kind          TEXT NOT NULL DEFAULT 'scene', -- folder|chapter|scene|note|section|research
  title         TEXT NOT NULL DEFAULT 'Sin título',
  synopsis      TEXT,                          -- la «ficha» de la tarjeta de corcho
  notes         TEXT,                          -- anotaciones del documento
  guide         TEXT,                          -- instrucción de la plantilla (ensayos)
  content_json  TEXT NOT NULL DEFAULT '',
  content_text  TEXT NOT NULL DEFAULT '',
  label         TEXT,                          -- etiqueta de color (Scrivener «Label»)
  status        TEXT,                          -- Borrador / Revisado / Final...
  pov           TEXT,
  place         TEXT,
  time_frame    TEXT,
  word_count    INTEGER NOT NULL DEFAULT 0,
  target_words  INTEGER NOT NULL DEFAULT 0,
  in_compile    INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT,
  rev           INTEGER NOT NULL DEFAULT 1,
  dirty         INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id, parent_id, position);

CREATE TABLE IF NOT EXISTS characters (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  alias         TEXT,
  role          TEXT,                          -- protagonista, antagonista, secundario...
  age           TEXT,
  occupation    TEXT,
  appearance    TEXT,
  personality   TEXT,
  goal          TEXT,                          -- qué quiere
  motivation    TEXT,                          -- por qué lo quiere
  conflict      TEXT,                          -- qué se lo impide
  arc           TEXT,                          -- cómo cambia
  backstory     TEXT,
  voice         TEXT,                          -- manera de hablar
  secrets       TEXT,
  relationships TEXT,
  notes         TEXT,
  color         TEXT NOT NULL DEFAULT '#6892ca',
  image_path    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT,
  rev           INTEGER NOT NULL DEFAULT 1,
  dirty         INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_characters_project ON characters(project_id);

CREATE TABLE IF NOT EXISTS places (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  kind        TEXT,
  description TEXT,
  atmosphere  TEXT,
  history     TEXT,
  notes       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  rev         INTEGER NOT NULL DEFAULT 1,
  dirty       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_places_project ON places(project_id);

CREATE TABLE IF NOT EXISTS plot_threads (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  kind        TEXT NOT NULL DEFAULT 'subplot', -- main | subplot | arc
  color       TEXT NOT NULL DEFAULT '#9db8de',
  description TEXT,
  position    REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  rev         INTEGER NOT NULL DEFAULT 1,
  dirty       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS plot_beats (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  thread_id   TEXT,
  document_id TEXT,
  title       TEXT NOT NULL DEFAULT '',
  description TEXT,
  status      TEXT NOT NULL DEFAULT 'idea',
  position    REAL NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  rev         INTEGER NOT NULL DEFAULT 1,
  dirty       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_beats_project ON plot_beats(project_id, position);

CREATE TABLE IF NOT EXISTS document_characters (
  document_id  TEXT NOT NULL,
  character_id TEXT NOT NULL,
  PRIMARY KEY (document_id, character_id)
);

-- ─────────────────── terapia narrativa y escritura breve ───────────────────
CREATE TABLE IF NOT EXISTS therapy_entries (
  id            TEXT PRIMARY KEY,
  exercise_id   TEXT,
  exercise_name TEXT,
  school        TEXT,
  level         INTEGER NOT NULL DEFAULT 1,
  prompt_text   TEXT,
  content_json  TEXT NOT NULL DEFAULT '',
  content_text  TEXT NOT NULL DEFAULT '',
  followups     TEXT NOT NULL DEFAULT '[]',   -- JSON: [{q, a}]
  word_count    INTEGER NOT NULL DEFAULT 0,
  session_date  TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT,
  rev           INTEGER NOT NULL DEFAULT 1,
  dirty         INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_therapy_date ON therapy_entries(session_date);

-- ─────────────────────────── sincronización ───────────────────────────
CREATE TABLE IF NOT EXISTS sync_cursors (
  table_name     TEXT PRIMARY KEY,
  last_pulled_at TEXT
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id         TEXT PRIMARY KEY,
  table_name TEXT NOT NULL,
  row_id     TEXT NOT NULL,
  local_json TEXT NOT NULL,
  remote_json TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  resolved    INTEGER NOT NULL DEFAULT 0
);

-- Racha de escritura y estadísticas diarias
CREATE TABLE IF NOT EXISTS daily_stats (
  day         TEXT PRIMARY KEY,               -- YYYY-MM-DD
  words       INTEGER NOT NULL DEFAULT 0,
  minutes     INTEGER NOT NULL DEFAULT 0,
  modules     TEXT NOT NULL DEFAULT ''        -- 'journal,novel,...'
);
"#;

pub fn all() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "esquema inicial de WriteFlow",
        sql: V1,
        kind: MigrationKind::Up,
    }]
}
