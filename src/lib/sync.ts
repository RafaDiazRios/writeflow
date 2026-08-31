import { getMeta, one, query, run, setMeta } from './db'
import { isUnlocked, keyMaterial, maybeDecrypt, maybeEncrypt } from './crypto'
import { getSession, supabase } from './supabase'
import { reindex } from './repo'
import type { SearchKind } from './search'
import { t } from '@/i18n'

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
  /** Filas que llegaron pero no se pudieron descifrar (clave distinta). */
  undecryptable: number
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

/** Se lanza cuando este equipo cifra con una clave distinta a la de la nube. */
export class ClaveDistintaError extends Error {
  constructor(
    readonly saltRemota: string,
    readonly huellaRemota: string,
  ) {
    super(
      t('error.claveDistinta'),
    )
    this.name = 'ClaveDistintaError'
  }
}

/**
 * Asegura la fila de perfil y, sobre todo, **comprueba que las claves coinciden**.
 *
 * La sal del cifrado se guarda en el perfil para que un ordenador nuevo pueda
 * reconstruir la misma clave a partir de la misma frase de paso. Antes esto solo
 * subía la sal y nunca la bajaba: el segundo equipo se inventaba la suya, y a
 * partir de ahí cada uno escribía en la nube con una clave que el otro no podía
 * leer. Como el descifrado fallaba en silencio, las entradas llegaban vacías.
 *
 * Ahora, si las huellas no coinciden, **se corta antes de subir nada**. Subir
 * con la clave equivocada es lo que convierte un despiste de configuración en
 * datos ilegibles.
 */
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
    return
  }

  if (!data.e2e_salt && salt) {
    await sb.from('profiles').update({ e2e_salt: salt, e2e_fingerprint: fingerprint }).eq('id', userId)
    return
  }

  if (data.e2e_fingerprint && fingerprint && data.e2e_fingerprint !== fingerprint) {
    throw new ClaveDistintaError(String(data.e2e_salt), String(data.e2e_fingerprint))
  }
}

