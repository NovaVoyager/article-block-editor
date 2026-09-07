// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from './App.vue'
import ArticleEditor from './ArticleEditor.vue'
import type { ArticleEditorExpose, ProseMirrorJSON } from './index'

const wrappers: ReturnType<typeof mount>[] = []
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 35)); await nextTick() }
const doc = (text: string): ProseMirrorJSON => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
async function create() {
  const wrapper = mount(App, { attachTo: document.body, global: { stubs: { DragHandle: true } } })
  wrappers.push(wrapper)
  await settle()
  await wrapper.find('.playground-json-toggle').trigger('click')
  const api = wrapper.findComponent(ArticleEditor).vm as unknown as ArticleEditorExpose
  return { wrapper, api }
}
async function render(wrapper: ReturnType<typeof mount>, text: string) {
  await wrapper.find('#demo-json-source').setValue(text)
  await wrapper.find('.playground-json form').trigger('submit')
  await settle()
}
beforeEach(() => {
  localStorage.clear()
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('Demo JSON string rendering entry', () => {
  it.each([false, true])('renders valid JSON (escaped string: %s) without writing a draft', async escaped => {
    const { wrapper, api } = await create()
    const save = vi.spyOn(Storage.prototype, 'setItem')
    const text = JSON.stringify(doc('来自 JSON 字符串的文章'))
    await render(wrapper, escaped ? JSON.stringify(text) : text)
    expect(wrapper.find('.article-editor').text()).toBe('来自 JSON 字符串的文章')
    expect(api.getJSON()).toEqual(doc('来自 JSON 字符串的文章'))
    expect(wrapper.find('.playground-json-success').text()).toContain('未写入本地草稿')
    expect(wrapper.find('.playground-json-errors').exists()).toBe(false)
    expect(save).not.toHaveBeenCalled()
    await wrapper.find('.playground-json-toggle').trigger('click')
    expect(wrapper.find('#demo-json-input').isVisible()).toBe(false)
    await wrapper.find('.playground-json-toggle').trigger('click')
    expect((wrapper.find('#demo-json-source').element as HTMLTextAreaElement).value).toBe(escaped ? JSON.stringify(text) : text)
  })

  it.each(['', '{broken', 'null', '[]', '{"type":"unknown"}', '{"type":"doc","content":[{"type":"table","content":[]}]}'])('rejects invalid input without replacing the document: %s', async text => {
    const { wrapper, api } = await create()
    const before = api.getJSON()
    await render(wrapper, text)
    expect(api.getJSON()).toEqual(before)
    expect(wrapper.find('.playground-json-errors[role="alert"]').exists()).toBe(true)
    expect(wrapper.find('#demo-json-source').attributes('aria-invalid')).toBe('true')
    expect((wrapper.find('#demo-json-source').element as HTMLTextAreaElement).value).toBe(text)
    await render(wrapper, JSON.stringify(doc('修正后可以渲染')))
    expect(wrapper.find('.playground-json-errors').exists()).toBe(false)
    expect(api.getJSON()).toEqual(doc('修正后可以渲染'))
  })

  it('fills current/sample JSON without applying it until explicitly submitted', async () => {
    const { wrapper, api } = await create()
    await render(wrapper, JSON.stringify(doc('当前自定义文档')))
    await wrapper.findAll('.playground-json-actions button').find(button => button.text() === '填入示例')!.trigger('click')
    expect((wrapper.find('#demo-json-source').element as HTMLTextAreaElement).value).toContain('把复杂内容')
    expect(api.getJSON()).toEqual(doc('当前自定义文档'))
    await wrapper.findAll('.playground-json-actions button').find(button => button.text() === '填入当前文档')!.trigger('click')
    expect(JSON.parse((wrapper.find('#demo-json-source').element as HTMLTextAreaElement).value)).toEqual(api.getJSON())
  })

  it('loads in readonly mode, supports layout extensions and leaves the second instance unchanged', async () => {
    const { wrapper } = await create()
    for (const name of ['只读', '第二个实例']) {
      await wrapper.findAll('.playground-controls label').find(label => label.text() === name)!.find('input').setValue(true)
    }
    await settle()
    const value: ProseMirrorJSON = { type: 'doc', content: [
      { type: 'image', attrs: { src: '/left.png', imageLayout: 'two-column' } },
      { type: 'image', attrs: { src: '/right.png', imageLayout: 'two-column' } },
    ] }
    await render(wrapper, JSON.stringify(value))
    const editors = wrapper.findAllComponents(ArticleEditor)
    expect(new Set(wrapper.findAll('.module-grid').map(grid => grid.attributes('id'))).size).toBe(4)
    expect(editors[0]!.findAll('.media-node[data-image-layout="two-column"]')).toHaveLength(2)
    expect(editors[0]!.find('.article-editor').attributes('contenteditable')).toBe('false')
    expect(editors[1]!.find('.article-editor').text()).toBe('')
    expect(editors[1]!.findAll('.media-node')).toHaveLength(0)
  })

  it('preserves JSON input while unmounted and renders after remounting', async () => {
    const { wrapper } = await create()
    const text = JSON.stringify(doc('重新挂载后渲染'))
    await wrapper.find('#demo-json-source').setValue(text)
    await wrapper.findAll('.playground-controls button').find(button => button.text() === '卸载编辑器')!.trigger('click')
    expect(wrapper.find('.playground-json-render').attributes('disabled')).toBeDefined()
    await wrapper.find('.playground-json form').trigger('submit')
    expect(wrapper.find('.playground-json-errors').text()).toContain('挂载编辑器')
    await wrapper.findAll('.playground-controls button').find(button => button.text() === '挂载编辑器')!.trigger('click')
    await settle()
    expect(wrapper.find('.playground-json-render').attributes('disabled')).toBeUndefined()
    await render(wrapper, text)
    expect(wrapper.find('.article-editor').text()).toBe('重新挂载后渲染')
  })
})
