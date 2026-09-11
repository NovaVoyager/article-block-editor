// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Ajv from 'ajv'
import type { Editor } from '@tiptap/core'
import ArticleEditor from './ArticleEditor.vue'
import type { ArticleEditorExpose } from './editor/public-types'
import type { ProseMirrorJSON } from './editor/types'
import { downloadProtocolDefinition, PROTOCOL_DOWNLOAD_FILENAME } from './editor/protocol-download'
import { toProtocolJSON, validateProtocolDocument } from './editor/protocol'
import { initialDocument } from './editor/modules'
import { currentDocumentSchema, getCurrentProtocol } from './protocol/current-protocol'
import originalProtocol from './protocol/article-content-protocol-v1.json'

const wrappers: ReturnType<typeof mount>[] = []
const originalJSON = JSON.stringify(originalProtocol)
const downloads: { text: string; type: string }[] = []
const createUrl = vi.fn((_blob: Blob) => 'blob:protocol-test')
const revokeUrl = vi.fn()
const clickedLinks: { filename: string; href: string; connected: boolean }[] = []
const settle = async () => { await vi.advanceTimersByTimeAsync(40); await nextTick() }
const extendedDocument: ProseMirrorJSON = { type: 'doc', content: [
  { type: 'paragraph', attrs: { fontSize: 24 }, content: [{ type: 'text', text: '彩色正文', marks: [
    { type: 'textStyle', attrs: { color: '#123456' } }, { type: 'highlight', attrs: { color: '#abcdef' } },
  ] }] },
  { type: 'image', attrs: { src: '/test.png', width: 2848, height: 1600, imageLayout: 'two-column' } },
] }

