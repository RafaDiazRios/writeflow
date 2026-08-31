import { useApp } from '@/store/app'
import { t as traducir } from './index'

/**
 * `t` para componentes. Se suscribe a `uiLang` en el store, así que cambiar el
 * idioma en Ajustes vuelve a pintar toda la interfaz sin recargar la ventana.
 *
 * Fuera de React (los mensajes de error de `lib/`) se importa `t` directamente
 * de `@/i18n`, que lee el idioma del módulo.
 */
export function useT() {
  useApp((s) => s.uiLang)
  return traducir
}
