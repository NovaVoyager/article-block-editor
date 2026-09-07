// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { Editor } from '@tiptap/core'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { TableMap } from '@tiptap/pm/tables'
import ArticleEditor from './ArticleEditor.vue'
import type { ArticleEditorExpose, ArticleEditorProps } from './editor/public-types'
import type { ProseMirrorJSON } from './editor/types'
import { validateProtocolV1Document } from './editor/protocol'

const paragraph = (text: string): ProseMirrorJSON => ({ type: 'paragraph', content: [{ type: 'text', text }] })
const table = (rows = 3, columns = 3): ProseMirrorJSON => ({
  type: 'table', content: Array.from({ length: rows }, (_, row) => ({
    type: 'tableRow', content: Array.from({ length: columns }, (_, column) => ({
      type: 'tableCell', content: [paragraph(`R${row + 1}C${column + 1}`)],
    })),
  })),
})
const tableDocument = (rows = 3, columns = 3): ProseMirrorJSON => ({ type: 'doc', content: [table(rows, columns), paragraph('表格外正文')] })
const wrappers: ReturnType<typeof mount>[] = []
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 30)); await nextTick() }
async function create(props: ArticleEditorProps = { modelValue: tableDocument() }) {
  const wrapper = mount(ArticleEditor, { props, attachTo: document.body, global: { stubs: { DragHandle: true } } })
  wrappers.push(wrapper)
  await settle()
  const editor = (wrapper.find('.article-editor').element as HTMLElement & { editor: Editor }).editor
  return { wrapper, editor, api: wrapper.vm as unknown as ArticleEditorExpose }
}
function cellPos(editor: Editor, row: number, column: number, tablePos = 0) {
  const map = TableMap.get(editor.state.doc.nodeAt(tablePos)!)
  return tablePos + 1 + map.map[row * map.width + column]!
}
async function selectCell(editor: Editor, row = 0, column = 0, tablePos = 0) {
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(cellPos(editor, row, column, tablePos) + 1))))
  await settle()
}
async function action(wrapper: ReturnType<typeof mount>, label: string) {
  await wrapper.findAll('.table-actions button').find(button => button.text() === label)!.trigger('click')
  await settle()
}
function expectSize(api: ArticleEditorExpose, rows: number, columns: number, tableIndex = 0) {
  const current = api.getJSON().content!.filter(node => node.type === 'table')[tableIndex]!
  expect(current.content).toHaveLength(rows)
  expect(current.content!.every(row => row.content?.length === columns)).toBe(true)
  expect(validateProtocolV1Document(api.getJSON()).valid).toBe(true)
}

