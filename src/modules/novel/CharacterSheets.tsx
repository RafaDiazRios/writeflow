import { useEffect, useState } from 'react'
import { Plus, Trash2, UserRound } from 'lucide-react'
import { characters as repo } from '@/lib/repo'
import type { Character } from '@/lib/types'
import { useT } from '@/i18n/useT'

/* Solo las claves y la forma del campo. El rótulo y la pista se traducen al
 * pintar, con `ficha.<clave>` y `ficha.<clave>.pista`. */
const FIELDS: { key: keyof Character; long?: boolean }[] = [
  { key: 'role' },
  { key: 'age' },
  { key: 'occupation' },
  { key: 'appearance', long: true },
  { key: 'personality', long: true },
  { key: 'goal', long: true },
  { key: 'motivation', long: true },
  { key: 'conflict', long: true },
  { key: 'arc', long: true },
  { key: 'backstory', long: true },
  { key: 'voice', long: true },
  { key: 'secrets', long: true },
  { key: 'relationships', long: true },
  { key: 'notes', long: true },
]

/** Fichas de personaje: el equivalente a las Character Sheets de Scrivener. */
export default function CharacterSheets({ projectId }: { projectId: string }) {
  const t = useT()
  const [items, setItems] = useState<Character[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  const active = items.find((c) => c.id === activeId) ?? null

  async function load(selectId?: string) {
    const rows = await repo.forProject(projectId)
    setItems(rows)
    setActiveId(selectId ?? rows[0]?.id ?? null)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function create() {
    const id = await repo.create({ project_id: projectId, name: t('ficha.personajeNuevo'), color: '#6892ca' })
    await load(id)
  }

  async function patch(p: Partial<Character>) {
    if (!activeId) return
    await repo.update(activeId, p as Record<string, unknown>)
    setItems((s) => s.map((c) => (c.id === activeId ? { ...c, ...p } : c)))
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-56 shrink-0 flex-col border-r border-ink-200 dark:border-ink-800">
        <div className="flex items-center border-b border-ink-200 px-2 py-1.5 dark:border-ink-800">
          <span className="panel-title mr-auto">{t('ficha.titulo')}</span>
          <button className="btn-ghost !px-1.5 !py-1" onClick={create} title={t('ficha.nuevo')}>
            <Plus size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          {items.length === 0 && (
            <p className="p-3 text-center text-xs text-ink-400">{t('ficha.sinFichas')}</p>
          )}
          {items.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveId(c.id)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] transition ${
                c.id === activeId
                  ? 'bg-accent-100 font-medium dark:bg-accent-900/50'
                  : 'hover:bg-ink-100 dark:hover:bg-ink-800'
              }`}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
              <span className="truncate">{c.name || t('comun.sinNombre')}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!active ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <UserRound size={30} className="mx-auto mb-2 text-ink-300" />
              <p className="mb-4 text-sm text-ink-500">
                {t('ficha.vacio')}
              </p>
              <button className="btn-primary" onClick={create}>
                <Plus size={16} /> {t('ficha.crearPrimera')}
              </button>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl p-6">
            <div className="mb-5 flex items-center gap-3">
              <input
                type="color"
                className="h-8 w-8 cursor-pointer rounded border border-ink-200 bg-transparent dark:border-ink-700"
                value={active.color}
                onChange={(e) => patch({ color: e.target.value })}
                title={t('ficha.color')}
              />
              <input
                className="flex-1 bg-transparent font-serif text-2xl font-semibold outline-none"
                value={active.name}
                placeholder={t('ficha.nombre')}
                onChange={(e) => patch({ name: e.target.value })}
              />
              <button
                className="btn-danger !px-2"
                title={t('ficha.eliminar')}
                onClick={async () => {
                  if (window.confirm(t('ficha.confirmarEliminar', { nombre: active.name }))) {
                    await repo.remove(active.id)
                    await load()
                  }
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>

            <input
              className="input mb-5"
              placeholder={t('ficha.alias')}
              value={active.alias ?? ''}
              onChange={(e) => patch({ alias: e.target.value })}
            />

            <div className="space-y-4">
              {FIELDS.map((f) => (
                <div key={String(f.key)}>
                  <label className="label">{t(`ficha.${String(f.key)}`)}</label>
                  {f.long ? (
                    <textarea
                      className="input min-h-[70px] resize-y text-[13px] leading-relaxed"
                      placeholder={t(`ficha.${String(f.key)}.pista`)}
                      value={(active[f.key] as string) ?? ''}
                      onChange={(e) => patch({ [f.key]: e.target.value } as Partial<Character>)}
                    />
                  ) : (
                    <input
                      className="input"
                      placeholder={t(`ficha.${String(f.key)}.pista`)}
                      value={(active[f.key] as string) ?? ''}
                      onChange={(e) => patch({ [f.key]: e.target.value } as Partial<Character>)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
