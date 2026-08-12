import { useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { useApp } from '@/store/app'
import { setupPassphrase, unlock } from '@/lib/crypto'

/**
 * Puerta del almacén cifrado. Solo aparece cuando hace falta: puedes escribir
 * sin configurar nada mientras trabajes solo en este ordenador, pero para
 * sincronizar el diario y la terapia hay que tener la clave desbloqueada.
 */
export default function UnlockGate() {
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
        if (pass !== confirm) throw new Error('Las dos frases no coinciden')
        await setupPassphrase(pass)
      } else {
        await unlock(pass)
      }
      app.set({ unlocked: true, e2eConfigured: true, pendingUnlockRequest: false })
      setPass('')
      setConfirm('')
      app.notify('ok', 'Almacén desbloqueado')
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
            {needsSetup ? 'Protege tu diario' : 'Desbloquea tu diario'}
          </h2>
        </div>

        <div className="mb-4 text-sm leading-relaxed text-ink-600 dark:text-ink-300">
          {needsSetup ? (
            <>
              <p>
                Elige una frase de paso. Con ella se cifran el diario y la escritura terapéutica
                <strong> antes </strong>de salir de este ordenador: ni Supabase ni nadie más pueden
                leerlos.
              </p>
              <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                Guárdala bien. No hay forma de recuperar el contenido si la olvidas: ese es
                exactamente el precio del cifrado de extremo a extremo.
              </p>
            </>
          ) : (
            <p>
              Introduce tu frase de paso para descifrar el diario y la escritura terapéutica en este
              dispositivo.
            </p>
          )}
        </div>

        <label className="label">Frase de paso</label>
        <input
          className="input mb-3"
          type="password"
          autoFocus
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          placeholder="Al menos 10 caracteres"
        />

        {needsSetup && (
          <>
            <label className="label">Repítela</label>
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
            Ahora no
          </button>
          <button className="btn-primary" disabled={busy || pass.length < 10}>
            {busy ? 'Derivando la clave…' : needsSetup ? 'Cifrar y continuar' : 'Desbloquear'}
          </button>
        </div>
      </form>
    </div>
  )
}
