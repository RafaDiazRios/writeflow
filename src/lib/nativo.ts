import { invoke as invokeTauri } from '@tauri-apps/api/core'
import { traducirErrorNativo } from '@/i18n'

/**
 * `invoke` con los errores del backend ya traducidos.
 *
 * Sustituye a `invoke` en todo lo que pueda devolver un error de Rust, que hoy
 * es el cifrado y el menú de compartir de Android. Los comandos que no fallan
 * —`app_info`, `reiniciar`— pueden seguir usando el `invoke` de Tauri.
 */
export async function invocar<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invokeTauri<T>(cmd, args)
  } catch (e) {
    throw new Error(traducirErrorNativo(e))
  }
}
