import Ajv, { type ErrorObject } from 'ajv'
import protocolDefinition from '@/protocol/article-content-protocol-v1.json'
import type { ProseMirrorJSON, ValidationResult } from './types'

const ajv = new Ajv({ allErrors: true, strict: false })
const validate = ajv.compile(protocolDefinition.documentSchema)

const textAlignments = new Set(['left', 'center', 'right', 'justify'])
const imageAlignments = new Set(['left', 'center', 'right'])

export function toProtocolJSON(document: ProseMirrorJSON): ProseMirrorJSON {
  return sanitizeNode(document)
}

export function validateProtocolDocument(document: ProseMirrorJSON): ValidationResult {
  const valid = validate(document)
  return {
    valid: Boolean(valid),
    errors: valid ? [] : (validate.errors ?? []).map(formatError),
  }
}

function sanitizeNode(node: ProseMirrorJSON): ProseMirrorJSON {
  if (node.type === 'text') {
    const text: ProseMirrorJSON = { type: 'text', text: node.text ?? '' }
    const marks = (node.marks ?? []).map(sanitizeMark).filter(Boolean)
    if (marks.length) text.marks = marks as NonNullable<ProseMirrorJSON['marks']>
    return text
  }

  const content = (node.content ?? []).map(sanitizeNode)

  switch (node.type) {
    case 'doc':
      return { type: 'doc', content }
    case 'paragraph': {
      const attrs = pickTextAlign(node.attrs)
      return compactContent({ type: 'paragraph', ...(attrs && { attrs }) }, content)
    }
    case 'heading': {
      const level = clampInteger(node.attrs?.level, 1, 6, 2)
      const attrs = { level, ...pickTextAlign(node.attrs) }
      return compactContent({ type: 'heading', attrs }, content)
    }
    case 'blockquote':
    case 'bulletList':
    case 'listItem':
    case 'table':
    case 'tableRow':
    case 'tableCell':
      return { type: node.type, content }
    case 'tableHeader':
      return { type: 'tableCell', content }
    case 'orderedList':
      return {
        type: 'orderedList',
        attrs: { start: clampInteger(node.attrs?.start, 1, Number.MAX_SAFE_INTEGER, 1) },
        content,
      }
    case 'codeBlock': {
      const language = stringValue(node.attrs?.language)
      return compactContent(
        { type: 'codeBlock', attrs: language ? { language: language.toLowerCase() } : {} },
        content,
      )
    }
    case 'horizontalRule':
      return { type: 'horizontalRule' }
    case 'image':
      return { type: 'image', attrs: sanitizeImageAttrs(node.attrs) }
    case 'articleButton':
      return { type: 'articleButton', attrs: sanitizeButtonAttrs(node.attrs) }
    default:
      return compactContent({ type: node.type }, content)
  }
}

function sanitizeMark(mark: { type: string; attrs?: Record<string, unknown> }) {
  if (['bold', 'italic', 'strike', 'underline', 'code'].includes(mark.type)) {
    return { type: mark.type }
  }
  if (mark.type !== 'link') return null

  const attrs = mark.attrs ?? {}
  const type = attrs.type === 'custom' ? 'custom' : 'href'
  const target = attrs.target === '_self' ? '_self' : '_blank'

  if (type === 'custom') {
    return {
      type: 'link',
      attrs: {
        type,
        id: stringValue(attrs.id),
        title: stringValue(attrs.title),
        target,
      },
    }
  }

  return {
    type: 'link',
    attrs: { type, href: stringValue(attrs.href), target },
  }
}

function sanitizeImageAttrs(attrs: Record<string, unknown> = {}) {
  const result: Record<string, unknown> = { src: stringValue(attrs.src) }
  addOptionalString(result, 'alt', attrs.alt, true)
  addOptionalString(result, 'title', attrs.title, true)
  addOptionalInteger(result, 'width', attrs.width, 1, 10000)
  addOptionalInteger(result, 'height', attrs.height, 1, 10000)
  if (imageAlignments.has(String(attrs.imageAlign))) result.imageAlign = attrs.imageAlign
  return result
}

function sanitizeButtonAttrs(attrs: Record<string, unknown> = {}) {
  const style = ['text', 'button', 'link'].includes(String(attrs.style))
    ? String(attrs.style)
    : 'button'
  const result: Record<string, unknown> = {
    text: stringValue(attrs.text),
    style,
  }
  addOptionalString(result, 'title', attrs.title)
  addOptionalString(result, 'id', attrs.id)
  if (style === 'link') addOptionalString(result, 'href', attrs.href)
  return result
}

function pickTextAlign(attrs: Record<string, unknown> = {}) {
  const textAlign = String(attrs.textAlign ?? '')
  return textAlignments.has(textAlign) ? { textAlign } : undefined
}

function compactContent(node: ProseMirrorJSON, content: ProseMirrorJSON[]) {
  return content.length ? { ...node, content } : node
}

function addOptionalString(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
  allowEmpty = false,
) {
  if (typeof value === 'string' && (allowEmpty || value.length > 0)) target[key] = value
}

function addOptionalInteger(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
  minimum: number,
  maximum: number,
) {
  const parsed = typeof value === 'string' && value !== '' ? Number(value) : value
  if (typeof parsed === 'number' && Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum) {
    target[key] = parsed
  }
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(maximum, Math.max(minimum, parsed))
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function formatError(error: ErrorObject) {
  const path = error.instancePath || '/'
  if (error.keyword === 'additionalProperties') {
    return `${path} 不允许字段 “${String(error.params.additionalProperty)}”`
  }
  return `${path} ${error.message ?? '不符合协议'}`
}
