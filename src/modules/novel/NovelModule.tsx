import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { JSONContent } from '@tiptap/react'
import { ArrowLeft, LayoutGrid, PanelRightClose, PanelRightOpen, PenLine, Users } from 'lucide-react'
import ProjectList from '@/components/ProjectList'
import ExportMenu from '@/components/ExportMenu'
import Editor from '@/components/Editor'
import Binder from './Binder'
import Inspector from './Inspector'
import CharacterSheets from './CharacterSheets'
import Corkboard from './Corkboard'
import { characters as charRepo, docs as docRepo, projects } from '@/lib/repo'
import { countWords, EMPTY_DOC, parseDoc } from '@/lib/text'
import { useApp } from '@/store/app'
import type { Character, Doc, DocKind, Project } from '@/lib/types'
import { num } from '@/i18n'
import { useT } from '@/i18n/useT'

type Tab = 'write' | 'board' | 'characters'

export default function NovelModule() {
  const t = useT()
  const app = useApp()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [items, setItems] = useState<Doc[]>([])
  const [chars, setChars] = useState<Character[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('write')
  const [inspector, setInspector] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const active = items.find((d) => d.id === activeId) ?? null

  const load = useCallback(
    async (id: string, selectId?: string) => {
      const [p, ds, cs] = await Promise.all([
        projects.byId(id),
        docRepo.forProject(id),
        charRepo.forProject(id),
      ])
      setProject(p)
      setItems(ds)
      setChars(cs)
      setActiveId(selectId ?? ds.find((d) => d.kind === 'scene')?.id ?? ds[0]?.id ?? null)
    },
    [],
  )

  useEffect(() => {
    if (projectId) load(projectId)
  }, [projectId, load])

  // Llegada desde el buscador global: /novela?project=…&doc=…&tab=…&character=…
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    const p = params.get('project')
    if (!p) return
    const doc = params.get('doc')
    const pestana = params.get('tab')
    setProjectId(p)
    load(p, doc ?? undefined)
    if (pestana === 'characters') setTab('characters')
    else if (doc) setTab('write')
    setParams({}, { replace: true })
  }, [params, setParams, load])

  async function createProject() {
    const title = window.prompt(t('novela.nuevaPregunta'), t('novela.sinTitulo'))
    if (!title) return
    const id = await projects.create({ kind: 'novel', title, target_words: 80000 })
    // estructura inicial mínima, al estilo de las plantillas de Scrivener
    const manuscript = await docRepo.create({
      project_id: id, kind: 'folder', title: t('novela.inicial.manuscrito'), position: 100,
    })
    await docRepo.create({
      project_id: id, parent_id: manuscript, kind: 'chapter', title: t('novela.inicial.capitulo'), position: 100,
    })
    await docRepo.create({
      project_id: id, parent_id: manuscript, kind: 'scene', title: t('novela.inicial.escena'), position: 200,
      synopsis: t('novela.inicial.escenaSinopsis'),
    })
    await docRepo.create({ project_id: id, kind: 'folder', title: t('novela.inicial.investigacion'), position: 200 })
    await docRepo.create({ project_id: id, kind: 'note', title: t('novela.inicial.ideas'), position: 300 })
    setRefreshKey((k) => k + 1)
    setProjectId(id)
  }

  async function createDoc(kind: DocKind, parentId: string | null) {
    if (!projectId) return
    // El título nace en el idioma que haya al crearlo y ahí se queda: es
    // contenido del usuario, no interfaz.
    const id = await docRepo.create({
      project_id: projectId,
      parent_id: parentId ?? active?.parent_id ?? null,
      kind,
      title: t(`doc.nuevo.${kind}`),
      content_json: JSON.stringify(EMPTY_DOC),
    })
    await load(projectId, id)
  }

  const saveContent = useCallback(
    async (doc: JSONContent, text: string) => {
      if (!activeId) return
      const patch = {
        content_json: JSON.stringify(doc),
        content_text: text,
        word_count: countWords(text),
      }
      await docRepo.update(activeId, patch)
      setItems((s) => s.map((d) => (d.id === activeId ? { ...d, ...patch } : d)))
    },
    [activeId],
  )

  async function patchDoc(patch: Partial<Doc>) {
    if (!activeId) return
    await docRepo.update(activeId, patch)
    setItems((s) => s.map((d) => (d.id === activeId ? { ...d, ...patch } : d)))
  }


  if (!projectId) {
    return (
      <ProjectList
        kind="novel"
        title={t('novela.titulo')}
        emptyHint={t('novela.pistaVacia')}
        onOpen={setProjectId}
        onCreate={createProject}
        refreshKey={refreshKey}
      />
    )
  }

  const total = items.reduce((a, d) => a + (d.in_compile ? d.word_count : 0), 0)
  const pct = project?.target_words ? Math.min(100, (total / project.target_words) * 100) : 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-ink-200 px-3 py-2 dark:border-ink-800">
        <button className="btn-ghost !px-1.5" onClick={() => setProjectId(null)} title={t('comun.volverALista')}>
          <ArrowLeft size={16} />
        </button>
        <input
          className="min-w-0 max-w-xs flex-1 bg-transparent text-sm font-semibold outline-none"
          value={project?.title ?? ''}
          onChange={async (e) => {
            const title = e.target.value
            setProject((p) => (p ? { ...p, title } : p))
            if (projectId) await projects.update(projectId, { title })
          }}
        />

        <div className="flex items-center gap-1 rounded-md bg-ink-100 p-0.5 dark:bg-ink-800">
          <TabBtn active={tab === 'write'} onClick={() => setTab('write')} icon={<PenLine size={14} />} label={t('novela.pestanaEscribir')} />
          <TabBtn active={tab === 'board'} onClick={() => setTab('board')} icon={<LayoutGrid size={14} />} label={t('novela.pestanaTablero')} />
          <TabBtn active={tab === 'characters'} onClick={() => setTab('characters')} icon={<Users size={14} />} label={t('novela.pestanaPersonajes')} />
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-2 text-xs text-ink-500 sm:flex">
            <span className="tabular-nums">{num(total)}</span>
            {project?.target_words ? (
              <>
                <span>/ {num(project.target_words)}</span>
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-700">
                  <div className="h-full bg-accent-500" style={{ width: `${pct}%` }} />
                </div>
              </>
            ) : null}
          </div>
          <ExportMenu projectId={projectId} projectTitle={project?.title ?? t('novela.titulo')} variant="novel" />
          {tab === 'write' && (
            <button
              className="btn-ghost !px-1.5"
              onClick={() => setInspector((v) => !v)}
              title={t('novela.alternarInspector')}
            >
              {inspector ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
          )}
        </div>
      </header>

      {tab === 'write' && (
        <div className="flex min-h-0 flex-1">
          <div className="w-60 shrink-0 border-r border-ink-200 dark:border-ink-800">
            <Binder
              docs={items}
              activeId={activeId}
              onSelect={setActiveId}
              onCreate={createDoc}
              onDelete={async (id) => {
                if (!window.confirm(t('novela.confirmarEliminarDoc'))) return
                await docRepo.remove(id)
                if (projectId) await load(projectId)
              }}
              onReorder={async (cambios) => {
                await docRepo.reordenarLote(cambios)
                if (projectId) await load(projectId, activeId ?? undefined)
              }}
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col">
            {active ? (
              <>
                <input
                  className="border-b border-ink-200 bg-transparent px-6 py-2.5 font-serif text-xl font-semibold outline-none dark:border-ink-800"
                  value={active.title}
                  onChange={(e) => patchDoc({ title: e.target.value })}
                  placeholder={t('novela.tituloDocumento')}
                />
                <Editor
                  key={active.id}
                  value={parseDoc(active.content_json) ?? EMPTY_DOC}
                  placeholder={t('novela.escribirPlaceholder')}
                  onChange={saveContent}
                />
              </>
            ) : (
              <div className="grid flex-1 place-items-center text-sm text-ink-400">
                {t('novela.sinDocumento')}
              </div>
            )}
          </div>

          {inspector && active && (
            <div className="w-72 shrink-0 border-l border-ink-200 dark:border-ink-800">
              <Inspector doc={active} characters={chars} onPatch={patchDoc} />
            </div>
          )}
        </div>
      )}

      {tab === 'board' && (
        <Corkboard
          projectId={projectId}
          docs={items}
          onDocsChanged={() => load(projectId, activeId ?? undefined)}
          onOpenDoc={(id) => {
            setActiveId(id)
            setTab('write')
          }}
        />
      )}

      {tab === 'characters' && <CharacterSheets projectId={projectId} />}
    </div>
  )
}

function TabBtn({
  active, onClick, icon, label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition ${
        active ? 'bg-white font-medium shadow-sm dark:bg-ink-700' : 'text-ink-500 hover:text-ink-800 dark:hover:text-ink-200'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}
