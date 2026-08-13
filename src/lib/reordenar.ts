/**
 * Reordenar arrastrando: la parte que se puede razonar sin un ratón.
 *
 * Todo lo de aquí son funciones puras sobre listas de identificadores. La
 * interfaz decide *dónde* se ha soltado algo; este módulo decide *qué orden*
 * queda, y es lo que se puede probar de verdad.
 */

/** Dónde ha caído el puntero respecto de la fila de destino. */
export type Zona = 'antes' | 'despues' | 'dentro'

/**
 * Decide la zona según la posición vertical dentro de la fila.
 *
 * Las carpetas se parten en tres bandas —el tercio central significa «méteme
 * dentro»— y todo lo demás en dos mitades. Sin la banda central no habría forma
 * de meter una escena en un capítulo que ya tiene hijos: soltar encima
 * significaría siempre «al lado».
 */
export function zonaDeSoltar(
  offsetY: number,
  altura: number,
  admiteDentro: boolean,
): Zona {
  if (altura <= 0) return 'despues'
  const p = offsetY / altura
  if (!admiteDentro) return p < 0.5 ? 'antes' : 'despues'
  if (p < 0.3) return 'antes'
  if (p > 0.7) return 'despues'
  return 'dentro'
}

/**
 * Reordena `ids` moviendo `arrastrado` junto a `destino`.
 *
 * Devuelve la lista nueva. Si el elemento arrastrado ya estaba en la lista se
 * saca primero, para que el índice de destino se calcule sobre la lista sin él
 * —si no, arrastrar hacia abajo se queda siempre una posición corta.
 */
export function moverJunto(
  ids: string[],
  arrastrado: string,
  destino: string,
  zona: 'antes' | 'despues',
): string[] {
  const sinEl = ids.filter((x) => x !== arrastrado)
  const i = sinEl.indexOf(destino)
  if (i === -1) return [...sinEl, arrastrado]
  const at = zona === 'antes' ? i : i + 1
  return [...sinEl.slice(0, at), arrastrado, ...sinEl.slice(at)]
}

/**
 * Posiciones para guardar: 0, 100, 200…
 *
 * Se renumera la lista entera en vez de buscar un hueco entre dos vecinos.
 * Buscar hueco es más rápido pero se degrada: tras unas cuantas inserciones
 * entre las mismas dos tarjetas los números se juntan hasta chocar, y entonces
 * el orden se decide por cómo ordene SQLite los empates. Renumerar cuesta unas
 * pocas escrituras y no se estropea nunca.
 */
export function posiciones(ids: string[]): Map<string, number> {
  return new Map(ids.map((id, i) => [id, i * 100]))
}

export interface Nodo {
  id: string
  parent_id: string | null
}

/**
 * ¿Es `posible` descendiente de `ancestro`?
 *
 * Sirve para impedir que una carpeta se suelte dentro de sí misma o de uno de
 * sus hijos. Sin esta comprobación el árbol se parte: la rama se queda
 * apuntándose a sí misma, desaparece de la pantalla —ya no cuelga de la raíz—
 * y no hay forma de volver a sacarla arrastrando.
 */
export function esDescendiente(nodos: Nodo[], ancestro: string, posible: string): boolean {
  const padre = new Map(nodos.map((n) => [n.id, n.parent_id]))
  let actual: string | null | undefined = posible
  const visitados = new Set<string>()
  while (actual) {
    if (actual === ancestro) return true
    if (visitados.has(actual)) return false // ciclo previo: no colgarse
    visitados.add(actual)
    actual = padre.get(actual) ?? null
  }
  return false
}

/** ¿Se puede soltar `arrastrado` sobre `destino` con esa zona? */
export function sePuedeSoltar(
  nodos: Nodo[],
  arrastrado: string,
  destino: string,
  zona: Zona,
): boolean {
  if (arrastrado === destino) return false
  // Meterlo dentro de su propia rama rompería el árbol.
  if (zona === 'dentro' && esDescendiente(nodos, arrastrado, destino)) return false
  // Ponerlo al lado de un descendiente también: el padre nuevo sería su hijo.
  if (zona !== 'dentro') {
    const padreDestino = nodos.find((n) => n.id === destino)?.parent_id ?? null
    if (padreDestino && esDescendiente(nodos, arrastrado, padreDestino)) return false
  }
  return true
}
