import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import {
  AlertTriangle, Check, Cloud, Github, Keyboard, KeyRound, LogOut, Palette, RefreshCw, RotateCcw,
  Search, Sparkles, UploadCloud,
} from 'lucide-react'
import { useApp } from '@/store/app'
import { STREAM_DESC, STREAM_LABEL } from '@/lib/prompts'
import {
  getCredentials, googleAuthUrl, isCloudConfigured, saveCredentials, signOut, REDIRECT_URL,
} from '@/lib/supabase'
import { backupToGitHub, getGitHubConfig, lastBackupAt, saveGitHubConfig, testGitHubToken, type GitHubConfig } from '@/lib/github'
import { openConflicts, resolveConflict, syncNow } from '@/lib/sync'
import ClaveCompartida from './ClaveCompartida'
import { pendingCounts } from '@/lib/repo'
import { indexedAt, indexSize, rebuildIndex } from '@/lib/search'
import type { PromptStream } from '@/lib/types'

export default function Settings() {
  const app = useApp()
  const [info, setInfo] = useState<{ version: string; dataDir: string; dbPath: string } | null>(null)
  const [sbUrl, setSbUrl] = useState('')
  const [sbKey, setSbKey] = useState('')
  const [gh, setGh] = useState<GitHubConfig>({ token: '', owner: '', repo: '', branch: 'main', includePrivate: false })
  const [ghStatus, setGhStatus] = useState<string | null>(null)
  const [ghBusy, setGhBusy] = useState(false)
  const [ghLast, setGhLast] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<Awaited<ReturnType<typeof openConflicts>>>([])
  const [pending, setPending] = useState<Record<string, number>>({})
  const [idx, setIdx] = useState<{ n: number; at: string | null }>({ n: 0, at: null })
  const [idxBusy, setIdxBusy] = useState(false)

  useEffect(() => {
    invoke<{ version: string; dataDir: string; dbPath: string }>('app_info').then(setInfo).catch(() => {})
    getCredentials().then(({ url, key }) => {
      setSbUrl(url)
      setSbKey(key)
    })
    getGitHubConfig().then(setGh)
    lastBackupAt().then(setGhLast)
    openConflicts().then(setConflicts)
    pendingCounts().then(setPending)
    Promise.all([indexSize(), indexedAt()]).then(([n, at]) => setIdx({ n, at }))
  }, [])

  function toggleStream(s: PromptStream) {
    const next = app.streams.includes(s) ? app.streams.filter((x) => x !== s) : [...app.streams, s]
    if (next.length === 0) return
    app.updateStreams(next)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:space-y-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>

        {/* ── Apariencia ── */}
        <Section icon={<Palette size={16} />} title="Apariencia y escritura">
          <Row label="Tema">
            <div className="flex gap-1">
              {(['light', 'dark', 'system'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => app.setTheme(t)}
                  className={`rounded px-3 py-1 text-xs transition ${
                    app.theme === t ? 'bg-accent-600 text-white' : 'bg-ink-100 dark:bg-ink-800'
                  }`}
                >
                  {t === 'light' ? 'Claro' : t === 'dark' ? 'Oscuro' : 'Sistema'}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Modo máquina de escribir" hint="Mantiene la línea activa centrada en la pantalla.">
            <input type="checkbox" checked={app.typewriter} onChange={app.toggleTypewriter} />
          </Row>
          <Row label="Modo concentración" hint="Atenúa todo menos el párrafo que estás escribiendo (Ctrl+Shift+F).">
            <input type="checkbox" checked={app.focusMode} onChange={app.toggleFocus} />
          </Row>
        </Section>

        {/* ── Prompts ── */}
        <Section icon={<Sparkles size={16} />} title="Prompts del diario">
          <p className="mb-3 text-xs text-ink-500 dark:text-ink-400">
            Elige de qué corrientes quieres recibir la sugerencia diaria. El prompt es el mismo
            durante todo el día y se calcula sin conexión.
          </p>
          <div className="space-y-2">
            {(['estoico', 'filosofico', 'psicologico'] as PromptStream[]).map((s) => (
              <label key={s} className="flex cursor-pointer items-start gap-2.5 rounded-md border border-ink-200 p-2.5 dark:border-ink-800">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={app.streams.includes(s)}
                  onChange={() => toggleStream(s)}
                />
                <div>
                  <div className="text-sm font-medium">{STREAM_LABEL[s]}</div>
                  <div className="text-xs text-ink-500 dark:text-ink-400">{STREAM_DESC[s]}</div>
                </div>
              </label>
            ))}
          </div>
        </Section>

        {/* ── Búsqueda ── */}
        <Section icon={<Search size={16} />} title="Búsqueda global">
          <p className="mb-3 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
            <kbd className="rounded bg-ink-100 px-1 dark:bg-ink-800">Ctrl</kbd> +{' '}
            <kbd className="rounded bg-ink-100 px-1 dark:bg-ink-800">K</kbd> abre el buscador desde
            cualquier pantalla. Busca por palabras completas en el diario, los documentos, las
            fichas de personaje y la terapia, sin distinguir mayúsculas ni tildes. El índice se
            actualiza solo al escribir; reconstruirlo solo hace falta si notas que falta algo.
          </p>
          <div className="flex items-center gap-3">
            <button
              className="btn-outline"
              disabled={idxBusy}
              onClick={async () => {
                setIdxBusy(true)
                try {
                  const n = await rebuildIndex()
                  setIdx({ n, at: new Date().toISOString() })
                  app.notify('ok', `Índice reconstruido: ${n} elementos`)
                } catch (e) {
                  app.notify('error', e instanceof Error ? e.message : String(e))
                } finally {
                  setIdxBusy(false)
                }
              }}
            >
              <RefreshCw size={14} className={idxBusy ? 'animate-spin' : ''} />
              Reconstruir el índice
            </button>
            <span className="text-xs text-ink-500">
              {idx.n.toLocaleString('es-ES')} elementos indexados
              {idx.at ? ` · ${new Date(idx.at).toLocaleString('es-ES')}` : ''}
            </span>
          </div>
        </Section>

        {/* ── Cifrado ── */}
        <Section icon={<KeyRound size={16} />} title="Cifrado de extremo a extremo">
          <p className="mb-3 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
            El diario y la escritura terapéutica se cifran en este ordenador antes de subirse. La
            novela y los ensayos viajan en claro para poder buscarlos en el servidor.
          </p>
          <div className="flex items-center gap-2">
            <span className={`chip ${app.unlocked ? '!border-emerald-300 !bg-emerald-50 !text-emerald-800' : ''}`}>
              {app.e2eConfigured ? (app.unlocked ? 'Desbloqueado' : 'Bloqueado') : 'Sin configurar'}
            </span>
            <button className="btn-outline" onClick={() => app.set({ pendingUnlockRequest: true })}>
              {app.e2eConfigured ? 'Desbloquear' : 'Configurar frase de paso'}
            </button>
          </div>
        </Section>

        {/* ── Teclado ── */}
        <Section icon={<Keyboard size={16} />} title="Teclado">
          <p className="mb-3 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
            Si cambias la distribución del teclado de Windows con WriteFlow ya abierto, el motor web
            que usa la aplicación puede quedarse con la anterior: escribes en español y salen las
            teclas inglesas, sin tildes ni ñ. Es un fallo conocido de WebView2, el componente de
            Microsoft, y no hay forma de arreglarlo desde aquí. Reiniciar la aplicación lo resuelve
            siempre. No se pierde nada: lo escrito se guarda solo.
          </p>
          <button
            className="btn-outline"
            onClick={() => void invoke('reiniciar')}
          >
            <RotateCcw size={14} /> Reiniciar WriteFlow
          </button>
        </Section>

        {/* ── Supabase ── */}
        <Section icon={<Cloud size={16} />} title="Sincronización (Supabase)">
          <p className="mb-3 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
            Pega aquí la URL y la clave pública (anon) de tu proyecto. En Supabase → Authentication →
            URL Configuration añade <code className="rounded bg-ink-100 px-1 dark:bg-ink-800">{REDIRECT_URL}</code>{' '}
            como Redirect URL para que el login con Google pueda volver a la aplicación.
          </p>
          <label className="label">URL del proyecto</label>
          <input className="input mb-2" value={sbUrl} onChange={(e) => setSbUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
          <label className="label">Clave pública (anon / publishable)</label>
          <input className="input mb-3" value={sbKey} onChange={(e) => setSbKey(e.target.value)} placeholder="sb_publishable_… o eyJhbGci…" />
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn-outline"
              onClick={async () => {
                await saveCredentials(sbUrl, sbKey)
                app.set({ cloudConfigured: await isCloudConfigured() })
                app.notify('ok', 'Credenciales guardadas')
              }}
            >
              Guardar
            </button>
            <button
              className="btn-primary"
              disabled={!sbUrl || !sbKey}
              onClick={async () => {
                try {
                  const url = await googleAuthUrl()
                  await openUrl(url)
                  app.notify('info', 'Termina el inicio de sesión en el navegador; volverás aquí automáticamente.')
                } catch (e) {
                  app.notify('error', e instanceof Error ? e.message : String(e))
                }
              }}
            >
              Iniciar sesión con Google
            </button>
            {app.signedIn && (
              <>
                <span className="chip !border-emerald-300 !bg-emerald-50 !text-emerald-800">
                  <Check size={12} /> {app.userEmail}
                </span>
                <button
                  className="btn-ghost"
                  onClick={async () => {
                    await signOut()
                    app.set({ signedIn: false, userEmail: null })
                  }}
                >
                  <LogOut size={14} /> Cerrar sesión
                </button>
              </>
            )}
          </div>

          <div className="mt-4 flex items-center gap-3 text-xs text-ink-500">
            <button
              className="btn-outline"
              disabled={app.syncing}
              onClick={async () => {
                app.set({ syncing: true })
                const r = await syncNow()
                app.set({ syncing: false, lastSync: r.finishedAt })
                setPending(await pendingCounts())
                setConflicts(await openConflicts())
                if (r.errors.length) app.notify('error', r.errors[0])
                else app.notify('ok', `Subidas ${r.pushed}, bajadas ${r.pulled}`)
              }}
            >
              Sincronizar ahora
            </button>
            <span>
              {app.lastSync ? `Última vez: ${new Date(app.lastSync).toLocaleString('es-ES')}` : 'Sin sincronizar todavía'}
            </span>
            {Object.keys(pending).length > 0 && (
              <span>· {Object.values(pending).reduce((a, b) => a + b, 0)} filas pendientes</span>
            )}
          </div>

          <ClaveCompartida />

          {conflicts.length > 0 && (
            <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-amber-900 dark:text-amber-200">
                <AlertTriangle size={15} /> {conflicts.length} conflicto(s) de sincronización
              </p>
              <p className="mb-2 text-xs text-amber-800 dark:text-amber-300">
                Editaste lo mismo en dos sitios. No se ha perdido nada: elige qué versión conservar.
              </p>
              {conflicts.map((c) => (
                <div key={c.id} className="mb-1.5 flex items-center gap-2 text-xs">
                  <span className="font-mono">{c.table_name}</span>
                  <span className="text-ink-500">{c.row_id.slice(0, 8)}</span>
                  <button
                    className="btn-outline !py-0.5 ml-auto"
                    onClick={async () => {
                      await resolveConflict(c.id, 'local')
                      setConflicts(await openConflicts())
                    }}
                  >
                    Conservar esta copia
                  </button>
                  <button
                    className="btn-outline !py-0.5"
                    onClick={async () => {
                      await resolveConflict(c.id, 'remote')
                      setConflicts(await openConflicts())
                    }}
                  >
                    Traer la de la nube
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── GitHub ── */}
        <Section icon={<Github size={16} />} title="Respaldo en GitHub">
          <p className="mb-3 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
            Vuelca todo tu trabajo como archivos Markdown en un repositorio privado, en un solo
            commit. Es tu archivo histórico: texto plano que se puede leer sin esta aplicación.
            Crea un token con permiso <code className="rounded bg-ink-100 px-1 dark:bg-ink-800">Contents: read and write</code>{' '}
            sobre ese repositorio.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Propietario</label>
              <input className="input" value={gh.owner} onChange={(e) => setGh({ ...gh, owner: e.target.value })} placeholder="tu-usuario" />
            </div>
            <div>
              <label className="label">Repositorio</label>
              <input className="input" value={gh.repo} onChange={(e) => setGh({ ...gh, repo: e.target.value })} placeholder="mi-archivo-de-escritura" />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="label">Token de acceso</label>
              <input className="input" type="password" value={gh.token} onChange={(e) => setGh({ ...gh, token: e.target.value })} placeholder="github_pat_…" />
            </div>
            <div>
              <label className="label">Rama</label>
              <input className="input" value={gh.branch} onChange={(e) => setGh({ ...gh, branch: e.target.value })} />
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={gh.includePrivate}
              onChange={(e) => setGh({ ...gh, includePrivate: e.target.checked })}
            />
            Incluir también el diario y la terapia
            <span className="text-xs text-ink-400">(en claro: usa un repositorio privado)</span>
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              className="btn-outline"
              onClick={async () => {
                await saveGitHubConfig(gh)
                app.notify('ok', 'Configuración de GitHub guardada')
              }}
            >
              Guardar
            </button>
            <button
              className="btn-outline"
              onClick={async () => {
                try {
                  setGhStatus(await testGitHubToken(gh))
                } catch (e) {
                  setGhStatus(e instanceof Error ? e.message : String(e))
                }
              }}
            >
              Probar conexión
            </button>
            <button
              className="btn-primary"
              disabled={ghBusy || !gh.token || !gh.owner || !gh.repo}
              onClick={async () => {
                setGhBusy(true)
                try {
                  await saveGitHubConfig(gh)
                  const r = await backupToGitHub((m) => setGhStatus(m))
                  setGhLast(new Date().toISOString())
                  setGhStatus(`Respaldo hecho: ${r.files} archivos`)
                  app.notify('ok', 'Respaldo subido a GitHub')
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e)
                  setGhStatus(msg)
                  app.notify('error', msg)
                } finally {
                  setGhBusy(false)
                }
              }}
            >
              <UploadCloud size={15} /> {ghBusy ? 'Subiendo…' : 'Respaldar ahora'}
            </button>
            {ghLast && (
              <span className="text-xs text-ink-500">
                Último: {new Date(ghLast).toLocaleString('es-ES')}
              </span>
            )}
          </div>
          {ghStatus && <p className="mt-2 text-xs text-ink-600 dark:text-ink-300">{ghStatus}</p>}
        </Section>

        {/* ── Info ── */}
        <Section title="Sobre esta instalación">
          <dl className="space-y-1 text-xs text-ink-500 dark:text-ink-400">
            <div className="flex gap-2">
              <dt className="w-28 shrink-0">Versión</dt>
              <dd>{info?.version ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0">Base de datos</dt>
              <dd className="break-all font-mono">{info?.dbPath ?? '—'}</dd>
            </div>
          </dl>
        </Section>
      </div>
    </div>
  )
}

function Section({
  title, icon, children,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}

function Row({
  label, hint, children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-4 border-b border-ink-100 py-2 last:border-0 dark:border-ink-800">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-ink-500 dark:text-ink-400">{hint}</div>}
      </div>
      <div className="ml-auto shrink-0">{children}</div>
    </div>
  )
}
