import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BookOpen, CalendarDays, History, PenLine, ScrollText, Wind } from 'lucide-react'
import GoalCard from '@/components/GoalCard'
import ActivityHeatmap from '@/components/ActivityHeatmap'
import { globalStats, journal } from '@/lib/repo'
import { getGoal } from '@/lib/stats'
import { promptForDay, STREAM_LABEL } from '@/lib/prompts'
import { longDate, shortDate, toISODate } from '@/lib/dates'
import { excerpt } from '@/lib/text'
import { useApp } from '@/store/app'
import type { JournalEntry } from '@/lib/types'

export default function Home() {
  const nav = useNavigate()
  const streams = useApp((s) => s.streams)
  const [stats, setStats] = useState({
    journalEntries: 0, journalWords: 0, docWords: 0, therapyEntries: 0,
    therapyWords: 0, novels: 0, essays: 0, totalWords: 0,
  })
  const [recent, setRecent] = useState<JournalEntry[]>([])
  const [goal, setGoal] = useState(500)
  const [memories, setMemories] = useState<JournalEntry[]>([])

  const today = toISODate()
  const prompt = promptForDay(today, streams)

  useEffect(() => {
    globalStats().then(setStats)
    journal.recent(5).then(setRecent)
    getGoal().then(setGoal)
    journal.onThisDay(toISODate(), 3).then(setMemories)
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 6 ? 'Aún de madrugada' : hour < 13 ? 'Buenos días' : hour < 21 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl p-4 sm:p-8">
        <p className="text-sm text-ink-400">{longDate(today)}</p>
        <h1 className="mb-5 text-2xl font-semibold tracking-tight sm:mb-6 sm:text-3xl">{greeting}, Rafa.</h1>

        <div className="card mb-5 border-l-4 border-l-accent-500 p-4 sm:mb-6 sm:p-5">
          <p className="panel-title mb-2">Para pensar hoy · {STREAM_LABEL[prompt.stream]}</p>
          <p className="font-serif text-[17px] leading-relaxed sm:text-lg">{prompt.text}</p>
          {prompt.source && <p className="mt-2 text-xs italic text-ink-500">{prompt.source}</p>}
          <button className="btn-primary mt-4" onClick={() => nav('/diario')}>
            <PenLine size={16} /> Escribir en el diario
          </button>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <GoalCard onGoalChange={setGoal} />
          <div className="card p-4">
            <ActivityHeatmap goal={goal} />
          </div>
        </div>

        {memories.length > 0 && (
          <section className="mb-6">
            <h2 className="mb-2 flex items-center gap-1.5 panel-title">
              <History size={13} /> En este día
            </h2>
            <div className="space-y-2">
              {memories.map((e) => {
                const years = Number(today.slice(0, 4)) - Number(e.entry_date.slice(0, 4))
                return (
                  <button
                    key={e.id}
                    onClick={() => nav(`/diario?entry=${e.id}`)}
                    className="card w-full border-l-4 border-l-amber-400 p-3 text-left transition hover:shadow-md"
                  >
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium">{e.title || 'Sin título'}</span>
                      <span className="text-[11px] text-amber-700 dark:text-amber-500">
                        {years === 1 ? 'hace un año' : `hace ${years} años`}
                      </span>
                      <span className="ml-auto text-xs text-ink-400">{shortDate(e.entry_date)}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-ink-500 dark:text-ink-400">
                      {excerpt(e.content_text, 160)}
                    </p>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
          <Metric value={stats.totalWords.toLocaleString('es-ES')} label="palabras escritas" />
          <Metric value={stats.journalEntries} label="entradas de diario" />
          <Metric value={stats.therapyEntries} label="sesiones de terapia" />
        </div>

        <div className="mb-6 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <Shortcut to="/diario" icon={<CalendarDays size={18} />} title="Diario" sub="Calendario y prompts" onGo={nav} />
          <Shortcut to="/novela" icon={<BookOpen size={18} />} title="Novela" sub={`${stats.novels} proyecto(s)`} onGo={nav} />
          <Shortcut to="/ensayos" icon={<ScrollText size={18} />} title="Ensayos" sub={`${stats.essays} en marcha`} onGo={nav} />
          <Shortcut to="/terapia" icon={<Wind size={18} />} title="Terapia narrativa" sub="Ejercicios por nivel" onGo={nav} />
        </div>

        {recent.length > 0 && (
          <section>
            <h2 className="panel-title mb-2">Últimas entradas</h2>
            <div className="space-y-2">
              {recent.map((e) => (
                <button
                  key={e.id}
                  onClick={() => nav('/diario')}
                  className="card w-full p-3 text-left transition hover:shadow-md"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-medium">{e.title || 'Sin título'}</span>
                    <span className="ml-auto text-xs text-ink-400">{shortDate(e.entry_date)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                    {excerpt(e.content_text, 130) || 'Vacía'}
                  </p>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function Metric({ value, label, icon }: { value: string | number; label: string; icon?: React.ReactNode }) {
  return (
    <div className="card p-3">
      <div className="flex items-center gap-1.5 text-xl font-semibold tabular-nums">
        {icon}
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-ink-400">{label}</div>
    </div>
  )
}

function Shortcut({
  to, icon, title, sub, onGo,
}: {
  to: string
  icon: React.ReactNode
  title: string
  sub: string
  onGo: (to: string) => void
}) {
  return (
    <button onClick={() => onGo(to)} className="card p-4 text-left transition hover:shadow-md">
      <div className="mb-2 text-accent-600 dark:text-accent-400">{icon}</div>
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-ink-500 dark:text-ink-400">{sub}</div>
    </button>
  )
}
