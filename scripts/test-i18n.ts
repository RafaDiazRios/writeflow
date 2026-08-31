/* Pruebas del idioma y de las fechas.
 *
 * Lo que se comprueba aquí no se ve leyendo el código: que el diccionario
 * inglés no tenga huecos, que las fechas cambien de forma —y no solo de
 * palabras— al cambiar de idioma, y que el día en que empieza la semana sea
 * de verdad independiente del idioma, que fue la decisión de Rafa.
 */
import { setIdiomaUI, t, num, IDIOMAS } from '../src/i18n'
import es from '../src/i18n/es.json'
import en from '../src/i18n/en.json'
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
  ['corriente', ['estoico', 'filosofico', 'psicologico']],
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

// Las que llevan sufijo: la descripción de la corriente, la ayuda del nivel y
// la pista de cada campo de la ficha.
const conSufijo: [string, string[], string][] = [
  ['corriente', ['estoico', 'filosofico', 'psicologico'], 'desc'],
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

console.log(fails === 0 ? '\n✔ Idioma y fechas correctos\n' : `\n✖ ${fails} fallo(s)\n`)
process.exit(fails === 0 ? 0 : 1)
