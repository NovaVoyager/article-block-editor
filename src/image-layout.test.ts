// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { getSchema, type Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { DOMParser, DOMSerializer } from '@tiptap/pm/model'
import ArticleEditor from './ArticleEditor.vue'
import { createProtocolExtensions } from './editor/extensions'
import type { ArticleEditorExpose, ArticleEditorProps } from './editor/public-types'
import type { ProseMirrorJSON } from './editor/types'
import { toProtocolJSON, validateProtocolDocument, validateProtocolV1Document } from './editor/protocol'

const picture = (name: string, imageLayout?: string): ProseMirrorJSON => ({
  type: 'image', attrs: { src: `/${name}.png`, alt: name, title: `${name} title`, width: 1200, height: 675, imageAlign: 'center', ...(imageLayout && { imageLayout }) },
})
const imagesDocument = (): ProseMirrorJSON => ({ type: 'doc', content: [picture('left'), picture('right')] })
const wrappers: ReturnType<typeof mount>[] = []
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 30)); await nextTick() }
async function create(props: ArticleEditorProps = { modelValue: imagesDocument() }) {
  const wrapper = mount(ArticleEditor, { props, attachTo: document.body, global: { stubs: { DragHandle: true } } })
  wrappers.push(wrapper)
  await settle()
  const editor = (wrapper.find('.article-editor').element as HTMLElement & { editor: Editor }).editor
  return { wrapper, editor, api: wrapper.vm as unknown as ArticleEditorExpose }
}
async function selectImage(editor: Editor, pos = 0) {
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)))
  await settle()
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

describe('Responsive image dimensions', () => {
  it.each(['edit', 'readonly', 'preview'])('scales large single images without changing JSON dimensions in %s mode', async mode => {
    const modelValue: ProseMirrorJSON = { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: '中文正文中的大图应完整显示。' }] },
      { type: 'image', attrs: { src: '/wide.png', width: 2848, height: 1600, imageAlign: 'center' } },
      { type: 'image', attrs: { src: '/standard.png', width: 2304, height: 1728, imageAlign: 'right' } },
    ] }
    const { wrapper, api } = await create({ modelValue, readonly: mode === 'readonly' })
    if (mode === 'preview') {
      await wrapper.findAll('.top-actions .action-button').find(button => button.text() === '预览')!.trigger('click')
    }
    for (const [index, dimensions] of [[2848, 1600], [2304, 1728]].entries()) {
      const style = (wrapper.findAll('.media-node img')[index]!.element as HTMLImageElement).style
      expect(style.width).toBe(`${dimensions[0]}px`)
      expect(style.height).toBe('auto')
      expect(style.aspectRatio).toBe(`${dimensions[0]} / ${dimensions[1]}`)
    }
    expect(api.getJSON().content?.filter(node => node.type === 'image')).toEqual(modelValue.content!.slice(1))
    expect(wrapper.find('.article-editor').attributes('contenteditable')).toBe(mode === 'edit' ? 'true' : 'false')
  })

  it.each([
    { attrs: { width: 240 }, width: '240px', height: '' },
    { attrs: { height: 160 }, width: '', height: '160px' },
    { attrs: {}, width: '', height: '' },
  ])('preserves explicit dimensions and uses the intrinsic ratio if one dimension is missing: $attrs', async ({ attrs, width, height }) => {
    const { wrapper } = await create({ modelValue: { type: 'doc', content: [{ type: 'image', attrs: { src: '/image.png', ...attrs } }] } })
    const style = (wrapper.find('.media-node img').element as HTMLImageElement).style
    expect(style.width).toBe(width)
    expect(style.height).toBe(height)
    expect(style.aspectRatio).toBe('')
  })

  it('reacts to changed dimensions and clears the ratio when a dimension is removed', async () => {
    const { wrapper, editor, api } = await create()
    await selectImage(editor)
    editor.commands.updateAttributes('image', { width: 200, height: 100 })
    await settle()
    const img = wrapper.find('.media-node img').element as HTMLImageElement
    expect(img.style.aspectRatio).toBe('200 / 100')
    expect(img.style.height).toBe('auto')
    expect(api.getJSON().content?.[0]?.attrs).toMatchObject({ width: 200, height: 100 })
    editor.commands.updateAttributes('image', { height: null })
    await settle()
    expect(img.style.width).toBe('200px')
    expect(img.style.height).toBe('')
    expect(img.style.aspectRatio).toBe('')
    editor.commands.undo()
    await settle()
    expect(img.style.height).toBe('auto')
    expect(img.style.aspectRatio).not.toBe('')
  })

})

