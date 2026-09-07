<script setup lang="ts">
import { computed } from 'vue'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Copy,
  Settings2,
  Trash2,
} from '@lucide/vue'
import type { SelectedNode } from '@/editor/types'

const props = defineProps<{
  selected: SelectedNode | null
  topLevelCount: number
}>()

const emit = defineEmits<{
  patch: [attributes: Record<string, unknown>]
  move: [direction: -1 | 1]
  duplicate: []
  remove: []
  tableCommand: [command: string]
}>()

const names: Record<string, string> = {
  paragraph: '正文段落',
  heading: '标题',
  blockquote: '引用',
  bulletList: '无序列表',
  orderedList: '有序列表',
  listItem: '列表项',
  codeBlock: '代码块',
  horizontalRule: '分割线',
  image: '图片',
  articleButton: '文章按钮',
  table: '表格',
  tableRow: '表格行',
  tableCell: '表格单元格',
}

const type = computed(() => props.selected?.node.type.name ?? '')
const attrs = computed<Record<string, unknown>>(() => props.selected?.node.attrs ?? {})
const isTopLevel = computed(() => (props.selected?.depth ?? 2) <= 1)
const canMoveUp = computed(() => (props.selected?.topLevelIndex ?? -1) > 0)
const canMoveDown = computed(() => {
  const index = props.selected?.topLevelIndex ?? -1
  return index >= 0 && index < props.topLevelCount - 1
})

function textPatch(key: string, event: Event) {
  emit('patch', { [key]: (event.target as HTMLInputElement).value })
}

function optionalTextPatch(key: string, event: Event) {
  const value = (event.target as HTMLInputElement).value
  emit('patch', { [key]: value || null })
}

function numberPatch(key: string, event: Event) {
  const value = (event.target as HTMLInputElement).value
  emit('patch', { [key]: value === '' ? null : Number(value) })
}

function selectPatch(key: string, event: Event) {
  emit('patch', { [key]: (event.target as HTMLSelectElement).value })
}

function setButtonStyle(event: Event) {
  const style = (event.target as HTMLSelectElement).value
  const patch: Record<string, unknown> = { style }
  if (style !== 'link') {
    patch.href = null
    if (!attrs.value.id) patch.id = `action-${crypto.randomUUID().slice(0, 8)}`
  }
  emit('patch', patch)
}
</script>

