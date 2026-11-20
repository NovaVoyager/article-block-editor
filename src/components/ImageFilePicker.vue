<script setup lang="ts">
import { ref } from 'vue'
import { Upload } from '@lucide/vue'
import { IMAGE_ACCEPT, isFileDrag } from '../editor/image-upload'

const props = defineProps<{ label: string; disabled?: boolean; multiple?: boolean; dropzone?: boolean }>()
const emit = defineEmits<{ files: [files: File[]] }>()
const input = ref<HTMLInputElement | null>(null)
const dragActive = ref(false)

function handleDrag(event: DragEvent) {
  if (!props.dropzone || !isFileDrag(event)) return
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) event.dataTransfer.dropEffect = props.disabled ? 'none' : 'copy'
  dragActive.value = !props.disabled
}

function handleDrop(event: DragEvent) {
  dragActive.value = false
  if (!props.dropzone || !isFileDrag(event)) return
  event.preventDefault()
  event.stopPropagation()
  const files = Array.from(event.dataTransfer?.files ?? [])
  if (!props.disabled && files.length) emit('files', props.multiple ? files : files.slice(0, 1))
}

function choose(event: Event) {
  const element = event.target as HTMLInputElement
  const files = Array.from(element.files ?? [])
  element.value = '' // Selecting the same file again must still fire change after a failure.
  if (!props.disabled && files.length) emit('files', files)
}
</script>

<template>
  <div class="image-file-picker" :class="{ 'image-dropzone': dropzone, 'is-dragging': dragActive && !disabled }"
    @dragenter="handleDrag" @dragover="handleDrag" @dragleave="dragActive = false" @drop="handleDrop">
    <button type="button" class="action-button ghost" :disabled="disabled" @click="input?.click()">
      <Upload :size="dropzone ? 20 : 14" aria-hidden="true" />{{ label }}
      <small v-if="dropzone">{{ dragActive && !disabled ? '松开以上传' : '拖入图片，或点击选择' }}</small>
    </button>
    <input ref="input" type="file" hidden :accept="IMAGE_ACCEPT" :multiple="multiple" :disabled="disabled" :aria-label="`${label}文件`" @change="choose" />
  </div>
</template>
