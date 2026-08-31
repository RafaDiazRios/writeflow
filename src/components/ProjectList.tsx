import { useEffect, useState } from 'react'
import { BookOpen, Plus, ScrollText, Trash2 } from 'lucide-react'
import { projects } from '@/lib/repo'
import { shortDate } from '@/lib/dates'
import type { Project, ProjectKind } from '@/lib/types'
import { num } from '@/i18n'

interface Props {
  kind: ProjectKind
  onOpen: (id: string) => void
  onCreate: () => void
  title: string
  emptyHint: string
  refreshKey?: number
}

/** Rejilla de proyectos, compartida por Novela y Ensayos. */
export default function ProjectList({ kind, onOpen, onCreate, title, emptyHint, refreshKey = 0 }: Props) {
  const [items, setItems] = useState<Project[]>([])
  const [words, setWords] = useState<Record<string, number>>({})

  useEffect(() => {
    ;(async () => {
      const rows = await projects.list(kind)
      setItems(rows)
      const w: Record<string, number> = {}
      for (const p of rows) w[p.id] = await projects.wordCount(p.id)
      setWords(w)
    })()
  }, [kind, refreshKey])

  const Icon = kind === 'novel' ? BookOpen : ScrollText

  return (
    <div className="mx-auto w-full max-w-5xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <button className="btn-primary" onClick={onCreate}>
          <Plus size={16} /> Nuevo
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-300 p-10 text-center dark:border-ink-700">
          <Icon size={32} className="mx-auto mb-3 text-ink-300" />
          <p className="text-sm text-ink-500 dark:text-ink-400">{emptyHint}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => {
            const w = words[p.id] ?? 0
            const pct = p.target_words ? Math.min(100, Math.round((w / p.target_words) * 100)) : 0
            return (
              <div key={p.id} className="card group relative overflow-hidden p-4 transition hover:shadow-md">
                <div className="absolute inset-x-0 top-0 h-1" style={{ background: p.color }} />
                <button className="w-full text-left" onClick={() => onOpen(p.id)}>
                  <h3 className="truncate pr-6 text-base font-semibold">{p.title}</h3>
                  {p.subtitle && <p className="truncate text-xs text-ink-500">{p.subtitle}</p>}
                  <p className="mt-2 line-clamp-2 h-8 text-xs text-ink-500 dark:text-ink-400">
                    {p.logline || p.synopsis || 'Sin sinopsis todavía.'}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-ink-400">
                    <span>{num(w)} palabras</span>
                    <span>{shortDate(p.updated_at.slice(0, 10))}</span>
                  </div>
                  {p.target_words > 0 && (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
                      <div className="h-full bg-accent-500" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </button>
                <button
                  className="absolute right-2 top-3 rounded p-1 text-ink-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-950/40"
                  title="Eliminar proyecto"
                  onClick={async () => {
                    if (window.confirm(`¿Eliminar «${p.title}»?`)) {
                      await projects.remove(p.id)
                      setItems((s) => s.filter((x) => x.id !== p.id))
                    }
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
