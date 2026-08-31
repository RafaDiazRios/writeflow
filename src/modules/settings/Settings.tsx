import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { AlertTriangle, Check, Cloud, Github, KeyRound, Keyboard, Languages, LogOut, Palette, RefreshCw, RotateCcw, Search, Sparkles, UploadCloud } from 'lucide-react'
import { useApp } from '@/store/app'
import { streamDesc, streamLabel } from '@/lib/prompts'
import {
  getCredentials, googleAuthUrl, isCloudConfigured, saveCredentials, signOut, REDIRECT_URL,
} from '@/lib/supabase'
import { backupToGitHub, getGitHubConfig, lastBackupAt, saveGitHubConfig, testGitHubToken, type GitHubConfig } from '@/lib/github'
import { openConflicts, resolveConflict, syncNow } from '@/lib/sync'
import ClaveCompartida from './ClaveCompartida'
import { pendingCounts } from '@/lib/repo'
import { indexedAt, indexSize, rebuildIndex } from '@/lib/search'
import type { PromptStream } from '@/lib/types'
import { num, fechaHora } from '@/i18n'
import { IDIOMAS, NOMBRE_IDIOMA, type Idioma } from '@/i18n'
import { useT } from '@/i18n/useT'

export default function Settings() {
  const t = useT()
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
        <h1 className="text-2xl font-semibold tracking-tight">{t('ajustes.titulo')}</h1>

        {/* ── Idioma ── */}
        <Section icon={<Languages size={16} />} title={t('ajustes.idioma.titulo')}>
          <Row label={t('ajustes.idioma.interfaz')} hint={t('ajustes.idioma.interfazAyuda')}>
            <Elector valor={app.uiLang} onElegir={(l) => app.setUiLang(l)} />
          </Row>
          <Row label={t('ajustes.idioma.contenido')} hint={t('ajustes.idioma.contenidoAyuda')}>
            <Elector valor={app.contentLang} onElegir={(l) => app.setContentLang(l)} />
          </Row>
          <Row label={t('ajustes.semana.titulo')} hint={t('ajustes.semana.ayuda')}>
            <div className="flex gap-1">
              {([1, 0] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => app.setWeekStart(v)}
                  className={`rounded px-3 py-1 text-xs transition ${
                    app.weekStart === v ? 'bg-accent-600 text-white' : 'bg-ink-100 dark:bg-ink-800'
                  }`}
                >
                  {v === 1 ? t('ajustes.semana.lunes') : t('ajustes.semana.domingo')}
                </button>
              ))}
            </div>
          </Row>
        </Section>

        {/* ── Apariencia ── */}
        <Section icon={<Palette size={16} />} title={t('ajustes.apariencia')}>
          <Row label={t('ajustes.tema')}>
            <div className="flex gap-1">
              {(['light', 'dark', 'system'] as const).map((tema) => (
                <button
                  key={tema}
                  onClick={() => app.setTheme(tema)}
                  className={`rounded px-3 py-1 text-xs transition ${
                    app.theme === tema ? 'bg-accent-600 text-white' : 'bg-ink-100 dark:bg-ink-800'
                  }`}
                >
                  {tema === 'light'
                    ? t('armazon.temaClaro')
                    : tema === 'dark'
                      ? t('armazon.temaOscuro')
                      : t('armazon.temaSistema')}
                </button>
              ))}
            </div>
          </Row>
          <Row label={t('ajustes.maquinaEscribir')} hint={t('ajustes.maquinaEscribirAyuda')}>
            <input type="checkbox" checked={app.typewriter} onChange={app.toggleTypewriter} />
          </Row>
          <Row label={t('ajustes.concentracion')} hint={t('ajustes.concentracionAyuda')}>
            <input type="checkbox" checked={app.focusMode} onChange={app.toggleFocus} />
          </Row>
        </Section>

        {/* ── Prompts ── */}
        <Section icon={<Sparkles size={16} />} title={t('ajustes.prompts')}>
          <p className="mb-3 text-xs text-ink-500 dark:text-ink-400">
            {t('ajustes.promptsAyuda')}
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
                  <div className="text-sm font-medium">{streamLabel(s)}</div>
                  <div className="text-xs text-ink-500 dark:text-ink-400">{streamDesc(s)}</div>
                </div>
              </label>
            ))}
          </div>
        </Section>

        {/* ── Búsqueda ── */}
        <Section icon={<Search size={16} />} title={t('ajustes.busqueda')}>
          <p className="mb-3 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
            {t('ajustes.busquedaAyuda', { ctrl: 'Ctrl', k: 'K' })}
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
                  app.notify('ok', t('ajustes.indiceHecho', { n }))
                } catch (e) {
                  app.notify('error', e instanceof Error ? e.message : String(e))
                } finally {
                  setIdxBusy(false)
                }
              }}
            >
              <RefreshCw size={14} className={idxBusy ? 'animate-spin' : ''} />
              {t('ajustes.reconstruirIndice')}
            </button>
            <span className="text-xs text-ink-500">
              {num(idx.n)} {t('unidad.elementos')}
              {idx.at ? ` · ${fechaHora(idx.at)}` : ''}
            </span>
          </div>
        </Section>

        {/* ── Cifrado ── */}
        <Section icon={<KeyRound size={16} />} title={t('ajustes.cifrado')}>
          <p className="mb-3 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
            {t('ajustes.cifradoAyuda')}
          </p>
          <div className="flex items-center gap-2">
            <span className={`chip ${app.unlocked ? '!border-emerald-300 !bg-emerald-50 !text-emerald-800' : ''}`}>
              {app.e2eConfigured
                ? app.unlocked
                  ? t('ajustes.desbloqueado')
                  : t('ajustes.bloqueado')
                : t('ajustes.sinConfigurar')}
            </span>
            <button className="btn-outline" onClick={() => app.set({ pendingUnlockRequest: true })}>
              {app.e2eConfigured ? t('cifrado.desbloquear') : t('ajustes.configurarFrase')}
            </button>
          </div>
        </Section>

        {/* ── Teclado ── */}
        <Section icon={<Keyboard size={16} />} title={t('ajustes.teclado')}>
          <p className="mb-3 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
            {t('ajustes.tecladoAyuda')}
          </p>
          <button
            className="btn-outline"
            onClick={() => void invoke('reiniciar')}
          >
            <RotateCcw size={14} /> {t('ajustes.reiniciar')}
          </button>
        </Section>

        {/* ── Supabase ── */}
        <Section icon={<Cloud size={16} />} title={t('ajustes.sincronizacion')}>
          <p className="mb-3 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
            {t('ajustes.supabaseAyuda', { redirect: REDIRECT_URL })}
          </p>
          <label className="label">{t('ajustes.urlProyecto')}</label>
          <input className="input mb-2" value={sbUrl} onChange={(e) => setSbUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
          <label className="label">{t('ajustes.clavePublica')}</label>
          <input className="input mb-3" value={sbKey} onChange={(e) => setSbKey(e.target.value)} placeholder={t('ajustes.clavePista')} />
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn-outline"
              onClick={async () => {
                await saveCredentials(sbUrl, sbKey)
                app.set({ cloudConfigured: await isCloudConfigured() })
                app.notify('ok', t('ajustes.credencialesGuardadas'))
              }}
            >
              {t('ajustes.guardar')}
            </button>
            <button
              className="btn-primary"
              disabled={!sbUrl || !sbKey}
              onClick={async () => {
                try {
                  const url = await googleAuthUrl()
                  await openUrl(url)
                  app.notify('info', t('ajustes.terminaNavegador'))
                } catch (e) {
                  app.notify('error', e instanceof Error ? e.message : String(e))
                }
              }}
            >
              {t('ajustes.entrarGoogle')}
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
                  <LogOut size={14} /> {t('ajustes.cerrarSesion')}
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
                else app.notify('ok', t('armazon.sincronizadoCorto', { subidas: r.pushed, bajadas: r.pulled }))
              }}
            >
              {t('armazon.sincronizarAhora')}
            </button>
            <span>
              {app.lastSync
                ? t('ajustes.ultimaVez', { cuando: fechaHora(app.lastSync) })
                : t('ajustes.sinSincronizar')}
            </span>
            {Object.keys(pending).length > 0 && (
              <span>
                {t('ajustes.filasPendientes', {
                  n: Object.values(pending).reduce((a, b) => a + b, 0),
                })}
              </span>
            )}
          </div>

          <ClaveCompartida />

          {conflicts.length > 0 && (
            <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-amber-900 dark:text-amber-200">
                <AlertTriangle size={15} />{' '}
                {conflicts.length === 1
                  ? t('ajustes.conflictoUno')
                  : t('ajustes.conflictos', { n: conflicts.length })}
              </p>
              <p className="mb-2 text-xs text-amber-800 dark:text-amber-300">
                {t('ajustes.conflictosAyuda')}
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
                    {t('ajustes.conservarEsta')}
                  </button>
                  <button
                    className="btn-outline !py-0.5"
                    onClick={async () => {
                      await resolveConflict(c.id, 'remote')
                      setConflicts(await openConflicts())
                    }}
                  >
                    {t('ajustes.traerNube')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ── GitHub ── */}
        <Section icon={<Github size={16} />} title={t('ajustes.github')}>
          <p className="mb-3 text-xs leading-relaxed text-ink-500 dark:text-ink-400">
            {t('ajustes.githubAyuda', { permiso: 'Contents: read and write' })}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">{t('ajustes.propietario')}</label>
              <input className="input" value={gh.owner} onChange={(e) => setGh({ ...gh, owner: e.target.value })} placeholder={t('ajustes.propietarioPista')} />
            </div>
            <div>
              <label className="label">{t('ajustes.repositorio')}</label>
              <input className="input" value={gh.repo} onChange={(e) => setGh({ ...gh, repo: e.target.value })} placeholder={t('ajustes.repositorioPista')} />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="label">{t('ajustes.token')}</label>
              <input className="input" type="password" value={gh.token} onChange={(e) => setGh({ ...gh, token: e.target.value })} placeholder="github_pat_…" />
            </div>
            <div>
              <label className="label">{t('ajustes.rama')}</label>
              <input className="input" value={gh.branch} onChange={(e) => setGh({ ...gh, branch: e.target.value })} />
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={gh.includePrivate}
              onChange={(e) => setGh({ ...gh, includePrivate: e.target.checked })}
            />
            {t('ajustes.incluirPrivado')}
            <span className="text-xs text-ink-400">{t('ajustes.incluirPrivadoAviso')}</span>
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              className="btn-outline"
              onClick={async () => {
                await saveGitHubConfig(gh)
                app.notify('ok', t('ajustes.githubGuardado'))
              }}
            >
              {t('ajustes.guardar')}
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
              {t('ajustes.probarConexion')}
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
                  setGhStatus(t('ajustes.respaldoHecho', { n: r.files }))
                  app.notify('ok', t('ajustes.respaldoSubido'))
                } catch (e) {
                  const msg = e instanceof Error ? e.message : String(e)
                  setGhStatus(msg)
                  app.notify('error', msg)
                } finally {
                  setGhBusy(false)
                }
              }}
            >
              <UploadCloud size={15} /> {ghBusy ? t('ajustes.subiendo') : t('ajustes.respaldarAhora')}
            </button>
            {ghLast && (
              <span className="text-xs text-ink-500">
                {t('ajustes.ultimo', { cuando: fechaHora(ghLast) })}
              </span>
            )}
          </div>
          {ghStatus && <p className="mt-2 text-xs text-ink-600 dark:text-ink-300">{ghStatus}</p>}
        </Section>

        {/* ── Info ── */}
        <Section title={t('ajustes.instalacion')}>
          <dl className="space-y-1 text-xs text-ink-500 dark:text-ink-400">
            <div className="flex gap-2">
              <dt className="w-28 shrink-0">{t('ajustes.version')}</dt>
              <dd>{info?.version ?? '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-28 shrink-0">{t('ajustes.baseDatos')}</dt>
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

/** Los dos ajustes de idioma comparten pinta: se elige de la misma manera. */
function Elector({ valor, onElegir }: { valor: Idioma; onElegir: (l: Idioma) => void }) {
  return (
    <div className="flex gap-1">
      {IDIOMAS.map((l) => (
        <button
          key={l}
          onClick={() => onElegir(l)}
          className={`rounded px-3 py-1 text-xs transition ${
            valor === l ? 'bg-accent-600 text-white' : 'bg-ink-100 dark:bg-ink-800'
          }`}
        >
          {NOMBRE_IDIOMA[l]}
        </button>
      ))}
    </div>
  )
}
