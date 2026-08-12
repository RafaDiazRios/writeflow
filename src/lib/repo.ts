import { v4 as uuid } from 'uuid'
import { nowISO, one, query, run, softDelete, upsert } from './db'
import { recordDelta, type WritingModule } from './stats'
import { indexRow, removeFromIndex, type SearchKind } from './search'
import type {
  Character,
  Doc,
  DocKind,
  JournalEntry,
  Place,
  PlotBeat,
  PlotThread,
  Project,
  ProjectKind,
  Tag,
  TherapyEntry,
} from './types'

const ALIVE = 'deleted_at IS NULL'

/**
 * Anota en las estadísticas del día el incremento neto de palabras de este guardado.
 * Se hace aquí, en la capa de datos, para que valga igual escriba en el diario, en
 * una escena o en un ejercicio de terapia: un solo sitio que mantener.
 */
async function trackWords(
  table: 'journal_entries' | 'documents' | 'therapy_entries',
  id: string,
  nextWords: number | undefined,
) {
  if (nextWords === undefined) return
  const row = await one<{ word_count: number }>(`SELECT word_count FROM ${table} WHERE id = ?`, [id])
  const delta = nextWords - (row?.word_count ?? 0)
  if (delta <= 0) return

  let module: WritingModule = 'journal'
  if (table === 'therapy_entries') module = 'therapy'
  else if (table === 'documents') {
    const p = await one<{ kind: string }>(
      'SELECT p.kind AS kind FROM documents d JOIN projects p ON p.id = d.project_id WHERE d.id = ?',
      [id],
    )
    module = p?.kind === 'essay' ? 'essay' : 'novel'
  }
  await recordDelta(module, delta)
}

/**
 * Vuelve a indexar una fila para la búsqueda global. Se llama después de cada
 * guardado; relee la fila porque los parches son parciales y el índice necesita
 * el texto completo.
 */
async function reindex(kind: SearchKind, id: string) {
  try {
    switch (kind) {
      case 'journal': {
        const r = await one<{ title: string; content_text: string; entry_date: string; prompt_text: string | null; deleted_at: string | null }>(
          'SELECT title, content_text, entry_date, prompt_text, deleted_at FROM journal_entries WHERE id = ?', [id])
        if (!r) return
        if (r.deleted_at) return removeFromIndex(kind, id)
        return indexRow({
          kind, refId: id, title: r.title || r.entry_date, date: r.entry_date,
          body: [r.content_text, r.prompt_text].filter(Boolean).join('\n'),
        })
      }
      case 'doc': {
        const r = await one<{ title: string; content_text: string; synopsis: string | null; notes: string | null; project_id: string; deleted_at: string | null; ptitle: string | null }>(
          `SELECT d.title, d.content_text, d.synopsis, d.notes, d.project_id, d.deleted_at,
                  p.title AS ptitle
             FROM documents d LEFT JOIN projects p ON p.id = d.project_id
            WHERE d.id = ?`, [id])
        if (!r) return
        if (r.deleted_at) return removeFromIndex(kind, id)
        return indexRow({
          kind, refId: id, title: r.title, projectId: r.project_id, parent: r.ptitle,
          body: [r.content_text, r.synopsis, r.notes].filter(Boolean).join('\n'),
        })
      }
      case 'therapy': {
        const r = await one<{ exercise_name: string | null; content_text: string; session_date: string; school: string | null; deleted_at: string | null }>(
          'SELECT exercise_name, content_text, session_date, school, deleted_at FROM therapy_entries WHERE id = ?', [id])
        if (!r) return
        if (r.deleted_at) return removeFromIndex(kind, id)
        return indexRow({
          kind, refId: id, title: r.exercise_name ?? 'Sesión', body: r.content_text,
          date: r.session_date, parent: r.school,
        })
      }
      case 'character': {
        const r = await one<{ name: string; goal: string | null; backstory: string | null; notes: string | null; project_id: string; deleted_at: string | null; ptitle: string | null }>(
          `SELECT c.name, c.goal, c.backstory, c.notes, c.project_id, c.deleted_at, p.title AS ptitle
             FROM characters c LEFT JOIN projects p ON p.id = c.project_id WHERE c.id = ?`, [id])
        if (!r) return
        if (r.deleted_at) return removeFromIndex(kind, id)
        return indexRow({
          kind, refId: id, title: r.name, projectId: r.project_id, parent: r.ptitle,
          body: [r.goal, r.backstory, r.notes].filter(Boolean).join('\n'),
        })
      }
      case 'project': {
        const r = await one<{ title: string; kind: string; logline: string | null; synopsis: string | null; deleted_at: string | null }>(
          'SELECT title, kind, logline, synopsis, deleted_at FROM projects WHERE id = ?', [id])
        if (!r) return
        if (r.deleted_at) return removeFromIndex(kind, id)
        return indexRow({
          kind, refId: id, title: r.title, projectId: id,
          parent: r.kind === 'novel' ? 'Novela' : 'Ensayo',
          body: [r.logline, r.synopsis].filter(Boolean).join('\n'),
        })
      }
    }
  } catch {
    // El índice es un accesorio: si falla, escribir nunca debe romperse.
  }
}

