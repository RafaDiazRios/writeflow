/* Pruebas del idioma y de las fechas.
 *
 * Lo que se comprueba aquí no se ve leyendo el código: que el diccionario
 * inglés no tenga huecos, que las fechas cambien de forma —y no solo de
 * palabras— al cambiar de idioma, y que el día en que empieza la semana sea
 * de verdad independiente del idioma, que fue la decisión de Rafa.
 */
import { setIdiomaUI, t, num, traducirErrorNativo, IDIOMAS } from '../src/i18n'
import { CORRIENTES } from '../src/lib/types'
import es from '../src/i18n/es.json'
import en from '../src/i18n/en.json'
import promptsEs from '../src/data/es/prompts.json'
import promptsEn from '../src/data/en/prompts.json'
import ejerciciosEs from '../src/data/es/therapyExercises.json'
import ejerciciosEn from '../src/data/en/therapyExercises.json'
import plantillasEs from '../src/data/es/essayTemplates.json'
import plantillasEn from '../src/data/en/essayTemplates.json'
import {
  dayAndMonth,
  longDate,
  monthGrid,
  setInicioSemana,
  weekdayInitials,
} from '../src/lib/dates'

let fails = 0
const check = (name: string, cond: boolean, extra = '') => {
  if (cond) console.log(`  ✔ ${name}`)
  else { fails++; console.log(`  ✖ ${name} ${extra}`) }
}

// `setIdiomaUI` escribe en document.documentElement; en Node no existe.
;(globalThis as Record<string, unknown>).document = { documentElement: {} }

console.log('\n— diccionarios —')

const clavesEs = Object.keys(es as Record<string, string>)
const clavesEn = Object.keys(en as Record<string, string>)
const faltan = clavesEs.filter((k) => !clavesEn.includes(k))
const sobran = clavesEn.filter((k) => !clavesEs.includes(k))

check('el inglés cubre todas las claves', faltan.length === 0, `→ faltan ${faltan.join(', ')}`)
check('y no tiene claves de más', sobran.length === 0, `→ sobran ${sobran.join(', ')}`)
check('ninguna traducción está vacía',
  clavesEn.every((k) => (en as Record<string, string>)[k].trim().length > 0))
check('el inglés no es una copia literal del español',
  clavesEs.some((k) => (es as Record<string, string>)[k] !== (en as Record<string, string>)[k]))

console.log('\n— traducción —')

setIdiomaUI('es')
check('devuelve el español', t('ajustes.semana.lunes') === 'Lunes')
setIdiomaUI('en')
check('devuelve el inglés', t('ajustes.semana.lunes') === 'Monday')
check('una clave que no existe se devuelve tal cual', t('no.existe.esta.clave') === 'no.existe.esta.clave')
check('los parámetros se sustituyen', t('{a} y {b}', { a: 1, b: 2 }) === '1 y 2')

console.log('\n— números —')

setIdiomaUI('es')
const milEs = num(1234567)
setIdiomaUI('en')
const milEn = num(1234567)
check('el español agrupa los miles', milEs.replace(/[\d]/g, '') !== '')
check('el inglés separa distinto que el español', milEs !== milEn, `→ ${milEs} vs ${milEn}`)

console.log('\n— errores que vienen de Rust —')

setIdiomaUI('es')
check('un codigo suelto se traduce',
  traducirErrorNativo('error.fraseIncorrecta').startsWith('No se pudo descifrar'),
  `→ ${traducirErrorNativo('error.fraseIncorrecta')}`)
check('el detalle tecnico se conserva entre parentesis',
  traducirErrorNativo('error.compartirNoEscribe|disco lleno').endsWith('(disco lleno)'),
  `→ ${traducirErrorNativo('error.compartirNoEscribe|disco lleno')}`)
setIdiomaUI('en')
check('y cambia con el idioma',
  traducirErrorNativo('error.fraseIncorrecta').startsWith('Could not decrypt'),
  `→ ${traducirErrorNativo('error.fraseIncorrecta')}`)
