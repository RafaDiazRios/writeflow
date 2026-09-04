import { useCallback, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Code, Eraser, Heading1, Heading2,
  Heading3, Highlighter, Image as ImageIcon, Italic, Link2, List, ListOrdered, ListTodo,
  Minus, Pilcrow, Quote, Redo2, Strikethrough, Subscript, Superscript, Table as TableIcon,
  Underline as UnderlineIcon, Undo2,
} from 'lucide-react'
import { useApp } from '@/store/app'
import { EDITOR_PX } from '@/lib/types'
import { elegirImagenDelDisco } from '@/lib/imagenes'
import { num } from '@/i18n'
import { useT } from '@/i18n/useT'

/** Barra de herramientas al estilo de un procesador de textos. */
export default function EditorToolbar({ editor }: { editor: Editor }) {
  const t = useT()
  const { fontScale, setFontScale, notify } = useApp()
  const [, force] = useState(0)

  // Redibuja al cambiar la selección para reflejar los botones activos.
  editor.on('selectionUpdate', () => force((n) => n + 1))
  editor.on('transaction', () => force((n) => n + 1))

  const setLink = useCallback(() => {
    const previous = editor.getAttributes('link').href as string | undefined
    const url = window.prompt(t('editor.direccionEnlace'), previous ?? 'https://')
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
        <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title={t('editor.deshacerAtajo')}>
          <Undo2 size={16} />
        </Btn>
        <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title={t('editor.rehacerAtajo')}>
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
        title={t('editor.estiloParrafo')}
      >
        <option value="p">{t('editor.textoNormal')}</option>
        <option value="h1">{t('editor.titulo1')}</option>
        <option value="h2">{t('editor.titulo2')}</option>
        <option value="h3">{t('editor.titulo3')}</option>
        <option value="quote">{t('editor.cita')}</option>
        <option value="code">{t('editor.codigo')}</option>
      </select>

      <select
        className="mx-1 h-7 w-32 rounded border border-ink-200 bg-transparent px-1.5 text-xs dark:border-ink-700"
        value={(editor.getAttributes('textStyle').fontFamily as string) ?? ''}
        onChange={(e) => {
          const f = e.target.value
          if (!f) editor.chain().focus().unsetFontFamily().run()
          else editor.chain().focus().setFontFamily(f).run()
        }}
        title={t('editor.tipografia')}
      >
        <option value="">{t('editor.predeterminada')}</option>
        <option value="Georgia, serif">Georgia</option>
        <option value="'Times New Roman', serif">Times New Roman</option>
        <option value="Garamond, serif">Garamond</option>
        <option value="Inter, sans-serif">Inter</option>
        <option value="'Segoe UI', sans-serif">Segoe UI</option>
        <option value="'Courier New', monospace">Courier New</option>
      </select>

      {/* Esto NO es el zoom de la página: es el tamaño al que se ve el texto
          mientras escribes, y no cambia nada de lo que exportas. Se enseñaban
          porcentajes a secas —«85 %», ¿de qué?—, así que ahora cada opción dice
          a cuántos píxeles equivale, que es la pregunta que uno se hace. */}
      <select
        className="mx-1 h-7 rounded border border-ink-200 bg-transparent px-1.5 text-xs dark:border-ink-700"
        value={String(fontScale)}
        onChange={(e) => setFontScale(Number(e.target.value))}
        title={t('editor.tamanoTexto')}
      >
        {[0.85, 0.95, 1, 1.1, 1.25, 1.5].map((s) => (
          <option key={s} value={s}>
            {Math.round(s * EDITOR_PX)} px
          </option>
        ))}
      </select>

      <Sep />

      <Group>
        <Btn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title={t('editor.negritaAtajo')}><Bold size={16} /></Btn>
        <Btn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title={t('editor.cursivaAtajo')}><Italic size={16} /></Btn>
        <Btn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title={t('editor.subrayadoAtajo')}><UnderlineIcon size={16} /></Btn>
        <Btn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title={t('editor.tachado')}><Strikethrough size={16} /></Btn>
        <Btn active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} title={t('editor.resaltar')}><Highlighter size={16} /></Btn>
        <Btn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title={t('editor.codigoEnLinea')}><Code size={16} /></Btn>
        <Btn active={editor.isActive('subscript')} onClick={() => editor.chain().focus().toggleSubscript().run()} title={t('editor.subindice')}><Subscript size={16} /></Btn>
        <Btn active={editor.isActive('superscript')} onClick={() => editor.chain().focus().toggleSuperscript().run()} title={t('editor.superindice')}><Superscript size={16} /></Btn>
      </Group>

      <input
        type="color"
        className="mx-1 h-6 w-6 cursor-pointer rounded border border-ink-200 bg-transparent dark:border-ink-700"
        value={(editor.getAttributes('textStyle').color as string) ?? '#25231f'}
        onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        title={t('editor.colorTexto')}
      />

      <Sep />

      <Group>
        <Btn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title={t('editor.alinearIzquierda')}><AlignLeft size={16} /></Btn>
        <Btn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title={t('editor.centrar')}><AlignCenter size={16} /></Btn>
        <Btn active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title={t('editor.alinearDerecha')}><AlignRight size={16} /></Btn>
        <Btn active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()} title={t('editor.justificar')}><AlignJustify size={16} /></Btn>
      </Group>

      <Sep />

      <Group>
        <Btn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title={t('editor.listaVinetas')}><List size={16} /></Btn>
        <Btn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title={t('editor.listaNumerada')}><ListOrdered size={16} /></Btn>
        <Btn active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} title={t('editor.listaTareas')}><ListTodo size={16} /></Btn>
        <Btn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title={t('editor.cita')}><Quote size={16} /></Btn>
        <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} title={t('editor.separador')}><Minus size={16} /></Btn>
      </Group>

      <Sep />

      <Group>
        <Btn active={editor.isActive('link')} onClick={setLink} title={t('editor.insertarEnlace')}><Link2 size={16} /></Btn>
        <Btn onClick={() => void addImage()} title={t('editor.insertarImagen')}><ImageIcon size={16} /></Btn>
        <Btn
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title={t('editor.insertarTabla')}
        >
          <TableIcon size={16} />
        </Btn>
        <Btn onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} title={t('editor.quitarFormato')}><Eraser size={16} /></Btn>
      </Group>

      <div className="ml-auto flex items-center gap-3 pr-1 text-xs tabular-nums text-ink-500 dark:text-ink-400">
        <span>
          {num(words)} {t('unidad.palabras')}
        </span>
        <span className="hidden sm:inline">
          {num(chars)} {t('unidad.caracteres')}
        </span>
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
