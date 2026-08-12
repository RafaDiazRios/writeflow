import JSZip from 'jszip'
import type { JSONContent } from '@tiptap/react'

/**
 * Generador de EPUB 3 (con tabla de contenidos EPUB 2 para lectores antiguos).
 *
 * Se construye a mano con JSZip porque las librerías de EPUB al uso son de Node y
 * aquí todo corre dentro del WebView: así el export funciona sin conexión y sin
 * depender del backend.
 */

export interface EpubChapter {
  title: string
  doc?: JSONContent | null
  text?: string
}

export interface EpubOptions {
  title: string
  author?: string | null
  subtitle?: string | null
  language?: string
  chapters: EpubChapter[]
  /** Identificador único; si no se pasa se genera uno. */
  identifier?: string
  /** Fecha de publicación en ISO. */
  published?: string
}

const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

// ─────────────────── TipTap → XHTML ───────────────────

function inlineToXhtml(nodes: JSONContent[] | undefined): string {
  let out = ''
  for (const n of nodes ?? []) {
    if (n.type === 'hardBreak') {
      out += '<br/>'
      continue
    }
    if (n.type === 'image' && typeof n.attrs?.src === 'string') {
      out += `<img src="${esc(String(n.attrs.src))}" alt="${esc(String(n.attrs.alt ?? ''))}"/>`
      continue
    }
    if (n.type !== 'text' || !n.text) continue

    let t = esc(n.text)
    let href: string | null = null
    for (const m of n.marks ?? []) {
      switch (m.type) {
        case 'bold': t = `<strong>${t}</strong>`; break
        case 'italic': t = `<em>${t}</em>`; break
        case 'underline': t = `<span class="u">${t}</span>`; break
        case 'strike': t = `<s>${t}</s>`; break
        case 'code': t = `<code>${t}</code>`; break
        case 'highlight': t = `<mark>${t}</mark>`; break
        case 'superscript': t = `<sup>${t}</sup>`; break
        case 'subscript': t = `<sub>${t}</sub>`; break
        case 'link':
          if (typeof m.attrs?.href === 'string') href = m.attrs.href
          break
      }
    }
    out += href ? `<a href="${esc(href)}">${t}</a>` : t
  }
  return out
}

function alignAttr(node: JSONContent): string {
  const a = node.attrs?.textAlign
  return a && a !== 'left' ? ` class="ta-${a}"` : ''
}

function blockToXhtml(node: JSONContent, depth = 0): string {
  switch (node.type) {
    case 'paragraph': {
      const inner = inlineToXhtml(node.content)
      return inner ? `<p${alignAttr(node)}>${inner}</p>\n` : '<p class="blank"> </p>\n'
    }
    case 'heading': {
      const l = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 2) + 1))
      return `<h${l}${alignAttr(node)}>${inlineToXhtml(node.content)}</h${l}>\n`
    }
    case 'blockquote':
      return `<blockquote>\n${(node.content ?? []).map((c) => blockToXhtml(c, depth)).join('')}</blockquote>\n`
    case 'bulletList':
    case 'orderedList': {
      const tag = node.type === 'bulletList' ? 'ul' : 'ol'
      const items = (node.content ?? [])
        .map((li) => `<li>${(li.content ?? []).map((c) => blockToXhtml(c, depth + 1)).join('')}</li>\n`)
        .join('')
      return `<${tag}>\n${items}</${tag}>\n`
    }
    case 'taskList': {
      const items = (node.content ?? [])
        .map(
          (li) =>
            `<li>${li.attrs?.checked ? '☑' : '☐'} ${(li.content ?? [])
              .map((c) => inlineToXhtml(c.content))
              .join('')}</li>\n`,
        )
        .join('')
      return `<ul class="tasks">\n${items}</ul>\n`
    }
    case 'codeBlock':
      return `<pre><code>${esc((node.content ?? []).map((c) => c.text ?? '').join(''))}</code></pre>\n`
    case 'horizontalRule':
      return '<hr/>\n'
    case 'image':
      return typeof node.attrs?.src === 'string'
        ? `<p class="figure"><img src="${esc(String(node.attrs.src))}" alt=""/></p>\n`
        : ''
    case 'table': {
      const rows = (node.content ?? [])
        .map((tr) => {
          const cells = (tr.content ?? [])
            .map((td) => {
              const tag = td.type === 'tableHeader' ? 'th' : 'td'
              const inner = (td.content ?? []).map((c) => blockToXhtml(c, depth)).join('')
              return `<${tag}>${inner}</${tag}>`
            })
            .join('')
          return `<tr>${cells}</tr>\n`
        })
        .join('')
      return `<table>\n${rows}</table>\n`
    }
    default:
      return (node.content ?? []).map((c) => blockToXhtml(c, depth)).join('')
  }
}

