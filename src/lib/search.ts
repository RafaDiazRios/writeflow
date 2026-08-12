import { getMeta, one, query, run, setMeta } from './db'
import { excerpt } from './text'

/**
 * Búsqueda global sobre los cuatro módulos.
 *
 * Una sola caja que mira a la vez en el diario, la novela, los ensayos, las fichas
 * de personaje y la escritura terapéutica. Por debajo es FTS5, así que encuentra
 * por palabra y no por subcadena: buscar «casa» no devuelve «casado», pero sí
 * encuentra «casa» en medio de un párrafo de mil palabras sin recorrerlo entero.
 *
 * El índice se mantiene al guardar (ver `repo.ts`) y se puede reconstruir entero
 * desde Ajustes si alguna vez se desincroniza.
 */

export type SearchKind = 'journal' | 'doc' | 'therapy' | 'character' | 'project'

export const KIND_LABEL: Record<SearchKind, string> = {
  journal: 'Diario',
  doc: 'Documento',
  therapy: 'Terapia',
  character: 'Personaje',
  project: 'Proyecto',
}

export interface IndexInput {
  kind: SearchKind
  refId: string
  title: string
  body: string
  projectId?: string | null
  /** Título del proyecto o del ejercicio; se muestra como contexto. */
  parent?: string | null
  date?: string | null
}

export interface SearchHit {
  kind: SearchKind
  refId: string
  projectId: string | null
  parent: string | null
  date: string | null
  title: string
  snippet: string
  rank: number
}

// ─────────────────────────── mantenimiento del índice ───────────────────────────

/** Inserta o actualiza una fila del índice. */
export async function indexRow(input: IndexInput) {
  const body = (input.body ?? '').slice(0, 200_000) // techo defensivo
  await run(
    `INSERT INTO search_docs (kind, ref_id, project_id, parent, date, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(kind, ref_id) DO UPDATE SET
       project_id = excluded.project_id,
       parent     = excluded.parent,
       date       = excluded.date,
       updated_at = excluded.updated_at`,
    [input.kind, input.refId, input.projectId ?? null, input.parent ?? null, input.date ?? null],
  )
  const row = await one<{ id: number }>(
    'SELECT id FROM search_docs WHERE kind = ? AND ref_id = ?',
    [input.kind, input.refId],
  )
  if (!row) return
  await run('DELETE FROM search_fts WHERE rowid = ?', [row.id])
  await run('INSERT INTO search_fts (rowid, title, body) VALUES (?, ?, ?)', [
    row.id,
    input.title ?? '',
    body,
  ])
}

export async function removeFromIndex(kind: SearchKind, refId: string) {
  const row = await one<{ id: number }>(
    'SELECT id FROM search_docs WHERE kind = ? AND ref_id = ?',
    [kind, refId],
  )
  if (!row) return
  await run('DELETE FROM search_fts WHERE rowid = ?', [row.id])
  await run('DELETE FROM search_docs WHERE id = ?', [row.id])
}

/** Reconstruye el índice entero desde las tablas de contenido. */
export async function rebuildIndex(): Promise<number> {
  await run('DELETE FROM search_fts')
  await run('DELETE FROM search_docs')

  let n = 0
  const alive = 'deleted_at IS NULL'

  const entries = await query<{
    id: string; title: string; content_text: string; entry_date: string; prompt_text: string | null
  }>(`SELECT id, title, content_text, entry_date, prompt_text FROM journal_entries WHERE ${alive}`)
  for (const e of entries) {
    await indexRow({
      kind: 'journal',
      refId: e.id,
      title: e.title || e.entry_date,
      body: [e.content_text, e.prompt_text].filter(Boolean).join('\n'),
      date: e.entry_date,
    })
    n++
  }

  const projects = await query<{ id: string; title: string; kind: string; logline: string | null; synopsis: string | null }>(
    `SELECT id, title, kind, logline, synopsis FROM projects WHERE ${alive}`,
  )
  const projectTitle = new Map(projects.map((p) => [p.id, p.title]))
  for (const p of projects) {
    await indexRow({
      kind: 'project',
      refId: p.id,
      title: p.title,
      body: [p.logline, p.synopsis].filter(Boolean).join('\n'),
      projectId: p.id,
      parent: p.kind === 'novel' ? 'Novela' : 'Ensayo',
    })
    n++
  }

  const docs = await query<{
    id: string; project_id: string; title: string; content_text: string; synopsis: string | null; notes: string | null
  }>(`SELECT id, project_id, title, content_text, synopsis, notes FROM documents WHERE ${alive}`)
  for (const d of docs) {
    await indexRow({
      kind: 'doc',
      refId: d.id,
      title: d.title,
      body: [d.content_text, d.synopsis, d.notes].filter(Boolean).join('\n'),
      projectId: d.project_id,
      parent: projectTitle.get(d.project_id) ?? null,
    })
    n++
  }

  const chars = await query<{ id: string; project_id: string; name: string; notes: string | null; backstory: string | null; goal: string | null }>(
    `SELECT id, project_id, name, notes, backstory, goal FROM characters WHERE ${alive}`,
  )
  for (const c of chars) {
    await indexRow({
      kind: 'character',
      refId: c.id,
      title: c.name,
      body: [c.goal, c.backstory, c.notes].filter(Boolean).join('\n'),
      projectId: c.project_id,
      parent: projectTitle.get(c.project_id) ?? null,
    })
    n++
  }

  const therapy = await query<{
    id: string; exercise_name: string | null; content_text: string; session_date: string; school: string | null
  }>(`SELECT id, exercise_name, content_text, session_date, school FROM therapy_entries WHERE ${alive}`)
  for (const t of therapy) {
    await indexRow({
      kind: 'therapy',
      refId: t.id,
      title: t.exercise_name ?? 'Sesión',
      body: t.content_text,
      date: t.session_date,
      parent: t.school,
    })
    n++
  }

  await setMeta('search_indexed_at', new Date().toISOString())
  return n
}

