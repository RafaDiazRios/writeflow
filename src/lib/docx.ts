import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, Header, HeadingLevel,
  ImageRun, LevelFormat, PageBreak, PageNumber, Packer, Paragraph, ShadingType, Table,
  TableCell, TableRow, TextRun, WidthType, convertInchesToTwip,
} from 'docx'
import type { IParagraphOptions, IRunOptions, ParagraphChild } from 'docx'

/** `IRunOptions` es de solo lectura; aquí se va construyendo campo a campo. */
type MutableRun = { -readonly [K in keyof IRunOptions]: IRunOptions[K] }
import type { JSONContent } from '@tiptap/react'
import { num } from '@/i18n'

/**
 * Exportación a .docx nativo.
 *
 * Dos presentaciones:
 *
 *  · `manuscrito` — el formato estándar que piden editoriales y agentes: cuerpo 12,
 *    doble espacio, márgenes de una pulgada, sangría de primera línea, un capítulo por
 *    página y encabezado «Apellido / TÍTULO / página». Nada de florituras: está pensado
 *    para que un lector profesional calcule extensión de un vistazo.
 *
 *  · `libro` — para leer y compartir: interlineado 1.15, espacio entre párrafos, sin
 *    sangría. Es lo que quieres para un ensayo o para mandarle el diario a alguien.
 */

export type DocxStyle = 'manuscrito' | 'libro'

export interface DocxChapter {
  title: string
  /** Documento TipTap. Si falta, se usa `text` como texto plano. */
  doc?: JSONContent | null
  text?: string
  /** Fuerza salto de página antes (por defecto: sí en manuscrito). */
  pageBreak?: boolean
  /** Nivel del encabezado; 1 = capítulo. */
  level?: 1 | 2 | 3
}

export interface DocxOptions {
  title: string
  subtitle?: string | null
  author?: string | null
  style?: DocxStyle
  chapters: DocxChapter[]
  /** Portada con título centrado y recuento de palabras. */
  titlePage?: boolean
  wordCount?: number
}

const NUMBERING_BULLET = 'wf-bullet'
const NUMBERING_ORDERED = 'wf-ordered'

// ─────────────────────── marcas en línea ───────────────────────

function runsFromInline(nodes: JSONContent[] | undefined, base: IRunOptions): ParagraphChild[] {
  const out: ParagraphChild[] = []
  for (const n of nodes ?? []) {
    if (n.type === 'hardBreak') {
      out.push(new TextRun({ ...base, text: '', break: 1 }))
      continue
    }
    if (n.type === 'image' && typeof n.attrs?.src === 'string') {
      const img = imageRun(n.attrs.src as string)
      if (img) out.push(img)
      continue
    }
    if (n.type !== 'text' || !n.text) continue

    const opts: MutableRun = { ...base, text: n.text }
    let href: string | null = null

    for (const m of n.marks ?? []) {
      switch (m.type) {
        case 'bold': opts.bold = true; break
        case 'italic': opts.italics = true; break
        case 'underline': opts.underline = {}; break
        case 'strike': opts.strike = true; break
        case 'superscript': opts.superScript = true; break
        case 'subscript': opts.subScript = true; break
        case 'highlight': opts.highlight = 'yellow'; break
        case 'code':
          opts.font = 'Consolas'
          opts.shading = { type: ShadingType.CLEAR, fill: 'F2F2F0' }
          break
        case 'textStyle':
          if (typeof m.attrs?.color === 'string') opts.color = String(m.attrs.color).replace('#', '')
          break
        case 'link':
          if (typeof m.attrs?.href === 'string') href = m.attrs.href
          break
      }
    }

    if (href) {
      out.push(
        new ExternalHyperlink({
          link: href,
          children: [new TextRun({ ...opts, style: 'Hyperlink' })],
        }),
      )
    } else {
      out.push(new TextRun(opts))
    }
  }
  return out
}

/**
 * Ancho útil de una página A4 con los márgenes que usa el documento, en puntos.
 * 595 pt de página menos dos márgenes de una pulgada.
 */
const ANCHO_UTIL_PT = 451

/**
 * Lee el tamaño real de la imagen a partir de sus bytes.
 *
 * Hay que hacerlo a mano porque esto también corre en Node, en las pruebas,
 * donde no existe ni `Image` ni un lienzo. Son cuatro formatos y las cabeceras
 * están en sitios fijos, así que sale más barato leerlas que arrastrar una
 * dependencia.
 */
