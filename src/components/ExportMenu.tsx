import { useEffect, useRef, useState } from 'react'
import { BookOpen, ChevronDown, Download, FileCode2, FileText, FileType2 } from 'lucide-react'
import {
  SALIDA_COMPARTIDA,
  compileProject, exportProjectDocx, exportProjectEpub, markdownToStyledHtml, saveTextFile,
} from '@/lib/export'
import { useApp } from '@/store/app'
import { useIsMobile } from '@/lib/platform'
import { useT } from '@/i18n/useT'

interface Props {
  projectId: string
  projectTitle: string
  /** La novela ofrece EPUB y formato de manuscrito; el ensayo no los necesita. */
  variant: 'novel' | 'essay'
}

/** Menú de exportación compartido por Novela y Ensayos. */
export default function ExportMenu({ projectId, projectTitle, variant }: Props) {
  const t = useT()
  const app = useApp()
  const movil = useIsMobile()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  async function run(label: string, fn: () => Promise<string | null>) {
    setBusy(label)
    try {
      const path = await fn()
      // En Android no hay ruta que enseñar: el destino lo elige el usuario en el
      // selector del sistema, y Android no nos cuenta cuál fue.
      if (path === SALIDA_COMPARTIDA) app.notify('ok', t('comun.enviadoCompartir'))
      else if (path) app.notify('ok', t('comun.guardadoEn', { ruta: path }))
    } catch (e) {
      app.notify('error', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
      setOpen(false)
    }
  }

  const items: {
    key: string
    icon: React.ReactNode
    label: string
    hint: string
    action: () => Promise<string | null>
  }[] = [
    {
      key: 'docx',
      icon: <FileType2 size={15} />,
      label: t('exportar.docx'),
      hint: t('exportar.docxAyuda'),
      action: () => exportProjectDocx(projectId, 'libro'),
    },
    ...(variant === 'novel'
      ? [
          {
            key: 'manuscript',
            icon: <FileType2 size={15} />,
            label: t('exportar.manuscrito'),
            hint: t('exportar.manuscritoAyuda'),
            action: () => exportProjectDocx(projectId, 'manuscrito'),
          },
          {
            key: 'epub',
            icon: <BookOpen size={15} />,
            label: t('exportar.epub'),
            hint: t('exportar.epubAyuda'),
            action: () => exportProjectEpub(projectId),
          },
        ]
      : []),
    {
      key: 'md',
      icon: <FileText size={15} />,
      label: t('exportar.md'),
      hint: t('exportar.mdAyuda'),
      action: async () => saveTextFile(`${projectTitle}.md`, await compileProject(projectId), 'md'),
    },
    {
      key: 'html',
      icon: <FileCode2 size={15} />,
      label: t('exportar.html'),
      hint: t('exportar.htmlAyuda'),
      action: async () =>
        saveTextFile(
          `${projectTitle}.html`,
          markdownToStyledHtml(projectTitle, await compileProject(projectId)),
          'html',
        ),
    },
  ]

  return (
    <div className="relative" ref={box}>
      <button
        className="btn-ghost"
        onClick={() => setOpen((v) => !v)}
        title={movil ? t('exportar.compartir') : t('exportar.exportar')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Download size={16} />
        <span className="hidden text-xs sm:inline">
          {movil ? t('exportar.compartir') : t('exportar.exportar')}
        </span>
        <ChevronDown size={13} className={`transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-[min(20rem,calc(100vw-1.5rem))] animate-fade-in overflow-hidden rounded-lg border border-ink-200 bg-white shadow-xl dark:border-ink-700 dark:bg-ink-900"
        >
          {items.map((it) => (
            <button
              key={it.key}
              role="menuitem"
              disabled={busy !== null}
              onClick={() => run(it.key, it.action)}
              className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition hover:bg-ink-100 disabled:opacity-50 dark:hover:bg-ink-800"
            >
              <span className="mt-0.5 shrink-0 text-accent-600 dark:text-accent-400">{it.icon}</span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium">
                  {busy === it.key ? t('comun.generando') : it.label}
                </span>
                <span className="block text-[11px] leading-snug text-ink-500 dark:text-ink-400">
                  {it.hint}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
