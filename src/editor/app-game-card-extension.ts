import { Node } from '@tiptap/core'
import { DOMSerializer, type DOMOutputSpec } from '@tiptap/pm/model'
import { watch, watchEffect } from 'vue'
import { appGameAttrs, firstBanner, kindLabels, resolveAppGameCardLabels, validAppGameCard, type AppGameCardAttrs, type AppGameCardClick, type AppGameCardLabels, type AppGameKind, type AppGameLinkResolver } from './app-game-card'

export interface AppGameCardOptions {
  onChoose?: (getPos: () => number | undefined) => void
  getLabels?: () => AppGameCardLabels | undefined
  isReadonly?: () => boolean
  resolveLink?: AppGameLinkResolver
  onLinkClick?: (click: AppGameCardClick) => void
}

function cardHref({ item, kind }: AppGameCardAttrs, resolveLink?: AppGameLinkResolver) {
  if (!item || !resolveLink) return
  const result = resolveLink({ ...item }, kind)
  if (typeof result !== 'string' || !result.trim()) return
  const href = result.trim()
  try {
    // Parse with browser URL semantics, including relative paths and app deep links.
    const { protocol } = new URL(href, 'https://example.invalid/')
    if (!['javascript:', 'vbscript:', 'data:', 'file:', 'blob:'].includes(protocol)) return href
  } catch { /* Malformed URL: leave this card without an action. */ }
}

function linkMarkup(kind: AppGameKind, href?: string): DOMOutputSpec {
  return ['a', { class: 'app-game-link', href }, '查看' + kindLabels[kind]]
}

const detailFields = ['rating', 'version', 'developer'] as const

function cardMarkup(attrs: AppGameCardAttrs, labels: Required<AppGameCardLabels>, href?: string): DOMOutputSpec {
  const { item, kind, displayImage } = attrs
  const label = kindLabels[kind]
  const banner = displayImage || firstBanner(item?.banner)
  const heading: DOMOutputSpec[] = []
  if (item?.icon) heading.push(['img', { class: 'app-game-icon', src: item.icon, alt: '', draggable: 'false' }])
  const title: DOMOutputSpec[] = [['strong', {}, item?.name || ('待选择' + label)]]
  if (item?.category) title.push(['small', {}, item.category])
  heading.push(['div', {}, ...title])

  const info: DOMOutputSpec[] = [['div', { class: 'app-game-heading' }, ...heading]]
  if (item) {
    const details: DOMOutputSpec[] = []
    for (const field of detailFields) {
      const value = item[field]
      const hasValue = value != null && value !== ''
      const content: (string | DOMOutputSpec)[] = [hasValue ? String(value) : '—']
      if (field === 'rating' && hasValue) content.push(['span', { class: 'app-game-star', 'aria-hidden': 'true' }, '★'])
      details.push(['div', {}, ['dt', {}, labels[field]], ['dd', {}, ...content]])
    }
    info.push(['dl', { class: 'app-game-details' }, ...details])
  }

  if (href) info.push(linkMarkup(kind, href))
  const children: DOMOutputSpec[] = [['div', { class: 'app-game-info' }, ...info]]
  if (banner) {
    children.push(['img', { class: 'app-game-banner', src: banner, alt: (item?.name || label) + '展示图', draggable: 'false' }])
  }
  return ['section', { class: 'app-game-card', 'data-app-game-card': JSON.stringify(appGameAttrs(attrs)) }, ...children]
}

export const ProtocolAppGameCard = Node.create<AppGameCardOptions>({
  name: 'appGameCard',
  group: 'block',
  atom: true,
  draggable: true,
  addOptions: () => ({}),
  addAttributes: () => ({
    kind: { default: 'app', rendered: false, parseHTML: () => null },
    item: { default: null, rendered: false, parseHTML: () => null },
    displayImage: { default: null, rendered: false, parseHTML: () => null },
    labels: { default: null, rendered: false, parseHTML: () => null },
  }),
  parseHTML() {
    return [{ tag: 'section[data-app-game-card]', getAttrs: element => {
      try {
        const attrs = JSON.parse(element.getAttribute('data-app-game-card') || '')
        return validAppGameCard({ type: 'appGameCard', attrs }) ? attrs : false
      } catch { return false }
    } }]
  },
  renderHTML({ node }) {
    const attrs = node.attrs as AppGameCardAttrs
    return cardMarkup(attrs, resolveAppGameCardLabels(this.options.getLabels?.(), attrs.labels), cardHref(attrs, this.options.resolveLink))
  },
  addNodeView() {
    return ({ node, editor, view, getPos }) => {
      const attrs = node.attrs as AppGameCardAttrs
      const doc = view.dom.ownerDocument
      const readLabels = () => resolveAppGameCardLabels(this.options.getLabels?.(), attrs.labels)
      const dom = DOMSerializer.renderSpec(doc, cardMarkup(attrs, readLabels())).dom as HTMLElement
      const terms = dom.querySelectorAll('.app-game-details dt')
      const stopLabels = watch(readLabels, labels => {
        terms.forEach((term, index) => { term.textContent = labels[detailFields[index]!] })
      })
      const choose = doc.createElement('button')
      choose.type = 'button'
      choose.className = 'app-game-choose'
      choose.textContent = (attrs.item ? '更换' : '选择') + kindLabels[attrs.kind]
      choose.onclick = () => {
        const pos = getPos()
        if (editor.isEditable && typeof pos === 'number') {
          editor.commands.setNodeSelection(pos)
          this.options.onChoose?.(getPos)
        }
      }
      const info = dom.querySelector('.app-game-info')!
      const link = DOMSerializer.renderSpec(doc, linkMarkup(attrs.kind)).dom as HTMLAnchorElement
      link.onclick = event => {
        const href = link.getAttribute('href')
        if (attrs.item && href) this.options.onLinkClick?.({ item: { ...attrs.item }, kind: attrs.kind, href, event })
      }
      const stop = watchEffect(() => {
        const reading = this.options.isReadonly?.() ?? !editor.isEditable
        if (reading) choose.remove()
        else if (!choose.parentNode) info.append(choose)
        const href = reading ? cardHref(attrs, this.options.resolveLink) : undefined
        if (href) {
          link.setAttribute('href', href)
          if (!link.parentNode) info.append(link)
        } else {
          link.removeAttribute('href')
          link.remove()
        }
      })
      return {
        dom,
        stopEvent: event => event.target === choose || event.target === link,
        destroy() { stopLabels(); stop() },
      }
    }
  },
})
