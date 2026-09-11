<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { CircleHelp, GripVertical } from '@lucide/vue'
import type { ResourceQuestionAttrs } from '../../editor/resource-question'
const props = defineProps(nodeViewProps)
const question = computed(() => props.node.attrs as ResourceQuestionAttrs)
const imageFailed = ref(false)
watch(() => question.value.image?.src, () => { imageFailed.value = false })
function choose() {
  if (!props.editor.isEditable) return
  const pos = props.getPos()
  if (typeof pos === 'number') props.editor.commands.setNodeSelection(pos)
  props.extension.options.onChoose?.(question.value.id)
}
</script>

<template>
  <NodeViewWrapper class="resource-question-node" :class="{ 'is-selected': selected }" data-type="resource-question" :data-question-id="question.id">
    <button v-if="editor.isEditable" class="node-grip" type="button" data-drag-handle aria-label="拖动资源问题模块"><GripVertical :size="16" /></button>
    <div class="resource-question-card" contenteditable="false">
      <img v-if="question.image && !imageFailed" class="resource-question-image" :src="question.image.src" :alt="question.image.alt ?? ''" :title="question.image.title" :width="question.image.width" :height="question.image.height" draggable="false" @error="imageFailed = true" />
      <p v-else-if="question.image" class="resource-image-error" role="status">问题图片加载失败，请检查图片地址</p>
      <h3><CircleHelp :size="24" aria-hidden="true" />{{ question.title || '请选择资源问题' }}</h3>
      <p v-if="question.description" class="resource-description">{{ question.description }}</p>
      <div class="resource-options">
        <button v-for="option in question.options" :key="option.id" type="button" class="resource-option" :data-option-id="option.id" @click.stop="extension.options.onNavigate?.(option.targetAnchorId)">
          <span class="resource-option-dot" aria-hidden="true" />{{ option.label }}
        </button>
      </div>
      <button v-if="editor.isEditable" type="button" class="action-button ghost resource-choose" @click.stop="choose">{{ question.resourceId ? '更换资源问题' : '选择资源问题' }}</button>
      <small v-if="question.hideFollowing" class="resource-gate-note">
        已配置隐藏后续内容 · 编辑器仍显示全文<br />
        此文字不会显示在最终渲染上，只在编辑器内提示
      </small>
    </div>
  </NodeViewWrapper>
</template>
