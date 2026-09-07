import type { Editor } from '@tiptap/core'

export function normalizeImageLayout(value: unknown): 'two-column' | null {
  return value === 'two-column' ? value : null
}

export function nextImagePosition(editor: Editor, pos: number): number | null {
  const $pos = editor.state.doc.resolve(pos)
  const image = $pos.nodeAfter
  if (image?.type.name !== 'image' || $pos.parent.maybeChild($pos.index() + 1)?.type.name !== 'image') return null
  return pos + image.nodeSize
}

/** Keep the original image nodes/attributes; only opt two adjacent siblings into the layout. */
export function pairWithNextImage(editor: Editor, pos: number): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false
  const next = nextImagePosition(editor, pos)
  if (next === null) return false
  const transaction = editor.state.tr
  for (const target of [pos, next]) {
    const node = transaction.doc.nodeAt(target)!
    transaction.setNodeMarkup(target, undefined, { ...node.attrs, imageLayout: 'two-column' })
  }
  editor.view.dispatch(transaction)
  return true
}
