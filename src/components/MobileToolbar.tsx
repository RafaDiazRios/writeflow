import type { Editor } from '@tiptap/react'
import {
  Bold, Heading2, Italic, List, ListOrdered, Quote, Redo2, Strikethrough, Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react'
import { useState } from 'react'

/**
 * Barra de formato para pantallas táctiles.
 *
 * Nueve botones en lugar de treinta, y pegada al borde inferior del editor, que es
 * donde queda justo encima del teclado en pantalla. Los treinta de escritorio no
 * caben, y la mitad no se usan escribiendo con el pulgar en el metro.
 */
export default function MobileToolbar({ editor }: { editor: Editor }) {
  const [, force] = useState(0)
  editor.on('selectionUpdate', () => force((n) => n + 1))
  editor.on('transaction', () => force((n) => n + 1))

  const words = editor.storage.characterCount?.words?.() ?? 0

  return (
    <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-t border-ink-200 bg-white px-1.5 py-1 dark:border-ink-800 dark:bg-ink-900">
      <B onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} label="Deshacer">
        <Undo2 size={19} />
      </B>
      <B onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} label="Rehacer">
        <Redo2 size={19} />
      </B>
      <Sep />
      <B active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} label="Negrita">
        <Bold size={19} />
      </B>
      <B active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} label="Cursiva">
        <Italic size={19} />
      </B>
      <B active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} label="Subrayado">
        <UnderlineIcon size={19} />
      </B>
      <B active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} label="Tachado">
        <Strikethrough size={19} />
      </B>
      <Sep />
      <B
        active={editor.isActive('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        label="Título"
      >
        <Heading2 size={19} />
      </B>
      <B active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} label="Lista">
        <List size={19} />
      </B>
      <B active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} label="Lista numerada">
        <ListOrdered size={19} />
      </B>
      <B active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} label="Cita">
        <Quote size={19} />
      </B>
      <span className="ml-auto shrink-0 pr-1.5 text-[11px] tabular-nums text-ink-400">{words}</span>
    </div>
  )
}

function Sep() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-ink-200 dark:bg-ink-700" />
}

function B({
  children, onClick, active, disabled, label,
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  disabled?: boolean
  label: string
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      // onMouseDown evita que el editor pierda el foco y se cierre el teclado.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`shrink-0 rounded-md p-2.5 transition disabled:opacity-30 ${
        active
          ? 'bg-accent-100 text-accent-700 dark:bg-accent-900/60 dark:text-accent-200'
          : 'text-ink-600 active:bg-ink-100 dark:text-ink-300 dark:active:bg-ink-800'
      }`}
    >
      {children}
    </button>
  )
}
