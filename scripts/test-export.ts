/* Prueba de la exportación a .docx y .epub.
   Genera los dos archivos a partir de un documento TipTap rico y los deja en
   node_modules/.tmp para que el verificador externo compruebe que son válidos. */
import { writeFileSync } from 'node:fs'
import JSZip from 'jszip'
import { aHexDocx, bytesDeDataUrl, buildDocx, medirImagen } from '../src/lib/docx'
import { setIdiomaEscritura, setIdiomaUI } from '../src/i18n'

// Igual que en test-i18n: `setIdiomaUI` escribe en document.documentElement.
;(globalThis as Record<string, unknown>).document = { documentElement: {} }
import { buildEpub } from '../src/lib/epub'
import { tiptapToXhtml } from '../src/lib/epub'
import { tiptapToDocxBlocks } from '../src/lib/docx'

let fails = 0
const check = (name: string, cond: boolean, extra = '') => {
  if (cond) console.log(`  ✔ ${name}`)
  else { fails++; console.log(`  ✖ ${name} ${extra}`) }
}

/* PNG real de 4×2 píxeles, generado a mano: cabecera + IHDR + IDAT + IEND.
   Sirve para comprobar tanto la lectura de dimensiones como el empaquetado. */
const PNG_APAISADO =
  'data:image/png;base64,' +
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAAD91JpzAAAAFklEQVQIHWP8//8/AxJgYkACw4' +
  'IJADnJAgF9ZFEUAAAAAElFTkSuQmCC'

