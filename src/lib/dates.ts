import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { enGB, es } from 'date-fns/locale'
import { idiomaUI, type Idioma } from '@/i18n'

/** Domingo o lunes. Es preferencia del usuario, no del idioma: en el Reino
 *  Unido la semana también empieza en lunes, así que atarlo al idioma sería
 *  molesto justo para quien usa las dos. */
export type InicioSemana = 0 | 1

let inicioSemana: InicioSemana = 1

export function setInicioSemana(v: InicioSemana) {
  inicioSemana = v
}

export function getInicioSemana(): InicioSemana {
  return inicioSemana
}

const loc = () => (idiomaUI() === 'en' ? enGB : es)

/** Fecha local en formato YYYY-MM-DD (sin desfase de zona horaria). */
export function toISODate(d: Date = new Date()): string {
  return format(d, 'yyyy-MM-dd')
}

export function fromISODate(s: string): Date {
  return parseISO(s)
}

/** Solo la inicial: en español los días y los meses van en minúscula. */
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/* Los formatos largos no se pueden traducir palabra a palabra: el español
 * intercala «de» dos veces («miércoles 12 de agosto de 2026») y el inglés no
 * («Wednesday, 12 August 2026»). Por eso hay una plantilla por idioma. */
const FORMATO: Record<Idioma, { largo: string; diaYMes: string }> = {
  es: { largo: "EEEE d 'de' MMMM 'de' yyyy", diaYMes: "d 'de' LLLL" },
  en: { largo: 'EEEE, d MMMM yyyy', diaYMes: 'd LLLL' },
}

export function longDate(s: string | Date): string {
  const d = typeof s === 'string' ? parseISO(s) : s
  // `capitalize` de CSS pondría mayúscula en cada palabra («Miércoles 12 De
  // Agosto De 2026»), que en español está mal. Se hace aquí, una sola vez.
  return upperFirst(format(d, FORMATO[idiomaUI()].largo, { locale: loc() }))
}

export function shortDate(s: string | Date): string {
  const d = typeof s === 'string' ? parseISO(s) : s
  return format(d, 'd MMM yyyy', { locale: loc() })
}

export function monthLabel(d: Date): string {
  return upperFirst(format(d, 'MMMM yyyy', { locale: loc() }))
}

/** Rejilla de 6 semanas que contiene el mes dado. */
export function monthGrid(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: inicioSemana })
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: inicioSemana })
  return eachDayOfInterval({ start, end })
}

/* En español, martes y miércoles empiezan los dos por «m», y la convención de
 * toda la vida es usar la X para el miércoles. `date-fns` no lo hace: su
 * inicial estrecha da «M» para los dos y el calendario queda con dos emes
 * seguidas. Por eso el español lleva tabla propia, indexada por día de la
 * semana (0 = domingo). El inglés no tiene ese problema. */
const INICIAL_ES = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

/**
 * Iniciales de los días, en el idioma activo y empezando por donde toque.
 * Antes era una lista fija `['L','M','X','J','V','S','D']`; se genera porque
 * ni las letras ni el orden valen para los dos idiomas.
 *
 * El 4 de enero de 2026 fue domingo, así que sirve de ancla conocida para
 * pedirle a `startOfWeek` el primer día de la semana con la preferencia activa.
 */
export function weekdayInitials(): string[] {
  const domingo = new Date(2026, 0, 4)
  const primero = startOfWeek(domingo, { weekStartsOn: inicioSemana })
  return Array.from({ length: 7 }, (_, i) => {
    const dia = addDays(primero, i)
    if (idiomaUI() === 'es') return INICIAL_ES[dia.getDay()]
    return upperFirst(format(dia, 'EEEEE', { locale: loc() }))
  })
}

/** «ago», «sept»… para las etiquetas del mapa de actividad. */
export function monthShort(d: Date): string {
  return format(d, 'LLL', { locale: loc() }).replace('.', '')
}

/** «12 de agosto» / «12 August» */
export function dayAndMonth(d: Date | string): string {
  const date = typeof d === 'string' ? parseISO(d) : d
  return format(date, FORMATO[idiomaUI()].diaYMes, { locale: loc() })
}

export { upperFirst }

export {
  addDays,
  addMonths,
  subMonths,
  isSameDay,
  isSameMonth,
  isToday,
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
}
