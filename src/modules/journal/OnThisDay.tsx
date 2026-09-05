import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, History } from 'lucide-react'
import { journal } from '@/lib/repo'
import { getMeta, setMeta } from '@/lib/db'
import { excerpt } from '@/lib/text'
import { dayAndMonth } from '@/lib/dates'
import { useT } from '@/i18n/useT'
import { t as traducir } from '@/i18n'
import type { JournalEntry } from '@/lib/types'

interface Props {
  /** Día seleccionado en el calendario, YYYY-MM-DD. */
  date: string
  onOpen: (entry: JournalEntry) => void
  refreshKey?: number
}

const MOOD_EMOJI: Record<number, string> = { 1: '😔', 2: '🙁', 3: '😐', 4: '🙂', 5: '😄' }

/** Clave en `meta` donde se recuerda si el panel se dejó plegado. */
const ABIERTO = 'en_este_dia_abierto'

function yearsAgoLabel(entryDate: string, today: string): string {
  const diff = Number(today.slice(0, 4)) - Number(entryDate.slice(0, 4))
  if (diff === 1) return traducir('enEsteDia.haceUnAno')
  return traducir('enEsteDia.haceAnos', { n: diff })
}

/**
 * «En este día»: lo que escribiste el mismo día y mes de años anteriores.
 *
 * Es la función que convierte un diario en algo que se relee. Aparece solo
 * cuando hay algo que enseñar: un panel vacío que dice «no hay recuerdos» no
 * aporta nada y ocupa la mitad de la columna.
 */
export default function OnThisDay({ date, onOpen, refreshKey = 0 }: Props) {
  const t = useT()
  const [items, setItems] = useState<JournalEntry[]>([])
  const [open, setOpen] = useState(true)

  useEffect(() => {
    journal.onThisDay(date).then(setItems)
  }, [date, refreshKey])

  /* Si lo pliegas, se queda plegado. Volvía a abrirse en cada arranque y en cada
   * cambio de día, que es justo lo contrario de lo que pide un panel plegable.
   * Va en `meta`, como los anchos: es una preferencia del equipo y no viaja a la
   * nube. Solo un '0' guardado lo cierra, así que quien no lo haya tocado nunca
   * lo sigue encontrando abierto. */
  useEffect(() => {
    let vivo = true
    getMeta(ABIERTO).then((v) => {
      if (vivo && v === '0') setOpen(false)
    })
    return () => {
      vivo = false
    }
  }, [])

  const alternar = () => {
    const siguiente = !open
    setOpen(siguiente)
    void setMeta(ABIERTO, siguiente ? '1' : '0')
  }

  if (!items.length) return null

  const years = new Set(items.map((e) => e.entry_date.slice(0, 4))).size

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20">
      <button
        className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
        onClick={alternar}
      >
        <History size={14} className="shrink-0 text-amber-700 dark:text-amber-500" />
        <span className="panel-title !text-amber-800 dark:!text-amber-400">{t('enEsteDia.titulo')}</span>
        <span className="text-[11px] text-amber-700/70 dark:text-amber-500/70">
          {years === 1 ? t('enEsteDia.unAno') : t('enEsteDia.anos', { n: years })}
        </span>
        {open ? (
          <ChevronDown size={14} className="ml-auto shrink-0 text-amber-700/60" />
        ) : (
          <ChevronRight size={14} className="ml-auto shrink-0 text-amber-700/60" />
        )}
      </button>

      {open && (
        <div className="space-y-1 px-1.5 pb-1.5">
          {items.map((e) => (
            <button
              key={e.id}
              onClick={() => onOpen(e)}
              className="w-full rounded px-2 py-1.5 text-left transition hover:bg-amber-100/70 dark:hover:bg-amber-900/30"
              title={t('enEsteDia.abrir', {
                fecha: dayAndMonth(e.entry_date),
                ano: e.entry_date.slice(0, 4),
              })}
            >
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-400">
                  {e.entry_date.slice(0, 4)}
                </span>
                <span className="text-[10px] text-amber-700/70 dark:text-amber-500/60">
                  {yearsAgoLabel(e.entry_date, date)}
                </span>
                {/* Solo aparece cuando la entrada no es de este día y mes, que hoy
                    significa una cosa: un 29 de febrero rescatado en el 28. Sin la
                    fecha a la vista, el recuerdo parecería estar en el día que no es. */}
                {e.entry_date.slice(5) !== date.slice(5) && (
                  <span className="rounded bg-amber-200/70 px-1 text-[10px] text-amber-900 dark:bg-amber-900/40 dark:text-amber-300">
                    {dayAndMonth(e.entry_date)}
                  </span>
                )}
                {e.mood ? <span className="ml-auto text-xs">{MOOD_EMOJI[e.mood]}</span> : null}
              </div>
              <div className="truncate text-[13px] font-medium">{e.title || t('comun.sinTitulo')}</div>
              <div className="line-clamp-2 text-[11px] leading-snug text-ink-500 dark:text-ink-400">
                {excerpt(e.content_text, 110)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