export function medirImagen(bytes: Uint8Array): { ancho: number; alto: number } | null {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  // PNG: la cabecera IHDR empieza siempre en el byte 16.
  if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return { ancho: v.getUint32(16), alto: v.getUint32(20) }
  }

  // GIF: little-endian en los bytes 6 a 9.
  if (bytes.length > 10 && bytes[0] === 0x47 && bytes[1] === 0x49) {
    return { ancho: v.getUint16(6, true), alto: v.getUint16(8, true) }
  }

  // BMP: el encabezado DIB, también little-endian.
  if (bytes.length > 26 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return { ancho: v.getInt32(18, true), alto: Math.abs(v.getInt32(22, true)) }
  }

  // JPEG: hay que recorrer los segmentos hasta dar con un SOFn, que es el que
  // lleva las dimensiones. Se saltan los marcadores sin carga útil.
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) {
        i++
        continue
      }
      const marca = bytes[i + 1]
      if (marca === 0xd8 || marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) {
        i += 2
        continue
      }
      const largo = v.getUint16(i + 2)
      // SOF0-SOF3, SOF5-SOF7, SOF9-SOF11, SOF13-SOF15: todos menos DHT/JPG/DAC.
      const esSof =
        marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc
      if (esSof) return { alto: v.getUint16(i + 5), ancho: v.getUint16(i + 7) }
      if (largo < 2) return null
      i += 2 + largo
    }
  }
  return null
}

/** Separa un data URL de imagen en su tipo y sus bytes. */
export function bytesDeDataUrl(
  src: string,
): { tipo: 'png' | 'jpg' | 'gif' | 'bmp'; bytes: Uint8Array } | null {
  const m = /^data:image\/(png|jpe?g|gif|bmp);base64,(.+)$/i.exec(src)
  if (!m) return null // las imágenes por URL no se pueden incrustar sin red
  try {
    const bin = atob(m[2])
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    const crudo = m[1].toLowerCase()
    const tipo = crudo.startsWith('jp') ? 'jpg' : (crudo as 'png' | 'gif' | 'bmp')
    return { tipo, bytes }
  } catch {
    return null
  }
}

function imageRun(src: string): ImageRun | null {
  const img = bytesDeDataUrl(src)
  if (!img) return null

  // Se respeta la proporción real y se limita al ancho de la caja de texto: una
  // imagen apaisada estirada a 460×300 quedaba deformada, y una vertical se
  // salía de la página.
  const medida = medirImagen(img.bytes)
  let ancho = 460
  let alto = 300
  if (medida && medida.ancho > 0 && medida.alto > 0) {
    ancho = Math.min(medida.ancho, ANCHO_UTIL_PT)
    alto = Math.round((ancho * medida.alto) / medida.ancho)
  }

  return new ImageRun({
    data: img.bytes,
    type: img.tipo,
    transformation: { width: ancho, height: alto },
  })
}

function alignOf(node: JSONContent): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  switch (node.attrs?.textAlign) {
    case 'center': return AlignmentType.CENTER
    case 'right': return AlignmentType.RIGHT
    case 'justify': return AlignmentType.JUSTIFIED
    case 'left': return AlignmentType.LEFT
    default: return undefined
  }
}

// ─────────────────────── bloques ───────────────────────

interface Ctx {
  style: DocxStyle
  /** true en el primer párrafo de una sección: sin sangría, por convención tipográfica. */
  firstOfSection: boolean
}

