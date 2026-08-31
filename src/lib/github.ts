import { getMeta, query, setMeta } from './db'
import type { Doc, JournalEntry, Project, TherapyEntry } from './types'
import { toISODate } from './dates'
import { fechaHora } from '@/i18n'

/**
 * Copia de seguridad versionada en GitHub.
 *
 * Supabase es la sincronización viva entre dispositivos; GitHub es el archivo
 * histórico: un volcado en Markdown legible, con un commit por respaldo, que
 * seguirá siendo tuyo aunque algún día no exista esta aplicación.
 *
 * Usa la API REST de GitHub con un token personal de alcance mínimo (`repo`),
 * guardado solo en la base local. No hace falta tener git instalado.
 */

const API = 'https://api.github.com'

export interface GitHubConfig {
  token: string
  owner: string
  repo: string
  branch: string
  /** Volcar también el diario y la terapia (contenido privado). */
  includePrivate: boolean
}

export async function getGitHubConfig(): Promise<GitHubConfig> {
  return {
    token: (await getMeta('gh_token')) ?? '',
    owner: (await getMeta('gh_owner')) ?? '',
    repo: (await getMeta('gh_repo')) ?? '',
    branch: (await getMeta('gh_branch')) ?? 'main',
    includePrivate: (await getMeta('gh_include_private')) === '1',
  }
}

export async function saveGitHubConfig(cfg: GitHubConfig) {
  await setMeta('gh_token', cfg.token.trim())
  await setMeta('gh_owner', cfg.owner.trim())
  await setMeta('gh_repo', cfg.repo.trim())
  await setMeta('gh_branch', cfg.branch.trim() || 'main')
  await setMeta('gh_include_private', cfg.includePrivate ? '1' : '0')
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  }
}

function b64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin)
}

function slug(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'sin-titulo'
  )
}

function frontMatter(obj: Record<string, unknown>): string {
  const lines = Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? JSON.stringify(v) : v}`)
  return `---\n${lines.join('\n')}\n---\n\n`
}

/** Construye el árbol de archivos Markdown que se subirá. */
export async function buildBackupFiles(includePrivate: boolean): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  const alive = 'deleted_at IS NULL'

  if (includePrivate) {
    const entries = await query<JournalEntry>(
      `SELECT * FROM journal_entries WHERE ${alive} ORDER BY entry_date`,
    )
    for (const e of entries) {
      const path = `diario/${e.entry_date.slice(0, 4)}/${e.entry_date}-${slug(e.title || e.id.slice(0, 6))}.md`
      files[path] =
        frontMatter({
          id: e.id,
          fecha: e.entry_date,
          titulo: e.title,
          animo: e.mood,
          energia: e.energy,
          lugar: e.place,
          prompt: e.prompt_text,
          palabras: e.word_count,
        }) + (e.content_text || '')
    }

    const th = await query<TherapyEntry>(
      `SELECT * FROM therapy_entries WHERE ${alive} ORDER BY session_date`,
    )
    for (const t of th) {
      const path = `terapia/${t.session_date.slice(0, 4)}/${t.session_date}-${slug(t.exercise_name || t.id.slice(0, 6))}.md`
      let body = t.content_text || ''
      try {
        const fu = JSON.parse(t.followups) as { q: string; a: string }[]
        if (fu.length) {
          body += '\n\n## Preguntas de seguimiento\n\n'
          for (const f of fu) body += `**${f.q}**\n\n${f.a || '_(sin respuesta)_'}\n\n`
        }
      } catch {
        /* ignora seguimientos mal formados */
      }
      files[path] =
        frontMatter({
          id: t.id,
          fecha: t.session_date,
          ejercicio: t.exercise_name,
          escuela: t.school,
          nivel: t.level,
          consigna: t.prompt_text,
        }) + body
    }
  }

  const projs = await query<Project>(`SELECT * FROM projects WHERE ${alive}`)
  for (const p of projs) {
    const root = p.kind === 'novel' ? 'novelas' : 'ensayos'
    const base = `${root}/${slug(p.title)}`
    files[`${base}/00-proyecto.md`] =
      frontMatter({
        id: p.id,
        tipo: p.kind,
        titulo: p.title,
        subtitulo: p.subtitle,
        genero: p.genre,
        plantilla: p.template_id,
        objetivo_palabras: p.target_words,
        estado: p.status,
      }) + [p.logline, p.synopsis].filter(Boolean).join('\n\n')

    const ds = await query<Doc>(
      `SELECT * FROM documents WHERE project_id = ? AND ${alive} ORDER BY position`,
      [p.id],
    )
    ds.forEach((d, i) => {
      const n = String(i + 1).padStart(2, '0')
      files[`${base}/${n}-${slug(d.title)}.md`] =
        frontMatter({
          id: d.id,
          tipo: d.kind,
          titulo: d.title,
          sinopsis: d.synopsis,
          estado: d.status,
          pov: d.pov,
          palabras: d.word_count,
        }) + (d.content_text || '')
    })

    if (p.kind === 'novel') {
      const chars = await query<Record<string, unknown>>(
        `SELECT * FROM characters WHERE project_id = ? AND ${alive} ORDER BY name`,
        [p.id],
      )
      for (const c of chars) {
        files[`${base}/personajes/${slug(String(c.name))}.md`] =
          frontMatter({ id: c.id, nombre: c.name, rol: c.role, edad: c.age }) +
          [
            c.appearance && `## Aspecto\n\n${c.appearance}`,
            c.personality && `## Carácter\n\n${c.personality}`,
            c.goal && `## Quiere\n\n${c.goal}`,
            c.motivation && `## Por qué\n\n${c.motivation}`,
            c.conflict && `## Qué se lo impide\n\n${c.conflict}`,
            c.arc && `## Arco\n\n${c.arc}`,
            c.backstory && `## Pasado\n\n${c.backstory}`,
            c.voice && `## Voz\n\n${c.voice}`,
            c.secrets && `## Secretos\n\n${c.secrets}`,
            c.notes && `## Notas\n\n${c.notes}`,
          ]
            .filter(Boolean)
            .join('\n\n')
      }
    }
  }

  files['README.md'] =
    `# Archivo de escritura\n\nRespaldo generado por **WriteFlow** el ${fechaHora(new Date())}.\n\n` +
    `- \`diario/\` — entradas del diario por año\n- \`terapia/\` — sesiones de escritura terapéutica\n` +
    `- \`novelas/\` — proyectos de novela con capítulos, escenas y fichas de personaje\n- \`ensayos/\` — ensayos por plantilla\n\n` +
    `Cada archivo lleva metadatos en el encabezado YAML. Este respaldo es texto plano: se puede leer sin la aplicación.\n`

  return files
}

