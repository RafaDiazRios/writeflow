import { useState } from 'react'
import { X } from 'lucide-react'
import { TEMPLATES, traditionLabel } from '@/lib/prompts'
import type { EssayTemplate } from '@/lib/types'
import { useT } from '@/i18n/useT'

interface Props {
  onPick: (template: EssayTemplate, title: string) => void
  onClose: () => void
}

/**
 * Selector de plantilla de ensayo. Las estructuras vienen documentadas de
 * fuentes reales (Toulmin, Rogers, Gibbs, IMRyD…) y se guardan dentro de la app,
 * así que también funcionan viajando sin conexión.
 */
export default function TemplatePicker({ onPick, onClose }: Props) {
  const t = useT()
  const [sel, setSel] = useState<EssayTemplate>(TEMPLATES[0])
  const [title, setTitle] = useState('')
  const [filter, setFilter] = useState<string>('all')

  const list = TEMPLATES.filter((p) => filter === 'all' || p.tradition === filter)

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink-950/40 p-6 backdrop-blur-sm">
      <div className="card flex h-[620px] w-[900px] max-w-full flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-ink-200 px-5 py-3 dark:border-ink-800">
          <h2 className="text-base font-semibold">{t('ensayo.elegirEstructura')}</h2>
          <div className="ml-4 flex gap-1">
            {['all', 'academic', 'literary', 'journalistic'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-2.5 py-0.5 text-xs transition ${
                  filter === f
                    ? 'bg-accent-600 text-white'
                    : 'bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300'
                }`}
              >
                {f === 'all' ? t('ensayo.todas') : traditionLabel(f)}
              </button>
            ))}
          </div>
          <button className="btn-ghost ml-auto !px-1.5" onClick={onClose} title={t('ensayo.cerrar')}>
            <X size={17} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="w-72 shrink-0 overflow-y-auto border-r border-ink-200 p-2 dark:border-ink-800">
            {list.map((plantilla) => (
              <button
                key={plantilla.id}
                onClick={() => setSel(plantilla)}
                className={`mb-1 w-full rounded-md px-3 py-2 text-left transition ${
                  sel.id === plantilla.id
                    ? 'bg-accent-100 dark:bg-accent-900/50'
                    : 'hover:bg-ink-100 dark:hover:bg-ink-800'
                }`}
              >
                <div className="text-sm font-medium">{plantilla.name}</div>
                <div className="text-[11px] text-ink-500">
                  {t('ensayo.numSecciones', { n: plantilla.sections.length })} · {traditionLabel(plantilla.tradition)}
                </div>
              </button>
            ))}
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto p-5">
              <h3 className="text-lg font-semibold">{sel.name}</h3>
              <p className="mt-1 text-xs uppercase tracking-wide text-ink-400">{sel.name_en}</p>
              <p className="mt-3 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
                {sel.description}
              </p>

              <ol className="mt-5 space-y-2.5">
                {sel.sections.map((s, i) => (
                  <li key={i} className="rounded-md border border-ink-200 p-3 dark:border-ink-800">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-accent-600">{i + 1}</span>
                      <span className="text-sm font-medium">{s.title}</span>
                      <span className="ml-auto text-[11px] text-ink-400">
                        {t('ensayo.palabrasAprox', { n: s.suggested_words })}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-ink-500 dark:text-ink-400">{s.guide}</p>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex items-center gap-2 border-t border-ink-200 p-3 dark:border-ink-800">
              <input
                className="input"
                placeholder={t('ensayo.tituloEnsayo')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && title.trim()) onPick(sel, title.trim())
                }}
              />
              <button
                className="btn-primary shrink-0"
                disabled={!title.trim()}
                onClick={() => onPick(sel, title.trim())}
              >
                {t('ensayo.crear')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
