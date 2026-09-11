import { Node } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import ResourceQuestionNodeView from '../components/nodeviews/ResourceQuestionNodeView.vue'
import { resourceIdentityErrors, snapshotQuestionImage, type ResourceQuestionAttrs } from './resource-question'
import schema from '../protocol/resource-question-v1.schema.json'
import imageSchema from '../protocol/resource-question-image-v1.schema.json'
import Ajv from 'ajv'

export interface ResourceQuestionHandlers {
  onChoose?: (id: string) => void
  onNavigate?: (anchorId?: string) => void
}
const check = new Ajv({ strict: false }).addSchema(imageSchema).compile(schema)

export const ProtocolResourceQuestion = Node.create<ResourceQuestionHandlers>({
  name: 'resourceQuestion',
  // Deliberately not in "block": nested containers cannot accept this node.
  group: 'resourceQuestion',
  atom: true, selectable: true, draggable: true,
  addOptions: () => ({}),
  addAttributes() {
    return {
      id: { default: null, rendered: false }, resourceId: { default: '', rendered: false },
      title: { default: '', rendered: false }, description: { default: '', rendered: false },
      options: { default: [], rendered: false }, hideFollowing: { default: false, rendered: false },
      revealKey: { default: null, rendered: false },
      image: { default: null, rendered: false },
    }
  },
  parseHTML() {
    return [{ tag: 'section[data-resource-question]', getAttrs: element => {
      try {
        const attrs = JSON.parse(element.getAttribute('data-resource-question') || '')
        const doc = { type: 'doc', content: [{ type: 'resourceQuestion', attrs }] }
        return check(doc.content[0]) && !resourceIdentityErrors(doc).length ? attrs : false
      } catch { return false }
    } }]
  },
  renderHTML({ node }) {
    const attrs = node.attrs as ResourceQuestionAttrs
    const { image, ...rest } = attrs
    const saved = { ...rest, ...(image && { image: snapshotQuestionImage(image) }) }
    // JSON is stored as a DOM attribute by DOMSerializer, never interpolated as HTML.
    return ['section', { 'data-resource-question': JSON.stringify(saved) },
      ...(saved.image ? [['img', { ...saved.image, style: 'max-width:100%;height:auto;display:block;margin:0 auto 16px' }]] : []),
      ['strong', {}, attrs.title || '请选择资源问题'], ['p', {}, attrs.description],
      ['ul', {}, ...attrs.options.map(option => ['li', {}, option.label])],
    ]
  },
  addNodeView() { return VueNodeViewRenderer(ResourceQuestionNodeView) },
})