<template>
  <aside class="sidebar inspector-panel">
    <div class="sidebar-heading inspector-heading">
      <span class="eyebrow">INSPECT</span>
      <h2>属性设置</h2>
      <p>所有修改均通过 transaction 提交</p>
    </div>

    <div v-if="!selected" class="empty-inspector">
      <span class="empty-icon"><Settings2 :size="24" /></span>
      <strong>选择一个内容块</strong>
      <p>点击画布里的文字、图片、按钮或表格，相关协议属性会显示在这里。</p>
    </div>

    <template v-else>
      <div class="selected-summary">
        <div>
          <small>当前模块</small>
          <strong>{{ names[type] || type }}</strong>
        </div>
        <code>{{ type }}</code>
      </div>

      <section v-if="type === 'heading'" class="property-section">
        <h3>标题设置</h3>
        <label class="field-label">
          <span>标题级别</span>
          <select :value="attrs.level" @change="selectPatch('level', $event)">
            <option v-for="level in 6" :key="level" :value="level">H{{ level }}</option>
          </select>
        </label>
      </section>

      <section v-if="type === 'paragraph' || type === 'heading'" class="property-section">
        <h3>文字对齐</h3>
        <div class="segmented align-control">
          <button type="button" :class="{ active: !attrs.textAlign || attrs.textAlign === 'left' }" title="左对齐" @click="emit('patch', { textAlign: 'left' })"><AlignLeft :size="17" /></button>
          <button type="button" :class="{ active: attrs.textAlign === 'center' }" title="居中" @click="emit('patch', { textAlign: 'center' })"><AlignCenter :size="17" /></button>
          <button type="button" :class="{ active: attrs.textAlign === 'right' }" title="右对齐" @click="emit('patch', { textAlign: 'right' })"><AlignRight :size="17" /></button>
          <button type="button" :class="{ active: attrs.textAlign === 'justify' }" title="两端对齐" @click="emit('patch', { textAlign: 'justify' })"><AlignJustify :size="17" /></button>
        </div>
      </section>

      <section v-if="type === 'image'" class="property-section">
        <h3>图片资源</h3>
        <label class="field-label">
          <span>图片地址 <em>必填</em></span>
          <input :value="attrs.src" type="url" placeholder="https://…" @change="textPatch('src', $event)" />
        </label>
        <label class="field-label">
          <span>替代文本</span>
          <input :value="attrs.alt" type="text" placeholder="描述图片内容" @change="optionalTextPatch('alt', $event)" />
        </label>
        <label class="field-label">
          <span>图片标题</span>
          <input :value="attrs.title" type="text" placeholder="可选" @change="optionalTextPatch('title', $event)" />
        </label>
        <div class="field-row">
          <label class="field-label">
            <span>宽度 px</span>
            <input :value="attrs.width" type="number" min="1" max="10000" placeholder="自动" @change="numberPatch('width', $event)" />
          </label>
          <label class="field-label">
            <span>高度 px</span>
            <input :value="attrs.height" type="number" min="1" max="10000" placeholder="自动" @change="numberPatch('height', $event)" />
          </label>
        </div>
        <label class="field-label">
          <span>图片对齐</span>
          <select :value="attrs.imageAlign || 'center'" @change="selectPatch('imageAlign', $event)">
            <option value="left">左对齐</option>
            <option value="center">居中</option>
            <option value="right">右对齐</option>
          </select>
        </label>
      </section>

      <section v-if="type === 'articleButton'" class="property-section">
        <h3>操作设置</h3>
        <label class="field-label">
          <span>显示文字 <em>必填</em></span>
          <input :value="attrs.text" type="text" @change="textPatch('text', $event)" />
        </label>
        <label class="field-label">
          <span>展示样式</span>
          <select :value="attrs.style" @change="setButtonStyle">
            <option value="text">文字操作</option>
            <option value="button">按钮操作</option>
            <option value="link">超链接</option>
          </select>
        </label>
        <label v-if="attrs.style !== 'link'" class="field-label">
          <span>业务 ID <em>必填</em></span>
          <input :value="attrs.id" type="text" @change="textPatch('id', $event)" />
        </label>
        <label v-else class="field-label">
          <span>跳转地址</span>
          <input :value="attrs.href" type="url" placeholder="https://…" @change="optionalTextPatch('href', $event)" />
        </label>
        <label class="field-label">
          <span>说明标题</span>
          <input :value="attrs.title" type="text" placeholder="可选" @change="optionalTextPatch('title', $event)" />
        </label>
      </section>

      <section v-if="type === 'orderedList'" class="property-section">
        <h3>列表设置</h3>
        <label class="field-label">
          <span>起始序号</span>
          <input :value="attrs.start || 1" type="number" min="1" @change="numberPatch('start', $event)" />
        </label>
      </section>

      <section v-if="type === 'codeBlock'" class="property-section">
        <h3>代码设置</h3>
        <label class="field-label">
          <span>语言标识</span>
          <input :value="attrs.language" type="text" maxlength="32" placeholder="typescript" @change="optionalTextPatch('language', $event)" />
        </label>
      </section>

      <section v-if="['table', 'tableRow', 'tableCell'].includes(type)" class="property-section">
        <h3>表格结构</h3>
        <div class="table-actions">
          <button type="button" @click="emit('tableCommand', 'addRowAfter')">添加行</button>
          <button type="button" @click="emit('tableCommand', 'addColumnAfter')">添加列</button>
          <button type="button" @click="emit('tableCommand', 'deleteRow')">删除行</button>
          <button type="button" @click="emit('tableCommand', 'deleteColumn')">删除列</button>
        </div>
      </section>

      <section v-if="['blockquote', 'bulletList', 'listItem', 'horizontalRule'].includes(type)" class="property-section property-help">
        <h3>协议说明</h3>
        <p>该节点在 v1 中没有可配置属性。内容可直接在画布中编辑。</p>
      </section>

      <section class="property-section node-actions">
        <h3>模块操作</h3>
        <div class="icon-actions">
          <button type="button" :disabled="!canMoveUp" title="上移" @click="emit('move', -1)"><ArrowUp :size="17" /></button>
          <button type="button" :disabled="!canMoveDown" title="下移" @click="emit('move', 1)"><ArrowDown :size="17" /></button>
          <button type="button" title="复制" @click="emit('duplicate')"><Copy :size="17" /></button>
          <button class="danger" type="button" title="删除" @click="emit('remove')"><Trash2 :size="17" /></button>
        </div>
        <small v-if="!isTopLevel">移动操作针对所在的顶层模块。</small>
      </section>
    </template>
  </aside>
</template>
