import { useMemo, useRef, useState } from 'react'
import {
  ChevronDown, ChevronRight, FilePlus2, FileText, Folder, FolderOpen, FolderPlus,
  StickyNote, Trash2,
} from 'lucide-react'
import { moverJunto, posiciones, sePuedeSoltar, zonaDeSoltar, type Zona } from '@/lib/reordenar'
import type { Doc, DocKind } from '@/lib/types'
import { useT } from '@/i18n/useT'

export interface CambioOrden {
  id: string
  parent_id: string | null
  position: number
}

interface Props {
  docs: Doc[]
  activeId: string | null
  onSelect: (id: string) => void
  onCreate: (kind: DocKind, parentId: string | null) => void
  onDelete: (id: string) => void
  /** Recibe todas las filas afectadas con su posición nueva. */
  onReorder: (cambios: CambioOrden[]) => void
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

const esCarpeta = (d: Doc) => d.kind === 'folder' || d.kind === 'chapter'

/**
 * El «binder»: árbol de carpetas, capítulos, escenas y notas.
 *
 * Reordenar es la operación central de este panel —estructurar una novela es
 * casi solo mover cosas de sitio—, así que el arrastre tiene tres cuidados que
 * no son adorno:
 *
 * - **Se ve dónde va a caer antes de soltar.** Una línea entre dos filas si va
 *   al lado, un recuadro si va dentro de una carpeta. Sin eso hay que soltar
 *   para averiguar qué pasa, y deshacerlo si no era eso.
 * - **Hay tres zonas en las carpetas**, no dos: arriba «antes», abajo
 *   «después», y el centro «dentro». Con solo dos mitades no habría manera de
 *   meter una escena en un capítulo que ya tiene hijos.
 * - **No se puede meter una carpeta dentro de sí misma.** Sería una rama
 *   colgando de su propio nieto: desaparece de la pantalla y no hay forma de
 *   sacarla arrastrando.
 *
 * Y se puede reordenar **sin ratón**: `Alt` + flechas mueve el documento
 * seleccionado entre sus hermanos. Arrastrar con precisión es incómodo para
 * mucha gente y en un árbol largo es incómodo para todo el mundo.
 */
export default function Binder({ docs, activeId, onSelect, onCreate, onDelete, onReorder }: Props) {
  const t = useT()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dragId, setDragId] = useState<string | null>(null)
  const [destino, setDestino] = useState<{ id: string; zona: Zona } | null>(null)
  const [alFinal, setAlFinal] = useState(false)
  const filas = useRef(new Map<string, HTMLDivElement>())

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

  const hermanos = (padre: string | null) =>
    (byParent.get(padre ?? '__root__') ?? []).map((d) => d.id)

  /** Traduce «he soltado X aquí» en la lista de filas que hay que reescribir. */
  function aplicar(arrastrado: string, padreNuevo: string | null, ordenNuevo: string[]) {
    const doc = docs.find((d) => d.id === arrastrado)
    if (!doc) return
    const padreViejo = doc.parent_id
    const cambios: CambioOrden[] = []

    for (const [id, position] of posiciones(ordenNuevo)) {
      cambios.push({ id, parent_id: padreNuevo, position })
    }
    // Al cambiar de padre, el de origen se queda con huecos en la numeración.
    // No rompe nada, pero se renumera para que el orden siga siendo evidente.
    if (padreViejo !== padreNuevo) {
      const restantes = hermanos(padreViejo).filter((x) => x !== arrastrado)
      for (const [id, position] of posiciones(restantes)) {
        cambios.push({ id, parent_id: padreViejo, position })
      }
    }
    onReorder(cambios)
  }

  function soltarSobre(objetivo: Doc, zona: Zona) {
    if (!dragId) return
    if (!sePuedeSoltar(docs, dragId, objetivo.id, zona)) return

    if (zona === 'dentro') {
      const dentro = hermanos(objetivo.id).filter((x) => x !== dragId)
      aplicar(dragId, objetivo.id, [...dentro, dragId])
      setCollapsed((s) => {
        const n = new Set(s)
        n.delete(objetivo.id) // que se vea dónde ha caído
        return n
      })
      return
    }
    const orden = moverJunto(hermanos(objetivo.parent_id), dragId, objetivo.id, zona)
    aplicar(dragId, objetivo.parent_id, orden)
  }

