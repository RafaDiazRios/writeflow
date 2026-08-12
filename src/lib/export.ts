import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import type { JSONContent } from '@tiptap/react'
import { docs, projects } from './repo'
import { parseDoc } from './text'

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
