import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { JSONContent } from '@tiptap/react'
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Plus, Share2, Star, Trash2 } from 'lucide-react'
import Editor from '@/components/Editor'
import Calendar from '@/modules/journal/Calendar'
import OnThisDay from '@/modules/journal/OnThisDay'
import PromptCard from '@/modules/journal/PromptCard'
import { journal } from '@/lib/repo'
import { countWords, EMPTY_DOC, excerpt, parseDoc, textToDoc } from '@/lib/text'
import { endOfMonth, longDate, monthLabel, startOfMonth, toISODate } from '@/lib/dates'
import { SALIDA_COMPARTIDA, exportJournalDocx } from '@/lib/export'
import { useRefrescoTrasSync } from '@/lib/refresco'
import { markPromptUsed } from '@/lib/prompts'
import { useApp } from '@/store/app'
import type { DailyPrompt, JournalEntry } from '@/lib/types'

const MOODS = [
  { v: 1, emoji: '😔' }, { v: 2, emoji: '🙁' }, { v: 3, emoji: '😐' },
  { v: 4, emoji: '🙂' }, { v: 5, emoji: '😄' },
]

/**
 * Diario para móvil.
 *
 * Dos pantallas en lugar de dos paneles: la del día, con calendario, recuerdos y
 * lista de entradas; y la de escritura, a pantalla completa. Se entra y se sale,
 * porque en vertical no caben las dos a la vez sin que ambas queden estrechas.
 */
