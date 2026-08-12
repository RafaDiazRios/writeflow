import { useEffect, useState } from 'react'
import { Check, Flame, Pencil, Target } from 'lucide-react'
import { getGoal, setGoal, streaks, todayWords, type StreakInfo } from '@/lib/stats'

interface Props {
  refreshKey?: number
  onGoalChange?: (goal: number) => void
}

/**
 * Objetivo del día.
 *
 * Un número grande (lo que llevas hoy) y una barra. Deliberadamente no hay gráfico:
 * el dato que importa es uno solo, y un número enorme se lee más rápido que
 * cualquier gráfico que pudiera dibujar aquí.
 */
export default function GoalCard({ refreshKey = 0, onGoalChange }: Props) {
  const [goal, setGoalState] = useState(500)
  const [words, setWords] = useState(0)
  const [info, setInfo] = useState<StreakInfo>({
    current: 0, longest: 0, daysMetYear: 0, daysWrittenYear: 0,
  })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('500')

  useEffect(() => {
    ;(async () => {
      const g = await getGoal()
      setGoalState(g)
      setDraft(String(g))
      setWords(await todayWords())
      setInfo(await streaks(g))
    })()
  }, [refreshKey])

  const pct = goal > 0 ? Math.min(100, (words / goal) * 100) : 0
  const done = goal > 0 && words >= goal
  const left = Math.max(0, goal - words)

  async function save() {
    const n = Math.max(0, Math.round(Number(draft) || 0))
    await setGoal(n)
    setGoalState(n)
    setEditing(false)
    setInfo(await streaks(n))
    onGoalChange?.(n)
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Target size={14} className="text-accent-600 dark:text-accent-400" />
        <span className="panel-title">Objetivo de hoy</span>
        {!editing && (
          <button
            className="ml-auto rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
            title="Cambiar el objetivo diario"
            onClick={() => setEditing(true)}
          >
            <Pencil size={13} />
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            step={50}
            className="input !py-1.5 w-28"
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') setEditing(false)
            }}
          />
          <span className="text-xs text-ink-500">palabras al día</span>
          <button className="btn-primary ml-auto !py-1" onClick={save}>
            Guardar
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-semibold tabular-nums leading-none">
              {words.toLocaleString('es-ES')}
            </span>
            <span className="pb-0.5 text-sm text-ink-400">/ {goal.toLocaleString('es-ES')}</span>
            {done && (
              <span className="ml-auto flex items-center gap-1 pb-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <Check size={14} /> cumplido
              </span>
            )}
          </div>

          <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
            <div
              className={`h-full transition-all duration-500 ${done ? 'bg-emerald-500' : 'bg-accent-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          <p className="mt-2 text-xs text-ink-500 dark:text-ink-400">
            {goal === 0
              ? 'Sin objetivo fijado.'
              : done
                ? 'Lo de hoy ya está. Lo que escribas ahora es de propina.'
                : `Te faltan ${left.toLocaleString('es-ES')} palabras.`}
          </p>

          <div className="mt-3 flex items-center gap-4 border-t border-ink-100 pt-3 text-xs dark:border-ink-800">
            <span className="flex items-center gap-1.5">
              <Flame size={13} className="text-amber-500" />
              <strong className="tabular-nums">{info.current}</strong>
              <span className="text-ink-500">de racha</span>
            </span>
            <span className="text-ink-500">
              récord <strong className="tabular-nums text-ink-700 dark:text-ink-200">{info.longest}</strong>
            </span>
            <span className="ml-auto text-ink-500">
              <strong className="tabular-nums text-ink-700 dark:text-ink-200">{info.daysMetYear}</strong> días
              cumplidos este año
            </span>
          </div>
        </>
      )}
    </div>
  )
}
