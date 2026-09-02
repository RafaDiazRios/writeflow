/* Prueba de integración del esquema local y de los repositorios.
   Se ejecuta contra un SQLite real (node:sqlite) mediante un sustituto del
   plugin de Tauri, así que valida el SQL de verdad, no una imitación. */
import { db, getMeta, one, run, setMeta } from '../src/lib/db'
import { beats, characters, docs, globalStats, journal, pendingCounts, projects, tags, therapy, threads } from '../src/lib/repo'
import { countWords, docToText, EMPTY_DOC, textToDoc } from '../src/lib/text'
import { docToMarkdown, compileProject } from '../src/lib/export'
import { promptForDay, rerollPrompt, prompts, ejercicios, plantillas, suggestExercise } from '../src/lib/prompts'
import { setIdiomaContenido } from '../src/i18n'
import { hitRoute, indexSize, rebuildIndex, search, toMatchQuery } from '../src/lib/search'
import { getGoal, recordDelta, setGoal, streaks, todayWords } from '../src/lib/stats'
import { aIso, INDEXABLES, volverASubirTodo } from '../src/lib/sync'
import {
  esDescendiente, moverJunto, posiciones, sePuedeSoltar, zonaDeSoltar,
} from '../src/lib/reordenar'

let fails = 0
function check(name: string, cond: boolean, extra = '') {
  if (cond) console.log(`  ✔ ${name}`)
  else { fails++; console.log(`  ✖ ${name} ${extra}`) }
}

