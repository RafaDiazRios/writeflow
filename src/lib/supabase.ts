import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js'
import { getMeta, setMeta } from './db'
import { t } from '@/i18n'

/**
 * Cliente de Supabase. Es OPCIONAL: si no hay credenciales configuradas la app
 * funciona en modo puramente local. Las credenciales pueden venir del `.env`
 * (build) o guardarse desde Ajustes (tabla `meta`), útil si prefieres no
 * incrustarlas en el binario.
 */

let client: SupabaseClient | null = null
let currentUrl = ''
let currentKey = ''

export const REDIRECT_URL = 'writeflow://auth-callback'

export async function getCredentials(): Promise<{ url: string; key: string }> {
  const url = (await getMeta('supabase_url')) || import.meta.env.VITE_SUPABASE_URL || ''
  const key = (await getMeta('supabase_anon_key')) || import.meta.env.VITE_SUPABASE_ANON_KEY || ''
  return { url, key }
}

export async function saveCredentials(url: string, key: string) {
  await setMeta('supabase_url', url.trim())
  await setMeta('supabase_anon_key', key.trim())
  client = null
}

export async function supabase(): Promise<SupabaseClient | null> {
  const { url, key } = await getCredentials()
  if (!url || !key) return null
  if (client && url === currentUrl && key === currentKey) return client
  currentUrl = url
  currentKey = key
  client = createClient(url, key, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: false, // en escritorio lo gestionamos con el deep link
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'writeflow-auth',
    },
  })
  return client
}

export async function isCloudConfigured(): Promise<boolean> {
  const { url, key } = await getCredentials()
  return Boolean(url && key)
}

export async function getSession(): Promise<Session | null> {
  const sb = await supabase()
  if (!sb) return null
  const { data } = await sb.auth.getSession()
  return data.session
}

/** Devuelve la URL de Google a la que hay que enviar al usuario. */
export async function googleAuthUrl(): Promise<string> {
  const sb = await supabase()
  if (!sb) throw new Error('Configura primero la URL y la clave de Supabase en Ajustes')
  const { data, error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: REDIRECT_URL,
      skipBrowserRedirect: true,
      queryParams: { access_type: 'offline', prompt: 'consent' },
    },
  })
  if (error) throw error
  if (!data.url) throw new Error(t('error.sinUrlAuth'))
  return data.url
}

/** Completa el login con el `code` que llega por el deep link writeflow://. */
export async function completeAuth(callbackUrl: string): Promise<Session | null> {
  const sb = await supabase()
  if (!sb) return null
  const u = new URL(callbackUrl)
  const code = u.searchParams.get('code')
  const errDesc = u.searchParams.get('error_description')
  if (errDesc) throw new Error(errDesc)
  if (!code) throw new Error(t('error.sinCodigo'))
  const { data, error } = await sb.auth.exchangeCodeForSession(code)
  if (error) throw error
  return data.session
}

export async function signOut() {
  const sb = await supabase()
  await sb?.auth.signOut()
}
