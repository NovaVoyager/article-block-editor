<script setup lang="ts">
// Playground only: persistence and business state deliberately live outside the library.
import { ref } from 'vue'
import { ArticleEditor, createEmptyDocument, validateProtocolDocument } from './index'
import type { ArticleEditorError, ArticleEditorExpose, ProseMirrorJSON } from './index'
import { initialDocument } from './editor/modules'
import { demoImageUpload } from './demo-image-upload'
import './playground.css'

const STORAGE_KEY = 'article-studio.protocol-v1.document'
const cloneSample = () => JSON.parse(JSON.stringify(initialDocument)) as ProseMirrorJSON
const content = ref<ProseMirrorJSON>(loadDraft())
const secondContent = ref(createEmptyDocument())
const editorRef = ref<ArticleEditorExpose | null>(null)
const readonly = ref(false)
const showSecond = ref(false)
const mounted = ref(true)
const changeCount = ref(0)
const status = ref('演示页：保存事件由宿主写入本地草稿')
const jsonInputOpen = ref(false)
const jsonSource = ref('')
const jsonErrors = ref<string[]>([])
const jsonNotice = ref('')
let applyingJson = false

function loadDraft() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as ProseMirrorJSON
      if (validateProtocolDocument(parsed).valid) return parsed
    }
  } catch { /* Storage can be unavailable in private/sandboxed browsing. */ }
  return cloneSample()
}
function save(document: ProseMirrorJSON) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(document))
    status.value = '宿主已保存到浏览器本地'
  } catch {
    status.value = '本地存储不可用，JSON 仍保留在页面内存'
  }
}
function handleError(error: ArticleEditorError) {
  status.value = `${error.source}: ${error.message}`
  if (applyingJson) jsonErrors.value = error.errors.length ? [...error.errors] : [error.message]
}
function clearJsonFeedback() {
  jsonErrors.value = []
  jsonNotice.value = ''
}
function fillJson(value: ProseMirrorJSON) {
  jsonSource.value = JSON.stringify(value, null, 2)
  clearJsonFeedback()
}
function renderJson() {
  clearJsonFeedback()
  if (!jsonSource.value.trim()) {
    jsonErrors.value = ['请先粘贴 JSON 字符串，或点击“填入示例”。']
    return
  }
  let document: ProseMirrorJSON
  try {
    const parsed: unknown = JSON.parse(jsonSource.value.trim())
    // Also accept a JSON string literal copied from an API response (escaped quotes).
    document = (typeof parsed === 'string' ? JSON.parse(parsed) : parsed) as ProseMirrorJSON
  } catch (error) {
    jsonErrors.value = [`JSON 格式错误：${error instanceof Error ? error.message : '无法解析'}`]
    return
  }
  const validation = validateProtocolDocument(document)
  if (!validation.valid) {
    jsonErrors.value = ['JSON 不符合文档协议，原内容未改变。', ...validation.errors]
    return
  }
  if (!mounted.value || !editorRef.value) {
    jsonErrors.value = ['请先挂载编辑器，再点击渲染。']
    return
  }
  // Use the public API for schema validation, v-model updates and cancellation of stale uploads.
  applyingJson = true
  try {
    if (editorRef.value.setContent(document)) {
      jsonNotice.value = 'JSON 已渲染到下方编辑器；未写入本地草稿。勾选顶部“只读”可查看只读效果。'
      status.value = 'JSON 字符串已渲染（尚未保存）'
    } else if (!jsonErrors.value.length) {
      jsonErrors.value = ['文档无法渲染，原内容未改变。']
    }
  } finally {
    applyingJson = false
  }
}
</script>

<template>
  <div class="playground">
    <header class="playground-controls">
      <strong>组件测试入口</strong>
      <button class="playground-json-toggle" type="button" :aria-expanded="jsonInputOpen" aria-controls="demo-json-input" @click="jsonInputOpen = !jsonInputOpen">JSON 字符串渲染</button>
      <button type="button" @click="content = cloneSample()">加载示例</button>
      <button type="button" @click="editorRef?.clear()">清空文档</button>
      <label><input v-model="readonly" type="checkbox" />只读</label>
      <label><input v-model="showSecond" type="checkbox" />第二个实例</label>
      <button type="button" @click="mounted = !mounted">{{ mounted ? '卸载编辑器' : '挂载编辑器' }}</button>
      <span role="status">{{ status }} · 内容变更 {{ changeCount }} 次 · 图片上传演示：仅在本地转为 Data URL，不发送至服务器（限 2 MB）</span>
    </header>
    <section v-show="jsonInputOpen" id="demo-json-input" class="playground-json" aria-labelledby="demo-json-title">
      <h2 id="demo-json-title">粘贴 JSON，渲染文档</h2>
      <p id="demo-json-help">支持 ProseMirror 文档 JSON（根节点 type 为 doc），也支持带转义引号的 JSON 字符串。只在点击渲染后应用，失败不覆盖现有内容。</p>
      <form @submit.prevent="renderJson">
        <label for="demo-json-source">JSON 字符串</label>
        <textarea
          id="demo-json-source"
          v-model="jsonSource"
          rows="7"
          spellcheck="false"
          aria-describedby="demo-json-help"
          :aria-invalid="jsonErrors.length > 0"
          placeholder='{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"你好，编辑器"}]}]}'
          @input="clearJsonFeedback"
        />
        <div class="playground-json-actions">
          <button class="playground-json-render" type="submit" :disabled="!mounted || !editorRef">渲染到下方</button>
          <button type="button" @click="fillJson(editorRef?.getJSON() ?? content)">填入当前文档</button>
          <button type="button" @click="fillJson(cloneSample())">填入示例</button>
          <span v-if="!mounted">请先点击顶部“挂载编辑器”。</span>
        </div>
      </form>
      <div v-if="jsonErrors.length" class="playground-json-errors" role="alert">
        <strong>未应用输入内容</strong>
        <ul><li v-for="(error, index) in jsonErrors.slice(0, 6)" :key="index">{{ error }}</li></ul>
        <small v-if="jsonErrors.length > 6">另有 {{ jsonErrors.length - 6 }} 项校验提示，请先修正上述问题。</small>
      </div>
      <p v-if="jsonNotice" class="playground-json-success" role="status">{{ jsonNotice }}</p>
    </section>
    <ArticleEditor
      v-if="mounted"
      ref="editorRef"
      v-model="content"
      :readonly="readonly"
      :upload-image="demoImageUpload"
      :max-image-size="2 * 1024 * 1024"
      height="calc(100vh - 96px)"
      @change="changeCount++"
      @save="save"
      @error="handleError"
    />
    <section v-if="showSecond" class="playground-second">
      <h2>独立实例（数据互不影响）</h2>
      <ArticleEditor v-model="secondContent" :height="600" :show-inspector="false" :upload-image="demoImageUpload" :max-image-size="2 * 1024 * 1024" />
    </section>
  </div>
</template>
