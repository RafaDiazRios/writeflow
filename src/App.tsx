import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Shell from '@/components/Shell'
import MobileShell from '@/components/MobileShell'
import Toast from '@/components/Toast'
import UnlockGate from '@/components/UnlockGate'
import Home from '@/modules/Home'
import JournalModule from '@/modules/journal/JournalModule'
import NovelModule from '@/modules/novel/NovelModule'
import EssayModule from '@/modules/essay/EssayModule'
import TherapyModule from '@/modules/therapy/TherapyModule'
import Settings from '@/modules/settings/Settings'
import MobileJournal from '@/modules/mobile/MobileJournal'
import MobileLibrary from '@/modules/mobile/MobileLibrary'
import { useIsMobile } from '@/lib/platform'
import { useApp } from '@/store/app'
import { db } from '@/lib/db'
import { isE2EConfigured, isUnlocked } from '@/lib/crypto'
import { isCloudConfigured, getSession } from '@/lib/supabase'
import { lastSyncAt } from '@/lib/sync'
import { pendingCounts } from '@/lib/repo'
import { listenForAuthCallback } from '@/lib/deeplink'

export default function App() {
  const app = useApp()
  const isMobile = useIsMobile()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        await db() // aplica las migraciones
        await app.init()
        const [e2e, cloud, session, last, pending] = await Promise.all([
          isE2EConfigured(),
          isCloudConfigured(),
          getSession().catch(() => null),
          lastSyncAt(),
          pendingCounts(),
        ])
        app.set({
          e2eConfigured: e2e,
          unlocked: isUnlocked(),
          cloudConfigured: cloud,
          signedIn: Boolean(session),
          userEmail: session?.user.email ?? null,
          lastSync: last,
          pendingCount: Object.values(pending).reduce((a, b) => a + b, 0),
        })
        listenForAuthCallback()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) {
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="card max-w-lg p-6">
          <h1 className="mb-2 text-lg font-semibold">No se pudo abrir la base de datos</h1>
          <p className="text-sm text-ink-600 dark:text-ink-300">{error}</p>
        </div>
      </div>
    )
  }

  if (!app.ready) {
    return (
      <div className="grid h-full place-items-center">
        <div className="animate-pulse text-sm text-ink-400">Abriendo WriteFlow…</div>
      </div>
    )
  }

  // Mismo código, dos pieles. La lógica, la base de datos y el cifrado son los
  // mismos; solo cambia cómo se distribuye en pantalla y qué se puede editar.
  const Frame = isMobile ? MobileShell : Shell

  return (
    <>
      <Frame>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/diario/*" element={isMobile ? <MobileJournal /> : <JournalModule />} />
          <Route path="/terapia/*" element={<TherapyModule />} />
          <Route path="/ajustes" element={<Settings />} />
          {isMobile ? (
            <>
              <Route path="/biblioteca/*" element={<MobileLibrary />} />
              {/* En móvil la novela y los ensayos se leen, no se editan. */}
              <Route path="/novela/*" element={<MobileLibrary />} />
              <Route path="/ensayos/*" element={<MobileLibrary />} />
            </>
          ) : (
            <>
              <Route path="/novela/*" element={<NovelModule />} />
              <Route path="/ensayos/*" element={<EssayModule />} />
              <Route path="/biblioteca/*" element={<Navigate to="/novela" replace />} />
            </>
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Frame>
      <UnlockGate />
      <Toast />
    </>
  )
}