// ══════════════════════════════ DIARIO ══════════════════════════════

export const journal = {
  async byDate(date: string): Promise<JournalEntry[]> {
    return query<JournalEntry>(
      `SELECT * FROM journal_entries WHERE entry_date = ? AND ${ALIVE} ORDER BY created_at ASC`,
      [date],
    )
  },

  async byId(id: string): Promise<JournalEntry | null> {
    return one<JournalEntry>(`SELECT * FROM journal_entries WHERE id = ?`, [id])
  },

  async recent(limit = 50): Promise<JournalEntry[]> {
    return query<JournalEntry>(
      `SELECT * FROM journal_entries WHERE ${ALIVE} ORDER BY entry_date DESC, created_at DESC LIMIT ?`,
      [limit],
    )
  },

  /** Días con entradas dentro de un rango, para pintar el calendario. */
  async daysInRange(from: string, to: string): Promise<{ entry_date: string; n: number; words: number }[]> {
    return query(
      `SELECT entry_date, COUNT(*) AS n, SUM(word_count) AS words
         FROM journal_entries
        WHERE entry_date BETWEEN ? AND ? AND ${ALIVE}
        GROUP BY entry_date`,
      [from, to],
    )
  },

  /**
   * «En este día»: entradas del mismo día y mes de años anteriores.
   *
   * Solo mira el diario. La escritura terapéutica también está fechada, pero
   * sacarla a la superficie sin que la pidas puede caer en mal momento: ese
   * material se visita a propósito, no de refilón.
   */
  async onThisDay(date: string, limit = 20): Promise<JournalEntry[]> {
    const monthDay = date.slice(5) // MM-DD
    const year = date.slice(0, 4)
    return query<JournalEntry>(
      `SELECT * FROM journal_entries
        WHERE ${ALIVE}
          AND substr(entry_date, 6) = ?
          AND substr(entry_date, 1, 4) < ?
          AND (content_text <> '' OR title <> '')
        ORDER BY entry_date DESC
        LIMIT ?`,
      [monthDay, year, limit],
    )
  },

  /**
   * Cuántos años distintos tienen entrada en este día.
   *
   * Aplica exactamente los mismos filtros que `onThisDay`, incluida la exclusión
   * de entradas vacías: si no, el contador anunciaría recuerdos que la lista no
   * enseña.
   */
  async onThisDayCount(date: string): Promise<number> {
    const r = await one<{ n: number }>(
      `SELECT COUNT(DISTINCT substr(entry_date, 1, 4)) n FROM journal_entries
        WHERE ${ALIVE}
          AND substr(entry_date, 6) = ?
          AND substr(entry_date, 1, 4) < ?
          AND (content_text <> '' OR title <> '')`,
      [date.slice(5), date.slice(0, 4)],
    )
    return r?.n ?? 0
  },

  async search(term: string, limit = 100): Promise<JournalEntry[]> {
    const like = `%${term}%`
    return query<JournalEntry>(
      `SELECT * FROM journal_entries
        WHERE ${ALIVE} AND (content_text LIKE ? OR title LIKE ? OR prompt_text LIKE ?)
        ORDER BY entry_date DESC LIMIT ?`,
      [like, like, like, limit],
    )
  },

  async create(input: Partial<JournalEntry> & { entry_date: string }): Promise<string> {
    const id = input.id ?? uuid()
    const ts = nowISO()
    await upsert('journal_entries', {
      id,
      entry_date: input.entry_date,
      entry_time: input.entry_time ?? null,
      title: input.title ?? '',
      content_json: input.content_json ?? '',
      content_text: input.content_text ?? '',
      mood: input.mood ?? null,
      energy: input.energy ?? null,
      place: input.place ?? null,
      weather: input.weather ?? null,
      prompt_id: input.prompt_id ?? null,
      prompt_text: input.prompt_text ?? null,
      word_count: input.word_count ?? 0,
      is_favorite: input.is_favorite ?? 0,
      created_at: ts,
      deleted_at: null,
    })
    await reindex('journal', id)
    return id
  },

  async update(id: string, patch: Partial<JournalEntry>) {
    const cols = Object.keys(patch)
    if (!cols.length) return
    await trackWords('journal_entries', id, patch.word_count)
    const sets = cols.map((c) => `${c} = ?`).join(', ')
    await run(
      `UPDATE journal_entries SET ${sets}, updated_at = ?, dirty = 1, rev = rev + 1 WHERE id = ?`,
      [...Object.values(patch), nowISO(), id],
    )
    await reindex('journal', id)
  },

  async remove(id: string) {
    await softDelete('journal_entries', id)
    await removeFromIndex('journal', id)
  },

  async stats(): Promise<{ entries: number; words: number; days: number; streak: number }> {
    const agg = await one<{ entries: number; words: number; days: number }>(
      `SELECT COUNT(*) AS entries, COALESCE(SUM(word_count),0) AS words,
              COUNT(DISTINCT entry_date) AS days
         FROM journal_entries WHERE ${ALIVE}`,
    )
    const days = await query<{ entry_date: string }>(
      `SELECT DISTINCT entry_date FROM journal_entries WHERE ${ALIVE} ORDER BY entry_date DESC LIMIT 400`,
    )
    // racha: días consecutivos hacia atrás desde hoy o desde ayer
    let streak = 0
    const set = new Set(days.map((d) => d.entry_date))
    const cursor = new Date()
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    if (!set.has(iso(cursor))) cursor.setDate(cursor.getDate() - 1)
    while (set.has(iso(cursor))) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    }
    return { entries: agg?.entries ?? 0, words: agg?.words ?? 0, days: agg?.days ?? 0, streak }
  },
}

