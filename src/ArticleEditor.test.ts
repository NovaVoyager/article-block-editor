// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ArticleEditor from './ArticleEditor.vue'
import type { ArticleEditorExpose, ArticleEditorProps } from './editor/public-types'
import type { ProseMirrorJSON } from './editor/types'
import { createEmptyDocument } from './editor/document'
import { getSchema } from '@tiptap/core'
import { DOMParser, DOMSerializer } from '@tiptap/pm/model'
import { createProtocolExtensions } from './editor/extensions'
import { validateProtocolV1Document } from './editor/protocol'

const documentWith = (text: string): ProseMirrorJSON => ({
  type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})
const wrappers: ReturnType<typeof mount>[] = []
beforeEach(() => {
  // jsdom has no layout engine; ProseMirror queries ranges when restoring focus.
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
})
const settle = async () => { await new Promise((resolve) => setTimeout(resolve, 30)); await nextTick() }
async function create(props: ArticleEditorProps = {}) {
  const wrapper = mount(ArticleEditor, { props, attachTo: document.body, global: { stubs: { DragHandle: true } } })
  wrappers.push(wrapper)
  await settle()
  return { wrapper, api: wrapper.vm as unknown as ArticleEditorExpose }
}
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('ArticleEditor public component contract', () => {
  it('starts empty, exposes a ready API, and never reads or writes host storage', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem')
    const set = vi.spyOn(Storage.prototype, 'setItem')
    const { wrapper, api } = await create()
    expect(api.getJSON()).toEqual(expect.objectContaining({ type: 'doc' }))
    expect(wrapper.find('.article-editor').text()).toBe('')
    expect(wrapper.emitted('ready')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await wrapper.find('button.action-button.primary').trigger('click')
    expect(wrapper.emitted('save')?.[0]?.[0]).toEqual(api.getJSON())
    expect(get).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })

  it('loads parent JSON, reacts to asynchronous replacements, and rejects invalid data without losing content', async () => {
    const input = documentWith('初始内容')
    const before = JSON.stringify(input)
    const { wrapper, api } = await create({ modelValue: input })
    expect(wrapper.find('.article-editor').text()).toBe('初始内容')
    expect(JSON.stringify(input)).toBe(before)
    await wrapper.setProps({ modelValue: documentWith('接口返回的新文档') })
    expect(wrapper.find('.article-editor').text()).toBe('接口返回的新文档')
    const current = api.getJSON()
    await wrapper.setProps({ modelValue: { type: 'unknown' } })
    expect(api.getJSON()).toEqual(current)
    expect(wrapper.emitted('error')?.at(-1)?.[0]).toMatchObject({ source: 'modelValue' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(api.validate().valid).toBe(true)
  })

  it('emits edits, accepts v-model echoes without resetting undo, and clears history on a different article', async () => {
    const { wrapper, api } = await create({ modelValue: documentWith('文章 A') })
    const insert = wrapper.findAll('.module-card').find(button => button.find('strong').text() === '引用')!
    await insert.trigger('click')
    await settle()
    const change = wrapper.emitted('update:modelValue')?.at(-1)?.[0] as ProseMirrorJSON
    expect(JSON.stringify(change)).toContain('输入引用内容')
    expect(wrapper.emitted('change')?.at(-1)?.[0]).toEqual(change)
    await wrapper.setProps({ modelValue: JSON.parse(JSON.stringify(change)) })
    expect(wrapper.find('button[title="撤销"]').attributes('disabled')).toBeUndefined()
    await wrapper.find('button[title="撤销"]').trigger('click')
    await settle()
    expect(wrapper.find('.article-editor').text()).toBe('文章 A')
    await insert.trigger('click')
    await wrapper.setProps({ modelValue: documentWith('文章 B') })
    expect(api.getJSON().content?.[0]?.content?.[0]?.text).toBe('文章 B')
    expect(wrapper.find('button[title="撤销"]').attributes('disabled')).toBeDefined()
  })

  it('returns detached snapshots and supports imperative content replacement and clearing', async () => {
    const { wrapper, api } = await create()
    expect(api.setContent(documentWith('通过 ref 写入'))).toBe(true)
    const copy = api.getJSON()
    copy.content = []
    expect(api.getJSON().content?.length).toBeGreaterThan(0)
    expect(wrapper.emitted('change')).toHaveLength(1)
    expect(api.setContent({ type: 'bad' })).toBe(false)
    expect(wrapper.emitted('error')?.at(-1)?.[0]).toMatchObject({ source: 'setContent' })
    expect(api.clear()).toBe(true)
    expect(api.getJSON()).toMatchObject(createEmptyDocument())
  })

  it('enforces readonly in the canvas, save button and JSON drawer, then can become editable', async () => {
    const { wrapper, api } = await create({ modelValue: documentWith('只读文章'), readonly: true })
    expect(wrapper.find('.article-editor').attributes('contenteditable')).toBe('false')
    expect(wrapper.find('button.action-button.primary').attributes('disabled')).toBeDefined()
    await wrapper.findAll('.action-button').find((button) => button.text().includes('JSON'))!.trigger('click')
    expect(wrapper.find('textarea').attributes('readonly')).toBeDefined()
    expect(wrapper.find('.drawer-footer .primary').attributes('disabled')).toBeDefined()
    expect(api.setContent(documentWith('宿主仍可加载只读内容'))).toBe(true)
    await wrapper.setProps({ readonly: false })
    expect(wrapper.find('.article-editor').attributes('contenteditable')).toBe('true')
    expect(wrapper.find('textarea').attributes('readonly')).toBeUndefined()
  })

  it('keeps two editors independent and destroys an unmounted editor', async () => {
    const first = await create({ modelValue: documentWith('第一实例') })
    const second = await create({ modelValue: documentWith('第二实例') })
    first.api.setContent(documentWith('仅改变第一实例'))
    expect(second.wrapper.find('.article-editor').text()).toBe('第二实例')
    first.wrapper.unmount()
    wrappers.splice(wrappers.indexOf(first.wrapper), 1)
    expect(second.api.setContent(documentWith('仍可编辑'))).toBe(true)
    expect(second.api.validate().valid).toBe(true)
    expect(document.querySelectorAll('.article-editor')).toHaveLength(1)
  })

  it('supports embedding height and optional panels', async () => {
    const { wrapper } = await create({ height: 520, showLibrary: false, showInspector: false, showToolbar: false })
    expect(wrapper.attributes('style')).toContain('height: 520px')
    expect(wrapper.find('.library-panel').exists()).toBe(false)
    expect(wrapper.find('.inspector-panel').exists()).toBe(false)
    expect(wrapper.find('.topbar').exists()).toBe(false)
  })

  it('groups basic modules separately from the extension article button', async () => {
    const { wrapper } = await create()
    expect(wrapper.findAll('.module-group-toggle').map(toggle => toggle.text())).toEqual(['基础内容', '扩展'])
    expect(wrapper.findAll('[data-module-group="basic"] .module-card strong').map(label => label.text())).toEqual(['图片', '引用', '代码块', '表格'])
    expect(wrapper.findAll('[data-module-group="extension"] .module-card strong').map(label => label.text())).toEqual(['文章按钮', '资源问题'])
    expect(wrapper.findAll('.module-card')).toHaveLength(6)
    expect(wrapper.findAll('select[aria-label="块类型"] option').map(option => option.text())).toEqual(['正文', '标题 1', '标题 2', '标题 3', '标题 4', '标题 5', '标题 6'])
    for (const title of ['有序列表', '无序列表', '分割线']) {
      expect(wrapper.find(`.format-bar button[title="${title}"]`).exists()).toBe(true)
    }
  })

  it('collapses each group independently without changing content or other instances', async () => {
    const first = await create({ modelValue: documentWith('保留文章') })
    const second = await create()
    const toggle = first.wrapper.find('.module-group-toggle')
    const grid = first.wrapper.find('.module-grid')
    const extension = first.wrapper.find('[data-module-group="extension"]')
    const extensionToggle = extension.find('.module-group-toggle')
    const extensionGrid = extension.find('.module-grid')
    const before = first.api.getJSON()
    const grids = first.wrapper.findAll('.module-grid')
    expect(new Set(grids.map(item => item.attributes('id'))).size).toBe(2)
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.attributes('aria-controls')).toBe(grid.attributes('id'))
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(grid.isVisible()).toBe(false)
    expect(extensionGrid.isVisible()).toBe(true)
    expect(extensionToggle.attributes('aria-controls')).toBe(extensionGrid.attributes('id'))
    await extensionToggle.trigger('click')
    expect(extensionToggle.attributes('aria-expanded')).toBe('false')
    expect(extensionGrid.isVisible()).toBe(false)
    expect(second.wrapper.find('[data-module-group="extension"] .module-grid').isVisible()).toBe(true)
    expect(second.wrapper.find('.module-grid').isVisible()).toBe(true)
    expect(first.api.getJSON()).toEqual(before)
    expect(first.wrapper.emitted('change')).toBeUndefined()
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(grid.isVisible()).toBe(true)
    expect(extensionGrid.isVisible()).toBe(false)
    await extensionToggle.trigger('click')
    expect(extensionGrid.isVisible()).toBe(true)
    await first.wrapper.findAll('.module-card').find(button => button.find('strong').text() === '引用')!.trigger('click')
    expect(JSON.stringify(first.api.getJSON())).toContain('输入引用内容')
  })

  it('preserves article button insertion, dragging and undo from the extension group', async () => {
    const { wrapper, api } = await create({ modelValue: documentWith('保留正文') })
    const before = api.getJSON()
    const button = wrapper.find('[data-module-group="extension"] .module-card')
    const dataTransfer = { effectAllowed: '', setData: vi.fn() }
    await button.trigger('dragstart', { dataTransfer })
    expect(dataTransfer.effectAllowed).toBe('copy')
    expect(dataTransfer.setData).toHaveBeenCalledOnce()
    const [mime, payload] = dataTransfer.setData.mock.calls[0]!
    expect(mime).toBe('application/x-article-node')
    expect(JSON.parse(payload)).toMatchObject({ type: 'articleButton', attrs: { text: '了解更多', style: 'button' } })
    expect(validateProtocolV1Document({ type: 'doc', content: [JSON.parse(payload)] }).valid).toBe(true)
    expect(api.getJSON()).toEqual(before)
    await button.trigger('click')
    await settle()
    expect(api.getJSON().content?.filter(node => node.type === 'articleButton')).toHaveLength(1)
    expect(validateProtocolV1Document(api.getJSON()).valid).toBe(true)
    expect(JSON.stringify(api.getJSON())).not.toContain('"group"')
    expect(wrapper.find('.article-button-node').text()).toContain('了解更多')
    await wrapper.find('button[title="撤销"]').trigger('click')
    await settle()
    expect(api.getJSON()).toEqual(before)
  })

  it('inserts a protocol-compatible divider from the toolbar with undo and redo', async () => {
    const { wrapper, api } = await create({ modelValue: documentWith('分割线后的内容') })
    const before = api.getJSON()
    const button = wrapper.find('.format-bar button[title="分割线"]')
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    await settle()
    expect(api.getJSON().content?.filter(node => node.type === 'horizontalRule')).toEqual([{ type: 'horizontalRule' }])
    expect(wrapper.find('.article-editor').text()).toBe('分割线后的内容')
    expect(validateProtocolV1Document(api.getJSON()).valid).toBe(true)
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual(api.getJSON())
    await wrapper.find('button[title="撤销"]').trigger('click')
    await settle()
    expect(api.getJSON()).toEqual(before)
    await wrapper.find('button[title="重做"]').trigger('click')
    await settle()
    expect(wrapper.findAll('.article-editor hr')).toHaveLength(1)
    await wrapper.find('button.action-button.primary').trigger('click')
    expect(wrapper.emitted('save')?.at(-1)?.[0]).toEqual(api.getJSON())
  })

  it('disables divider insertion in readonly and preview modes but keeps the library collapsible', async () => {
    const { wrapper, api } = await create({ readonly: true, modelValue: documentWith('只读正文') })
    const before = api.getJSON()
    const divider = wrapper.find('.format-bar button[title="分割线"]')
    expect(divider.attributes('disabled')).toBeDefined()
    await divider.trigger('click')
    expect(api.getJSON()).toEqual(before)
    await wrapper.find('.module-group-toggle').trigger('click')
    expect(wrapper.find('.module-grid').isVisible()).toBe(false)
    await wrapper.setProps({ readonly: false })
    expect(divider.attributes('disabled')).toBeUndefined()
    await wrapper.findAll('.top-actions .action-button').find(button => button.text() === '预览')!.trigger('click')
    expect(divider.attributes('disabled')).toBeDefined()
    await divider.trigger('click')
    expect(api.getJSON()).toEqual(before)
  })

  it('preserves protocol colors through component import and export', async () => {
    const value = documentWith('彩色内容')
    value.content![0]!.content![0]!.marks = [
      { type: 'textStyle', attrs: { color: '#dc2626' } },
      { type: 'highlight', attrs: { color: '#fef08a' } },
    ]
    const { wrapper, api } = await create({ modelValue: value })
    expect(api.getJSON().content?.[0]?.content?.[0]?.marks).toEqual(value.content![0]!.content![0]!.marks)
    expect(wrapper.find('mark').attributes('data-color')).toBe('#fef08a')
  })

  it('edits paragraph font size, supports undo/redo, persists on save, and can restore the default', async () => {
    const { wrapper, api } = await create({ modelValue: documentWith('整段正文') })
    const select = wrapper.find('select[aria-label="正文字体大小"]')
    expect(select.exists()).toBe(true)
    expect(wrapper.find('input[aria-label="正文字体大小"]').exists()).toBe(false)
    await select.setValue('24')
    expect(wrapper.find('.article-editor p').attributes('style')).toContain('font-size: 24px')
    expect(api.getJSON().content?.[0]?.attrs?.fontSize).toBe(24)
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual(api.getJSON())
    await wrapper.find('button[title="撤销"]').trigger('click')
    await settle()
    expect(api.getJSON().content?.[0]?.attrs?.fontSize).toBeUndefined()
    await wrapper.find('button[title="重做"]').trigger('click')
    await settle()
    expect(api.getJSON().content?.[0]?.attrs?.fontSize).toBe(24)
    await wrapper.find('button.action-button.primary').trigger('click')
    const saved = wrapper.emitted('save')?.at(-1)?.[0] as ProseMirrorJSON
    const loaded = await create({ modelValue: JSON.parse(JSON.stringify(saved)) })
    expect(loaded.wrapper.find('.article-editor p').attributes('style')).toContain('font-size: 24px')
    await wrapper.find('.font-size-reset').trigger('click')
    expect(api.getJSON().content?.[0]?.attrs?.fontSize).toBeUndefined()
    expect(wrapper.find('.article-editor p').attributes('style') ?? '').not.toContain('font-size')
    expect(validateProtocolV1Document(api.getJSON()).valid).toBe(true)
  })

  it('offers preset sizes, retains an existing non-preset size, and supports the default option', async () => {
    const value = documentWith('保留正文')
    value.content![0]!.attrs = { fontSize: 21 }
    const { wrapper, api } = await create({ modelValue: value })
    const select = wrapper.find('select[aria-label="正文字体大小"]')
    const options = select.findAll('option').map((option) => option.attributes('value'))
    expect(options).toEqual(expect.arrayContaining(['', '8', '16', '21', '24', '96']))
    expect(options).not.toContain('999')
    expect((select.element as HTMLSelectElement).value).toBe('21')
    expect(api.getJSON().content?.[0]?.attrs?.fontSize).toBe(21)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await select.setValue('20')
    expect(api.getJSON().content?.[0]?.attrs?.fontSize).toBe(20)
    await select.setValue('')
    expect(api.getJSON().content?.[0]?.attrs?.fontSize).toBeUndefined()
    expect((select.element as HTMLSelectElement).value).toBe('')
    expect(wrapper.find('.article-editor').text()).toBe('保留正文')
  })

  it('parses and serializes paragraph px sizes without applying them to headings or accepting CSS expressions', () => {
    const schema = getSchema(createProtocolExtensions())
    const element = document.createElement('div')
    element.innerHTML = '<p style="font-size: 28px; text-align: center">段落</p><h2 style="font-size: 28px">标题</h2><p style="font-size: 200px">无效字号</p><p style="font-size: 2em">相对字号</p>'
    const node = DOMParser.fromSchema(schema).parse(element)
    expect(node.child(0).attrs.fontSize).toBe(28)
    expect(node.child(0).attrs.textAlign).toBe('center')
    expect(node.child(1).attrs.fontSize).toBeUndefined()
    expect(node.child(2).attrs.fontSize).toBeNull()
    expect(node.child(3).attrs.fontSize).toBeNull()
    const serialized = DOMSerializer.fromSchema(schema).serializeNode(node.child(0)) as HTMLElement
    expect(serialized.style.fontSize).toBe('28px')
    expect(serialized.style.textAlign).toBe('center')
  })
})
