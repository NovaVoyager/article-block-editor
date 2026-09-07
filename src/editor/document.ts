import type { Editor } from '@tiptap/core'
import { EditorState } from '@tiptap/pm/state'
import { toProtocolJSON, validateProtocolDocument } from './protocol'
import type { ProseMirrorJSON } from './types'

export function createEmptyDocument(): ProseMirrorJSON {
  return { type: 'doc', content: [{ type: 'paragraph' }] }
}

/** Validate BEFORE normalization: unknown fields must not disappear silently. */
export function replaceEditorDocument(editor: Editor, value: ProseMirrorJSON, beforeReplace?: () => void): boolean {
  const result = validateProtocolDocument(value)
  if (!result.valid) throw new Error(result.errors.join('\n'))
  const node = editor.schema.nodeFromJSON(value)
  node.check()
  const normalized = toProtocolJSON(node.toJSON() as ProseMirrorJSON)
  const current = toProtocolJSON(editor.getJSON() as ProseMirrorJSON)
  if (JSON.stringify(normalized) === JSON.stringify(current)) return false
  beforeReplace?.()

  // A new external document must not be undoable back into the previous article.
  const nextState = EditorState.create({
    schema: editor.schema,
    doc: node,
    plugins: editor.state.plugins,
  })
  // Vue Editor maintains a reactive state mirror through this lifecycle event.
  editor.emit('beforeTransaction', { editor, transaction: editor.state.tr, nextState })
  editor.view.updateState(nextState)
  // Notify Vue/Tiptap's reactive state after replacing the history-bearing state.
  editor.view.dispatch(nextState.tr.setMeta('addToHistory', false).setMeta('hideDragHandle', true))
  return true
}
