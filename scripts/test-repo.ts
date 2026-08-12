/* Prueba de integración del esquema local y de los repositorios.
   Se ejecuta contra un SQLite real (node:sqlite) mediante un sustituto del
   plugin de Tauri, así que valida el SQL de verdad, no una imitación. */
import { db, getMeta, setMeta } from '../src/lib/db'
import { beats, characters, docs, globalStats, journal, pendingCounts, projects, tags, therapy, threads } from '../src/lib/repo'
import { countWords, docToText, EMPTY_DOC, textToDoc } from '../src/lib/text'
import { docToMarkdown, compileProject } from '../src/lib/export'
import { promptForDay, rerollPrompt, PROMPTS, EXERCISES, TEMPLATES, suggestExercise } from '../src/lib/prompts'

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
  const plantilla = TEMPLATES.find(t => t.id === 'persuasive-toulmin')!
  const ensId = await projects.create({ kind: 'essay', title: 'Sobre el ruido', template_id: plantilla.id })
  for (const [i, s] of plantilla.sections.entries()) {
    await docs.create({ project_id: ensId, kind: 'section', title: s.title, guide: s.guide, target_words: s.suggested_words, position: i * 100 })
  }
  const secs = await docs.forProject(ensId)
  check('secciones creadas desde la plantilla', secs.length === plantilla.sections.length)
  check('la guía se conserva', secs[0].guide === plantilla.sections[0].guide)
  check('novelas y ensayos no se mezclan', (await projects.list('novel')).length === 1 && (await projects.list('essay')).length === 1)

  console.log('\n— terapia —')
  const ex = EXERCISES[0]
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
  check('catálogo completo', PROMPTS.length === 107 && EXERCISES.length === 47 && TEMPLATES.length === 13)

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

  console.log(fails === 0 ? '\n✔ Todas las pruebas pasan\n' : `\n✖ ${fails} prueba(s) fallan\n`)
  process.exit(fails === 0 ? 0 : 1)
}

main().catch(e => { console.error(e); process.exit(1) })
