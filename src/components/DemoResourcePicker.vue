<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ResourceQuestionData, ResourceQuestionAttrs } from '../editor/resource-question'
import { demoQuestions } from '../demo-resource-question'
const props = defineProps<{ current: ResourceQuestionAttrs }>()
const emit = defineEmits<{ confirm: [data: ResourceQuestionData]; cancel: [] }>()
const search = ref('')
const questions = computed(() => demoQuestions.filter(question => question.title.includes(search.value)))
</script>
<template>
  <div class="demo-resource-picker">
    <p>这是 Demo 的宿主资源组件。真实项目可替换为自己的接口搜索列表。</p>
    <label>搜索资源<input v-model="search" placeholder="输入问题名" /></label>
    <button v-for="question in questions" :key="question.resourceId" type="button" @click="emit('confirm', question)">
      <strong>{{ question.title }}</strong><span>{{ question.description }}</span><small>{{ question.options.length }} 个选项 {{ props.current.resourceId === question.resourceId ? '· 当前资源' : '' }}</small>
    </button>
    <p v-if="!questions.length">没有匹配的资源</p>
    <button type="button" @click="emit('cancel')">取消</button>
  </div>
</template>
