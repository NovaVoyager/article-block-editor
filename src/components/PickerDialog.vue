<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { X } from '@lucide/vue'
defineProps<{ title: string; description?: string; error: string }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLElement>()
const titleId = useId()
let previousFocus: HTMLElement | null = null
onMounted(() => {
  previousFocus = document.activeElement as HTMLElement | null
  dialog.value?.focus()
})
onBeforeUnmount(() => { if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }) })
function keydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('close') }
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
  <div class="modal-backdrop resource-picker-backdrop" @click.self="emit('close')">
    <section ref="dialog" class="resource-picker" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1" @keydown="keydown">
      <header><div><h2 :id="titleId">{{ title }}</h2><p v-if="description">{{ description }}</p></div><button class="icon-button" type="button" aria-label="关闭资源选择" @click="emit('close')"><X :size="20" /></button></header>
      <div class="resource-picker-body"><slot /></div>
      <p v-if="error" class="resource-warning" role="alert">{{ error }}</p>
    </section>
  </div>
</template>
