<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { computed, ref, watch } from 'vue'
import TextColorPicker from './TextColorPicker.vue'
import { normalizeColor } from '../editor/text-formatting'
import {
  Bold,
  Braces,
  Code2,
  Download,
  Eye,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Monitor,
  Redo2,
  Save,
  Smartphone,
  Strikethrough,
  Tablet,
  Underline,
  Undo2,
} from '@lucide/vue'

const props = defineProps<{
  editor: Editor | null
  preview: boolean
  readonly?: boolean
  device: 'mobile' | 'tablet' | 'desktop'
  documentValid: boolean
}>()

const emit = defineEmits<{
  save: []
  openJson: []
  downloadProtocol: []
  openLink: []
  togglePreview: []
  device: [device: 'mobile' | 'tablet' | 'desktop']
}>()

const revision = ref(0)
watch(() => props.editor, (editor, _, onCleanup) => {
  if (!editor) return
  const update = () => { revision.value += 1 }
  editor.on('transaction', update)
  onCleanup(() => editor.off('transaction', update))
  update()
}, { immediate: true })

const formatting = computed(() => {
  void revision.value
  const editor = props.editor
  return {
    block: editor?.isActive('heading') ? `heading-${editor.getAttributes('heading').level}` : 'paragraph',
    color: normalizeColor(editor?.getAttributes('textStyle').color),
    highlight: normalizeColor(editor?.getAttributes('highlight').color),
    canColor: editor?.can().setMark('textStyle', { color: '#262620' }) ?? false,
    canHighlight: editor?.can().setMark('highlight', { color: '#fef08a' }) ?? false,
    canHorizontalRule: editor?.can().setHorizontalRule() ?? false,
  }
})

function applyColor(mark: 'textStyle' | 'highlight', color: string | null) {
  if (!props.editor || props.preview) return
  const chain = props.editor.chain().focus()
  if (color) chain.setMark(mark, { color }).run()
  else chain.unsetMark(mark).run()
}

function insertHorizontalRule() {
  if (!props.editor || props.preview || props.readonly) return
  props.editor.chain().focus().setHorizontalRule().run()
}

function setBlock(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  const editor = props.editor
  if (!editor) return
  if (value === 'paragraph') editor.chain().focus().setParagraph().run()
  else if (value.startsWith('heading-')) {
    const level = Number(value.split('-')[1]) as 1 | 2 | 3 | 4 | 5 | 6
    editor.chain().focus().setHeading({ level }).run()
  }
}
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark">A</span>
      <div>
        <strong>Article Studio</strong>
        <small>结构化内容编辑器</small>
      </div>
    </div>

    <div class="format-bar" :class="{ disabled: preview }">
      <select aria-label="块类型" :value="formatting.block" :disabled="preview" @change="setBlock">
        <option value="paragraph">正文</option>
        <option v-for="level in 6" :key="level" :value="`heading-${level}`">标题 {{ level }}</option>
      </select>
      <span class="bar-divider" />
      <button
        type="button"
        :class="{ active: editor?.isActive('bold') }"
        :disabled="preview"
        title="粗体"
        @click="editor?.chain().focus().toggleBold().run()"
      ><Bold :size="17" /></button>
      <button
        type="button"
        :class="{ active: editor?.isActive('italic') }"
        :disabled="preview"
        title="斜体"
        @click="editor?.chain().focus().toggleItalic().run()"
      ><Italic :size="17" /></button>
      <button
        type="button"
        :class="{ active: editor?.isActive('underline') }"
        :disabled="preview"
        title="下划线"
        @click="editor?.chain().focus().toggleUnderline().run()"
      ><Underline :size="17" /></button>
      <button
        type="button"
        :class="{ active: editor?.isActive('strike') }"
        :disabled="preview"
        title="删除线"
        @click="editor?.chain().focus().toggleStrike().run()"
      ><Strikethrough :size="17" /></button>
      <TextColorPicker
        kind="text"
        :value="formatting.color"
        :disabled="preview || !formatting.canColor"
        @apply="applyColor('textStyle', $event)"
      />
      <TextColorPicker
        kind="highlight"
        :value="formatting.highlight"
        :disabled="preview || !formatting.canHighlight"
        @apply="applyColor('highlight', $event)"
      />
      <button
        type="button"
        :class="{ active: editor?.isActive('code') }"
        :disabled="preview"
        title="行内代码"
        @click="editor?.chain().focus().toggleCode().run()"
      ><Code2 :size="17" /></button>
      <button
        type="button"
        :class="{ active: editor?.isActive('link') }"
        :disabled="preview"
        title="链接"
        @click="emit('openLink')"
      ><Link2 :size="17" /></button>
      <span class="bar-divider" />
      <button
        type="button"
        :class="{ active: editor?.isActive('bulletList') }"
        :disabled="preview"
        title="无序列表"
        @click="editor?.chain().focus().toggleBulletList().run()"
      ><List :size="17" /></button>
      <button
        type="button"
        :class="{ active: editor?.isActive('orderedList') }"
        :disabled="preview"
        title="有序列表"
        @click="editor?.chain().focus().toggleOrderedList().run()"
      ><ListOrdered :size="17" /></button>
      <button
        type="button"
        :disabled="preview || readonly || !formatting.canHorizontalRule"
        title="分割线"
        aria-label="分割线"
        @click="insertHorizontalRule"
      ><Minus :size="17" /></button>
      <span class="bar-divider" />
      <button type="button" :disabled="!editor?.can().undo() || preview" title="撤销" @click="editor?.chain().focus().undo().run()"><Undo2 :size="17" /></button>
      <button type="button" :disabled="!editor?.can().redo() || preview" title="重做" @click="editor?.chain().focus().redo().run()"><Redo2 :size="17" /></button>
    </div>

    <div class="top-actions">
      <div class="device-switcher">
        <button type="button" :class="{ active: device === 'mobile' }" title="手机" @click="emit('device', 'mobile')"><Smartphone :size="16" /></button>
        <button type="button" :class="{ active: device === 'tablet' }" title="平板" @click="emit('device', 'tablet')"><Tablet :size="16" /></button>
        <button type="button" :class="{ active: device === 'desktop' }" title="桌面" @click="emit('device', 'desktop')"><Monitor :size="16" /></button>
      </div>
      <button class="action-button ghost" type="button" @click="emit('openJson')">
        <Braces :size="16" /> JSON
      </button>
      <button class="action-button ghost protocol-download-button" type="button" aria-label="下载协议" title="下载当前版本完整协议（含扩展），不是当前文章 JSON" @click="emit('downloadProtocol')">
        <Download :size="16" /><span class="protocol-download-label">下载协议</span>
      </button>
      <button class="action-button ghost" type="button" :disabled="readonly" @click="emit('togglePreview')">
        <Eye :size="16" /> {{ preview ? '退出预览' : '预览' }}
      </button>
      <button class="action-button primary" type="button" :disabled="!documentValid || preview" @click="emit('save')">
        <Save :size="16" /> 保存
      </button>
    </div>
  </header>
</template>
