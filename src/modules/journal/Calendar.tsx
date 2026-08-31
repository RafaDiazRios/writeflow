import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  addMonths, endOfMonth, format, isSameDay, isSameMonth, isToday, monthGrid, monthLabel,
  startOfMonth, subMonths, toISODate, weekdayInitials,
} from '@/lib/dates'
import { journal } from '@/lib/repo'

interface Props {
  selected: string
  onSelect: (date: string) => void
  /** Se incrementa desde fuera para forzar el recuento tras guardar. */
  refreshKey?: number
}

/**
 * Calendario mensual al estilo Day One: cada día con entradas se marca con un
 * punto cuya intensidad depende de cuánto escribiste ese día.
 */
export default function Calendar({ selected, onSelect, refreshKey = 0 }: Props) {
  const [month, setMonth] = useState(() => startOfMonth(new Date(selected)))
  const [counts, setCounts] = useState<Record<string, { n: number; words: number }>>({})

  const days = useMemo(() => monthGrid(month), [month])

  useEffect(() => {
    ;(async () => {
      const from = toISODate(days[0])
      const to = toISODate(days[days.length - 1])
      const rows = await journal.daysInRange(from, to)
      setCounts(Object.fromEntries(rows.map((r) => [r.entry_date, { n: r.n, words: r.words ?? 0 }])))
    })()
  }, [days, refreshKey])

  // Si se selecciona un día de otro mes desde fuera, seguirlo.
  useEffect(() => {
    const d = new Date(selected)
    if (!isSameMonth(d, month)) setMonth(startOfMonth(d))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  return (
    <div className="select-none">
      <div className="mb-2 flex items-center justify-between">
        <button className="btn-ghost !px-1.5" onClick={() => setMonth(subMonths(month, 1))} title="Mes anterior">
          <ChevronLeft size={16} />
        </button>
        <button
          className="text-sm font-semibold hover:underline"
          onClick={() => {
            setMonth(startOfMonth(new Date()))
            onSelect(toISODate())
          }}
          title="Ir a hoy"
        >
          {monthLabel(month)}
        </button>
        <button className="btn-ghost !px-1.5" onClick={() => setMonth(addMonths(month, 1))} title="Mes siguiente">
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-semibold uppercase text-ink-400">
        {weekdayInitials().map((d: string, i: number) => (
          <div key={i}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d) => {
          const iso = toISODate(d)
          const info = counts[iso]
          const isSel = iso === selected
          const inMonth = isSameMonth(d, month)
          const intensity = !info ? 0 : info.words > 600 ? 3 : info.words > 200 ? 2 : 1
          return (
            <button
              key={iso}
              onClick={() => onSelect(iso)}
              title={info ? `${info.n} entrada(s), ${info.words} palabras` : 'Sin entradas'}
              className={[
                'relative flex h-9 flex-col items-center justify-center rounded-md text-[13px] transition',
                isSel
                  ? 'bg-accent-600 font-semibold text-white'
                  : inMonth
                    ? 'text-ink-700 hover:bg-ink-200/70 dark:text-ink-200 dark:hover:bg-ink-800'
                    : 'text-ink-300 hover:bg-ink-100 dark:text-ink-700 dark:hover:bg-ink-800/50',
                !isSel && isToday(d) ? 'ring-1 ring-inset ring-accent-400' : '',
              ].join(' ')}
            >
              {format(d, 'd')}
              {intensity > 0 && (
                <span
                  className={`absolute bottom-1 h-1 rounded-full ${
                    isSel ? 'bg-white/90' : 'bg-accent-500'
                  }`}
                  style={{ width: 3 + intensity * 3 }}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export { endOfMonth, isSameDay }
