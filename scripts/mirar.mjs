/* Mirar la aplicación en un navegador, sin compilar nada de Rust.
 *
 * `tauri dev` abre la ventana de verdad, pero exige la cadena de Rust y una
 * primera compilación larga. Para lo que más se repite —ver cómo ha quedado
 * algo, ajustar un tamaño, arrastrar un panel— basta con la interfaz de verdad
 * contra una base de datos de verdad, y eso no necesita Rust.
 *
 * Es el mismo montaje que usa el banco de pruebas (`preview-escritorio.mjs`):
 * el puente de Tauri se sustituye por un `fetch` a este proceso, que ejecuta el
 * SQL contra un SQLite real con las migraciones reales. La diferencia es que
 * aquí no conduce Playwright: el servidor se queda levantado y abres tú el
 * navegador.
 *
 *     npm run mirar
 *
 * Y luego http://localhost:4334
 *
 * Dos avisos:
 *
 *  - **No es tu diario.** La base vive en `node_modules/.tmp/mirar.db` y se
 *    crea vacía la primera vez. Lo que escribas aquí es de mentira, y lo que
 *    tengas en la aplicación de verdad no se toca. Con `--limpia` se empieza
 *    de cero otra vez.
 *  - **Solo está doblado lo que hace falta**: la base de datos, la plataforma
 *    y `app_info`. Exportar, compartir, el login con Google y el cifrado pasan
 *    por otras órdenes nativas y aquí no responden. Para eso, `tauri dev` o el
 *    instalador.
 */
import { DatabaseSync } from 'node:sqlite'
import { createServer } from 'node:http'
import { readFile, mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join } from 'node:path'
import { ALL } from './migration-sql.mjs'

const PUERTO = 4334
const RUTA_DB = join('node_modules', '.tmp', 'mirar.db')

if (!existsSync('dist/index.html')) {
  console.error('\nNo hay nada construido todavía. Ejecuta antes:  npm run build\n')
  process.exit(1)
}

await mkdir(join('node_modules', '.tmp'), { recursive: true })
if (process.argv.includes('--limpia')) await rm(RUTA_DB, { force: true })

const nueva = !existsSync(RUTA_DB)
const db = new DatabaseSync(RUTA_DB)
db.exec(ALL)

/* `undefined` no es un valor que SQLite entienda, y los booleanos de JavaScript
 * tampoco: el puente de Tauri los convierte y aquí hay que hacer lo mismo. */
const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)

/* El doble del puente. Va incrustado en el HTML porque, a diferencia del banco
 * de pruebas, aquí no hay un Playwright que lo inyecte antes de cargar. */
const STUB = () => {
  const sql = async (tipo, s, params) => {
    const r = await fetch('/sql', {
      method: 'POST',
      body: JSON.stringify({ tipo, sql: s, params }),
    }).then((x) => x.json())
    if (!r.ok) throw new Error(r.error)
    return r.out
  }
  window.__TAURI_INTERNALS__ = {
    transformCallback: (cb) => {
      const id = Math.floor(performance.now() * 1000) % 1e9
      window[`_${id}`] = cb
      return id
    },
    invoke: async (cmd, args) => {
      if (cmd === 'plugin:sql|load') return 'sqlite:writeflow.db'
      if (cmd === 'plugin:sql|select') return sql('select', args.query, args.values ?? [])
      if (cmd === 'plugin:sql|execute') {
        const r = await sql('execute', args.query, args.values ?? [])
        return [r.rowsAffected, r.lastInsertId]
      }
      if (cmd === 'plugin:os|platform') return 'windows'
      if (cmd === 'app_info') return { version: 'mirar', dataDir: '/tmp', dbPath: RUTA_DB }
      /* Lo que no está doblado se avisa en la consola en vez de fallar en
       * silencio, que es lo que confunde. */
      console.warn('[mirar] orden nativa no doblada:', cmd)
      return null
    },
  }
  window.__TAURI_OS_PLUGIN_INTERNALS__ = { os_type: 'windows' }
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2',
}

const srv = createServer(async (req, res) => {
  if (req.url === '/sql') {
    let body = ''
    for await (const c of req) body += c
    const { tipo, sql, params = [] } = JSON.parse(body)
    try {
      const p = params.map(norm)
      const out =
        tipo === 'select'
          ? db.prepare(sql).all(...p)
          : (() => {
              const r = db.prepare(sql).run(...p)
              return { rowsAffected: Number(r.changes), lastInsertId: Number(r.lastInsertRowid) }
            })()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true, out }))
    } catch (e) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: false, error: String(e) }))
    }
    return
  }

  /* La decisión se toma sobre la URL, que siempre lleva «/», y no sobre la ruta
   * ya unida: en Windows `join('dist', '/')` da «dist\», la comprobación de la
   * barra final falla y index.html no se sirve nunca. */
  const ruta = req.url.split('?')[0]
  const p = join('dist', ruta.endsWith('/') ? `${ruta}index.html` : ruta)

  try {
    const buf = await readFile(p)
    if (extname(p) === '.html') {
      const html = buf
        .toString('utf8')
        .replace('<head>', `<head><script>const RUTA_DB=${JSON.stringify(RUTA_DB)};(${STUB})()</script>`)
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' })
    res.end(buf)
  } catch {
    res.writeHead(404)
    res.end('')
  }
})

await new Promise((r) => srv.listen(PUERTO, r))

console.log(`
  WriteFlow, para mirar:   http://localhost:${PUERTO}

  Base de datos:  ${RUTA_DB}${nueva ? '  (recién creada, vacía)' : ''}
  De mentira: tu diario de verdad no se toca. Para vaciarla, --limpia.

  No responden aquí: exportar, compartir, Google y el cifrado.
  Ctrl+C para parar.
`)
