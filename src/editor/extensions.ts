import { Mark, Node, mergeAttributes } from '@tiptap/core'
import CodeBlock from '@tiptap/extension-code-block'
import { Table, TableCell, TableRow } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import StarterKit from '@tiptap/starter-kit'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import ArticleButtonNodeView from '../components/nodeviews/ArticleButtonNodeView.vue'
import ImageNodeView from '../components/nodeviews/ImageNodeView.vue'
import { TextColor, TextHighlight } from './text-formatting'
import { ParagraphFontSize } from './font-size'
import { normalizeImageLayout } from './image-layout'

const ProtocolDocument = Node.create({
  name: 'doc',
  topNode: true,
  content: 'block*',
})

const ProtocolCodeBlock = CodeBlock.extend({
  addAttributes() {
    return {
      language: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-language'),
        renderHTML: (attributes) =>
          attributes.language ? { 'data-language': attributes.language } : {},
      },
    }
  },
})

const ProtocolImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: '' },
      alt: { default: null },
      title: { default: null },
      width: { default: null },
      height: { default: null },
      imageAlign: { default: 'center' },
      imageLayout: {
        default: null,
        parseHTML: (element) => normalizeImageLayout(element.getAttribute('data-image-layout')),
        renderHTML: (attributes) => normalizeImageLayout(attributes.imageLayout)
          ? { 'data-image-layout': attributes.imageLayout }
          : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'img[src]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const { imageAlign, ...attributes } = HTMLAttributes
    return [
      'img',
      mergeAttributes(attributes, imageAlign ? { 'data-image-align': imageAlign } : {}),
    ]
  },

  addNodeView() {
    return VueNodeViewRenderer(ImageNodeView)
  },
})

const ProtocolArticleButton = Node.create({
  name: 'articleButton',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      id: { default: null },
      title: { default: null },
      text: { default: '文章操作' },
      style: { default: 'button' },
      href: { default: null },
    }
  },

  parseHTML() {
    return [
      { tag: '[data-article-button-style]' },
      { tag: 'button[data-article-button-id]' },
    ]
  },

  renderHTML({ node }) {
    const { id, title, text, style, href } = node.attrs
    const tag = style === 'link' ? 'a' : 'button'
    const attributes: Record<string, string> = {
      'data-article-button-style': style,
    }
    if (id) attributes['data-article-button-id'] = id
    if (title) attributes.title = title
    if (tag === 'a' && href) attributes.href = href
    return [tag, attributes, text]
  },

  addNodeView() {
    return VueNodeViewRenderer(ArticleButtonNodeView)
  },
})

const ProtocolLink = Mark.create({
  name: 'link',
  priority: 1000,
  keepOnSplit: false,
  inclusive: false,

  addAttributes() {
    return {
      type: { default: 'href' },
      href: { default: null },
      id: { default: null },
      title: { default: null },
      target: { default: '_blank' },
    }
  },

  parseHTML() {
    return [{ tag: 'a[href]' }, { tag: 'a[data-link-type="custom"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const type = HTMLAttributes.type === 'custom' ? 'custom' : 'href'
    const attributes: Record<string, string> = {
      'data-link-type': type,
      target: HTMLAttributes.target === '_self' ? '_self' : '_blank',
    }

    if (type === 'custom') {
      if (HTMLAttributes.id) attributes['data-link-id'] = HTMLAttributes.id
      if (HTMLAttributes.title) attributes.title = HTMLAttributes.title
    } else if (HTMLAttributes.href) {
      attributes.href = HTMLAttributes.href
      if (attributes.target === '_blank') attributes.rel = 'noopener noreferrer'
    }

    return ['a', attributes, 0]
  },
})

const ProtocolTable = Table.extend({ content: 'tableRow+' }).configure({
  resizable: true,
  allowTableNodeSelection: true,
})
const ProtocolTableRow = TableRow.extend({ content: 'tableCell+' })
const ProtocolTableCell = TableCell.extend({ content: 'block+' })

export function createProtocolExtensions() {
  return [
    StarterKit.configure({
      document: false,
      codeBlock: false,
      hardBreak: false,
      link: false,
      underline: false,
    }),
    ProtocolDocument,
    ProtocolCodeBlock,
    ProtocolImage,
    ProtocolArticleButton,
    ProtocolLink,
    Underline,
    TextColor,
    TextHighlight,
    ParagraphFontSize,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ProtocolTable,
    ProtocolTableRow,
    ProtocolTableCell,
  ]
}