// Lo importante del respaldo: una clave que no existe no debe salir en pantalla
// como «error.loQueSea», sino dejar pasar el mensaje crudo.
check('una clave desconocida se deja pasar tal cual',
  traducirErrorNativo('error.noExiste|detalle') === 'error.noExiste|detalle')
check('un error que no es un codigo no se toca',
  traducirErrorNativo(new Error('Ha fallado la red')) === 'Ha fallado la red')

console.log('\n— fechas —')

const MIERCOLES = '2026-08-12'

setIdiomaUI('es')
const largoEs = longDate(MIERCOLES)
setIdiomaUI('en')
const largoEn = longDate(MIERCOLES)

check('en español lleva «de»', largoEs.includes(' de '), `→ ${largoEs}`)
check('en inglés no lleva «de»', !largoEn.includes(' de '), `→ ${largoEn}`)
check('en inglés sale el mes en inglés', largoEn.includes('August'), `→ ${largoEn}`)
check('en español sale el mes en español', largoEs.includes('agosto'), `→ ${largoEs}`)
check('ambos empiezan en mayúscula',
  largoEs[0] === largoEs[0].toUpperCase() && largoEn[0] === largoEn[0].toUpperCase())

setIdiomaUI('es')
check('«12 de agosto»', dayAndMonth(MIERCOLES) === '12 de agosto', `→ ${dayAndMonth(MIERCOLES)}`)
setIdiomaUI('en')
check('«12 August»', dayAndMonth(MIERCOLES) === '12 August', `→ ${dayAndMonth(MIERCOLES)}`)

console.log('\n— el día en que empieza la semana —')

setIdiomaUI('es')
setInicioSemana(1)
const lunesEs = weekdayInitials()
setInicioSemana(0)
const domingoEs = weekdayInitials()

check('empezando en lunes hay siete días', lunesEs.length === 7)
check('empezando en domingo cambia el orden', lunesEs[0] !== domingoEs[0], `→ ${lunesEs} vs ${domingoEs}`)
check('el domingo pasa del final al principio',
  lunesEs[6] === domingoEs[0], `→ ${lunesEs[6]} vs ${domingoEs[0]}`)

setInicioSemana(1)
setIdiomaUI('en')
const lunesEn = weekdayInitials()
check('las iniciales cambian con el idioma', lunesEs.join('') !== lunesEn.join(''),
  `→ ${lunesEs.join('')} vs ${lunesEn.join('')}`)

// La inicial estrecha de date-fns da «M» para martes Y miércoles. La lista
// fija que había antes usaba la X, que es la convención española, y perderla
// dejaba el calendario con dos emes seguidas.
check('el miércoles en español es X, no una segunda M',
  lunesEs.join('') === 'LMXJVSD', `→ ${lunesEs.join('')}`)
check('en inglés son las siete iniciales inglesas',
  lunesEn.join('') === 'MTWTFSS', `→ ${lunesEn.join('')}`)

// La preferencia no depende del idioma: es la decisión que tomó Rafa, porque
// en el Reino Unido la semana también empieza en lunes. Se comprueba sobre la
// rejilla y no sobre las iniciales, porque las letras sí cambian de idioma y
// mirarlas no demostraría nada.
setInicioSemana(1)
setIdiomaUI('en')
const primeroEn = monthGrid(new Date(2026, 7, 1))[0].getDay()
setIdiomaUI('es')
const primeroEs = monthGrid(new Date(2026, 7, 1))[0].getDay()
check('en inglés con «lunes» elegido, la semana empieza en lunes', primeroEn === 1, `→ ${primeroEn}`)
check('y en español también', primeroEs === 1, `→ ${primeroEs}`)

setInicioSemana(0)
setIdiomaUI('en')
const domingoEn = monthGrid(new Date(2026, 7, 1))[0].getDay()
check('elegir «domingo» manda sobre el idioma', domingoEn === 0, `→ ${domingoEn}`)

console.log('\n— rejilla del calendario —')

