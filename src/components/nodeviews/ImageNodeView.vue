<script setup lang="ts">
import { computed } from 'vue'
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { GripVertical, ImageIcon } from '@lucide/vue'
import { normalizeImageLayout } from '../../editor/image-layout'

const props = defineProps(nodeViewProps)

const alignmentClass = computed(() => `align-${props.node.attrs.imageAlign || 'center'}`)
const layout = computed(() => normalizeImageLayout(props.node.attrs.imageLayout))
const hasDimensions = computed(() => Boolean(props.node.attrs.width && props.node.attrs.height))
const imageStyle = computed(() => ({
  width: props.node.attrs.width ? `${props.node.attrs.width}px` : undefined,
  // Keep both dimensions in JSON, but scale the height with the constrained width.
  height: hasDimensions.value
    ? 'auto'
    : props.node.attrs.height ? `${props.node.attrs.height}px` : undefined,
  aspectRatio: hasDimensions.value
    ? `${props.node.attrs.width} / ${props.node.attrs.height}`
    : undefined,
}))
</script>

<template>
  <NodeViewWrapper
    class="media-node"
    :class="[alignmentClass, { 'is-selected': selected }]"
    data-type="image"
    :data-image-layout="layout || undefined"
  >
    <button class="node-grip" type="button" data-drag-handle aria-label="拖动图片模块">
      <GripVertical :size="16" />
    </button>
    <img
      v-if="node.attrs.src"
      :src="node.attrs.src"
      :alt="node.attrs.alt || ''"
      :title="node.attrs.title || undefined"
      :style="imageStyle"
      draggable="false"
    />
    <div v-else class="media-placeholder">
      <ImageIcon :size="28" />
      <span>请在右侧填写图片地址</span>
    </div>
    <span v-if="node.attrs.alt" class="image-caption">{{ node.attrs.alt }}</span>
  </NodeViewWrapper>
</template>
