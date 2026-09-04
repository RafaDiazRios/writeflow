import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { JSONContent } from '@tiptap/react'
import {
  FileDown, Flame, Heart, Plus, Search, Star, Trash2, X,
} from 'lucide-react'
import Calendar from './Calendar'
import PromptCard from './PromptCard'
import OnThisDay from './OnThisDay'
import Editor from '@/components/Editor'
import Divisor, { useAnchoPanel } from '@/components/Divisor'
import { journal, tags as tagRepo } from '@/lib/repo'
import { countWords, EMPTY_DOC, excerpt, parseDoc, textToDoc } from '@/lib/text'
import { endOfMonth, longDate, monthLabel, shortDate, startOfMonth, toISODate } from '@/lib/dates'
import { SALIDA_COMPARTIDA, exportJournalDocx } from '@/lib/export'
import { useRefrescoTrasSync } from '@/lib/refresco'
import { markPromptUsed } from '@/lib/prompts'
import { useApp } from '@/store/app'
import { PROMPT_PX } from '@/lib/types'
import type { DailyPrompt, JournalEntry } from '@/lib/types'
import { num } from '@/i18n'
import { useT } from '@/i18n/useT'

// La etiqueta no se guarda aquí: se traduce al pintar, con la clave `animo.N`.
const MOODS = [
  { v: 1, emoji: '😔' },
  { v: 2, emoji: '🙁' },
  { v: 3, emoji: '😐' },
  { v: 4, emoji: '🙂' },
  { v: 5, emoji: '😄' },
]

