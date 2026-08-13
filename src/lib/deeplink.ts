import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { completeAuth } from './supabase'
import { useApp } from '@/store/app'

/**
 * Vuelta del login con Google.
 *
 * El navegador del sistema abre la pantalla de Google; al terminar, Supabase
 * redirige a `writeflow://auth-callback?code=…` y el sistema despierta la
 * aplicación con esa URL.
 *
 * Hay **dos** caminos por los que puede llegar, y hay que atender los dos:
 *
 * - `onOpenUrl` avisa cuando la aplicación ya está viva y recibe el enlace.
 *   Es lo normal en Windows, donde el plugin de instancia única garantiza que
 *   la app siga en marcha detrás del navegador.
 * - `getCurrent` devuelve el enlace **con el que se arrancó la aplicación**.
 *   Esto es lo que faltaba, y es justo el caso de Android: mientras el usuario
 *   está en el navegador, el sistema mata la aplicación en segundo plano —los
 *   móviles lo hacen a la primera de cambio— y el enlace de vuelta la arranca
 *   de cero. Entonces `onOpenUrl` no llega a dispararse nunca, porque el aviso
 *   se emitió antes de que existiera nadie escuchando. El login se quedaba a
 *   medias sin decir nada.
 */
let escuchando = false

/** Códigos ya procesados: `exchangeCodeForSession` solo funciona una vez. */
const procesados = new Set<string>()

async function procesar(url: string) {
  if (!url.startsWith('writeflow://')) return
  if (procesados.has(url)) return
  procesados.add(url)
  try {
    const session = await completeAuth(url)
    useApp.getState().set({
      signedIn: Boolean(session),
      userEmail: session?.user.email ?? null,
    })
    useApp.getState().notify('ok', `Sesión iniciada como ${session?.user.email ?? 'usuario'}`)
  } catch (e) {
    useApp.getState().notify('error', e instanceof Error ? e.message : String(e))
  }
}

export async function listenForAuthCallback() {
  if (escuchando) return
  escuchando = true
  try {
    // Primero el enlace de arranque, si lo hay. Antes que el oyente: si la app
    // se abrió por el enlace, ya está esperando y no va a llegar ningún aviso.
    const iniciales = await getCurrent()
    for (const url of iniciales ?? []) await procesar(url)

    await onOpenUrl(async (urls) => {
      for (const url of urls) await procesar(url)
    })
  } catch {
    // En desarrollo web (npm run dev sin Tauri) el plugin no existe.
    escuchando = false
  }
}