function blocksFrom(node: JSONContent, ctx: Ctx, depth = 0): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = []
  const manuscript = ctx.style === 'manuscrito'
  const bodyFont = manuscript ? 'Times New Roman' : 'Georgia'
  const base: IRunOptions = { font: bodyFont, size: manuscript ? 24 : 22 } // half-points

  switch (node.type) {
    case 'paragraph': {
      const indent =
        manuscript && !ctx.firstOfSection ? { firstLine: convertInchesToTwip(0.5) } : undefined
      out.push(
        new Paragraph({
          children: runsFromInline(node.content, base),
          alignment: alignOf(node),
          indent,
          spacing: manuscript ? { line: 480 } : { line: 276, after: 160 },
        } as IParagraphOptions),
      )
      if (node.content?.length) ctx.firstOfSection = false
      break
    }

    case 'heading': {
      const level = Number(node.attrs?.level ?? 1)
      out.push(
        new Paragraph({
          children: runsFromInline(node.content, {
            font: manuscript ? 'Times New Roman' : 'Georgia',
            size: level === 1 ? 32 : level === 2 ? 28 : 25,
            bold: true,
          }),
          heading:
            level === 1 ? HeadingLevel.HEADING_1
            : level === 2 ? HeadingLevel.HEADING_2
            : HeadingLevel.HEADING_3,
          alignment: alignOf(node),
          spacing: { before: 320, after: 200 },
        }),
      )
      ctx.firstOfSection = true
      break
    }

    case 'blockquote': {
      for (const child of node.content ?? []) {
        out.push(
          new Paragraph({
            children: runsFromInline(child.content, { ...base, italics: true }),
            indent: { left: convertInchesToTwip(0.5) },
            spacing: manuscript ? { line: 480 } : { line: 276, after: 120 },
            border: {
              left: { style: BorderStyle.SINGLE, size: 12, color: '9DB8DE', space: 12 },
            },
          }),
        )
      }
      ctx.firstOfSection = true
      break
    }

    case 'bulletList':
    case 'orderedList': {
      const reference = node.type === 'bulletList' ? NUMBERING_BULLET : NUMBERING_ORDERED
      for (const li of node.content ?? []) {
        for (const child of li.content ?? []) {
          if (child.type === 'paragraph') {
            out.push(
              new Paragraph({
                children: runsFromInline(child.content, base),
                numbering: { reference, level: Math.min(depth, 2) },
                spacing: { line: manuscript ? 480 : 276, after: 60 },
              }),
            )
          } else {
            out.push(...blocksFrom(child, ctx, depth + 1))
          }
        }
      }
      ctx.firstOfSection = true
      break
    }

    case 'taskList': {
      for (const li of node.content ?? []) {
        const done = li.attrs?.checked === true
        for (const child of li.content ?? []) {
          out.push(
            new Paragraph({
              children: [
                new TextRun({ ...base, text: done ? '☑  ' : '☐  ' }),
                ...runsFromInline(child.content, base),
              ],
              indent: { left: convertInchesToTwip(0.35) },
              spacing: { after: 60 },
            }),
          )
        }
      }
      break
    }

    case 'codeBlock': {
      out.push(
        new Paragraph({
          children: runsFromInline(node.content, { font: 'Consolas', size: 20 }),
          shading: { type: ShadingType.CLEAR, fill: 'F2F2F0' },
          spacing: { before: 120, after: 120 },
        }),
      )
      break
    }

    case 'horizontalRule': {
      out.push(
        new Paragraph({
          text: '',
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 8 } },
          spacing: { before: 200, after: 200 },
        }),
      )
      ctx.firstOfSection = true
      break
    }

    case 'image': {
      const img = typeof node.attrs?.src === 'string' ? imageRun(node.attrs.src as string) : null
      if (img) out.push(new Paragraph({ children: [img], alignment: AlignmentType.CENTER }))
      break
    }

    case 'table': {
      const rows: TableRow[] = []
      for (const tr of node.content ?? []) {
        const cells: TableCell[] = []
        for (const td of tr.content ?? []) {
          const inner: Paragraph[] = []
          for (const p of td.content ?? []) {
            const built = blocksFrom(p, { ...ctx, firstOfSection: true })
            for (const b of built) if (b instanceof Paragraph) inner.push(b)
          }
          cells.push(
            new TableCell({
              children: inner.length ? inner : [new Paragraph('')],
              shading:
                td.type === 'tableHeader'
                  ? { type: ShadingType.CLEAR, fill: 'F2F2F0' }
                  : undefined,
              columnSpan: Number(td.attrs?.colspan ?? 1),
              rowSpan: Number(td.attrs?.rowspan ?? 1),
            }),
          )
        }
        rows.push(new TableRow({ children: cells }))
      }
      if (rows.length) out.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }))
      ctx.firstOfSection = true
      break
    }

    default: {
      for (const child of node.content ?? []) out.push(...blocksFrom(child, ctx, depth))
    }
  }

  return out
}

export function tiptapToDocxBlocks(doc: JSONContent | null | undefined, style: DocxStyle) {
  if (!doc) return []
  const ctx: Ctx = { style, firstOfSection: true }
  const out: (Paragraph | Table)[] = []
  for (const node of doc.content ?? []) out.push(...blocksFrom(node, ctx))
  return out
}

function plainTextBlocks(text: string, style: DocxStyle) {
  const manuscript = style === 'manuscrito'
  return text
    .split(/\n{2,}/)
    .filter((p) => p.trim())
    .map(
      (p, i) =>
        new Paragraph({
          children: [
            new TextRun({
              text: p.trim(),
              font: manuscript ? 'Times New Roman' : 'Georgia',
              size: manuscript ? 24 : 22,
            }),
          ],
          indent: manuscript && i > 0 ? { firstLine: convertInchesToTwip(0.5) } : undefined,
          spacing: manuscript ? { line: 480 } : { line: 276, after: 160 },
        }),
    )
}

