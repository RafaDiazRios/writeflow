import { useEffect, useMemo, useState } from 'react'
import { activityRange, type DayActivity } from '@/lib/stats'
import {
  dayAndMonth, getInicioSemana, monthShort, startOfWeek, toISODate, weekdayInitials,
} from '@/lib/dates'
import { num } from '@/i18n'
import { useT } from '@/i18n/useT'
import { useApp } from '@/store/app'

interface Props {
  /** Objetivo diario: marca los días cumplidos con un anillo. */
  goal: number
  /** Cuántas semanas mostrar hacia atrás. 53 = un año. */
  weeks?: number
  refreshKey?: number
}

/**
 * Mapa de actividad anual.
 *
 * Codificación **secuencial**: una sola familia de color, de claro a oscuro según
 * las palabras del día. Nada de arcoíris — el color aquí significa magnitud, y una
 * escala de un solo tono es la única que se lee sin leyenda.
 *
 * El objetivo cumplido va como segunda codificación (un anillo), no como otro color:
 * así sigue distinguiéndose en escala de grises y para quien no percibe bien el color.
 */
export default function ActivityHeatmap({ goal, weeks = 53, refreshKey = 0 }: Props) {
  const t = useT()
  // Suscribirse a la preferencia: al cambiarla, la rejilla se redibuja.
  const inicioSemana = useApp((s) => s.weekStart)
  const [data, setData] = useState<Record<string, DayActivity>>({})
  const [hover, setHover] = useState<{ day: string; words: number; x: number; y: number } | null>(null)

  // Semanas completas que terminan hoy. El primer día de la columna es el que
  // diga la preferencia, no siempre el lunes: en inglés estadounidense la
  // semana empieza en domingo y la rejilla tiene que cuadrar con el calendario.
  const grid = useMemo(() => {
    const primeroDeEstaSemana = startOfWeek(new Date(), { weekStartsOn: getInicioSemana() })
    const cols: Date[][] = []
    for (let w = weeks - 1; w >= 0; w--) {
      const inicio = new Date(primeroDeEstaSemana)
      inicio.setDate(primeroDeEstaSemana.getDate() - w * 7)
      const col: Date[] = []
      for (let d = 0; d < 7; d++) {
        const day = new Date(inicio)
        day.setDate(inicio.getDate() + d)
        col.push(day)
      }
      cols.push(col)
    }
    return cols
  }, [weeks, inicioSemana])

  const from = toISODate(grid[0][0])
  const to = toISODate(grid[grid.length - 1][6])

  useEffect(() => {
    activityRange(from, to).then((rows) =>
      setData(Object.fromEntries(rows.map((r) => [r.day, r]))),
    )
  }, [from, to, refreshKey])

  // Escala secuencial de un solo tono. El umbral más alto se ancla al objetivo,
  // así el mapa significa lo mismo para quien escribe 200 palabras al día que
  // para quien escribe 2000.
  const steps = [0.01, 0.34, 0.67, 1] as const
  const fills = [
    'bg-accent-200 dark:bg-accent-900',
    'bg-accent-400 dark:bg-accent-700',
    'bg-accent-600 dark:bg-accent-500',
    'bg-accent-800 dark:bg-accent-300',
  ]

  function levelOf(words: number): number {
    if (words <= 0) return -1
    const ratio = words / Math.max(1, goal)
    for (let i = 0; i < steps.length; i++) if (ratio <= steps[i]) return i
    return steps.length - 1
  }

  const todayISO = toISODate()
  const total = Object.values(data).reduce((a, r) => a + r.words, 0)
  const activeDays = Object.values(data).filter((r) => r.words > 0).length

  // Etiquetas de mes: solo en la primera columna de cada mes.
  const monthLabels = grid.map((col, i) => {
    const first = col[0]
    if (i === 0) return monthShort(first)
    const prev = grid[i - 1][0]
    return first.getMonth() !== prev.getMonth() ? monthShort(first) : ''
  })

  return (
    <figure className="relative m-0">
      <figcaption className="mb-2 flex items-baseline gap-2">
        <span className="panel-title">{t('mapa.titulo')}</span>
        <span className="text-[11px] text-ink-500 dark:text-ink-400">
          {t('mapa.resumen', { palabras: num(total), dias: activeDays })}
        </span>
      </figcaption>

      <div className="overflow-x-auto pb-1">
        <div className="inline-block min-w-full">
          {/* meses */}
          <div className="mb-1 flex gap-[3px] pl-[22px]">
            {monthLabels.map((m, i) => (
              <div key={i} className="w-[11px] text-[9px] capitalize text-ink-400">
                {m}
              </div>
            ))}
          </div>

          <div className="flex gap-[3px]">
            {/* días de la semana */}
            <div className="mr-1 flex w-[18px] flex-col gap-[3px] text-[9px] text-ink-400">
              {/* Una de cada dos: las siete no caben en 11 píxeles de alto. */}
              {weekdayInitials().map((inicial, i) => (
                <div key={i} className="h-[11px] leading-[11px]">
                  {i % 2 === 0 ? inicial : ''}
                </div>
              ))}
            </div>

            {grid.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-[3px]">
                {col.map((day) => {
                  const iso = toISODate(day)
                  const words = data[iso]?.words ?? 0
                  const lvl = levelOf(words)
                  const future = iso > todayISO
                  const metGoal = goal > 0 && words >= goal
                  return (
                    <div
                      key={iso}
                      onMouseEnter={(e) => {
                        const r = (e.target as HTMLElement).getBoundingClientRect()
                        setHover({ day: iso, words, x: r.left + r.width / 2, y: r.top })
                      }}
                      onMouseLeave={() => setHover(null)}
                      className={[
                        'h-[11px] w-[11px] rounded-[2px] transition',
                        future
                          ? 'bg-transparent'
                          : lvl < 0
                            ? 'bg-ink-200/70 dark:bg-ink-800'
                            : fills[lvl],
                        metGoal ? 'ring-1 ring-inset ring-accent-900/40 dark:ring-white/50' : '',
                        iso === todayISO ? 'outline outline-1 outline-offset-1 outline-ink-400' : '',
                      ].join(' ')}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* leyenda */}
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-ink-400">
        <span>{t('mapa.menos')}</span>
        <div className="h-[10px] w-[10px] rounded-[2px] bg-ink-200/70 dark:bg-ink-800" />
        {fills.map((f, i) => (
          <div key={i} className={`h-[10px] w-[10px] rounded-[2px] ${f}`} />
        ))}
        <span>{t('mapa.mas')}</span>
        <span className="ml-3 flex items-center gap-1">
          <span className="h-[10px] w-[10px] rounded-[2px] bg-accent-400 ring-1 ring-inset ring-accent-900/40 dark:bg-accent-700 dark:ring-white/50" />
          {t('mapa.objetivoCumplido')}
        </span>
      </div>

      {hover && (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md bg-ink-900 px-2 py-1 text-[11px] text-white shadow-lg dark:bg-ink-100 dark:text-ink-900"
          style={{ left: hover.x, top: hover.y - 6 }}
        >
          {hover.words > 0
            ? `${num(hover.words)} ${t('unidad.palabras')}`
            : t('mapa.sinEscribir')}
          {' · '}
          {dayAndMonth(hover.day)}
        </div>
      )}
    </figure>
  )
}
