import { useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { useApp } from '@/store/app'
import { setupPassphrase, unlock } from '@/lib/crypto'
import { useT } from '@/i18n/useT'

/**
 * Puerta del almacén cifrado. Solo aparece cuando hace falta: puedes escribir
 * sin configurar nada mientras trabajes solo en este ordenador, pero para
 * sincronizar el diario y la terapia hay que tener la clave desbloqueada.
 */
export default function UnlockGate() {
  const t = useT()
  const app = useApp()
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (!app.pendingUnlockRequest) return null

  const needsSetup = !app.e2eConfigured

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    setBusy(true)
    try {
      if (needsSetup) {
        if (pass !== confirm) throw new Error(t('cifrado.noCoinciden'))
        await setupPassphrase(pass)
      } else {
        await unlock(pass)
      }
      app.set({ unlocked: true, e2eConfigured: true, pendingUnlockRequest: false })
      setPass('')
      setConfirm('')
      app.notify('ok', t('cifrado.desbloqueado'))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-ink-950/40 p-6 backdrop-blur-sm">
      <form onSubmit={submit} className="card w-[460px] p-6">
        <div className="mb-4 flex items-center gap-2.5">
          {needsSetup ? (
            <ShieldCheck size={20} className="text-accent-600" />
          ) : (
            <KeyRound size={20} className="text-accent-600" />
          )}
          <h2 className="text-lg font-semibold">
            {needsSetup ? t('cifrado.protege') : t('cifrado.desbloquea')}
          </h2>
        </div>

        <div className="mb-4 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
          {needsSetup ? (
            <>
              <p>{t('cifrado.explicacion')}</p>
              <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                {t('cifrado.aviso')}
              </p>
            </>
          ) : (
            <p>{t('cifrado.introduce')}</p>
          )}
        </div>

        <label className="label">{t('cifrado.frase')}</label>
        <input
          className="input mb-3"
          type="password"
          autoFocus
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder={t('cifrado.fraseminimo')}
        />

        {needsSetup && (
          <>
            <label className="label">{t('cifrado.repite')}</label>
            <input
              className="input mb-3"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </>
        )}

        {err && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{err}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => app.set({ pendingUnlockRequest: false })}
          >
            {t('cifrado.ahoraNo')}
          </button>
          <button className="btn-primary" disabled={busy || pass.length < 10}>
            {busy
              ? t('cifrado.derivando')
              : needsSetup
                ? t('cifrado.cifrarContinuar')
                : t('cifrado.desbloquear')}
          </button>
        </div>
      </form>
    </div>
  )
}
