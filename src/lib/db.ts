import Database from '@tauri-apps/plugin-sql'

/**
 * Acceso a la base de datos local (SQLite en el disco del usuario).
 * Todo el trabajo de la app pasa por aquí: la nube es opcional y siempre
 * secundaria. Si no hay conexión, la app funciona exactamente igual.
 */

let dbPromise: Promise<Database> | null = null

export function db(): Promise<Database> {
  if (!dbPromise) dbPromise = Database.load('sqlite:writeflow.db')
  return dbPromise
}

export async function query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  const d = await db()
  return (await d.select(sql, params)) as T[]
}

export async function one<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows.length ? rows[0] : null
}

export async function run(sql: string, params: unknown[] = []) {
  const d = await db()
  return d.execute(sql, params)
}

/** Ejecuta varias sentencias como una unidad. */
export async function tx(fn: () => Promise<void>) {
  await run('BEGIN')
  try {
    await fn()
    await run('COMMIT')
  } catch (e) {
    await run('ROLLBACK')
    throw e
  }
}

// ── ayudas de metadatos (clave/valor) ──

export async function getMeta(key: string): Promise<string | null> {
  const row = await one<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key])
  return row?.value ?? null
}

export async function setMeta(key: string, value: string) {
  await run(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  )
}

export async function delMeta(key: string) {
  await run('DELETE FROM meta WHERE key = ?', [key])
}

// ── utilidades comunes de escritura ──

export const nowISO = () => new Date().toISOString()

/**
 * INSERT/UPDATE genérico marcando la fila como pendiente de sincronizar.
 * `data` debe contener solo columnas reales de la tabla.
 */
export async function upsert(table: string, data: Record<string, unknown>) {
  const payload = { ...data, updated_at: nowISO(), dirty: 1 }
  const cols = Object.keys(payload)
  const placeholders = cols.map(() => '?').join(', ')
  const updates = cols
    .filter((c) => c !== 'id' && c !== 'created_at')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ')
  const sql =
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders}) ` +
    `ON CONFLICT(id) DO UPDATE SET ${updates}, rev = ${table}.rev + 1`
  await run(sql, Object.values(payload))
}

/** Borrado lógico: se conserva la fila para poder propagar el borrado a la nube. */
export async function softDelete(table: string, id: string) {
  const ts = nowISO()
  await run(
    `UPDATE ${table} SET deleted_at = ?, updated_at = ?, dirty = 1, rev = rev + 1 WHERE id = ?`,
    [ts, ts, id],
  )
}
