import { invoke } from '@tauri-apps/api/core'
import { getMeta, setMeta } from './db'

/**
 * Cifrado extremo a extremo.
 *
 * La frase de paso no se guarda en ningún sitio. Al abrir la app se pide una vez
 * (o se recuerda en memoria durante la sesión) y de ella se deriva la clave con
 * Argon2id en Rust. Solo el contenido viaja cifrado a Supabase; las fechas y
 * contadores viajan en claro para poder ordenar y paginar en el servidor.
 */

const SALT_KEY = 'e2e_salt'
const FP_KEY = 'e2e_fingerprint'
const ENABLED_KEY = 'e2e_enabled'

/** Clave de sesión. Vive solo en memoria: nunca se persiste. */
let sessionKey: string | null = null

export function isUnlocked() {
  return sessionKey !== null
}

export function lock() {
  sessionKey = null
}

export async function isE2EConfigured(): Promise<boolean> {
  return (await getMeta(SALT_KEY)) !== null
}

export async function isE2EEnabled(): Promise<boolean> {
  return (await getMeta(ENABLED_KEY)) === '1'
}

/** Primera vez: crea la sal, deriva la clave y guarda la huella de verificación. */
export async function setupPassphrase(passphrase: string): Promise<void> {
  if (passphrase.length < 10) throw new Error('La frase de paso debe tener al menos 10 caracteres')
  const salt = await invoke<string>('crypto_new_salt')
  const key = await invoke<string>('crypto_derive_key', { passphrase, saltB64: salt })
  const fp = await invoke<string>('crypto_key_fingerprint', { keyB64: key })
  await setMeta(SALT_KEY, salt)
  await setMeta(FP_KEY, fp)
  await setMeta(ENABLED_KEY, '1')
  sessionKey = key
}

/** Desbloqueo en arranques posteriores (o en un ordenador nuevo). */
export async function unlock(passphrase: string): Promise<void> {
  const salt = await getMeta(SALT_KEY)
  if (!salt) throw new Error('Este dispositivo aún no tiene cifrado configurado')
  const key = await invoke<string>('crypto_derive_key', { passphrase, saltB64: salt })
  const fp = await invoke<string>('crypto_key_fingerprint', { keyB64: key })
  const stored = await getMeta(FP_KEY)
  if (stored && stored !== fp) throw new Error('Frase de paso incorrecta')
  sessionKey = key
}

/**
 * Adopta la sal y la huella que ya están en el servidor.
 *
 * Esto es lo que hace que la misma frase de paso produzca la **misma clave** en
 * dos ordenadores. La clave no sale solo de la frase: sale de la frase más una
 * sal aleatoria. Si cada equipo se inventa la suya, las dos claves son distintas
 * y ninguno puede leer lo del otro, aunque el usuario haya escrito lo mismo.
 *
 * Sal y huella son **públicas por diseño**: la sal solo evita que una tabla
 * precalculada sirva para varias personas, y la huella es un hash de la clave
 * que permite comprobar si la frase es correcta sin guardar la frase.
 *
 * Se pasa la frase de paso para volver a derivar aquí mismo y **verificar contra
 * la huella del servidor**: si no cuadra, no se toca nada. Así un error de
 * escritura no deja el equipo con material de clave que no corresponde.
 */
export async function adoptRemoteKeyMaterial(
  salt: string,
  fingerprint: string,
  passphrase: string,
): Promise<void> {
  const key = await invoke<string>('crypto_derive_key', { passphrase, saltB64: salt })
  const fp = await invoke<string>('crypto_key_fingerprint', { keyB64: key })
  if (fp !== fingerprint) {
    throw new Error(
      'Esa frase de paso no corresponde a la del resto de tus equipos. ' +
        'Escribe la que usaste al configurar el cifrado la primera vez.',
    )
  }
  await setMeta(SALT_KEY, salt)
  await setMeta(FP_KEY, fp)
  await setMeta(ENABLED_KEY, '1')
  sessionKey = key
}

/** Huella de la clave con la que está trabajando esta sesión. */
export async function localFingerprint(): Promise<string | null> {
  return getMeta(FP_KEY)
}

export async function keyMaterial(): Promise<{ salt: string | null; fingerprint: string | null }> {
  return { salt: await getMeta(SALT_KEY), fingerprint: await getMeta(FP_KEY) }
}

export async function encrypt(plaintext: string): Promise<string> {
  if (!sessionKey) throw new Error('El almacén cifrado está bloqueado')
  if (!plaintext) return ''
  return invoke<string>('crypto_encrypt', { keyB64: sessionKey, plaintext })
}

export async function decrypt(payload: string): Promise<string> {
  if (!sessionKey) throw new Error('El almacén cifrado está bloqueado')
  if (!payload) return ''
  return invoke<string>('crypto_decrypt', { keyB64: sessionKey, payload })
}

/** Cifra si el módulo lo requiere; si no, devuelve el texto tal cual. */
export async function maybeEncrypt(plaintext: string, sensitive: boolean): Promise<string> {
  if (!sensitive) return plaintext
  return encrypt(plaintext)
}

export async function maybeDecrypt(payload: string, sensitive: boolean): Promise<string> {
  if (!sensitive) return payload
  if (!payload.startsWith('wf1.')) return payload // dato antiguo sin cifrar
  return decrypt(payload)
}
