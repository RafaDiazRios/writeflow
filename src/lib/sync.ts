import { getMeta, one, query, run, setMeta } from './db'
import { isUnlocked, keyMaterial, maybeDecrypt, maybeEncrypt } from './crypto'
import { getSession, supabase } from './supabase'

/**
 * Motor de sincronización offline-first.
 *
 * Reglas:
 *  1. La base local es la fuente de verdad mientras escribes. Nada bloquea.
 *  2. `dirty = 1` marca lo que falta subir. Se sube y se marca `dirty = 0`.
 *  3. Al bajar, gana la revisión (`rev`) más alta; si empatan, gana `updated_at`.
 *     Si ambas cambiaron desde el último cruce, se guarda en `sync_conflicts`
 *     y NO se pierde nada: la versión local se conserva.
 *  4. Las columnas sensibles (diario y terapia) viajan cifradas: el servidor
 *     solo ve fechas, contadores y revisiones.
 */

export interface TableSpec {
  table: string
  /** Columnas cifradas de extremo a extremo antes de subir. */
  sensitive: string[]
  columns: string[]
}

const BASE = ['id', 'created_at', 'updated_at', 'deleted_at', 'rev']

export const TABLES: TableSpec[] = [
  {
    table: 'tags',
    sensitive: [],
    columns: [...BASE, 'name', 'color'],
  },
  {
    table: 'journal_entries',
    sensitive: ['title', 'content_json', 'content_text', 'prompt_text', 'place', 'weather'],
    columns: [
      ...BASE,
      'entry_date', 'entry_time', 'title', 'content_json', 'content_text', 'mood', 'energy',
      'place', 'weather', 'prompt_id', 'prompt_text', 'word_count', 'is_favorite',
    ],
  },
  {
    table: 'projects',
    sensitive: [],
    columns: [
      ...BASE,
      'kind', 'title', 'subtitle', 'author', 'genre', 'logline', 'synopsis', 'template_id',
      'target_words', 'deadline', 'status', 'color',
    ],
  },
  {
    table: 'documents',
    sensitive: [],
    columns: [
      ...BASE,
      'project_id', 'parent_id', 'position', 'kind', 'title', 'synopsis', 'notes', 'guide',
      'content_json', 'content_text', 'label', 'status', 'pov', 'place', 'time_frame',
      'word_count', 'target_words', 'in_compile',
    ],
  },
  {
    table: 'characters',
    sensitive: [],
    columns: [
      ...BASE,
      'project_id', 'name', 'alias', 'role', 'age', 'occupation', 'appearance', 'personality',
      'goal', 'motivation', 'conflict', 'arc', 'backstory', 'voice', 'secrets', 'relationships',
      'notes', 'color', 'image_path',
    ],
  },
  {
    table: 'places',
    sensitive: [],
    columns: [...BASE, 'project_id', 'name', 'kind', 'description', 'atmosphere', 'history', 'notes'],
  },
  {
    table: 'plot_threads',
    sensitive: [],
    columns: [...BASE, 'project_id', 'name', 'kind', 'color', 'description', 'position'],
  },
  {
    table: 'plot_beats',
    sensitive: [],
    columns: [...BASE, 'project_id', 'thread_id', 'document_id', 'title', 'description', 'status', 'position'],
  },
  {
    table: 'therapy_entries',
    sensitive: ['prompt_text', 'content_json', 'content_text', 'followups', 'exercise_name'],
    columns: [
      ...BASE,
      'exercise_id', 'exercise_name', 'school', 'level', 'prompt_text', 'content_json',
      'content_text', 'followups', 'word_count', 'session_date',
    ],
  },
]

export interface SyncReport {
  pushed: number
  pulled: number
  conflicts: number
  startedAt: string
  finishedAt: string
  errors: string[]
}

export type SyncStatus = 'idle' | 'running' | 'offline' | 'error' | 'locked' | 'unconfigured'

let running = false
export function isSyncing() {
  return running
}

async function cursor(table: string): Promise<string> {
  const r = await one<{ last_pulled_at: string }>(
    'SELECT last_pulled_at FROM sync_cursors WHERE table_name = ?',
    [table],
  )
  return r?.last_pulled_at ?? '1970-01-01T00:00:00.000Z'
}