/** Material de clave del servidor, para poder adoptarlo desde Ajustes. */
export async function claveRemota(): Promise<{ salt: string; fingerprint: string } | null> {
  const sb = await supabase()
  if (!sb) return null
  const session = await getSession()
  if (!session) return null
  const { data } = await sb
    .from('profiles')
    .select('e2e_salt, e2e_fingerprint')
    .eq('id', session.user.id)
    .maybeSingle()
  if (!data?.e2e_salt || !data?.e2e_fingerprint) return null
  return { salt: String(data.e2e_salt), fingerprint: String(data.e2e_fingerprint) }
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

/**
 * Postgres devuelve `2026-08-12T15:21:47.036+00:00` y la aplicación escribe
 * `2026-08-12T15:21:47.036Z`. Son el mismo instante, pero el motor compara
 * fechas **como texto**, así que mezclar los dos formatos hacía que un
 * desempate por fecha saliera al revés. Se normaliza todo a ISO con `Z`.
 */
export function aIso(v: unknown): unknown {
  if (typeof v !== 'string' || !v) return v
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? v : d.toISOString()
}

const FECHAS = new Set(['created_at', 'updated_at', 'deleted_at'])

/**
 * Descifra una fila que llega del servidor.
 *
 * Devuelve `null` si **algo** no se pudo descifrar, y quien llama debe saltarse
 * la fila entera.
 *
 * Antes se dejaba el campo vacío y se seguía adelante, y eso destruyó datos de
 * verdad. La cadena era: llega una fila que no se puede descifrar → se guarda en
 * local con el contenido en blanco → el usuario pulsa «volver a subir todo» →
 * esa fila vacía sube con `rev` mayor → pisa la copia buena del servidor → el
 * otro equipo se la baja y pisa **su** copia buena. Un texto que existía en dos
 * ordenadores desaparece de los dos.
 *
 * La regla, entonces: una fila que no se entiende **no se escribe**. Se cuenta,
 * se avisa, y se queda en el servidor esperando a que haya clave para leerla.
 */
async function decodeRow(
  spec: TableSpec,
  row: Record<string, unknown>,
  fallos?: { n: number },
): Promise<Record<string, unknown> | null> {
  const out: Record<string, unknown> = {}
  for (const col of spec.columns) {
    const v = row[col]
    if (spec.sensitive.includes(col) && typeof v === 'string' && v.length) {
      try {
        out[col] = await maybeDecrypt(v, true)
      } catch {
        if (fallos) fallos.n++
        return null
      }
    } else {
      out[col] = FECHAS.has(col) ? aIso(v ?? null) : (v ?? null)
    }
  }
  return out
}

/**
 * Mete en el índice de búsqueda una fila que acaba de llegar del servidor.
 *
 * El índice se mantenía solo al guardar desde la interfaz, así que lo que
 * entraba por sincronización quedaba fuera: aparecía en el calendario pero no
 * en `Ctrl` + `K`. No es crítico —el índice se puede reconstruir desde
 * Ajustes—, pero es justo el tipo de fallo que nadie relaciona con la
 * sincronización.
 */
export const INDEXABLES: Record<string, SearchKind> = {
  journal_entries: 'journal',
  documents: 'doc',
  characters: 'character',
  therapy_entries: 'therapy',
  projects: 'project',
}

async function indexarFila(table: string, id: string) {
  const kind = INDEXABLES[table]
  if (!kind) return
  try {
    await reindex(kind, id)
  } catch {
    // Que falle el índice no puede tumbar la sincronización: el contenido ya
    // está guardado y el índice se reconstruye entero desde Ajustes.
  }
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

  const fallos = { n: 0 }
  let maxTs = since
  for (const remote of data as Record<string, unknown>[]) {
    const id = String(remote.id)
    const ts = String(aIso(remote.updated_at))
    if (ts > maxTs) maxTs = ts

    const local = await one<Record<string, unknown>>(`SELECT * FROM ${spec.table} WHERE id = ?`, [id])
    const decoded = await decodeRow(spec, remote, fallos)

    // Ilegible: no se toca nada en local. El cursor sí avanza, a propósito:
    // pararlo aquí dejaría el resto de la tabla sin sincronizar para siempre si
    // la clave no aparece nunca. Para recuperar estas filas cuando ya haya clave
    // está «Volver a bajarlo todo», que reinicia los cursores.
    if (!decoded) continue

    if (!local) {
      const cols = Object.keys(decoded)
      await run(
        `INSERT INTO ${spec.table} (${cols.join(',')}, dirty) VALUES (${cols.map(() => '?').join(',')}, 0)`,
        Object.values(decoded),
      )
      await indexarFila(spec.table, id)
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

    if (remoteRev > localRev || (remoteRev === localRev && ts > String(aIso(local.updated_at)))) {
      const cols = Object.keys(decoded).filter((c) => c !== 'id')
      await run(
        `UPDATE ${spec.table} SET ${cols.map((c) => `${c} = ?`).join(',')}, dirty = 0 WHERE id = ?`,
        [...cols.map((c) => decoded[c]), id],
      )
      await indexarFila(spec.table, id)
      report.pulled++
    }
  }
  if (fallos.n) report.undecryptable += fallos.n
  await setCursor(spec.table, maxTs)
}

/** Ciclo completo: subir lo pendiente y bajar lo nuevo. */
export async function syncNow(): Promise<SyncReport> {
  const report: SyncReport = {
    pushed: 0,
    pulled: 0,
    conflicts: 0,
    undecryptable: 0,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    errors: [],
  }
  if (running) {
    report.errors.push(t('error.sincronizacionEnCurso'))
    report.finishedAt = new Date().toISOString()
    return report
  }
  running = true
  try {
    const sb = await supabase()
    if (!sb) throw new Error(t('error.nubeSinConfigurar'))
    const session = await getSession()
    if (!session) throw new Error(t('error.entraGoogle'))
    if (!isUnlocked()) throw new Error(t('error.desbloquea'))

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

  if (report.undecryptable) {
    report.errors.push(
      t('error.ilegibles', { n: report.undecryptable }),
    )
  }

  // Lo que se acaba de bajar ya está en SQLite, pero las pantallas abiertas
  // siguen enseñando lo que leyeron al montarse. Este aviso las hace recargar.
  if (report.pulled > 0 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('writeflow:sincronizado', { detail: report }))
  }
  return report
}

/**
 * Vuelve a marcar todo el contenido local como pendiente de subir.
 *
 * Es la mitad de la reparación cuando dos equipos han estado cifrando con
 * claves distintas: se ejecuta en el equipo que **sí tiene el texto bueno**, y
 * al sincronizar vuelve a cifrarlo todo con la clave correcta. Se sube `rev`
 * para que gane sobre la copia ilegible que hay en el servidor.
 */
export async function volverASubirTodo(): Promise<number> {
  let n = 0
  for (const spec of TABLES) {
    // Segundo cinturón: **una fila vacía nunca se reenvía**. Subirla con `rev`
    // mayor pisaría una copia buena del servidor, y de ahí pasaría al resto de
    // equipos. Si el contenido está vacío no hay nada que reparar en él, así
    // que quedarse quieto no pierde nada y evita destruir lo ajeno.
    const vacia = COLUMNA_CONTENIDO[spec.table]
    const filtro = vacia
      ? `deleted_at IS NULL AND ${vacia} IS NOT NULL AND TRIM(${vacia}) <> ''`
      : 'deleted_at IS NULL'
    await run(`UPDATE ${spec.table} SET dirty = 1, rev = rev + 1 WHERE ${filtro}`)
    const r = await one<{ n: number }>(`SELECT COUNT(*) n FROM ${spec.table} WHERE ${filtro}`)
    n += r?.n ?? 0
  }
  return n
}

/**
 * Columna que decide si una fila «tiene contenido».
 *
 * Solo las tablas cuyo texto viaja cifrado pueden llegar vacías por no poder
 * descifrarse; el resto (proyectos, personajes, tramas) van en claro y su
 * ausencia de texto es legítima.
 */
const COLUMNA_CONTENIDO: Record<string, string> = {
  journal_entries: 'content_text',
  therapy_entries: 'content_text',
}

/**
 * Olvida hasta dónde se bajó cada tabla, para volver a leerlo todo del servidor.
 *
 * La otra mitad de la reparación: en el equipo que tiene entradas vacías, esto
 * hace que la siguiente sincronización las vuelva a traer, ya descifrables.
 */
export async function volverABajarTodo(): Promise<void> {
  await run('DELETE FROM sync_cursors')
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