// ══════════════════════════════ ETIQUETAS ══════════════════════════════

export const tags = {
  async all(): Promise<Tag[]> {
    return query<Tag>(`SELECT * FROM tags WHERE ${ALIVE} ORDER BY name`)
  },
  async ensure(name: string, color = '#8b887e'): Promise<Tag> {
    const found = await one<Tag>(`SELECT * FROM tags WHERE name = ? AND ${ALIVE}`, [name])
    if (found) return found
    const id = uuid()
    await upsert('tags', { id, name, color, created_at: nowISO(), deleted_at: null })
    return (await one<Tag>(`SELECT * FROM tags WHERE id = ?`, [id]))!
  },
  async forEntry(entryId: string): Promise<Tag[]> {
    return query<Tag>(
      `SELECT t.* FROM tags t JOIN entry_tags et ON et.tag_id = t.id WHERE et.entry_id = ? ORDER BY t.name`,
      [entryId],
    )
  },
  async setForEntry(entryId: string, names: string[]) {
    await run('DELETE FROM entry_tags WHERE entry_id = ?', [entryId])
    for (const n of names.map((s) => s.trim()).filter(Boolean)) {
      const t = await this.ensure(n)
      await run('INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) VALUES (?, ?)', [entryId, t.id])
    }
  },
}

