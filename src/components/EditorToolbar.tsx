import { useCallback, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Code, Eraser, Heading1, Heading2,
  Heading3, Highlighter, Image as ImageIcon, Italic, Link2, List, ListOrdered, ListTodo,
  Minus, Pilcrow, Quote, Redo2, Strikethrough, Subscript, Superscript, Table as TableIcon,
  Underline as UnderlineIcon, Undo2,
} from 'lucide-react'
import { useApp } from '@/store/app'
import { elegirImagenDelDisco } from '@/lib/imagenes'
import { num } from '@/i18n'

/** Barra de herramientas al estilo de un procesador de textos. */
export default function EditorToolbar({ editor }: { editor: Editor }) {
  const { fontScale, setFontScale, notify } = useApp()
  const [, force] = useState(0)

  // Redibuja al cambiar la selección para reflejar los botones activos.
  editor.on('selectionUpdate', () => force((n) => n + 1))
  editor.on('transaction', () => force((n) => n + 1))

  const setLink = useCallback(() => {
    const previous = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Dirección del enlace', previous ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  /**
   * Inserta una imagen del disco.
   *
   * Antes esto pedía una dirección web, que era lo peor de los dos mundos: sin
   * conexión no se veía nada, y al exportar el .docx la imagen desaparecía
   * porque no había bytes que incrustar. Ahora se coge el archivo, se reescala
   * y se guarda dentro del documento. También vale pegar o arrastrar.
   */
  const addImage = useCallback(async () => {
    try {
      const img = await elegirImagenDelDisco()
      if (img) editor.chain().focus().setImage({ src: img.src }).run()
    } catch (e) {
      notify('error', e instanceof Error ? e.message : String(e))
    }
  }, [editor, notify])

  const chars = editor.storage.characterCount?.characters?.() ?? 0
  const words = editor.storage.characterCount?.words?.() ?? 0

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-ink-200 bg-white/95 px-2 py-1.5 backdrop-blur dark:border-ink-800 dark:bg-ink-900/95">
      <Group>
        <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Deshacer (Ctrl+Z)">
          <Undo2 size={16} />
        </Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Rehacer (Ctrl+Y)">
          <Redo2 size={16} />
        </Btn>
      </Group>

      <Sep />

      <select
        className="mx-1 h-7 rounded border border-ink-200 bg-transparent px-1.5 text-xs dark:border-ink-700"
        value={
          editor.isActive('heading', { level: 1 }) ? 'h1'
          : editor.isActive('heading', { level: 2 }) ? 'h2'
          : editor.isActive('heading', { level: 3 }) ? 'h3'
          : editor.isActive('blockquote') ? 'quote'
          : editor.isActive('codeBlock') ? 'code'
          : 'p'
        }
        onChange={(e) => {
          const v = e.target.value
          const c = editor.chain().focus()
          if (v === 'p') c.setParagraph().run()
          else if (v === 'h1') c.setHeading({ level: 1 }).run()
          else if (v === 'h2') c.setHeading({ level: 2 }).run()
          else if (v === 'h3') c.setHeading({ level: 3 }).run()
          else if (v === 'quote') c.toggleBlockquote().run()
          else if (v === 'code') c.toggleCodeBlock().run()
        }}
        title="Estilo de párrafo"
      >
        <option value="p">Texto normal</option>
        <option value="h1">Título 1</option>
        <option value="h2">Título 2</option>
        <option value="h3">Título 3</option>
        <option value="quote">Cita</option>
        <option value="code">Código</option>
      </select>

      <select
        className="mx-1 h-7 w-32 rounded border border-ink-200 bg-transparent px-1.5 text-xs dark:border-ink-700"
        value={(editor.getAttributes('textStyle').fontFamily as string) ?? ''}
        onChange={(e) => {
          const f = e.target.value
          if (!f) editor.chain().focus().unsetFontFamily().run()
          else editor.chain().focus().setFontFamily(f).run()
        }}
        title="Tipografía"
      >
        <option value="">Predeterminada</option>
        <option value="Georgia, serif">Georgia</option>
        <option value="'Times New Roman', serif">Times New Roman</option>
        <option value="Garamond, serif">Garamond</option>
        <option value="Inter, sans-serif">Inter</option>
        <option value="'Segoe UI', sans-serif">Segoe UI</option>
        <option value="'Courier New', monospace">Courier New</option>
      </select>

      <select
        className="mx-1 h-7 rounded border border-ink-200 bg-transparent px-1.5 text-xs dark:border-ink-700"
        value={String(fontScale)}
        onChange={(e) => setFontScale(Number(e.target.value))}
        title="Tamaño de la página"
      >
        {[0.85, 0.95, 1, 1.1, 1.25, 1.5].map((s) => (
          <option key={s} value={s}>{Math.round(s * 100)} %</option>
        ))}
      </select>

      <Sep />

      <Group>
        <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrita (Ctrl+B)"><Bold size={16} /></Btn>
        <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Cursiva (Ctrl+I)"><Italic size={16} /></Btn>
        <Btn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Subrayado (Ctrl+U)"><UnderlineIcon size={16} /></Btn>
        <Btn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Tachado"><Strikethrough size={16} /></Btn>
        <Btn active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Resaltar"><Highlighter size={16} /></Btn>
        <Btn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Código en línea"><Code size={16} /></Btn>
        <Btn active={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()} title="Subíndice"><Subscript size={16} /></Btn>
        <Btn active={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()} title="Superíndice"><Superscript size={16} /></Btn>
      </Group>

      <input
        type="color"
        className="mx-1 h-6 w-6 cursor-pointer rounded border border-ink-200 bg-transparent dark:border-ink-700"
        value={(editor.getAttributes('textStyle').color as string) ?? '#25231f'}
        onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        title="Color del texto"
      />

      <Sep />

      <Group>
        <Btn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Alinear a la izquierda"><AlignLeft size={16} /></Btn>
        <Btn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Centrar"><AlignCenter size={16} /></Btn>
        <Btn active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Alinear a la derecha"><AlignRight size={16} /></Btn>
        <Btn active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()} title="Justificar"><AlignJustify size={16} /></Btn>
      </Group>

      <Sep />

      <Group>
        <Btn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista con viñetas"><List size={16} /></Btn>
        <Btn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Lista numerada"><ListOrdered size={16} /></Btn>
        <Btn active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Lista de tareas"><ListTodo size={16} /></Btn>
        <Btn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Cita"><Quote size={16} /></Btn>
        <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Separador"><Minus size={16} /></Btn>
      </Group>

      <Sep />

      <Group>
        <Btn active={editor.isActive('link')} onClick={setLink} title="Insertar enlace"><Link2 size={16} /></Btn>
        <Btn onClick={() => void addImage()} title="Insertar imagen desde el disco (o pégala / arrástrala)"><ImageIcon size={16} /></Btn>
        <Btn
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title="Insertar tabla"
        >
          <TableIcon size={16} />
        </Btn>
        <Btn onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title="Quitar formato"><Eraser size={16} /></Btn>
      </Group>

      <div className="ml-auto flex items-center gap-3 pr-1 text-xs tabular-nums text-ink-500 dark:text-ink-400">
        <span>{num(words)} palabras</span>
        <span className="hidden sm:inline">{num(chars)} caracteres</span>
      </div>
    </div>
  )
}

function Group({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>
}

function Sep() {
  return <div className="mx-1.5 h-5 w-px bg-ink-200 dark:bg-ink-700" />
}

function Btn({
  children, onClick, active, disabled, title,
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  disabled?: boolean
  title: string
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded p-1.5 transition disabled:opacity-30 ${
        active
          ? 'bg-accent-100 text-accent-700 dark:bg-accent-900/60 dark:text-accent-200'
          : 'text-ink-600 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800'
      }`}
    >
      {children}
    </button>
  )
}

export { Pilcrow, Heading1, Heading2, Heading3 }