export function tiptapToXhtml(doc: JSONContent | null | undefined): string {
  if (!doc) return ''
  return (doc.content ?? []).map((n) => blockToXhtml(n)).join('')
}

function textToXhtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map((p) => `<p>${esc(p.trim())}</p>\n`)
    .join('')
}

// ─────────────────── plantillas ───────────────────

const CSS = `@charset "utf-8";
body { font-family: Georgia, serif; line-height: 1.6; margin: 0 5%; text-align: justify;
       hyphens: auto; -epub-hyphens: auto; }
h1, h2, h3 { font-family: Georgia, serif; text-align: left; line-height: 1.25;
             page-break-after: avoid; margin: 1.6em 0 0.7em; }
h1 { font-size: 1.6em; }
h2 { font-size: 1.3em; }
p { margin: 0; text-indent: 1.2em; }
h1 + p, h2 + p, h3 + p, blockquote + p, hr + p, .figure + p { text-indent: 0; }
p.blank { text-indent: 0; }
blockquote { margin: 1.2em 2em; font-style: italic; }
hr { border: 0; border-top: 1px solid #bbb; margin: 2em 20%; }
code, pre { font-family: monospace; font-size: 0.9em; }
pre { white-space: pre-wrap; background: #f4f4f2; padding: 0.8em; }
mark { background: #ffef9f; }
.u { text-decoration: underline; }
.ta-center { text-align: center; text-indent: 0; }
.ta-right { text-align: right; text-indent: 0; }
.figure { text-align: center; text-indent: 0; }
img { max-width: 100%; }
table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: 0.9em; }
th, td { border: 1px solid #ccc; padding: 0.35em 0.5em; text-align: left; }
th { background: #f4f4f2; }
ul.tasks { list-style: none; padding-left: 1em; }
.titlepage { text-align: center; margin-top: 25%; }
.titlepage h1 { text-align: center; font-size: 2em; margin-bottom: 0.3em; }
.titlepage .sub { font-style: italic; color: #555; }
.titlepage .author { margin-top: 2em; }`

const page = (title: string, body: string, lang: string) =>
  `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head>
  <meta charset="utf-8"/>
  <title>${esc(title)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${body}</body>
</html>`

// ─────────────────── imágenes ───────────────────

const MIME_IMAGEN: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
}

interface ImagenEmpaquetada {
  id: string
  href: string
  mime: string
  bytes: Uint8Array
}

/**
 * Saca las imágenes incrustadas a archivos dentro del EPUB.
 *
 * Un `<img src="data:image/…">` es HTML perfectamente válido y se ve bien en la
 * aplicación, pero un EPUB no lo admite: la especificación exige que cada
 * recurso figure en el manifiesto, y los lectores —Kindle y Apple Books los
 * primeros— o descartan la imagen o rechazan el libro entero. Así que al
 * empaquetar se extraen a `imagenes/` y se sustituye el `src` por la ruta.
 *
 * Las imágenes repetidas se guardan una sola vez: en una novela la misma
 * ilustración puede abrir varios capítulos y no tiene sentido triplicar el peso.
 */
function extraerImagenes(
  xhtml: string,
  recogidas: ImagenEmpaquetada[],
  yaVistas: Map<string, string>,
): string {
  return xhtml.replace(
    /src="data:image\/(png|jpe?g|gif|bmp);base64,([^"]+)"/gi,
    (completo, ext: string, b64: string) => {
      const clave = `${ext}:${b64.length}:${b64.slice(0, 64)}:${b64.slice(-64)}`
      const conocida = yaVistas.get(clave)
      if (conocida) return `src="${conocida}"`

      const bytes = deBase64(b64)
      if (!bytes) return completo // se deja tal cual antes que romper el archivo

      const tipo = ext.toLowerCase().startsWith('jp') ? 'jpg' : ext.toLowerCase()
      const n = recogidas.length + 1
      const href = `imagenes/img${String(n).padStart(3, '0')}.${tipo}`
      recogidas.push({ id: `img${n}`, href, mime: MIME_IMAGEN[tipo] ?? 'image/png', bytes })
      yaVistas.set(clave, href)
      return `src="${href}"`
    },
  )
}

