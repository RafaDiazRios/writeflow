import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, ChevronRight, Eye, ScrollText, UserRound } from 'lucide-react'
import { characters as charRepo, docs as docRepo, projects } from '@/lib/repo'
import { parseDoc } from '@/lib/text'
import { tiptapToXhtml } from '@/lib/epub'
import ExportMenu from '@/components/ExportMenu'
import { useRefrescoTrasSync } from '@/lib/refresco'
import type { Character, Doc, Project } from '@/lib/types'
import { useT } from '@/i18n/useT'

/**
 * Biblioteca de solo lectura.
 *
 * En el móvil se pueden leer la novela y los ensayos —repasar un capítulo en el
 * metro, consultar la ficha de un personaje— pero no editarlos. No es una
 * limitación técnica: el binder con arrastrar y soltar, el inspector y el tablero
 * de tramas necesitan sitio, y hacerlos caber a la fuerza solo produce una versión
 * peor de los dos.
 */
export default function MobileLibrary() {
  const t = useT()
  const [items, setItems] = useState<Project[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [docs, setDocs] = useState<Doc[]>([])
  const [chars, setChars] = useState<Character[]>([])
  const [reading, setReading] = useState<Doc | null>(null)
  const [character, setCharacter] = useState<Character | null>(null)
  const [params, setParams] = useSearchParams()
  const trasSync = useRefrescoTrasSync()

  useEffect(() => {
    Promise.all([projects.list('novel'), projects.list('essay')]).then(([n, e]) =>
      setItems([...n, ...e]),
    )
  }, [trasSync])

  async function open(p: Project) {
    setProject(p)
    setDocs(await docRepo.forProject(p.id))
    setChars(p.kind === 'novel' ? await charRepo.forProject(p.id) : [])
  }

  // Llegada desde el buscador global.
  useEffect(() => {
    const pid = params.get('project')
    if (!pid) return
    projects.byId(pid).then(async (p) => {
      if (!p) return
      await open(p)
      const d = params.get('doc')
      if (d) setReading(await docRepo.byId(d))
      const c = params.get('character')
      if (c) setCharacter(await charRepo.byId(c))
    })
    setParams({}, { replace: true })
  }, [params, setParams])

  // ── lectura de un documento ──
  if (reading) {
    const html = tiptapToXhtml(parseDoc(reading.content_json))
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Bar title={reading.title} onBack={() => setReading(null)} />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {reading.synopsis && (
            <p className="mb-4 rounded-md border-l-2 border-accent-400 bg-accent-50/60 px-3 py-2 text-xs italic leading-relaxed text-ink-600 dark:bg-accent-950/30 dark:text-ink-300">
              {reading.synopsis}
            </p>
          )}
          {html ? (
            <div className="wf-prose" dangerouslySetInnerHTML={{ __html: html }} />
          ) : (
            <p className="py-10 text-center text-sm text-ink-400">{t('biblioteca.documentoVacio')}</p>
          )}
          <p className="mt-8 flex items-center justify-center gap-1.5 text-[11px] text-ink-400">
            <Eye size={12} /> {t('biblioteca.soloLectura')}
          </p>
        </div>
      </div>
    )
  }

  // ── ficha de personaje ──
  if (character) {
    // Los mismos rótulos que la ficha del escritorio, del mismo diccionario:
    // dos juegos de etiquetas para lo mismo se acaban desincronizando.
    const fields: [string, string | null][] = (
      [
        'role', 'age', 'occupation', 'appearance', 'personality', 'goal', 'motivation',
        'conflict', 'arc', 'backstory', 'voice', 'secrets', 'relationships', 'notes',
      ] as (keyof Character)[]
    ).map((k) => [t(`ficha.${String(k)}`), (character[k] as string | null) ?? null])
    return (
      <div className="flex h-full min-h-0 flex-col">
        <Bar title={character.name} onBack={() => setCharacter(null)} />
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {fields.filter(([, v]) => v?.trim()).map(([k, v]) => (
            <div key={k} className="mb-4">
              <div className="label">{k}</div>
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{v}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── contenido de un proyecto ──
  if (project) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {/*
          Leer no se puede editar, pero sí sacar: el mismo menú del escritorio,
          que en Android termina en el selector de compartir en lugar de en un
          diálogo «guardar como».
        */}
        <Bar
          title={project.title}
          onBack={() => setProject(null)}
          acciones={
            <ExportMenu
              projectId={project.id}
              projectTitle={project.title}
              variant={project.kind === 'novel' ? 'novel' : 'essay'}
            />
          }
        />
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {chars.length > 0 && (
            <>
              <p className="panel-title mb-1.5">{t('ficha.titulo')}</p>
              <div className="mb-4 space-y-1">
                {chars.map((c) => (
                  <Row key={c.id} onClick={() => setCharacter(c)} icon={<UserRound size={15} />} title={c.name} />
                ))}
              </div>
            </>
          )}
          <p className="panel-title mb-1.5">{t('biblioteca.documentos')}</p>
          <div className="space-y-1">
            {docs.length === 0 && <Empty>{t('biblioteca.proyectoVacio')}</Empty>}
            {docs.map((d) => (
              <Row
                key={d.id}
                onClick={() => setReading(d)}
                icon={<span className="text-[10px] text-ink-400">{d.word_count || ''}</span>}
                title={d.title}
                sub={d.synopsis ?? undefined}
                indent={d.parent_id ? 1 : 0}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── lista de proyectos ──
  return (
    <div className="h-full overflow-y-auto p-3">
      <h1 className="mb-3 px-1 text-lg font-semibold">{t('biblioteca.titulo')}</h1>
      {items.length === 0 ? (
        <Empty>{t('biblioteca.vacia')}</Empty>
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <button
              key={p.id}
              onClick={() => open(p)}
              className="flex w-full items-center gap-3 rounded-lg border border-ink-200 p-3 text-left active:bg-ink-100 dark:border-ink-800 dark:active:bg-ink-800"
            >
              <span className="shrink-0 text-accent-600 dark:text-accent-400">
                {p.kind === 'novel' ? <BookOpen size={18} /> : <ScrollText size={18} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.title}</span>
                <span className="block truncate text-xs text-ink-500">
                  {p.kind === 'novel' ? t('biblioteca.novela') : t('biblioteca.ensayo')}
                  {p.logline ? ` · ${p.logline}` : ''}
                </span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-ink-300" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Bar({
  title, onBack, acciones,
}: {
  title: string
  onBack: () => void
  /** Botones a la derecha; hoy solo el menú de compartir. */
  acciones?: React.ReactNode
}) {
  const t = useT()
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-ink-200 px-1 py-1 dark:border-ink-800">
      <button
        className="rounded-full p-2 text-ink-600 active:bg-ink-100 dark:active:bg-ink-800"
        onClick={onBack}
        aria-label={t('comun.volver')}
      >
        <ArrowLeft size={20} />
      </button>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
      {acciones && <span className="shrink-0 pr-1">{acciones}</span>}
    </div>
  )
}

function Row({
  onClick, icon, title, sub, indent = 0,
}: {
  onClick: () => void
  icon: React.ReactNode
  title: string
  sub?: string
  indent?: number
}) {
  const t = useT()
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-left active:bg-ink-100 dark:active:bg-ink-800"
      style={{ paddingLeft: 12 + indent * 14 }}
    >
      <span className="w-6 shrink-0 text-ink-400">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px]">{title || t('comun.sinTitulo')}</span>
        {sub && <span className="block truncate text-[11px] text-ink-400">{sub}</span>}
      </span>
      <ChevronRight size={15} className="shrink-0 text-ink-300" />
    </button>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed border-ink-300 p-6 text-center text-xs leading-relaxed text-ink-400 dark:border-ink-700">
      {children}
    </p>
  )
}
