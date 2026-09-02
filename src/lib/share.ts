// `invocar` es `invoke` con los errores del backend traducidos (ver nativo.ts).
import { invocar as invoke } from './nativo'
import { isNativeMobile } from './platform'

/**
 * Salida de archivos en Android.
 *
 * En Windows exportar termina en un diálogo «guardar como». En Android ese
 * diálogo no existe: el archivo se entrega al **menú de compartir** del sistema
 * y es el usuario quien elige destino —Drive, correo, «Guardar en Archivos»— o
 * a qué aplicación se lo manda.
 *
 * Esto no es un apaño: es cómo salen los archivos de cualquier aplicación
 * Android. La diferencia práctica es que no hay una ruta que enseñar después,
 * así que la interfaz no promete ninguna.
 */

const MIME: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  epub: 'application/epub+zip',
  md: 'text/markdown',
  html: 'text/html',
  txt: 'text/plain',
  png: 'image/png',
  jpg: 'image/jpeg',
}

export function mimeDe(ext: string): string {
  return MIME[ext.toLowerCase().replace(/^\./, '')] ?? 'application/octet-stream'
}

/** Añade la extensión si el nombre no la trae ya. */
export function conExtension(nombre: string, ext: string): string {
  const limpio = ext.replace(/^\./, '')
  return nombre.toLowerCase().endsWith(`.${limpio}`) ? nombre : `${nombre}.${limpio}`
}

/**
 * Escribe el archivo en la caché privada y abre el selector de Android.
 *
 * Devuelve `true` si el selector llegó a abrirse. No hay forma de saber qué
 * hizo el usuario después —el sistema no lo cuenta—, así que la interfaz no
 * debe afirmar que el archivo «se guardó»: solo que se envió.
 */
export async function compartirArchivo(
  nombre: string,
  datos: Uint8Array,
  ext: string,
): Promise<boolean> {
  await invoke('compartir_archivo', {
    nombre: conExtension(nombre, ext),
    mime: mimeDe(ext),
    // Tauri serializa Vec<u8> desde un array de números.
    datos: Array.from(datos),
  })
  return true
}

/** Igual, para contenido de texto. */
export async function compartirTexto(nombre: string, contenido: string, ext: string) {
  return compartirArchivo(nombre, new TextEncoder().encode(contenido), ext)
}

/** `true` cuando la salida de archivos tiene que ir por el menú de compartir. */
export async function salidaPorCompartir(): Promise<boolean> {
  return isNativeMobile()
}