export async function indexedAt(): Promise<string | null> {
  return getMeta('search_indexed_at')
}

export async function indexSize(): Promise<number> {
  const r = await one<{ n: number }>('SELECT COUNT(*) n FROM search_docs')
  return r?.n ?? 0
}

/** Si el índice está vacío pero hay contenido, lo reconstruye en silencio. */
export async function ensureIndex() {
  if ((await indexedAt()) !== null) return
  await rebuildIndex()
}

// ─────────────────────────── consulta ───────────────────────────

/**
 * Traduce lo que escribe una persona a la sintaxis de MATCH.
 *
 * FTS5 tiene operadores propios (`AND`, `NEAR`, `*`, `:`, `-`, comillas) y una
 * consulta mal formada lanza una excepción, no devuelve cero resultados. Por eso
 * cada palabra se entrecomilla —lo que la neutraliza— y solo la última recibe `*`,
 * para que la búsqueda vaya encontrando cosas mientras se escribe.
 */
export function toMatchQuery(input: string): string | null {
  const words = input
    .replace(/["*:^(){}[\]]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0)
  if (!words.length) return null
  return words
    .map((w, i) => (i === words.length - 1 && w.length >= 2 ? `"${w}"*` : `"${w}"`))
    .join(' AND ')
}

export interface SearchOptions {
  kinds?: SearchKind[]
  limit?: number
}

export async function search(input: string, opts: SearchOptions = {}): Promise<SearchHit[]> {
  const match = toMatchQuery(input)
  if (!match) return []
  const limit = opts.limit ?? 60

  const rows = await query<{
    kind: SearchKind
    ref_id: string
    project_id: string | null
    parent: string | null
    date: string | null
    title: string
    snip: string
    rank: number
  }>(
    `SELECT d.kind, d.ref_id, d.project_id, d.parent, d.date,
            f.title AS title,
            snippet(search_fts, 1, '«', '»', '…', 12) AS snip,
            bm25(search_fts, 8.0, 1.0) AS rank
       FROM search_fts f
       JOIN search_docs d ON d.id = f.rowid
      WHERE search_fts MATCH ?
      ORDER BY rank
      LIMIT ?`,
    [match, limit],
  )

  const wanted = opts.kinds
  return rows
    .filter((r) => !wanted || wanted.includes(r.kind))
    .map((r) => ({
      kind: r.kind,
      refId: r.ref_id,
      projectId: r.project_id,
      parent: r.parent,
      date: r.date,
      title: r.title || '(sin título)',
      snippet: r.snip?.trim() ? r.snip : excerpt('', 0),
      rank: r.rank,
    }))
}

/** Ruta a la que navegar al elegir un resultado. */
export function hitRoute(hit: SearchHit, projectKindById: Record<string, string>): string {
  switch (hit.kind) {
    case 'journal':
      return `/diario?entry=${hit.refId}&date=${hit.date ?? ''}`
    case 'therapy':
      return `/terapia?entry=${hit.refId}`
    case 'character':
      return `/novela?project=${hit.projectId ?? ''}&tab=characters&character=${hit.refId}`
    case 'project':
      return `${projectKindById[hit.refId] === 'essay' ? '/ensayos' : '/novela'}?project=${hit.refId}`
    case 'doc':
      return `${projectKindById[hit.projectId ?? ''] === 'essay' ? '/ensayos' : '/novela'}?project=${hit.projectId ?? ''}&doc=${hit.refId}`
  }
}

/** Mapa id de proyecto → tipo, necesario para saber a qué módulo llevar. */
export async function projectKinds(): Promise<Record<string, string>> {
  const rows = await query<{ id: string; kind: string }>('SELECT id, kind FROM projects')
  return Object.fromEntries(rows.map((r) => [r.id, r.kind]))
}
