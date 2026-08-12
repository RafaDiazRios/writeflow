import { onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { completeAuth } from './supabase'
import { useApp } from '@/store/app'

/**
 * Login con Google en escritorio.
 *
 * El navegador del sistema abre la pantalla de Google; al terminar, Supabase
 * redirige a `writeflow://auth-callback?code=…`, Windows despierta la app y
 * aquí se canjea el código por la sesión (flujo PKCE).
 */
let listening = false

export async function listenForAuthCallback() {
  if (listening) return
  listening = true
  try {
    await onOpenUrl(async (urls) => {
      for (const url of urls) {
        if (!url.startsWith('writeflow://')) continue
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
    })
  } catch {
    // En desarrollo web (npm run dev sin Tauri) el plugin no existe: no pasa nada.
    listening = false
  }
}
