/* Banco de pruebas del escritorio con navegador de verdad.
 *
 * El puente de Tauri se sustituye por un `fetch` a este mismo proceso, que
 * ejecuta las consultas contra un SQLite real en memoria con las migraciones
 * reales. Es decir: la interfaz de verdad, los repositorios de verdad y el SQL
 * de verdad. Lo único simulado es el transporte.
 *
 * Sirve para lo que no se puede comprobar leyendo el código: que arrastrar una
 * escena la deja donde se ve que va a caer.
 */
import { chromium } from 'playwright'
import { DatabaseSync } from 'node:sqlite'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { ALL } from './migration-sql.mjs'

const db = new DatabaseSync(':memory:')
db.exec(ALL)

const norm = (v) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v)

// ── datos de partida: un acto con tres escenas y otro vacío ──
const ahora = '2026-08-13T09:00:00.000Z'
db.exec(`INSERT INTO projects (id, kind, title, created_at, updated_at, rev, dirty)
         VALUES ('p1', 'novel', 'La casa vacía', '${ahora}', '${ahora}', 1, 0)`)
const doc = (id, title, kind, parent, pos) =>
  db.exec(`INSERT INTO documents (id, project_id, parent_id, position, kind, title,
             content_json, content_text, word_count, in_compile, created_at, updated_at, rev, dirty)
           VALUES ('${id}', 'p1', ${parent ? `'${parent}'` : 'NULL'}, ${pos}, '${kind}',
             '${title}', '', '', 0, 1, '${ahora}', '${ahora}', 1, 0)`)
doc('acto1', 'Primer acto', 'folder', null, 0)
doc('e1', 'Llega la carta', 'scene', 'acto1', 0)
doc('e2', 'La casa por dentro', 'scene', 'acto1', 100)
doc('e3', 'El reloj parado', 'scene', 'acto1', 200)
doc('acto2', 'Segundo acto', 'folder', null, 100)

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }
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
    // La decisión se toma sobre la URL, que siempre lleva «/», y no sobre la ruta
    // ya unida: en Windows `join('dist', '/')` da «dist\», la comprobación de la
    // barra final falla y index.html no se sirve nunca — página en blanco y 404.
    const ruta = req.url.split('?')[0]
    const p = join('dist', ruta.endsWith('/') ? `${ruta}index.html` : ruta)

  try {
    const buf = await readFile(p)
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' })
    res.end(buf)
  } catch {
    res.writeHead(404)
    res.end('')
  }
})
await new Promise((r) => srv.listen(4334, r))

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
      if (cmd === 'app_info') return { version: 'test', dataDir: '/tmp', dbPath: '/tmp/w.db' }
      return null
    },
  }
  window.__TAURI_OS_PLUGIN_INTERNALS__ = { os_type: 'windows' }
}

/**
 * Arrastrar y soltar de HTML5 no se puede simular moviendo el ratón: el
 * navegador solo emite esos eventos para gestos reales. Se lanzan a mano con un
 * DataTransfer compartido, que es lo que hace el navegador.
 *
 * **Y hay que separarlos en el tiempo.** Los manejadores guardan qué se está
 * arrastrando en el estado de React, y lanzar los tres eventos en el mismo tic
 * hace que `dragover` y `drop` lean el estado anterior —todavía vacío— y no
 * pase nada. En un arrastre de verdad median fotogramas entre evento y evento;
 * aquí hay que reproducir esa pausa o se prueba otra cosa.
 */
const PASO = ([tipo, selector, fraccionY]) => {
  const el = document.evaluate(selector, document, null, 9, null).singleNodeValue
  if (!el) return `no encontrado: ${selector}`
  if (tipo === 'dragstart') window.__dt = new DataTransfer()
  const caja = el.getBoundingClientRect()
  el.dispatchEvent(
    new DragEvent(tipo, {
      bubbles: true,
      cancelable: true,
      dataTransfer: window.__dt,
      clientX: caja.left + caja.width / 2,
      clientY: caja.top + caja.height * fraccionY,
    }),
  )
  return 'ok'
}