/* JPEG mínimo de 8×4, para el otro camino del lector de dimensiones. */
const JPEG_MINIMO =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAEAAgBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='

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
    // Una imagen incrustada: apaisada a propósito, para comprobar que ni el
    // .docx la deforma ni el .epub la deja como data URL.
    { type: 'image', attrs: { src: PNG_APAISADO, alt: 'la llave' } },
    { type: 'paragraph', content: [{ type: 'text', text: 'La misma llave, otra vez:' }] },
    { type: 'image', attrs: { src: PNG_APAISADO, alt: 'la llave otra vez' } },
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

  /* El idioma del documento. Sin la declaración, Word usa el del ordenador que
   * abre el archivo y subraya en rojo un manuscrito impecable. Y la portada del
   * formato manuscrito llevaba dos frases en español fijo.
   *
   * Desde la 0.4.0 esto sigue al **idioma de escritura**, no al de la interfaz:
   * el documento es del que escribe, no de los menús. */
  console.log('\n— idioma del .docx —')
  const portada = async (idioma: 'es' | 'en') => {
    setIdiomaEscritura(idioma)
    const bytes = await buildDocx({
      title: 'La casa vacía',
      author: 'Rafael Díaz Ríos',
      style: 'manuscrito',
      titlePage: true,
      wordCount: 81234,
      chapters: [{ title: 'Capítulo 1', text: 'Texto.', level: 1 }],
    })
    const z = await new JSZip().loadAsync(bytes)
    return {
      estilos: await z.file('word/styles.xml')!.async('string'),
      cuerpo: await z.file('word/document.xml')!.async('string'),
    }
  }

  const docEs = await portada('es')
  const docEn = await portada('en')

  check('en español el documento declara es-ES', docEs.estilos.includes('w:val="es-ES"'))
  check('en inglés declara en-GB', docEn.estilos.includes('w:val="en-GB"'))
  check('y no se queda el español pegado', !docEn.estilos.includes('w:val="es-ES"'))
  check('la portada dice «por» en español', docEs.cuerpo.includes('por Rafael'))
  check('y «by» en inglés', docEn.cuerpo.includes('by Rafael'))
  check('el recuento va en español', docEs.cuerpo.includes('palabras'))
  check('y en inglés', docEn.cuerpo.includes('words'))
  check('y los miles se agrupan según el idioma',
    docEs.cuerpo.includes('81.200') && docEn.cuerpo.includes('81,200'))

  /* Lo que de verdad estrena la 0.4.0: que el documento NO mire el idioma de la
   * interfaz. Con la aplicación en español y el ajuste de escritura en inglés,
   * el .docx tiene que salir entero en inglés. Sin esta comprobación, volver a
   * poner `idiomaUI()` en `docx.ts` pasaría las ocho de arriba sin despeinarse:
   * las dos variables irían juntas y ninguna cazaría la diferencia. */
  setIdiomaUI('es')
  const mezclado = await portada('en')
  check('el .docx sigue al idioma de escritura, no al de la interfaz',
    mezclado.estilos.includes('w:val="en-GB"') && !mezclado.estilos.includes('w:val="es-ES"'))
  check('y la portada también', mezclado.cuerpo.includes('by Rafael') &&
    mezclado.cuerpo.includes('words') && mezclado.cuerpo.includes('81,200'))

  setIdiomaUI('es')
  setIdiomaEscritura('es')

  /* Los colores que llegan de fuera. El selector de la barra es un
   * `<input type="color">` y siempre da `#rrggbb`, pero **al pegar texto de una
   * página web TipTap conserva el `color: rgb(...)` del HTML pegado**, y eso se
   * guarda tal cual en la entrada. La librería `docx` solo acepta hex de seis
   * dígitos: reventaba con «Invalid hex value» y **se llevaba por delante la
   * exportación entera del mes**. Un trozo de texto pegado hace meses dejaba sin
   * exportar todo lo demás. */
  console.log('\n— colores pegados —')
  check('el hex de siempre pasa igual', aHexDocx('#B0AEA6') === 'B0AEA6')
  check('el hex corto se estira', aHexDocx('#abc') === 'AABBCC')
  check('rgb() con comas', aHexDocx('rgb(176, 174, 166)') === 'B0AEA6')
  check('rgb() con espacios', aHexDocx('rgb(176 174 166)') === 'B0AEA6')
  check('rgba() descarta la opacidad', aHexDocx('rgba(176, 174, 166, 0.5)') === 'B0AEA6')
  check('los porcentajes también', aHexDocx('rgb(100%, 0%, 0%)') === 'FF0000')
  check('los nombres más comunes', aHexDocx('red') === 'FF0000' && aHexDocx('Black') === '000000')
  check('lo que no se entiende no da color', aHexDocx('hsl(210 40% 50%)') === undefined
    && aHexDocx('color(display-p3 1 0 0)') === undefined && aHexDocx(null) === undefined)

  const conColor = async (color: string) =>
    buildDocx({
      title: 'Diario',
      chapters: [{
        title: 'Un día',
        level: 2,
        doc: {
          type: 'doc',
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', marks: [{ type: 'textStyle', attrs: { color } }], text: 'Pegado.' }],
          }],
        },
      }],
    })

  let pegado: Uint8Array | null = null
  try {
    pegado = await conColor('rgb(176, 174, 166)')
  } catch (e) {
    pegado = null
    console.log('   ', e instanceof Error ? e.message : String(e))
  }
  check('un rgb() pegado ya no tumba la exportación', pegado !== null && pegado.length > 2000)
  if (pegado) {
    const z = await new JSZip().loadAsync(pegado)
    const cuerpo = await z.file('word/document.xml')!.async('string')
    check('y el color llega convertido a hex', cuerpo.includes('w:val="B0AEA6"'),
      `→ ${(cuerpo.match(/w:color w:val="[^"]*"/) ?? ['ninguno'])[0]}`)
  }

  let raro: Uint8Array | null = null
  try {
    raro = await conColor('hsl(210 40% 50%)')
  } catch {
    raro = null
  }
  check('y un color que no se entiende sale sin color, pero sale',
    raro !== null && raro.length > 2000)

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

  // Las imágenes tienen que haber salido a archivos: un data URL dentro de un
  // EPUB es inválido y los lectores lo descartan.
  const zip = await new JSZip().loadAsync(epub)
  const rutas = Object.keys(zip.files)
  const opf = await zip.file('OEBPS/content.opf')!.async('string')
  const cap1 = await zip.file('OEBPS/ch001.xhtml')!.async('string')
  check('extrae la imagen a un archivo', rutas.includes('OEBPS/imagenes/img001.png'), `→ ${rutas.join(', ')}`)
  check('no deja data URLs en el capítulo', !cap1.includes('data:image'))
  check('apunta a la ruta relativa', cap1.includes('src="imagenes/img001.png"'))
  check('la declara en el manifiesto', opf.includes('href="imagenes/img001.png" media-type="image/png"'))
  check(
    'no duplica la imagen repetida',
    rutas.filter((r) => !zip.files[r].dir && r.startsWith('OEBPS/imagenes/')).length === 1,
    `→ ${rutas.filter((r) => !zip.files[r].dir && r.startsWith('OEBPS/imagenes/')).join(', ')}`,
  )

  /* El `dc:language` cuando no se pasa uno explícito. Un .epub que declara el
   * idioma equivocado se lee con la separación silábica de otro. */
  check('declara el idioma de escritura', opf.includes('<dc:language>es</dc:language>'))
  setIdiomaEscritura('en')
  const epubEn = await buildEpub({
    title: 'The empty house',
    chapters: [{ title: 'One', text: 'Text.' }],
  })
  const opfEn = await (await new JSZip().loadAsync(epubEn))
    .file('OEBPS/content.opf')!
    .async('string')
  check('y cambia con él, con la interfaz en español',
    opfEn.includes('<dc:language>en</dc:language>'))
  setIdiomaEscritura('es')

  console.log('\n— imágenes —')
  const png = bytesDeDataUrl(PNG_APAISADO)
  check('lee el data URL del PNG', png !== null && png.tipo === 'png')
  const medidaPng = png ? medirImagen(png.bytes) : null
  check('mide el PNG', medidaPng?.ancho === 4 && medidaPng?.alto === 2, `→ ${JSON.stringify(medidaPng)}`)

  const jpeg = bytesDeDataUrl(`data:image/jpeg;base64,${JPEG_MINIMO}`)
  const medidaJpeg = jpeg ? medirImagen(jpeg.bytes) : null
  check('mide el JPEG', medidaJpeg?.ancho === 8 && medidaJpeg?.alto === 4, `→ ${JSON.stringify(medidaJpeg)}`)

  check('no mide lo que no es imagen', medirImagen(new Uint8Array([1, 2, 3, 4, 5])) === null)
  check('rechaza un src que no es data URL', bytesDeDataUrl('https://ejemplo.es/a.png') === null)

  const conImagen = tiptapToXhtml({
    type: 'doc',
    content: [{ type: 'image', attrs: { src: PNG_APAISADO } }],
  })
  check('el XHTML de pantalla conserva el data URL', conImagen.includes('data:image/png'))

  console.log(fails === 0 ? '\n✔ Conversión correcta\n' : `\n✖ ${fails} fallo(s)\n`)
  process.exit(fails === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
