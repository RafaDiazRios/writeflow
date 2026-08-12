import { useEffect, useState } from 'react'

/**
 * Repintado tras una sincronización.
 *
 * Las pantallas leen de SQLite cuando se montan y se quedan con lo que había.
 * Cuando la sincronización baja filas nuevas, la base de datos cambia por
 * debajo y la vista sigue enseñando lo de antes: el usuario ve «bajadas 2» y su
 * calendario vacío, y concluye —con razón— que la sincronización no funciona.
 *
 * `syncNow` dispara `writeflow:sincronizado` cuando ha bajado algo. Este hook
 * devuelve un contador que cambia con ese aviso; basta con meterlo en las
 * dependencias del `useEffect` que carga los datos.
 */
export const EVENTO_SINCRONIZADO = 'writeflow:sincronizado'

export function useRefrescoTrasSync(): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    const alSincronizar = () => setN((v) => v + 1)
    window.addEventListener(EVENTO_SINCRONIZADO, alSincronizar)
    return () => window.removeEventListener(EVENTO_SINCRONIZADO, alSincronizar)
  }, [])
  return n
}
