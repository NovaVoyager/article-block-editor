<script setup lang="ts">
import { ref } from 'vue'
import DefaultEditor, { ArticleEditor, createEmptyDocument, validateProtocolDocument } from 'article-block-editor'
import type { ArticleEditorExpose, ArticleEditorError, ArticleEditorProps, ProseMirrorJSON } from 'article-block-editor'
import 'article-block-editor/style.css'

const content = ref<ProseMirrorJSON>({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '独立项目通过 npm 安装的编辑器' }] }] })
const second = ref(createEmptyDocument())
const api = ref<ArticleEditorExpose | null>(null)
const readonly = ref(false)
const status = ref('尚未保存')
const changes = ref(0)
const options: ArticleEditorProps = { height: 600 }
const onSave = (value: ProseMirrorJSON) => { status.value = validateProtocolDocument(value).valid ? '宿主保存事件成功' : '文档无效' }
const onError = (error: ArticleEditorError) => { status.value = error.message }
</script>
<template>
  <main>
    <h1>独立宿主项目</h1>
    <button id="host-button">宿主按钮（不应被组件样式覆盖）</button>
    <label><input v-model="readonly" type="checkbox">宿主只读开关</label>
    <button @click="api?.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '宿主异步加载的新文章' }] }] })">宿主替换内容</button>
    <p role="status">{{ status }} · change {{ changes }}</p>
    <ArticleEditor ref="api" v-model="content" v-bind="options" :readonly="readonly" @change="changes++" @save="onSave" @error="onError" />
    <h2>窄容器中的第二实例</h2>
    <section style="max-width: 860px"><DefaultEditor v-model="second" :height="500" :show-inspector="false" /></section>
  </main>
</template>
<style>
body { margin: 24px; background: #fff; font-family: sans-serif; }
#host-button { color: rgb(12, 34, 56); font-size: 19px; }
</style>
