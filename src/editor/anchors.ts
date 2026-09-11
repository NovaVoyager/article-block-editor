import { Extension } from '@tiptap/core'
import { Fragment, Slice, type Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Mapping } from '@tiptap/pm/transform'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { newIdentity } from './resource-question'

export const anchorHighlightKey = new PluginKey<string | null>('articleAnchorHighlight')

/** Copies are new article instances; their navigation still points to original targets. */
export function copyWithFreshIdentities(node: PMNode): PMNode {
  if (node.isText) return node
  const attrs = { ...node.attrs }
  if (attrs.anchorId) attrs.anchorId = newIdentity('paragraph')
  if (node.type.name === 'resourceQuestion') {
    attrs.id = newIdentity('question')
    attrs.revealKey = attrs.id
  }
  const children: PMNode[] = []
  node.forEach(child => children.push(copyWithFreshIdentities(child)))
  return node.type.create(attrs, Fragment.fromArray(children), node.marks)
}

export const ParagraphAnchors = Extension.create({
  name: 'paragraphAnchors',
  addGlobalAttributes() {
    return [{ types: ['paragraph', 'heading'], attributes: {
      anchorId: {
        default: null,
        keepOnSplit: false,
        parseHTML: element => element.getAttribute('data-anchor-id') || null,
        renderHTML: attrs => attrs.anchorId ? { 'data-anchor-id': attrs.anchorId } : {},
      },
    } }]
  },
  addProseMirrorPlugins() {
    return [new Plugin<string | null>({
      key: anchorHighlightKey,
      state: {
        init: () => null,
        apply: (tr, previous) => tr.getMeta(anchorHighlightKey) !== undefined ? tr.getMeta(anchorHighlightKey) : previous,
      },
      props: {
        decorations(state) {
          const id = anchorHighlightKey.getState(state)
          if (!id) return DecorationSet.empty
          const decorations: Decoration[] = []
          state.doc.descendants((node, pos) => {
            if (node.attrs.anchorId === id) decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'anchor-target-highlight' }))
          })
          return DecorationSet.create(state.doc, decorations)
        },
      },
    }), new Plugin({
      key: new PluginKey('articleIdentities'),
      props: {
        transformPasted(slice, view) {
          // ProseMirror also calls this hook during internal drag/drop. A move
          // keeps identities; drag-copy collisions are repaired after insertion.
          if (view.dragging) return slice
          const children: PMNode[] = []
          slice.content.forEach(node => children.push(copyWithFreshIdentities(node)))
          return new Slice(Fragment.fromArray(children), slice.openStart, slice.openEnd)
        },
      },
      appendTransaction(transactions, oldState, state) {
        if (!transactions.some(tr => tr.docChanged)) return null
        const mapping = new Mapping()
        transactions.forEach(tr => mapping.appendMapping(tr.mapping))
        const tr = state.tr
        // Prefer the surviving original, even when a duplicate was inserted before it.
        for (const field of ['anchorId', 'id', 'revealKey'] as const) {
          const eligible = (node: PMNode) => field === 'anchorId'
            ? ['paragraph', 'heading'].includes(node.type.name)
            : node.type.name === 'resourceQuestion'
          const previous = new Map<string, { node: PMNode; pos: number }>()
          oldState.doc.descendants((node, pos) => {
            if (eligible(node) && node.attrs[field]) previous.set(node.attrs[field], { node, pos })
          })
          const groups = new Map<string, { node: PMNode; pos: number }[]>()
          tr.doc.descendants((node, pos) => {
            if (!eligible(node)) return
            const value = node.attrs[field] as string | null
            if (!value) {
              if (field !== 'anchorId') tr.setNodeMarkup(pos, undefined, { ...tr.doc.nodeAt(pos)!.attrs, [field]: newIdentity('question') })
              return
            }
            const group = groups.get(value) ?? []
            group.push({ node, pos })
            groups.set(value, group)
          })
          for (const [value, group] of groups) {
            if (group.length < 2) continue
            const original = previous.get(value)
            const mapped = original ? mapping.mapResult(original.pos, 1) : undefined
            const keeper = group.find(item => mapped && !mapped.deleted && item.pos === mapped.pos)
              ?? group.find(item => item.node === original?.node) ?? group[0]
            for (const item of group) {
              if (item === keeper) continue
              tr.setNodeMarkup(item.pos, undefined, {
                ...tr.doc.nodeAt(item.pos)!.attrs,
                [field]: newIdentity(field === 'anchorId' ? 'paragraph' : 'question'),
              })
            }
          }
        }
        return tr.docChanged ? tr : null
      },
    })]
  },
})
