import type { JSONContent } from '@tiptap/react'

/** Extrae texto plano de un documento TipTap (para búsqueda y recuento). */
export function docToText(doc: JSONContent | null | undefined): string {
  if (!doc) return ''
  const out: string[] = []
  const walk = (n: JSONContent) => {
    if (n.type === 'text' && n.text) out.push(n.text)
    if (n.type === 'hardBreak') out.push('\n')
    if (Array.isArray(n.content)) {
      n.content.forEach(walk)
      // separa bloques con salto de línea
      if (n.type && ['paragraph', 'heading', 'listItem', 'blockquote'].includes(n.type)) out.push('\n')
    }
  }
  walk(doc)
  return out.join('').replace(/\n{3,}/g, '\n\n').trim()
}

export function countWords(text: string): number {
  const t = text.trim()
  if (!t) return 0
  return t.split(/\s+/).filter(Boolean).length
}

export function countChars(text: string): number {
  return text.length
}

/** Minutos de lectura aproximados (200 ppm). */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 200))
}

export function excerpt(text: string, max = 180): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length <= max ? clean : clean.slice(0, max - 1).trimEnd() + '…'
}

export function parseDoc(json: string): JSONContent | null {
  if (!json) return null
  try {
    return JSON.parse(json) as JSONContent
  } catch {
    return null
  }
}

/** Documento TipTap vacío pero válido. */
export const EMPTY_DOC: JSONContent = { type: 'doc', content: [{ type: 'paragraph' }] }

/** Convierte texto plano en un documento TipTap (un párrafo por línea). */
export function textToDoc(text: string): JSONContent {
  const paras = text.split(/\n{2,}/).filter((p) => p.trim())
  if (!paras.length) return EMPTY_DOC
  return {
    type: 'doc',
    content: paras.map((p) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: p.trim() }],
    })),
  }
}
