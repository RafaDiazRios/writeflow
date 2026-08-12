import { NavLink, useNavigate } from 'react-router-dom'
import {
  BookOpen, CalendarDays, Cloud, CloudOff, Feather, Focus, Home as HomeIcon, Lock, Moon,
  RefreshCw, ScrollText, Settings as SettingsIcon, Sun, Unlock, Wind,
} from 'lucide-react'
import { useEffect } from 'react'
import { useApp } from '@/store/app'
import { syncNow, startAutoSync, stopAutoSync } from '@/lib/sync'
import { pendingCounts } from '@/lib/repo'
import { lock } from '@/lib/crypto'

const NAV = [
  { to: '/', label: 'Inicio', icon: HomeIcon, end: true },
  { to: '/diario', label: 'Diario', icon: CalendarDays },
  { to: '/novela', label: 'Novela', icon: BookOpen },
  { to: '/ensayos', label: 'Ensayos', icon: ScrollText },
  { to: '/terapia', label: 'Terapia narrativa', icon: Wind },
]

export default function Shell({ children }: { children: React.ReactNode }) {
  const app = useApp()
  const navigate = useNavigate()

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
    if (r.errors.length) app.notify('error', r.errors[0])
    else app.notify('ok', `Sincronizado: ${r.pushed} subidas, ${r.pulled} bajadas`)
  }

  return (
    <div className="flex h-full">
      {/* ── Barra lateral ── */}
      <aside className="flex w-[212px] shrink-0 flex-col border-r border-ink-200 bg-ink-100/60 dark:border-ink-800 dark:bg-ink-900/60">
        <div className="flex items-center gap-2 px-4 py-4">
          <Feather size={20} className="text-accent-600 dark:text-accent-400" />
          <span className="text-[15px] font-semibold tracking-tight">WriteFlow</span>
        </div>

        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map(({ to, label, icon: Icon, end }) => (
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
              {label}
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
              title="Cambiar tema"
            >
              {app.theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
              <span className="text-xs capitalize">
                {app.theme === 'system' ? 'Sistema' : app.theme === 'dark' ? 'Oscuro' : 'Claro'}
              </span>
            </button>
            <button
              className={`btn-ghost ${app.focusMode ? 'text-accent-600 dark:text-accent-400' : ''}`}
              onClick={app.toggleFocus}
              title="Modo concentración (Ctrl+Shift+F)"
            >
              <Focus size={15} />
            </button>
          </div>
          <NavLink to="/ajustes" className="btn-ghost w-full justify-start">
            <SettingsIcon size={15} />
            <span className="text-xs">Ajustes</span>
          </NavLink>
        </div>
      </aside>

      {/* ── Contenido ── */}
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>

      {/* botón flotante de sincronización */}
      {app.cloudConfigured && (
        <button
          onClick={doSync}
          disabled={app.syncing || !app.signedIn}
          title={app.signedIn ? 'Sincronizar ahora' : 'Inicia sesión en Ajustes'}
          className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full border border-ink-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur transition hover:bg-white disabled:opacity-50 dark:border-ink-700 dark:bg-ink-900/95"
        >
          <RefreshCw size={14} className={app.syncing ? 'animate-spin' : ''} />
          {app.pendingCount > 0 ? `${app.pendingCount} pendientes` : 'Al día'}
        </button>
      )}
    </div>
  )
}

function StatusRow() {
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
        {app.cloudConfigured ? (app.signedIn ? 'En la nube' : 'Sin sesión') : 'Solo local'}
      </span>
      <button
        className="ml-auto rounded p-0.5 hover:bg-ink-200 dark:hover:bg-ink-800"
        title={app.unlocked ? 'Bloquear el almacén cifrado' : 'El almacén está bloqueado'}
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
