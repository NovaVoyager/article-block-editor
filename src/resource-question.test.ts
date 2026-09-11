// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { h, nextTick } from 'vue'
import { Editor, getSchema } from '@tiptap/core'
import { DOMParser, DOMSerializer } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import Ajv from 'ajv'
import ArticleEditor from './ArticleEditor.vue'
import type { ArticleEditorExpose, ArticleEditorProps } from './editor/public-types'
import type { ProseMirrorJSON } from './editor/types'
import { createProtocolExtensions } from './editor/extensions'
import { bindQuestionOption, createResourceQuestion, findQuestion, paragraphTargets, snapshotResourceQuestion, type ResourceQuestionData, type ResourceQuestionPickerScope } from './editor/resource-question'
import { duplicateNode, getSelectedNode, moveTopLevelNode, selectNode } from './editor/selection'
import { toProtocolJSON, validateProtocolDocument, validateProtocolV1Document } from './editor/protocol'
import { getCurrentProtocol } from './protocol/current-protocol'

const data: ResourceQuestionData = { resourceId: 'sleep', title: '入睡时间？', description: '请选择', options: [{ id: 'fast', label: '5分钟以内' }, { id: 'slow', label: '30分钟以上' }] }
const question = (): ProseMirrorJSON => ({ type: 'resourceQuestion', attrs: { id: 'q1', ...structuredClone(data), hideFollowing: false, revealKey: 'unlock-q1' } })
const article = (): ProseMirrorJSON => ({ type: 'doc', content: [question(), { type: 'paragraph', content: [{ type: 'text', text: '目标段落' }] }, { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '另一目标' }] }] })
const wrappers: ReturnType<typeof mount>[] = []
const editors: Editor[] = []
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 35)); await nextTick() }
beforeEach(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  editors.splice(0).forEach(editor => editor.destroy())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})
function core(content = article()) {
  const editor = new Editor({ extensions: createProtocolExtensions(), content, injectCSS: false })
  editors.push(editor)
  return editor
}
async function component(props: ArticleEditorProps = { modelValue: article() }) {
  let scope: ResourceQuestionPickerScope | undefined
  const wrapper = mount(ArticleEditor, { props, attachTo: document.body, global: { stubs: { DragHandle: true } }, slots: {
    'resource-question-picker': (value: ResourceQuestionPickerScope) => { scope = value; return h('button', { class: 'host-resource', onClick: () => value.select(data) }, '宿主选择资源') },
  } })
  wrappers.push(wrapper)
  await settle()
  const editor = (wrapper.find('.article-editor').element as HTMLElement & { editor: Editor }).editor
  return { wrapper, editor, api: wrapper.vm as unknown as ArticleEditorExpose, scope: () => scope! }
}