async function getRef(cfg: GitHubConfig): Promise<string> {
  const r = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}/git/ref/heads/${cfg.branch}`, {
    headers: headers(cfg.token),
  })
  if (!r.ok) throw new Error(`No se pudo leer la rama ${cfg.branch}: ${r.status} ${await r.text()}`)
  const j = await r.json()
  return j.object.sha as string
}

/**
 * Sube todo el respaldo en UN commit usando la API de árboles de Git
 * (mucho más rápido y limpio que un commit por archivo).
 */
export async function backupToGitHub(
  onProgress?: (msg: string) => void,
): Promise<{ commitUrl: string; files: number }> {
  const cfg = await getGitHubConfig()
  if (!cfg.token || !cfg.owner || !cfg.repo) {
    throw new Error('Falta configurar el token, el propietario o el repositorio de GitHub')
  }

  onProgress?.('Generando archivos Markdown…')
  const files = await buildBackupFiles(cfg.includePrivate)
  const paths = Object.keys(files)
  if (!paths.length) throw new Error('No hay nada que respaldar todavía')

  onProgress?.('Leyendo el estado de la rama…')
  const baseSha = await getRef(cfg)
  const commitRes = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}/git/commits/${baseSha}`, {
    headers: headers(cfg.token),
  })
  const baseCommit = await commitRes.json()

  onProgress?.(`Subiendo ${paths.length} archivos…`)
  const tree: { path: string; mode: '100644'; type: 'blob'; sha: string }[] = []
  for (const path of paths) {
    const blobRes = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}/git/blobs`, {
      method: 'POST',
      headers: headers(cfg.token),
      body: JSON.stringify({ content: b64(files[path]), encoding: 'base64' }),
    })
    if (!blobRes.ok) throw new Error(`Error subiendo ${path}: ${await blobRes.text()}`)
    const blob = await blobRes.json()
    tree.push({ path: `archivo/${path}`, mode: '100644', type: 'blob', sha: blob.sha })
  }

  onProgress?.('Creando el commit…')
  const treeRes = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}/git/trees`, {
    method: 'POST',
    headers: headers(cfg.token),
    body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }),
  })
  if (!treeRes.ok) throw new Error(`Error creando el árbol: ${await treeRes.text()}`)
  const newTree = await treeRes.json()

  const message = `Respaldo de escritura — ${toISODate()} (${paths.length} archivos)`
  const newCommitRes = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}/git/commits`, {
    method: 'POST',
    headers: headers(cfg.token),
    body: JSON.stringify({ message, tree: newTree.sha, parents: [baseSha] }),
  })
  if (!newCommitRes.ok) throw new Error(`Error creando el commit: ${await newCommitRes.text()}`)
  const newCommit = await newCommitRes.json()

  const updRes = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}/git/refs/heads/${cfg.branch}`, {
    method: 'PATCH',
    headers: headers(cfg.token),
    body: JSON.stringify({ sha: newCommit.sha, force: false }),
  })
  if (!updRes.ok) throw new Error(`Error moviendo la rama: ${await updRes.text()}`)

  await setMeta('gh_last_backup', new Date().toISOString())
  onProgress?.('Respaldo completado')
  return { commitUrl: newCommit.html_url as string, files: paths.length }
}

export async function lastBackupAt(): Promise<string | null> {
  return getMeta('gh_last_backup')
}

export async function testGitHubToken(cfg: GitHubConfig): Promise<string> {
  const r = await fetch(`${API}/repos/${cfg.owner}/${cfg.repo}`, { headers: headers(cfg.token) })
  if (!r.ok) throw new Error(`GitHub respondió ${r.status}. Revisa el token y el nombre del repositorio.`)
  const j = await r.json()
  return `Conectado a ${j.full_name} (${j.private ? 'privado' : 'público'})`
}
