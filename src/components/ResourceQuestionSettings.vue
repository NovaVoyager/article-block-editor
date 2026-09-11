<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { ParagraphTarget, ResourceQuestionAttrs } from '../editor/resource-question'
const props = defineProps<{ question: ResourceQuestionAttrs; targets: ParagraphTarget[]; readonly?: boolean }>()
const emit = defineEmits<{
  choose: []
  bind: [optionId: string, targetPos: number | null]
  navigate: [anchorId?: string]
  patch: [attrs: Record<string, unknown>]
}>()
const search = ref('')
watch(() => props.question.id, () => { search.value = '' })
const filtered = computed(() => props.targets.filter(target => target.label.toLowerCase().includes(search.value.toLowerCase())))
const targetFor = (anchor?: string) => anchor ? props.targets.find(target => target.anchorId === anchor) : undefined
function optionsFor(anchor?: string) {
  const current = targetFor(anchor)
  return current && !filtered.value.includes(current) ? [current, ...filtered.value] : filtered.value
}
function bind(optionId: string, event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value === 'missing') return
  emit('bind', optionId, value === '' ? null : Number(value))
}
async function updateRevealKey(event: Event) {
  const input = event.target as HTMLInputElement
  emit('patch', { revealKey: input.value })
  await nextTick()
  // A rejected empty/duplicate value must not look as though it was saved.
  input.value = props.question.revealKey
}
</script>

<template>
  <section class="property-section resource-settings">
    <h3>资源问题</h3>
    <p class="resource-help">{{ question.resourceId ? `资源 ID：${question.resourceId}` : '尚未选择资源' }} · 保存快照，不自动请求更新</p>
    <button class="action-button ghost" type="button" :disabled="readonly" @click="emit('choose')">{{ question.resourceId ? '更换资源问题' : '选择资源问题' }}</button>
    <label class="field-label"><span>问题名</span><input :value="question.title" readonly /></label>
    <label class="field-label"><span>问题描述</span><textarea :value="question.description" readonly rows="3" /></label>
    <h3>选项跳转段落</h3>
    <label class="field-label"><span>搜索正文或标题</span><input v-model="search" type="search" placeholder="输入目标段落文字" /></label>
    <div v-for="option in question.options" :key="option.id" class="resource-binding">
      <strong>{{ option.label }}</strong><small>选项 ID：{{ option.id }}</small>
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
      </div>
    </div>
    <p v-if="!question.options.length" class="resource-help">选择资源后即可为每个选项绑定目标段落。</p>
    <label class="resource-switch"><input type="checkbox" :checked="question.hideFollowing" :disabled="readonly" @change="emit('patch', { hideFollowing: ($event.target as HTMLInputElement).checked })" />隐藏后续内容</label>
    <label class="field-label"><span>解锁标识 revealKey</span><input :value="question.revealKey" :disabled="readonly" @change="updateRevealKey" /></label>
    <p class="resource-help">由独立渲染器执行隐藏，宿主传入此标识后解锁。编辑器（含只读预览）始终显示全文，点击选项只测试定位。</p>
  </section>
</template>
