import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import type { SelectedNode } from './types'
import { copyWithFreshIdentities } from './anchors'

export function getSelectedNode(editor: Editor): SelectedNode | null {
  const { doc, selection } = editor.state

  if (selection instanceof NodeSelection) {
    return {
      node: selection.node,
      pos: selection.from,
      depth: selection.$from.depth,
      topLevelIndex: topLevelIndexAt(doc, selection.from),
    }
  }

  const inspectable = new Set([
    'paragraph',
    'heading',
    'blockquote',
    'bulletList',
    'orderedList',
    'listItem',
    'codeBlock',
    'image',
    'articleButton',
    'resourceQuestion',
    'table',
    'tableRow',
    'tableCell',
    'horizontalRule',
  ])

  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    const node = selection.$from.node(depth)
    if (!inspectable.has(node.type.name)) continue
    const pos = selection.$from.before(depth)
    return { node, pos, depth, topLevelIndex: topLevelIndexAt(doc, pos) }
  }

  return null
}

export function selectNode(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos)
  if (!node || !NodeSelection.isSelectable(node)) return
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)))
  editor.commands.focus()
}

export function updateNodeAttrs(
  editor: Editor,
  selected: SelectedNode,
  patch: Record<string, unknown>,
) {
  const attrs = { ...selected.node.attrs, ...patch }
  editor.view.dispatch(editor.state.tr.setNodeMarkup(selected.pos, undefined, attrs).scrollIntoView())
}

export function deleteNode(editor: Editor, selected: SelectedNode) {
  const transaction = editor.state.tr.delete(selected.pos, selected.pos + selected.node.nodeSize)
  editor.view.dispatch(transaction.scrollIntoView())
  editor.commands.focus()
}

export function duplicateNode(editor: Editor, selected: SelectedNode) {
  let duplicate = copyWithFreshIdentities(selected.node)
  if (duplicate.type.name === 'articleButton' && duplicate.attrs.style !== 'link') {
    duplicate = duplicate.type.create(
      { ...duplicate.attrs, id: `action-${crypto.randomUUID().slice(0, 8)}` },
      duplicate.content,
      duplicate.marks,
    )
  }
  const insertAt = selected.pos + selected.node.nodeSize
  const transaction = editor.state.tr.insert(insertAt, duplicate)
  editor.view.dispatch(transaction.scrollIntoView())
  selectNode(editor, insertAt)
}

export function moveTopLevelNode(editor: Editor, selected: SelectedNode, direction: -1 | 1) {
  const { doc } = editor.state
  const index = selected.topLevelIndex
  if (index < 0) return

  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= doc.childCount) return

  let currentPos = 0
  for (let i = 0; i < index; i += 1) currentPos += doc.child(i).nodeSize

  const node = doc.child(index)
  const transaction = editor.state.tr.delete(currentPos, currentPos + node.nodeSize)
  let insertAt: number

  if (direction < 0) {
    insertAt = 0
    for (let i = 0; i < targetIndex; i += 1) insertAt += doc.child(i).nodeSize
  } else {
    const nextNode = doc.child(targetIndex)
    insertAt = currentPos + nextNode.nodeSize
  }

  transaction.insert(insertAt, node)
  editor.view.dispatch(transaction.scrollIntoView())
  selectNode(editor, insertAt)
}

function topLevelIndexAt(doc: Editor['state']['doc'], pos: number) {
  let offset = 0
  for (let index = 0; index < doc.childCount; index += 1) {
    const end = offset + doc.child(index).nodeSize
    if (pos >= offset && pos < end) return index
    offset = end
  }
  return -1
}
