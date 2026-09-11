<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import type { Editor as CoreEditor } from '@tiptap/core'
import { DragHandle } from '@tiptap/extension-drag-handle-vue-3'
import { CheckCircle2, GripVertical, ShieldCheck, TriangleAlert } from '@lucide/vue'
import EditorToolbar from './components/EditorToolbar.vue'
import InspectorPanel from './components/InspectorPanel.vue'
import JsonPanel from './components/JsonPanel.vue'
import LinkDialog from './components/LinkDialog.vue'
import ModuleLibrary from './components/ModuleLibrary.vue'
import ImageFilePicker from './components/ImageFilePicker.vue'
import ResourceQuestionPicker from './components/ResourceQuestionPicker.vue'
import { anchorHighlightKey } from './editor/anchors'
import { closeHistory } from '@tiptap/pm/history'
import { bindQuestionOption, findQuestion, paragraphTargets, snapshotResourceQuestion, type ParagraphTarget, type ResourceQuestionAttrs, type ResourceQuestionPickerScope } from './editor/resource-question'
import { createImageUploadManager, DEFAULT_MAX_IMAGE_SIZE } from './editor/image-upload'
import { nextImagePosition, pairWithNextImage } from './editor/image-layout'
import { createProtocolExtensions } from './editor/extensions'
import { applyTableCommand, getTableContext, type TableCommand, type TableContext } from './editor/table'
import { editorModules } from './editor/modules'
import { createEmptyDocument, replaceEditorDocument } from './editor/document'
import type { ArticleEditorError, ArticleEditorExpose, ArticleEditorProps } from './editor/public-types'
import {
  deleteNode,
  duplicateNode,
  getSelectedNode,
  moveTopLevelNode,
  selectNode,
  updateNodeAttrs,
} from './editor/selection'
import { toProtocolJSON, validateProtocolDocument } from './editor/protocol'
import { downloadProtocolDefinition } from './editor/protocol-download'
import type { ProseMirrorJSON, SelectedNode, ValidationResult } from './editor/types'

const props = withDefaults(defineProps<ArticleEditorProps>(), {
  readonly: false,
  height: 780,
  showToolbar: true,
  showLibrary: true,
  showInspector: true,
  maxImageSize: DEFAULT_MAX_IMAGE_SIZE,
})
const emit = defineEmits<{
  'update:modelValue': [document: ProseMirrorJSON]
  change: [document: ProseMirrorJSON]
  save: [document: ProseMirrorJSON]
  ready: [api: ArticleEditorExpose]
  validation: [result: ValidationResult]
  error: [error: ArticleEditorError]
}>()
defineSlots<{ 'resource-question-picker'(scope: ResourceQuestionPickerScope): unknown }>()

const rootElement = ref<HTMLElement>()
const targets = shallowRef<ParagraphTarget[]>([])
const pickerSession = shallowRef<ResourceQuestionPickerScope | null>(null)
const pickerError = ref('')
let highlightTimer: number | undefined
const selected = shallowRef<SelectedNode | null>(null)
const selectedTable = shallowRef<TableContext | null>(null)
const validation = ref<ValidationResult>({ valid: true, errors: [] })
const jsonText = ref('')
const jsonOpen = ref(false)
const linkOpen = ref(false)
const preview = ref(false)
const isReadonly = computed(() => props.readonly || preview.value)
const rootStyle = computed(() => ({ height: typeof props.height === 'number' ? `${props.height}px` : props.height }))
const dragActive = ref(false)
const fileDragActive = ref(false)
const uploadCount = ref(0)
let imageUploads: ReturnType<typeof createImageUploadManager> | undefined
const hoveredDragPos = ref<number | null>(null)
const device = ref<'mobile' | 'tablet' | 'desktop'>('desktop')
const toast = ref<{ message: string; tone: 'success' | 'error' } | null>(null)
let toastTimer: number | undefined
let applyingExternal = false

