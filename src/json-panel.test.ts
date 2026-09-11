/// <reference types="node" />
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import postcss from 'postcss'
import { readFileSync } from 'node:fs'
import ArticleEditor from './ArticleEditor.vue'
import type { ArticleEditorExpose, ArticleEditorProps } from './editor/public-types'

const styles = readFileSync('src/style.css', 'utf8')

const wrappers: ReturnType<typeof mount>[] = []
let stylesheet: HTMLStyleElement
const article = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'JSON 抽屉回归测试' }] }] }
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 35)); await nextTick() }

beforeEach(() => {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
  // jsdom cannot lay out container queries/animations. Apply the actual base CSS
  // so a mounted-but-unpositioned/covered drawer cannot pass an existence-only test.
  stylesheet = document.createElement('style')
  stylesheet.textContent = postcss.parse(styles).nodes.filter(node => node.type === 'rule').map(node => node.toString()).join('\n')
  document.head.append(stylesheet)
})
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount())
  stylesheet.remove()
  document.body.innerHTML = ''
})
async function create(props: ArticleEditorProps = {}) {
  const wrapper = mount(ArticleEditor, {
    props: { modelValue: article, ...props }, attachTo: document.body,
    global: { stubs: { DragHandle: true } },
  })
  wrappers.push(wrapper)
  await settle()
  return { wrapper, api: wrapper.vm as unknown as ArticleEditorExpose }
}
async function openJson(wrapper: ReturnType<typeof mount>) {
  await wrapper.findAll('.top-actions button').find(button => button.text() === 'JSON')!.trigger('click')
}

describe('JSON drawer layering and interactions', () => {
  it.each(['edit', 'readonly', 'preview'] as const)('opens above the canvas in %s mode without changing the article', async mode => {
    const { wrapper, api } = await create({ readonly: mode === 'readonly' })
    if (mode === 'preview') await wrapper.findAll('.top-actions button').find(button => button.text() === '预览')!.trigger('click')
    const before = api.getJSON()
    expect(wrapper.find('.json-drawer').exists()).toBe(false)
    await openJson(wrapper)
    const backdrop = wrapper.find('.drawer-backdrop')
    const backdropStyle = getComputedStyle(backdrop.element)
    expect(backdropStyle.position).toBe('absolute')
    expect(backdropStyle.inset).toBe('0')
    // The backdrop must not inherit the resource question card's 22px margins.
    expect(parseFloat(backdropStyle.marginTop) || 0).toBe(0)
    expect(parseFloat(backdropStyle.marginBottom) || 0).toBe(0)
    expect(Number(backdropStyle.zIndex)).toBeGreaterThan(Number(getComputedStyle(wrapper.find('.topbar').element).zIndex))
    expect(Number(backdropStyle.zIndex)).toBeGreaterThan(Number(getComputedStyle(wrapper.find('.library-panel').element).zIndex))
    expect(backdropStyle.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    const dialog = backdrop.find('[role="dialog"][aria-label="ProseMirror JSON"]')
    expect(dialog.isVisible()).toBe(true)
    expect(getComputedStyle(dialog.element).right).toBe('0px')
    expect(JSON.parse((dialog.find('textarea').element as HTMLTextAreaElement).value)).toEqual(before)
    expect(dialog.find('.drawer-footer .primary').attributes('disabled') !== undefined).toBe(mode !== 'edit')
    await dialog.find('textarea').trigger('mousedown')
    expect(wrapper.find('.json-drawer').exists()).toBe(true)
    expect(api.getJSON()).toEqual(before)
    expect(wrapper.emitted('change')).toBeUndefined()
    await dialog.find('button[aria-label="关闭"]').trigger('click')
    expect(wrapper.find('.drawer-backdrop').exists()).toBe(false)
  })

  it('closes on the backdrop, reopens, and keeps separate editor instances isolated', async () => {
    const first = await create(), second = await create()
    await openJson(first.wrapper)
    expect(second.wrapper.find('.drawer-backdrop').exists()).toBe(false)
    expect(first.wrapper.find('.drawer-backdrop').element.closest('.article-studio')).toBe(first.wrapper.element)
    await first.wrapper.find('.drawer-backdrop').trigger('mousedown')
    expect(first.wrapper.find('.drawer-backdrop').exists()).toBe(false)
    await openJson(second.wrapper)
    expect(first.wrapper.find('.drawer-backdrop').exists()).toBe(false)
    expect(second.wrapper.find('.json-drawer').isVisible()).toBe(true)
  })

  it('keeps invalid JSON open and can apply corrected JSON with normally sized footer buttons', async () => {
    const { wrapper, api } = await create()
    await openJson(wrapper)
    const before = api.getJSON()
    await wrapper.find('.json-drawer textarea').setValue('{')
    await wrapper.find('.drawer-footer .primary').trigger('click')
    expect(api.getJSON()).toEqual(before)
    expect(wrapper.find('.validation-errors').exists()).toBe(true)
    expect(wrapper.find('.json-drawer').isVisible()).toBe(true)
    const footerStyle = getComputedStyle(wrapper.find('.drawer-footer').element)
    expect(footerStyle.gridArea).toBe('footer')
    expect(footerStyle.alignItems).toBe('center')
    for (const button of wrapper.findAll('.drawer-footer button')) expect(getComputedStyle(button.element).height).toBe('36px')
    const changed = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '已应用修改' }] }] }
    await wrapper.find('.json-drawer textarea').setValue(JSON.stringify(changed))
    await wrapper.find('.drawer-footer .primary').trigger('click')
    expect(wrapper.find('.drawer-backdrop').exists()).toBe(false)
    expect(api.getJSON()).toEqual(changed)
    expect(wrapper.emitted('change')?.at(-1)?.[0]).toEqual(changed)
  })
})
