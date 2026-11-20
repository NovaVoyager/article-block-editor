// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { h, nextTick, ref } from 'vue'
import { getSchema, type Editor } from '@tiptap/core'
import { DOMParser, DOMSerializer } from '@tiptap/pm/model'
import ArticleEditor from './ArticleEditor.vue'
import type { AppGameCardClick, AppGameData, AppGameKind, AppGamePickerScope, ArticleEditorExpose, ImageUploadHandler } from './index'
import { createProtocolExtensions } from './editor/extensions'
import { toProtocolJSON, validateProtocolDocument, validateProtocolV1Document } from './editor/protocol'

const item: AppGameData = { id: 0, name: '星图', icon: '/icon.png', category: '教育', rating: 0,
  version: '2.0', developer: '星图工作室', banner: ' , /first.jpg, /second.jpg' }
const wrappers: ReturnType<typeof mount>[] = []

beforeEach(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  document.body.innerHTML = ''
})

async function setup(kind: AppGameKind, uploadImage?: ImageUploadHandler) {
  let picker: AppGamePickerScope
  const wrapper = mount(ArticleEditor, { props: { uploadImage }, attachTo: document.body, global: { stubs: { DragHandle: true } }, slots: {
    'app-game-picker': (scope: AppGamePickerScope) => { picker = scope; return h('div') },
  } })
  wrappers.push(wrapper)
  await new Promise(resolve => setTimeout(resolve, 40))
  const title = kind === 'app' ? '应用卡片' : '游戏卡片'
  await wrapper.findAll('.module-card').find(button => button.find('strong').text() === title)!.trigger('click')
  const open = () => wrapper.get('.app-game-choose').trigger('click')
  await open()
  const api = wrapper.vm as unknown as ArticleEditorExpose
  const editor = (wrapper.get('.article-editor').element as HTMLElement & { editor: Editor }).editor
  return { wrapper, api, editor, scope: () => picker!, open }
}

function cardLabelInput(wrapper: ReturnType<typeof mount>, title: string) {
  const label = wrapper.findAll('.inspector-panel .field-label').find(field => field.text() === title)
  return label!.get('input')
}

async function chooseDisplayImage(wrapper: ReturnType<typeof mount>) {
  const input = wrapper.get('input[aria-label="上传展示图文件"]')
  const file = new File(['image'], 'cover.png', { type: 'image/png' })
  Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
  await input.trigger('change')
}