const editor = useEditor({
  extensions: createProtocolExtensions({ onChoose: openResourcePicker, onNavigate: navigateAnchor }),
  content: createEmptyDocument(),
  editable: !isReadonly.value,
  injectCSS: false,
  autofocus: false,
  editorProps: {
    attributes: {
      class: 'article-editor',
      spellcheck: 'true',
      'aria-label': '文章内容画布',
    },
  },
  onCreate: ({ editor }) => {
    replaceContent(props.modelValue ?? createEmptyDocument(), 'modelValue', false, editor)
    refreshEditorState(editor)
    emit('ready', api)
  },
  onSelectionUpdate: ({ editor }) => { refreshSelection(editor) },
  onUpdate: ({ editor }) => {
    refreshEditorState(editor)
    if (!applyingExternal) emitDocument(editor)
  },
  onTransaction: ({ editor }) => {
    refreshSelection(editor)
  },
})

const editorInstance = computed(() => editor.value ?? null)
const canPairNextImage = computed(() => Boolean(editor.value && selected.value?.node.type.name === 'image'
  && nextImagePosition(editor.value, selected.value.pos) !== null))
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

watch(isReadonly, (value) => {
  editor.value?.setEditable(!value, false)
  if (value) {
    closeResourcePicker()
    linkOpen.value = false
    fileDragActive.value = false
    imageUploads?.cancelAll()
  }
})
watch(() => props.modelValue, (value) => {
  if (editor.value) replaceContent(value ?? createEmptyDocument(), 'modelValue', false)
}, { deep: true })

onBeforeUnmount(() => {
  closeResourcePicker()
  imageUploads?.destroy()
  if (toastTimer) window.clearTimeout(toastTimer)
  if (highlightTimer) window.clearTimeout(highlightTimer)
})

function emitDocument(currentEditor: CoreEditor) {
  emit('update:modelValue', toProtocolJSON(currentEditor.getJSON() as ProseMirrorJSON))
  emit('change', toProtocolJSON(currentEditor.getJSON() as ProseMirrorJSON))
}

function reportError(source: ArticleEditorError['source'], error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  emit('error', { source, message, errors: message.split('\n') })
  showToast('内容未应用：协议校验失败', 'error')
}

function replaceContent(value: ProseMirrorJSON, source: ArticleEditorError['source'], notify = true, currentEditor: CoreEditor | undefined = editor.value): boolean {
  if (!currentEditor || currentEditor.isDestroyed) return false
  applyingExternal = true
  try {
    const changed = replaceEditorDocument(currentEditor, value, () => { imageUploads?.cancelAll(); closeResourcePicker() })
    refreshEditorState(currentEditor)
    if (changed && notify) emitDocument(currentEditor)
    return true
  } catch (error) {
    reportError(source, error)
    return false
  } finally {
    applyingExternal = false
  }
}

function refreshSelection(currentEditor: CoreEditor) {
  selected.value = getSelectedNode(currentEditor)
  selectedTable.value = getTableContext(currentEditor)
  targets.value = paragraphTargets(currentEditor.state.doc)
  if (pickerSession.value && !findQuestion(currentEditor.state.doc, pickerSession.value.current.id)) closeResourcePicker()
}

function refreshEditorState(currentEditor: CoreEditor | null | undefined = editor.value) {
  if (!currentEditor) return
  refreshSelection(currentEditor)
  const document = toProtocolJSON(currentEditor.getJSON() as ProseMirrorJSON)
  validation.value = validateProtocolDocument(document)
  jsonText.value = JSON.stringify(document, null, 2)
  emit('validation', { valid: validation.value.valid, errors: [...validation.value.errors] })
}

