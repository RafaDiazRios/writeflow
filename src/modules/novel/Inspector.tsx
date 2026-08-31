import { LABEL_COLOR } from './Binder'
import type { Character, Doc } from '@/lib/types'
import { num } from '@/i18n'

interface Props {
  doc: Doc
  characters: Character[]
  onPatch: (patch: Partial<Doc>) => void
}

const STATUSES = ['Idea', 'Borrador', 'Revisado', 'Final', 'Descartado']

/**
 * Inspector del documento activo: la ficha (sinopsis), las anotaciones y los
 * metadatos. Es el panel derecho de Scrivener.
 */
export default function Inspector({ doc, characters, onPatch }: Props) {
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <section>
        <label className="label">Ficha / sinopsis</label>
        <textarea
          className="input min-h-[110px] resize-y font-serif text-[13px] leading-relaxed"
          placeholder="Resume la escena en dos o tres frases: qué quiere el personaje, qué se lo impide, qué cambia al final."
          value={doc.synopsis ?? ''}
          onChange={(e) => onPatch({ synopsis: e.target.value })}
        />
      </section>

      <section>
        <label className="label">Anotaciones</label>
        <textarea
          className="input min-h-[90px] resize-y text-[13px]"
          placeholder="Notas para ti: dudas, cosas que verificar, ideas para la revisión."
          value={doc.notes ?? ''}
          onChange={(e) => onPatch({ notes: e.target.value })}
        />
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Estado</label>
          <select
            className="input !py-1.5"
            value={doc.status ?? 'Borrador'}
            onChange={(e) => onPatch({ status: e.target.value })}
          >
            {STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Etiqueta</label>
          <select
            className="input !py-1.5"
            value={doc.label ?? ''}
            onChange={(e) => onPatch({ label: e.target.value || null })}
          >
            <option value="">Sin etiqueta</option>
            {Object.keys(LABEL_COLOR).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Punto de vista</label>
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
          <label className="label">Momento</label>
          <input
            className="input !py-1.5"
            placeholder="Otoño, 1998"
            value={doc.time_frame ?? ''}
            onChange={(e) => onPatch({ time_frame: e.target.value })}
          />
        </div>
      </section>

      <section>
        <label className="label">Lugar</label>
        <input
          className="input !py-1.5"
          placeholder="La casa de la playa"
          value={doc.place ?? ''}
          onChange={(e) => onPatch({ place: e.target.value })}
        />
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Objetivo de palabras</label>
          <input
            type="number"
            className="input !py-1.5"
            value={doc.target_words || ''}
            onChange={(e) => onPatch({ target_words: Number(e.target.value) || 0 })}
          />
        </div>
        <div>
          <label className="label">Escritas</label>
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
        Incluir al compilar el manuscrito
      </label>
    </div>
  )
}
