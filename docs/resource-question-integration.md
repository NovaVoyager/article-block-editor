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
  image: { src: '/images/sleep-question.png', alt: '睡眠问题配图', width: 960, height: 360 }, // 可选
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

## 标题上方图片

`ResourceQuestionData` 新增可选 `image`，选中后保存为问题节点的 `attrs.image` 快照，显示在问题名上方。公开类型 `ResourceQuestionImage` 与现有 `ImageUploadResult` 字段一致：

```ts
interface ResourceQuestionImage {
  src: string
  alt?: string
  title?: string
  width?: number
  height?: number
}
```

- 从资源带入：宿主将 API 的图片字段转换为 `image: { src, alt, ... }`，随其他问题字段一起交给 `select(data)`。不使用只有地址的 `image` 字符串，不保存文件对象或额外 API 字段。
- 单独上传：给 `ArticleEditor` 配置已有的 `uploadImage` 回调（无新增上传接口），选中资源问题后点击右侧“上传问题图片”。上传回调接收 `(file, { signal })`，返回图片地址字符串或 `ImageUploadResult`；文件限制复用 `maxImageSize`。
- 可直接修改“问题图片地址”、替代文本或点击“移除问题图片”。更换地址会重置旧图的尺寸等元数据；单独上传未返回的旧图元数据也不会继承。
- 上传只更新当前问题的 image，不插入独立图片节点，不改变问题文字、选项、段落绑定、hideFollowing 或 revealKey。支持撤销/重做，上传期间保留旧图并阻止保存。
- **重新选择资源时，无论资源 ID 是否相同，都以新快照图片为准。** 未提供 image 或传入 null 表示没有图片，会清空先前的资源图或手动上传图。
- 图片数据深拷贝保存，不随外部对象修改变化。旧文档省略 image 时继续正常工作，不补空图片、不留图片占位间距；移除后导出 JSON 省略 image，而不是保存 null。
- 地址支持持久 HTTP(S)、相对地址，以及 Demo 使用的 PNG/JPEG/WebP/GIF/AVIF/BMP base64 Data URL。拒绝临时 blob、可执行协议、SVG Data URL、空白地址及无效尺寸。width/height 为可选的 1～10000 整数。
- 移动模块、切换选区不会改变上传目标；删除模块、重选资源、修改/移除图片、替换文章、只读或卸载会取消对应上传，即使宿主忽略 AbortSignal，迟到结果也不会写入。上传失败触发 `error`，`source='upload'`，原图不变。

上传回调接入示意（服务调用由宿主项目实现）：

```vue
<ArticleEditor v-model="article" :upload-image="uploadArticleImage">
  <template #resource-question-picker="{ current, select, cancel }">
    <MyResourcePicker :current="current" @confirm="select" @cancel="cancel" />
  </template>
</ArticleEditor>
```

`uploadArticleImage` 是宿主自己的 `ImageUploadHandler`，与普通图片共用。没有回调时上传按钮禁用，但仍可从资源带图或填写持久地址。Demo 继续使用本地 Data URL 上传演示，不调用真实上传服务。

## 配置段落跳转

1. 在左侧扩展分组插入资源问题，选择资源。
2. 选中问题模块，在右侧搜索正文或标题。下拉列表展示顺序、节点类型和文字摘要。
3. 为各选项选择目标。新绑定将目标的 `attrs.anchorId` 和选项的 `targetAnchorId` 都设为该选项的外部 `id`，例如 `AUV6gOa9`。
4. 点击“定位查看”或画布内的选项测试滚动。使用当前编辑器的内容滚动区，并以短暂高亮标出目标。
5. “清除绑定”只移除该选项的 `targetAnchorId`，不删除段落锚点，其他选项仍可引用它。

旧文章导入时不自动改写 `paragraph-…` 锚点。要转换已有绑定，可重新选择目标段落，或点击对应选项的“使用选项 ID 作为锚点”；右侧同时展示选项 ID 和实际目标锚点，转换成功后两者一致。保存并重新加载该文章 JSON 后，下游即可使用选项 ID 定位。

冲突处理遵守文档内锚点唯一性，不静默覆盖：

- 同一个选项 ID 可以被不同问题共同绑定到同一段落，但不能同时作为两个不同段落的锚点。
- 重新绑定到另一段落时，若原选项锚点没有其他选项引用，则将它移到新段落，原段落正文保持不变。若已被其他问题引用，则拒绝本次操作，提示先清除冲突绑定。
- 如果目标段落的旧锚点被不同 ID 的选项引用，拒绝改名，保留旧绑定。可选择不同段落，或显式清除冲突后再转换。旧版多个不同选项共用一个段落的 JSON 仍能正常导入、展示和跳转。
- 如果其他引用来自同 ID 的选项（例如复制的问题），转换旧目标锚点时会同步更新这些引用，仍指向同一段落。整个转换/迁移只占一个撤销步骤。
- 不按选项 ID 自动修复其他问题的悬空引用，也不在选入外部资源时批量迁移旧锚点。

HTML 仍使用 `data-anchor-id="AUV6gOa9"`，不自动新增全局 HTML `id`，避免多个编辑器实例冲突。编辑器可直接调用 `editorRef.value?.scrollToAnchor('AUV6gOa9')`；独立渲染器在当前文章容器内匹配 data-anchor-id。兼容旧文档时仍应读取选项的 `targetAnchorId`，不要对所有历史文章假设它一定等于 option.id。

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

- “下载协议”得到当前安装版本的 `article-content-protocol-latest.json`，包含新增节点、可选问题图片、锚点、完整 Schema 和 `resourceQuestionRules`。
- 也可 `import { getCurrentProtocol } from '@nova_voyager/article-block-editor'` 获取独立协议副本。
- `validateProtocolDocument` 同时执行结构校验与身份唯一性检查；旧文档不必增加新字段，原始 v1 定义不变。
- `npm run dev` 后点击顶部“资源问题示例”。Demo 的资源选择器是普通宿主组件，不进入 npm 产物，不请求真实服务。
- 保存通过现有 `save` / `v-model` 接口交给宿主，资源问题不增加自动存储行为。
