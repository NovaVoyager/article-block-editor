import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { closeHistory } from '@tiptap/pm/history'
import type { ProseMirrorJSON } from './types'
import type { ImageUploadResult } from './public-types'
import imageSchema from '../protocol/resource-question-image-v1.schema.json'
import Ajv from 'ajv'

export type ResourceQuestionImage = ImageUploadResult
const checkImage = new Ajv({ strict: false }).compile(imageSchema)

/** Keep only persistent protocol fields; never retain the host's object reference. */
export function snapshotQuestionImage(value: ResourceQuestionImage): ResourceQuestionImage {
  if (!value || typeof value !== 'object') throw new Error('问题图片需包含有效的图片地址 src')
  const image: ResourceQuestionImage = { src: value.src }
  for (const key of ['alt', 'title', 'width', 'height'] as const) {
    if (value[key] !== undefined) Object.assign(image, { [key]: value[key] })
  }
  if (!checkImage(image)) throw new Error('问题图片地址或尺寸无效，请使用持久的 HTTP(S) / 相对图片地址')
  return image
}

export interface ResourceQuestionData {
  resourceId: string
  title: string
  description: string
  /** Optional snapshot above the title. Omit/null to select a resource without an image. */
  image?: ResourceQuestionImage | null
  options: { id: string; label: string }[]
}
export interface ResourceQuestionOption {
  id: string
  label: string
  /** New bindings equal id; legacy documents may reference a different anchor. */
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
  const image = value.image == null ? undefined : snapshotQuestionImage(value.image)
  return { resourceId: value.resourceId, title: value.title, description: value.description, options, ...(image && { image }) }
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

/** New bindings use the external option ID as the anchor; legacy JSON is not migrated on load. */
export function bindQuestionOption(editor: Editor, questionId: string, optionId: string, targetPos: number | null, onError?: (message: string) => void): boolean {
  const fail = (message: string) => { onError?.(message); return false }
  if (editor.isDestroyed || !editor.isEditable) return false
  const question = findQuestion(editor.state.doc, questionId)
  if (!question) return fail('问题已不存在，请重新选择')
  const attrs = question.node.attrs as ResourceQuestionAttrs
  if (!attrs.options.some(option => option.id === optionId)) return fail('选项已不存在，请重新选择资源')

  const references: { questionId: string; option: ResourceQuestionOption }[] = []
  editor.state.doc.forEach(node => {
    if (node.type.name !== 'resourceQuestion') return
    for (const option of (node.attrs as ResourceQuestionAttrs).options) references.push({ questionId: node.attrs.id, option })
  })
  const otherReferences = (anchor: string) => references.filter(item => item.option.targetAnchorId === anchor
    && !(item.questionId === questionId && item.option.id === optionId))

  let anchorId: string | undefined
  let renameFrom: string | null = null
  const tr = closeHistory(editor.state.tr)
  if (targetPos !== null) {
    const targets = paragraphTargets(editor.state.doc)
    const target = targets.find(item => item.pos === targetPos)
    if (!target) return fail('目标已变化，请重新选择段落')
    anchorId = optionId
    const existing = targets.find(item => item.anchorId === optionId)
    if (existing?.pos !== targetPos && otherReferences(optionId).length) {
      return fail(`选项 ID「${optionId}」已被其他问题的跳转引用，不能绑定到另一段落。请使用原目标或先清除冲突绑定。`)
    }
    if (target.anchorId && target.anchorId !== optionId
      && otherReferences(target.anchorId).some(item => item.option.id !== optionId)) {
      return fail('目标段落已绑定其他 ID 的选项，不能覆盖其锚点。请换一个段落或先清除冲突绑定。')
    }
    // Relocating an unshared option anchor must not create a duplicate ID.
    // Keep the old paragraph's content; old UUID anchors remain unless renamed in place.
    if (existing && existing.pos !== targetPos) {
      tr.setNodeMarkup(existing.pos, undefined, { ...tr.doc.nodeAt(existing.pos)!.attrs, anchorId: null })
    }
    if (target.anchorId !== optionId) {
      renameFrom = target.anchorId
      tr.setNodeMarkup(targetPos, undefined, { ...tr.doc.nodeAt(targetPos)!.attrs, anchorId })
    }
  }

  editor.state.doc.forEach((node, pos) => {
    if (node.type.name !== 'resourceQuestion') return
    const current = node.attrs as ResourceQuestionAttrs
    let changed = false
    const options = current.options.map(option => {
      const selected = current.id === questionId && option.id === optionId
      // Copies of a question may share the same option ID and old target. Keep
      // those links pointing at the same paragraph when its legacy anchor is renamed.
      if (!selected && !(renameFrom && option.targetAnchorId === renameFrom)) return option
      if (option.targetAnchorId === anchorId) return option
      changed = true
      return { id: option.id, label: option.label, ...(anchorId && { targetAnchorId: anchorId }) }
    })
    if (changed) tr.setNodeMarkup(pos, undefined, { ...current, options })
  })
  if (tr.docChanged) {
    editor.view.dispatch(tr)
    editor.view.dispatch(closeHistory(editor.state.tr))
  }
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
