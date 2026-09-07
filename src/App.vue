<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import type { Editor as CoreEditor } from '@tiptap/core'
import { DragHandle } from '@tiptap/extension-drag-handle-vue-3'
import { CheckCircle2, GripVertical, ShieldCheck, TriangleAlert } from '@lucide/vue'
import EditorToolbar from '@/components/EditorToolbar.vue'
import InspectorPanel from '@/components/InspectorPanel.vue'
import JsonPanel from '@/components/JsonPanel.vue'
import LinkDialog from '@/components/LinkDialog.vue'
import ModuleLibrary from '@/components/ModuleLibrary.vue'
import { createProtocolExtensions } from '@/editor/extensions'
import { editorModules, initialDocument } from '@/editor/modules'
import {
  deleteNode,
  duplicateNode,
  getSelectedNode,
  moveTopLevelNode,
  selectNode,
  updateNodeAttrs,
} from '@/editor/selection'
import { toProtocolJSON, validateProtocolDocument } from '@/editor/protocol'
import type { ProseMirrorJSON, SelectedNode, ValidationResult } from '@/editor/types'

const STORAGE_KEY = 'article-studio.protocol-v1.document'

const selected = shallowRef<SelectedNode | null>(null)
const validation = ref<ValidationResult>({ valid: true, errors: [] })
const jsonText = ref('')
const jsonOpen = ref(false)
const linkOpen = ref(false)
const preview = ref(false)
const dragActive = ref(false)
const hoveredDragPos = ref<number | null>(null)
const device = ref<'mobile' | 'tablet' | 'desktop'>('desktop')
const toast = ref<{ message: string; tone: 'success' | 'error' } | null>(null)
let toastTimer: number | undefined

const editor = useEditor({
  extensions: createProtocolExtensions(),
  content: loadInitialDocument(),
  autofocus: false,
  editorProps: {
    attributes: {
      class: 'article-editor',
      spellcheck: 'true',
      'aria-label': '文章内容画布',
    },
  },
  onCreate: ({ editor }) => refreshEditorState(editor),
  onSelectionUpdate: ({ editor }) => refreshEditorState(editor),
  onUpdate: ({ editor }) => refreshEditorState(editor),
  onTransaction: ({ editor }) => {
    selected.value = getSelectedNode(editor)
  },
})

const editorInstance = computed(() => editor.value ?? null)
const topLevelCount = computed(() => editor.value?.state.doc.childCount ?? 0)
const characterCount = computed(() => editor.value?.state.doc.textContent.length ?? 0)
const wordCount = computed(() => {
  const text = editor.value?.state.doc.textContent.trim() ?? ''
  if (!text) return 0
  const chinese = text.match(/[\u3400-\u9fff]/g)?.length ?? 0
  const otherWords = text.replace(/[\u3400-\u9fff]/g, ' ').match(/[\p{L}\p{N}]+/gu)?.length ?? 0
  return chinese + otherWords
})
const currentLinkAttrs = computed(() => editor.value?.getAttributes('link') ?? {})

watch(preview, (isPreview) => editor.value?.setEditable(!isPreview))

onBeforeUnmount(() => {
  if (toastTimer) window.clearTimeout(toastTimer)
})

function loadInitialDocument(): ProseMirrorJSON {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved) return initialDocument
  try {
    const document = JSON.parse(saved) as ProseMirrorJSON
    return validateProtocolDocument(document).valid ? document : initialDocument
  } catch {
    return initialDocument
  }
}

function refreshEditorState(currentEditor: CoreEditor | null | undefined = editor.value) {
  if (!currentEditor) return
  selected.value = getSelectedNode(currentEditor)
  const document = toProtocolJSON(currentEditor.getJSON() as ProseMirrorJSON)
  validation.value = validateProtocolDocument(document)
  jsonText.value = JSON.stringify(document, null, 2)
}

