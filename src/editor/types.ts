import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export interface MarkJSON {
  type: string
  attrs?: Record<string, unknown>
}

export interface ProseMirrorJSON {
  type: string
  attrs?: Record<string, unknown>
  content?: ProseMirrorJSON[]
  marks?: MarkJSON[]
  text?: string
}

export interface SelectedNode {
  node: ProseMirrorNode
  pos: number
  depth: number
  topLevelIndex: number
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export interface EditorModule {
  type: string
  title: string
  description: string
  icon: string
  group: 'basic' | 'structure'
  create: () => ProseMirrorJSON
}
