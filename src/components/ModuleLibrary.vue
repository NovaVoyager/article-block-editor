<script setup lang="ts">
import {
  Braces,
  Heading2,
  Image,
  List,
  ListOrdered,
  Minus,
  MousePointerClick,
  Pilcrow,
  Quote,
  Table2,
} from '@lucide/vue'
import type { Component } from 'vue'
import type { EditorModule, ProseMirrorJSON } from '@/editor/types'

const props = defineProps<{ modules: EditorModule[] }>()
const emit = defineEmits<{ insert: [node: ProseMirrorJSON] }>()

const icons: Record<string, Component> = {
  heading: Heading2,
  paragraph: Pilcrow,
  image: Image,
  button: MousePointerClick,
  rule: Minus,
  quote: Quote,
  bulletList: List,
  orderedList: ListOrdered,
  code: Braces,
  table: Table2,
}

function byGroup(group: EditorModule['group']) {
  return props.modules.filter((module) => module.group === group)
}

function startDrag(event: DragEvent, module: EditorModule) {
  if (!event.dataTransfer) return
  event.dataTransfer.effectAllowed = 'copy'
  event.dataTransfer.setData('application/x-article-node', JSON.stringify(module.create()))
  event.dataTransfer.setData('text/plain', module.title)
}
</script>

<template>
  <aside class="sidebar library-panel">
    <div class="sidebar-heading">
      <span class="eyebrow">BUILD</span>
      <h2>内容模块</h2>
      <p>点击插入，或拖放到画布</p>
    </div>

    <section class="module-group">
      <h3>基础内容</h3>
      <div class="module-grid">
        <button
          v-for="module in byGroup('basic')"
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

    <section class="module-group">
      <h3>结构模块</h3>
      <div class="module-grid">
        <button
          v-for="module in byGroup('structure')"
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
        <small>严格兼容模式</small>
      </div>
    </div>
  </aside>
</template>