async function main() {
  await db()
  console.log('\n— base de datos y metadatos —')
  await setMeta('theme', 'dark')
  check('meta escribe y lee', (await getMeta('theme')) === 'dark')
  await setMeta('theme', 'light')
  check('meta hace upsert', (await getMeta('theme')) === 'light')

  console.log('\n— diario —')
  const doc = textToDoc('Primera línea del día.\n\nSegunda idea, más larga, que ocupa varias palabras.')
  const text = docToText(doc)
  const id = await journal.create({
    entry_date: '2026-08-12', title: 'Martes', content_json: JSON.stringify(doc),
    content_text: text, word_count: countWords(text), mood: 4,
  })
  await journal.create({ entry_date: '2026-08-12', title: 'Segunda del día' })
  await journal.create({ entry_date: '2026-08-10', title: 'Anteayer', content_text: 'algo antiguo', word_count: 2 })
  const day = await journal.byDate('2026-08-12')
  check('dos entradas el mismo día', day.length === 2, `→ ${day.length}`)
  check('recuento de palabras', day.find(e => e.id === id)!.word_count === 12, `→ ${day.find(e => e.id === id)!.word_count}`)

  await journal.update(id, { title: 'Martes corregido', mood: 5 })
  const upd = await journal.byId(id)
  check('update aplica el parche', upd!.title === 'Martes corregido' && upd!.mood === 5)
  check('rev sube al actualizar', upd!.rev >= 2, `→ rev ${upd!.rev}`)
  check('queda marcado como pendiente', upd!.dirty === 1)

  const rango = await journal.daysInRange('2026-08-01', '2026-08-31')
  check('agregado del calendario', rango.length === 2 && rango.some(r => r.entry_date === '2026-08-12' && r.n === 2))

  const found = await journal.search('varias palabras')
  check('búsqueda por contenido', found.length === 1 && found[0].id === id)

  await tags.setForEntry(id, ['viaje', 'lecturas', ''])
  const ts = await tags.forEntry(id)
  check('etiquetas asociadas', ts.length === 2, `→ ${ts.map(t => t.name).join(',')}`)
  await tags.setForEntry(id, ['viaje'])
  check('reemplazar etiquetas no duplica', (await tags.forEntry(id)).length === 1)
  check('no se crean etiquetas repetidas', (await tags.all()).length === 2)

  await journal.remove(id)
  check('borrado lógico saca del día', (await journal.byDate('2026-08-12')).length === 1)
  check('la fila sobrevive para sincronizar', (await journal.byId(id))!.deleted_at !== null)

  console.log('\n— novela —')
  const novId = await projects.create({ kind: 'novel', title: 'La casa vacía', target_words: 1000 })
  const carpeta = await docs.create({ project_id: novId, kind: 'folder', title: 'Manuscrito' })
  const esc1 = await docs.create({
    project_id: novId, parent_id: carpeta, kind: 'scene', title: 'Llegada',
    content_json: JSON.stringify(textToDoc('Llovía cuando abrió la puerta.')), word_count: 5,
  })
  const esc2 = await docs.create({
    project_id: novId, parent_id: carpeta, kind: 'scene', title: 'La cocina',
    content_json: JSON.stringify(textToDoc('Nadie había fregado en semanas.')), word_count: 5,
  })
  check('posiciones autoincrementales', (await docs.byId(esc2))!.position > (await docs.byId(esc1))!.position)
  check('recuento del proyecto', (await projects.wordCount(novId)) === 10)

  const c1 = await characters.create({ project_id: novId, name: 'Nadia', role: 'protagonista', goal: 'volver a entrar' })
  check('ficha de personaje', (await characters.byId(c1))!.goal === 'volver a entrar')
  const th = await threads.create({ project_id: novId, name: 'Trama principal', kind: 'main', position: 0 })
  await beats.create({ project_id: novId, thread_id: th, title: 'Encuentra la carta', position: 0 })
  check('beat ligado a la trama', (await beats.forProject(novId)).length === 1)

  const md = await compileProject(novId)
  check('compila el manuscrito', md.includes('La casa vacía') && md.includes('Llovía cuando') && md.includes('Nadie había'))
  check('respeta el orden de las escenas', md.indexOf('Llovía') < md.indexOf('Nadie había'))

  await docs.remove(carpeta)
  check('borrar carpeta arrastra los hijos', (await docs.forProject(novId)).length === 0)

  console.log('\n— ensayo —')
  const plantilla = plantillas().find(p => p.id === 'persuasive-toulmin')!
  const ensId = await projects.create({ kind: 'essay', title: 'Sobre el ruido', template_id: plantilla.id })
  for (const [i, s] of plantilla.sections.entries()) {
    await docs.create({ project_id: ensId, kind: 'section', title: s.title, guide: s.guide, target_words: s.suggested_words, position: i * 100 })
  }
  const secs = await docs.forProject(ensId)
  check('secciones creadas desde la plantilla', secs.length === plantilla.sections.length)
  check('la guía se conserva', secs[0].guide === plantilla.sections[0].guide)
  check('novelas y ensayos no se mezclan', (await projects.list('novel')).length === 1 && (await projects.list('essay')).length === 1)

  console.log('\n— terapia —')
  const ex = ejercicios()[0]
  const tId = await therapy.create({
    session_date: '2026-08-12', exercise_id: ex.id, exercise_name: ex.name, school: ex.school,
    level: ex.level, prompt_text: ex.prompt, content_text: 'escrito de prueba', word_count: 3,
    followups: JSON.stringify(ex.followups.map(q => ({ q, a: '' }))),
  })
  check('sesión guardada', (await therapy.byId(tId))!.exercise_name === ex.name)
  const use = await therapy.usage()
  check('recuento de uso por ejercicio', use[ex.id] === 1)
  const sug = suggestExercise(1, use)
  check('sugiere un ejercicio del nivel pedido', sug.level === 1)

  console.log('\n— prompts —')
  const a = promptForDay('2026-08-12', ['estoico'])
  const b = promptForDay('2026-08-12', ['estoico'])
  check('el prompt del día es determinista', a.id === b.id)
  check('respeta la corriente elegida', a.stream === 'estoico')
  const dias = new Set(Array.from({ length: 60 }, (_, i) => promptForDay(`2026-09-${String((i % 30) + 1).padStart(2, '0')}`, ['estoico', 'filosofico', 'psicologico']).id))
  check('varía a lo largo del mes', dias.size > 15, `→ ${dias.size} distintos en 30 días`)
  check('reroll devuelve otro distinto', rerollPrompt('2026-08-12', ['estoico'], [a.id]).id !== a.id)
  check('catálogo completo', prompts().length === 107 && ejercicios().length === 47 && plantillas().length === 13)

  /* El ajuste de idioma del contenido tiene que cambiar el juego de verdad:
   * hasta ahora existía en Ajustes y no hacía nada. Y cada dominio cae al
   * español por separado, así que traducir las plantillas no puede dejar los
   * prompts vacíos. */
  setIdiomaContenido('en')
  check('en inglés hay 17 plantillas', plantillas().length === 17, `→ ${plantillas().length}`)
  check('las cuatro nuevas solo existen en inglés',
    plantillas().some((p) => p.id === 'five-paragraph'))
  check('los prompts caen al español mientras no estén traducidos', prompts().length === 107)
  check('y los ejercicios también', ejercicios().length === 47)
  setIdiomaContenido('es')
  check('en español vuelven a ser 13 plantillas', plantillas().length === 13)

  console.log('\n— markdown —')
  const rico = {
    type: 'doc', content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Capítulo' }] },
      { type: 'paragraph', content: [
        { type: 'text', text: 'Esto va en ', },
        { type: 'text', marks: [{ type: 'bold' }], text: 'negrita' },
        { type: 'text', text: ' y esto en ' },
        { type: 'text', marks: [{ type: 'italic' }], text: 'cursiva' },
        { type: 'text', text: '.' },
      ] },
      { type: 'bulletList', content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'uno' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'dos' }] }] },
      ] },
    ],
  }
  const out = docToMarkdown(rico as never)
  check('encabezado', out.includes('## Capítulo'))
  check('negrita y cursiva', out.includes('**negrita**') && out.includes('*cursiva*'))
  check('lista', out.includes('- uno') && out.includes('- dos'))

  console.log('\n— estadísticas y sincronización —')
  const gs = await globalStats()
  check('estadísticas globales', gs.novels === 1 && gs.essays === 1 && gs.therapyEntries === 1)
  const pend = await pendingCounts()
  check('todo pendiente de subir', (pend.journal_entries ?? 0) > 0 && (pend.projects ?? 0) === 2)

  console.log('\n— «en este día» —')
  await journal.create({ entry_date: '2023-08-12', title: 'Hace tres años', content_text: 'Una tarde de agosto de 2023.', word_count: 6 })
  await journal.create({ entry_date: '2024-08-12', title: 'Hace dos años', content_text: 'Otro doce de agosto.', word_count: 4 })
  await journal.create({ entry_date: '2024-08-13', title: 'El día siguiente', content_text: 'No debería salir.', word_count: 3 })
  await journal.create({ entry_date: '2027-08-12', title: 'Del futuro', content_text: 'Tampoco debería salir.', word_count: 3 })
  await journal.create({ entry_date: '2022-08-12', title: '', content_text: '', word_count: 0 })

  const recuerdos = await journal.onThisDay('2026-08-12')
  check('trae solo el mismo día y mes', recuerdos.every((e) => e.entry_date.endsWith('08-12')), `→ ${recuerdos.map(e=>e.entry_date).join(', ')}`)
  check('excluye años posteriores', !recuerdos.some((e) => e.entry_date.startsWith('2027')))
  check('excluye el día siguiente', !recuerdos.some((e) => e.entry_date === '2024-08-13'))
  check('descarta las entradas vacías', !recuerdos.some((e) => e.entry_date === '2022-08-12'))
  check('ordena de más reciente a más antigua', recuerdos[0]?.entry_date === '2024-08-12', `→ ${recuerdos[0]?.entry_date}`)
  check('cuenta los años con recuerdo', (await journal.onThisDayCount('2026-08-12')) === 2,
    `→ ${await journal.onThisDayCount('2026-08-12')}`)
  check('un día sin historia no devuelve nada', (await journal.onThisDay('2026-03-07')).length === 0)

  console.log('\n— objetivo diario y racha —')
  await setGoal(300)
  check('el objetivo se guarda', (await getGoal()) === 300)
  await recordDelta('journal', 120)
  await recordDelta('novel', 200)
  const hoy = await todayWords()
  check('suma los incrementos de varios módulos', hoy >= 320, `→ ${hoy}`)
  const st = await streaks(300)
  check('la racha cuenta el día cumplido', st.current === 1, `→ ${st.current}`)
  check('registra el día en el histórico', st.daysMetYear === 1, `→ ${st.daysMetYear}`)
  const st0 = await streaks(100000)
  check('un objetivo inalcanzable deja la racha a cero', st0.current === 0)

  console.log('\n— búsqueda global —')
  check('entrecomilla cada palabra', toMatchQuery('casa vacia') === '"casa" AND "vacia"*')
  check('neutraliza los operadores de FTS5', toMatchQuery('a AND* b:cd') === '"a" AND "AND" AND "b" AND "cd"*',
    `→ ${toMatchQuery('a AND* b:cd')}`)
  check('la última palabra de una letra no lleva comodín', toMatchQuery('hola a') === '"hola" AND "a"')
  check('devuelve null si no hay nada', toMatchQuery('   ') === null)
  check('sobrevive a solo símbolos', toMatchQuery('*** ::') === null)

  // Fixture propio: las escenas de la novela se borraron más arriba al probar
  // el borrado en cascada, así que la búsqueda necesita contenido vivo.
  await journal.create({
    entry_date: '2026-07-04',
    title: 'Tarde de tormenta',
    content_text: 'Llovía sobre Madrid y el café estaba frío. La casa vacía olía a cerrado.',
    word_count: 14,
  })

  const n = await rebuildIndex()
  check('el índice se construye', n > 0, `→ ${n} elementos`)
  check('indexSize coincide', (await indexSize()) === n)

  const r1 = await search('Llovía')
  check('encuentra texto dentro de una entrada', r1.some((h) => h.kind === 'journal' && h.title === 'Tarde de tormenta'), `→ ${r1.length}`)
  const r2 = await search('llovia')
  check('ignora las tildes', r2.length === r1.length && r2.length > 0)
  const r3 = await search('LLOVÍA')
  check('ignora las mayúsculas', r3.length === r1.length)
  const r4 = await search('Nadia')
  check('encuentra fichas de personaje', r4.some((h) => h.kind === 'character'), `→ ${r4.map(h=>h.kind).join(',')}`)
  const r5 = await search('vac')
  check('busca por prefijo mientras escribes', r5.length > 0, `→ ${r5.length}`)
  const r5b = await search('cafe')
  check('«cafe» encuentra «café»', r5b.length > 0, `→ ${r5b.length}`)
  const r5c = await search('Madrid tormenta')
  check('varias palabras exigen que estén todas', r5c.length === 1, `→ ${r5c.length}`)
  const r5d = await search('Madrid rinoceronte')
  check('si falta una palabra no hay resultado', r5d.length === 0)
  const r6 = await search('estanoexisteenningunsitio')
  check('sin resultados no revienta', r6.length === 0)
  const r7 = await search('casa', { kinds: ['project'] })
  check('filtra por tipo', r7.every((h) => h.kind === 'project'))
  const conSnippet = r1.find((h) => h.snippet.includes('«'))
  check('marca la coincidencia en el fragmento', Boolean(conSnippet), `→ ${JSON.stringify(r1[0]?.snippet ?? '')}`)

  // el índice sigue vivo tras editar y borrar
  const target = (await journal.byDate('2026-07-04'))[0]
  await journal.update(target.id, { content_text: 'palabraunicaindexada', word_count: 1 })
  check('reindexa al editar', (await search('palabraunicaindexada')).length === 1)
  await journal.remove(target.id)
  check('sale del índice al borrar', (await search('palabraunicaindexada')).length === 0)

  const kinds = { p1: 'essay', p2: 'novel' }
  check('ruta del diario',
    hitRoute({ kind: 'journal', refId: 'x', projectId: null, parent: null, date: '2026-08-12', title: '', snippet: '', rank: 0 }, kinds)
      === '/diario?entry=x&date=2026-08-12')
  check('ruta de un documento de ensayo',
    hitRoute({ kind: 'doc', refId: 'd', projectId: 'p1', parent: null, date: null, title: '', snippet: '', rank: 0 }, kinds)
      === '/ensayos?project=p1&doc=d')
  check('ruta de un documento de novela',
    hitRoute({ kind: 'doc', refId: 'd', projectId: 'p2', parent: null, date: null, title: '', snippet: '', rank: 0 }, kinds)
      === '/novela?project=p2&doc=d')

  // ── el fallo que dejó entradas vacías entre ordenadores ──
  console.log('\n— sincronización: formato de fechas —')
  // Postgres devuelve `+00:00`; la app escribe `Z`. Comparadas como texto, la
  // misma fecha salía distinta y el desempate por fecha se decidía al revés.
  const pg = '2026-08-12T15:21:47.036+00:00'
  const app = '2026-08-12T15:21:47.036Z'
  check('normaliza la fecha de Postgres a la de la app', aIso(pg) === app, `→ ${aIso(pg)}`)
  check('deja en paz lo que ya es ISO', aIso(app) === app)
  check('no rompe con null', aIso(null) === null)
  check('no rompe con basura', aIso('no soy una fecha') === 'no soy una fecha')
  check(
    'sin normalizar, el desempate se equivocaba',
    pg < app && String(aIso(pg)) === app,
    'la comparación de texto ponía la fecha de Postgres por detrás',
  )

  console.log('\n— sincronización: tablas indexables —')
  // Lo que baja del servidor tiene que entrar en el índice de búsqueda; si no,
  // aparece en el calendario pero no en Ctrl+K.
  const conTexto = ['journal_entries', 'documents', 'therapy_entries', 'characters', 'projects']
  for (const t of conTexto) {
    check(`${t} se reindexa al bajarla`, t in INDEXABLES)
  }

  // ── el fallo que borró entradas de verdad ──
  console.log('\n— sincronización: una fila vacía no se reenvía —')
  // Cadena real: llega una entrada que no se puede descifrar, se guarda en
  // blanco, el usuario pulsa «volver a subir todo», la fila vacía sube con rev
  // mayor y pisa la copia buena del servidor. El otro equipo se la baja y pisa
  // la suya. El texto desaparece de los dos ordenadores.
  const idConTexto = await journal.create({
    entry_date: '2026-08-20', title: 'Con texto',
    content_text: 'Esto sí tiene contenido', word_count: 4,
  })
  const enBlanco = await journal.create({
    entry_date: '2026-08-20', title: '', content_text: '', word_count: 0,
  })
  await run('UPDATE journal_entries SET dirty = 0')

  const marcadas = await volverASubirTodo()
  const sucia = async (id: string) =>
    (await one<{ dirty: number }>('SELECT dirty FROM journal_entries WHERE id = ?', [id]))?.dirty

  check('la entrada con texto se reenvía', (await sucia(idConTexto)) === 1)
  check('la entrada vacía NO se reenvía', (await sucia(enBlanco)) === 0)
  check('el recuento no cuenta las vacías', marcadas >= 1, `→ ${marcadas}`)

  const revs = await one<{ r: number }>('SELECT rev r FROM journal_entries WHERE id = ?', [enBlanco])
  check('a la vacía tampoco se le sube la revisión', (revs?.r ?? 0) === 1, `→ rev ${revs?.r}`)

  // ── reordenar arrastrando ──
  console.log('\n— reordenar: zonas de la fila —')
  check('tercio de arriba de una carpeta = antes', zonaDeSoltar(5, 40, true) === 'antes')
  check('centro de una carpeta = dentro', zonaDeSoltar(20, 40, true) === 'dentro')
  check('tercio de abajo de una carpeta = después', zonaDeSoltar(35, 40, true) === 'despues')
  check('un archivo solo tiene dos mitades', zonaDeSoltar(20, 40, false) === 'despues')
  check('la mitad de arriba de un archivo = antes', zonaDeSoltar(10, 40, false) === 'antes')
  check('altura cero no revienta', zonaDeSoltar(0, 0, true) === 'despues')

  console.log('\n— reordenar: orden resultante —')
  const lista = ['a', 'b', 'c', 'd']
  check('mover al principio', moverJunto(lista, 'c', 'a', 'antes').join() === 'c,a,b,d')
  check('mover al final', moverJunto(lista, 'a', 'd', 'despues').join() === 'b,c,d,a')
  // El clásico: arrastrar hacia abajo se queda corto si no se saca el elemento
  // de la lista antes de calcular el índice de destino.
  check('arrastrar hacia abajo cae donde se ve', moverJunto(lista, 'a', 'c', 'despues').join() === 'b,c,a,d')
  check('arrastrar hacia arriba cae donde se ve', moverJunto(lista, 'd', 'b', 'antes').join() === 'a,d,b,c')
  check('destino desconocido lo manda al final', moverJunto(lista, 'a', 'zz', 'antes').join() === 'b,c,d,a')

  const pos = posiciones(['x', 'y', 'z'])
  check('posiciones separadas de 100 en 100', pos.get('x') === 0 && pos.get('y') === 100 && pos.get('z') === 200)

  console.log('\n— reordenar: no romper el árbol —')
  const arbol = [
    { id: 'acto1', parent_id: null },
    { id: 'cap1', parent_id: 'acto1' },
    { id: 'esc1', parent_id: 'cap1' },
    { id: 'acto2', parent_id: null },
  ]
  check('un nieto es descendiente', esDescendiente(arbol, 'acto1', 'esc1'))
  check('un hermano no lo es', !esDescendiente(arbol, 'acto1', 'acto2'))
  check('uno mismo cuenta como descendiente', esDescendiente(arbol, 'cap1', 'cap1'))
  check('una carpeta no entra en su propio nieto', !sePuedeSoltar(arbol, 'acto1', 'esc1', 'dentro'))
  check('ni al lado de su propio nieto', !sePuedeSoltar(arbol, 'acto1', 'esc1', 'antes'))
  check('pero sí junto a un hermano', sePuedeSoltar(arbol, 'acto1', 'acto2', 'despues'))
  check('y una escena sí entra en un capítulo', sePuedeSoltar(arbol, 'esc1', 'acto2', 'dentro'))
  check('soltarse sobre sí mismo no vale', !sePuedeSoltar(arbol, 'cap1', 'cap1', 'antes'))

  const conCiclo = [
    { id: 'a', parent_id: 'b' },
    { id: 'b', parent_id: 'a' },
  ]
  check('un ciclo heredado no cuelga la comprobación', esDescendiente(conCiclo, 'zzz', 'a') === false)

  console.log(fails === 0 ? '\n✔ Todas las pruebas pasan\n' : `\n✖ ${fails} prueba(s) fallan\n`)
  process.exit(fails === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