describe('app and game cards', () => {
  it.each(['app', 'game'] as const)('selects a %s snapshot, overrides and restores its banner', async kind => {
    const { wrapper, scope, open, api } = await setup(kind)
    expect(scope().kind).toBe(kind)
    expect(scope().current).toBeNull()
    expect(scope().select({ ...item, name: ' ' })).toBe(false)
    const source = { ...item, privateField: 'unused' }
    expect(scope().select(source)).toBe(true)
    source.name = 'changed'
    await nextTick()
    expect(wrapper.get('input[aria-label="上传展示图文件"]').attributes('disabled')).toBeDefined()
    const card = wrapper.get('.app-game-card')
    for (const value of ['星图', '教育', '0', '2.0', '星图工作室']) expect(card.text()).toContain(value)
    expect(card.get('.app-game-icon').attributes('src')).toBe('/icon.png')
    const banner = () => wrapper.get('.app-game-banner').attributes('src')
    expect(banner()).toBe('/first.jpg')
    const input = () => wrapper.get('.inspector-panel input[type="url"]')
    await input().setValue('/override.jpg')
    expect(banner()).toBe('/override.jpg')
    const saved = api.getJSON()
    expect(saved.content?.find(n => n.type === 'appGameCard')?.attrs).toEqual({ kind, item, displayImage: '/override.jpg' })
    expect(api.validate().valid).toBe(true)
    await input().setValue('')
    expect(banner()).toBe('/first.jpg')
    api.setContent(saved)
    await open()
    expect(scope().select({ ...item, version: '3.0' })).toBe(true)
    await nextTick()
    expect(banner()).toBe('/override.jpg')
    await open()
    expect(scope().select({ id: 2, name: '另一个条目' })).toBe(true)
    await nextTick()
    expect(wrapper.find('.app-game-banner').exists()).toBe(false)
  })

  it.each(['app', 'game'] as const)('uploads only the %s display image and can undo it', async kind => {
    let complete!: (result: { src: string; width: number }) => void
    const { wrapper, scope, api, editor } = await setup(kind, () => new Promise(resolve => { complete = resolve }))
    scope().select(item)
    await nextTick()
    const before = api.getJSON()
    await chooseDisplayImage(wrapper)
    expect(api.getJSON()).toEqual(before)
    expect(wrapper.get('.top-actions .primary').attributes('disabled')).toBeDefined()

    await cardLabelInput(wrapper, '版本标签').setValue('Build')
    // Move the target position and selection while the host is uploading.
    editor.view.dispatch(editor.state.tr.insert(0, editor.schema.nodes.paragraph!.create()))
    editor.commands.setTextSelection(1)
    const shifted = api.getJSON()
    complete({ src: '/uploaded.png', width: 960 })
    await flushPromises()
    const card = api.getJSON().content!.find(node => node.type === 'appGameCard')!
    expect(card.attrs).toEqual({ kind, item, displayImage: '/uploaded.png', labels: { version: 'Build' } })
    expect(api.getJSON().content!.some(node => node.type === 'image')).toBe(false)
    expect(wrapper.get('.app-game-banner').attributes('src')).toBe('/uploaded.png')
    expect(api.validate().valid).toBe(true)
    editor.commands.undo()
    expect(api.getJSON()).toEqual(shifted)
    expect(wrapper.get('.app-game-banner').attributes('src')).toBe('/first.jpg')
    editor.commands.redo()
    expect(wrapper.get('.app-game-banner').attributes('src')).toBe('/uploaded.png')
  })

  it.each(['manual', 'reselect'] as const)('discards a late upload after a %s change', async action => {
    let complete!: (src: string) => void
    let signal!: AbortSignal
    const { wrapper, scope, api, open } = await setup('app', (_file, context) => {
      signal = context.signal
      return new Promise(resolve => { complete = resolve })
    })
    scope().select(item)
    await nextTick()
    await chooseDisplayImage(wrapper)
    if (action === 'manual') await wrapper.get('.inspector-panel input[type="url"]').setValue('/manual.jpg')
    else {
      await open()
      scope().select({ ...item, id: 2, banner: '/new-first.jpg' })
    }
    expect(signal.aborted).toBe(true)
    const saved = api.getJSON()
    complete('/stale.png')
    await flushPromises()
    expect(api.getJSON()).toEqual(saved)
    expect(wrapper.get('.app-game-banner').attributes('src')).toBe(action === 'manual' ? '/manual.jpg' : '/new-first.jpg')
  })

  it('ignores stale selection after cancellation, read-only mode and document replacement', async () => {
    const { wrapper, api, scope, open } = await setup('game')
    const before = api.getJSON()
    let stale = scope()
    stale.cancel()
    expect(stale.select(item)).toBe(false)
    await open()
    stale = scope()
    await wrapper.setProps({ readonly: true })
    expect(stale.select(item)).toBe(false)
    expect(api.getJSON()).toEqual(before)
    await wrapper.setProps({ readonly: false })
    await open()
    stale = scope()
    api.clear()
    expect(stale.select(item)).toBe(false)
    expect(api.getJSON().content?.some(n => n.type === 'appGameCard')).toBe(false)
  })

  it.each(['app', 'game'] as const)('saves and clears individual %s labels in the inspector', async kind => {
    const { wrapper, scope, api, editor, open } = await setup(kind)
    scope().select(item)
    await wrapper.setProps({ appGameCardLabels: { rating: 'Score', developer: 'Studio' } })
    const field = (title: string) => cardLabelInput(wrapper, title)
    const labels = () => wrapper.findAll('.app-game-details dt').map(term => term.text())
    const card = () => api.getJSON().content!.find(node => node.type === 'appGameCard')!
    expect(field('评分标签').attributes('placeholder')).toBe('Score')
    expect(field('版本标签').attributes('placeholder')).toBe('Version')
    await field('评分标签').setValue('  星级  ')
    await field('开发者标签').setValue('发行商')
    expect(card().attrs).toEqual({ kind, item, labels: { rating: '星级', developer: '发行商' } })
    expect(labels()).toEqual(['星级', 'Version', '发行商'])
    expect(api.validate().valid).toBe(true)

    await open()
    expect(scope().select({ ...item, id: 2 })).toBe(true)
    const saved = api.getJSON()
    api.clear()
    expect(api.setContent(saved)).toBe(true)
    await open()
    scope().cancel()
    await nextTick()
    expect(field('评分标签').element.value).toBe('星级')
    await wrapper.setProps({ appGameCardLabels: { rating: 'Rating (5)', version: 'Release' } })
    expect(labels()).toEqual(['星级', 'Release', '发行商'])
    await field('评分标签').setValue('   ')
    expect(labels()).toEqual(['Rating (5)', 'Release', '发行商'])
    await field('开发者标签').setValue('')
    expect(card().attrs?.labels).toBeUndefined()
    expect(labels()).toEqual(['Rating (5)', 'Release', 'Developer'])
    editor.commands.undo()
    expect(card().attrs?.labels).toEqual({ developer: '发行商' })
  })

  it.each(['app', 'game'] as const)('updates %s field labels in the editor, preview and exported HTML', async kind => {
    const { wrapper, scope, api, editor } = await setup(kind)
    scope().select(item)
    await nextTick()
    const original = api.getJSON()
    const changes = wrapper.emitted('change')?.length
    const labels = () => wrapper.findAll('.app-game-details dt').map(term => term.text())
    expect(labels()).toEqual(['Rating', 'Version', 'Developer'])

    const overrides = ref({ rating: '评分', version: '版本', developer: '开发者' })
    await wrapper.setProps({ appGameCardLabels: overrides.value })
    expect(labels()).toEqual(['评分', '版本', '开发者'])
    expect(wrapper.get('.app-game-star').text()).toBe('★')

    const preview = wrapper.findAll('.top-actions button').find(button => button.text() === '预览')!
    await preview.trigger('click')
    overrides.value.rating = 'Score'
    await nextTick()
    expect(labels()).toEqual(['Score', '版本', '开发者'])

    await preview.trigger('click')
    await wrapper.setProps({ readonly: true, appGameCardLabels: { developer: 'Studio' } })
    expect(labels()).toEqual(['Rating', 'Version', 'Studio'])
    const html = document.createElement('div')
    html.innerHTML = editor.getHTML()
    expect(Array.from(html.querySelectorAll('dt'), term => term.textContent)).toEqual(labels())
    expect(api.getJSON()).toEqual(original)
    expect(wrapper.emitted('change')?.length).toBe(changes)
  })

  it.each(['app', 'game'] as const)('resolves the %s detail link in preview and lets the host handle navigation', async kind => {
    const { wrapper, scope, api } = await setup(kind)
    scope().select(item)
    const locale = ref('zh')
    const resolveAppGameLink = vi.fn((data: AppGameData, type: AppGameKind) => `/${locale.value}/${type}/${data.id}`)
    const onClick = vi.fn(({ event }: AppGameCardClick) => event.preventDefault())
    await wrapper.setProps({ resolveAppGameLink, onAppGameClick: onClick })
    const before = api.getJSON()
    const changes = wrapper.emitted('change')?.length
    const preview = wrapper.findAll('.top-actions button').find(button => button.text() === '预览')!
    expect(wrapper.find('.app-game-link').exists()).toBe(false)
    await preview.trigger('click')
    const link = wrapper.get('.app-game-info a.app-game-link')
    expect(wrapper.find('.app-game-choose').exists()).toBe(false)
    expect(resolveAppGameLink).toHaveBeenCalledWith(item, kind)
    expect(link.text()).toBe(kind === 'app' ? '查看应用' : '查看游戏')
    expect(link.attributes('href')).toBe(`/zh/${kind}/0`)
    locale.value = 'en'
    await nextTick()
    const href = `/en/${kind}/0`
    expect(link.attributes('href')).toBe(href)
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.element.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(onClick).toHaveBeenCalledOnce()
    expect(onClick).toHaveBeenCalledWith({ event, kind, item, href })
    expect(api.getJSON()).toEqual(before)
    expect(wrapper.emitted('change')?.length).toBe(changes)
    await preview.trigger('click')
    expect(wrapper.get('.app-game-choose').text()).toBe(kind === 'app' ? '更换应用' : '更换游戏')
    expect(wrapper.find('.app-game-link').exists()).toBe(false)
  })

  it('refreshes a read-only link when its resolver or item changes and omits unavailable links', async () => {
    const { wrapper, scope, api, editor } = await setup('app')
    scope().select(item)
    await wrapper.setProps({ readonly: true })
    expect(wrapper.find('.app-game-link').exists()).toBe(false)
    const resolveAppGameLink = vi.fn((data: AppGameData) => 'catalog://details/' + data.id)
    await wrapper.setProps({ resolveAppGameLink })
    expect(wrapper.get('.app-game-link').attributes('href')).toBe('catalog://details/0')
    expect(editor.getHTML()).toContain('href="catalog://details/0"')
    api.setContent({ type: 'doc', content: [{ type: 'appGameCard', attrs: { kind: 'app', item: { ...item, id: 2 } } }] })
    await nextTick()
    expect(wrapper.get('.app-game-link').attributes('href')).toBe('catalog://details/2')
    for (const result of [null, ' ', 'javascript:void(0)']) {
      await wrapper.setProps({ resolveAppGameLink: () => result })
      expect(wrapper.find('.app-game-link').exists()).toBe(false)
      expect(editor.getHTML()).not.toContain('class="app-game-link"')
    }
    api.setContent({ type: 'doc', content: [{ type: 'appGameCard', attrs: { kind: 'app' } }] })
    resolveAppGameLink.mockClear()
    await wrapper.setProps({ resolveAppGameLink })
    expect(resolveAppGameLink).not.toHaveBeenCalled()
    expect(wrapper.find('.app-game-link').exists()).toBe(false)
  })

  it('round-trips HTML and JSON with the extended protocol', () => {
    const doc = { type: 'doc', content: [{ type: 'appGameCard', attrs: { kind: 'game', item, displayImage: '/custom.jpg', labels: { version: 'Build' } } }] }
    const schema = getSchema(createProtocolExtensions())
    const fragment = DOMSerializer.fromSchema(schema).serializeFragment(schema.nodeFromJSON(doc).content)
    const html = document.createElement('div')
    html.append(fragment)
    expect(html.querySelector('.app-game-banner')?.getAttribute('src')).toBe('/custom.jpg')
    expect(html.querySelector('button')).toBeNull()
    expect(Array.from(html.querySelectorAll('dt'), term => term.textContent)).toEqual(['Rating', 'Build', 'Developer'])
    expect(toProtocolJSON(DOMParser.fromSchema(schema).parse(html).toJSON())).toEqual(doc)
    expect(validateProtocolDocument(doc).valid).toBe(true)
    expect(validateProtocolV1Document(doc).valid).toBe(false)
    expect(validateProtocolDocument({ type: 'doc', content: [{ type: 'appGameCard', attrs: { kind: 'film' } }] }).valid).toBe(false)
  })
})
