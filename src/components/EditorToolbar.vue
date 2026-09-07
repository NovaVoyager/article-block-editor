<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import {
  Bold,
  Braces,
  Code2,
  Eye,
  Italic,
  Link2,
  List,
  ListOrdered,
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
  device: 'mobile' | 'tablet' | 'desktop'
  documentValid: boolean
}>()

const emit = defineEmits<{
  save: []
  openJson: []
  openLink: []
  togglePreview: []
  device: [device: 'mobile' | 'tablet' | 'desktop']
}>()

function setBlock(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  const editor = props.editor
  if (!editor) return
  if (value === 'paragraph') editor.chain().focus().setParagraph().run()
  else if (value.startsWith('heading-')) {
    const level = Number(value.split('-')[1]) as 1 | 2 | 3 | 4 | 5 | 6
    editor.chain().focus().setHeading({ level }).run()
  } else if (value === 'blockquote') editor.chain().focus().toggleBlockquote().run()
  else if (value === 'codeBlock') editor.chain().focus().toggleCodeBlock().run()
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
      <select aria-label="块类型" :disabled="preview" @change="setBlock">
        <option value="paragraph">正文</option>
        <option value="heading-1">标题 1</option>
        <option value="heading-2">标题 2</option>
        <option value="heading-3">标题 3</option>
        <option value="blockquote">引用</option>
        <option value="codeBlock">代码块</option>
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
      <button class="action-button ghost" type="button" @click="emit('togglePreview')">
        <Eye :size="16" /> {{ preview ? '退出预览' : '预览' }}
      </button>
      <button class="action-button primary" type="button" :disabled="!documentValid" @click="emit('save')">
        <Save :size="16" /> 保存
      </button>
    </div>
  </header>
</template>
