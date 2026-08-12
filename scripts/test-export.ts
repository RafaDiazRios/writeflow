/* Prueba de la exportación a .docx y .epub.
   Genera los dos archivos a partir de un documento TipTap rico y los deja en
   node_modules/.tmp para que el verificador externo compruebe que son válidos. */
import { writeFileSync } from 'node:fs'
import { buildDocx } from '../src/lib/docx'
import { buildEpub } from '../src/lib/epub'
import { tiptapToXhtml } from '../src/lib/epub'
import { tiptapToDocxBlocks } from '../src/lib/docx'

let fails = 0
const check = (name: string, cond: boolean, extra = '') => {
  if (cond) console.log(`  ✔ ${name}`)
  else { fails++; console.log(`  ✖ ${name} ${extra}`) }
}

const RICO = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'La casa vacía' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Llovía cuando ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'Nadia' },
        { type: 'text', text: ' abrió la puerta, y la casa olía a ' },
        { type: 'text', marks: [{ type: 'italic' }], text: 'cerrado' },
        { type: 'text', text: '. Ver ' },
        { type: 'text', marks: [{ type: 'link', attrs: { href: 'https://ejemplo.es/nota' } }], text: 'la nota' },
        { type: 'text', text: ' del margen.' },
      ],
    },
    { type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: 'Un párrafo centrado.' }] },
    {
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nadie vive aquí desde el invierno.' }] }],
    },
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'la llave torcida' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'el reloj parado' }] }] },
      ],
    },
    {
      type: 'orderedList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'primero' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'segundo' }] }] },
      ],
    },
    { type: 'horizontalRule' },
    {
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Objeto' }] }] },
            { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Dónde' }] }] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'reloj' }] }] },
            { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cocina' }] }] },
          ],
        },
      ],
    },
    { type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1 < 2 && 3 > 2' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Caracteres que rompen XML: ' },
        { type: 'text', text: '<tag> & "comillas" — acentuación: áéíóú ñ ¿?' },
      ],
    },
  ],
} as never

async function main() {
  console.log('\n— conversión de bloques —')
  const blocks = tiptapToDocxBlocks(RICO, 'libro')
  check('produce bloques docx', blocks.length >= 8, `→ ${blocks.length}`)

  const xhtml = tiptapToXhtml(RICO)
  check('escapa < y & en XHTML', xhtml.includes('&lt;tag&gt;') && xhtml.includes('&amp;'))
  check('no deja etiquetas sin cerrar', !/<(br|hr|img)(?![^>]*\/>)/.test(xhtml))
  check('convierte la tabla', xhtml.includes('<th>') && xhtml.includes('<td>'))
  check('convierte el enlace', xhtml.includes('<a href="https://ejemplo.es/nota">'))

  console.log('\n— .docx —')
  for (const style of ['libro', 'manuscrito'] as const) {
    const bytes = await buildDocx({
      title: 'La casa vacía',
      subtitle: 'una novela breve',
      author: 'Rafael Díaz Ríos',
      style,
      titlePage: true,
      wordCount: 1234,
      chapters: [
        { title: 'Capítulo 1', doc: RICO, level: 1 },
        { title: 'Capítulo 2', text: 'Texto plano.\n\nSegundo párrafo.', level: 1 },
      ],
    })
    check(`${style}: genera bytes`, bytes.length > 5000, `→ ${bytes.length} bytes`)
    check(`${style}: es un zip (PK)`, bytes[0] === 0x50 && bytes[1] === 0x4b)
    writeFileSync(`node_modules/.tmp/prueba-${style}.docx`, bytes)
  }

  console.log('\n— .epub —')
  const epub = await buildEpub({
    title: 'La casa vacía',
    subtitle: 'una novela breve',
    author: 'Rafael Díaz Ríos',
    identifier: 'urn:uuid:11111111-2222-3333-4444-555555555555',
    published: '2026-08-12T00:00:00Z',
    chapters: [
      { title: 'Capítulo 1', doc: RICO },
      { title: 'Capítulo 2', text: 'Texto plano.\n\nSegundo párrafo.' },
    ],
  })
  check('genera bytes', epub.length > 2000, `→ ${epub.length} bytes`)
  check('es un zip (PK)', epub[0] === 0x50 && epub[1] === 0x4b)
  writeFileSync('node_modules/.tmp/prueba.epub', epub)

  console.log(fails === 0 ? '\n✔ Conversión correcta\n' : `\n✖ ${fails} fallo(s)\n`)
  process.exit(fails === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
