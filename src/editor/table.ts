import type { Editor } from '@tiptap/core'
import type { ResolvedPos } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'
import { isInTable, selectedRect, TableMap } from '@tiptap/pm/tables'

export type TableCommand = 'addRowAfter' | 'addColumnAfter' | 'deleteRow' | 'deleteColumn'
export interface TableContext {
  pos: number
  rows: number
  columns: number
  canDeleteRow: boolean
  canDeleteColumn: boolean
}

function ancestorTable($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === 'table') return { node: $pos.node(depth), pos: $pos.before(depth) }
  }
  return null
}

/** Table context is independent of the innermost block inspected (usually a paragraph). */
export function getTableContext(editor: Editor): TableContext | null {
  const { selection } = editor.state
  let table
  if (selection instanceof NodeSelection && selection.node.type.name === 'table') {
    table = { node: selection.node, pos: selection.from }
  } else {
    table = ancestorTable(selection.$from)
    // Do not apply structural edits to a selection spanning separate tables or body text.
    if (!table || table.pos !== ancestorTable(selection.$to)?.pos) return null
  }
  const map = TableMap.get(table.node)
  const rect = isInTable(editor.state) ? selectedRect(editor.state) : null
  return {
    pos: table.pos, rows: map.height, columns: map.width,
    canDeleteRow: (rect ? rect.bottom - rect.top : 1) < map.height,
    canDeleteColumn: (rect ? rect.right - rect.left : 1) < map.width,
  }
}

export function applyTableCommand(editor: Editor, command: TableCommand): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false
  const table = getTableContext(editor)
  if (!table || (command === 'deleteRow' && !table.canDeleteRow) || (command === 'deleteColumn' && !table.canDeleteColumn)) return false
  const { selection } = editor.state
  const chain = editor.chain().focus()
  if (!isInTable(editor.state)) {
    if (!(selection instanceof NodeSelection)) return false
    if (selection.node.type.name === 'table') {
      // A whole-table NodeSelection has no cell ancestor; anchor at the last cell so additions append.
      const lastCell = TableMap.get(selection.node).map.at(-1)
      if (lastCell === undefined) return false
      chain.setCellSelection({ anchorCell: selection.from + 1 + lastCell })
    } else if (selection.node.type.name === 'tableRow' && selection.node.lastChild) {
      chain.setCellSelection({ anchorCell: selection.from + 1 + selection.node.content.size - selection.node.lastChild.nodeSize })
    } else return false
  }
  switch (command) {
    case 'addRowAfter': return chain.addRowAfter().run()
    case 'addColumnAfter': return chain.addColumnAfter().run()
    case 'deleteRow': return chain.deleteRow().run()
    case 'deleteColumn': return chain.deleteColumn().run()
    default: return false
  }
}
