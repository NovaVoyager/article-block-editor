<script setup lang="ts">
import {
  Braces,
  ChevronDown,
  CircleHelp,
  Image,
  MousePointerClick,
  Quote,
  Table2,
} from '@lucide/vue'
import { computed, ref, useId, type Component } from 'vue'
import type { EditorModule, ProseMirrorJSON } from '../editor/types'

const props = defineProps<{ modules: EditorModule[] }>()
const emit = defineEmits<{ insert: [node: ProseMirrorJSON] }>()
const expanded = ref({ basic: true, extension: true })
const groupId = useId()
const groupDefinitions: { id: EditorModule['group']; title: string }[] = [
  { id: 'basic', title: '基础内容' },
  { id: 'extension', title: '扩展' },
]
const groups = computed(() => groupDefinitions.map(group => ({
  ...group,
  modules: props.modules.filter(module => module.group === group.id),
})).filter(group => group.modules.length > 0))

const icons: Record<string, Component> = {
  image: Image,
  button: MousePointerClick,
  quote: Quote,
  code: Braces,
  table: Table2,
  question: CircleHelp,
}

function startDrag(event: DragEvent, module: EditorModule) {
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('application/x-article-node', JSON.stringify(module.create()))
}
</script>

<template>
  <aside class="sidebar library-panel">
    <div class="sidebar-heading">
      <span class="eyebrow">BUILD</span>
      <h2>内容模块</h2>
      <p>点击插入，或拖放到画布</p>
    </div>

    <section v-for="group in groups" :key="group.id" class="module-group" :data-module-group="group.id">
      <h3>
        <button
          class="module-group-toggle"
          type="button"
          :aria-expanded="expanded[group.id]"
          :aria-controls="`${groupId}-${group.id}`"
          @click="expanded[group.id] = !expanded[group.id]"
        >
          <span>{{ group.title }}</span>
          <ChevronDown :size="14" aria-hidden="true" />
        </button>
      </h3>
      <div v-show="expanded[group.id]" :id="`${groupId}-${group.id}`" class="module-grid">
        <button
          v-for="module in group.modules"
          :key="module.type"
          class="module-card"
          type="button"
          draggable="true"
          @click="emit('insert', module.create())"
          @dragstart="startDrag($event, module)"
        >
          <span class="module-icon"><component :is="icons[module.icon]" :size="20" /></span>
          <span>
            <strong>{{ module.title }}</strong>
            <small>{{ module.description }}</small>
          </span>
        </button>
      </div>
    </section>

    <div class="protocol-note">
      <span class="status-dot" />
      <div>
        <strong>Article Protocol v1</strong>
        <small>兼容 v1 · 支持资源问题与段落锚点</small>
      </div>
    </div>
  </aside>
</template>