async function arrastrar(page, origen, destino, fraccionY) {
  const r1 = await page.evaluate(PASO, ['dragstart', origen, 0.5])
  if (r1 !== 'ok') return r1
  await page.waitForTimeout(150)
  const r2 = await page.evaluate(PASO, ['dragover', destino, fraccionY])
  if (r2 !== 'ok') return r2
  await page.waitForTimeout(150)
  await page.evaluate(PASO, ['drop', destino, fraccionY])
  await page.waitForTimeout(150)
  await page.evaluate(PASO, ['dragend', origen, 0.5])
  return 'ok'
}

await mkdir('node_modules/.tmp/capturas', { recursive: true })
// El navegador solo hay que señalarlo donde Playwright no lo instala él mismo
// (el contenedor de Cowork, con PLAYWRIGHT_CHROMIUM apuntando al binario). En
// un equipo normal, `npx playwright install chromium` lo deja justo donde
// Playwright lo busca solo, y una ruta fija —de Linux, además— lo rompe.
const ejecutable = process.env.PLAYWRIGHT_CHROMIUM
const browser = await chromium.launch(ejecutable ? { executablePath: ejecutable } : {})
const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 2 })
const errores = []
page.on('pageerror', (e) => errores.push(String(e)))
page.on('console', (m) => console.log('  consola:', m.type(), m.text()))
page.on('requestfailed', (r) => console.log('  petición fallida:', r.url(), r.failure()?.errorText))

await page.addInitScript(STUB)
await page.goto('http://localhost:4334/#/novela')
await page.waitForTimeout(1200)
console.log('  raíz:', await page.evaluate(() => document.getElementById('root')?.innerHTML.slice(0, 300) ?? 'NO HAY #root'))

// Abrir el proyecto si hace falta.
const tarjeta = page.getByText('La casa vacía').first()
if (await tarjeta.isVisible().catch(() => false)) {
  await tarjeta.click()
  await page.waitForTimeout(700)
}

const orden = async () => {
  const filas = db
    .prepare(
      `SELECT id, parent_id, position FROM documents
        WHERE project_id = 'p1' AND deleted_at IS NULL
        ORDER BY COALESCE(parent_id,''), position`,
    )
    .all()
  return filas.map((f) => `${f.parent_id ?? '·'}/${f.id}`).join(' ')
}

console.log('\n— banco de pruebas del escritorio —')
console.log('  orden inicial:', await orden())
await page.screenshot({ path: 'node_modules/.tmp/capturas/binder-antes.png' })

let fallos = 0
const check = (n, c, extra = '') => {
  if (c) console.log(`  ✔ ${n}`)
  else {
    fallos++
    console.log(`  ✖ ${n} ${extra}`)
  }
}

const fila = (t) => `//div[@role='treeitem'][.//span[text()='${t}']]`

// 1. Mover la tercera escena por encima de la primera.
const r1 = await arrastrar(page, fila('El reloj parado'), fila('Llega la carta'), 0.15)
check('el arrastre encuentra las filas', r1 === 'ok', `→ ${r1}`)
await page.waitForTimeout(600)
const tras1 = await orden()
check(
  'la escena arrastrada queda la primera de su capítulo',
  tras1.includes('acto1/e3 acto1/e1 acto1/e2'),
  `→ ${tras1}`,
)

// 2. Sacar una escena a otro capítulo soltándola en su centro.
const r2 = await arrastrar(page, fila('La casa por dentro'), fila('Segundo acto'), 0.5)
check('el segundo arrastre encuentra las filas', r2 === 'ok', `→ ${r2}`)
await page.waitForTimeout(600)
const tras2 = await orden()
check('la escena cambia de capítulo', tras2.includes('acto2/e2'), `→ ${tras2}`)
check('y sale del anterior', !tras2.includes('acto1/e2'), `→ ${tras2}`)

// 3. Lo que no se puede hacer: meter un capítulo dentro de su propia escena.
const r3 = await arrastrar(page, fila('Primer acto'), fila('El reloj parado'), 0.5)
check('el tercer arrastre encuentra las filas', r3 === 'ok', `→ ${r3}`)
await page.waitForTimeout(600)
const tras3 = await orden()
check('un capítulo no se mete dentro de su propia escena', tras3.includes('·/acto1'), `→ ${tras3}`)

await page.screenshot({ path: 'node_modules/.tmp/capturas/binder-despues.png' })
console.log('  orden final:  ', await orden())

