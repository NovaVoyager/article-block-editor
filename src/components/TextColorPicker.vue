<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { Baseline, Highlighter, Check, ChevronDown } from '@lucide/vue'
import { normalizeColor } from '../editor/text-formatting'

const props = defineProps<{
  kind: 'text' | 'highlight'
  value: string | null
  disabled: boolean
}>()
const emit = defineEmits<{ apply: [color: string | null] }>()
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const open = ref(false)
const custom = ref('')
const panelId = useId()
const label = computed(() => props.kind === 'text' ? '文字颜色' : '文字高亮')
const fallback = computed(() => props.kind === 'text' ? '#262620' : '#fef08a')
const palettes: Record<'text' | 'highlight', [string, string][]> = {
  text: [
    ['默认黑', '#262620'], ['灰色', '#737373'], ['红色', '#dc2626'], ['橙色', '#ea580c'],
    ['黄色', '#ca8a04'], ['绿色', '#16a34a'], ['青色', '#0891b2'], ['蓝色', '#2563eb'],
    ['紫色', '#9333ea'], ['粉色', '#db2777'], ['棕色', '#92400e'], ['白色', '#ffffff'],
  ],
  highlight: [
    ['黄色', '#fef08a'], ['绿色', '#bbf7d0'], ['蓝色', '#bfdbfe'], ['紫色', '#e9d5ff'],
    ['粉色', '#fbcfe8'], ['橙色', '#fed7aa'], ['红色', '#fecaca'], ['青色', '#a5f3fc'],
    ['灰色', '#e5e7eb'], ['薄荷', '#99f6e4'], ['米色', '#fef3c7'], ['白色', '#ffffff'],
  ],
}

watch(open, (visible) => {
  if (visible) custom.value = props.value || fallback.value
})
watch(() => props.disabled, (disabled) => { if (disabled) open.value = false })

function apply(color: string | null) {
  if (props.disabled) return
  emit('apply', color)
  open.value = false
}
function applyCustom() {
  const color = normalizeColor(custom.value)
  if (color) apply(color)
}
function closeOutside(event: PointerEvent) {
  if (!root.value?.contains(event.target as Node)) open.value = false
}
function closeWithKeyboard() {
  open.value = false
  trigger.value?.focus()
}

onMounted(() => document.addEventListener('pointerdown', closeOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOutside))
</script>

<template>
  <div ref="root" class="text-color-picker" @keydown.esc.stop.prevent="closeWithKeyboard">
    <button
      ref="trigger"
      type="button"
      class="color-trigger"
      :class="{ active: value || open }"
      :aria-label="label"
      :title="label"
      :aria-expanded="open"
      :aria-controls="panelId"
      :disabled="disabled"
      @mousedown.prevent
      @click="open = !open"
    >
      <span class="color-glyph">
        <Baseline v-if="kind === 'text'" :size="17" />
        <Highlighter v-else :size="17" />
        <span class="color-indicator" :style="{ backgroundColor: value || fallback }" />
      </span>
      <ChevronDown :size="10" />
    </button>
    <div v-if="open" :id="panelId" class="color-popover" role="group" :aria-label="`${label}面板`">
      <strong>{{ label }}</strong>
      <div class="color-swatches">
        <button
          v-for="[name, color] in palettes[kind]"
          :key="color"
          type="button"
          class="color-swatch"
          :aria-label="`${label}：${name}`"
          :title="`${name} ${color}`"
          :aria-pressed="value === color"
          :style="{ backgroundColor: color }"
          @mousedown.prevent
          @click="apply(color)"
        ><Check v-if="value === color" :size="14" /></button>
      </div>
      <form class="custom-color-form" @submit.prevent="applyCustom">
        <label :for="`${panelId}-hex`">自定义颜色</label>
        <div>
          <input
            :id="`${panelId}-hex`"
            v-model="custom"
            type="text"
            maxlength="7"
            spellcheck="false"
            placeholder="#2563eb"
            :aria-label="`${label}色值`"
          />
          <button type="submit" :disabled="!normalizeColor(custom)">应用</button>
        </div>
      </form>
      <button class="reset-color" type="button" @mousedown.prevent @click="apply(null)">
        {{ kind === 'text' ? '恢复默认颜色' : '清除高亮' }}
      </button>
    </div>
  </div>
</template>