describe('resource snapshots and protocol', () => {
  it('accepts new nodes, preserves old v1, and updates the offline downloadable schema', () => {
    expect(validateProtocolDocument(article()).valid).toBe(true)
    expect(validateProtocolV1Document(article()).valid).toBe(false)
    const old = { type: 'doc', content: [{ type: 'paragraph' }] }
    expect(validateProtocolV1Document(old).valid).toBe(true)
    expect(validateProtocolDocument(old).valid).toBe(true)
    expect(toProtocolJSON(old)).toEqual(old)
    const protocol = getCurrentProtocol()
    expect(protocol.nodes.some(node => node.type === 'resourceQuestion')).toBe(true)
    expect(protocol.nodes.find(node => node.type === 'heading')?.attributes.some(attr => attr.name === 'anchorId')).toBe(true)
    expect(protocol.nodes.find(node => node.type === 'paragraph')?.attributes.some(attr => attr.name === 'anchorId')).toBe(true)
    const validate = new Ajv({ strict: false }).compile(protocol.documentSchema)
    expect(validate(article())).toBe(true)
    const nested = { type: 'doc', content: [{ type: 'blockquote', content: [question()] }] }
    expect(validate(nested)).toBe(false)
    expect(validateProtocolDocument(nested).valid).toBe(false)
    const attrs = article(); attrs.content![0]!.attrs!.fetchUrl = '/not-supported'
    expect(validate(attrs)).toBe(false)
    expect(validateProtocolDocument({ type: 'doc', content: [createResourceQuestion()] }).valid).toBe(true)
  })

  it('rejects duplicate identities, missing option IDs and malformed selected data', () => {
    const duplicateOptions = article()
    duplicateOptions.content![0]!.attrs!.options = [{ id: 'same', label: 'a' }, { id: 'same', label: 'b' }]
    expect(validateProtocolDocument(duplicateOptions).valid).toBe(false)
    for (const patch of [{ id: '' }, { revealKey: ' ' }, { options: [{ label: 'no ID' }] }]) {
      const value = article(); Object.assign(value.content![0]!.attrs!, patch)
      expect(validateProtocolDocument(value).valid).toBe(false)
    }
    expect(validateProtocolDocument({ type: 'doc', content: [question(), question()] }).valid).toBe(false)
    expect(validateProtocolDocument({ type: 'doc', content: [
      { type: 'paragraph', attrs: { anchorId: 'same' } }, { type: 'heading', attrs: { level: 2, anchorId: 'same' } },
    ] }).valid).toBe(false)
    expect(() => snapshotResourceQuestion({ ...data, options: [{ id: 'x', label: 'a' }, { id: 'x', label: 'b' }] })).toThrow('唯一')
    expect(() => snapshotResourceQuestion({ ...data, options: [] })).toThrow()
    const source = structuredClone(data)
    const snapshot = snapshotResourceQuestion(source)
    source.options[0]!.label = '外部修改'
    expect(snapshot.options[0]!.label).toBe('5分钟以内')
  })

  it('round-trips snapshots/anchors through editor JSON and clipboard HTML without interpreting text as HTML', () => {
    const value = article()
    value.content![0]!.attrs!.title = '<img src=x onerror=alert(1)>'
    value.content![1]!.attrs = { anchorId: 'p1' }
    const editor = core(value)
    expect(toProtocolJSON(editor.getJSON() as ProseMirrorJSON)).toEqual(value)
    const schema = getSchema(createProtocolExtensions())
    const div = document.createElement('div')
    div.append(DOMSerializer.fromSchema(schema).serializeFragment(editor.state.doc.content))
    expect(div.querySelector('img')).toBeNull()
    expect(div.textContent).toContain('<img src=x')
    expect(toProtocolJSON(DOMParser.fromSchema(schema).parse(div).toJSON())).toEqual(value)
  })
})