setInicioSemana(1)
const rejillaLunes = monthGrid(new Date(2026, 7, 1))
setInicioSemana(0)
const rejillaDomingo = monthGrid(new Date(2026, 7, 1))

check('la rejilla son semanas completas', rejillaLunes.length % 7 === 0, `→ ${rejillaLunes.length}`)
check('empezando en lunes, el primer día es lunes', rejillaLunes[0].getDay() === 1)
check('empezando en domingo, el primer día es domingo', rejillaDomingo[0].getDay() === 0)
check('las dos contienen el mes entero',
  rejillaLunes.some((d) => d.getDate() === 31 && d.getMonth() === 7) &&
  rejillaDomingo.some((d) => d.getDate() === 31 && d.getMonth() === 7))

check('hay exactamente dos idiomas', IDIOMAS.length === 2)

/* Las claves que se componen en marcha (`estado.${valor}`, `ficha.${campo}`…)
 * no las ve nadie hasta que se pinta la pantalla: si falta una, en vez de un
 * error sale la clave escrita en la interfaz. Aquí se comprueban una a una,
 * que es lo único que las cubre. */
console.log('\n— claves que se componen en marcha —')

const FAMILIAS: [string, string[]][] = [
  ['animo', ['1', '2', '3', '4', '5']],
  ['corriente', [...CORRIENTES]],
  ['nivel', ['1', '2', '3']],
  ['tradicion', ['academic', 'literary', 'journalistic']],
  ['estado', ['idea', 'borrador', 'revisado', 'final', 'descartado']],
  ['momento', ['idea', 'escrito', 'revisado']],
  ['doc.nuevo', ['folder', 'chapter', 'scene', 'note', 'section', 'research']],
  ['tipo', ['journal', 'doc', 'therapy', 'character', 'project']],
  [
    'ficha',
    ['role', 'age', 'occupation', 'appearance', 'personality', 'goal', 'motivation',
     'conflict', 'arc', 'backstory', 'voice', 'secrets', 'relationships', 'notes'],
  ],
]

for (const [familia, valores] of FAMILIAS) {
  const faltan = valores.filter((v) => !(`${familia}.${v}` in (es as Record<string, string>)))
  check(`${familia}.* completa`, faltan.length === 0, `→ faltan ${faltan.join(', ')}`)
}

/* Los códigos que devuelve el backend en Rust. No los ve el compilador de
 * TypeScript —viajan como cadenas desde el otro lado del puente— así que si
 * alguien borra una clave, esto es lo único que se entera. La lista se mantiene
 * a mano, en paralelo a `src-tauri/src/compartir.rs` y `crypto.rs`. */
const CODIGOS_RUST = [
  'error.compartirNombreVacio', 'error.compartirSinCache', 'error.compartirSinCarpeta',
  'error.compartirNoEscribe', 'error.compartirSinPlugin', 'error.compartirRechazado',
  'error.compartirSoloAndroid', 'error.salCorta', 'error.claveInvalida', 'error.noCifra',
  'error.formatoDesconocido', 'error.nonceInvalido', 'error.fraseIncorrecta',
]
const sinClave = CODIGOS_RUST.filter((c) => !(c in (es as Record<string, string>)))
check('los codigos de error de Rust tienen traduccion', sinClave.length === 0,
  `→ faltan ${sinClave.join(', ')}`)

// Las que llevan sufijo: la descripción de la corriente, la ayuda del nivel y
// la pista de cada campo de la ficha.
const conSufijo: [string, string[], string][] = [
  ['corriente', [...CORRIENTES], 'desc'],
  ['nivel', ['1', '2', '3'], 'ayuda'],
  [
    'ficha',
    ['role', 'age', 'occupation', 'appearance', 'personality', 'goal', 'motivation',
     'conflict', 'arc', 'backstory', 'voice', 'secrets', 'relationships', 'notes'],
    'pista',
  ],
]
for (const [familia, valores, sufijo] of conSufijo) {
  const faltan = valores.filter(
    (v) => !(`${familia}.${v}.${sufijo}` in (es as Record<string, string>)),
  )
  check(`${familia}.*.${sufijo} completa`, faltan.length === 0, `→ faltan ${faltan.join(', ')}`)
}