function insertModule(node: ProseMirrorJSON) {
  if (!editor.value || isReadonly.value) return
  if (node.type === 'resourceQuestion') {
    const { $to } = editor.value.state.selection
    const pos = $to.depth ? $to.after(1) : $to.pos
    editor.value.view.dispatch(closeHistory(editor.value.state.tr).insert(pos, editor.value.schema.nodeFromJSON(node)).scrollIntoView())
    selectNode(editor.value, pos)
    showToast('资源问题已插入，请选择资源', 'success')
    return
  }
  editor.value.chain().focus().insertContent(node).run()
  showToast('模块已插入', 'success')
}

function downloadProtocol() {
  try {
    downloadProtocolDefinition()
    showToast('已发起协议下载（含当前扩展）', 'success')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    emit('error', { source: 'protocol', message, errors: [message] })
    showToast('协议下载失败，请重试或检查浏览器下载设置', 'error')
  }
}

function uploadManager() {
  const currentEditor = editor.value
  if (!currentEditor || currentEditor.isDestroyed) return
  return imageUploads ??= createImageUploadManager(currentEditor, {
    getHandler: () => props.uploadImage,
    getMaximum: () => props.maxImageSize,
    isReadonly: () => isReadonly.value,
    onPending: (count) => { uploadCount.value = count },
    onError: (message, file) => {
      emit('error', { source: 'upload', message, errors: [message], fileName: file.name })
      showToast(`${file.name}：${message}`, 'error')
    },
  })
}

function insertUploadedImages(files: File[]) {
  if (!editor.value || isReadonly.value) return
  const resolved = editor.value.state.selection.$to
  const pos = resolved.depth > 0 ? resolved.after(1) : resolved.pos
  void uploadManager()?.upload(files, { kind: 'insert', pos })
}

function replaceSelectedImage(files: File[]) {
  if (!selected.value || selected.value.node.type.name !== 'image' || isReadonly.value) return
  void uploadManager()?.upload(files, { kind: 'replace', pos: selected.value.pos })
}

function isFileDrag(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files') || Boolean(event.dataTransfer?.files.length)
}

