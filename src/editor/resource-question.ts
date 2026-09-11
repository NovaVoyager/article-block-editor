import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import type { ProseMirrorJSON } from './types'

export interface ResourceQuestionData {
  resourceId: string
  title: string
  description: string
  options: { id: string; label: string }[]
}
export interface ResourceQuestionOption {
  id: string
  label: string
  targetAnchorId?: string
}
export interface ResourceQuestionAttrs extends ResourceQuestionData {
  id: string
  options: ResourceQuestionOption[]
  hideFollowing: boolean
  revealKey: string
}
export interface ResourceQuestionPickerScope {
  /** Detached snapshot. Mutating it does not edit the article. */
  current: ResourceQuestionAttrs
  /** Validates and saves a detached snapshot. False means invalid data or a stale picker. */
  select(data: ResourceQuestionData): boolean
  cancel(): void
}
export interface ParagraphTarget {
  pos: number
  anchorId: string | null
  label: string
}
export const newIdentity = (prefix: string) => `${prefix}-${crypto.randomUUID()}`

export function createResourceQuestion(): ProseMirrorJSON {
  const id = newIdentity('question')
  return { type: 'resourceQuestion', attrs: {
    id, resourceId: '', title: '', description: '', options: [], hideFollowing: false, revealKey: id,
  } }
}

/** Pick explicit fields only: API extras never become protocol attributes. */
export function snapshotResourceQuestion(value: ResourceQuestionData): ResourceQuestionData {
  if (!value || typeof value.resourceId !== 'string' || !value.resourceId.trim()
    || typeof value.title !== 'string' || !value.title.trim() || typeof value.description !== 'string'
    || !Array.isArray(value.options) || !value.options.length) {
    throw new Error('资源需包含非空 resourceId、问题名、描述字符串和至少一个选项')
  }
  const ids = new Set<string>()
  const options = value.options.map(option => {
    if (!option || typeof option.id !== 'string' || !option.id.trim()
      || typeof option.label !== 'string' || !option.label.trim() || ids.has(option.id)) {
      throw new Error('选项 ID 必须非空且在问题内唯一，选项文案不能为空')
    }
    ids.add(option.id)
    return { id: option.id, label: option.label }
  })
  return { resourceId: value.resourceId, title: value.title, description: value.description, options }
}

export function findQuestion(doc: PMNode, id: string) {
  let found: { node: PMNode; pos: number } | undefined
  doc.forEach((node, pos) => {
    if (node.type.name === 'resourceQuestion' && node.attrs.id === id) found = { node, pos }
  })
  return found
}

export function paragraphTargets(doc: PMNode): ParagraphTarget[] {
  const targets: ParagraphTarget[] = []
  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      targets.push({ pos, anchorId: node.attrs.anchorId ?? null,
        label: `${targets.length + 1}. ${node.type.name === 'heading' ? `H${node.attrs.level}` : '正文'} · ${node.textContent.trim().slice(0, 70) || '空段落'}` })
    }
  })
  return targets
}

/** Anchor creation and option binding are one undoable transaction. */
export function bindQuestionOption(editor: Editor, questionId: string, optionId: string, targetPos: number | null): boolean {
  if (!editor.isEditable) return false
  const question = findQuestion(editor.state.doc, questionId)
  if (!question) return false
  const attrs = question.node.attrs as ResourceQuestionAttrs
  if (!attrs.options.some(option => option.id === optionId)) return false
  const tr = closeHistory(editor.state.tr)
  let anchorId: string | undefined
  if (targetPos !== null) {
    const target = paragraphTargets(editor.state.doc).find(item => item.pos === targetPos)
    if (!target) return false
    anchorId = target.anchorId || newIdentity('paragraph')
    if (!target.anchorId) tr.setNodeMarkup(targetPos, undefined, { ...tr.doc.nodeAt(targetPos)!.attrs, anchorId })
  }
  const options = attrs.options.map(option => {
    if (option.id !== optionId) return { ...option }
    return { id: option.id, label: option.label, ...(anchorId && { targetAnchorId: anchorId }) }
  })
  editor.view.dispatch(tr.setNodeMarkup(question.pos, undefined, { ...attrs, options }))
  return true
}

/** JSON Schema checks shape; these cross-node identity constraints need a second pass. */
export function resourceIdentityErrors(document: ProseMirrorJSON): string[] {
  const errors: string[] = []
  const anchors = new Set<string>(), questions = new Set<string>(), keys = new Set<string>()
  const unique = (value: unknown, set: Set<string>, path: string) => {
    if (typeof value !== 'string' || !value) return
    if (set.has(value)) errors.push(`${path} 重复标识：${value}`)
    set.add(value)
  }
  const visit = (node: ProseMirrorJSON, path: string) => {
    if (['paragraph', 'heading'].includes(node.type)) unique(node.attrs?.anchorId, anchors, `${path}/attrs/anchorId`)
    if (node.type === 'resourceQuestion') {
      unique(node.attrs?.id, questions, `${path}/attrs/id`)
      unique(node.attrs?.revealKey, keys, `${path}/attrs/revealKey`)
      const optionIds = new Set<string>()
      for (const option of (node.attrs?.options ?? []) as ResourceQuestionOption[]) unique(option.id, optionIds, `${path}/attrs/options/id`)
    }
    node.content?.forEach((child, i) => visit(child, `${path}/content/${i}`))
  }
  visit(document, '')
  return errors
}
