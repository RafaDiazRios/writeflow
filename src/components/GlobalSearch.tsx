import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, CalendarDays, CornerDownLeft, Search, ScrollText, UserRound, Wind, X } from 'lucide-react'
import {
  hitRoute, kindLabel, projectKinds, search, type SearchHit, type SearchKind,
} from '@/lib/search'
import { shortDate } from '@/lib/dates'
import { useT } from '@/i18n/useT'

const ICON: Record<SearchKind, typeof Search> = {
  journal: CalendarDays,
  doc: BookOpen,
  therapy: Wind,
  character: UserRound,
  project: ScrollText,
}

const ORDER: SearchKind[] = ['journal', 'doc', 'character', 'project', 'therapy']

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * Buscador global. Se abre con Ctrl+K desde cualquier parte de la aplicación.
 *
 * Los resultados llegan ordenados por relevancia (BM25, con el título pesando ocho
 * veces más que el cuerpo) y se navegan con las flechas sin tocar el ratón, que es
 * como se usa de verdad un buscador mientras se escribe.
 */
export default function GlobalSearch({ open, onClose }: Props) {
  const t = useT()
  const nav = useNavigate()
  const [term, setTerm] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [sel, setSel] = useState(0)
  const [busy, setBusy] = useState(false)
  const [filter, setFilter] = useState<SearchKind | 'all'>('all')
  const [kinds, setKinds] = useState<Record<string, string>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!open) return
    projectKinds().then(setKinds)
    setTimeout(() => inputRef.current?.focus(), 20)
  }, [open])

  useEffect(() => {
    if (!open) {
      setTerm('')
      setHits([])
      setSel(0)
    }
  }, [open])

  // Búsqueda con retardo: escribir no dispara una consulta por tecla.
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    if (term.trim().length < 2) {
      setHits([])
      return
    }
    setBusy(true)
    timer.current = window.setTimeout(async () => {
      try {
        setHits(await search(term))
        setSel(0)
      } finally {
        setBusy(false)
      }
    }, 160)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [term])

  const shown = useMemo(
    () => (filter === 'all' ? hits : hits.filter((h) => h.kind === filter)),
    [hits, filter],
  )

  const go = useCallback(
    (hit: SearchHit) => {
      nav(hitRoute(hit, kinds))
      onClose()
    },
    [nav, kinds, onClose],
  )

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') return onClose()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(shown.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter' && shown[sel]) {
      e.preventDefault()
      go(shown[sel])
    }
  }

  useEffect(() => {
    listRef.current?.querySelector('[data-sel="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [sel, shown.length])

  if (!open) return null

  const counts = ORDER.map((k) => [k, hits.filter((h) => h.kind === k).length] as const).filter(
    ([, n]) => n > 0,
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink-950/40 p-6 pt-[12vh] backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card flex max-h-[70vh] w-[720px] max-w-full flex-col overflow-hidden p-0 shadow-2xl">
        <div className="flex items-center gap-2 border-b border-ink-200 px-4 dark:border-ink-800">
          <Search size={17} className="shrink-0 text-ink-400" />
          <input
            ref={inputRef}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('buscador.placeholder')}
            className="w-full bg-transparent py-3.5 text-[15px] outline-none placeholder:text-ink-400"
          />
          <button
            className="shrink-0 rounded p-1 text-ink-400 hover:text-ink-700"
            onClick={onClose}
            title={t('ensayo.cerrar')}
          >
            <X size={16} />
          </button>
        </div>

        {counts.length > 0 && (
          <div className="flex flex-wrap gap-1 border-b border-ink-100 px-3 py-1.5 dark:border-ink-800">
            <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
              {t('buscador.todo')} {hits.length}
            </Chip>
            {counts.map(([k, n]) => (
              <Chip key={k} active={filter === k} onClick={() => setFilter(k)}>
                {kindLabel(k)} {n}
              </Chip>
            ))}
          </div>
        )}

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
          {term.trim().length < 2 ? (
            <Hint>{t('buscador.pista')}</Hint>
          ) : busy && shown.length === 0 ? (
            <Hint>{t('buscador.buscando')}</Hint>
          ) : shown.length === 0 ? (
            <Hint>{t('buscador.nada', { termino: term })}</Hint>
          ) : (
            shown.map((h, i) => {
              const Icon = ICON[h.kind]
              return (
                <button
                  key={`${h.kind}:${h.refId}`}
                  data-sel={i === sel}
                  onMouseEnter={() => setSel(i)}
                  onClick={() => go(h)}
                  className={`flex w-full items-start gap-3 border-b border-ink-100 px-4 py-2.5 text-left transition last:border-0 dark:border-ink-800/60 ${
                    i === sel ? 'bg-accent-50 dark:bg-accent-950/40' : ''
                  }`}
                >
                  <Icon size={15} className="mt-1 shrink-0 text-accent-600 dark:text-accent-400" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-medium">{h.title}</span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-400">
                        {kindLabel(h.kind)}
                        {h.parent ? ` · ${h.parent}` : ''}
                      </span>
                      {h.date && (
                        <span className="ml-auto shrink-0 text-[11px] text-ink-400">
                          {shortDate(h.date)}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-ink-500 dark:text-ink-400">
                      <Highlighted text={h.snippet} />
                    </span>
                  </span>
                  {i === sel && (
                    <CornerDownLeft size={13} className="mt-1 shrink-0 text-ink-300" />
                  )}
                </button>
              )
            })
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-ink-200 px-4 py-1.5 text-[10px] text-ink-400 dark:border-ink-800">
          <span>{t('buscador.moverse')}</span>
          <span>{t('buscador.abrir')}</span>
          <span>{t('buscador.cerrar')}</span>
          <span className="ml-auto">Ctrl + K</span>
        </div>
      </div>
    </div>
  )
}

/** El snippet de FTS5 marca las coincidencias con « », que aquí se resaltan. */
function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(«[^»]*»)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('«') && p.endsWith('»') ? (
          <mark key={i} className="rounded bg-yellow-200 px-0.5 text-ink-900 dark:bg-yellow-500/40 dark:text-ink-100">
            {p.slice(1, -1)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

function Chip({
  children, active, onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-0.5 text-[11px] transition ${
        active
          ? 'bg-accent-600 text-white'
          : 'bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300'
      }`}
    >
      {children}
    </button>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-xs leading-relaxed text-ink-400">{children}</p>
}
