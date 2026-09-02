import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { JSONContent } from '@tiptap/react'
import { ArrowLeft, Dices, History, Shield, Trash2 } from 'lucide-react'
import Editor from '@/components/Editor'
import { therapy } from '@/lib/repo'
import {
  ejercicios, exerciseById, exercisesByLevel, levelHelp, levelLabel, schools, suggestExercise,
} from '@/lib/prompts'
import { countWords, EMPTY_DOC, excerpt, parseDoc } from '@/lib/text'
import { shortDate, toISODate } from '@/lib/dates'
import { useApp } from '@/store/app'
import type { FollowupAnswer, TherapyEntry, TherapyExercise } from '@/lib/types'
import { useT } from '@/i18n/useT'

type View = 'browse' | 'write' | 'history'

export default function TherapyModule() {
  const t = useT()
  const app = useApp()
  const [view, setView] = useState<View>('browse')
  const [level, setLevel] = useState(1)
  const [school, setSchool] = useState<string>('all')
  const [entry, setEntry] = useState<TherapyEntry | null>(null)
  const [history, setHistory] = useState<TherapyEntry[]>([])
  const [usage, setUsage] = useState<Record<string, number>>({})
  const [followups, setFollowups] = useState<FollowupAnswer[]>([])

  /* La lista de escuelas sale del catálogo, así que cambia con el idioma del
   * contenido. Con `[]` se quedaba congelada en el idioma en que se montó el
   * módulo: el desplegable enseñaba «Terapia Narrativa» mientras los ejercicios
   * ya decían «Narrative Therapy», y filtrar no devolvía nada. Y el filtro
   * elegido se reinicia, porque su valor es una cadena del idioma anterior.
   * Lo guardado en `therapy_entries` no se toca: las sesiones viejas siguen
   * mostrando el nombre de escuela con el que se escribieron. */
  const allSchools = useMemo(() => schools(), [app.contentLang])
  useEffect(() => {
    setSchool('all')
  }, [app.contentLang])

  const reload = useCallback(async () => {
    setHistory(await therapy.recent())
    setUsage(await therapy.usage())
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  // Llegada desde el buscador global: /terapia?entry=…
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    const id = params.get('entry')
    if (!id) return
    therapy.byId(id).then((e) => {
      if (!e) return
      setEntry(e)
      try {
        setFollowups(JSON.parse(e.followups) as FollowupAnswer[])
      } catch {
        setFollowups([])
      }
      setView('write')
    })
    setParams({}, { replace: true })
  }, [params, setParams])

  const list = exercisesByLevel(level).filter((e) => school === 'all' || e.school === school)

  async function start(ex: TherapyExercise) {
    const id = await therapy.create({
      session_date: toISODate(),
      exercise_id: ex.id,
      exercise_name: ex.name,
      school: ex.school,
      level: ex.level,
      prompt_text: ex.prompt,
      content_json: JSON.stringify(EMPTY_DOC),
      followups: JSON.stringify(ex.followups.map((q) => ({ q, a: '' }))),
    })
    const e = await therapy.byId(id)
    setEntry(e)
    setFollowups(ex.followups.map((q) => ({ q, a: '' })))
    setView('write')
  }

  async function openEntry(e: TherapyEntry) {
    setEntry(e)
    try {
      setFollowups(JSON.parse(e.followups) as FollowupAnswer[])
    } catch {
      setFollowups([])
    }
    setView('write')
  }

  const saveContent = useCallback(
    async (doc: JSONContent, text: string) => {
      if (!entry) return
      await therapy.update(entry.id, {
        content_json: JSON.stringify(doc),
        content_text: text,
        word_count: countWords(text),
      })
    },
    [entry],
  )

  async function saveFollowups(next: FollowupAnswer[]) {
    setFollowups(next)
    if (entry) await therapy.update(entry.id, { followups: JSON.stringify(next) })
  }

  // ── escribir ──
  if (view === 'write' && entry) {
    const ex = exerciseById(entry.exercise_id)
    return (
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex items-center gap-3 border-b border-ink-200 px-3 py-2 dark:border-ink-800">
          <button
            className="btn-ghost !px-1.5"
            onClick={async () => {
              await reload()
              setView('browse')
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{entry.exercise_name}</div>
            <div className="text-[11px] text-ink-500">
              {entry.school} · {levelLabel(entry.level)} · {shortDate(entry.session_date)}
            </div>
          </div>
          <button
            className="btn-danger ml-auto !px-1.5"
            title={t('terapia.eliminarSesion')}
            onClick={async () => {
              if (!window.confirm(t('terapia.confirmarEliminar'))) return
              await therapy.remove(entry.id)
              await reload()
              setView('browse')
            }}
          >
            <Trash2 size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6 sm:py-5">
            <div className="card mb-5 border-l-4 border-l-emerald-500 p-4">
              <p className="panel-title mb-1.5">{t('terapia.consigna')}</p>
              <p className="font-serif text-[15px] leading-relaxed">{entry.prompt_text}</p>
              {ex?.source && (
                <p className="mt-2 text-[11px] italic text-ink-500">
                  {t('terapia.fuente', { fuente: ex.source })}
                </p>
              )}
            </div>

            <div className="card overflow-hidden">
              <Editor
                key={entry.id}
                value={parseDoc(entry.content_json) ?? EMPTY_DOC}
                placeholder={t('terapia.escribirPlaceholder')}
                onChange={saveContent}
                page={false}
                autofocus
              />
            </div>

            {followups.length > 0 && (
              <div className="mt-6">
                <p className="panel-title mb-2">{t('terapia.seguimiento')}</p>
                <div className="space-y-3">
                  {followups.map((f, i) => (
                    <div key={i} className="card p-3">
                      <p className="mb-1.5 text-sm font-medium">{f.q}</p>
                      <textarea
                        className="input min-h-[70px] resize-y font-serif text-[14px] leading-relaxed"
                        value={f.a}
                        placeholder={t('terapia.seguimientoPlaceholder')}
                        onChange={(e) => {
                          const next = [...followups]
                          next[i] = { ...f, a: e.target.value }
                          saveFollowups(next)
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── historial ──
  if (view === 'history') {
    return (
      <div className="mx-auto w-full max-w-3xl p-4 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <button className="btn-ghost !px-1.5" onClick={() => setView('browse')}>
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-xl font-semibold">{t('terapia.tusSesiones')}</h1>
        </div>
        {history.length === 0 ? (
          <p className="rounded-lg border border-dashed border-ink-300 p-10 text-center text-sm text-ink-400 dark:border-ink-700">
            {t('terapia.sinSesiones')}
          </p>
        ) : (
          <div className="space-y-2">
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => openEntry(h)}
                className="card w-full p-3 text-left transition hover:shadow-md"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium">{h.exercise_name}</span>
                  <span className="chip !py-0 text-[10px]">{h.school}</span>
                  <span className="ml-auto text-xs text-ink-400">{shortDate(h.session_date)}</span>
                </div>
                <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                  {excerpt(h.content_text, 140) || t('terapia.sinEscribir')}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── catálogo ──
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
        <div className="mb-1 flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t('terapia.titulo')}</h1>
          <button className="btn-ghost ml-auto" onClick={() => setView('history')}>
            <History size={15} /> {t('terapia.historial', { n: history.length })}
          </button>
          <button
            className="btn-outline"
            onClick={() => start(suggestExercise(level, usage))}
            title={t('terapia.sorprendemeAyuda')}
          >
            <Dices size={15} /> {t('terapia.sorprendeme')}
          </button>
        </div>
        <p className="mb-5 max-w-2xl text-sm leading-relaxed text-ink-500 dark:text-ink-400">
          {t('terapia.intro', { n: ejercicios().length })}
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {[1, 2, 3].map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                level === l
                  ? 'bg-accent-600 text-white'
                  : 'bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300'
              }`}
            >
              {levelLabel(l)}
            </button>
          ))}
          <select
            className="ml-auto rounded-md border border-ink-200 bg-transparent px-2 py-1.5 text-xs dark:border-ink-700"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
          >
            <option value="all">{t('terapia.todasEscuelas')}</option>
            {allSchools.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <p className="mb-4 flex items-start gap-2 rounded-md bg-ink-100 p-3 text-xs leading-relaxed text-ink-600 dark:bg-ink-800/60 dark:text-ink-300">
          <Shield size={14} className="mt-0.5 shrink-0" />
          <span>
            {levelHelp(level)}
            {level === 3 && (
              <>
                {' '}
                {t('terapia.avisoNivel3')}
              </>
            )}
          </span>
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {list.map((ex) => (
            <button
              key={ex.id}
              onClick={() => start(ex)}
              className="card p-4 text-left transition hover:shadow-md"
            >
              <div className="mb-1 flex items-start gap-2">
                <h3 className="text-sm font-semibold">{ex.name}</h3>
                {usage[ex.id] ? (
                  <span className="chip ml-auto shrink-0 !py-0 text-[10px]">×{usage[ex.id]}</span>
                ) : null}
              </div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-accent-600 dark:text-accent-400">
                {ex.school}
              </p>
              <p className="line-clamp-4 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
                {ex.prompt}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
