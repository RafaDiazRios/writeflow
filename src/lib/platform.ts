import { useEffect, useState } from 'react'

/**
 * Detección de plataforma.
 *
 * Se combinan dos señales a propósito: el sistema operativo (para saber si esto es
 * un móvil de verdad) y el ancho de la ventana (para poder desarrollar y probar la
 * interfaz móvil en el navegador del escritorio sin compilar para Android).
 */

export type Platform = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'unknown'

let cached: Platform | null = null

export async function detectPlatform(): Promise<Platform> {
  if (cached) return cached
  try {
    const { platform } = await import('@tauri-apps/plugin-os')
    cached = platform() as Platform
  } catch {
    // Navegador normal (o el plugin no está disponible): se deduce del user agent.
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    cached = /android/i.test(ua) ? 'android' : /iphone|ipad/i.test(ua) ? 'ios' : 'unknown'
  }
  return cached
}

export function isMobilePlatform(p: Platform) {
  return p === 'android' || p === 'ios'
}

/** Ancho por debajo del cual la interfaz de escritorio deja de caber. */
export const MOBILE_BREAKPOINT = 820

/**
 * `true` cuando hay que dibujar la interfaz táctil: en Android y iOS siempre, y en
 * escritorio cuando la ventana es estrecha.
 */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT,
  )
  const [nativeMobile, setNativeMobile] = useState(false)

  useEffect(() => {
    detectPlatform().then((p) => setNativeMobile(isMobilePlatform(p)))
    const onResize = () => setMobile(window.innerWidth < MOBILE_BREAKPOINT)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return nativeMobile || mobile
}

/** Para decisiones puntuales fuera de React. */
export async function isNativeMobile(): Promise<boolean> {
  return isMobilePlatform(await detectPlatform())
}
