import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  CalendarDays, Cloud, CloudOff, Home as HomeIcon, Library, RefreshCw, Search, Settings as SettingsIcon,
  Wind,
} from 'lucide-react'
import GlobalSearch from './GlobalSearch'
import { ensureIndex } from '@/lib/search'
import { useApp } from '@/store/app'
import { startAutoSync, stopAutoSync, syncNow } from '@/lib/sync'
import { pendingCounts } from '@/lib/repo'
import { useT } from '@/i18n/useT'

const TABS = [
  { to: '/', clave: 'nav.hoy', icon: HomeIcon, end: true },
  { to: '/diario', clave: 'nav.diario', icon: CalendarDays },
  { to: '/terapia', clave: 'nav.terapiaCorto', icon: Wind },
  { to: '/biblioteca', clave: 'nav.leer', icon: Library },
]

/**
 * Armazón táctil.
 *
 * La navegación va abajo, al alcance del pulgar, y no hay barra lateral: en un móvil
 * no caben dos paneles a la vez, así que cada pantalla ocupa el ancho completo y se
 * navega entrando y saliendo, no mirando de reojo.
 */
export default function MobileShell({ children }: { children: React.ReactNode }) {
  const t = useT()
  const app = useApp()
  const nav = useNavigate()
  const loc = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    ensureIndex().catch(() => {})
  }, [])

  useEffect(() => {
    if (app.signedIn && app.unlocked) startAutoSync(15)
    return () => stopAutoSync()
  }, [app.signedIn, app.unlocked])

  // En una pantalla de escritura, el editor debe poder ocupar todo: la barra
  // inferior se esconde cuando hay una entrada abierta.
  const immersive = loc.pathname.startsWith('/diario/') || loc.search.includes('entry=')

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
    else app.notify('ok', t('armazon.sincronizadoCorto', { subidas: r.pushed, bajadas: r.pulled }))
  }

  return (
    <div className="flex h-full flex-col">
      {/* barra superior mínima */}
      <header className="flex shrink-0 items-center gap-1 border-b border-ink-200 px-3 py-2 pt-[env(safe-area-inset-top)] dark:border-ink-800">
        <span className="text-[15px] font-semibold tracking-tight">WriteFlow</span>
        <button
          className="ml-auto rounded-full p-2 text-ink-500 transition active:bg-ink-200 dark:active:bg-ink-800"
          onClick={() => setSearchOpen(true)}
          aria-label={t('nav.buscar')}
        >
          <Search size={19} />
        </button>
        {app.cloudConfigured && (
          <button
            className="rounded-full p-2 text-ink-500 transition active:bg-ink-200 disabled:opacity-40 dark:active:bg-ink-800"
            onClick={doSync}
            disabled={app.syncing || !app.signedIn}
            aria-label={t('armazon.sincronizar')}
          >
            {app.syncing ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : app.signedIn ? (
              <Cloud size={18} className={app.pendingCount > 0 ? 'text-amber-500' : 'text-emerald-600'} />
            ) : (
              <CloudOff size={18} />
            )}
          </button>
        )}
        <button
          className="rounded-full p-2 text-ink-500 transition active:bg-ink-200 dark:active:bg-ink-800"
          onClick={() => nav('/ajustes')}
          aria-label={t('nav.ajustes')}
        >
          <SettingsIcon size={18} />
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">{children}</main>

      {!immersive && (
        <nav className="flex shrink-0 items-stretch border-t border-ink-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-ink-800 dark:bg-ink-900">
          {TABS.map(({ to, clave, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition ${
                  isActive
                    ? 'text-accent-600 dark:text-accent-400'
                    : 'text-ink-400 active:text-ink-600'
                }`
              }
            >
              <Icon size={21} />
              {t(clave)}
            </NavLink>
          ))}
        </nav>
      )}

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