  function limpiar() {
    setDragId(null)
    setDestino(null)
    setAlFinal(false)
  }

  /** `Alt` + flecha: mueve el documento activo entre sus hermanos. */
  function moverConTeclado(id: string, delta: -1 | 1) {
    const doc = docs.find((d) => d.id === id)
    if (!doc) return
    const lista = hermanos(doc.parent_id)
    const i = lista.indexOf(id)
    const j = i + delta
    if (i === -1 || j < 0 || j >= lista.length) return
    const orden = [...lista]
    orden.splice(i, 1)
    orden.splice(j, 0, id)
    aplicar(id, doc.parent_id, orden)
  }

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
      const carpeta = esCarpeta(d)
      const open = !collapsed.has(d.id)
      const Icon = carpeta ? (open ? FolderOpen : Folder) : ICON[d.kind]
      const marca = destino?.id === d.id ? destino.zona : null
      const valido = !dragId || !destino || sePuedeSoltar(docs, dragId, d.id, destino.zona)

      return (
        <div key={d.id}>
          <div
            ref={(el) => {
              if (el) filas.current.set(d.id, el)
              else filas.current.delete(d.id)
            }}
            draggable
            onDragStart={(e) => {
              setDragId(d.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragEnd={limpiar}
            onDragOver={(e) => {
              e.preventDefault()
              if (!dragId || dragId === d.id) return
              const caja = filas.current.get(d.id)?.getBoundingClientRect()
              if (!caja) return
              const zona = zonaDeSoltar(e.clientY - caja.top, caja.height, carpeta)
              e.dataTransfer.dropEffect = sePuedeSoltar(docs, dragId, d.id, zona) ? 'move' : 'none'
              setAlFinal(false)
              setDestino((prev) =>
                prev?.id === d.id && prev.zona === zona ? prev : { id: d.id, zona },
              )
            }}
            onDragLeave={() => setDestino((o) => (o?.id === d.id ? null : o))}
            onDrop={(e) => {
              e.preventDefault()
              const zona = destino?.id === d.id ? destino.zona : 'despues'
              soltarSobre(d, zona)
              limpiar()
            }}
            onClick={() => onSelect(d.id)}
            onKeyDown={(e) => {
              if (!e.altKey) return
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                moverConTeclado(d.id, -1)
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                moverConTeclado(d.id, 1)
              }
            }}
            tabIndex={0}
            role="treeitem"
            aria-selected={d.id === activeId}
            className={`group relative flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-[13px] outline-none transition
              focus-visible:ring-1 focus-visible:ring-accent-400 ${
                d.id === activeId
                  ? 'bg-accent-100 font-medium text-accent-900 dark:bg-accent-900/50 dark:text-accent-100'
                  : 'hover:bg-ink-100 dark:hover:bg-ink-800'
              } ${dragId === d.id ? 'opacity-40' : ''} ${
                marca === 'dentro'
                  ? valido
                    ? 'ring-1 ring-accent-500'
                    : 'ring-1 ring-red-400'
                  : ''
              }`}
            style={{ paddingLeft: 6 + depth * 13 }}
          >
            {/* Línea de inserción: dice exactamente entre qué dos filas va a caer. */}
            {(marca === 'antes' || marca === 'despues') && (
              <span
                aria-hidden
                className={`pointer-events-none absolute left-0 right-1 h-0.5 rounded ${
                  valido ? 'bg-accent-500' : 'bg-red-400'
                } ${marca === 'antes' ? '-top-px' : '-bottom-px'}`}
                style={{ marginLeft: 6 + depth * 13 }}
              />
            )}

            {carpeta ? (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggle(d.id)
                }}
                className="shrink-0 text-ink-400"
                aria-label={open ? t('comun.contraer') : t('comun.desplegar')}
              >
                {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
            ) : (
              <span className="w-[13px] shrink-0" />
            )}
            <Icon size={13} className="shrink-0 text-ink-400" />
            <span className="truncate">{d.title || t('comun.sinTitulo')}</span>
            {d.label && (
              <span
                className="ml-1 h-2 w-2 shrink-0 rounded-full"
                style={{ background: LABEL_COLOR[d.label] ?? '#999' }}
                title={t(`estado.${d.label.toLowerCase()}`)}
              />
            )}
            {d.word_count > 0 && (
              <span className="ml-auto shrink-0 pl-1 text-[10px] tabular-nums text-ink-400">
                {d.word_count}
              </span>
            )}
            <button
              className="shrink-0 rounded p-0.5 text-ink-300 opacity-0 hover:text-red-600 group-hover:opacity-100"
              title={t('comun.eliminar')}
              onClick={(e) => {
                e.stopPropagation()
                onDelete(d.id)
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>

          {carpeta && open && (
            <>
              {renderLevel(d.id, depth + 1)}
              {/* Una carpeta vacía y abierta necesita algo sobre lo que soltar. */}
              {children.length === 0 && dragId && dragId !== d.id && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDestino({ id: d.id, zona: 'dentro' })
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    soltarSobre(d, 'dentro')
                    limpiar()
                  }}
                  className="mx-2 my-0.5 rounded border border-dashed border-accent-300 py-1 text-center text-[10px] text-accent-600 dark:border-accent-800"
                  style={{ marginLeft: 12 + depth * 13 }}
                >
                  {t('binder.soltarDentro')}
                </div>
              )}
            </>
          )}
        </div>
      )
    })
  }

  const raiz = byParent.get('__root__') ?? []

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-0.5 border-b border-ink-200 px-2 py-1.5 dark:border-ink-800">
        <span className="panel-title mr-auto">{t('binder.titulo')}</span>
        <button className="btn-ghost !px-1.5 !py-1" title={t('binder.nuevaCarpeta')} onClick={() => onCreate('folder', null)}>
          <FolderPlus size={15} />
        </button>
        <button className="btn-ghost !px-1.5 !py-1" title={t('binder.nuevaEscena')} onClick={() => onCreate('scene', null)}>
          <FilePlus2 size={15} />
        </button>
        <button className="btn-ghost !px-1.5 !py-1" title={t('binder.nuevaNota')} onClick={() => onCreate('note', null)}>
          <StickyNote size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1" role="tree" aria-label={t('binder.arbol')}>
        {docs.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-ink-400">
            {t('binder.vacio')}
          </p>
        ) : (
          <>
            {renderLevel('__root__', 0)}
            {/* Sacar algo de una carpeta al nivel raíz: sin esta zona habría que
                soltarlo junto a otro documento de la raíz, y si no hay ninguno
                no habría manera. */}
            {dragId && (
              <div
                onDragOver={(e) => {
                  e.preventDefault()
                  setDestino(null)
                  setAlFinal(true)
                }}
                onDragLeave={() => setAlFinal(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  const orden = [...raiz.map((d) => d.id).filter((x) => x !== dragId), dragId]
                  aplicar(dragId, null, orden)
                  limpiar()
                }}
                className={`m-2 rounded border border-dashed py-2 text-center text-[11px] transition ${
                  alFinal
                    ? 'border-accent-500 bg-accent-50 text-accent-700 dark:bg-accent-950/40'
                    : 'border-ink-300 text-ink-400 dark:border-ink-700'
                }`}
              >
                {t('binder.soltarRaiz')}
              </div>
            )}
          </>
        )}
      </div>

      <p className="border-t border-ink-200 px-2 py-1 text-[10px] text-ink-400 dark:border-ink-800">
        {t('binder.ayudaArrastra')} · <kbd>Alt</kbd> {t('binder.ayudaTeclado')}
      </p>
    </div>
  )
}

export { LABEL_COLOR }