// ══════════════════════════════ PROYECTOS ══════════════════════════════

export const projects = {
  async list(kind: ProjectKind): Promise<Project[]> {
    return query<Project>(
      `SELECT * FROM projects WHERE kind = ? AND ${ALIVE} ORDER BY updated_at DESC`,
      [kind],
    )
  },
  async byId(id: string): Promise<Project | null> {
    return one<Project>('SELECT * FROM projects WHERE id = ?', [id])
  },
  async create(input: Partial<Project> & { kind: ProjectKind; title: string }): Promise<string> {
    const id = input.id ?? uuid()
    await upsert('projects', {
      id,
      kind: input.kind,
      title: input.title,
      subtitle: input.subtitle ?? null,
      author: input.author ?? null,
      genre: input.genre ?? null,
      logline: input.logline ?? null,
      synopsis: input.synopsis ?? null,
      template_id: input.template_id ?? null,
      target_words: input.target_words ?? 0,
      deadline: input.deadline ?? null,
      status: input.status ?? 'draft',
      color: input.color ?? '#4573b4',
      created_at: nowISO(),
      deleted_at: null,
    })
    await reindex('project', id)
    return id
  },
  async update(id: string, patch: Partial<Project>) {
    const cols = Object.keys(patch)
    if (!cols.length) return
    const sets = cols.map((c) => `${c} = ?`).join(', ')
    await run(`UPDATE projects SET ${sets}, updated_at = ?, dirty = 1, rev = rev + 1 WHERE id = ?`, [
      ...Object.values(patch),
      nowISO(),
      id,
    ])
    await reindex('project', id)
  },
  async remove(id: string) {
    await softDelete('projects', id)
    await removeFromIndex('project', id)
  },
  async wordCount(id: string): Promise<number> {
    const r = await one<{ w: number }>(
      `SELECT COALESCE(SUM(word_count),0) AS w FROM documents WHERE project_id = ? AND ${ALIVE} AND in_compile = 1`,
      [id],
    )
    return r?.w ?? 0
  },
}

// ══════════════════════════════ DOCUMENTOS (BINDER) ══════════════════════════════

