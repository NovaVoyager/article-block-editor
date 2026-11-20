import type { ProseMirrorJSON } from '../editor/types'

export const businessComponents = [
  { id: 'articleButton', nodeType: 'articleButton' },
  { id: 'resourceQuestion', nodeType: 'resourceQuestion' },
  { id: 'app', nodeType: 'appGameCard', kind: 'app' },
  { id: 'game', nodeType: 'appGameCard', kind: 'game' },
] as const

export type BusinessComponentId = typeof businessComponents[number]['id']

/** Collect business component types in first-appearance order, including nested blocks. */
export function getUsedComponents(document: ProseMirrorJSON): BusinessComponentId[] {
  const used = new Set<BusinessComponentId>()
  function visit(node: ProseMirrorJSON) {
    if (node.type === 'text') return
    const component = businessComponents.find(definition => definition.nodeType === node.type
      && (!('kind' in definition) || definition.kind === node.attrs?.kind))
    if (component) used.add(component.id)
    node.content?.forEach(visit)
  }
  visit(document)
  return [...used]
}
