<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ParagraphTarget, ResourceQuestionAttrs } from '../editor/resource-question'
import ImageFilePicker from './ImageFilePicker.vue'
const props = defineProps<{ question: ResourceQuestionAttrs; targets: ParagraphTarget[]; readonly?: boolean; canUpload?: boolean; uploading?: boolean }>()
const emit = defineEmits<{
  choose: []
  bind: [optionId: string, targetPos: number | null]
  navigate: [anchorId?: string]
  patch: [attrs: Record<string, unknown>]
  upload: [files: File[]]
}>()
const search = ref('')
watch(() => props.question.id, () => { search.value = '' })
const filtered = computed(() => props.targets.filter(target => target.label.toLowerCase().includes(search.value.toLowerCase())))
const targetFor = (anchor?: string) => anchor ? props.targets.find(target => target.anchorId === anchor) : undefined
function optionsFor(anchor?: string) {
  const current = targetFor(anchor)
  return current && !filtered.value.includes(current) ? [current, ...filtered.value] : filtered.value
}
async function bind(optionId: string, event: Event) {
  const input = event.target as HTMLSelectElement
  const value = input.value
  if (value === 'missing') return
  emit('bind', optionId, value === '' ? null : Number(value))
  await nextTick()
  // Native selects otherwise keep a rejected value visible although JSON was not changed.
  const anchor = props.question.options.find(option => option.id === optionId)?.targetAnchorId
  input.value = String(targetFor(anchor)?.pos ?? (anchor ? 'missing' : ''))
}
async function updateRevealKey(event: Event) {
  const input = event.target as HTMLInputElement
  emit('patch', { revealKey: input.value })
  await nextTick()
  // A rejected empty/duplicate value must not look as though it was saved.
  input.value = props.question.revealKey
}
async function updateImageSource(event: Event) {
  const input = event.target as HTMLInputElement
  const src = input.value.trim()
  if (src !== (props.question.image?.src ?? '')) emit('patch', { image: src ? { src } : null })
  await nextTick()
  input.value = props.question.image?.src ?? ''
}
</script>

<template>
  <section class="property-section resource-settings">
    <h3>资源问题</h3>
    <p class="resource-help">{{ question.resourceId ? `资源 ID：${question.resourceId}` : '尚未选择资源' }} · 保存快照，不自动请求更新</p>
    <button class="action-button ghost" type="button" :disabled="readonly" @click="emit('choose')">{{ question.resourceId ? '更换资源问题' : '选择资源问题' }}</button>
    <div class="resource-image-settings">
      <h3>标题上方图片</h3>
      <ImageFilePicker label="上传问题图片" :disabled="readonly || !canUpload || uploading" @files="emit('upload', $event)" />
      <p class="resource-help">{{ canUpload ? '可从资源带入，也可单独上传替换；上传成功前保留原图。' : '可从资源带入；宿主配置 uploadImage 后可单独上传。' }}</p>
      <label class="field-label"><span>问题图片地址</span><input :value="question.image?.src ?? ''" :disabled="readonly" type="url" placeholder="可选，https://… 或相对地址" @change="updateImageSource" /></label>
      <label v-if="question.image" class="field-label"><span>图片替代文本</span><input :value="question.image.alt ?? ''" :disabled="readonly" @change="emit('patch', { image: { ...question.image, alt: ($event.target as HTMLInputElement).value } })" /></label>
      <button class="action-button ghost resource-image-remove" type="button" :disabled="readonly || (!question.image && !uploading)" @click="emit('patch', { image: null })">移除问题图片</button>
      <p class="resource-help">重新选择资源会同步其图片；资源未提供图片时清空当前图。</p>
    </div>
    <label class="field-label"><span>问题名</span><input :value="question.title" readonly /></label>
    <label class="field-label"><span>问题描述</span><textarea :value="question.description" readonly rows="3" /></label>
    <h3>选项跳转段落</h3>
    <p class="resource-help">新绑定使用选项 ID 作为段落锚点。旧绑定可重新选择目标或点击“使用选项 ID 作为锚点”转换；冲突时保留原绑定。</p>
    <label class="field-label"><span>搜索正文或标题</span><input v-model="search" type="search" placeholder="输入目标段落文字" /></label>
    <div v-for="option in question.options" :key="option.id" class="resource-binding">
      <strong>{{ option.label }}</strong><small>选项 ID：{{ option.id }}</small>
      <small v-if="option.targetAnchorId">目标锚点：{{ option.targetAnchorId }}</small>
      <label class="field-label">
        <span>目标段落</span>
        <select :aria-label="`${option.label}的目标段落`" :disabled="readonly" :value="targetFor(option.targetAnchorId)?.pos ?? (option.targetAnchorId ? 'missing' : '')" @change="bind(option.id, $event)">
          <option value="">不跳转</option>
          <option v-if="option.targetAnchorId && !targetFor(option.targetAnchorId)" value="missing" disabled>目标段落已失效，请重新绑定</option>
          <option v-for="target in optionsFor(option.targetAnchorId)" :key="target.pos" :value="target.pos">{{ target.label }}</option>
        </select>
      </label>
      <p v-if="option.targetAnchorId && !targetFor(option.targetAnchorId)" class="resource-warning" role="status">原目标已不存在，不会执行跳转。</p>
      <div class="resource-binding-actions">
        <button class="action-button ghost" type="button" :disabled="!targetFor(option.targetAnchorId)" @click="emit('navigate', option.targetAnchorId)">定位查看</button>
        <button class="action-button ghost" type="button" :disabled="readonly || !option.targetAnchorId" @click="emit('bind', option.id, null)">清除绑定</button>
        <button v-if="option.targetAnchorId && option.targetAnchorId !== option.id && targetFor(option.targetAnchorId)" class="action-button ghost" type="button" :disabled="readonly" @click="emit('bind', option.id, targetFor(option.targetAnchorId)!.pos)">使用选项 ID 作为锚点</button>
      </div>
    </div>
    <p v-if="!question.options.length" class="resource-help">选择资源后即可为每个选项绑定目标段落。</p>
    <label class="resource-switch"><input type="checkbox" :checked="question.hideFollowing" :disabled="readonly" @change="emit('patch', { hideFollowing: ($event.target as HTMLInputElement).checked })" />隐藏后续内容</label>
    <label class="field-label"><span>解锁标识 revealKey</span><input :value="question.revealKey" :disabled="readonly" @change="updateRevealKey" /></label>
    <p class="resource-help">由独立渲染器执行隐藏，宿主传入此标识后解锁。编辑器（含只读预览）始终显示全文，点击选项只测试定位。</p>
  </section>
</template>
