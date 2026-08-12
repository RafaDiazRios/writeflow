// Sustituto de @tauri-apps/plugin-sql para poder probar el esquema y los
// repositorios fuera de Tauri, contra un SQLite real en memoria.
import { DatabaseSync } from 'node:sqlite'

const dbs = new Map()

class Database {
  constructor(path) {
    this.path = path
    this.raw = new DatabaseSync(':memory:')
  }
  static async load(path) {
    if (!dbs.has(path)) {
      const d = new Database(path)
      const { ALL } = await import('./migration-sql.mjs')
      d.raw.exec(ALL)
      dbs.set(path, d)
    }
    return dbs.get(path)
  }
  async select(sql, params = []) {
    return this.raw.prepare(sql).all(...params.map(norm))
  }
  async execute(sql, params = []) {
    const r = this.raw.prepare(sql).run(...params.map(norm))
    return { rowsAffected: Number(r.changes), lastInsertId: Number(r.lastInsertRowid) }
  }
}
const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)

export default Database
