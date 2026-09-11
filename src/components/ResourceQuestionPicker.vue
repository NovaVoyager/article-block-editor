<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { X } from '@lucide/vue'
import type { ResourceQuestionPickerScope } from '../editor/resource-question'
const props = defineProps<{ session: ResourceQuestionPickerScope; error: string }>()
const dialog = ref<HTMLElement>()
const titleId = useId()
let previousFocus: HTMLElement | null = null
onMounted(() => {
  previousFocus = document.activeElement as HTMLElement | null
  dialog.value?.focus()
})
onBeforeUnmount(() => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }) })
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); props.session.cancel() }
  if (event.key !== 'Tab') return
  const elements = Array.from(dialog.value?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') ?? [])
    .filter(element => element.getClientRects().length > 0)
  const first = elements[0], last = elements.at(-1)
  if (!first) { event.preventDefault(); return }
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) {
    event.preventDefault(); last?.focus()
  } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.value)) {
    event.preventDefault(); first.focus()
  }
}
</script>

<template>
  <div class="modal-backdrop resource-picker-backdrop" @click.self="session.cancel()">
    <section ref="dialog" class="resource-picker" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1" @keydown="keydown">
      <header><div><h2 :id="titleId">选择资源问题</h2><p>选中后保存完整快照；更换其他资源会清除旧段落绑定。</p></div><button class="icon-button" type="button" aria-label="关闭资源选择" @click="session.cancel()"><X :size="20" /></button></header>
      <div class="resource-picker-body"><slot v-bind="session"><p>宿主尚未配置资源选择组件。请通过 resource-question-picker 插槽接入。</p></slot></div>
      <p v-if="error" class="resource-warning" role="alert">{{ error }}</p>
    </section>
  </div>
</template>
