/* Arranca el bundle en un navegador con un doble del puente de Tauri, para poder
   ver y fotografiar la interfaz móvil sin compilar para Android.
   El puente responde con una base de datos vacía: es exactamente el primer
   arranque, que es lo que conviene revisar. */
import { chromium, devices } from 'playwright'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { extname, join } from 'node:path'

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }
const srv = createServer(async (req, res) => {
  let p = join('dist', req.url.split('?')[0])
  if (p.endsWith('/')) p += 'index.html'
  try {
    const buf = await readFile(p)
    res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream' })
    res.end(buf)
  } catch {
    res.writeHead(404)
    res.end('')
  }
})
await new Promise((r) => srv.listen(4333, r))

const STUB = () => {
  const store = new Map()
  window.__TAURI_INTERNALS__ = {
    transformCallback: (cb) => {
      const id = Math.floor(performance.now() * 1000) % 1e9
      window[`_${id}`] = cb
      return id
    },
    invoke: async (cmd, args) => {
      if (cmd === 'plugin:sql|load') return 'sqlite:writeflow.db'
      if (cmd === 'plugin:sql|select') {
        const q = (args?.query ?? '').toLowerCase()
        if (q.includes('count(')) return [{ n: 0, entries: 0, words: 0, days: 0, w: 0, novels: 0, essays: 0 }]
        return []
      }
      if (cmd === 'plugin:sql|execute') return [0, 0]
      if (cmd === 'plugin:os|platform') return 'android'
      if (cmd === 'app_info') return { version: '0.1.2', dataDir: '/data/app', dbPath: '/data/app/writeflow.db' }
      return null
    },
  }
  window.__TAURI_OS_PLUGIN_INTERNALS__ = { os_type: 'android' }
}

await mkdir('node_modules/.tmp/capturas', { recursive: true })
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })

const pantallas = [
  ['inicio', '/'],
  ['diario', '/#/diario'],
  ['terapia', '/#/terapia'],
  ['biblioteca', '/#/biblioteca'],
  ['ajustes', '/#/ajustes'],
]

const ctx = await browser.newContext({ ...devices['Pixel 7'] })
const page = await ctx.newPage()
const errores = []
page.on('pageerror', (e) => errores.push(String(e.message)))

for (const [nombre, ruta] of pantallas) {
  await page.addInitScript(STUB)
  await page.goto('http://localhost:4333' + ruta, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  await page.screenshot({ path: `node_modules/.tmp/capturas/${nombre}.png` })
  const texto = (await page.$eval('#root', (el) => el.innerText)).replace(/\n+/g, ' | ').slice(0, 120)
  console.log(`  ${nombre.padEnd(12)} ${texto}`)
}

// La barra inferior solo debe existir en la piel móvil.
const tabs = await page.$$eval('nav a', (as) => as.map((a) => a.innerText.trim()))
console.log('\n  pestañas inferiores:', tabs.join(' · '))

const ancho = await page.evaluate(() => document.documentElement.scrollWidth)
const viewport = page.viewportSize().width
console.log(`  ancho de página ${ancho}px en un viewport de ${viewport}px →`, ancho <= viewport + 1 ? 'sin desbordamiento ✔' : 'DESBORDA ✖')

console.log('\n  errores:', errores.filter((e) => !/invoke|tauri|sql/i.test(e)))
await browser.close()
srv.close()