describe('Two-column image layout', () => {
  it('keeps old image documents unchanged and validates the optional layout extension separately', () => {
    const old = imagesDocument()
    expect(toProtocolJSON(old)).toEqual(old)
    expect(validateProtocolV1Document(old).valid).toBe(true)
    const paired = { type: 'doc', content: [picture('left', 'two-column'), picture('right', 'two-column')] }
    expect(validateProtocolDocument(paired).valid).toBe(true)
    expect(validateProtocolV1Document(paired).valid).toBe(false)
    expect(toProtocolJSON(paired)).toEqual(paired)
    for (const value of ['three-column', 'single', 'url(evil)', 2, null]) {
      const invalid = imagesDocument()
      invalid.content![0]!.attrs!.imageLayout = value
      expect(validateProtocolDocument(invalid).valid).toBe(false)
    }
  })

  it('pairs adjacent images in one transaction with attributes, undo/redo and save/reload intact', async () => {
    const { wrapper, editor, api } = await create()
    await selectImage(editor)
    const original = api.getJSON()
    const changeCount = wrapper.emitted('change')?.length ?? 0
    expect(wrapper.find('.pair-images-button').attributes('disabled')).toBeUndefined()
    await wrapper.find('.pair-images-button').trigger('click')
    await settle()
    expect(wrapper.findAll('.media-node[data-image-layout="two-column"]')).toHaveLength(2)
    expect(api.getJSON().content).toEqual(original.content!.map(node => node.type === 'image'
      ? { ...node, attrs: { ...node.attrs, imageLayout: 'two-column' } }
      : node))
    expect(wrapper.emitted('change')).toHaveLength(changeCount + 1)
    await wrapper.find('button[title="撤销"]').trigger('click')
    await settle()
    expect(api.getJSON()).toEqual(original)
    await wrapper.find('button[title="重做"]').trigger('click')
    await settle()
    expect(wrapper.findAll('.media-node[data-image-layout="two-column"]')).toHaveLength(2)
    await wrapper.find('button.action-button.primary').trigger('click')
    const saved = wrapper.emitted('save')?.at(-1)?.[0] as ProseMirrorJSON
    const reloaded = await create({ modelValue: saved })
    expect(reloaded.api.getJSON()).toEqual(saved)
    expect(reloaded.wrapper.findAll('.media-node[data-image-layout="two-column"]')).toHaveLength(2)
    expect(wrapper.find('.media-node img').attributes('style')).toContain('aspect-ratio: 1200 / 675')
    expect(wrapper.find('.media-node img').attributes('style')).toContain('height: auto')
  })

  it('sets and clears the selected image layout independently without extra attributes in single mode', async () => {
    const { wrapper, editor, api } = await create()
    await selectImage(editor)
    const layout = wrapper.find('select[aria-label="图片排版"]')
    await layout.setValue('two-column')
    expect(api.getJSON().content?.[0]?.attrs?.imageLayout).toBe('two-column')
    expect(api.getJSON().content?.[1]?.attrs?.imageLayout).toBeUndefined()
    await layout.setValue('')
    expect(api.getJSON().content?.[0]?.attrs?.imageLayout).toBeUndefined()
    expect(wrapper.find('.media-node').attributes('data-image-layout')).toBeUndefined()
    expect(validateProtocolV1Document(api.getJSON()).valid).toBe(true)
  })

  it('does not pair across body text or table cell boundaries', async () => {
    const { wrapper, editor } = await create({ modelValue: { type: 'doc', content: [picture('left'), { type: 'paragraph' }, picture('right')] } })
    await selectImage(editor)
    expect(wrapper.find('.pair-images-button').attributes('disabled')).toBeDefined()
    const nested = await create({ modelValue: { type: 'doc', content: [{ type: 'table', content: [{ type: 'tableRow', content: [
      { type: 'tableCell', content: [picture('first-cell')] }, { type: 'tableCell', content: [picture('second-cell')] },
    ] }] }] } })
    await selectImage(nested.editor, 3)
    expect(nested.wrapper.find('.pair-images-button').attributes('disabled')).toBeDefined()
  })

  it('keeps the two-column layout when its image is uploaded/replaced', async () => {
    const uploadImage = vi.fn().mockResolvedValue({ src: '/replaced.png', width: 640, height: 480 })
    const { wrapper, editor, api } = await create({ modelValue: { type: 'doc', content: [picture('left', 'two-column'), picture('right', 'two-column')] }, uploadImage })
    await selectImage(editor)
    const input = wrapper.find('input[aria-label="上传并替换图片文件"]')
    Object.defineProperty(input.element, 'files', { value: [new File(['image'], 'new.png', { type: 'image/png' })] })
    await input.trigger('change')
    await settle()
    expect(uploadImage).toHaveBeenCalledOnce()
    expect(api.getJSON().content?.[0]?.attrs).toMatchObject({ src: '/replaced.png', width: 640, height: 480, imageLayout: 'two-column' })
    expect(api.getJSON().content?.[1]).toEqual(picture('right', 'two-column'))
    expect(wrapper.findAll('.media-node[data-image-layout="two-column"]')).toHaveLength(2)
  })

  it('retains the layout during HTML parsing and serialization', () => {
    const schema = getSchema(createProtocolExtensions())
    const element = document.createElement('div')
    element.innerHTML = '<img src="/left.png" data-image-layout="two-column"><img src="/right.png"><img src="/invalid.png" data-image-layout="invalid">'
    const node = DOMParser.fromSchema(schema).parse(element)
    expect(node.child(0).attrs.imageLayout).toBe('two-column')
    expect(node.child(1).attrs.imageLayout).toBeNull()
    expect(node.child(2).attrs.imageLayout).toBeNull()
    const serialized = DOMSerializer.fromSchema(schema).serializeNode(node.child(0)) as HTMLElement
    expect(serialized.getAttribute('data-image-layout')).toBe('two-column')
    expect(serialized.hasAttribute('imageLayout')).toBe(false)
  })

  it('disables layout changes in readonly and preview modes', async () => {
    const { wrapper, editor, api } = await create({ readonly: true, modelValue: imagesDocument() })
    await selectImage(editor)
    const before = api.getJSON()
    expect(wrapper.find('select[aria-label="图片排版"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.pair-images-button').attributes('disabled')).toBeDefined()
    await wrapper.find('.pair-images-button').trigger('click')
    expect(api.getJSON()).toEqual(before)
    await wrapper.setProps({ readonly: false })
    await wrapper.findAll('.top-actions .action-button').find(button => button.text() === '预览')!.trigger('click')
    await wrapper.find('.pair-images-button').trigger('click')
    expect(api.getJSON()).toEqual(before)
  })
})
