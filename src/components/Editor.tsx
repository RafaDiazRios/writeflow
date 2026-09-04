import { useCallback, useEffect, useMemo, useRef } from 'react'
import { EditorContent, useEditor, type Editor as TiptapEditor, type JSONContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import Typography from '@tiptap/extension-typography'
import CharacterCount from '@tiptap/extension-character-count'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import Image from '@tiptap/extension-image'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import Focus from '@tiptap/extension-focus'
import { useApp } from '@/store/app'
import { docToText } from '@/lib/text'
import { useIsMobile } from '@/lib/platform'
import { imagenesDe, prepararImagen } from '@/lib/imagenes'
import EditorToolbar from './EditorToolbar'
import MobileToolbar from './MobileToolbar'
import { LOCALE_INTL, resolverEscritura, t } from '@/i18n'

export interface EditorProps {
  value: JSONContent | null
  placeholder?: string
  editable?: boolean
  /** Se dispara con el debounce ya aplicado por el contenedor. */
  onChange: (doc: JSONContent, text: string) => void
  onEditorReady?: (editor: TiptapEditor) => void
  toolbar?: boolean
  page?: boolean
  className?: string
  autofocus?: boolean
}

export function buildExtensions(placeholder: string) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: { HTMLAttributes: { class: 'wf-code' } },
    }),
    Placeholder.configure({ placeholder, emptyEditorClass: 'is-editor-empty' }),
    Underline,
    Subscript,
    Superscript,
    TextStyle,
    Color,
    FontFamily,
    Typography,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener' } }),
    Image.configure({ allowBase64: true }),
    CharacterCount,
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    TaskList,
    TaskItem.configure({ nested: true }),
    Focus.configure({ className: 'has-focus', mode: 'shallowest' }),
  ]
}

export default function Editor({
  value,
  placeholder = t('editor.placeholderPorDefecto'),
  editable = true,
  onChange,
  onEditorReady,
  toolbar = true,
  page = true,
  className = '',
  autofocus = false,
}: EditorProps) {
  const { focusMode, typewriter, fontScale, notify, uiLang, writeLang } = useApp()
  /* El corrector del sistema mira el `lang` del elemento. Se deriva aquí de los
   * dos ajustes, y no de `idiomaEscritura()`, porque así el componente se vuelve
   * a pintar cuando cambian: leer el módulo daría el valor correcto al montar y
   * uno viejo para siempre después. */
  const langEscritura = LOCALE_INTL[resolverEscritura(writeLang, uiLang)]
  const isMobile = useIsMobile()
  const timer = useRef<number | null>(null)
  const lastPushed = useRef<string>('')
  const editorRef = useRef<TiptapEditor | null>(null)

  const extensions = useMemo(() => buildExtensions(placeholder), [placeholder])

  /**
   * Mete en el documento las imágenes que llegan pegadas o arrastradas.
   *
   * Va por referencia y no por la variable `editor` porque los manejadores de
   * ProseMirror se crean una sola vez, cuando aún no hay editor que capturar.
   */
  const insertarImagenes = useCallback(
    (files: File[]) => {
      void (async () => {
        for (const f of files) {
          try {
            const img = await prepararImagen(f)
            editorRef.current
              ?.chain()
              .focus()
              .setImage({ src: img.src, alt: f.name.replace(/\.[^.]+$/, '') })
              .run()
          } catch (e) {
            notify('error', e instanceof Error ? e.message : String(e))
          }
        }
      })()
    },
    [notify],
  )

  const editor = useEditor(
    {
      extensions,
      content: value ?? { type: 'doc', content: [{ type: 'paragraph' }] },
      editable,
      autofocus: autofocus ? 'end' : false,
      editorProps: {
        attributes: {
          class: 'wf-prose tiptap',
          spellcheck: 'true',
          /* Valor inicial. A partir de aquí lo mantiene al día el efecto de más
           * abajo: `useEditor` solo se vuelve a crear si cambian las
           * extensiones, así que esto se evalúa una vez y no basta. */
          lang: langEscritura,
        },
        // Pegar o arrastrar una imagen la incrusta ya reescalada. Se devuelve
        // `true` para quedarse el evento: si no, ProseMirror inserta por su
        // cuenta la URL temporal del archivo, que deja de existir al cerrar.
        handlePaste(_view, event) {
          const files = imagenesDe(event.clipboardData)
          if (files.length === 0) return false
          event.preventDefault()
          insertarImagenes(files)
          return true
        },
        handleDrop(_view, event) {
          const files = imagenesDe((event as DragEvent).dataTransfer)
          if (files.length === 0) return false
          event.preventDefault()
          insertarImagenes(files)
          return true
        },
      },
      onUpdate({ editor }) {
        if (timer.current) window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => {
          const json = editor.getJSON()
          const serialized = JSON.stringify(json)
          if (serialized === lastPushed.current) return
          lastPushed.current = serialized
          onChange(json, docToText(json))
        }, 450)
      },
    },
    [extensions],
  )

  // Carga contenido cuando cambia el documento seleccionado (no en cada tecla).
  useEffect(() => {
    if (!editor) return
    const incoming = JSON.stringify(value ?? {})
    if (incoming === lastPushed.current) return
    lastPushed.current = incoming
    editor.commands.setContent(value ?? { type: 'doc', content: [{ type: 'paragraph' }] }, false)
  }, [editor, value])

  useEffect(() => {
    if (editor) editor.setEditable(editable)
  }, [editor, editable])

  /* Cambiar el idioma de escritura tiene que cambiar el diccionario del
   * corrector sin cerrar el documento. Se toca el atributo del elemento y no
   * las opciones del editor: reconstruirlo aquí perdería la selección y el
   * historial de deshacer. */
  useEffect(() => {
    editor?.view.dom.setAttribute('lang', langEscritura)
  }, [editor, langEscritura])

  useEffect(() => {
    editorRef.current = editor ?? null
    if (editor && onEditorReady) onEditorReady(editor)
  }, [editor, onEditorReady])

  // Guarda lo pendiente al desmontar para no perder los últimos caracteres.
  useEffect(() => {
    return () => {
      if (timer.current) {
        window.clearTimeout(timer.current)
        timer.current = null
      }
    }
  }, [])

  // En móvil no hay hoja A4 —no tiene sentido imitar un folio en una pantalla de
  // cinco pulgadas— y la barra de formato va abajo, encima del teclado.
  const paged = page && !isMobile

  return (
    <div className={`flex h-full min-h-0 flex-col ${focusMode ? 'wf-focus' : ''} ${className}`}>
      {toolbar && editor && !isMobile && <EditorToolbar editor={editor} />}
      <div className={`min-h-0 flex-1 overflow-y-auto ${paged ? 'bg-ink-100 py-8 dark:bg-ink-950' : ''}`}>
        <div
          className={paged ? 'wf-page' : isMobile ? 'px-4 py-3' : 'px-6 py-4'}
          style={{ fontSize: `${fontScale}em` }}
        >
          <div className={typewriter && !isMobile ? 'wf-typewriter' : ''}>
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
      {toolbar && editor && isMobile && <MobileToolbar editor={editor} />}
    </div>
  )
}