async function setCursor(table: string, ts: string) {
  await run(
    `INSERT INTO sync_cursors (table_name, last_pulled_at) VALUES (?, ?)
     ON CONFLICT(table_name) DO UPDATE SET last_pulled_at = excluded.last_pulled_at`,
    [table, ts],
  )
}

/** Comprueba conectividad real contra Supabase (no basta con navigator.onLine). */
export async function isOnline(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  try {
    const sb = await supabase()
    if (!sb) return false
    const { error } = await sb.from('profiles').select('id').limit(1)
    return !error || error.code !== 'PGRST301'
  } catch {
    return false
  }
}

/** Asegura que existe la fila de perfil con el material de clave público. */
async function ensureProfile(userId: string, email: string | undefined) {
  const sb = await supabase()
  if (!sb) return
  const { salt, fingerprint } = await keyMaterial()
  const { data } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (!data) {
    await sb.from('profiles').insert({
      id: userId,
      email: email ?? null,
      e2e_salt: salt,
      e2e_fingerprint: fingerprint,
    })
  } else if (!data.e2e_salt && salt) {
    await sb.from('profiles').update({ e2e_salt: salt, e2e_fingerprint: fingerprint }).eq('id', userId)
  }
}

async function encodeRow(spec: TableSpec, row: Record<string, unknown>, userId: string) {
  const out: Record<string, unknown> = { user_id: userId }
  for (const col of spec.columns) {
    const v = row[col]
    if (spec.sensitive.includes(col) && typeof v === 'string' && v.length) {
      out[col] = await maybeEncrypt(v, true)
    } else {
      out[col] = v ?? null
    }
  }
  return out
}

async function decodeRow(spec: TableSpec, row: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const col of spec.columns) {
    const v = row[col]
    if (spec.sensitive.includes(col) && typeof v === 'string' && v.length) {
      try {
        out[col] = await maybeDecrypt(v, true)
      } catch {
        out[col] = '' // no se pudo descifrar: se deja vacío en lugar de romper
      }
    } else {
      out[col] = v ?? null
    }
  }
  return out
}

async function pushTable(spec: TableSpec, userId: string): Promise<number> {
  const sb = await supabase()
  if (!sb) return 0
  const rows = await query<Record<string, unknown>>(
    `SELECT * FROM ${spec.table} WHERE dirty = 1 LIMIT 500`,
  )
  if (!rows.length) return 0
  const payload = []
  for (const r of rows) payload.push(await encodeRow(spec, r, userId))
  const { error } = await sb.from(spec.table).upsert(payload, { onConflict: 'id' })
  if (error) throw new Error(`${spec.table}: ${error.message}`)
  const ids = rows.map((r) => String(r.id))
  const marks = ids.map(() => '?').join(',')
  await run(`UPDATE ${spec.table} SET dirty = 0 WHERE id IN (${marks})`, ids)
  return rows.length
}

async function pullTable(spec: TableSpec, userId: string, report: SyncReport) {
  const sb = await supabase()
  if (!sb) return
  const since = await cursor(spec.table)
  const { data, error } = await sb
    .from(spec.table)
    .select('*')
    .eq('user_id', userId)
    .gt('updated_at', since)
    .order('updated_at', { ascending: true })
    .limit(1000)
  if (error) throw new Error(`${spec.table}: ${error.message}`)
  if (!data?.length) return

  let maxTs = since
  for (const remote of data as Record<string, unknown>[]) {
    const id = String(remote.id)
    const ts = String(remote.updated_at)
    if (ts > maxTs) maxTs = ts

    const local = await one<Record<string, unknown>>(`SELECT * FROM ${spec.table} WHERE id = ?`, [id])
    const decoded = await decodeRow(spec, remote)

    if (!local) {
      const cols = Object.keys(decoded)
      await run(
        `INSERT INTO ${spec.table} (${cols.join(',')}, dirty) VALUES (${cols.map(() => '?').join(',')}, 0)`,
        Object.values(decoded),
      )
      report.pulled++
      continue
    }

    const localDirty = Number(local.dirty) === 1
    const remoteRev = Number(remote.rev ?? 0)
    const localRev = Number(local.rev ?? 0)

    if (localDirty && remoteRev >= localRev && String(local.updated_at) !== ts) {
      // ambos lados cambiaron: se registra y se conserva la versión local
      await run(
        `INSERT OR REPLACE INTO sync_conflicts (id, table_name, row_id, local_json, remote_json, detected_at, resolved)
         VALUES (?, ?, ?, ?, ?, ?, 0)`,
        [`${spec.table}:${id}`, spec.table, id, JSON.stringify(local), JSON.stringify(decoded), new Date().toISOString()],
      )
      report.conflicts++
      continue
    }

    if (remoteRev > localRev || (remoteRev === localRev && ts > String(local.updated_at))) {
      const cols = Object.keys(decoded).filter((c) => c !== 'id')
      await run(
        `UPDATE ${spec.table} SET ${cols.map((c) => `${c} = ?`).join(',')}, dirty = 0 WHERE id = ?`,
        [...cols.map((c) => decoded[c]), id],
      )
      report.pulled++
    }
  }
  await setCursor(spec.table, maxTs)
}

