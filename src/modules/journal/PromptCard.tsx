import { useEffect, useState } from 'react'
import { Quote, RefreshCw, Sparkles } from 'lucide-react'
import { markPromptShown, promptForDay, rerollPrompt, streamLabel } from '@/lib/prompts'
import { useT } from '@/i18n/useT'
import { useApp } from '@/store/app'
import { PROMPT_PX } from '@/lib/types'
import type { DailyPrompt } from '@/lib/types'

interface Props {
  date: string
  onWriteAbout: (prompt: DailyPrompt) => void
}

/**
 * Sugerencia de escritura del día. Es determinista por fecha, así que el mismo
 * día siempre propone lo mismo aunque cierres la app o estés sin conexión.
 */
export default function PromptCard({ date, onWriteAbout }: Props) {
  const t = useT()
  const streams = useApp((s) => s.streams)
  const escala = useApp((s) => s.promptScale)
  const [prompt, setPrompt] = useState<DailyPrompt>(() => promptForDay(date, streams))
  const [seen, setSeen] = useState<string[]>([])

  useEffect(() => {
    const p = promptForDay(date, streams)
    setPrompt(p)
    setSeen([p.id])
    markPromptShown(p.id)
  }, [date, streams])

  const tone: Record<string, string> = {
    estoico: 'border-l-amber-500',
    filosofico: 'border-l-violet-500',
    psicologico: 'border-l-emerald-500',
    creativo: 'border-l-rose-500',
    memoria: 'border-l-sky-500',
    asombro: 'border-l-teal-500',
    oficio: 'border-l-stone-500',
  }

  return (
    <div className={`card border-l-4 p-4 ${tone[prompt.stream] ?? 'border-l-accent-500'}`}>
      <div className="mb-2 flex items-center gap-2">
        <Sparkles size={14} className="text-accent-600 dark:text-accent-400" />
        <span className="panel-title">
          {t('prompt.delDia')} · {streamLabel(prompt.stream)}
        </span>
        <button
          className="ml-auto rounded p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700 dark:hover:bg-ink-800"
          title={t('prompt.otro')}
          onClick={() => {
            const p = rerollPrompt(date, streams, seen)
            setPrompt(p)
            setSeen((s) => [...s, p.id])
            markPromptShown(p.id)
          }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* El prompt es lo que hay que leer, no un pie de foto: la serif, el
          interlineado holgado y el tamaño que haya elegido el usuario en
          Ajustes. La columna se ensancha hasta 560 px, así que aguanta los
          tamaños grandes sin partirse en líneas de tres palabras. */}
      <p
        style={{ fontSize: `${Math.round(PROMPT_PX * escala)}px` }}
        className="font-serif leading-relaxed text-ink-800 dark:text-ink-100"
      >
        {prompt.text}
      </p>

      {prompt.source && (
        <p className="mt-2 flex items-start gap-1.5 text-sm italic text-ink-500 dark:text-ink-400">
          <Quote size={13} className="mt-1 shrink-0" />
          {prompt.source}
        </p>
      )}

      <button className="btn-outline mt-3 w-full justify-center" onClick={() => onWriteAbout(prompt)}>
        {t('prompt.escribirSobreEsto')}
      </button>
    </div>
  )
}
