import { useEffect, useMemo, useRef } from 'react'
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
import EditorToolbar from './EditorToolbar'

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
  placeholder = 'Escribe aquí…',
  editable = true,
  onChange,
  onEditorReady,
  toolbar = true,
  page = true,
  className = '',
  autofocus = false,
}: EditorProps) {
  const { focusMode, typewriter, fontScale } = useApp()
  const timer = useRef<number | null>(null)
  const lastPushed = useRef<string>('')

  const extensions = useMemo(() => buildExtensions(placeholder), [placeholder])

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
          lang: 'es',
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

  useEffect(() => {
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

  return (
    <div className={`flex h-full flex-col ${focusMode ? 'wf-focus' : ''} ${className}`}>
      {toolbar && editor && <EditorToolbar editor={editor} />}
      <div className={`flex-1 overflow-y-auto ${page ? 'bg-ink-100 py-8 dark:bg-ink-950' : ''}`}>
        <div
          className={page ? 'wf-page' : 'px-6 py-4'}
          style={{ fontSize: `${fontScale}em` }}
        >
          <div className={typewriter ? 'wf-typewriter' : ''}>
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </div>
  )
}
