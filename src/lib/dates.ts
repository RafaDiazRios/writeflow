import {
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
import { es } from 'date-fns/locale'

export const LOCALE = es

/** Fecha local en formato YYYY-MM-DD (sin desfase de zona horaria). */
export function toISODate(d: Date = new Date()): string {
  return format(d, 'yyyy-MM-dd')
}

export function fromISODate(s: string): Date {
  return parseISO(s)
}

export function longDate(s: string | Date): string {
  const d = typeof s === 'string' ? parseISO(s) : s
  return format(d, "EEEE d 'de' MMMM 'de' yyyy", { locale: es })
}

export function shortDate(s: string | Date): string {
  const d = typeof s === 'string' ? parseISO(s) : s
  return format(d, "d MMM yyyy", { locale: es })
}

export function monthLabel(d: Date): string {
  return format(d, 'MMMM yyyy', { locale: es })
}

/** Rejilla de 6 semanas que contiene el mes dado, empezando en lunes. */
export function monthGrid(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  return eachDayOfInterval({ start, end })
}

export const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/** «ago», «sept»… para las etiquetas del mapa de actividad. */
export function monthShort(d: Date): string {
  return format(d, 'LLL', { locale: es }).replace('.', '')
}

/** «12 de agosto» */
export function dayAndMonth(d: Date | string): string {
  const date = typeof d === 'string' ? parseISO(d) : d
  return format(date, "d 'de' LLLL", { locale: es })
}

export { addMonths, subMonths, isSameDay, isSameMonth, isToday, format, startOfMonth, endOfMonth }
