/**
 * Imágenes dentro del texto.
 *
 * ## Por qué van incrustadas y no como archivos aparte
 *
 * La tentación es guardar cada imagen en una carpeta y dejar una ruta en el
 * documento. Es lo que hace un procesador de textos de escritorio, y aquí sería
 * un error: WriteFlow sincroniza documentos, no carpetas. Una ruta local no
 * significa nada en el móvil, y el capítulo con la foto de la casa del abuelo se
 * vería roto justo en el dispositivo donde se prometió poder leerlo.
 *
 * Así que la imagen viaja **dentro** del documento, como data URL. El documento
 * es JSON, se cifra igual, se sincroniza igual y se exporta igual; no hay un
 * segundo canal de sincronización que mantener ni rutas que se rompan al mover
 * la base de datos.
 *
 * ## El precio, y cómo se paga
 *
 * Base64 abulta un tercio, y una foto de móvil moderna son cuatro megas. Sin
 * más, meter tres fotos en un capítulo dejaría el documento en dieciséis megas
 * de JSON: lento de cifrar, lento de subir, absurdo para lo que se pide.
 *
 * Por eso toda imagen se reescala al entrar: 1600 px de lado mayor y JPEG de
 * calidad 0,82. Esa misma foto baja a unos 250 KB sin diferencia visible en
 * pantalla ni al imprimir un .docx. Los PNG con transparencia se conservan como
 * PNG, porque convertirlos a JPEG les pondría un fondo negro.
 *
 * 1600 px no es un número redondo por casualidad: es lo que cabe con holgura en
 * el ancho de una página A4 a 300 ppp (unos 2480 px de página, con márgenes) y
 * el doble de lo que necesita cualquier pantalla para mostrarla a página
 * completa.
 */

/** Lado mayor tras el reescalado. */
export const MAX_LADO = 1600

/** Calidad JPEG. Por encima de 0,85 el archivo crece mucho y no se nota. */
export const CALIDAD_JPEG = 0.82

/** Tamaño a partir del cual se avisa de que la imagen es enorme. */
export const AVISO_BYTES = 3 * 1024 * 1024

export const TIPOS_ACEPTADOS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif']

/** ¿Merece la pena reescalar, o ya es pequeña? */
function hayQueEncoger(ancho: number, alto: number) {
  return Math.max(ancho, alto) > MAX_LADO
}

/**
 * Comprueba si el PNG tiene píxeles no opacos.
 *
 * Se mira el canal alfa de una muestra, no de todos los píxeles: para decidir el
 * formato de salida basta con encontrar un solo píxel transparente, y recorrer
 * doce millones de valores para eso sería tirar el tiempo.
 */
function tieneTransparencia(ctx: CanvasRenderingContext2D, ancho: number, alto: number): boolean {
  try {
    const datos = ctx.getImageData(0, 0, ancho, alto).data
    const salto = Math.max(4, Math.floor(datos.length / 4 / 20000) * 4)
    for (let i = 3; i < datos.length; i += salto) if (datos[i] < 250) return true
    return false
  } catch {
    // getImageData puede fallar si el lienzo quedó «contaminado». Ante la duda,
    // se conserva la transparencia: un PNG de más pesa; un fondo negro molesta.
    return true
  }
}

function cargar(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('No se pudo leer la imagen. ¿Seguro que el archivo es una imagen?'))
    }
    img.src = url
  })
}

export interface ImagenPreparada {
  /** `data:image/…;base64,…`, listo para el atributo `src`. */
  src: string
  ancho: number
  alto: number
  bytes: number
}

/**
 * Reescala y recodifica una imagen para incrustarla en un documento.
 *
 * Los GIF se dejan intactos: pasarlos por un lienzo se quedaría con el primer
 * fotograma y perdería la animación, que es justo lo que hace que alguien meta
 * un GIF.
 */
