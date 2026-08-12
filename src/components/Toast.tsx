import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { useApp } from '@/store/app'

export default function Toast() {
  const toast = useApp((s) => s.toast)
  if (!toast) return null
  const Icon = toast.kind === 'ok' ? CheckCircle2 : toast.kind === 'error' ? AlertCircle : Info
  const tone =
    toast.kind === 'ok'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100'
      : toast.kind === 'error'
        ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100'
        : 'border-ink-300 bg-white text-ink-900 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100'
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2 animate-fade-in">
      <div className={`flex max-w-lg items-start gap-2.5 rounded-lg border px-4 py-2.5 text-sm shadow-lg ${tone}`}>
        <Icon size={17} className="mt-0.5 shrink-0" />
        <span>{toast.text}</span>
      </div>
    </div>
  )
}
