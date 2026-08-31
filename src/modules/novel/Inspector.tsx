import { LABEL_COLOR } from './Binder'
import type { Character, Doc } from '@/lib/types'
import { num } from '@/i18n'
import { useT } from '@/i18n/useT'

interface Props {
  doc: Doc
  characters: Character[]
  onPatch: (patch: Partial<Doc>) => void
}

/* Lo que se guarda en la base de datos sigue siendo la palabra española: es
 * el valor canónico y viaja en la sincronización entre equipos. Solo se traduce
 * lo que se ve, con la clave `estado.<valor en minúsculas>`. Así cambiar de
 * idioma no reescribe ni un solo documento. */
const STATUSES = ['Idea', 'Borrador', 'Revisado', 'Final', 'Descartado']

/**
 * Inspector del documento activo: la ficha (sinopsis), las anotaciones y los
 * metadatos. Es el panel derecho de Scrivener.
 */
export default function Inspector({ doc, characters, onPatch }: Props) {
  const t = useT()
  const etiqueta = (v: string) => t(`estado.${v.toLowerCase()}`)

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <section>
        <label className="label">{t('inspector.ficha')}</label>
        <textarea
          className="input min-h-[110px] resize-y font-serif text-[13px] leading-relaxed"
          placeholder={t('inspector.fichaPista')}
          value={doc.synopsis ?? ''}
          onChange={(e) => onPatch({ synopsis: e.target.value })}
        />
      </section>

      <section>
        <label className="label">{t('inspector.anotaciones')}</label>
        <textarea
          className="input min-h-[90px] resize-y text-[13px]"
          placeholder={t('inspector.anotacionesPista')}
          value={doc.notes ?? ''}
          onChange={(e) => onPatch({ notes: e.target.value })}
        />
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t('inspector.estado')}</label>
          <select
            className="input !py-1.5"
            value={doc.status ?? 'Borrador'}
            onChange={(e) => onPatch({ status: e.target.value })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {etiqueta(s)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('inspector.etiqueta')}</label>
          <select
            className="input !py-1.5"
            value={doc.label ?? ''}
            onChange={(e) => onPatch({ label: e.target.value || null })}
          >
            <option value="">{t('inspector.sinEtiqueta')}</option>
            {Object.keys(LABEL_COLOR).map((s) => (
              <option key={s} value={s}>
                {etiqueta(s)}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t('inspector.pov')}</label>
          <select
            className="input !py-1.5"
            value={doc.pov ?? ''}
            onChange={(e) => onPatch({ pov: e.target.value || null })}
          >
            <option value="">—</option>
            {characters.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{t('inspector.momento')}</label>
          <input
            className="input !py-1.5"
            placeholder={t('inspector.momentoPista')}
            value={doc.time_frame ?? ''}
            onChange={(e) => onPatch({ time_frame: e.target.value })}
          />
        </div>
      </section>

      <section>
        <label className="label">{t('inspector.lugar')}</label>
        <input
          className="input !py-1.5"
          placeholder={t('inspector.lugarPista')}
          value={doc.place ?? ''}
          onChange={(e) => onPatch({ place: e.target.value })}
        />
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">{t('inspector.objetivo')}</label>
          <input
            type="number"
            className="input !py-1.5"
            value={doc.target_words || ''}
            onChange={(e) => onPatch({ target_words: Number(e.target.value) || 0 })}
          />
        </div>
        <div>
          <label className="label">{t('inspector.escritas')}</label>
          <div className="input !py-1.5 tabular-nums text-ink-500">
            {num(doc.word_count)}
          </div>
        </div>
      </section>

      {doc.target_words > 0 && (
        <div className="h-1.5 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
          <div
            className="h-full bg-accent-500 transition-all"
            style={{ width: `${Math.min(100, (doc.word_count / doc.target_words) * 100)}%` }}
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={doc.in_compile === 1}
          onChange={(e) => onPatch({ in_compile: e.target.checked ? 1 : 0 })}
        />
        {t('inspector.compilar')}
      </label>
    </div>
  )
}