/** Ciclo completo: subir lo pendiente y bajar lo nuevo. */
export async function syncNow(): Promise<SyncReport> {
  const report: SyncReport = {
    pushed: 0,
    pulled: 0,
    conflicts: 0,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    errors: [],
  }
  if (running) {
    report.errors.push('Ya hay una sincronización en curso')
    report.finishedAt = new Date().toISOString()
    return report
  }
  running = true
  try {
    const sb = await supabase()
    if (!sb) throw new Error('La nube no está configurada')
    const session = await getSession()
    if (!session) throw new Error('Inicia sesión con Google para sincronizar')
    if (!isUnlocked()) throw new Error('Desbloquea el almacén cifrado antes de sincronizar')

    const userId = session.user.id
    await ensureProfile(userId, session.user.email)

    for (const spec of TABLES) {
      try {
        report.pushed += await pushTable(spec, userId)
        await pullTable(spec, userId, report)
      } catch (e) {
        report.errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    await setMeta('last_sync_at', new Date().toISOString())
  } catch (e) {
    report.errors.push(e instanceof Error ? e.message : String(e))
  } finally {
    running = false
    report.finishedAt = new Date().toISOString()
  }
  return report
}

export async function lastSyncAt(): Promise<string | null> {
  return getMeta('last_sync_at')
}

export async function openConflicts(): Promise<
  { id: string; table_name: string; row_id: string; local_json: string; remote_json: string; detected_at: string }[]
> {
  return query('SELECT * FROM sync_conflicts WHERE resolved = 0 ORDER BY detected_at DESC')
}

export async function resolveConflict(id: string, keep: 'local' | 'remote') {
  const c = await one<{ table_name: string; row_id: string; remote_json: string }>(
    'SELECT * FROM sync_conflicts WHERE id = ?',
    [id],
  )
  if (!c) return
  if (keep === 'remote') {
    const spec = TABLES.find((t) => t.table === c.table_name)
    if (spec) {
      const decoded = JSON.parse(c.remote_json) as Record<string, unknown>
      const cols = Object.keys(decoded).filter((k) => k !== 'id' && spec.columns.includes(k))
      await run(
        `UPDATE ${c.table_name} SET ${cols.map((k) => `${k} = ?`).join(',')}, dirty = 0 WHERE id = ?`,
        [...cols.map((k) => decoded[k]), c.row_id],
      )
    }
  } else {
    // conservar lo local: se vuelve a marcar como pendiente para que gane arriba
    await run(`UPDATE ${c.table_name} SET dirty = 1, rev = rev + 1 WHERE id = ?`, [c.row_id])
  }
  await run('UPDATE sync_conflicts SET resolved = 1 WHERE id = ?', [id])
}

/** Sincronización periódica en segundo plano (silenciosa). */
let timer: number | null = null
export function startAutoSync(intervalMinutes = 10, onDone?: (r: SyncReport) => void) {
  stopAutoSync()
  timer = window.setInterval(async () => {
    if (!(await isOnline())) return
    const r = await syncNow()
    onDone?.(r)
  }, intervalMinutes * 60_000)
}

export function stopAutoSync() {
  if (timer !== null) {
    window.clearInterval(timer)
    timer = null
  }
}
