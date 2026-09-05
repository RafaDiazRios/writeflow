import { useEffect, useState } from 'react'
import { msHastaLaProximaHora, toISODate } from './dates'

/**
 * La hora actual, que se refresca sola.
 *
 * Existe porque esta aplicación no se cierra. Se deja abierta de un día para
 * otro, y `new Date()` leído una vez al montar se queda congelado: a las nueve
 * de la mañana el inicio seguía dando las buenas noches, con la fecha de ayer y
 * el prompt de ayer, hasta que alguien recargaba.
 *
 * Dos disparadores, porque ninguno de los dos basta solo:
 *
 * - Un temporizador hasta el cambio de hora en punto. Cubre el caso de tener la
 *   ventana delante cuando pasa la medianoche.
 * - `focus` y `visibilitychange`. Cubren el caso contrario, y es el que más
 *   pasa: el portátil se suspende y el temporizador no salta a su hora, sino al
 *   despertar. Volver a la ventana es el momento exacto en que la fecha vuelve a
 *   mirarse.
 *
 * Y solo se avisa a React cuando cambia la hora o el día, no en cada foco: si
 * devolviera un `Date` nuevo cada vez, cualquier efecto que dependiera de él se
 * repetiría al pasar por delante de la ventana.
 */
export function useAhora(): Date {
  const [ahora, setAhora] = useState(() => new Date())

  useEffect(() => {
    let temporizador: ReturnType<typeof setTimeout>

    const programar = () => {
      clearTimeout(temporizador)
      temporizador = setTimeout(refrescar, msHastaLaProximaHora())
    }

    const refrescar = () => {
      setAhora((previo) => {
        const d = new Date()
        return d.getHours() === previo.getHours() && d.getDate() === previo.getDate() ? previo : d
      })
      programar()
    }

    programar()
    window.addEventListener('focus', refrescar)
    document.addEventListener('visibilitychange', refrescar)
    return () => {
      clearTimeout(temporizador)
      window.removeEventListener('focus', refrescar)
      document.removeEventListener('visibilitychange', refrescar)
    }
  }, [])

  return ahora
}

/** El día de hoy en YYYY-MM-DD, que cambia solo al cambiar de día. */
export function useHoy(): string {
  return toISODate(useAhora())
}

/**
 * ¿Está el cursor dentro de un editor?
 *
 * Se usa para no mover el suelo debajo de quien escribe: al pasar de día, el
 * diario salta al día nuevo, y hacerlo en mitad de una frase sería quitarle a
 * alguien el texto de delante. `wf-prose` es la clase del área editable.
 */
export function escribiendo(): boolean {
  const el = document.activeElement
  return Boolean(el instanceof Element && el.closest('.wf-prose'))
}