/* ── el idioma del corrector ──
 *
 * El `lang` del editor es de donde el corrector del sistema saca qué
 * diccionario usar, y es de las cosas que no se pueden comprobar leyendo el
 * código: se pone en `editorProps` al crear el editor y se mantiene al día con
 * un efecto, así que solo un editor de verdad, montado, dice si está bien.
 *
 * Se prueba con la interfaz en español a propósito: lo que estrena la 0.4.0 es
 * que el idioma de escritura NO es el de la interfaz. */
console.log('\n— el idioma del corrector —')

const meta = (clave, valor) =>
  db.exec(`INSERT INTO meta (key, value) VALUES ('${clave}', '${valor}')
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`)

const langDelEditor = async () => {
  await page.reload()
  await page.waitForTimeout(1200)
  const tarjeta2 = page.getByText('La casa vacía').first()
  if (await tarjeta2.isVisible().catch(() => false)) {
    await tarjeta2.click()
    await page.waitForTimeout(700)
  }
  await page.locator("//div[@role='treeitem'][.//span[text()='Llega la carta']]").first().click()
  await page.waitForTimeout(700)
  return page.evaluate(() => document.querySelector('.tiptap')?.getAttribute('lang') ?? 'SIN EDITOR')
}

meta('ui_lang', 'es')
const langAuto = await langDelEditor()
check('sin elegir nada, el corrector sigue a la interfaz', langAuto === 'es-ES', `→ ${langAuto}`)

meta('write_lang', 'en')
const langElegido = await langDelEditor()
check('elegir inglés cambia el corrector con la interfaz en español',
  langElegido === 'en-GB', `→ ${langElegido}`)

/* ── los anchos de los paneles ──
 *
 * Esto sí se puede arrastrar con el ratón de verdad: la barra usa eventos de
 * puntero, no el arrastrar-y-soltar de HTML5, así que `page.mouse` sirve. Se
 * comprueba con el documento ya abierto, que es cuando están las tres barras:
 * la lateral, la del binder y la del inspector.
 *
 * Lo que hay que cazar aquí es el signo. La del inspector va **invertida** —el
 * panel está a la derecha de la barra—, y sin eso el panel se estrecha cuando
 * el gesto dice ensanchar. Es un fallo que se ve en un segundo usando la app y
 * que ninguna prueba de tipos nota. */
console.log('\n— los anchos de los paneles —')

const barras = page.locator("div[role='separator']")
const cuantas = await barras.count()
check('están las tres barras', cuantas === 3, `→ ${cuantas}`)

const valor = (i) => barras.nth(i).getAttribute('aria-valuenow').then(Number)
const guardado = (clave) =>
  Number(db.prepare('SELECT value FROM meta WHERE key = ?').get(clave)?.value ?? 0)

async function arrastrarBarra(i, dx) {
  const caja = await barras.nth(i).boundingBox()
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2)
  await page.mouse.down()
  await page.mouse.move(caja.x + caja.width / 2 + dx, caja.y + caja.height / 2, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(250)
}

const binderAntes = await valor(1)
await arrastrarBarra(1, 80)
const binderDespues = await valor(1)
check('arrastrar a la derecha ensancha el binder',
  binderDespues - binderAntes >= 60, `→ ${binderAntes} → ${binderDespues}`)
check('y el ancho queda guardado en meta',
  guardado('ancho_binder') === binderDespues,
  `→ meta ${guardado('ancho_binder')} vs ${binderDespues}`)

const inspecAntes = await valor(2)
await arrastrarBarra(2, 80)
const inspecDespues = await valor(2)
check('la del inspector va al revés: a la derecha, el panel se estrecha',
  inspecAntes - inspecDespues >= 60, `→ ${inspecAntes} → ${inspecDespues}`)

// El tope: por muy lejos que se arrastre, el binder no pasa de su máximo.
await arrastrarBarra(1, 900)
const binderTope = await valor(1)
check('el ancho no se sale del máximo', binderTope === 480, `→ ${binderTope}`)

await page.screenshot({ path: 'node_modules/.tmp/capturas/paneles.png' })
console.log('  errores de página:', errores.length ? errores : '[]')
if (errores.length) fallos++

await browser.close()
srv.close()
console.log(fallos === 0 ? '\n✔ Arrastrar, los anchos y el idioma del corrector funcionan\n' : `\n✖ ${fallos} fallo(s)\n`)
process.exit(fallos === 0 ? 0 : 1)