export const docs = {
  async forProject(projectId: string): Promise<Doc[]> {
    return query<Doc>(
      `SELECT * FROM documents WHERE project_id = ? AND ${ALIVE} ORDER BY position ASC, created_at ASC`,
      [projectId],
    )
  },
  async byId(id: string): Promise<Doc | null> {
    return one<Doc>('SELECT * FROM documents WHERE id = ?', [id])
  },
  async create(
    input: Partial<Doc> & { project_id: string; kind: DocKind; title: string },
  ): Promise<string> {
    const id = input.id ?? uuid()
    let position = input.position
    if (position === undefined) {
      const r = await one<{ m: number }>(
        `SELECT COALESCE(MAX(position), 0) AS m FROM documents WHERE project_id = ? AND COALESCE(parent_id,'') = ?`,
        [input.project_id, input.parent_id ?? ''],
      )
      position = (r?.m ?? 0) + 100
    }
    await upsert('documents', {
      id,
      project_id: input.project_id,
      parent_id: input.parent_id ?? null,
      position,
      kind: input.kind,
      title: input.title,
      synopsis: input.synopsis ?? null,
      notes: input.notes ?? null,
      guide: input.guide ?? null,
      content_json: input.content_json ?? '',
      content_text: input.content_text ?? '',
      label: input.label ?? null,
      status: input.status ?? 'Borrador',
      pov: input.pov ?? null,
      place: input.place ?? null,
      time_frame: input.time_frame ?? null,
      word_count: input.word_count ?? 0,
      target_words: input.target_words ?? 0,
      in_compile: input.in_compile ?? 1,
      created_at: nowISO(),
      deleted_at: null,
    })
    await reindex('doc', id)
    return id
  },
  async update(id: string, patch: Partial<Doc>) {
    const cols = Object.keys(patch)
    if (!cols.length) return
    await trackWords('documents', id, patch.word_count)
    const sets = cols.map((c) => `${c} = ?`).join(', ')
    await run(`UPDATE documents SET ${sets}, updated_at = ?, dirty = 1, rev = rev + 1 WHERE id = ?`, [
      ...Object.values(patch),
      nowISO(),
      id,
    ])
    await reindex('doc', id)
  },
  async remove(id: string) {
    // borra también los hijos
    const children = await query<{ id: string }>(
      `SELECT id FROM documents WHERE parent_id = ? AND ${ALIVE}`,
      [id],
    )
    for (const c of children) await docs.remove(c.id)
    await softDelete('documents', id)
    await removeFromIndex('doc', id)
  },
  async reorder(id: string, parentId: string | null, position: number) {
    await docs.update(id, { parent_id: parentId, position })
  },
  async search(projectId: string, term: string): Promise<Doc[]> {
    const like = `%${term}%`
    return query<Doc>(
      `SELECT * FROM documents WHERE project_id = ? AND ${ALIVE}
         AND (title LIKE ? OR content_text LIKE ? OR synopsis LIKE ? OR notes LIKE ?)
       ORDER BY position`,
      [projectId, like, like, like, like],
    )
  },
}

// ══════════════════════════════ PERSONAJES, LUGARES, TRAMA ══════════════════════════════

function crudFactory<T extends { id: string; project_id: string }>(
  table: string,
  orderBy = 'name',
  /** Solo los personajes entran en la búsqueda global; lugares y tramas no. */
  searchKind?: SearchKind,
) {
  return {
    async forProject(projectId: string): Promise<T[]> {
      return query<T>(
        `SELECT * FROM ${table} WHERE project_id = ? AND ${ALIVE} ORDER BY ${orderBy}`,
        [projectId],
      )
    },
    async byId(id: string): Promise<T | null> {
      return one<T>(`SELECT * FROM ${table} WHERE id = ?`, [id])
    },
    async create(input: Record<string, unknown> & { project_id: string }): Promise<string> {
      const id = (input.id as string) ?? uuid()
      await upsert(table, { ...input, id, created_at: nowISO(), deleted_at: null })
      if (searchKind) await reindex(searchKind, id)
      return id
    },
    async update(id: string, patch: Record<string, unknown>) {
      const cols = Object.keys(patch)
      if (!cols.length) return
      const sets = cols.map((c) => `${c} = ?`).join(', ')
      await run(`UPDATE ${table} SET ${sets}, updated_at = ?, dirty = 1, rev = rev + 1 WHERE id = ?`, [
        ...Object.values(patch),
        nowISO(),
        id,
      ])
      if (searchKind) await reindex(searchKind, id)
    },
    async remove(id: string) {
      await softDelete(table, id)
      if (searchKind) await removeFromIndex(searchKind, id)
    },
  }
}

export const characters = crudFactory<Character>('characters', 'name', 'character')
export const places = crudFactory<Place>('places', 'name')
export const threads = crudFactory<PlotThread>('plot_threads', 'position')
export const beats = crudFactory<PlotBeat>('plot_beats', 'position')

// ══════════════════════════════ TERAPIA NARRATIVA ══════════════════════════════

