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
import type { SelectedNode } from '../editor/types'
import type { TableCommand, TableContext } from '../editor/table'
import { normalizeFontSize } from '../editor/font-size'
import { normalizeImageLayout } from '../editor/image-layout'
import ImageFilePicker from './ImageFilePicker.vue'
import ResourceQuestionSettings from './ResourceQuestionSettings.vue'
import type { ParagraphTarget, ResourceQuestionAttrs } from '../editor/resource-question'

const props = defineProps<{
  selected: SelectedNode | null
  table: TableContext | null
  readonly?: boolean
  topLevelCount: number
  canUpload?: boolean
  uploading?: boolean
  canPairNextImage?: boolean
  paragraphTargets?: ParagraphTarget[]
}>()

const emit = defineEmits<{
  patch: [attributes: Record<string, unknown>]
  move: [direction: -1 | 1]
  duplicate: []
  remove: []
  tableCommand: [command: TableCommand]
  uploadImage: [files: File[]]
  uploadQuestionImage: [files: File[]]
  pairImages: []
  chooseResource: []
  bindOption: [optionId: string, targetPos: number | null]
  navigateAnchor: [anchorId?: string]
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
  resourceQuestion: '资源问题',
  table: '表格',
  tableRow: '表格行',
  tableCell: '表格单元格',
}

const type = computed(() => props.selected?.node.type.name ?? '')
const attrs = computed<Record<string, unknown>>(() => props.selected?.node.attrs ?? {})
const presetFontSizes = [8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 40, 48, 56, 64, 72, 80, 96]
const fontSizeOptions = computed(() => {
  const current = normalizeFontSize(attrs.value.fontSize)
  // Keep older documents' non-preset sizes visible without rewriting their JSON.
  return current !== null && !presetFontSizes.includes(current)
    ? [...presetFontSizes, current].sort((a, b) => a - b)
    : presetFontSizes
})
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

function fontSizePatch(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value === '') {
    emit('patch', { fontSize: null })
    return
  }
  const size = normalizeFontSize(Number(value))
  if (size !== null) emit('patch', { fontSize: size })
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

      <section v-if="table" class="property-section table-structure">
        <h3>表格结构</h3>
        <p class="table-size" aria-live="polite">{{ table.rows }} 行 × {{ table.columns }} 列</p>
        <div class="table-actions" @mousedown.prevent>
          <button type="button" :disabled="readonly" title="在当前行下方添加一行" @click="emit('tableCommand', 'addRowAfter')">添加行</button>
          <button type="button" :disabled="readonly" title="在当前列右侧添加一列" @click="emit('tableCommand', 'addColumnAfter')">添加列</button>
          <button type="button" :disabled="readonly || !table.canDeleteRow" title="删除选中的行，至少保留一行" @click="emit('tableCommand', 'deleteRow')">删除行</button>
          <button type="button" :disabled="readonly || !table.canDeleteColumn" title="删除选中的列，至少保留一列" @click="emit('tableCommand', 'deleteColumn')">删除列</button>
        </div>
        <p class="table-help">点击单元格后操作对应行列；选中整表时操作末行、末列。</p>
      </section>

      <section v-if="type === 'heading'" class="property-section">
        <h3>标题设置</h3>
        <label class="field-label">
          <span>标题级别</span>
          <select :value="attrs.level" @change="selectPatch('level', $event)">
            <option v-for="level in 6" :key="level" :value="level">H{{ level }}</option>
          </select>
        </label>
      </section>

      <section v-if="type === 'paragraph'" class="property-section property-help">
        <h3>正文设置</h3>
        <div class="field-row">
          <label class="field-label">
            <span>字体大小 px</span>
            <select
              :value="attrs.fontSize ?? ''"
              aria-label="正文字体大小"
              @change="fontSizePatch"
            >
              <option value="">默认字号</option>
              <option v-for="size in fontSizeOptions" :key="size" :value="size">{{ size }} px</option>
            </select>
          </label>
          <button class="action-button ghost font-size-reset" type="button" :disabled="attrs.fontSize == null" @click="emit('patch', { fontSize: null })">恢复默认字号</button>
        </div>
        <p class="font-size-help">整段生效；选择“默认字号”继承原有样式。</p>
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
          <span>图片排版</span>
          <select :value="attrs.imageLayout ?? ''" aria-label="图片排版" :disabled="readonly" @change="emit('patch', { imageLayout: normalizeImageLayout(($event.target as HTMLSelectElement).value) })">
            <option value="">独占一行</option>
            <option value="two-column">一行两张</option>
          </select>
        </label>
        <button class="action-button ghost pair-images-button" type="button" :disabled="readonly || !canPairNextImage" @click="emit('pairImages')">与下一张图片并排</button>
        <p class="image-upload-help">连续图片均设为“一行两张”后并排，中间的正文会另起一行。快捷操作需下一模块也是图片。</p>
        <ImageFilePicker class="replace-image-picker" label="上传并替换图片" :disabled="!canUpload || uploading" @files="emit('uploadImage', $event)" />
        <p class="image-upload-help">{{ canUpload ? '上传成功后替换当前图片；也可填写下方地址。' : '宿主配置 uploadImage 后可上传图片。' }}</p>
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

      <ResourceQuestionSettings v-if="type === 'resourceQuestion'" :question="attrs as unknown as ResourceQuestionAttrs" :targets="paragraphTargets ?? []" :readonly="readonly"
        :can-upload="canUpload" :uploading="uploading" @upload="emit('uploadQuestionImage', $event)"
        @choose="emit('chooseResource')" @bind="(optionId, pos) => emit('bindOption', optionId, pos)" @navigate="emit('navigateAnchor', $event)" @patch="emit('patch', $event)" />

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