describe('paragraph binding identity', () => {
  it('creates anchor and binding in one undoable transaction, then clears without removing the anchor', () => {
    const editor = core()
    const target = paragraphTargets(editor.state.doc)[0]!
    expect(bindQuestionOption(editor, 'q1', 'fast', target.pos)).toBe(true)
    const anchor = paragraphTargets(editor.state.doc)[0]!.anchorId
    expect(anchor).toBeTruthy()
    expect(findQuestion(editor.state.doc, 'q1')!.node.attrs.options[0].targetAnchorId).toBe(anchor)
    expect(editor.commands.undo()).toBe(true)
    expect(paragraphTargets(editor.state.doc)[0]!.anchorId).toBeNull()
    expect(findQuestion(editor.state.doc, 'q1')!.node.attrs.options[0].targetAnchorId).toBeUndefined()
    expect(editor.commands.redo()).toBe(true)
    expect(paragraphTargets(editor.state.doc)[0]!.anchorId).toBe(anchor)
    expect(bindQuestionOption(editor, 'q1', 'fast', null)).toBe(true)
    expect(findQuestion(editor.state.doc, 'q1')!.node.attrs.options[0].targetAnchorId).toBeUndefined()
    expect(paragraphTargets(editor.state.doc)[0]!.anchorId).toBe(anchor)
    expect(bindQuestionOption(editor, 'q1', 'unknown', target.pos)).toBe(false)
    expect(bindQuestionOption(editor, 'q1', 'fast', 0)).toBe(false)
    editor.setEditable(false)
    expect(bindQuestionOption(editor, 'q1', 'slow', target.pos)).toBe(false)
  })

  it('preserves targets through edits/moves, gives copies new identities and keeps split identity only on the original', () => {
    const editor = core()
    bindQuestionOption(editor, 'q1', 'fast', paragraphTargets(editor.state.doc)[0]!.pos)
    const target = paragraphTargets(editor.state.doc)[0]!
    editor.commands.insertContentAt(target.pos + 1, '新文字')
    expect(paragraphTargets(editor.state.doc)[0]!.anchorId).toBe(target.anchorId)
    selectNode(editor, target.pos)
    moveTopLevelNode(editor, getSelectedNode(editor)!, 1)
    expect(paragraphTargets(editor.state.doc).find(item => item.anchorId === target.anchorId)!.label).toContain('新文字')
    const moved = paragraphTargets(editor.state.doc).find(item => item.anchorId === target.anchorId)!
    selectNode(editor, moved.pos)
    duplicateNode(editor, getSelectedNode(editor)!)
    expect(paragraphTargets(editor.state.doc).filter(item => item.anchorId === target.anchorId)).toHaveLength(1)
    const anchors = paragraphTargets(editor.state.doc).map(item => item.anchorId).filter(Boolean)
    expect(new Set(anchors).size).toBe(anchors.length)
    editor.commands.setTextSelection(moved.pos + 3)
    editor.commands.splitBlock()
    expect(paragraphTargets(editor.state.doc).filter(item => item.anchorId === target.anchorId)).toHaveLength(1)
    expect(paragraphTargets(editor.state.doc).find(item => item.pos === moved.pos)!.anchorId).toBe(target.anchorId)
    selectNode(editor, 0)
    duplicateNode(editor, getSelectedNode(editor)!)
    const copy = editor.state.doc.child(1)
    expect(copy.attrs.id).not.toBe('q1')
    expect(copy.attrs.revealKey).not.toBe('unlock-q1')
    expect(copy.attrs.options[0].targetAnchorId).toBe(target.anchorId)
    expect(validateProtocolDocument(toProtocolJSON(editor.getJSON() as ProseMirrorJSON)).valid).toBe(true)
  })

  it('keeps the existing target when a duplicate is inserted before it and undoes repairs with the edit', () => {
    const editor = core()
    bindQuestionOption(editor, 'q1', 'fast', paragraphTargets(editor.state.doc)[0]!.pos)
    const original = paragraphTargets(editor.state.doc)[0]!
    const node = editor.state.doc.nodeAt(original.pos)!
    editor.view.dispatch(closeHistory(editor.state.tr).insert(original.pos, node))
    const targets = paragraphTargets(editor.state.doc)
    // Same node object in both positions: mapping must identify the surviving original.
    expect(targets[1]!.anchorId).toBe(original.anchorId)
    expect(targets[0]!.anchorId).not.toBe(original.anchorId)
    editor.commands.undo()
    expect(paragraphTargets(editor.state.doc)[0]!.anchorId).toBe(original.anchorId)
  })

  it('keeps the anchor when switching paragraph/heading types and refreshes IDs on clipboard paste', () => {
    const editor = core()
    bindQuestionOption(editor, 'q1', 'fast', paragraphTargets(editor.state.doc)[0]!.pos)
    const target = paragraphTargets(editor.state.doc)[0]!
    editor.commands.setTextSelection(target.pos + 1)
    editor.commands.setHeading({ level: 3 })
    expect(paragraphTargets(editor.state.doc)[0]!.anchorId).toBe(target.anchorId)
    editor.commands.setParagraph()
    expect(paragraphTargets(editor.state.doc)[0]!.anchorId).toBe(target.anchorId)
    const original = editor.state.doc.slice(target.pos, target.pos + editor.state.doc.nodeAt(target.pos)!.nodeSize)
    let pasted = original
    editor.view.someProp('transformPasted', transform => { pasted = transform(pasted, editor.view, false); return false })
    expect(pasted.content.firstChild!.attrs.anchorId).not.toBe(target.anchorId)
    expect(original.content.firstChild!.attrs.anchorId).toBe(target.anchorId)
    editor.view.dragging = { slice: original, move: true }
    let dragged = original
    editor.view.someProp('transformPasted', transform => { dragged = transform(dragged, editor.view, false); return false })
    expect(dragged.content.firstChild!.attrs.anchorId).toBe(target.anchorId)
    editor.view.dragging = null
  })
})