export async function prepararImagen(blob: Blob): Promise<ImagenPreparada> {
  if (blob.type === 'image/gif') {
    const src = await comoDataUrl(blob)
    const img = await cargar(blob).catch(() => null)
    return { src, ancho: img?.naturalWidth ?? 0, alto: img?.naturalHeight ?? 0, bytes: blob.size }
  }

  const img = await cargar(blob)
  const anchoOriginal = img.naturalWidth || 1
  const altoOriginal = img.naturalHeight || 1
  const escala = hayQueEncoger(anchoOriginal, altoOriginal)
    ? MAX_LADO / Math.max(anchoOriginal, altoOriginal)
    : 1
  const ancho = Math.max(1, Math.round(anchoOriginal * escala))
  const alto = Math.max(1, Math.round(altoOriginal * escala))

  const lienzo = document.createElement('canvas')
  lienzo.width = ancho
  lienzo.height = alto
  const ctx = lienzo.getContext('2d')
  if (!ctx) throw new Error('El navegador no permite procesar imágenes aquí')
  ctx.drawImage(img, 0, 0, ancho, alto)

  const conservarPng = blob.type === 'image/png' && tieneTransparencia(ctx, ancho, alto)
  const src = conservarPng
    ? lienzo.toDataURL('image/png')
    : lienzo.toDataURL('image/jpeg', CALIDAD_JPEG)

  return { src, ancho, alto, bytes: Math.round((src.length - src.indexOf(',') - 1) * 0.75) }
}

/** Lee un blob entero como data URL, sin tocarlo. */
export function comoDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader()
    lector.onload = () => resolve(String(lector.result))
    lector.onerror = () => reject(new Error('No se pudo leer el archivo'))
    lector.readAsDataURL(blob)
  })
}

function tipoPorExtension(ruta: string): string {
  const ext = ruta.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'svg') return 'image/svg+xml'
  return `image/${ext || 'png'}`
}

/**
 * Abre el selector de archivos del sistema y devuelve la imagen ya preparada.
 *
 * En Android el mismo diálogo abre la galería, así que no hace falta nada
 * distinto para el móvil. Devuelve `null` si el usuario cancela.
 */
export async function elegirImagenDelDisco(): Promise<ImagenPreparada | null> {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const { readFile } = await import('@tauri-apps/plugin-fs')
    const elegido = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Imágenes', extensions: TIPOS_ACEPTADOS }],
    })
    if (!elegido || typeof elegido !== 'string') return null
    const bytes = await readFile(elegido)
    // `readFile` devuelve un Uint8Array sobre un búfer que puede ser mayor; se
    // copia el trozo exacto para no arrastrar basura al Blob.
    const copia = new Uint8Array(bytes)
    return prepararImagen(new Blob([copia], { type: tipoPorExtension(elegido) }))
  } catch (e) {
    // Fuera de Tauri (navegador de desarrollo) se cae al input de archivos.
    if (typeof document === 'undefined') throw e
    return elegirConInput()
  }
}

/** Alternativa en navegador puro, para poder probar la interfaz sin compilar. */
function elegirConInput(): Promise<ImagenPreparada | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const f = input.files?.[0]
      if (!f) return resolve(null)
      prepararImagen(f).then(resolve, reject)
    }
    // Si el usuario cancela no salta ningún evento fiable en todos los
    // navegadores; la promesa se queda pendiente y se recoge con la pestaña.
    input.click()
  })
}

/** Saca los archivos de imagen de un portapapeles o de un arrastre. */
export function imagenesDe(datos: DataTransfer | null): File[] {
  if (!datos) return []
  const salida: File[] = []
  for (const item of Array.from(datos.files ?? [])) {
    if (item.type.startsWith('image/')) salida.push(item)
  }
  if (salida.length === 0) {
    for (const item of Array.from(datos.items ?? [])) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile()
        if (f) salida.push(f)
      }
    }
  }
  return salida
}