function insertModule(node: ProseMirrorJSON) {
  if (!editor.value || preview.value) return
  editor.value.chain().focus().insertContent(node).run()
  showToast('模块已插入', 'success')
}

function handleCanvasDrop(event: DragEvent) {
  dragActive.value = false
  const currentEditor = editor.value
  const serialized = event.dataTransfer?.getData('application/x-article-node')
  if (!currentEditor || !serialized || preview.value) return

  event.preventDefault()
  try {
    const json = JSON.parse(serialized) as ProseMirrorJSON
    const node = currentEditor.schema.nodeFromJSON(json)
    const coordinates = currentEditor.view.posAtCoords({ left: event.clientX, top: event.clientY })
    let position = coordinates?.pos ?? currentEditor.state.doc.content.size
    const resolved = currentEditor.state.doc.resolve(position)
    if (resolved.depth > 0) position = resolved.before(1)

    currentEditor.view.dispatch(currentEditor.state.tr.insert(position, node).scrollIntoView())
    selectNode(currentEditor, position)
    showToast('模块已放入画布', 'success')
  } catch (error) {
    showToast(error instanceof Error ? error.message : '无法插入该模块', 'error')
  }
}

function patchSelectedNode(attributes: Record<string, unknown>) {
  if (!editor.value || !selected.value) return
  updateNodeAttrs(editor.value, selected.value, attributes)
}

function moveSelectedNode(direction: -1 | 1) {
  if (!editor.value || !selected.value) return
  moveTopLevelNode(editor.value, selected.value, direction)
}

function duplicateSelectedNode() {
  if (!editor.value || !selected.value) return
  duplicateNode(editor.value, selected.value)
  showToast('模块已复制', 'success')
}

function removeSelectedNode() {
  if (!editor.value || !selected.value) return
  deleteNode(editor.value, selected.value)
  showToast('模块已删除', 'success')
}

function runTableCommand(command: string) {
  const currentEditor = editor.value
  if (!currentEditor) return
  const chain = currentEditor.chain().focus()
  if (command === 'addRowAfter') chain.addRowAfter().run()
  if (command === 'addColumnAfter') chain.addColumnAfter().run()
  if (command === 'deleteRow') chain.deleteRow().run()
  if (command === 'deleteColumn') chain.deleteColumn().run()
}

function saveDocument() {
  if (!editor.value) return
  const document = toProtocolJSON(editor.value.getJSON() as ProseMirrorJSON)
  const result = validateProtocolDocument(document)
  validation.value = result
  if (!result.valid) {
    jsonOpen.value = true
    showToast('协议校验未通过，请检查 JSON', 'error')
    return
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(document))
  showToast('已保存到浏览器本地', 'success')
}

function openJsonPanel() {
  refreshEditorState()
  jsonOpen.value = true
}

function applyJson(value: string) {
  if (!editor.value) return
  try {
    const document = JSON.parse(value) as ProseMirrorJSON
    const result = validateProtocolDocument(document)
    validation.value = result
    if (!result.valid) {
      jsonText.value = value
      showToast('JSON 不符合 Article Protocol v1', 'error')
      return
    }
    editor.value.commands.setContent(document)
    jsonOpen.value = false
    showToast('JSON 已应用到画布', 'success')
  } catch (error) {
    validation.value = {
      valid: false,
      errors: [error instanceof Error ? error.message : 'JSON 解析失败'],
    }
    jsonText.value = value
    showToast('JSON 格式有误', 'error')
  }
}

function openLinkDialog() {
  if (!editor.value || preview.value) return
  linkOpen.value = true
}

function applyLink(attributes: Record<string, unknown>) {
  editor.value?.chain().focus().extendMarkRange('link').setMark('link', attributes).run()
  linkOpen.value = false
}

function removeLink() {
  editor.value?.chain().focus().extendMarkRange('link').unsetMark('link').run()
  linkOpen.value = false
}

