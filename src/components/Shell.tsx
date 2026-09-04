import { NavLink, useNavigate } from 'react-router-dom'
import {
  BookOpen, CalendarDays, Cloud, CloudOff, Feather, Focus, Home as HomeIcon, Lock, Moon,
  RefreshCw, ScrollText, Search, Settings as SettingsIcon, Sun, Unlock, Wind,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import GlobalSearch from './GlobalSearch'
import Divisor, { useAnchoPanel } from './Divisor'
import { ensureIndex } from '@/lib/search'
import { useApp } from '@/store/app'
import { syncNow, startAutoSync, stopAutoSync } from '@/lib/sync'
import { pendingCounts } from '@/lib/repo'
import { lock } from '@/lib/crypto'
import { useT } from '@/i18n/useT'

/* El rótulo es una clave, no el texto: se traduce al pintar. */
const NAV = [
  { to: '/', clave: 'nav.inicio', icon: HomeIcon, end: true },
  { to: '/diario', clave: 'nav.diario', icon: CalendarDays },
  { to: '/novela', clave: 'nav.novela', icon: BookOpen },
  { to: '/ensayos', clave: 'nav.ensayos', icon: ScrollText },
  { to: '/terapia', clave: 'nav.terapia', icon: Wind },
]

export default function Shell({ children }: { children: React.ReactNode }) {
  const t = useT()
  const app = useApp()
  const navigate = useNavigate()
  const [searchOpen, setSearchOpen] = useState(false)
  /* Los 212 px de siempre siguen siendo el ancho de fábrica, y el doble clic en
   * la barra vuelve a ellos. El mínimo deja sitio al rótulo con su icono. */
  const barra = useAnchoPanel('ancho_barra_lateral', 212, 180, 420)

  // Si el índice aún no existe (primer arranque tras actualizar), se construye
  // una vez en segundo plano.
  useEffect(() => {
    ensureIndex().catch(() => {})
  }, [])

  useEffect(() => {
    if (app.signedIn && app.unlocked) {
      startAutoSync(10, (r) => {
        if (!r.errors.length && (r.pushed || r.pulled)) {
          useApp.getState().set({ lastSync: r.finishedAt })
        }
      })
    }
    return () => stopAutoSync()
  }, [app.signedIn, app.unlocked])

  // Atajos globales
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        useApp.getState().toggleFocus()
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        navigate('/diario')
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  async function doSync() {
    useApp.getState().set({ syncing: true })
    const r = await syncNow()
    const pending = await pendingCounts()
    useApp.getState().set({
      syncing: false,
      lastSync: r.finishedAt,
      pendingCount: Object.values(pending).reduce((a, b) => a + b, 0),
    })
    // El primer error es el que importa: si la clave no coincide, lo demás es ruido.
    if (r.errors.length) app.notify('error', r.errors[0])
    else app.notify('ok', t('armazon.sincronizado', { subidas: r.pushed, bajadas: r.pulled }))
  }

  return (
    <div className="flex h-full">
      {/* ── Barra lateral ── */}
      <aside
        style={{ width: barra.ancho }}
        className="flex shrink-0 flex-col bg-ink-100/60 dark:bg-ink-900/60"
      >
        <div className="flex items-center gap-2 px-4 py-4">
          <Feather size={20} className="text-accent-600 dark:text-accent-400" />
          <span className="text-[15px] font-semibold tracking-tight">WriteFlow</span>
        </div>

        <button
          onClick={() => setSearchOpen(true)}
          className="mx-2 mb-2 flex items-center gap-2 rounded-md border border-ink-200 px-2.5 py-1.5 text-left text-xs text-ink-400 transition hover:border-accent-400 hover:text-ink-600 dark:border-ink-700 dark:hover:text-ink-200"
        >
          <Search size={14} />
          {t('nav.buscar')}
          <kbd className="ml-auto rounded bg-ink-200 px-1 py-0.5 text-[9px] font-sans text-ink-500 dark:bg-ink-800">
            Ctrl K
          </kbd>
        </button>

        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map(({ to, clave, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition ${
                  isActive
                    ? 'bg-white font-medium text-accent-700 shadow-sm dark:bg-ink-800 dark:text-accent-300'
                    : 'text-ink-600 hover:bg-ink-200/60 dark:text-ink-300 dark:hover:bg-ink-800/60'
                }`
              }
            >
              <Icon size={16} />
              {t(clave)}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-1 border-t border-ink-200 p-2 dark:border-ink-800">
          <StatusRow />
          <div className="flex items-center gap-1">
            <button
              className="btn-ghost flex-1 justify-start"
              onClick={() =>
                app.setTheme(app.theme === 'dark' ? 'light' : app.theme === 'light' ? 'system' : 'dark')
              }
              title={t('armazon.cambiarTema')}
            >
              {app.theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
              <span className="text-xs">
                {app.theme === 'system'
                  ? t('armazon.temaSistema')
                  : app.theme === 'dark'
                    ? t('armazon.temaOscuro')
                    : t('armazon.temaClaro')}
              </span>
            </button>
            <button
              className={`btn-ghost ${app.focusMode ? 'text-accent-600 dark:text-accent-400' : ''}`}
              onClick={app.toggleFocus}
              title={t('armazon.concentracion')}
            >
              <Focus size={15} />
            </button>
          </div>
          <NavLink to="/ajustes" className="btn-ghost w-full justify-start">
            <SettingsIcon size={15} />
            <span className="text-xs">{t('nav.ajustes')}</span>
          </NavLink>
        </div>
      </aside>

      {/* La barra hace de borde derecho del panel: por eso el `aside` ya no
          lleva `border-r`, que se vería doble. */}
      <Divisor
        ancho={barra.ancho}
        onAncho={barra.setAncho}
        onSoltar={barra.guardar}
        min={barra.min}
        max={barra.max}
        porDefecto={barra.porDefecto}
      />

      {/* ── Contenido ── */}
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* botón flotante de sincronización */}
      {app.cloudConfigured && (
        <button
          onClick={doSync}
          disabled={app.syncing || !app.signedIn}
          title={app.signedIn ? t('armazon.sincronizarAhora') : t('armazon.iniciaSesion')}
          className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full border border-ink-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur transition hover:bg-white disabled:opacity-50 dark:border-ink-700 dark:bg-ink-900/95"
        >
          <RefreshCw size={14} className={app.syncing ? 'animate-spin' : ''} />
          {app.pendingCount > 0
            ? t('armazon.pendientes', { n: app.pendingCount })
            : t('armazon.alDia')}
        </button>
      )}
    </div>
  )
}

function StatusRow() {
  const t = useT()
  const app = useApp()
  return (
    <div className="flex items-center gap-1 px-1 pb-1 text-[11px] text-ink-500 dark:text-ink-400">
      {app.cloudConfigured ? (
        app.signedIn ? (
          <Cloud size={13} className="text-emerald-600 dark:text-emerald-400" />
        ) : (
          <CloudOff size={13} />
        )
      ) : (
        <CloudOff size={13} />
      )}
      <span className="truncate">
        {app.cloudConfigured
          ? app.signedIn
            ? t('armazon.enLaNube')
            : t('armazon.sinSesion')
          : t('armazon.soloLocal')}
      </span>
      <button
        className="ml-auto rounded p-0.5 hover:bg-ink-200 dark:hover:bg-ink-800"
        title={app.unlocked ? t('armazon.bloquear') : t('armazon.bloqueado')}
        onClick={() => {
          if (app.unlocked) {
            lock()
            app.set({ unlocked: false })
          }
        }}
      >
        {app.unlocked ? <Unlock size={13} className="text-emerald-600" /> : <Lock size={13} />}
      </button>
    </div>
  )
}
