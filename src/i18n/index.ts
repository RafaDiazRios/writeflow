/* Idioma de la interfaz.
 *
 * Dos ajustes independientes y globales, decididos así a propósito:
 *
 *   - `uiLang`      el idioma de los menús, botones y avisos
 *   - `contentLang` el idioma de los prompts, ejercicios y plantillas
 *
 * Separarlos permite tener la aplicación en inglés con los prompts en español,
 * que es lo que suele querer alguien bilingüe. Ninguno de los dos se cifra ni
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

/**
 * Traduce una clave. Si falta en el idioma activo cae al español, y si tampoco
 * está devuelve la propia clave: una cadena sin traducir se ve en pantalla como
 * `ajustes.idioma`, que canta, en vez de quedarse en blanco y pasar inadvertida.
 */
export function t(clave: string, params?: Record<string, string | number>): string {
  let s = TABLAS[actual]?.[clave] ?? TABLAS.es[clave] ?? clave
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

/** Miles con el separador del idioma activo. Sustituye a `toLocaleString('es-ES')`. */
export function num(n: number): string {
  return n.toLocaleString(LOCALE_INTL[actual])
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