export default function MobileJournal() {
  const app = useApp()
  const [date, setDate] = useState(() => toISODate())
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [showCalendar, setShowCalendar] = useState(false)
  const [compartiendo, setCompartiendo] = useState(false)
  const trasSync = useRefrescoTrasSync()
  const [params, setParams] = useSearchParams()

  const active = entries.find((e) => e.id === activeId) ?? null

  const loadDay = useCallback(async (d: string, selectId?: string) => {
    const rows = await journal.byDate(d)
    setEntries(rows)
    if (selectId !== undefined) setActiveId(selectId)
    return rows
  }, [])

  useEffect(() => {
    loadDay(date)
  }, [date, loadDay, trasSync])

  useEffect(() => {
    const entry = params.get('entry')
    if (!entry) return
    journal.byId(entry).then((e) => {
      if (!e) return
      setDate(e.entry_date)
      loadDay(e.entry_date, e.id)
    })
    setParams({}, { replace: true })
  }, [params, setParams, loadDay])

  async function newEntry(prompt?: DailyPrompt) {
    const id = await journal.create({
      entry_date: date,
      entry_time: new Date().toTimeString().slice(0, 5),
      title: '',
      prompt_id: prompt?.id ?? null,
      prompt_text: prompt?.text ?? null,
      content_json: JSON.stringify(EMPTY_DOC),
    })
    if (prompt) await markPromptUsed(prompt.id)
    await loadDay(date, id)
    setRefreshKey((k) => k + 1)
  }

  const saveContent = useCallback(
    async (doc: JSONContent, text: string) => {
      if (!activeId) return
      const patch = {
        content_json: JSON.stringify(doc),
        content_text: text,
        word_count: countWords(text),
      }
      await journal.update(activeId, patch)
      setEntries((prev) => prev.map((e) => (e.id === activeId ? { ...e, ...patch } : e)))
    },
    [activeId],
  )

  async function patchActive(patch: Partial<JournalEntry>) {
    if (!activeId) return
    await journal.update(activeId, patch)
    setEntries((prev) => prev.map((e) => (e.id === activeId ? { ...e, ...patch } : e)))
  }

  function shiftDay(days: number) {
    const d = new Date(date + 'T12:00:00')
    d.setDate(d.getDate() + days)
    setDate(toISODate(d))
    setActiveId(null)
  }

  // ── pantalla de escritura ──
  if (active) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-1 border-b border-ink-200 px-1 py-1 dark:border-ink-800">
          <button
            className="rounded-full p-2 text-ink-600 active:bg-ink-100 dark:active:bg-ink-800"
            onClick={() => setActiveId(null)}
            aria-label="Volver"
          >
            <ArrowLeft size={20} />
          </button>
          <span className="truncate text-xs text-ink-500">{longDate(active.entry_date)}</span>
          <button
            className="ml-auto rounded-full p-2 active:bg-ink-100 dark:active:bg-ink-800"
            onClick={() => patchActive({ is_favorite: active.is_favorite ? 0 : 1 })}
            aria-label="Favorita"
          >
            <Star
              size={19}
              className={active.is_favorite ? 'text-amber-500' : 'text-ink-400'}
              fill={active.is_favorite ? 'currentColor' : 'none'}
            />
          </button>
          <button
            className="rounded-full p-2 text-red-600 active:bg-red-50 dark:active:bg-red-950/40"
            aria-label="Eliminar"
            onClick={async () => {
              if (!window.confirm('¿Eliminar esta entrada?')) return
              await journal.remove(active.id)
              await loadDay(date, null as unknown as string)
              setActiveId(null)
              setRefreshKey((k) => k + 1)
            }}
          >
            <Trash2 size={19} />
          </button>
        </div>

        <input
          className="shrink-0 bg-transparent px-4 pt-3 font-serif text-xl font-semibold outline-none placeholder:text-ink-300"
          placeholder="Título"
          value={active.title}
          onChange={(e) => patchActive({ title: e.target.value })}
        />

        <div className="flex shrink-0 items-center gap-1 px-3 pt-2">
          {MOODS.map((m) => (
            <button
              key={m.v}
              onClick={() => patchActive({ mood: active.mood === m.v ? null : m.v })}
              className={`rounded px-1.5 py-0.5 text-lg transition ${
                active.mood === m.v ? 'scale-110 bg-accent-100 dark:bg-accent-900/60' : 'opacity-40'
              }`}
            >
              {m.emoji}
            </button>
          ))}
        </div>

        {active.prompt_text && (
          <p className="mx-4 mt-2 shrink-0 rounded-md border-l-2 border-accent-400 bg-accent-50/60 px-3 py-2 text-xs italic leading-relaxed text-ink-600 dark:bg-accent-950/30 dark:text-ink-300">
            {active.prompt_text}
          </p>
        )}

        <Editor
          key={active.id}
          value={parseDoc(active.content_json) ?? textToDoc(active.content_text)}
          placeholder="¿Qué ha pasado hoy?"
          onChange={saveContent}
          page={false}
          autofocus
        />
      </div>
    )
  }

  // ── pantalla del día ──
  return (
    <div className="h-full overflow-y-auto">
      <div className="flex items-center gap-1 border-b border-ink-200 px-2 py-2 dark:border-ink-800">
        <button className="rounded-full p-2 active:bg-ink-100 dark:active:bg-ink-800" onClick={() => shiftDay(-1)} aria-label="Día anterior">
          <ChevronLeft size={20} />
        </button>
        <button
          className="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium active:bg-ink-100 dark:active:bg-ink-800"
          onClick={() => setShowCalendar((v) => !v)}
        >
          <CalendarDays size={15} className="text-ink-400" />
          {longDate(date)}
        </button>
        <button className="rounded-full p-2 active:bg-ink-100 dark:active:bg-ink-800" onClick={() => shiftDay(1)} aria-label="Día siguiente">
          <ChevronRight size={20} />
        </button>
      </div>

      {showCalendar && (
        <div className="border-b border-ink-200 p-3 dark:border-ink-800">
          <Calendar
            selected={date}
            refreshKey={refreshKey}
            onSelect={(d) => {
              setDate(d)
              setShowCalendar(false)
            }}
          />
        </div>
      )}

      <div className="space-y-3 p-3">
        <OnThisDay
          date={date}
          refreshKey={refreshKey}
          onOpen={async (e) => {
            setDate(e.entry_date)
            await loadDay(e.entry_date, e.id)
          }}
        />

        <div className="space-y-1.5">
          {entries.length === 0 && (
            <p className="rounded-md border border-dashed border-ink-300 p-5 text-center text-xs text-ink-400 dark:border-ink-700">
              Nada escrito este día.
            </p>
          )}
          {entries.map((e) => (
            <button
              key={e.id}
              onClick={() => setActiveId(e.id)}
              className="w-full rounded-lg border border-ink-200 p-3 text-left active:bg-ink-100 dark:border-ink-800 dark:active:bg-ink-800"
            >
              <div className="flex items-baseline gap-1.5">
                {e.is_favorite === 1 && <Star size={12} className="text-amber-500" fill="currentColor" />}
                <span className="truncate text-sm font-medium">{e.title || 'Sin título'}</span>
                <span className="ml-auto shrink-0 text-[11px] text-ink-400">{e.entry_time ?? ''}</span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs text-ink-500 dark:text-ink-400">
                {excerpt(e.content_text, 100) || 'Vacía'}
              </p>
            </button>
          ))}
        </div>

        <PromptCard date={date} onWriteAbout={(p) => newEntry(p)} />

        {/*
          La salida del diario en el móvil: el mes entero en un .docx que se
          entrega al menú de compartir. Es el equivalente del botón «Exportar
          <mes>» del escritorio, y el mismo código.
        */}
        <button
          className="btn-outline w-full justify-center !py-2 text-xs"
          disabled={compartiendo}
          onClick={async () => {
            setCompartiendo(true)
            try {
              const d = new Date(date)
              const r = await exportJournalDocx(
                toISODate(startOfMonth(d)),
                toISODate(endOfMonth(d)),
              )
              if (r === SALIDA_COMPARTIDA) app.notify('ok', 'Enviado al menú de compartir')
              else if (r) app.notify('ok', `Guardado en ${r}`)
            } catch (e) {
              app.notify('error', e instanceof Error ? e.message : String(e))
            } finally {
              setCompartiendo(false)
            }
          }}
        >
          <Share2 size={14} />
          {compartiendo ? 'Generando…' : `Compartir ${monthLabel(new Date(date))}`}
        </button>
      </div>

      <button
        onClick={() => newEntry()}
        className="fixed bottom-20 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-accent-600 text-white shadow-lg active:bg-accent-700"
        aria-label="Nueva entrada"
      >
        <Plus size={26} />
      </button>
    </div>
  )
}