function handleFileDragOver(event: DragEvent) {
  if (!isFileDrag(event)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = isReadonly.value ? 'none' : 'copy'
  fileDragActive.value = !isReadonly.value
}

function handleFileDragLeave(event: DragEvent) {
  const area = event.currentTarget as HTMLElement
  if (!(event.relatedTarget instanceof Node) || !area.contains(event.relatedTarget)) fileDragActive.value = false
}

function handleFileDrop(event: DragEvent) {
  if (!isFileDrag(event)) return
  // Consume external files before ProseMirror/native browser HTML or file navigation.
  event.preventDefault()
  event.stopPropagation()
  fileDragActive.value = false
  dragActive.value = false
  const currentEditor = editor.value
  if (!currentEditor || isReadonly.value) return
  const files = Array.from(event.dataTransfer?.files ?? [])
  const coordinates = currentEditor.view.posAtCoords({ left: event.clientX, top: event.clientY })
  const resolved = currentEditor.state.doc.resolve(coordinates?.pos ?? currentEditor.state.doc.content.size)
  const pos = resolved.depth > 0 ? resolved.before(1) : resolved.pos
  void uploadManager()?.upload(files, { kind: 'insert', pos })
}

function handleCanvasDrop(event: DragEvent) {
  dragActive.value = false
  const currentEditor = editor.value
  const serialized = event.dataTransfer?.getData('application/x-article-node')
  if (!serialized) return
  // Capture library drops before ProseMirror's native text/HTML drop handler.
  event.preventDefault()
  event.stopPropagation()
  if (!currentEditor || isReadonly.value) return
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
  if (!editor.value || !selected.value || isReadonly.value) return
  if (selected.value.node.type.name === 'resourceQuestion') {
    const tr = closeHistory(editor.value.state.tr).setNodeMarkup(selected.value.pos, undefined, { ...selected.value.node.attrs, ...attributes })
    const result = validateProtocolDocument(toProtocolJSON(tr.doc.toJSON() as ProseMirrorJSON))
    if (!result.valid) { showToast('设置未应用：解锁标识须非空且在文章内唯一', 'error'); return }
    editor.value.view.dispatch(tr)
    return
  }
  updateNodeAttrs(editor.value, selected.value, attributes)
}

function closeResourcePicker() {
  pickerSession.value = null
  pickerError.value = ''
}

function openResourcePicker(id?: string) {
  const currentEditor = editor.value
  if (!currentEditor || isReadonly.value) return
  const questionId = id ?? (selected.value?.node.type.name === 'resourceQuestion' ? selected.value.node.attrs.id : null)
  const question = questionId ? findQuestion(currentEditor.state.doc, questionId) : undefined
  if (!question) return
  const session: ResourceQuestionPickerScope = {
    current: JSON.parse(JSON.stringify(question.node.attrs)) as ResourceQuestionAttrs,
    cancel: () => { if (pickerSession.value === session) closeResourcePicker() },
    select: data => {
      // Ignore late async responses after cancel, replacement, deletion or unmount.
      if (pickerSession.value !== session || currentEditor.isDestroyed || isReadonly.value) return false
      const target = findQuestion(currentEditor.state.doc, questionId)
      if (!target) { closeResourcePicker(); return false }
      try {
        const snapshot = snapshotResourceQuestion(data)
        const old = target.node.attrs as ResourceQuestionAttrs
        const options = snapshot.options.map(option => {
          const previous = old.resourceId === snapshot.resourceId ? old.options.find(item => item.id === option.id) : undefined
          return { ...option, ...(previous?.targetAnchorId && { targetAnchorId: previous.targetAnchorId }) }
        })
        const tr = closeHistory(currentEditor.state.tr).setNodeMarkup(target.pos, undefined, { ...old, ...snapshot, options })
        currentEditor.view.dispatch(tr)
        closeResourcePicker()
        showToast('资源快照已保存到模块属性', 'success')
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        pickerError.value = message
        emit('error', { source: 'resourceQuestion', message, errors: [message] })
        return false
      }
    },
  }
  pickerError.value = ''
  pickerSession.value = session
}

function bindSelectedOption(optionId: string, targetPos: number | null) {
  if (!editor.value || isReadonly.value || selected.value?.node.type.name !== 'resourceQuestion') return
  if (!bindQuestionOption(editor.value, selected.value.node.attrs.id, optionId, targetPos)) showToast('目标已变化，请重新选择段落', 'error')
}

function scrollToAnchor(anchorId: string): boolean {
  const currentEditor = editor.value
  if (!currentEditor || currentEditor.isDestroyed || !anchorId) return false
  const target = paragraphTargets(currentEditor.state.doc).find(item => item.anchorId === anchorId)
  const element = target ? currentEditor.view.nodeDOM(target.pos) : null
  const scroll = rootElement.value?.querySelector<HTMLElement>('.canvas-scroll')
  if (!(element instanceof HTMLElement) || !scroll) return false
  const top = Math.max(0, scroll.scrollTop + element.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 32)
  if (typeof scroll.scrollTo === 'function') scroll.scrollTo({ top, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  else scroll.scrollTop = top
  if (highlightTimer) window.clearTimeout(highlightTimer)
  currentEditor.view.dispatch(currentEditor.state.tr.setMeta(anchorHighlightKey, anchorId).setMeta('addToHistory', false))
  highlightTimer = window.setTimeout(() => {
    if (!currentEditor.isDestroyed) currentEditor.view.dispatch(currentEditor.state.tr.setMeta(anchorHighlightKey, null).setMeta('addToHistory', false))
  }, 1800)
  return true
}

function navigateAnchor(anchorId?: string) {
  if (!anchorId) { showToast('该选项尚未绑定目标段落', 'error'); return }
  if (!scrollToAnchor(anchorId)) showToast('目标段落已失效，请重新绑定', 'error')
}

function pairSelectedImage() {
  if (!editor.value || !selected.value || isReadonly.value) return
  if (pairWithNextImage(editor.value, selected.value.pos)) showToast('两张图片已设为并排', 'success')
}

function moveSelectedNode(direction: -1 | 1) {
  if (!editor.value || !selected.value || isReadonly.value) return
  moveTopLevelNode(editor.value, selected.value, direction)
}

function duplicateSelectedNode() {
  if (!editor.value || !selected.value || isReadonly.value) return
  duplicateNode(editor.value, selected.value)
  showToast('模块已复制', 'success')
}

function removeSelectedNode() {
  if (!editor.value || !selected.value || isReadonly.value) return
  deleteNode(editor.value, selected.value)
  showToast('模块已删除', 'success')
}

function runTableCommand(command: TableCommand) {
  const currentEditor = editor.value
  if (!currentEditor || isReadonly.value) return
  if (!applyTableCommand(currentEditor, command)) showToast('请先在目标表格内选择单元格', 'error')
}

function saveDocument() {
  if (!editor.value || isReadonly.value) return
  if (uploadCount.value) {
    showToast('请等待图片上传完成后再保存', 'error')
    return
  }
  const document = toProtocolJSON(editor.value.getJSON() as ProseMirrorJSON)
  const result = validateProtocolDocument(document)
  validation.value = result
  if (!result.valid) {
    jsonOpen.value = true
    showToast('协议校验未通过，请检查 JSON', 'error')
    emit('error', { source: 'save', message: '协议校验未通过', errors: [...result.errors] })
    return
  }
  emit('save', document)
}

function openJsonPanel() {
  refreshEditorState()
  jsonOpen.value = true
}

function applyJson(value: string) {
  if (!editor.value || isReadonly.value) return
  try {
    const document = JSON.parse(value) as ProseMirrorJSON
    const result = validateProtocolDocument(document)
    validation.value = result
    if (!result.valid) {
      jsonText.value = value
      showToast('JSON 不符合 Article Protocol v1', 'error')
      emit('error', { source: 'json', message: 'JSON 协议校验失败', errors: [...result.errors] })
      return
    }
    if (!replaceContent(document, 'json')) return
    jsonOpen.value = false
    showToast('JSON 已应用到画布', 'success')
  } catch (error) {
    validation.value = {
      valid: false,
      errors: [error instanceof Error ? error.message : 'JSON 解析失败'],
    }
    jsonText.value = value
    showToast('JSON 格式有误', 'error')
    emit('error', { source: 'json', message: 'JSON 格式有误', errors: [...validation.value.errors] })
  }
}

function openLinkDialog() {
  if (!editor.value || isReadonly.value) return
  linkOpen.value = true
}

function applyLink(attributes: Record<string, unknown>) {
  if (isReadonly.value) return
  editor.value?.chain().focus().extendMarkRange('link').setMark('link', attributes).run()
  linkOpen.value = false
}

function removeLink() {
  if (isReadonly.value) return
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

const api: ArticleEditorExpose = {
  getJSON: () => editor.value ? toProtocolJSON(editor.value.getJSON() as ProseMirrorJSON) : createEmptyDocument(),
  setContent: (document) => replaceContent(document, 'setContent'),
  clear: () => replaceContent(createEmptyDocument(), 'setContent'),
  focus: () => { editor.value?.commands.focus() },
  validate: () => validateProtocolDocument(api.getJSON()),
  scrollToAnchor,
}
defineExpose(api)
</script>

<template>
  <div ref="rootElement" class="article-studio" :style="rootStyle">
  <div class="app-shell" :class="{ 'preview-mode': isReadonly, 'without-toolbar': !showToolbar }">
    <EditorToolbar
      v-if="showToolbar"
      :editor="editorInstance"
      :preview="isReadonly"
      :readonly="readonly"
      :device="device"
      :document-valid="validation.valid && uploadCount === 0"
      @save="saveDocument"
      @open-json="openJsonPanel"
      @download-protocol="downloadProtocol"
      @open-link="openLinkDialog"
      @toggle-preview="!readonly && (preview = !preview)"
      @device="device = $event"
    />

    <main class="workspace" :class="{ 'without-library': !showLibrary, 'without-inspector': !showInspector }">
      <ModuleLibrary v-if="showLibrary" :modules="editorModules" @insert="insertModule" />

      <section class="canvas-column">
        <div class="canvas-meta">
          <div>
            <span class="eyebrow">CANVAS</span>
            <strong>文章内容</strong>
          </div>
          <div class="canvas-status">
            <ImageFilePicker label="上传图片" multiple :disabled="!uploadImage || isReadonly" @files="insertUploadedImages" />
            <span>{{ device === 'mobile' ? '390 px' : device === 'tablet' ? '768 px' : '960 px' }}</span>
            <span class="validation-badge" :class="{ error: !validation.valid }">
              <ShieldCheck v-if="validation.valid" :size="14" />
              <TriangleAlert v-else :size="14" />
              {{ validation.valid ? '协议有效' : `${validation.errors.length} 个问题` }}
            </span>
          </div>
        </div>

        <div
          class="canvas-scroll"
          :class="{ 'file-drop-active': fileDragActive }"
          @dragover.capture="handleFileDragOver"
          @dragenter.capture="handleFileDragOver"
          @dragleave="handleFileDragLeave"
          @drop.capture="handleFileDrop"
        >
          <div v-if="fileDragActive" class="file-drop-hint">松开以上传图片并插入文章</div>
          <div
            class="device-canvas"
            :class="[`device-${device}`, { 'drop-active': dragActive && !isReadonly, 'is-preview': isReadonly }]"
            @dragenter.prevent="dragActive = true"
            @dragover.prevent
            @dragleave.self="dragActive = false"
            @drop.capture="handleCanvasDrop"
          >
            <div v-if="isReadonly" class="preview-ribbon">只读预览</div>
            <DragHandle
              v-if="editor && !isReadonly"
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
          <span v-if="uploadCount" class="image-upload-status" role="status">正在上传 {{ uploadCount }} 张图片…</span>
          <span v-else class="autosave-note"><span class="status-dot" /> {{ isReadonly ? '只读模式' : '编辑模式' }}</span>
        </footer>
      </section>

      <InspectorPanel
        v-if="showInspector"
        :selected="selected"
        :table="selectedTable"
        :readonly="isReadonly"
        :top-level-count="topLevelCount"
        :can-upload="Boolean(uploadImage) && !isReadonly"
        :uploading="uploadCount > 0"
        :can-pair-next-image="canPairNextImage"
        :paragraph-targets="targets"
        @choose-resource="openResourcePicker()"
        @bind-option="bindSelectedOption"
        @navigate-anchor="navigateAnchor"
        @patch="patchSelectedNode"
        @move="moveSelectedNode"
        @duplicate="duplicateSelectedNode"
        @remove="removeSelectedNode"
        @table-command="runTableCommand"
        @upload-image="replaceSelectedImage"
        @pair-images="pairSelectedImage"
      />
    </main>

    <JsonPanel
      :open="jsonOpen"
      :value="jsonText"
      :valid="validation.valid"
      :errors="validation.errors"
      :readonly="isReadonly"
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

    <ResourceQuestionPicker v-if="pickerSession" :session="pickerSession" :error="pickerError">
      <template v-if="$slots['resource-question-picker']" #default="scope"><slot name="resource-question-picker" v-bind="scope" /></template>
    </ResourceQuestionPicker>

    <Transition name="toast">
      <div v-if="toast" class="toast-message" :class="toast.tone">
        <CheckCircle2 v-if="toast.tone === 'success'" :size="18" />
        <TriangleAlert v-else :size="18" />
        {{ toast.message }}
      </div>
    </Transition>
  </div>
  </div>
</template>