beforeEach(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('Table structure editing', () => {
  it('shows table controls for a paragraph caret, keeps paragraph settings and grows beyond 3 × 3', async () => {
    const { wrapper, editor, api } = await create()
    await selectCell(editor, 1, 1)
    expect(wrapper.find('.selected-summary').text()).toContain('正文段落')
    expect(wrapper.find('select[aria-label="正文字体大小"]').exists()).toBe(true)
    expect(wrapper.find('.table-size').text()).toBe('3 行 × 3 列')
    await action(wrapper, '添加行')
    expectSize(api, 4, 3)
    expect(wrapper.find('.table-size').text()).toBe('4 行 × 3 列')
    // The new row is below the clicked row, not always at the end or in the first row.
    expect(api.getJSON().content![0]!.content![3]!.content![0]!.content![0]!.content![0]!.text).toBe('R3C1')
    await action(wrapper, '添加列')
    expectSize(api, 4, 4)
    expect(wrapper.find('.table-size').text()).toBe('4 行 × 4 列')
    expect(wrapper.find('.article-editor').text()).toContain('R3C3')
    await action(wrapper, '添加列')
    expectSize(api, 4, 5)
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual(api.getJSON())
    await wrapper.find('button.action-button.primary').trigger('click')
    const saved = wrapper.emitted('save')?.at(-1)?.[0] as ProseMirrorJSON
    const loaded = await create({ modelValue: saved })
    expectSize(loaded.api, 4, 5)
  })

  it('shows usable controls after inserting the default table from the library', async () => {
    const { wrapper, editor, api } = await create({})
    await wrapper.findAll('.module-card').find(button => button.find('strong').text() === '表格')!.trigger('click')
    await settle()
    expectSize(api, 3, 3)
    expect(wrapper.find('.table-actions').exists()).toBe(true)
    await action(wrapper, '添加行')
    await action(wrapper, '添加列')
    expectSize(api, 4, 4)
    expect(editor.isEditable).toBe(true)
  })

  it('supports a whole-table node selection and appends after its last row/column', async () => {
    const { wrapper, editor, api } = await create()
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)))
    await settle()
    expect(wrapper.find('.selected-summary').text()).toContain('表格')
    await action(wrapper, '添加行')
    expectSize(api, 4, 3)
    expect(api.getJSON().content![0]!.content![3]!.content![0]!.content![0]!.content).toBeUndefined()
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)))
    await settle()
    await action(wrapper, '添加列')
    expectSize(api, 4, 4)
    expect(api.getJSON().content![0]!.content![0]!.content![3]!.content![0]!.content).toBeUndefined()
  })

  it('deletes the selected row or column and supports undo/redo', async () => {
    const { wrapper, editor, api } = await create()
    await selectCell(editor, 1, 1)
    const before = api.getJSON()
    await action(wrapper, '删除行')
    expectSize(api, 2, 3)
    expect(wrapper.find('.article-editor').text()).not.toContain('R2C1')
    await wrapper.find('button[title="撤销"]').trigger('click')
    await settle()
    expect(api.getJSON()).toEqual(before)
    await wrapper.find('button[title="重做"]').trigger('click')
    await settle()
    expectSize(api, 2, 3)
    await selectCell(editor, 0, 1)
    await action(wrapper, '删除列')
    expectSize(api, 2, 2)
    expect(wrapper.find('.article-editor').text()).not.toContain('R1C2')
    expect(wrapper.find('.table-size').text()).toBe('2 行 × 2 列')
  })

  it('only changes the table containing the cursor and hides controls outside it', async () => {
    const { wrapper, editor, api } = await create({ modelValue: { type: 'doc', content: [table(), paragraph('中间正文'), table(2, 2)] } })
    const secondPos = editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize
    await selectCell(editor, 0, 0, secondPos)
    await action(wrapper, '添加行')
    expectSize(api, 3, 3, 0)
    expectSize(api, 3, 2, 1)
    const outsidePos = editor.state.doc.child(0).nodeSize + 1
    editor.commands.setTextSelection(outsidePos)
    await settle()
    expect(wrapper.find('.table-actions').exists()).toBe(false)
  })

  it('supports a multi-cell selection for row and column additions', async () => {
    const { wrapper, editor, api } = await create()
    editor.commands.setCellSelection({ anchorCell: cellPos(editor, 0, 0), headCell: cellPos(editor, 1, 1) })
    await settle()
    expect(wrapper.find('.table-actions').exists()).toBe(true)
    await action(wrapper, '添加行')
    await action(wrapper, '添加列')
    expectSize(api, 4, 4)
  })

  it('disables structural editing in readonly and preview modes', async () => {
    const { wrapper, editor, api } = await create({ readonly: true, modelValue: tableDocument() })
    await selectCell(editor)
    const before = api.getJSON()
    expect(wrapper.findAll('.table-actions button').every(button => button.attributes('disabled') !== undefined)).toBe(true)
    await action(wrapper, '添加行')
    expect(api.getJSON()).toEqual(before)
    await wrapper.setProps({ readonly: false })
    await wrapper.findAll('.top-actions .action-button').find(button => button.text() === '预览')!.trigger('click')
    await action(wrapper, '添加列')
    expect(api.getJSON()).toEqual(before)
  })

  it.each(['删除行', '删除列'])('disables %s on the last row/column without invalid empty tables', async label => {
    const { wrapper, editor, api } = await create({ modelValue: tableDocument(1, 1) })
    await selectCell(editor)
    expect(wrapper.findAll('.table-actions button').find(button => button.text() === label)!.attributes('disabled')).toBeDefined()
    const before = api.getJSON()
    await action(wrapper, label)
    expect(api.getJSON()).toEqual(before)
    expectSize(api, 1, 1)
  })
})