export default function JournalModule() {
  const t = useT()
  const app = useApp()
  const [date, setDate] = useState(() => toISODate())
  /* La columna del calendario y la sugerencia del día. 320 px de fábrica —lo que
   * tenía clavado— y hasta 560, que es donde el prompt deja de partirse en
   * líneas de tres palabras. */
  const diario = useAnchoPanel('ancho_diario', 320, 260, 560)
  const escalaPrompt = useApp((s) => s.promptScale)
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [stats, setStats] = useState({ entries: 0, words: 0, days: 0, streak: 0 })
  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults] = useState<JournalEntry[] | null>(null)
  const [entryTags, setEntryTags] = useState<string>('')
  const [params, setParams] = useSearchParams()
  // Se incrementa cuando la sincronización baja filas: obliga a releer.
  const trasSync = useRefrescoTrasSync()

  const active = useMemo(() => entries.find((e) => e.id === activeId) ?? null, [entries, activeId])

  const loadDay = useCallback(
    async (d: string, selectId?: string) => {
      const rows = await journal.byDate(d)
      setEntries(rows)
      setActiveId(selectId ?? rows[0]?.id ?? null)
    },
    [],
  )

  useEffect(() => {
    loadDay(date)
  }, [date, loadDay, trasSync])

  // Llegada desde el buscador global: /diario?entry=…&date=…
  useEffect(() => {
    const entry = params.get('entry')
    const day = params.get('date')
    if (!entry && !day) return
    if (entry) {
      journal.byId(entry).then((e) => {
        if (!e) return
        setDate(e.entry_date)
        loadDay(e.entry_date, e.id)
      })
    } else if (day) {
      setDate(day)
    }
    setParams({}, { replace: true })
  }, [params, setParams, loadDay])

  useEffect(() => {
    journal.stats().then(setStats)
  }, [refreshKey, trasSync])

  useEffect(() => {
    if (!activeId) {
      setEntryTags('')
      return
    }
    tagRepo.forEntry(activeId).then((ts) => setEntryTags(ts.map((t) => t.name).join(', ')))
  }, [activeId])

  async function newEntry(prompt?: DailyPrompt) {
    const id = await journal.create({
      entry_date: date,
      entry_time: new Date().toTimeString().slice(0, 5),
      title: '',
      prompt_id: prompt?.id ?? null,
      prompt_text: prompt?.text ?? null,
      content_json: JSON.stringify(EMPTY_DOC),
      content_text: '',
    })
    if (prompt) await markPromptUsed(prompt.id)
    await loadDay(date, id)
    setRefreshKey((k) => k + 1)
  }

  const saveContent = useCallback(
    async (doc: JSONContent, text: string) => {
      if (!activeId) return
      await journal.update(activeId, {
        content_json: JSON.stringify(doc),
        content_text: text,
        word_count: countWords(text),
      })
      setEntries((prev) =>
        prev.map((e) =>
          e.id === activeId
            ? { ...e, content_json: JSON.stringify(doc), content_text: text, word_count: countWords(text) }
            : e,
        ),
      )
      setRefreshKey((k) => k + 1)
    },
    [activeId],
  )

  async function patchActive(patch: Partial<JournalEntry>) {
    if (!activeId) return
    await journal.update(activeId, patch)
    setEntries((prev) => prev.map((e) => (e.id === activeId ? { ...e, ...patch } : e)))
  }

  async function removeActive() {
    if (!activeId) return
    if (!window.confirm(t('diario.confirmarPapelera'))) return
    await journal.remove(activeId)
    await loadDay(date)
    setRefreshKey((k) => k + 1)
    app.notify('info', t('diario.entradaEliminada'))
  }

  async function runSearch(term: string) {
    setSearchTerm(term)
    if (term.trim().length < 2) {
      setResults(null)
      return
    }
    setResults(await journal.search(term.trim()))
  }

  return (
    <div className="flex h-full min-h-0">
      {/* ── Panel izquierdo ── */}
      <div
        style={{ width: diario.ancho }}
        className="flex shrink-0 flex-col gap-3 overflow-y-auto p-3"
      >
        <div className="relative">
          <Search size={15} className="absolute left-2.5 top-2.5 text-ink-400" />
          <input
            className="input !pl-8"
            placeholder={t('diario.buscar')}
            value={searchTerm}
            onChange={(e) => runSearch(e.target.value)}
          />
          {searchTerm && (
            <button
              className="absolute right-2 top-2.5 text-ink-400 hover:text-ink-700"
              title={t('diario.limpiarBusqueda')}
              onClick={() => runSearch('')}
            >
              <X size={15} />
            </button>
          )}
        </div>

        {results ? (
          <div className="space-y-2">
            <p className="panel-title">
              {results.length === 1 ? t('diario.resultado') : t('diario.resultados', { n: results.length })}
            </p>
            {results.map((r) => (
              <button
                key={r.id}
                className="w-full rounded-md border border-ink-200 p-2.5 text-left transition hover:border-accent-400 dark:border-ink-800"
                onClick={() => {
                  setDate(r.entry_date)
                  setActiveId(r.id)
                  runSearch('')
                }}
              >
                <div className="text-xs font-medium text-accent-700 dark:text-accent-400">
                  {shortDate(r.entry_date)}
                </div>
                <div className="text-sm font-medium">{r.title || t('comun.sinTitulo')}</div>
                <div className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                  {excerpt(r.content_text, 90)}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <>
            <Calendar selected={date} onSelect={setDate} refreshKey={refreshKey} />

            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat icon={<Flame size={13} />} value={stats.streak} label={t('diario.racha')} />
              <Stat value={stats.entries} label={t('diario.entradas')} />
              <Stat value={num(stats.words)} label={t('unidad.palabras')} />
            </div>

            <button
              className="btn-outline w-full justify-center !py-1.5 text-xs"
              title={t('diario.exportarAyuda')}
              onClick={async () => {
                const d = new Date(date)
                try {
                  const path = await exportJournalDocx(
                    toISODate(startOfMonth(d)),
                    toISODate(endOfMonth(d)),
                  )
                  if (path === SALIDA_COMPARTIDA) app.notify('ok', t('comun.enviadoCompartir'))
                  else if (path) app.notify('ok', t('comun.guardadoEn', { ruta: path }))
                } catch (e) {
                  app.notify('error', e instanceof Error ? e.message : String(e))
                }
              }}
            >
              <FileDown size={14} /> {t('diario.exportarMes', { mes: monthLabel(new Date(date)) })}
            </button>

            <OnThisDay
              date={date}
              refreshKey={refreshKey}
              onOpen={(e) => {
                setDate(e.entry_date)
                loadDay(e.entry_date, e.id)
              }}
            />

            <PromptCard date={date} onWriteAbout={(p) => newEntry(p)} />

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="panel-title">{t('diario.entradasDelDia')}</span>
                <button
                  className="btn-ghost !px-1.5 !py-1"
                  onClick={() => newEntry()}
                  title={t('diario.nuevaEntrada')}
                >
                  <Plus size={15} />
                </button>
              </div>
              <div className="space-y-1">
                {entries.length === 0 && (
                  <p className="rounded-md border border-dashed border-ink-300 p-3 text-center text-xs text-ink-400 dark:border-ink-700">
                    {t('diario.nadaEscritoTodavia')}
                  </p>
                )}
                {entries.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => setActiveId(e.id)}
                    className={`w-full rounded-md px-2.5 py-2 text-left transition ${
                      e.id === activeId
                        ? 'bg-accent-50 ring-1 ring-accent-300 dark:bg-accent-950/40 dark:ring-accent-800'
                        : 'hover:bg-ink-100 dark:hover:bg-ink-800'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      {e.is_favorite === 1 && <Star size={12} className="text-amber-500" fill="currentColor" />}
                      <span className="truncate text-sm font-medium">{e.title || t('comun.sinTitulo')}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-ink-400">{e.entry_time ?? ''}</span>
                    </div>
                    <div className="truncate text-xs text-ink-500 dark:text-ink-400">
                      {excerpt(e.content_text, 60) || t('comun.vacia')}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* La barra hace de borde derecho de la columna, que por eso ya no lleva
          `border-r`. */}
      <Divisor
        ancho={diario.ancho}
        onAncho={diario.setAncho}
        onSoltar={diario.guardar}
        min={diario.min}
        max={diario.max}
        porDefecto={diario.porDefecto}
      />

      {/* ── Panel derecho: escritura ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!active ? (
          <div className="grid flex-1 place-items-center p-8 text-center">
            <div>
              <p className="mb-1 text-lg font-medium">{longDate(date)}</p>
              <p className="mb-5 text-sm text-ink-500 dark:text-ink-400">
                {t('diario.nadaEscritoAun')}
              </p>
              <button className="btn-primary" onClick={() => newEntry()}>
                <Plus size={16} /> {t('diario.escribirEntrada')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-ink-200 px-6 py-3 dark:border-ink-800">
              <div className="mb-2 flex items-center gap-3">
                <span className="text-xs font-medium text-accent-700 dark:text-accent-400">
                  {longDate(active.entry_date)}
                </span>
                <span className="text-xs text-ink-400">
                  {num(active.word_count)} {t('unidad.palabras')}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <button
                    className="btn-ghost !px-1.5"
                    title={active.is_favorite ? t('diario.quitarFavorita') : t('diario.marcarFavorita')}
                    onClick={() => patchActive({ is_favorite: active.is_favorite ? 0 : 1 })}
                  >
                    <Star
                      size={16}
                      className={active.is_favorite ? 'text-amber-500' : ''}
                      fill={active.is_favorite ? 'currentColor' : 'none'}
                    />
                  </button>
                  <button className="btn-danger !px-1.5" onClick={removeActive} title={t('comun.eliminar')}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <input
                className="w-full bg-transparent font-serif text-2xl font-semibold outline-none placeholder:text-ink-300 dark:placeholder:text-ink-700"
                placeholder={t('diario.tituloEntrada')}
                value={active.title}
                onChange={(e) => patchActive({ title: e.target.value })}
              />

              <div className="mt-2.5 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  <Heart size={13} className="mr-0.5 text-ink-400" />
                  {MOODS.map((m) => (
                    <button
                      key={m.v}
                      title={t(`animo.${m.v}`)}
                      onClick={() => patchActive({ mood: active.mood === m.v ? null : m.v })}
                      className={`rounded px-1 text-base transition ${
                        active.mood === m.v ? 'scale-110 bg-accent-100 dark:bg-accent-900/60' : 'opacity-45 hover:opacity-90'
                      }`}
                    >
                      {m.emoji}
                    </button>
                  ))}
                </div>

                <input
                  className="w-40 rounded border border-ink-200 bg-transparent px-2 py-1 text-xs outline-none focus:border-accent-400 dark:border-ink-700"
                  placeholder={t('diario.lugar')}
                  value={active.place ?? ''}
                  onChange={(e) => patchActive({ place: e.target.value })}
                />

                <input
                  className="w-56 rounded border border-ink-200 bg-transparent px-2 py-1 text-xs outline-none focus:border-accent-400 dark:border-ink-700"
                  placeholder={t('diario.etiquetas')}
                  value={entryTags}
                  onChange={(e) => setEntryTags(e.target.value)}
                  onBlur={() => activeId && tagRepo.setForEntry(activeId, entryTags.split(','))}
                />
              </div>

              {/* El prompt que dio pie a la entrada, como epígrafe sobre el
                  editor. Mismo tamaño que en la tarjeta de la columna: es el
                  mismo texto en dos sitios y leerlo a dos tamaños distintos
                  confunde. Empezó en 12 px, que era menos de tres cuartos del
                  cuerpo del editor, y pasó a seguir el ajuste del usuario. */}
              {active.prompt_text && (
                <div
                  style={{ fontSize: `${Math.round(PROMPT_PX * escalaPrompt)}px` }}
                  className="mt-2.5 rounded-md border-l-2 border-accent-400 bg-accent-50/60 px-3 py-2.5 font-serif italic leading-relaxed text-ink-600 dark:bg-accent-950/30 dark:text-ink-300"
                >
                  {active.prompt_text}
                </div>
              )}
            </div>

            <Editor
              key={active.id}
              value={parseDoc(active.content_json) ?? textToDoc(active.content_text)}
              placeholder={t('diario.escribirPlaceholder')}
              onChange={saveContent}
              autofocus
            />
          </>
        )}
      </div>
    </div>
  )
}

function Stat({ value, label, icon }: { value: string | number; label: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-ink-200 py-1.5 dark:border-ink-800">
      <div className="flex items-center justify-center gap-1 text-sm font-semibold tabular-nums">
        {icon}
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-ink-400">{label}</div>
    </div>
  )
}
