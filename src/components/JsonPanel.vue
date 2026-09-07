<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, Clipboard, Download, Upload, X } from '@lucide/vue'

const props = defineProps<{
  open: boolean
  value: string
  valid: boolean
  errors: string[]
}>()

const emit = defineEmits<{
  close: []
  apply: [value: string]
}>()

const draft = ref(props.value)
const copied = ref(false)

watch(
  () => [props.open, props.value] as const,
  ([open, value]) => {
    if (open) draft.value = value
  },
)

const lineCount = computed(() => draft.value.split('\n').length)

async function copyJson() {
  await navigator.clipboard.writeText(draft.value)
  copied.value = true
  window.setTimeout(() => (copied.value = false), 1400)
}

function downloadJson() {
  const blob = new Blob([draft.value], { type: 'application/vnd.article-content-protocol+json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'article-content.json'
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div v-if="open" class="drawer-backdrop" @mousedown.self="emit('close')">
    <section class="json-drawer" role="dialog" aria-modal="true" aria-label="ProseMirror JSON">
      <header class="drawer-header">
        <div>
          <span class="eyebrow">SOURCE</span>
          <h2>ProseMirror JSON</h2>
          <p>Article Content Protocol v1</p>
        </div>
        <button class="close-button" type="button" aria-label="关闭" @click="emit('close')"><X :size="20" /></button>
      </header>

      <div class="json-status" :class="{ error: !valid }">
        <span class="status-dot" />
        <span>{{ valid ? '当前文档符合协议' : `发现 ${errors.length} 个协议问题` }}</span>
        <small>{{ lineCount }} 行</small>
      </div>

      <div v-if="errors.length" class="validation-errors">
        <strong>校验结果</strong>
        <ul>
          <li v-for="error in errors.slice(0, 6)" :key="error">{{ error }}</li>
        </ul>
      </div>

      <textarea v-model="draft" spellcheck="false" aria-label="JSON 内容" />

      <footer class="drawer-footer">
        <button class="action-button ghost" type="button" @click="copyJson">
          <Check v-if="copied" :size="16" />
          <Clipboard v-else :size="16" />
          {{ copied ? '已复制' : '复制' }}
        </button>
        <button class="action-button ghost" type="button" @click="downloadJson">
          <Download :size="16" /> 下载
        </button>
        <button class="action-button primary" type="button" @click="emit('apply', draft)">
          <Upload :size="16" /> 应用到画布
        </button>
      </footer>
    </section>
  </div>
</template>