describe('resource question component workflow', () => {
  it('inserts from the extension group at top level even with a cursor inside a nested container', async () => {
    const { wrapper, editor, api } = await component({ modelValue: { type: 'doc', content: [{ type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: '引用' }] }] }] } })
    editor.commands.setTextSelection(2)
    const card = wrapper.findAll('.module-card').find(item => item.text().includes('资源问题'))!
    const transfer = { setData: vi.fn(), effectAllowed: '' }
    await card.trigger('dragstart', { dataTransfer: transfer })
    expect(JSON.parse(transfer.setData.mock.calls[0]![1]).type).toBe('resourceQuestion')
    await card.trigger('click'); await settle()
    expect(api.getJSON().content?.[1]?.type).toBe('resourceQuestion')
    expect(api.validate().valid).toBe(true)
    expect(wrapper.find('.resource-settings').exists()).toBe(true)
  })

  it('exposes a host picker, rejects bad IDs, saves detached data, preserves same-resource bindings by ID and clears them on replacement', async () => {
    const { wrapper, editor, api, scope } = await component()
    bindQuestionOption(editor, 'q1', 'fast', paragraphTargets(editor.state.doc)[0]!.pos)
    await wrapper.find('.resource-choose').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    const source = structuredClone(data)
    source.options = [source.options[1]!, source.options[0]!]
    expect(scope().select({ ...source, options: [{ id: '', label: '错误' }] })).toBe(false)
    await nextTick()
    expect(wrapper.find('[role="alert"]').text()).toContain('选项 ID')
    expect(scope().select(source)).toBe(true)
    await nextTick()
    source.options[0]!.label = '不应污染快照'
    const saved = api.getJSON().content![0]!.attrs!
    expect((saved.options as { id: string; targetAnchorId?: string }[])[1]!.targetAnchorId).toBeTruthy()
    expect(JSON.stringify(saved)).not.toContain('不应污染')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    await wrapper.find('.resource-choose').trigger('click')
    expect(scope().select({ ...data, resourceId: 'another-resource' })).toBe(true)
    expect(JSON.stringify(api.getJSON().content![0]!.attrs!.options)).not.toContain('targetAnchorId')
    await wrapper.find('button[title="撤销"]').trigger('click'); await settle()
    expect(api.getJSON().content![0]!.attrs!.resourceId).toBe('sleep')
    expect(JSON.stringify(api.getJSON().content![0]!.attrs!.options)).toContain('targetAnchorId')
  })

  it('ignores a stale picker callback after cancel, readonly, node removal or external document replacement', async () => {
    const { wrapper, editor, api, scope } = await component()
    await wrapper.find('.resource-choose').trigger('click')
    const stale = scope()
    stale.cancel()
    expect(stale.select(data)).toBe(false)
    await nextTick()
    await wrapper.find('.resource-choose').trigger('click')
    const removed = scope()
    editor.commands.deleteRange({ from: 0, to: 1 })
    expect(removed.select(data)).toBe(false)
    api.setContent(article()); await settle()
    await wrapper.find('.resource-choose').trigger('click')
    const replaced = scope()
    const replacement = article(); replacement.content![1]!.content![0]!.text = '另一篇文章'
    api.setContent(replacement)
    expect(replaced.select(data)).toBe(false)
    await settle()
    await wrapper.find('.resource-choose').trigger('click')
    const readonlyScope = scope()
    await wrapper.setProps({ readonly: true })
    expect(readonlyScope.select(data)).toBe(false)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('binds/searches/clears via inspector, shows stale targets, and navigates only within the current instance', async () => {
    const first = await component(), second = await component()
    selectNode(first.editor, 0); await nextTick()
    const target = paragraphTargets(first.editor.state.doc)[0]!
    await first.wrapper.find('select[aria-label="5分钟以内的目标段落"]').setValue(String(target.pos))
    await settle()
    const anchor = paragraphTargets(first.editor.state.doc)[0]!.anchorId!
    expect(first.api.getJSON().content![0]!.attrs!.options).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'fast', targetAnchorId: anchor })]))
    const beforeNavigation = first.api.getJSON()
    const changes = first.wrapper.emitted('change')?.length
    await first.wrapper.find('.resource-option').trigger('click')
    expect(first.wrapper.find('.anchor-target-highlight').text()).toBe('目标段落')
    expect(second.wrapper.find('.anchor-target-highlight').exists()).toBe(false)
    expect(second.api.scrollToAnchor(anchor)).toBe(false)
    expect(first.api.getJSON()).toEqual(beforeNavigation)
    expect(first.wrapper.emitted('change')?.length).toBe(changes)
    await first.wrapper.find('input[type="search"]').setValue('另一目标')
    expect(first.wrapper.find('select[aria-label="30分钟以上的目标段落"]').findAll('option')).toHaveLength(2)
    first.editor.commands.deleteRange({ from: target.pos, to: target.pos + first.editor.state.doc.nodeAt(target.pos)!.nodeSize })
    selectNode(first.editor, 0); await nextTick()
    expect(first.wrapper.find('.resource-warning').text()).toContain('原目标已不存在')
    expect(first.api.scrollToAnchor(anchor)).toBe(false)
    await first.wrapper.findAll('.resource-binding button').find(item => item.text() === '清除绑定')!.trigger('click')
    expect(JSON.stringify(first.api.getJSON().content![0]!.attrs!.options)).not.toContain('targetAnchorId')
  })

  it('persists hide settings without hiding editor content, reloads JSON, and does not allow readonly mutations', async () => {
    const { wrapper, editor, api } = await component()
    selectNode(editor, 0); await nextTick()
    await wrapper.find('.resource-switch input').setValue(true)
    expect(api.getJSON().content![0]!.attrs!.hideFollowing).toBe(true)
    expect(wrapper.find('.article-editor').text()).toContain('目标段落')
    expect(wrapper.find('.resource-gate-note').text()).toContain('隐藏后续内容')
    expect(wrapper.find('.resource-gate-note').text()).toContain('此文字不会显示在最终渲染上，只在编辑器内提示')
    expect(JSON.stringify(api.getJSON())).not.toContain('此文字不会显示在最终渲染上')
    expect(editor.getHTML()).not.toContain('此文字不会显示在最终渲染上')
    const saved = api.getJSON()
    const readonly = await component({ modelValue: saved, readonly: true })
    expect(readonly.api.getJSON()).toEqual(saved)
    expect(readonly.wrapper.find('.article-editor').text()).toContain('目标段落')
    expect(readonly.wrapper.find('.resource-choose').exists()).toBe(false)
    const title = wrapper.find('.resource-settings input[readonly]')
    expect(title.attributes('readonly')).toBeDefined()
    const reveal = wrapper.findAll('.resource-settings .field-label input').at(-1)!
    await reveal.setValue('custom-key')
    expect(api.getJSON().content![0]!.attrs!.revealKey).toBe('custom-key')
    expect((reveal.element as HTMLInputElement).value).toBe('custom-key')
    await reveal.setValue('')
    expect(api.getJSON().content![0]!.attrs!.revealKey).toBe('custom-key')
    expect((reveal.element as HTMLInputElement).value).toBe('custom-key')
  })
})
