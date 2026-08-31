import { useEffect, useState } from 'react'
import { AlertTriangle, KeyRound, RefreshCw, Wrench } from 'lucide-react'
import { adoptRemoteKeyMaterial, localFingerprint } from '@/lib/crypto'
import { claveRemota, syncNow, volverABajarTodo, volverASubirTodo } from '@/lib/sync'
import { useApp } from '@/store/app'
import { useT } from '@/i18n/useT'

/**
 * Clave de cifrado compartida entre equipos, y reparación.
 *
 * La clave se deriva de la frase de paso **y de una sal aleatoria**. Esa sal se
 * guarda en el perfil de Supabase para que todos los equipos lleguen a la misma
 * clave. Si un equipo se configuró sin bajarla, cifra con una clave propia: sube
 * contenido que los demás no pueden leer, y lee del resto entradas en blanco.
 *
 * Son dos cosas separadas a propósito:
 *
 * - **El aviso** aparece solo cuando las huellas no coinciden, porque es un
 *   problema y tiene que verse.
 * - **La reparación** está siempre disponible, plegada. La primera versión metía
 *   los dos botones dentro del aviso, y al adoptar la clave el aviso desaparecía
 *   —ya coincidían las huellas— llevándose los botones justo antes de poder
 *   usarlos. Además hacen falta en el equipo que *no* da error: es ahí donde a
 *   veces hay que forzar una bajada.
 */
export default function ClaveCompartida() {
  const t = useT()
  const app = useApp()
  const [remota, setRemota] = useState<{ salt: string; fingerprint: string } | null>(null)
  const [local, setLocal] = useState<string | null>(null)
  const [frase, setFrase] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const [abierto, setAbierto] = useState(false)

  const comprobar = async () => {
    setRemota(await claveRemota())
    setLocal(await localFingerprint())
  }

  useEffect(() => {
    if (app.signedIn) void comprobar()
  }, [app.signedIn])

  if (!app.signedIn) return null
  const desajuste = Boolean(remota && local && remota.fingerprint !== local)

  async function adoptar() {
    if (!remota) return
    setTrabajando(true)
    try {
      await adoptRemoteKeyMaterial(remota.salt, remota.fingerprint, frase)
      setFrase('')
      await comprobar()
      setAbierto(true) // el siguiente paso es volver a subir: que quede a la vista
      app.notify('ok', t('clave.adoptada'))
    } catch (e) {
      app.notify('error', e instanceof Error ? e.message : String(e))
    } finally {
      setTrabajando(false)
    }
  }

  async function reparar(modo: 'subir' | 'bajar') {
    setTrabajando(true)
    try {
      if (modo === 'subir') {
        const n = await volverASubirTodo()
        app.notify('info', t('clave.marcadas', { n }))
      } else {
        await volverABajarTodo()
      }
      const r = await syncNow()
      if (r.errors.length) app.notify('error', r.errors[0])
      else app.notify('ok', t('armazon.sincronizadoCorto', { subidas: r.pushed, bajadas: r.pulled }))
    } catch (e) {
      app.notify('error', e instanceof Error ? e.message : String(e))
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <>
      {desajuste && remota && (
        <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-amber-900 dark:text-amber-200">
            <AlertTriangle size={15} /> {t('clave.desajuste')}
          </p>
          <p className="mb-3 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
            {t('clave.desajusteAyuda')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="password"
              className="input !w-56 !py-1 text-xs"
              placeholder={t('clave.fraseOriginal')}
              value={frase}
              onChange={(e) => setFrase(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && frase && void adoptar()}
            />
            <button
              className="btn-primary !py-1"
              disabled={!frase || trabajando}
              onClick={() => void adoptar()}
            >
              <KeyRound size={14} /> {t('clave.usarNube')}
            </button>
          </div>
        </div>
      )}

      <div className="mt-3">
        <button
          className="btn-ghost !py-1 text-xs"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
        >
          <Wrench size={14} /> {t('clave.reparar')}
        </button>

        {abierto && (
          <div className="mt-2 rounded-md border border-ink-200 p-3 text-xs dark:border-ink-700">
            <p className="mb-3 leading-relaxed text-ink-600 dark:text-ink-300">
              {t('clave.repararAyuda')}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-outline !py-1"
                disabled={trabajando}
                onClick={() => void reparar('subir')}
              >
                <RefreshCw size={14} /> {t('clave.volverASubir')}
              </button>
              <button
                className="btn-outline !py-1"
                disabled={trabajando}
                onClick={() => void reparar('bajar')}
              >
                <RefreshCw size={14} /> {t('clave.volverABajar')}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
