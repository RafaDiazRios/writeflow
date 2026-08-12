import { save } from '@tauri-apps/plugin-dialog'
import { writeFile, writeTextFile } from '@tauri-apps/plugin-fs'
import type { JSONContent } from '@tiptap/react'
import { docs, journal, projects } from './repo'
import { parseDoc, textToDoc } from './text'
import type { DocxChapter, DocxStyle } from './docx'
import type { EpubChapter } from './epub'
import { longDate } from './dates'

/** Convierte un documento TipTap a Markdown legible. */
export function docToMarkdown(doc: JSONContent | null): string {
  if (!doc) return ''
  const out: string[] = []

  const inline = (nodes: JSONContent[] | undefined): string =>
    (nodes ?? [])
      .map((n) => {
        if (n.type === 'hardBreak') return '  \n'
        if (n.type === 'image') return `![](${n.attrs?.src ?? ''})`
        let t = n.text ?? ''
        for (const m of n.marks ?? []) {
          if (m.type === 'bold') t = `**${t}**`
          else if (m.type === 'italic') t = `*${t}*`
          else if (m.type === 'strike') t = `~~${t}~~`
          else if (m.type === 'code') t = `\`${t}\``
          else if (m.type === 'underline') t = `<u>${t}</u>`
          else if (m.type === 'highlight') t = `==${t}==`
          else if (m.type === 'link') t = `[${t}](${m.attrs?.href ?? ''})`
        }
        return t
      })
      .join('')

  const block = (n: JSONContent, depth = 0): void => {
    switch (n.type) {
      case 'heading':
        out.push(`${'#'.repeat(Number(n.attrs?.level ?? 1))} ${inline(n.content)}\n`)
        break
      case 'paragraph':
        out.push(`${inline(n.content)}\n`)
        break
      case 'blockquote':
        n.content?.forEach((c) => out.push(`> ${inline(c.content)}\n`))
        break
      case 'codeBlock':
        out.push('```\n' + inline(n.content) + '\n```\n')
        break
      case 'horizontalRule':
        out.push('---\n')
        break
      case 'bulletList':
        n.content?.forEach((li) =>
          li.content?.forEach((p) => out.push(`${'  '.repeat(depth)}- ${inline(p.content)}\n`)),
        )
        break
      case 'orderedList':
        n.content?.forEach((li, i) =>
          li.content?.forEach((p) => out.push(`${'  '.repeat(depth)}${i + 1}. ${inline(p.content)}\n`)),
        )
        break
      case 'taskList':
        n.content?.forEach((li) =>
          li.content?.forEach((p) =>
            out.push(`- [${li.attrs?.checked ? 'x' : ' '}] ${inline(p.content)}\n`),
          ),
        )
        break
      default:
        n.content?.forEach((c) => block(c, depth))
    }
  }

  doc.content?.forEach((n) => {
    block(n)
    out.push('\n')
  })
  return out.join('').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/** Compila el manuscrito completo de un proyecto en un único Markdown. */
export async function compileProject(projectId: string): Promise<string> {
  const p = await projects.byId(projectId)
  const all = await docs.forProject(projectId)

  const byParent = new Map<string, typeof all>()
  for (const d of all) {
    const k = d.parent_id ?? '__root__'
    if (!byParent.has(k)) byParent.set(k, [])
    byParent.get(k)!.push(d)
  }
  for (const list of byParent.values()) list.sort((a, b) => a.position - b.position)

  const parts: string[] = [`# ${p?.title ?? 'Manuscrito'}\n`]
  if (p?.subtitle) parts.push(`*${p.subtitle}*\n`)
  if (p?.author) parts.push(`\n${p.author}\n`)
  parts.push('\n---\n')

  const walk = (key: string, depth: number) => {
    for (const d of byParent.get(key) ?? []) {
      if (d.in_compile !== 1 || d.kind === 'note' || d.kind === 'research') continue
      const isFolder = d.kind === 'folder' || d.kind === 'chapter'
      if (isFolder) parts.push(`\n${'#'.repeat(Math.min(6, depth + 2))} ${d.title}\n`)
      const body = docToMarkdown(parseDoc(d.content_json))
      if (body.trim()) {
        if (!isFolder && d.title) parts.push(`\n${'#'.repeat(Math.min(6, depth + 2))} ${d.title}\n`)
        parts.push(`\n${body}\n`)
      }
      walk(d.id, depth + 1)
    }
  }
  walk('__root__', 0)
  return parts.join('')
}

/** Guarda texto en el disco del usuario con el diálogo nativo de Windows. */
export async function saveTextFile(defaultName: string, contents: string, ext = 'md') {
  const path = await save({
    defaultPath: defaultName,
    filters: [
      { name: ext === 'md' ? 'Markdown' : 'Texto', extensions: [ext] },
      { name: 'Todos', extensions: ['*'] },
    ],
  })
  if (!path) return null
  await writeTextFile(path, contents)
  return path
}

const FILTER_NAME: Record<string, string> = {
  docx: 'Documento de Word',
  epub: 'Libro electrónico EPUB',
}

/** Guarda un archivo binario (.docx, .epub) con el diálogo nativo. */
export async function saveBinaryFile(defaultName: string, bytes: Uint8Array, ext: string) {
  const path = await save({
    defaultPath: defaultName,
    filters: [{ name: FILTER_NAME[ext] ?? ext.toUpperCase(), extensions: [ext] }],
  })
  if (!path) return null
  await writeFile(path, bytes)
  return path
}

// ─────────────────── capítulos a partir del binder ───────────────────

export interface ChapterSource {
  title: string
  doc: JSONContent | null
  level: 1 | 2 | 3
  hasText: boolean
}

/**
 * Recorre el árbol del proyecto en el orden en que se lee y devuelve la lista
 * plana de capítulos que hay que verter en el .docx o el .epub.
 *
 * Respeta «Incluir al compilar» y salta notas e investigación: eso es material de
 * trabajo, no forma parte del libro.
 */
export async function projectChapters(projectId: string): Promise<ChapterSource[]> {
  const all = await docs.forProject(projectId)
  const byParent = new Map<string, typeof all>()
  for (const d of all) {
    const k = d.parent_id ?? '__root__'
    if (!byParent.has(k)) byParent.set(k, [])
    byParent.get(k)!.push(d)
  }
  for (const list of byParent.values()) list.sort((a, b) => a.position - b.position)

  const out: ChapterSource[] = []
  const walk = (key: string, depth: number) => {
    for (const d of byParent.get(key) ?? []) {
      if (d.in_compile !== 1 || d.kind === 'note' || d.kind === 'research') continue
      const doc = parseDoc(d.content_json)
      const hasText = Boolean(d.content_text?.trim())
      const isFolder = d.kind === 'folder' || d.kind === 'chapter'
      // Una carpeta sin texto propio aporta solo su título como encabezado.
      if (isFolder || hasText) {
        out.push({
          title: d.title,
          doc: hasText ? doc : null,
          level: (Math.min(3, depth + 1) as 1 | 2 | 3),
          hasText,
        })
      }
      walk(d.id, depth + 1)
    }
  }
  walk('__root__', 0)
  return out
}

// ─────────────────── .docx ───────────────────
//
// `docx` y `jszip` pesan bastante y solo hacen falta al exportar, así que se
// cargan bajo demanda: la app arranca sin ellos.

const loadDocx = () => import('./docx')
const loadEpub = () => import('./epub')

export async function exportProjectDocx(projectId: string, style: DocxStyle = 'libro') {
  const p = await projects.byId(projectId)
  if (!p) throw new Error('No se encontró el proyecto')
  const chapters = await projectChapters(projectId)
  if (!chapters.length) throw new Error('Este proyecto todavía no tiene nada escrito')

  const words = await projects.wordCount(projectId)
  const { buildDocx } = await loadDocx()
  const bytes = await buildDocx({
    title: p.title,
    subtitle: p.subtitle,
    author: p.author,
    style,
    titlePage: true,
    wordCount: words,
    chapters: chapters.map<DocxChapter>((c) => ({
      title: c.title,
      doc: c.doc,
      level: c.level,
      // En «libro» solo los capítulos de primer nivel abren página nueva.
      pageBreak: style === 'manuscrito' ? true : c.level === 1,
    })),
  })
  return saveBinaryFile(`${p.title}.docx`, bytes, 'docx')
}

/** Exporta un rango del diario como un único documento por días. */
export async function exportJournalDocx(from: string, to: string, style: DocxStyle = 'libro') {
  const entries = (await journal.recent(2000)).filter(
    (e) => e.entry_date >= from && e.entry_date <= to,
  )
  if (!entries.length) throw new Error('No hay entradas en ese periodo')
  entries.sort((a, b) => a.entry_date.localeCompare(b.entry_date))

  const chapters: DocxChapter[] = entries.map((e) => ({
    title: `${longDate(e.entry_date)}${e.title ? ` — ${e.title}` : ''}`,
    doc: parseDoc(e.content_json) ?? textToDoc(e.content_text),
    level: 2,
    pageBreak: false,
  }))

  const { buildDocx } = await loadDocx()
  const bytes = await buildDocx({
    title: 'Diario',
    subtitle: `${from} — ${to}`,
    style,
    titlePage: true,
    chapters,
  })
  return saveBinaryFile(`Diario ${from} a ${to}.docx`, bytes, 'docx')
}

// ─────────────────── .epub ───────────────────

export async function exportProjectEpub(projectId: string) {
  const p = await projects.byId(projectId)
  if (!p) throw new Error('No se encontró el proyecto')
  const chapters = await projectChapters(projectId)
  if (!chapters.length) throw new Error('Este proyecto todavía no tiene nada escrito')

  const { buildEpub } = await loadEpub()
  const bytes = await buildEpub({
    title: p.title,
    subtitle: p.subtitle,
    author: p.author,
    language: 'es',
    chapters: chapters.map<EpubChapter>((c) => ({ title: c.title, doc: c.doc })),
  })
  return saveBinaryFile(`${p.title}.epub`, bytes, 'epub')
}

/** Exporta a HTML (se puede abrir en Word y guardar como .docx). */
export function markdownToStyledHtml(title: string, markdown: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = markdown
    .split('\n')
    .map((line) => {
      const h = /^(#{1,6})\s+(.*)$/.exec(line)
      if (h) return `<h${h[1].length}>${esc(h[2])}</h${h[1].length}>`
      if (/^---$/.test(line)) return '<hr/>'
      if (/^>\s?/.test(line)) return `<blockquote>${esc(line.replace(/^>\s?/, ''))}</blockquote>`
      if (!line.trim()) return ''
      return `<p>${esc(line)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')}</p>`
    })
    .join('\n')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font-family:Georgia,serif;font-size:12pt;line-height:1.6;max-width:17cm;margin:2.5cm auto}
h1,h2,h3{font-family:'Segoe UI',sans-serif} blockquote{border-left:3px solid #ccc;padding-left:1em;color:#555}</style>
</head><body>${html}</body></html>`
}
