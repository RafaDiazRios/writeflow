import { useMemo, useState } from 'react'
import {
  ChevronDown, ChevronRight, FilePlus2, FileText, Folder, FolderOpen, FolderPlus,
  StickyNote, Trash2,
} from 'lucide-react'
import type { Doc, DocKind } from '@/lib/types'

interface Props {
  docs: Doc[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: (kind: DocKind, parentId: string | null) => void
  onDelete: (id: string) => void
  onMove: (id: string, parentId: string | null, position: number) => void
}

const ICON: Record<DocKind, typeof FileText> = {
  folder: Folder,
  chapter: Folder,
  scene: FileText,
  note: StickyNote,
  section: FileText,
  research: StickyNote,
}

const LABEL_COLOR: Record<string, string> = {
  Idea: '#9db8de',
  Borrador: '#c9c6be',
  Revisado: '#7bb37b',
  Final: '#4573b4',
  Descartado: '#d99',
}

/**
 * El «binder»: árbol de carpetas, capítulos, escenas y notas, con
 * arrastrar y soltar para reordenar. Equivalente al panel izquierdo de Scrivener.
 */
export default function Binder({ docs, activeId, onSelect, onCreate, onDelete, onMove }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const byParent = useMemo(() => {
    const m = new Map<string, Doc[]>()
    for (const d of docs) {
      const k = d.parent_id ?? '__root__'
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(d)
    }
    for (const list of m.values()) list.sort((a, b) => a.position - b.position)
    return m
  }, [docs])

  function toggle(id: string) {
    setCollapsed((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function renderLevel(parentKey: string, depth: number): React.ReactNode {
    const list = byParent.get(parentKey) ?? []
    return list.map((d) => {
      const children = byParent.get(d.id) ?? []
      const isFolder = d.kind === 'folder' || d.kind === 'chapter'
      const open = !collapsed.has(d.id)
      const Icon = isFolder ? (open ? FolderOpen : Folder) : ICON[d.kind]
      return (
        <div key={d.id}>
          <div
            draggable
            onDragStart={() => setDragId(d.id)}
            onDragOver={(e) => {
              e.preventDefault()
              setOverId(d.id)
            }}
            onDragLeave={() => setOverId((o) => (o === d.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault()
              setOverId(null)
              if (!dragId || dragId === d.id) return
              // soltar sobre una carpeta la usa como padre; sobre un archivo, se coloca al lado
              if (isFolder) onMove(dragId, d.id, (children.at(-1)?.position ?? 0) + 100)
              else onMove(dragId, d.parent_id, d.position + 1)
              setDragId(null)
            }}
            onClick={() => onSelect(d.id)}
            className={`group flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-[13px] transition ${
              d.id === activeId
                ? 'bg-accent-100 font-medium text-accent-900 dark:bg-accent-900/50 dark:text-accent-100'
                : 'hover:bg-ink-100 dark:hover:bg-ink-800'
            } ${overId === d.id ? 'ring-1 ring-accent-400' : ''}`}
            style={{ paddingLeft: 6 + depth * 13 }}
          >
            {isFolder ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggle(d.id)
                }}
                className="shrink-0 text-ink-400"
              >
                {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
            ) : (
              <span className="w-[13px] shrink-0" />
            )}
            <Icon size={13} className="shrink-0 text-ink-400" />
            <span className="truncate">{d.title || 'Sin título'}</span>
            {d.label && (
              <span
                className="ml-1 h-2 w-2 shrink-0 rounded-full"
                style={{ background: LABEL_COLOR[d.label] ?? '#999' }}
                title={d.label}
              />
            )}
            {d.word_count > 0 && (
              <span className="ml-auto shrink-0 pl-1 text-[10px] tabular-nums text-ink-400">
                {d.word_count}
              </span>
            )}
            <button
              className="shrink-0 rounded p-0.5 text-ink-300 opacity-0 hover:text-red-600 group-hover:opacity-100"
              title="Eliminar"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(d.id)
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
          {isFolder && open && renderLevel(d.id, depth + 1)}
        </div>
      )
    })
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-0.5 border-b border-ink-200 px-2 py-1.5 dark:border-ink-800">
        <span className="panel-title mr-auto">Estructura</span>
        <button className="btn-ghost !px-1.5 !py-1" title="Nueva carpeta" onClick={() => onCreate('folder', null)}>
          <FolderPlus size={15} />
        </button>
        <button className="btn-ghost !px-1.5 !py-1" title="Nueva escena" onClick={() => onCreate('scene', null)}>
          <FilePlus2 size={15} />
        </button>
        <button className="btn-ghost !px-1.5 !py-1" title="Nueva nota" onClick={() => onCreate('note', null)}>
          <StickyNote size={15} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {docs.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-ink-400">
            Vacío. Crea una carpeta para el primer acto o una escena suelta.
          </p>
        ) : (
          renderLevel('__root__', 0)
        )}
      </div>
    </div>
  )
}

export { LABEL_COLOR }
