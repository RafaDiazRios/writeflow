/* Idioma de la interfaz.
 *
 * Tres ajustes independientes y globales, decididos así a propósito:
 *
 *   - `uiLang`      el idioma de los menús, botones y avisos
 *   - `contentLang` el idioma de los prompts, ejercicios y plantillas
 *   - `writeLang`   el idioma en el que **escribes**
 *
 * Separarlos permite tener la aplicación en inglés con los prompts en español,
 * que es lo que suele querer alguien bilingüe. Ninguno de los tres se cifra ni
 * se sincroniza: son preferencias del equipo, no contenido.
 *
 * Las entradas del diario guardan `prompt_text` además de `prompt_id`, así que
 * cambiar de idioma NO reescribe tu diario hacia atrás: cada entrada conserva
 * el prompt tal y como lo leíste el día que escribiste.
 */
import es from './es.json'
import en from './en.json'

export type Idioma = 'es' | 'en'

export const IDIOMAS: Idioma[] = ['es', 'en']

export const NOMBRE_IDIOMA: Record<Idioma, string> = {
  es: 'Español',
  en: 'English',
}

type Tabla = Record<string, string>

const TABLAS: Record<Idioma, Tabla> = { es: es as Tabla, en: en as Tabla }

/** Idioma activo de la interfaz. Lo fija el store al arrancar. */
let actual: Idioma = 'es'

export function setIdiomaUI(l: Idioma) {
  actual = l
  document.documentElement.lang = l
}

export function idiomaUI(): Idioma {
  return actual
}

/* El idioma del **contenido** —prompts, ejercicios, plantillas— es un ajuste
 * aparte del de la interfaz, y va aquí por la misma razón: lo consultan
 * funciones que no son componentes de React. Lo fija el store al arrancar. */
let contenido: Idioma = 'es'

export function setIdiomaContenido(l: Idioma) {
  contenido = l
}

export function idiomaContenido(): Idioma {
  return contenido
}

/* El idioma en el que **escribes**, que no es ninguno de los otros dos.
 *
 * Decide tres cosas, y las tres son propiedades del texto, no de la aplicación
 * que lo enseña: el `lang` del editor —que es de donde saca el corrector del
 * sistema qué diccionario usar—, el idioma que declara el `.docx` para que Word
 * no subraye en rojo un manuscrito impecable, y el `dc:language` del `.epub`.
 *
 * Hasta la 0.3.0 los tres seguían al idioma de la interfaz, que era la mejor
 * pista disponible pero no es lo mismo: se puede tener la app en inglés y
 * escribir la novela en español.
 *
 * Aquí se guarda ya resuelto —siempre 'es' o 'en'—; quien decide si eso viene
 * de la preferencia del usuario o heredado de la interfaz es el store. */
let escritura: Idioma = 'es'

export function setIdiomaEscritura(l: Idioma) {
  escritura = l
}

export function idiomaEscritura(): Idioma {
  return escritura
}

/**
 * Lo que el usuario elige en Ajustes. `'auto'` no es un idioma: es «el que
 * tenga la interfaz», y existe para que quien nunca toque este ajuste conserve
 * exactamente el comportamiento de siempre, incluso si más adelante cambia el
 * idioma de la aplicación.
 */
export type PrefEscritura = Idioma | 'auto'

export const PREFS_ESCRITURA: PrefEscritura[] = ['auto', 'es', 'en']

export function resolverEscritura(pref: PrefEscritura, ui: Idioma): Idioma {
  return pref === 'auto' ? ui : pref
}

/**
 * Traduce una clave. Si falta en el idioma activo cae al español, y si tampoco
 * está devuelve la propia clave: una cadena sin traducir se ve en pantalla como
 * `ajustes.idioma`, que canta, en vez de quedarse en blanco y pasar inadvertida.
 */
export function t(clave: string, params?: Record<string, string | number>): string {
  return tIdioma(actual, clave, params)
}

/**
 * Lo mismo, pero en un idioma concreto en vez de en el activo.
 *
 * Hace falta porque no todo el texto que produce la aplicación es de la
 * aplicación: la portada del manuscrito («por Fulano», «unas 80.000 palabras»)
 * es parte del documento, así que va en el idioma en el que se escribe, no en
 * el de los menús.
 */
export function tIdioma(
  l: Idioma,
  clave: string,
  params?: Record<string, string | number>,
): string {
  let s = TABLAS[l]?.[clave] ?? TABLAS.es[clave] ?? clave
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.split(`{${k}}`).join(String(v))
    }
  }
  return s
}

/** Códigos BCP-47 para `Intl`. Se usa en-GB, no en-US: Rafa escribe desde Europa. */
export const LOCALE_INTL: Record<Idioma, string> = {
  es: 'es-ES',
  en: 'en-GB',
}

/**
 * Miles con el separador del idioma activo. Sustituye a `toLocaleString('es-ES')`.
 *
 * El segundo argumento es para los números que van dentro de un documento —el
 * recuento de palabras de la portada—, que siguen al idioma en el que se
 * escribe: 81.200 en español, 81,200 en inglés.
 */
export function num(n: number, l: Idioma = actual): string {
  return n.toLocaleString(LOCALE_INTL[l])
}

/** Fecha y hora completas, para «última sincronización» y similares. */
export function fechaHora(d: Date | string): string {
  const fecha = typeof d === 'string' ? new Date(d) : d
  return fecha.toLocaleString(LOCALE_INTL[actual])
}

/** El idioma del sistema, para acertar la primera vez que se abre la app. */
export function idiomaDelSistema(): Idioma {
  const l = (navigator.languages?.[0] ?? navigator.language ?? 'es').toLowerCase()
  return l.startsWith('en') ? 'en' : 'es'
}

/**
 * Traduce un error que viene del backend en Rust.
 *
 * Rust no sabe en qué idioma está la interfaz, y darle un diccionario propio
 * significaría mantener dos que se desincronizan. En vez de eso devuelve
 * **códigos** —`error.algo`, con el detalle técnico detrás de una barra— y aquí
 * se convierten en texto con las mismas claves que usa el resto de la app.
 *
 * Si la clave no está en el diccionario se deja pasar el mensaje tal cual: es
 * preferible un texto en el idioma equivocado a un «error.loQueSea» en pantalla.
 */
export function traducirErrorNativo(e: unknown): string {
  const texto = e instanceof Error ? e.message : String(e)
  const barra = texto.indexOf('|')
  const clave = barra === -1 ? texto : texto.slice(0, barra)
  if (!clave.startsWith('error.')) return texto
  const traducido = t(clave)
  if (traducido === clave) return texto
  const detalle = barra === -1 ? '' : texto.slice(barra + 1).trim()
  return detalle ? `${traducido} (${detalle})` : traducido
}
