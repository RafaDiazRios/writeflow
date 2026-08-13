import { useEffect, useRef, useState } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { beats as beatRepo, docs as docRepo, threads as threadRepo } from '@/lib/repo'
import { moverJunto, posiciones } from '@/lib/reordenar'
import type { Doc, PlotBeat, PlotThread } from '@/lib/types'

interface Props {
  projectId: string
  docs: Doc[]
  onOpenDoc: (id: string) => void
  /** Se llama tras reordenar tarjetas, para releer el proyecto. */
  onDocsChanged: () => void
}

const BEAT_STATUS = ['idea', 'escrito', 'revisado']

/**
 * Tablero de corcho + líneas de trama.
 *
 * Arriba, las tarjetas de sinopsis de cada escena (como el corkboard de
 * Scrivener). Abajo, las tramas: cada hilo con sus beats, para ver de un
 * vistazo si una subtrama desaparece durante doscientas páginas.
 */
export default function Corkboard({ projectId, docs, onOpenDoc, onDocsChanged }: Props) {
  const [threads, setThreads] = useState<PlotThread[]>([])
  const [beats, setBeats] = useState<PlotBeat[]>([])
  const [tarjetaArrastrada, setTarjetaArrastrada] = useState<string | null>(null)
  const [tarjetaDestino, setTarjetaDestino] = useState<{ id: string; antes: boolean } | null>(null)
  const [momentoArrastrado, setMomentoArrastrado] = useState<string | null>(null)
  const [momentoDestino, setMomentoDestino] = useState<{ id: string; antes: boolean } | null>(null)
  const cajas = useRef(new Map<string, HTMLElement>())

  /**
   * Reordena tarjetas de escena.
   *
   * Una tarjeta soltada junto a otra **adopta también su carpeta**. En el
   * tablero no se ve la jerarquía —son tarjetas seguidas—, así que si al soltar
   * una escena junto a otra se quedara en su capítulo original, saltaría de
   * sitio al volver a dibujarse. Que siga a la tarjeta que tiene al lado es lo
   * que se espera al verlo.
   */
  async function reordenarTarjetas(arrastrada: string, destinoId: string, antes: boolean) {
    const dest = docs.find((d) => d.id === destinoId)
    if (!dest || arrastrada === destinoId) return
    const padre = dest.parent_id
    const hermanos = docs
      .filter((d) => d.parent_id === padre)
      .sort((a, b) => a.position - b.position)
      .map((d) => d.id)
    const orden = moverJunto(hermanos, arrastrada, destinoId, antes ? 'antes' : 'despues')
    const cambios = [...posiciones(orden)].map(([id, position]) => ({
      id,
      parent_id: padre,
      position,
    }))
    await docRepo.reordenarLote(cambios)
    onDocsChanged()
  }

  async function reordenarMomentos(threadId: string, arrastrado: string, destinoId: string, antes: boolean) {
    if (arrastrado === destinoId) return
    const mios = beats
      .filter((b) => b.thread_id === threadId)
      .sort((a, b) => a.position - b.position)
      .map((b) => b.id)
    const orden = moverJunto(mios, arrastrado, destinoId, antes ? 'antes' : 'despues')
    for (const [id, position] of posiciones(orden)) {
      const actual = beats.find((b) => b.id === id)
      if (actual && actual.position !== position) await beatRepo.update(id, { position })
    }
    await load()
  }

  async function load() {
    setThreads(await threadRepo.forProject(projectId))
    setBeats(await beatRepo.forProject(projectId))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const scenes = docs.filter((d) => d.kind === 'scene' || d.kind === 'chapter')

  return (
    <div className="h-full overflow-y-auto p-5">
      <section className="mb-8">
        <h2 className="panel-title mb-2">Tarjetas de escena</h2>
        {scenes.length === 0 ? (
          <p className="rounded-md border border-dashed border-ink-300 p-6 text-center text-xs text-ink-400 dark:border-ink-700">
            Cuando crees escenas en la estructura aparecerán aquí como tarjetas.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
            {scenes.map((d) => (
              <button
                key={d.id}
                ref={(el) => {
                  if (el) cajas.current.set(d.id, el)
                  else cajas.current.delete(d.id)
                }}
                draggable
                onDragStart={(e) => {
                  setTarjetaArrastrada(d.id)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragEnd={() => {
                  setTarjetaArrastrada(null)
                  setTarjetaDestino(null)
                }}
                onDragOver={(e) => {
                  if (!tarjetaArrastrada || tarjetaArrastrada === d.id) return
                  e.preventDefault()
                  const caja = cajas.current.get(d.id)?.getBoundingClientRect()
                  if (!caja) return
                  // En una rejilla lo que importa es la mitad izquierda o derecha.
                  const antes = e.clientX - caja.left < caja.width / 2
                  setTarjetaDestino((p) => (p?.id === d.id && p.antes === antes ? p : { id: d.id, antes }))
                }}
                onDragLeave={() => setTarjetaDestino((p) => (p?.id === d.id ? null : p))}
                onDrop={async (e) => {
                  e.preventDefault()
                  const antes = tarjetaDestino?.id === d.id ? tarjetaDestino.antes : false
                  const arrastrada = tarjetaArrastrada
                  setTarjetaArrastrada(null)
                  setTarjetaDestino(null)
                  if (arrastrada) await reordenarTarjetas(arrastrada, d.id, antes)
                }}
                onClick={() => onOpenDoc(d.id)}
                className={`relative flex h-40 cursor-grab flex-col rounded-md border border-amber-200 bg-amber-50 p-3 text-left shadow-sm transition hover:shadow-md active:cursor-grabbing dark:border-amber-900/50 dark:bg-amber-950/20 ${
                  tarjetaArrastrada === d.id ? 'opacity-40' : ''
                } ${
                  tarjetaDestino?.id === d.id
                    ? tarjetaDestino.antes
                      ? 'before:absolute before:-left-1.5 before:top-2 before:bottom-2 before:w-1 before:rounded before:bg-accent-500'
                      : 'after:absolute after:-right-1.5 after:top-2 after:bottom-2 after:w-1 after:rounded after:bg-accent-500'
                    : ''
                }`}
              >
                <div className="mb-1 truncate text-sm font-semibold">{d.title || 'Sin título'}</div>
                <p className="flex-1 overflow-hidden text-xs leading-relaxed text-ink-600 dark:text-ink-300">
                  {d.synopsis || <span className="italic text-ink-400">Sin sinopsis.</span>}
                </p>
                <div className="mt-2 flex items-center justify-between text-[10px] text-ink-500">
                  <span>{d.status ?? ''}</span>
                  <span>{d.word_count} pal.</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="panel-title mr-auto">Líneas de trama</h2>
          <button
            className="btn-outline !py-1 text-xs"
            onClick={async () => {
              await threadRepo.create({
                project_id: projectId,
                name: 'Nueva trama',
                kind: 'subplot',
                color: '#9db8de',
                position: threads.length * 100,
              })
              await load()
            }}
          >
            <Plus size={13} /> Trama
          </button>
        </div>

        {threads.length === 0 ? (
          <p className="rounded-md border border-dashed border-ink-300 p-6 text-center text-xs text-ink-400 dark:border-ink-700">
            Crea una trama principal y una o dos subtramas, y ve colocando sus momentos clave.
          </p>
        ) : (
          <div className="space-y-3">
            {threads.map((t) => {
              const mine = beats.filter((b) => b.thread_id === t.id)
              return (
                <div key={t.id} className="card p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <input
                      type="color"
                      className="h-5 w-5 cursor-pointer rounded border-none bg-transparent"
                      value={t.color}
                      onChange={async (e) => {
                        await threadRepo.update(t.id, { color: e.target.value })
                        setThreads((s) => s.map((x) => (x.id === t.id ? { ...x, color: e.target.value } : x)))
                      }}
                    />
                    <input
                      className="flex-1 bg-transparent text-sm font-semibold outline-none"
                      value={t.name}
                      onChange={async (e) => {
                        const name = e.target.value
                        setThreads((s) => s.map((x) => (x.id === t.id ? { ...x, name } : x)))
                        await threadRepo.update(t.id, { name })
                      }}
                    />
                    <select
                      className="rounded border border-ink-200 bg-transparent px-1.5 py-0.5 text-xs dark:border-ink-700"
                      value={t.kind}
                      onChange={async (e) => {
                        await threadRepo.update(t.id, { kind: e.target.value })
                        setThreads((s) =>
                          s.map((x) => (x.id === t.id ? { ...x, kind: e.target.value as PlotThread['kind'] } : x)),
                        )
                      }}
                    >
                      <option value="main">Principal</option>
                      <option value="subplot">Subtrama</option>
                      <option value="arc">Arco de personaje</option>
                    </select>
                    <button
                      className="btn-ghost !px-1.5 !py-1"
                      title="Añadir momento"
                      onClick={async () => {
                        await beatRepo.create({
                          project_id: projectId,
                          thread_id: t.id,
                          title: 'Momento',
                          status: 'idea',
                          position: mine.length * 100,
                        })
                        await load()
                      }}
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      className="btn-danger !px-1.5 !py-1"
                      title="Eliminar trama"
                      onClick={async () => {
                        if (window.confirm(`¿Eliminar la trama «${t.name}»?`)) {
                          await threadRepo.remove(t.id)
                          await load()
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {mine.length === 0 && (
                      <span className="py-3 text-xs text-ink-400">Sin momentos todavía.</span>
                    )}
                    {mine.map((b) => (
                      <div
                        key={b.id}
                        ref={(el) => {
                          if (el) cajas.current.set(b.id, el)
                          else cajas.current.delete(b.id)
                        }}
                        onDragOver={(e) => {
                          if (!momentoArrastrado || momentoArrastrado === b.id) return
                          e.preventDefault()
                          const caja = cajas.current.get(b.id)?.getBoundingClientRect()
                          if (!caja) return
                          const antes = e.clientX - caja.left < caja.width / 2
                          setMomentoDestino((p) =>
                            p?.id === b.id && p.antes === antes ? p : { id: b.id, antes },
                          )
                        }}
                        onDragLeave={() => setMomentoDestino((p) => (p?.id === b.id ? null : p))}
                        onDrop={async (e) => {
                          e.preventDefault()
                          const antes = momentoDestino?.id === b.id ? momentoDestino.antes : false
                          const arrastrado = momentoArrastrado
                          setMomentoArrastrado(null)
                          setMomentoDestino(null)
                          if (arrastrado) await reordenarMomentos(t.id, arrastrado, b.id, antes)
                        }}
                        className={`relative w-52 shrink-0 rounded border-l-4 bg-ink-50 p-2 dark:bg-ink-800 ${
                          momentoArrastrado === b.id ? 'opacity-40' : ''
                        } ${
                          momentoDestino?.id === b.id
                            ? momentoDestino.antes
                              ? 'before:absolute before:-left-1 before:top-1 before:bottom-1 before:w-1 before:rounded before:bg-accent-500'
                              : 'after:absolute after:-right-1 after:top-1 after:bottom-1 after:w-1 after:rounded after:bg-accent-500'
                            : ''
                        }`}
                        style={{ borderLeftColor: t.color }}
                      >
                        {/* El asa: la tarjeta entera no puede ser arrastrable
                            porque dentro hay campos de texto que hay que poder
                            seleccionar con el ratón. */}
                        <div
                          draggable
                          onDragStart={(e) => {
                            setMomentoArrastrado(b.id)
                            e.dataTransfer.effectAllowed = 'move'
                          }}
                          onDragEnd={() => {
                            setMomentoArrastrado(null)
                            setMomentoDestino(null)
                          }}
                          className="mb-1 flex cursor-grab justify-center text-ink-300 active:cursor-grabbing"
                          title="Arrastrar para reordenar"
                        >
                          <GripVertical size={12} />
                        </div>
                        <input
                          className="w-full bg-transparent text-xs font-semibold outline-none"
                          value={b.title}
                          onChange={async (e) => {
                            const title = e.target.value
                            setBeats((s) => s.map((x) => (x.id === b.id ? { ...x, title } : x)))
                            await beatRepo.update(b.id, { title })
                          }}
                        />
                        <textarea
                          className="mt-1 w-full resize-none bg-transparent text-[11px] leading-snug outline-none"
                          rows={3}
                          placeholder="Qué ocurre y qué cambia"
                          value={b.description ?? ''}
                          onChange={async (e) => {
                            const description = e.target.value
                            setBeats((s) => s.map((x) => (x.id === b.id ? { ...x, description } : x)))
                            await beatRepo.update(b.id, { description })
                          }}
                        />
                        <div className="mt-1 flex items-center gap-1">
                          <select
                            className="flex-1 rounded bg-transparent text-[10px] outline-none"
                            value={b.status}
                            onChange={async (e) => {
                              const status = e.target.value
                              setBeats((s) => s.map((x) => (x.id === b.id ? { ...x, status } : x)))
                              await beatRepo.update(b.id, { status })
                            }}
                          >
                            {BEAT_STATUS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          <button
                            className="text-ink-300 hover:text-red-600"
                            onClick={async () => {
                              await beatRepo.remove(b.id)
                              await load()
                            }}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
