<script setup lang="ts">
import { reactive, watch } from 'vue'
import { Link2, X } from '@lucide/vue'

const props = defineProps<{
  open: boolean
  attributes?: Record<string, unknown>
}>()

const emit = defineEmits<{
  close: []
  apply: [attributes: Record<string, unknown>]
  remove: []
}>()

const form = reactive({
  type: 'href',
  href: 'https://',
  id: '',
  title: '',
  target: '_blank',
})

watch(
  () => props.open,
  (open) => {
    if (!open) return
    const attrs = props.attributes ?? {}
    form.type = attrs.type === 'custom' ? 'custom' : 'href'
    form.href = typeof attrs.href === 'string' ? attrs.href : 'https://'
    form.id = typeof attrs.id === 'string' ? attrs.id : ''
    form.title = typeof attrs.title === 'string' ? attrs.title : ''
    form.target = attrs.target === '_self' ? '_self' : '_blank'
  },
)

function submit() {
  if (form.type === 'custom') {
    emit('apply', {
      type: 'custom',
      id: form.id,
      title: form.title,
      target: form.target,
      href: null,
    })
  } else {
    emit('apply', {
      type: 'href',
      href: form.href,
      target: form.target,
      id: null,
      title: null,
    })
  }
}
</script>

<template>
  <div v-if="open" class="modal-backdrop" @mousedown.self="emit('close')">
    <section class="link-dialog" role="dialog" aria-modal="true" aria-label="设置链接">
      <header>
        <span class="dialog-icon"><Link2 :size="20" /></span>
        <div><h2>设置链接</h2><p>支持网址与应用自定义链接</p></div>
        <button type="button" aria-label="关闭" @click="emit('close')"><X :size="18" /></button>
      </header>
      <div class="dialog-body">
        <label class="field-label">
          <span>链接类型</span>
          <select v-model="form.type">
            <option value="href">网址链接</option>
            <option value="custom">自定义链接</option>
          </select>
        </label>
        <label v-if="form.type === 'href'" class="field-label">
          <span>网址 <em>必填</em></span>
          <input v-model="form.href" type="url" placeholder="https://example.com" />
        </label>
        <template v-else>
          <label class="field-label">
            <span>业务 ID <em>必填</em></span>
            <input v-model="form.id" type="text" placeholder="resource-123" />
          </label>
          <label class="field-label">
            <span>链接标题 <em>必填</em></span>
            <input v-model="form.title" type="text" placeholder="资源详情" />
          </label>
        </template>
        <label class="field-label">
          <span>打开方式</span>
          <select v-model="form.target">
            <option value="_blank">新窗口</option>
            <option value="_self">当前窗口</option>
          </select>
        </label>
      </div>
      <footer>
        <button class="text-danger" type="button" @click="emit('remove')">移除链接</button>
        <span />
        <button class="action-button ghost" type="button" @click="emit('close')">取消</button>
        <button class="action-button primary" type="button" @click="submit">应用</button>
      </footer>
    </section>
  </div>
</template>
