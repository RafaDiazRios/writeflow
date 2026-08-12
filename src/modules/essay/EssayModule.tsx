import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { JSONContent } from '@tiptap/react'
import { ArrowLeft, Info, Plus } from 'lucide-react'
import ProjectList from '@/components/ProjectList'
import ExportMenu from '@/components/ExportMenu'
import Editor from '@/components/Editor'
import TemplatePicker from './TemplatePicker'
import { docs as docRepo, projects } from '@/lib/repo'
import { countWords, EMPTY_DOC, parseDoc } from '@/lib/text'
import { templateById } from '@/lib/prompts'
import { useApp } from '@/store/app'
import type { Doc, EssayTemplate, Project } from '@/lib/types'

export default function EssayModule() {
  const app = useApp()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [project, setProject] = useState<Project | null>(null)
  const [sections, setSections] = useState<Doc[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [showGuide, setShowGuide] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)

  const active = sections.find((s) => s.id === activeId) ?? null

  const load = useCallback(async (id: string, selectId?: string) => {
    const [p, ds] = await Promise.all([projects.byId(id), docRepo.forProject(id)])
    setProject(p)
    setSections(ds)
    setActiveId(selectId ?? ds[0]?.id ?? null)
  }, [])

  useEffect(() => {
    if (projectId) load(projectId)
  }, [projectId, load])

  // Llegada desde el buscador global: /ensayos?project=…&doc=…
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    const p = params.get('project')
    if (!p) return
    const doc = params.get('doc')
    setProjectId(p)
    load(p, doc ?? undefined)
    setParams({}, { replace: true })
  }, [params, setParams, load])

  async function createFromTemplate(t: EssayTemplate, title: string) {
    const id = await projects.create({
      kind: 'essay',
      title,
      template_id: t.id,
      target_words: t.sections.reduce((a, s) => a + s.suggested_words, 0),
      synopsis: t.description,
      color: '#345a97',
    })
    let pos = 100
    for (const s of t.sections) {
      await docRepo.create({
        project_id: id,
        kind: 'section',
        title: s.title,
        guide: s.guide,
        target_words: s.suggested_words,
        position: pos,
        content_json: JSON.stringify(EMPTY_DOC),
      })
      pos += 100
    }
    setPicking(false)
    setRefreshKey((k) => k + 1)
    setProjectId(id)
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
      setSections((s) => s.map((d) => (d.id === activeId ? { ...d, ...patch } : d)))
    },
    [activeId],
  )


  if (!projectId) {
    return (
      <>
        <ProjectList
          kind="essay"
          title="Ensayos"
          emptyHint="Elige una estructura —argumentativa, Toulmin, rogeriana, IMRyD, reflexiva de Gibbs…— y escribe sección a sección."
          onOpen={setProjectId}
          onCreate={() => setPicking(true)}
          refreshKey={refreshKey}
        />
        {picking && <TemplatePicker onPick={createFromTemplate} onClose={() => setPicking(false)} />}
      </>
    )
  }

  const template = templateById(project?.template_id)
  const total = sections.reduce((a, s) => a + s.word_count, 0)
  const target = project?.target_words ?? 0

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-ink-200 px-3 py-2 dark:border-ink-800">
        <button className="btn-ghost !px-1.5" onClick={() => setProjectId(null)} title="Volver">
          <ArrowLeft size={16} />
        </button>
        <input
          className="min-w-0 max-w-md flex-1 bg-transparent text-sm font-semibold outline-none"
          value={project?.title ?? ''}
          onChange={async (e) => {
            const title = e.target.value
            setProject((p) => (p ? { ...p, title } : p))
            if (projectId) await projects.update(projectId, { title })
          }}
        />
        {template && <span className="chip">{template.name}</span>}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs tabular-nums text-ink-500">
            {total.toLocaleString('es-ES')}
            {target ? ` / ${target.toLocaleString('es-ES')}` : ''} palabras
          </span>
          <button
            className={`btn-ghost !px-1.5 ${showGuide ? 'text-accent-600' : ''}`}
            title="Mostrar la guía de la sección"
            onClick={() => setShowGuide((v) => !v)}
          >
            <Info size={16} />
          </button>
          <ExportMenu projectId={projectId} projectTitle={project?.title ?? 'Ensayo'} variant="essay" />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-ink-200 p-2 dark:border-ink-800">
          <div className="mb-1 flex items-center">
            <span className="panel-title mr-auto">Secciones</span>
            <button
              className="btn-ghost !px-1.5 !py-1"
              title="Añadir sección"
              onClick={async () => {
                if (!projectId) return
                const id = await docRepo.create({
                  project_id: projectId,
                  kind: 'section',
                  title: 'Sección nueva',
                  content_json: JSON.stringify(EMPTY_DOC),
                })
                await load(projectId, id)
              }}
            >
              <Plus size={15} />
            </button>
          </div>
          {sections.map((s, i) => {
            const pct = s.target_words ? Math.min(100, (s.word_count / s.target_words) * 100) : 0
            return (
              <button
                key={s.id}
                onClick={() => setActiveId(s.id)}
                className={`mb-1 w-full rounded-md px-2.5 py-2 text-left transition ${
                  s.id === activeId
                    ? 'bg-accent-100 dark:bg-accent-900/50'
                    : 'hover:bg-ink-100 dark:hover:bg-ink-800'
                }`}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] font-semibold text-accent-600">{i + 1}</span>
                  <span className="truncate text-[13px] font-medium">{s.title}</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-700">
                    <div
                      className={`h-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-accent-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums text-ink-400">
                    {s.word_count}
                    {s.target_words ? `/${s.target_words}` : ''}
                  </span>
                </div>
              </button>
            )
          })}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {active ? (
            <>
              <div className="border-b border-ink-200 px-6 py-2.5 dark:border-ink-800">
                <input
                  className="w-full bg-transparent font-serif text-xl font-semibold outline-none"
                  value={active.title}
                  onChange={async (e) => {
                    const title = e.target.value
                    setSections((s) => s.map((d) => (d.id === active.id ? { ...d, title } : d)))
                    await docRepo.update(active.id, { title })
                  }}
                />
                {showGuide && active.guide && (
                  <p className="mt-2 rounded-md border-l-2 border-accent-400 bg-accent-50/60 px-3 py-2 text-xs leading-relaxed text-ink-600 dark:bg-accent-950/30 dark:text-ink-300">
                    {active.guide}
                  </p>
                )}
              </div>
              <Editor
                key={active.id}
                value={parseDoc(active.content_json) ?? EMPTY_DOC}
                placeholder="Desarrolla esta sección…"
                onChange={saveContent}
              />
            </>
          ) : (
            <div className="grid flex-1 place-items-center text-sm text-ink-400">
              Selecciona una sección.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