// ─────────────────────── documento completo ───────────────────────

export async function buildDocx(options: DocxOptions): Promise<Uint8Array> {
  const style = options.style ?? 'libro'
  const manuscript = style === 'manuscrito'
  const surname = (options.author ?? '').trim().split(/\s+/).pop() || ''

  const body: (Paragraph | Table)[] = []

  if (options.titlePage) {
    const spacer = (n: number) =>
      Array.from({ length: n }, () => new Paragraph({ text: '', spacing: { after: 240 } }))
    body.push(...spacer(manuscript ? 8 : 5))
    body.push(
      new Paragraph({
        children: [
          new TextRun({
            text: options.title.toUpperCase(),
            font: manuscript ? 'Times New Roman' : 'Georgia',
            size: manuscript ? 32 : 44,
            bold: !manuscript,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
      }),
    )
    if (options.subtitle) {
      body.push(
        new Paragraph({
          children: [
            new TextRun({ text: options.subtitle, font: 'Georgia', size: 26, italics: true }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
        }),
      )
    }
    if (options.author) {
      body.push(
        new Paragraph({
          children: [
            new TextRun({
              text: manuscript ? `por ${options.author}` : options.author,
              font: manuscript ? 'Times New Roman' : 'Georgia',
              size: 24,
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
        }),
      )
    }
    if (manuscript && options.wordCount) {
      const rounded = Math.round(options.wordCount / 100) * 100
      body.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `unas ${num(rounded)} palabras`,
              font: 'Times New Roman',
              size: 24,
            }),
          ],
          alignment: AlignmentType.CENTER,
        }),
      )
    }
    body.push(new Paragraph({ children: [new PageBreak()] }))
  }

  options.chapters.forEach((ch, i) => {
    const needsBreak = ch.pageBreak ?? (manuscript || i > 0)
    if (needsBreak && (i > 0 || options.titlePage)) {
      body.push(new Paragraph({ children: [new PageBreak()] }))
    }
    if (ch.title) {
      const level = ch.level ?? 1
      body.push(
        new Paragraph({
          children: [
            new TextRun({
              text: manuscript ? ch.title.toUpperCase() : ch.title,
              font: manuscript ? 'Times New Roman' : 'Georgia',
              size: level === 1 ? (manuscript ? 24 : 32) : 26,
              bold: !manuscript || level === 1,
            }),
          ],
          heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
          alignment: manuscript ? AlignmentType.CENTER : AlignmentType.LEFT,
          spacing: manuscript ? { before: 480, after: 480 } : { before: 320, after: 200 },
        }),
      )
    }
    const blocks = ch.doc
      ? tiptapToDocxBlocks(ch.doc, style)
      : plainTextBlocks(ch.text ?? '', style)
    body.push(...(blocks.length ? blocks : [new Paragraph({ text: '' })]))
  })

  const doc = new Document({
    creator: options.author ?? 'WriteFlow',
    title: options.title,
    description: options.subtitle ?? undefined,
    numbering: {
      config: [
        {
          reference: NUMBERING_BULLET,
          levels: [0, 1, 2].map((l) => ({
            level: l,
            format: LevelFormat.BULLET,
            text: ['•', '◦', '▪'][l],
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: convertInchesToTwip(0.35 * (l + 1)), hanging: convertInchesToTwip(0.22) },
              },
            },
          })),
        },
        {
          reference: NUMBERING_ORDERED,
          levels: [0, 1, 2].map((l) => ({
            level: l,
            format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][l],
            text: [`%1.`, `%2.`, `%3.`][l],
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: {
                indent: { left: convertInchesToTwip(0.35 * (l + 1)), hanging: convertInchesToTwip(0.22) },
              },
            },
          })),
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(manuscript ? 1 : 1.1),
              right: convertInchesToTwip(manuscript ? 1 : 1.1),
            },
          },
        },
        headers: manuscript
          ? {
              default: new Header({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.RIGHT,
                    children: [
                      new TextRun({
                        text: `${surname ? surname + ' / ' : ''}${options.title.toUpperCase()} / `,
                        font: 'Times New Roman',
                        size: 20,
                      }),
                      new TextRun({ children: [PageNumber.CURRENT], font: 'Times New Roman', size: 20 }),
                    ],
                  }),
                ],
              }),
            }
          : undefined,
        footers: manuscript
          ? undefined
          : {
              default: new Footer({
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [
                      new TextRun({ children: [PageNumber.CURRENT], font: 'Georgia', size: 18, color: '888888' }),
                    ],
                  }),
                ],
              }),
            },
        children: body,
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  return new Uint8Array(await blob.arrayBuffer())
}
