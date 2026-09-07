// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import ArticleEditor from './ArticleEditor.vue'
import type { ArticleEditorExpose, ArticleEditorProps, ImageUploadHandler, ImageUploadResult } from './editor/public-types'
import { createEmptyDocument } from './editor/document'
import { validateProtocolV1Document } from './editor/protocol'

const wrappers: ReturnType<typeof mount>[] = []
const tick = async () => { await new Promise((resolve) => setTimeout(resolve, 35)); await nextTick() }
const png = (name = 'photo.png') => new File(['sample-image'], name, { type: 'image/png' })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { resolve, reject, promise }
}
async function create(props: ArticleEditorProps = {}) {
  const wrapper = mount(ArticleEditor, { props, attachTo: document.body, global: { stubs: { DragHandle: true } } })
  wrappers.push(wrapper)
  await tick()
  const editor = (wrapper.find('.article-editor').element as HTMLElement & { editor: Editor }).editor
  return { wrapper, editor, api: wrapper.vm as unknown as ArticleEditorExpose }
}
async function choose(wrapper: ReturnType<typeof mount>, files: File[], replace = false) {
  const input = wrapper.find(`input[aria-label="${replace ? '上传并替换图片' : '上传图片'}文件"]`)
  Object.defineProperty(input.element, 'files', { configurable: true, value: files })
  await input.trigger('change')
  await tick()
}
beforeEach(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
})
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('Image upload component integration', () => {
  it('opens the native file input from the visible upload button', async () => {
    const { wrapper } = await create({ uploadImage: async () => '/uploaded.png' })
    const input = wrapper.find('input[aria-label="上传图片文件"]').element as HTMLInputElement
    const click = vi.spyOn(input, 'click').mockImplementation(() => {})
    await wrapper.find('.canvas-meta .image-file-picker button').trigger('click')
    expect(click).toHaveBeenCalledOnce()
    expect(input.multiple).toBe(true)
    expect(input.accept).toContain('image/png')
  })

  it('uploads chosen files in order, emits persistent protocol JSON and supports undo/redo', async () => {
    const upload = vi.fn<ImageUploadHandler>().mockImplementation(async (file) => ({ src: `/uploads/${file.name}`, width: 640, height: 480 }))
    const { wrapper, api } = await create({ uploadImage: upload })
    await choose(wrapper, [png('one.png'), png('two.png')])
    expect(upload).toHaveBeenCalledTimes(2)
    const images = api.getJSON().content!.filter((node) => node.type === 'image')
    expect(images.map((node) => node.attrs?.src)).toEqual(['/uploads/one.png', '/uploads/two.png'])
    expect(images[0]?.attrs).toMatchObject({ width: 640, height: 480, alt: 'one.png' })
    expect(validateProtocolV1Document(api.getJSON()).valid).toBe(true)
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual(api.getJSON())
    await wrapper.find('button[title="撤销"]').trigger('click')
    await tick()
    expect(api.getJSON().content!.filter((node) => node.type === 'image')).toHaveLength(1)
    await wrapper.find('button[title="重做"]').trigger('click')
    await tick()
    expect(api.getJSON().content!.filter((node) => node.type === 'image')).toHaveLength(2)
  })

  it('consumes an external file drop once and never inserts the dragged file name as text', async () => {
    const upload = vi.fn<ImageUploadHandler>().mockResolvedValue('/uploads/dropped.png')
    const { wrapper, editor, api } = await create({ uploadImage: upload })
    vi.spyOn(editor.view, 'posAtCoords').mockReturnValue({ pos: 1, inside: 0 })
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperties(event, {
      dataTransfer: { value: { files: [png()], types: ['Files', 'text/plain'], getData: () => 'photo.png' } },
      clientX: { value: 12 }, clientY: { value: 12 },
    })
    wrapper.find('.article-editor').element.dispatchEvent(event)
    await tick()
    expect(event.defaultPrevented).toBe(true)
    expect(upload).toHaveBeenCalledTimes(1)
    expect(api.getJSON().content?.[0]?.type).toBe('image')
    expect(editor.state.doc.textContent).toBe('')
  })

  it('leaves native/library drags alone when no files are present', async () => {
    const upload = vi.fn<ImageUploadHandler>()
    const { wrapper } = await create({ uploadImage: upload })
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: { files: [], types: ['text/plain'], getData: () => '' } })
    wrapper.find('.canvas-scroll').element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(upload).not.toHaveBeenCalled()
  })

  it('keeps a pending insertion anchored through edits and blocks save until finished', async () => {
    const result = deferred<string>()
    const { wrapper, editor, api } = await create({ uploadImage: () => result.promise })
    await choose(wrapper, [png()])
    expect(wrapper.find('.image-upload-status').text()).toContain('1')
    expect(wrapper.find('.top-actions .primary').attributes('disabled')).toBeDefined()
    expect(api.getJSON().content!.some((node) => node.type === 'image')).toBe(false)
    editor.view.dispatch(editor.state.tr.insertText('上传过程中继续输入', 1))
    const echo = api.getJSON()
    await wrapper.setProps({ modelValue: echo })
    result.resolve('/uploads/after-edit.png')
    await tick()
    expect(api.getJSON().content?.[0]?.content?.[0]?.text).toBe('上传过程中继续输入')
    expect(api.getJSON().content?.[1]?.attrs?.src).toBe('/uploads/after-edit.png')
    expect(wrapper.find('.image-upload-status').exists()).toBe(false)
    expect(wrapper.find('.top-actions .primary').attributes('disabled')).toBeUndefined()
  })

  it('replaces only the selected image and resets old dimensions unless the server supplies new ones', async () => {
    const result = deferred<ImageUploadResult>()
    const { wrapper, editor, api } = await create({
      uploadImage: () => result.promise,
      modelValue: { type: 'doc', content: [{ type: 'image', attrs: { src: '/old.png', width: 200, height: 675, imageAlign: 'right' } }, { type: 'paragraph' }] },
    })
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)))
    await tick()
    await choose(wrapper, [png()], true)
    expect(api.getJSON().content?.[0]?.attrs?.src).toBe('/old.png')
    result.resolve({ src: '/new.png', width: 800, height: 600 })
    await tick()
    expect(api.getJSON().content?.[0]?.attrs).toMatchObject({ src: '/new.png', width: 800, height: 600, imageAlign: 'right' })
    expect(api.getJSON().content!.filter((node) => node.type === 'image')).toHaveLength(1)
  })

  it('rejects non-images/oversized files before upload and preserves content on upload failures', async () => {
    const upload = vi.fn<ImageUploadHandler>().mockRejectedValue(new Error('服务器暂时不可用'))
    const { wrapper, api } = await create({ uploadImage: upload, maxImageSize: 20 })
    await choose(wrapper, [new File(['no'], 'text.txt', { type: 'text/plain' }), new File(['x'.repeat(21)], 'large.png', { type: 'image/png' })])
    expect(upload).not.toHaveBeenCalled()
    expect(wrapper.emitted('error')).toHaveLength(2)
    const before = api.getJSON()
    await choose(wrapper, [png()])
    expect(wrapper.emitted('error')?.at(-1)?.[0]).toMatchObject({ source: 'upload', message: '服务器暂时不可用', fileName: 'photo.png' })
    expect(api.getJSON()).toEqual(before)
    expect(wrapper.find('.image-upload-status').exists()).toBe(false)
  })

  it('clears old dimensions for a URL-only replacement and can undo to the original image', async () => {
    const { wrapper, editor, api } = await create({
      uploadImage: async () => '/new-ratio.png',
      modelValue: { type: 'doc', content: [{ type: 'image', attrs: { src: '/old.png', width: 200, height: 675, title: 'old title', imageAlign: 'left' } }, { type: 'paragraph' }] },
    })
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)))
    await tick()
    const original = api.getJSON()
    await choose(wrapper, [png()], true)
    expect(api.getJSON().content?.[0]?.attrs).toEqual({ src: '/new-ratio.png', alt: 'photo.png', imageAlign: 'left' })
    await wrapper.find('button[title="撤销"]').trigger('click')
    await tick()
    expect(api.getJSON()).toEqual(original)
  })

  it('continues the batch after an individual upload fails', async () => {
    const upload = vi.fn<ImageUploadHandler>()
      .mockRejectedValueOnce(new Error('第一张上传失败'))
      .mockResolvedValueOnce('/second.png')
    const { wrapper, api } = await create({ uploadImage: upload })
    await choose(wrapper, [png('first.png'), png('second.png')])
    expect(upload).toHaveBeenCalledTimes(2)
    expect(api.getJSON().content!.filter(node => node.type === 'image').map(node => node.attrs?.src)).toEqual(['/second.png'])
    expect(wrapper.emitted('error')?.[0]?.[0]).toMatchObject({ source: 'upload', fileName: 'first.png' })
    expect(wrapper.find('.image-upload-status').exists()).toBe(false)
  })

  it.each(['', 'blob:https://example.com/temp', 'javascript:alert(1)', { src: '/ok.png', width: -1 }])('rejects invalid upload result %j', async (result) => {
    const { wrapper, api } = await create({ uploadImage: async () => result })
    await choose(wrapper, [png()])
    expect(api.getJSON().content!.some((node) => node.type === 'image')).toBe(false)
    expect(wrapper.emitted('error')?.at(-1)?.[0]).toMatchObject({ source: 'upload' })
  })

  it.each(['replace', 'readonly', 'unmount'] as const)('cancels stale upload on %s even if the host ignores AbortSignal', async (action) => {
    const result = deferred<string>()
    let signal!: AbortSignal
    const { wrapper, api } = await create({ uploadImage: (_file, context) => { signal = context.signal; return result.promise } })
    await choose(wrapper, [png()])
    if (action === 'replace') api.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '另一篇文章' }] }] })
    if (action === 'readonly') await wrapper.setProps({ readonly: true })
    if (action === 'unmount') { wrapper.unmount(); wrappers.splice(wrappers.indexOf(wrapper), 1) }
    expect(signal.aborted).toBe(true)
    result.resolve('/stale.png')
    await tick()
    if (action !== 'unmount') expect(api.getJSON().content!.some((node) => node.type === 'image')).toBe(false)
  })

  it('ignores upload completion when the original replacement target is removed', async () => {
    const result = deferred<string>()
    let signal!: AbortSignal
    const { wrapper, editor, api } = await create({
      uploadImage: (_file, context) => { signal = context.signal; return result.promise },
      modelValue: { type: 'doc', content: [{ type: 'image', attrs: { src: '/old.png' } }, { type: 'paragraph' }] },
    })
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)))
    await tick()
    await choose(wrapper, [png()], true)
    editor.view.dispatch(editor.state.tr.delete(0, 1))
    expect(signal.aborted).toBe(true)
    result.resolve('/stale.png')
    await tick()
    expect(api.getJSON().content!.some((node) => node.type === 'image')).toBe(false)
  })

  it('does not upload without configuration or in readonly mode', async () => {
    const first = await create()
    expect(first.wrapper.find('input[type="file"]').attributes('disabled')).toBeDefined()
    const upload = vi.fn<ImageUploadHandler>()
    const second = await create({ uploadImage: upload, readonly: true, modelValue: createEmptyDocument() })
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: { files: [png()], types: ['Files'] } })
    second.wrapper.find('.canvas-scroll').element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(upload).not.toHaveBeenCalled()
  })
})
