import { useEffect, useState } from 'react'
import { AlertTriangle, KeyRound, RefreshCw } from 'lucide-react'
import { adoptRemoteKeyMaterial, localFingerprint } from '@/lib/crypto'
import { claveRemota, syncNow, volverABajarTodo, volverASubirTodo } from '@/lib/sync'
import { useApp } from '@/store/app'

/**
 * Reparación de la clave de cifrado compartida entre equipos.
 *
 * La clave se deriva de la frase de paso **y de una sal aleatoria**. Esa sal se
 * guarda en el perfil de Supabase para que todos los equipos lleguen a la misma
 * clave. Si un equipo se configuró sin bajarla, cifra con una clave propia: sube
 * contenido que los demás no pueden leer, y lee del resto entradas en blanco.
 *
 * Este panel solo aparece cuando hay algo que arreglar.
 */
export default function ClaveCompartida() {
  const app = useApp()
  const [remota, setRemota] = useState<{ salt: string; fingerprint: string } | null>(null)
  const [local, setLocal] = useState<string | null>(null)
  const [frase, setFrase] = useState('')
  const [trabajando, setTrabajando] = useState(false)

  const comprobar = async () => {
    setRemota(await claveRemota())
    setLocal(await localFingerprint())
  }

  useEffect(() => {
    if (app.signedIn) void comprobar()
  }, [app.signedIn])

  if (!app.signedIn || !remota || !local) return null
  const coinciden = remota.fingerprint === local
  if (coinciden) return null

  async function adoptar() {
    if (!remota) return
    setTrabajando(true)
    try {
      await adoptRemoteKeyMaterial(remota.salt, remota.fingerprint, frase)
      setFrase('')
      await comprobar()
      app.notify('ok', 'Este equipo ya usa la misma clave que el resto')
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
        app.notify('ok', `${n} filas marcadas para volver a subir cifradas`)
      } else {
        await volverABajarTodo()
        app.notify('ok', 'Se volverá a bajar todo en la próxima sincronización')
      }
      const r = await syncNow()
      if (r.errors.length) app.notify('error', r.errors[0])
      else app.notify('ok', `Subidas ${r.pushed}, bajadas ${r.pulled}`)
    } catch (e) {
      app.notify('error', e instanceof Error ? e.message : String(e))
    } finally {
      setTrabajando(false)
    }
  }

  return (
    <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-amber-900 dark:text-amber-200">
        <AlertTriangle size={15} /> Este equipo cifra con una clave distinta
      </p>
      <p className="mb-3 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
        La clave no sale solo de tu frase de paso, sino de la frase <em>más una sal aleatoria</em>.
        Este ordenador se generó la suya en lugar de usar la que ya había en la nube, así que lo que
        escribas aquí el resto de equipos no puede leerlo, y lo que llega del resto se ve en blanco.
        Escribe la frase de paso que usaste la primera vez y este equipo adoptará la clave común.
        Tu texto local no se toca.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="password"
          className="input !w-56 !py-1 text-xs"
          placeholder="Frase de paso original"
          value={frase}
          onChange={(e) => setFrase(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && frase && void adoptar()}
        />
        <button className="btn-primary !py-1" disabled={!frase || trabajando} onClick={() => void adoptar()}>
          <KeyRound size={14} /> Usar la clave de la nube
        </button>
      </div>

      <div className="mt-3 border-t border-amber-300 pt-3 dark:border-amber-800">
        <p className="mb-2 text-xs text-amber-800 dark:text-amber-300">
          Después, y solo una vez: en el equipo <strong>que tiene el texto bueno</strong>, vuelve a
          subirlo para que quede cifrado con la clave correcta. En el que tiene entradas en blanco,
          vuelve a bajarlo.
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-outline !py-1" disabled={trabajando} onClick={() => void reparar('subir')}>
            <RefreshCw size={14} /> Volver a subir todo lo de este equipo
          </button>
          <button className="btn-outline !py-1" disabled={trabajando} onClick={() => void reparar('bajar')}>
            <RefreshCw size={14} /> Volver a bajarlo todo
          </button>
        </div>
      </div>
    </div>
  )
}
