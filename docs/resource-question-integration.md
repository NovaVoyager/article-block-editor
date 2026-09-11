# 资源问题：编辑器接入

资源问题是文章顶层的 `resourceQuestion` 节点。选择时将完整问题数据保存到 `attrs`，之后导入/预览文章不请求资源接口。独立渲染器不在本包内实现。

## 宿主选择组件

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { ArticleEditor, createEmptyDocument } from '@nova_voyager/article-block-editor'
import type { ResourceQuestionData } from '@nova_voyager/article-block-editor'
import '@nova_voyager/article-block-editor/style.css'
import MyResourcePicker from './MyResourcePicker.vue'

const article = ref(createEmptyDocument())
// MyResourcePicker 自行处理接口请求、搜索、分页、鉴权和失败重试。
// confirm 事件返回 ResourceQuestionData，而非只有 resourceId。
const example: ResourceQuestionData = {
  resourceId: 'resource-123',
  title: '你的入睡时间是多久？',
  description: '请选择符合你的情况',
  options: [{ id: 'option-a', label: '5 分钟以内' }],
}
</script>

<template>
  <ArticleEditor v-model="article">
    <template #resource-question-picker="{ current, select, cancel }">
      <MyResourcePicker :current="current" @confirm="select" @cancel="cancel" />
    </template>
  </ArticleEditor>
</template>
```

槽在用户点击“选择/更换资源问题”后挂载于编辑器提供的弹框内。弹框处理关闭按钮、Escape、基础焦点约束及关闭后的焦点恢复；宿主通常不必再创建一层弹框。如果宿主使用浮层下拉列表，建议挂载在槽内，而非 teleport 到 body，以保持焦点约束。

作用域类型 `ResourceQuestionPickerScope`：

| 字段 | 说明 |
| --- | --- |
| `current` | 当前模块属性的独立快照，包含实例 ID、已有配置；不是响应式编辑入口，不应修改 |
| `select(data)` | 校验并保存，成功返回 `true` 并关闭；失败返回 `false`，保留弹框和原内容 |
| `cancel()` | 取消，不改文章 |

`ResourceQuestionData` 的 `resourceId`、`title`、选项 `id` 和 `label` 必须为非空字符串；`description` 为字符串，可为空；至少一个选项。选项 ID 必须在问题内唯一，文案可以重复。数字 ID 请在宿主边界用 `String(id)` 转换，编辑器不生成或替换外部 ID。API 附加字段不会写入协议。

选入的数据深拷贝到属性，宿主随后修改原对象不会污染文章。切换为另一资源 ID 时清除所有旧段落绑定；再次选择同一资源时，按相同的选项 ID 保留绑定，更新文案/顺序，删除消失的选项，新选项不绑定。两种情况都保留模块实例 ID、hideFollowing 和 revealKey。

取消、变为只读、删除模块、卸载、载入另一篇文章后，旧 `select` 回调返回 `false`，不会把迟到的接口结果写到新的目标。校验失败触发 `error`，`source='resourceQuestion'`。无槽时显示接入提示，不模拟资源接口。

## 配置段落跳转

1. 在左侧扩展分组插入资源问题，选择资源。
2. 选中问题模块，在右侧搜索正文或标题。下拉列表展示顺序、节点类型和文字摘要。
3. 为各选项选择目标。首次绑定时自动给目标写入 `attrs.anchorId`；已有锚点复用。
4. 点击“定位查看”或画布内的选项测试滚动。使用当前编辑器的内容滚动区，并以短暂高亮标出目标。
5. “清除绑定”只移除该选项的 `targetAnchorId`，不删除段落锚点，其他选项仍可引用它。

锚点创建与绑定通过同一次 ProseMirror transaction 提交，撤销/重做同时恢复两者。修改文字、移动段落、正文和标题互转不改变已有锚点；段落拆分时新段不继承旧锚点。复制或粘贴的段落使用新锚点，旧绑定仍指向原目标。复制问题生成新实例 ID 和 revealKey，保留快照及目标配置。

合并/删除段落可能使原锚点不再存在。失效关联保留在 JSON 中，右侧会警告并允许重选或清除；不会按段落位置或文字猜测新的目标，也不会因悬空引用丢弃整篇文章。

也可通过公开 API 定位：

```ts
const found = editorRef.value?.scrollToAnchor('paragraph-abc')
// true: 目标存在并已发起滚动；false: 实例未就绪/已卸载或目标不存在。
// 不修改正文、选区或撤销历史；只读时也可调用。
```

## 隐藏设置

右侧“隐藏后续内容”默认关闭，`revealKey` 自动生成并支持修改，必须非空且在文档内唯一。编辑器和其只读预览始终显示全文；开启时卡片显示配置提示。点击选项只测试跳转，不触发业务解锁。

卡片中的“已配置隐藏后续内容”及“此文字不会显示在最终渲染上，只在编辑器内提示”均为编辑器 UI，不写入文章 JSON 或序列化 HTML。独立渲染器无需展示这些文字。

实际隐藏与解锁由其他项目的渲染器按 [渲染约定](resource-question-rendering.md) 实现。

## 协议与 Demo

- “下载协议”得到当前安装版本的 `article-content-protocol-latest.json`，包含新增节点、锚点、完整 Schema 和 `resourceQuestionRules`。
- 也可 `import { getCurrentProtocol } from '@nova_voyager/article-block-editor'` 获取独立协议副本。
- `validateProtocolDocument` 同时执行结构校验与身份唯一性检查；旧文档不必增加新字段，原始 v1 定义不变。
- `npm run dev` 后点击顶部“资源问题示例”。Demo 的资源选择器是普通宿主组件，不进入 npm 产物，不请求真实服务。
- 保存通过现有 `save` / `v-model` 接口交给宿主，资源问题不增加自动存储行为。