export const therapy = {
  async recent(limit = 100): Promise<TherapyEntry[]> {
    return query<TherapyEntry>(
      `SELECT * FROM therapy_entries WHERE ${ALIVE} ORDER BY session_date DESC, created_at DESC LIMIT ?`,
      [limit],
    )
  },
  async byId(id: string): Promise<TherapyEntry | null> {
    return one<TherapyEntry>('SELECT * FROM therapy_entries WHERE id = ?', [id])
  },
  async create(input: Partial<TherapyEntry> & { session_date: string }): Promise<string> {
    const id = input.id ?? uuid()
    await upsert('therapy_entries', {
      id,
      exercise_id: input.exercise_id ?? null,
      exercise_name: input.exercise_name ?? null,
      school: input.school ?? null,
      level: input.level ?? 1,
      prompt_text: input.prompt_text ?? null,
      content_json: input.content_json ?? '',
      content_text: input.content_text ?? '',
      followups: input.followups ?? '[]',
      word_count: input.word_count ?? 0,
      session_date: input.session_date,
      created_at: nowISO(),
      deleted_at: null,
    })
    await reindex('therapy', id)
    return id
  },
  async update(id: string, patch: Partial<TherapyEntry>) {
    const cols = Object.keys(patch)
    if (!cols.length) return
    await trackWords('therapy_entries', id, patch.word_count)
    const sets = cols.map((c) => `${c} = ?`).join(', ')
    await run(
      `UPDATE therapy_entries SET ${sets}, updated_at = ?, dirty = 1, rev = rev + 1 WHERE id = ?`,
      [...Object.values(patch), nowISO(), id],
    )
    await reindex('therapy', id)
  },
  async remove(id: string) {
    await softDelete('therapy_entries', id)
    await removeFromIndex('therapy', id)
  },
  /** Cuántas veces se ha hecho cada ejercicio (para sugerir los no visitados). */
  async usage(): Promise<Record<string, number>> {
    const rows = await query<{ exercise_id: string; n: number }>(
      `SELECT exercise_id, COUNT(*) AS n FROM therapy_entries WHERE ${ALIVE} AND exercise_id IS NOT NULL GROUP BY exercise_id`,
    )
    return Object.fromEntries(rows.map((r) => [r.exercise_id, r.n]))
  },
}

// ══════════════════════════════ ESTADÍSTICAS GLOBALES ══════════════════════════════

export async function globalStats() {
  const j = await one<{ n: number; w: number }>(
    `SELECT COUNT(*) n, COALESCE(SUM(word_count),0) w FROM journal_entries WHERE ${ALIVE}`,
  )
  const d = await one<{ n: number; w: number }>(
    `SELECT COUNT(*) n, COALESCE(SUM(word_count),0) w FROM documents WHERE ${ALIVE}`,
  )
  const t = await one<{ n: number; w: number }>(
    `SELECT COUNT(*) n, COALESCE(SUM(word_count),0) w FROM therapy_entries WHERE ${ALIVE}`,
  )
  const p = await one<{ novels: number; essays: number }>(
    `SELECT SUM(kind='novel') novels, SUM(kind='essay') essays FROM projects WHERE ${ALIVE}`,
  )
  return {
    journalEntries: j?.n ?? 0,
    journalWords: j?.w ?? 0,
    docWords: d?.w ?? 0,
    therapyEntries: t?.n ?? 0,
    therapyWords: t?.w ?? 0,
    novels: p?.novels ?? 0,
    essays: p?.essays ?? 0,
    totalWords: (j?.w ?? 0) + (d?.w ?? 0) + (t?.w ?? 0),
  }
}

/** Filas pendientes de subir, por tabla. */
export async function pendingCounts(): Promise<Record<string, number>> {
  const tables = [
    'journal_entries',
    'projects',
    'documents',
    'characters',
    'places',
    'plot_threads',
    'plot_beats',
    'therapy_entries',
    'tags',
  ]
  const out: Record<string, number> = {}
  for (const t of tables) {
    const r = await one<{ n: number }>(`SELECT COUNT(*) n FROM ${t} WHERE dirty = 1`)
    if (r?.n) out[t] = r.n
  }
  return out
}
