import { Node } from '@tiptap/core'
import { DOMSerializer, type DOMOutputSpec } from '@tiptap/pm/model'
import { appGameAttrs, firstBanner, kindLabels, validAppGameCard, type AppGameCardAttrs } from './app-game-card'

function cardMarkup(attrs: AppGameCardAttrs): DOMOutputSpec {
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
    for (const [name, value] of [['评分', item.rating], ['版本', item.version], ['开发者', item.developer]] as const) {
      const hasValue = value != null && value !== ''
      const content: (string | DOMOutputSpec)[] = [hasValue ? String(value) : '—']
      if (name === '评分' && hasValue) content.push(['span', { class: 'app-game-star', 'aria-hidden': 'true' }, '★'])
      details.push(['div', {}, ['dt', {}, name], ['dd', {}, ...content]])
    }
    info.push(['dl', { class: 'app-game-details' }, ...details])
  }

  const children: DOMOutputSpec[] = [['div', { class: 'app-game-info' }, ...info]]
  if (banner) {
    children.push(['img', { class: 'app-game-banner', src: banner, alt: (item?.name || label) + '展示图', draggable: 'false' }])
  }
  return ['section', { class: 'app-game-card', 'data-app-game-card': JSON.stringify(appGameAttrs(attrs)) }, ...children]
}

export const ProtocolAppGameCard = Node.create<{ onChoose?: (getPos: () => number | undefined) => void }>({
  name: 'appGameCard',
  group: 'block',
  atom: true,
  draggable: true,
  addOptions: () => ({}),
  addAttributes: () => ({
    kind: { default: 'app', rendered: false, parseHTML: () => null },
    item: { default: null, rendered: false, parseHTML: () => null },
    displayImage: { default: null, rendered: false, parseHTML: () => null },
  }),
  parseHTML() {
    return [{ tag: 'section[data-app-game-card]', getAttrs: element => {
      try {
        const attrs = JSON.parse(element.getAttribute('data-app-game-card') || '')
        return validAppGameCard({ type: 'appGameCard', attrs }) ? attrs : false
      } catch { return false }
    } }]
  },
  renderHTML({ node }) { return cardMarkup(node.attrs as AppGameCardAttrs) },
  addNodeView() {
    return ({ node, editor, view, getPos }) => {
      const attrs = node.attrs as AppGameCardAttrs
      const doc = view.dom.ownerDocument
      const dom = DOMSerializer.renderSpec(doc, cardMarkup(attrs)).dom as HTMLElement
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
      dom.querySelector('.app-game-info')!.append(choose)
      return { dom, stopEvent: event => event.target === choose }
    }
  },
})
