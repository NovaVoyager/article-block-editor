<script setup lang="ts">
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3'
import { ExternalLink, GripVertical } from '@lucide/vue'

defineProps(nodeViewProps)
</script>

<template>
  <NodeViewWrapper
    class="article-button-node"
    :class="[{ 'is-selected': selected }, `variant-${node.attrs.style}`]"
    data-type="article-button"
  >
    <button class="node-grip" type="button" data-drag-handle aria-label="拖动按钮模块">
      <GripVertical :size="16" />
    </button>
    <span class="article-action" :title="node.attrs.title || undefined">
      {{ node.attrs.text }}
      <ExternalLink v-if="node.attrs.style === 'link'" :size="14" />
    </span>
  </NodeViewWrapper>
</template>