function deBase64(b64: string): Uint8Array | null {
  try {
    // El XHTML ya pasó por `esc`, así que las entidades hay que deshacerlas.
    const limpio = b64.replace(/&amp;/g, '&').replace(/\s+/g, '')
    const bin = atob(limpio)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

// ─────────────────── construcción ───────────────────

export async function buildEpub(options: EpubOptions): Promise<Uint8Array> {
  const lang = options.language ?? 'es'
  const id = options.identifier ?? `urn:uuid:${crypto.randomUUID()}`
  const modified = (options.published ?? new Date().toISOString()).replace(/\.\d+Z$/, 'Z')
  const zip = new JSZip()

  // El «mimetype» debe ir primero y sin comprimir: lo exige la especificación.
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  )

  const oebps = zip.folder('OEBPS')!
  oebps.file('style.css', CSS)

  // portada
  const titleBody =
    `<section class="titlepage" epub:type="titlepage">\n` +
    `<h1>${esc(options.title)}</h1>\n` +
    (options.subtitle ? `<p class="sub">${esc(options.subtitle)}</p>\n` : '') +
    (options.author ? `<p class="author">${esc(options.author)}</p>\n` : '') +
    `</section>\n`
  oebps.file('titlepage.xhtml', page(options.title, titleBody, lang))

  const files: { id: string; href: string; title: string }[] = []
  const imagenes: ImagenEmpaquetada[] = []
  const yaVistas = new Map<string, string>()

  options.chapters.forEach((ch, i) => {
    const href = `ch${String(i + 1).padStart(3, '0')}.xhtml`
    const inner = ch.doc ? tiptapToXhtml(ch.doc) : textToXhtml(ch.text ?? '')
    const body =
      `<section epub:type="chapter">\n<h1>${esc(ch.title)}</h1>\n${inner || '<p class="blank"> </p>'}</section>\n`
    oebps.file(href, extraerImagenes(page(ch.title, body, lang), imagenes, yaVistas))
    files.push({ id: `ch${i + 1}`, href, title: ch.title })
  })

  for (const img of imagenes) oebps.file(img.href, img.bytes)

  // navegación EPUB 3
  const navItems = files
    .map((f) => `      <li><a href="${f.href}">${esc(f.title)}</a></li>`)
    .join('\n')
  oebps.file(
    'nav.xhtml',
    page(
      'Índice',
      `<nav epub:type="toc" id="toc">
  <h1>Índice</h1>
  <ol>
${navItems}
  </ol>
</nav>
<nav epub:type="landmarks" hidden="hidden">
  <ol><li><a epub:type="bodymatter" href="${files[0]?.href ?? 'titlepage.xhtml'}">Comienzo</a></li></ol>
</nav>
`,
      lang,
    ),
  )

  // navegación EPUB 2 (lectores antiguos)
  oebps.file(
    'toc.ncx',
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${esc(id)}"/>
    <meta name="dtb:depth" content="1"/>
  </head>
  <docTitle><text>${esc(options.title)}</text></docTitle>
  <navMap>
${files
  .map(
    (f, i) => `    <navPoint id="${f.id}" playOrder="${i + 1}">
      <navLabel><text>${esc(f.title)}</text></navLabel>
      <content src="${f.href}"/>
    </navPoint>`,
  )
  .join('\n')}
  </navMap>
</ncx>`,
  )

  oebps.file(
    'content.opf',
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId" xml:lang="${lang}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">${esc(id)}</dc:identifier>
    <dc:title>${esc(options.title)}</dc:title>
    <dc:language>${lang}</dc:language>
    ${options.author ? `<dc:creator id="creator">${esc(options.author)}</dc:creator>` : ''}
    ${options.subtitle ? `<dc:description>${esc(options.subtitle)}</dc:description>` : ''}
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
    <item id="titlepage" href="titlepage.xhtml" media-type="application/xhtml+xml"/>
${files.map((f) => `    <item id="${f.id}" href="${f.href}" media-type="application/xhtml+xml"/>`).join('\n')}
${imagenes.map((m) => `    <item id="${m.id}" href="${m.href}" media-type="${m.mime}"/>`).join('\n')}
  </manifest>
  <spine toc="ncx">
    <itemref idref="titlepage"/>
${files.map((f) => `    <itemref idref="${f.id}"/>`).join('\n')}
  </spine>
</package>`,
  )

  const blob = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    mimeType: 'application/epub+zip',
  })
  return blob
}