beforeEach(() => {
  vi.useFakeTimers()
  downloads.length = 0
  clickedLinks.length = 0
  createUrl.mockReset().mockReturnValue('blob:protocol-test')
  revokeUrl.mockReset()
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createUrl
    static revokeObjectURL = revokeUrl
  })
  vi.stubGlobal('Blob', class extends Blob {
    constructor(parts: BlobPart[], options?: BlobPropertyBag) {
      super(parts, options)
      downloads.push({ text: parts.join(''), type: this.type })
    }
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clickedLinks.push({ filename: this.download, href: this.href, connected: this.isConnected })
  })
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('Current protocol download', () => {
  it('exports a detached, self-contained protocol with extended metadata and the actual validation schema', () => {
    const protocol = getCurrentProtocol()
    expect(protocol.fileFormat).toBe('article-content-protocol')
    expect(protocol.documentSchema).toEqual(currentDocumentSchema)
    expect(protocol.nodes.find(node => node.type === 'paragraph')?.attributes).toContainEqual(expect.objectContaining({ name: 'fontSize', minimum: 8, maximum: 96 }))
    expect(protocol.nodes.find(node => node.type === 'image')?.attributes).toContainEqual(expect.objectContaining({ name: 'imageLayout', allowedValues: ['two-column'] }))
    expect(protocol.marks.map(mark => mark.type)).toEqual([...originalProtocol.marks.map(mark => mark.type), 'textStyle', 'highlight'])
    expect(protocol.extensions).toHaveLength(5)
    protocol.documentSchema.definitions.paragraph.properties.attrs.properties.fontSize.maximum = 10
    protocol.nodes[0]!.description = 'mutated'
    expect(getCurrentProtocol().documentSchema).toEqual(currentDocumentSchema)
    expect(getCurrentProtocol().nodes[0]!.description).toBe(originalProtocol.nodes[0]!.description)
    expect(JSON.stringify(originalProtocol)).toBe(originalJSON)
  })

  it('compiles the downloaded schema offline and agrees with the component for valid and invalid documents', () => {
    const downloaded = JSON.parse(JSON.stringify(getCurrentProtocol()))
    const validate = new Ajv({ allErrors: true, strict: false }).compile(downloaded.documentSchema)
    const invalidSize = { type: 'doc', content: [{ type: 'paragraph', attrs: { fontSize: 200 } }] }
    const invalidLayout = { type: 'doc', content: [{ type: 'image', attrs: { src: '/x.png', imageLayout: 'three-column' } }] }
    const invalidColor = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'highlight', attrs: { color: 'red' } }] }] }] }
    const validDocuments = [toProtocolJSON(initialDocument), extendedDocument]
    for (const value of validDocuments) expect(validate(value)).toBe(true)
    for (const value of [invalidSize, invalidLayout, invalidColor, { type: 'unknown' }]) expect(validate(value)).toBe(false)
    for (const value of [...validDocuments, invalidSize, invalidLayout, invalidColor]) {
      expect(validate(value)).toBe(validateProtocolDocument(value).valid)
    }
  })

  it.each(['edit', 'readonly', 'preview', 'invalid'])('downloads the protocol, never private article content, in %s mode', async mode => {
    const modelValue: ProseMirrorJSON = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '当前文章私密测试内容' }] }] }
    const wrapper = mount(ArticleEditor, { props: { modelValue, readonly: mode === 'readonly' }, attachTo: document.body, global: { stubs: { DragHandle: true } } })
    wrappers.push(wrapper)
    await settle()
    const api = wrapper.vm as unknown as ArticleEditorExpose
    if (mode === 'preview') await wrapper.findAll('.top-actions .action-button').find(button => button.text() === '预览')!.trigger('click')
    if (mode === 'invalid') {
      const editor = (wrapper.find('.article-editor').element as HTMLElement & { editor: Editor }).editor
      editor.commands.insertContent({ type: 'image', attrs: { src: '' } })
      await settle()
      expect(api.validate().valid).toBe(false)
    }
    const before = api.getJSON()
    const changeCount = wrapper.emitted('change')?.length ?? 0
    const button = wrapper.find('button[aria-label="下载协议"]')
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    expect(clickedLinks).toEqual([{ filename: PROTOCOL_DOWNLOAD_FILENAME, href: 'blob:protocol-test', connected: true }])
    expect(JSON.parse(downloads[0]!.text)).toEqual(getCurrentProtocol())
    expect(downloads[0]!.type).toBe(originalProtocol.mediaType)
    expect(downloads[0]!.text).not.toContain('当前文章私密测试内容')
    expect(api.getJSON()).toEqual(before)
    expect(wrapper.emitted('change')?.length ?? 0).toBe(changeCount)
    expect(wrapper.emitted('save')).toBeUndefined()
    expect(document.querySelector('a[download]')).toBeNull()
    expect(revokeUrl).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(revokeUrl).toHaveBeenCalledWith('blob:protocol-test')
  })

  it('removes the temporary link and releases the Blob even if clicking fails', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('download blocked') })
    expect(downloadProtocolDefinition).toThrow('download blocked')
    expect(document.querySelector('a[download]')).toBeNull()
    await vi.advanceTimersByTimeAsync(1000)
    expect(revokeUrl).toHaveBeenCalledOnce()
  })

  it('reports a download error without changing the article', async () => {
    const wrapper = mount(ArticleEditor, { global: { stubs: { DragHandle: true } } })
    wrappers.push(wrapper)
    await settle()
    const api = wrapper.vm as unknown as ArticleEditorExpose
    const before = api.getJSON()
    createUrl.mockImplementationOnce(() => { throw new Error('Blob downloads unavailable') })
    await wrapper.find('button[aria-label="下载协议"]').trigger('click')
    expect(wrapper.emitted('error')?.at(-1)?.[0]).toMatchObject({ source: 'protocol', message: 'Blob downloads unavailable' })
    expect(wrapper.text()).toContain('协议下载失败')
    expect(api.getJSON()).toEqual(before)
    expect(clickedLinks).toHaveLength(0)
  })
})