console.log('\n— contenido en dos idiomas —')

/* Los identificadores son los mismos en los dos juegos a proposito: el
 * historial de prompts usados, el recuento de ejercicios hechos y el
 * `prompt_id` de las entradas del diario dejan de valer si no lo son.
 *
 * Prompts y ejercicios van uno a uno. Las plantillas no: el juego ingles lleva
 * generos que no existen en la tradicion espanola, asi que puede tener mas.
 * Mientras un fichero ingles este vacio, ese dominio cae al espanol y aqui solo
 * se avisa de que sigue pendiente. */
type ConId = { id: string }
const ids = (xs: unknown[]) => (xs as ConId[]).map((x) => x.id)

const DOMINIOS: [string, unknown[], unknown[], 'uno-a-uno' | 'el-ingles-puede-tener-mas'][] = [
  ['prompts', promptsEs, promptsEn, 'uno-a-uno'],
  ['ejercicios', ejerciciosEs, ejerciciosEn, 'uno-a-uno'],
  ['plantillas', plantillasEs, plantillasEn, 'el-ingles-puede-tener-mas'],
]

/* Una corriente sin prompts no falla: cae al conjunto entero y el usuario ve
 * sugerencias de corrientes que había desmarcado, sin enterarse. Por eso se
 * comprueba que las dos listas cubran las siete. */
type ConStream = { stream: string }
for (const [idioma, juego] of [['espanol', promptsEs], ['ingles', promptsEn]] as [string, unknown[]][]) {
  const presentes = new Set((juego as ConStream[]).map((p) => p.stream))
  const vacias = CORRIENTES.filter((c) => !presentes.has(c))
  check(`prompts: en ${idioma} las siete corrientes tienen prompts`, vacias.length === 0,
    `→ sin prompts: ${vacias.join(', ')}`)
  const sobran = [...presentes].filter((s) => !(CORRIENTES as readonly string[]).includes(s))
  check(`prompts: en ${idioma} no hay corrientes inventadas`, sobran.length === 0,
    `→ desconocidas: ${sobran.join(', ')}`)
}

for (const [nombre, juegoEs, juegoEn, regla] of DOMINIOS) {
  const idsEs = ids(juegoEs)
  check(`${nombre}: los ids espanoles no se repiten`,
    new Set(idsEs).size === idsEs.length)

  if (juegoEn.length === 0) {
    console.log(`  · ${nombre}: sin traducir todavia, cae al espanol`)
    continue
  }

  const idsEn = ids(juegoEn)
  const faltan = idsEs.filter((id) => !idsEn.includes(id))
  check(`${nombre}: el ingles cubre todos los ids espanoles`, faltan.length === 0,
    `→ faltan ${faltan.join(', ')}`)
  check(`${nombre}: los ids ingleses no se repiten`,
    new Set(idsEn).size === idsEn.length)

  const sobran = idsEn.filter((id) => !idsEs.includes(id))
  if (regla === 'uno-a-uno') {
    check(`${nombre}: el ingles no tiene ids de mas`, sobran.length === 0,
      `→ sobran ${sobran.join(', ')}`)
  } else if (sobran.length) {
    console.log(`  · ${nombre}: ${sobran.length} solo en ingles (${sobran.join(', ')})`)
  }

  // Un juego copiado del espanol sin traducir pasaria todas las de arriba.
  const textos = (xs: unknown[]) => JSON.stringify(xs)
  check(`${nombre}: el ingles no es una copia del espanol`,
    textos(juegoEs) !== textos(juegoEn))
}

console.log(fails === 0 ? '\n✔ Idioma y fechas correctos\n' : `\n✖ ${fails} fallo(s)\n`)
process.exit(fails === 0 ? 0 : 1)
