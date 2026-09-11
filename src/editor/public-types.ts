import type { ProseMirrorJSON, ValidationResult } from './types'

export interface ImageUploadResult {
  src: string
  alt?: string
  title?: string
  width?: number
  height?: number
}

export interface ImageUploadContext {
  /** Aborted when the target is removed, the document changes, or the editor becomes readonly/unmounts. */
  signal: AbortSignal
}

export type ImageUploadHandler = (file: File, context: ImageUploadContext) => Promise<string | ImageUploadResult>

export interface ArticleEditorProps {
  /** Protocol JSON. Omit for an empty, uncontrolled editor. */
  modelValue?: ProseMirrorJSON
  readonly?: boolean
  /** Number in pixels or a CSS height (percentage requires a sized parent). */
  height?: number | string
  showToolbar?: boolean
  showLibrary?: boolean
  showInspector?: boolean
  /** Upload to your own service and return a persistent image URL or image attributes. */
  uploadImage?: ImageUploadHandler
  /** Maximum size per image in bytes. Default 10 MiB. */
  maxImageSize?: number
}

export interface ArticleEditorError {
  source: 'modelValue' | 'setContent' | 'json' | 'save' | 'upload' | 'protocol' | 'resourceQuestion'
  message: string
  errors: string[]
  fileName?: string
}

export interface ArticleEditorExpose {
  /** Returns a detached JSON snapshot. */
  getJSON(): ProseMirrorJSON
  /** Host-driven replacement. Validates first, resets undo history, works in readonly mode. */
  setContent(document: ProseMirrorJSON): boolean
  clear(): boolean
  focus(): void
  validate(): ValidationResult
  /** Locate and highlight an anchor in this editor only. False for a missing target. */
  scrollToAnchor(anchorId: string): boolean
}
