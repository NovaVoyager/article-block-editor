<script setup lang="ts">
import { ref } from 'vue'
import { Upload } from '@lucide/vue'
import { IMAGE_ACCEPT } from '../editor/image-upload'

const props = defineProps<{ label: string; disabled?: boolean; multiple?: boolean }>()
const emit = defineEmits<{ files: [files: File[]] }>()
const input = ref<HTMLInputElement | null>(null)
function choose(event: Event) {
  const element = event.target as HTMLInputElement
  const files = Array.from(element.files ?? [])
  element.value = '' // Selecting the same file again must still fire change after a failure.
  if (!props.disabled && files.length) emit('files', files)
}
</script>

<template>
  <div class="image-file-picker">
    <button type="button" class="action-button ghost" :disabled="disabled" @click="input?.click()">
      <Upload :size="14" />{{ label }}
    </button>
    <input ref="input" type="file" hidden :accept="IMAGE_ACCEPT" :multiple="multiple" :disabled="disabled" :aria-label="`${label}文件`" @change="choose" />
  </div>
</template>
