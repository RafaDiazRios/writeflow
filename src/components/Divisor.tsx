import { useCallback, useEffect, useState } from 'react'
import { getMeta, setMeta } from '@/lib/db'

/**
 * Ancho de una columna lateral: se arrastra y se recuerda.
 *
 * Se guarda en `meta`, no en el store de la aplicación, por dos razones: es una
 * preferencia del equipo —como el tema o el idioma— y no tiene por qué viajar a
 * la nube, y así cada panel que quiera un ancho propio solo necesita su clave.
 *
 * El valor guardado se vuelve a limitar al leerlo: si una versión anterior
 * escribió 900 y hoy el máximo es 640, la app no se abre con el panel comiéndose
 * la pantalla.
 */
export function useAnchoPanel(clave: string, porDefecto: number, min = 280, max = 640) {
  const [ancho, setAncho] = useState(porDefecto)

  useEffect(() => {
    let vivo = true
    getMeta(clave).then((v) => {
      const n = Number(v)
      if (vivo && Number.isFinite(n) && n > 0) setAncho(Math.min(max, Math.max(min, n)))
    })
    return () => {
      vivo = false
    }
  }, [clave, min, max])

  // Solo al soltar: arrastrar escribe en SQLite sesenta veces por segundo si no.
  const guardar = useCallback(
    (n: number) => {
      void setMeta(clave, String(Math.round(n)))
    },
    [clave],
  )

  return { ancho, setAncho, guardar, porDefecto, min, max }
}

interface Props {
  ancho: number
  /** Durante el arrastre, en cada movimiento. */
  onAncho: (n: number) => void
  /** Al soltar, al doble clic y con el teclado: el momento de guardar. */
  onSoltar?: (n: number) => void
  min?: number
  max?: number
  /** Doble clic para volver a este ancho. */
  porDefecto?: number
  /**
   * El panel que se redimensiona está a la **derecha** de la barra, no a la
   * izquierda. Sin esto, arrastrar hacia la derecha ensancharía el inspector
   * mientras la barra se aleja de él: el panel haría lo contrario del gesto.
   */
  invertido?: boolean
}

/**
 * La barra que separa dos columnas. Es de un píxel —hace de borde— pero se coge
 * con un margen invisible a los lados, que a un píxel exacto no acierta nadie.
 *
 * Con `setPointerCapture` el arrastre sigue funcionando aunque el puntero salga
 * de la barra, que es lo que pasa siempre en cuanto se mueve deprisa; y las
 * flechas izquierda y derecha hacen lo mismo sin ratón, como en el binder.
 */
export default function Divisor({
  ancho,
  onAncho,
  onSoltar,
  min = 280,
  max = 640,
  porDefecto,
  invertido = false,
}: Props) {
  const [arrastrando, setArrastrando] = useState(false)
  const [inicio, setInicio] = useState<{ x: number; ancho: number } | null>(null)

  const limitar = (n: number) => Math.min(max, Math.max(min, n))
  /* Un panel a la derecha se ensancha cuando la barra va hacia la izquierda. */
  const signo = invertido ? -1 : 1

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={Math.round(ancho)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className={`relative w-px shrink-0 cursor-col-resize touch-none select-none transition-colors ${
        arrastrando
          ? 'bg-accent-500'
          : 'bg-ink-200 hover:bg-accent-400 focus-visible:bg-accent-400 dark:bg-ink-800 dark:hover:bg-accent-600'
      } outline-none`}
      onPointerDown={(e) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        setInicio({ x: e.clientX, ancho })
        setArrastrando(true)
      }}
      onPointerMove={(e) => {
        if (!inicio) return
        onAncho(limitar(inicio.ancho + signo * (e.clientX - inicio.x)))
      }}
      onPointerUp={(e) => {
        if (!inicio) return
        e.currentTarget.releasePointerCapture(e.pointerId)
        setInicio(null)
        setArrastrando(false)
        onSoltar?.(ancho)
      }}
      onPointerCancel={() => {
        setInicio(null)
        setArrastrando(false)
      }}
      onDoubleClick={() => {
        if (porDefecto === undefined) return
        const n = limitar(porDefecto)
        onAncho(n)
        onSoltar?.(n)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        e.preventDefault()
        const paso = e.shiftKey ? 48 : 16
        const n = limitar(ancho + signo * (e.key === 'ArrowRight' ? paso : -paso))
        onAncho(n)
        onSoltar?.(n)
      }}
    >
      {/* Zona de agarre: doce píxeles, invisibles, centrados en la barra. */}
      <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
    </div>
  )
}