function handleDragNodeChange(payload: { pos: number | null }) {
  hoveredDragPos.value = typeof payload.pos === 'number' ? payload.pos : null
}

function selectHoveredNode() {
  if (editor.value && hoveredDragPos.value !== null) selectNode(editor.value, hoveredDragPos.value)
}

function showToast(message: string, tone: 'success' | 'error') {
  toast.value = { message, tone }
  if (toastTimer) window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (toast.value = null), 2400)
}
</script>

<template>
  <div class="app-shell" :class="{ 'preview-mode': preview }">
    <EditorToolbar
      :editor="editorInstance"
      :preview="preview"
      :device="device"
      :document-valid="validation.valid"
      @save="saveDocument"
      @open-json="openJsonPanel"
      @open-link="openLinkDialog"
      @toggle-preview="preview = !preview"
      @device="device = $event"
    />

    <main class="workspace">
      <ModuleLibrary :modules="editorModules" @insert="insertModule" />

      <section class="canvas-column">
        <div class="canvas-meta">
          <div>
            <span class="eyebrow">CANVAS</span>
            <strong>文章内容</strong>
          </div>
          <div class="canvas-status">
            <span>{{ device === 'mobile' ? '390 px' : device === 'tablet' ? '768 px' : '960 px' }}</span>
            <span class="validation-badge" :class="{ error: !validation.valid }">
              <ShieldCheck v-if="validation.valid" :size="14" />
              <TriangleAlert v-else :size="14" />
              {{ validation.valid ? '协议有效' : `${validation.errors.length} 个问题` }}
            </span>
          </div>
        </div>

        <div class="canvas-scroll">
          <div
            class="device-canvas"
            :class="[`device-${device}`, { 'drop-active': dragActive, 'is-preview': preview }]"
            @dragenter.prevent="dragActive = true"
            @dragover.prevent
            @dragleave.self="dragActive = false"
            @drop="handleCanvasDrop"
          >
            <div v-if="preview" class="preview-ribbon">只读预览</div>
            <DragHandle
              v-if="editor && !preview"
              :editor="editor"
              :compute-position-config="{ placement: 'left-start', strategy: 'absolute' }"
              @node-change="handleDragNodeChange"
            >
              <button class="global-drag-handle" type="button" title="拖动排序" @click="selectHoveredNode">
                <GripVertical :size="18" />
              </button>
            </DragHandle>
            <EditorContent :editor="editor" />
            <div v-if="topLevelCount === 0" class="empty-canvas">
              <strong>从左侧添加第一个模块</strong>
              <span>点击或拖放均可</span>
            </div>
          </div>
        </div>

        <footer class="canvas-footer">
          <span>{{ wordCount }} 字词</span>
          <span>{{ characterCount }} 字符</span>
          <span>{{ topLevelCount }} 个顶层模块</span>
          <span class="autosave-note"><span class="status-dot" /> 本地草稿</span>
        </footer>
      </section>

      <InspectorPanel
        :selected="selected"
        :top-level-count="topLevelCount"
        @patch="patchSelectedNode"
        @move="moveSelectedNode"
        @duplicate="duplicateSelectedNode"
        @remove="removeSelectedNode"
        @table-command="runTableCommand"
      />
    </main>

    <JsonPanel
      :open="jsonOpen"
      :value="jsonText"
      :valid="validation.valid"
      :errors="validation.errors"
      @close="jsonOpen = false"
      @apply="applyJson"
    />

    <LinkDialog
      :open="linkOpen"
      :attributes="currentLinkAttrs"
      @close="linkOpen = false"
      @apply="applyLink"
      @remove="removeLink"
    />

    <Transition name="toast">
      <div v-if="toast" class="toast-message" :class="toast.tone">
        <CheckCircle2 v-if="toast.tone === 'success'" :size="18" />
        <TriangleAlert v-else :size="18" />
        {{ toast.message }}
      </div>
    </Transition>
  </div>
</template>
