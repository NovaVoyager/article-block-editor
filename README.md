# Article Studio / article-block-editor

可发布到 npm 的 Vue 3 组件包，基于 Tiptap 3 / ProseMirror。包含模块库、富文本工具栏、拖放画布、属性面板和 JSON 导入导出；使用 Article Content Protocol v1 + 文本颜色 / 正文字号 / 图片排版 / 资源问题及段落锚点扩展。

## 资源问题模块

左侧“扩展”新增资源问题：通过 `resource-question-picker` 作用域插槽接入宿主选择组件，选中后保存问题、描述和带外部 ID 的选项快照，不在渲染时请求资源接口。右侧可搜索正文/标题并为各选项绑定稳定锚点，支持定位高亮、清除绑定、目标失效提示、隐藏后续内容开关及解锁标识。

顶部“资源问题示例”可体验完整编辑流程。编辑器始终显示全文，独立渲染器由其他项目实现。

新配置的选项绑定使用外部选项 ID 作为段落 `anchorId`（如 `AUV6gOa9`），同时保留 `targetAnchorId`。旧文章不会自动迁移，可在右侧点击“使用选项 ID 作为锚点”转换；冲突时保留原绑定并提示。HTML 仍输出 `data-anchor-id`，跨框架渲染器需在当前文章容器内匹配。

资源问题支持可选的标题上方图片 `attrs.image`：资源选择器可返回 `image: { src, alt?, title?, width?, height? }`，右侧也可通过现有 `uploadImage` 回调单独上传替换、填写地址或移除。图片等比例适应容器，不裁切。重新选择资源会同步其图片（未提供则清空）；旧文档无需增加字段。下载协议及下方接入/渲染文档已同步说明。

- [资源选择组件接入说明](docs/resource-question-integration.md)
- [独立渲染器实现说明：revealKey、段落跳转与验收清单](docs/resource-question-rendering.md)（可直接交给渲染器开发者或 AI）

“下载协议”现已包含资源问题节点和正文/标题锚点；也可通过 `getCurrentProtocol()` 获取。除结构 Schema 外，还需检查文档内的身份唯一性，具体规则已写入下载文件的 `resourceQuestionRules`。本次新增公开 API：`editorRef.value?.scrollToAnchor(anchorId): boolean`，以及错误来源 `resourceQuestion`。

## 本地开发 / 测试入口

需要 Node.js 22.12+：

```bash
npm ci
npm run dev
```

打开终端输出的本地地址（默认 http://localhost:5173）。演示页支持加载示例、清空、只读切换、两个实例、卸载/重新挂载。只有演示页通过 save 事件将草稿写入 localStorage；组件包不自动存储、不请求保存接口。

顶部新增“JSON 字符串渲染”入口：展开后粘贴文档 JSON，点击“渲染到下方”即可加载到主编辑器；支持普通 JSON 文本及带转义引号的 JSON 字符串。也可“填入当前文档”或“填入示例”后修改。格式、协议或结构校验失败会显示错误并保留原文档；渲染不会自动保存，也不会修改第二个实例。勾选顶部“只读”查看只读效果，再次点击入口可收起输入区。该入口仅属于 demo，不进入 npm 组件包。

组件顶部“下载协议”按钮可下载 `article-content-protocol-latest.json`，包含当前安装版本的完整协议定义（节点、属性、标记、渲染说明）及与编辑器实际校验共用的 `documentSchema`，已合并文字颜色、高亮、正文字号和双图排版扩展；原始 v1 文件不变。该按钮也可在只读、预览及文档校验失败时使用，不包含当前文章、不联网、不保存草稿。下游可读取文件的 `documentSchema` 进行校验；“最新”指当前组件版本内置的协议，不自动从远程更新。原“JSON → 下载”仍只下载当前文章。隐藏工具栏（`showToolbar=false`）时此按钮一并隐藏。

演示页已接入本地图片处理回调，可以点击“上传图片”、在图片属性中上传替换，或将本地图片文件拖入正文。演示仅转为 Data URL 预览，不发送至服务器，单张限 2 MB；多张大图可能超出 localStorage 草稿容量。正式项目请接入自己的上传接口，返回持久图片地址。

左侧“基础内容”保留图片、引用、代码块和表格，“扩展”分组放置文章按钮和资源问题；两个分组均可独立折叠/展开（默认展开）。正文、标题 H1–H6、有序/无序列表及分割线统一在中间工具栏操作；旧文档仍兼容。

表格初始为 3 行 3 列，但行列数不固定。点击任意单元格，右侧同时显示“表格结构”和单元格内的正文属性；可在当前行下方添加行、当前列右侧添加列，或删除选中的行列（至少保留一行一列）。选中整张表格时操作末行/末列；面板实时显示行列数，结构调整支持撤销重做并保存至现有 JSON 协议。

```bash
npm test                # 协议 + 组件接口测试
npm run build           # npm 库产物及 TypeScript 声明 → dist/
npm run build:demo      # 测试页面 → demo-dist/，不覆盖库产物
npm run preview         # 预览已构建的测试页面
npm run test:package    # tgz 在独立 Vue 项目安装、类型检查和构建
```

`test:package` 会验证公开入口、类型、CSS 隔离、包文件清单和无浏览器环境的导入，并打印独立测试项目路径。需要 npm 网络访问或完整缓存；测试项目保留在系统临时目录供查看，tgz 在 `.package-smoke/`，均不会发布。

## 其他项目引入

发布后安装：

```bash
npm install article-block-editor
```

尚未发布时，在本仓库执行 `npm pack`（自动构建），然后在业务项目执行 `npm install /path/to/article-block-editor-1.0.0.tgz`。无需复制源码或配置 `@/` 别名。

宿主需要 Vue 3.5+（<4）。包为 ESM，面向 Vite 等支持 ESM 的 Vue 3 工程，不提供 Vue 2、React 或直接 `require()` 接口。必须引入样式：

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { ArticleEditor, createEmptyDocument } from 'article-block-editor'
import type { ArticleEditorExpose, ArticleEditorError, ProseMirrorJSON } from 'article-block-editor'
import 'article-block-editor/style.css'

const content = ref<ProseMirrorJSON>(createEmptyDocument())
const editorRef = ref<ArticleEditorExpose | null>(null)
// 接口返回后赋值 content.value，即可加载文章。
function save(document: ProseMirrorJSON) {
  // 在这里调用自己的保存接口；成功/失败提示由宿主负责。
  console.log('待保存的 JSON', document)
}
function onError(error: ArticleEditorError) {
  console.error(error.source, error.errors)
}
</script>

<template>
  <ArticleEditor
    ref="editorRef"
    v-model="content"
    :height="780"
    :readonly="false"
    @save="save"
    @error="onError"
  />
</template>
```

也支持默认导入 `import ArticleEditor from 'article-block-editor'`。多个实例分别绑定各自的 JSON，不共享文档或存储键。

## 组件接口

| Prop | 类型 | 默认值 / 说明 |
| --- | --- | --- |
| `modelValue` / `v-model` | `ProseMirrorJSON` | 不传时从空段落开始，支持非受控用法 |
| `readonly` | `boolean` | `false`；禁止用户编辑、导入和保存，宿主仍可加载数据 |
| `height` | `number \| string` | `780`；数字为 px，或 CSS 高度字符串；百分比需要父容器有明确高度；最小 400px |
| `showToolbar` | `boolean` | `true` |
| `showLibrary` | `boolean` | `true` |
| `showInspector` | `boolean` | `true` |
| `uploadImage` | `ImageUploadHandler` | 未配置；宿主提供图片上传方法，未配置时上传按钮禁用，URL 输入仍可使用 |
| `maxImageSize` | `number` | `10485760`（10 MB）；单张图片大小上限，单位为字节，必须为正数 |

| 事件 | 参数 | 说明 |
| --- | --- | --- |
| `update:modelValue` | `ProseMirrorJSON` | 编辑或 ref 方法改变内容时返回独立快照，供 v-model 使用 |
| `change` | `ProseMirrorJSON` | 同上；父组件回传或通过 modelValue 加载文档不循环触发 |
| `save` | `ProseMirrorJSON` | 用户点击保存、无待上传图片且校验通过，不代表后端保存成功 |
| `ready` | `ArticleEditorExpose` | 初始化完成，可以调用 ref 方法 |
| `validation` | `{ valid, errors }` | 当前文档协议校验结果 |
| `error` | `{ source, message, errors, fileName? }` | 校验/导入/上传/协议下载失败；source 为 modelValue、setContent、json、save、upload 或 protocol；上传错误包含 fileName |

ref / ready API：

```ts
editorRef.value?.getJSON()             // 独立 JSON 快照
editorRef.value?.setContent(document)  // true 成功；非法数据返回 false，保留旧文档
editorRef.value?.clear()               // 清空为一个空段落，返回 boolean
editorRef.value?.focus()
editorRef.value?.validate()            // { valid: boolean, errors: string[] }
```

在 `ready` 后调用。父组件设置不同的 modelValue、setContent、清空或导入 JSON 会重置撤销历史，防止撤销回上一篇文章；内容一致的 v-model 回传不重置历史或选区。用户编辑返回的内容可能暂时不通过协议（例如正在填写图片地址），宿主应处理 validation；组件仅允许通过校验的文档触发 save。

SSR 工程可以导入本包，但编辑视图在客户端挂载后创建；服务端正文展示需要单独的协议渲染器。

## 图片上传接入

正文图片的显示宽度不超过所在容器；同时设置 `width` / `height` 时，按这两个尺寸的比例同步缩放，单图、双图并排和只读预览均适用。图片完整显示而不裁切，JSON 中的原始尺寸保持不变；未设置尺寸时使用图片本身的比例。

组件处理文件选择、外部本地文件拖放、插入/替换、校验和上传状态；宿主处理上传请求、业务鉴权和服务器存储，不内置上传服务。传入同一个 `uploadImage` 即可供三个入口使用：

- 画布顶部“上传图片”：支持多选，插入到当前顶层内容块之后。
- 图片属性面板“上传并替换图片”：成功后替换选中图片；失败保留原图。保留原对齐方式，新结果未提供宽高时清除旧尺寸，避免沿用旧图比例。
- 从资源管理器把一张或多张图片拖入正文容器：自动调用回调，在落点对应的顶层块边界插入。仅处理浏览器提供的本地文件，不提供远程图片 URL 的跨域下载服务。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { ArticleEditor, createEmptyDocument } from 'article-block-editor'
import type { ImageUploadHandler } from 'article-block-editor'
import 'article-block-editor/style.css'

const content = ref(createEmptyDocument())
const uploadImage: ImageUploadHandler = async (file, { signal }) => {
  const form = new FormData()
  form.append('file', file)
  // 示例接口，请替换为自己的地址，并按业务要求附加鉴权。
  const response = await fetch('/api/images', { method: 'POST', body: form, signal })
  if (!response.ok) throw new Error('图片上传失败，请重试')
  const result = await response.json()
  // 示例约定接口返回 { url: string }；也可直接返回 URL 字符串。
  return { src: result.url, alt: file.name }
}
</script>

<template>
  <ArticleEditor
    v-model="content"
    :upload-image="uploadImage"
    :max-image-size="10 * 1024 * 1024"
  />
</template>
```

公开类型：

```ts
interface ImageUploadResult {
  src: string
  alt?: string
  title?: string
  width?: number
  height?: number
}
interface ImageUploadContext { signal: AbortSignal }
type ImageUploadHandler = (file: File, context: ImageUploadContext) => Promise<string | ImageUploadResult>
```

返回 HTTP(S) 或相对图片地址，不接受临时 `blob:` 地址；为本地演示允许上述图片格式的 base64 Data URL。支持 PNG、JPEG、WebP、GIF、AVIF、BMP；文件类型、空文件、大小在调用上传回调前校验，返回值需通过既有图片协议校验。前端检查不能代替服务端对真实文件格式、大小及安全性的校验。

同批多图按文件顺序上传、插入，单图失败不阻止后续图片。上传时底部显示待完成数量，保存按钮暂时禁用；正文仍可编辑，插入位置随编辑更新。JSON 只在成功后写入 `image.attrs`，不含 File、上传状态或临时占位节点，普通单图兼容原 v1 图片协议；插入/替换支持撤销重做，替换保留原图的排版设置。切换文章、清空、进入只读/预览或卸载会取消待处理任务；原目标被删除时也会取消。建议将 `signal` 传给请求；即使回调忽略取消信号，过期结果也不会写入新文档。

## 一行两张图片

先连续插入或上传两张图片，选中前一张，在右侧点击“与下一张图片并排”，即可一次设置两张图；也可以分别将“图片排版”设为“一行两张”。若下一模块不是图片，快捷按钮禁用，避免跨越正文或表格单元格配对。

连续的双列图片按文档顺序每行显示两张，超过两张自动换行；正文、单图等块会打断并排。奇数张时最后一张仍占半行。每张图片仍为独立节点，地址、上传替换、替代文本、标题、对齐及尺寸分别编辑，不合成图片；同时填写宽高时，在半行宽度内按指定比例缩放。切回“独占一行”只影响当前图片，不会删除另一张；如需两张都恢复单图，分别切换即可。

```json
{
  "type": "doc",
  "content": [
    { "type": "image", "attrs": { "src": "/left.jpg", "imageLayout": "two-column" } },
    { "type": "image", "attrs": { "src": "/right.jpg", "imageLayout": "two-column" } }
  ]
}
```

图片排版通过独立的 `image-layout-v1.schema.json` 扩展校验，省略 `imageLayout` 即原有独占一行布局。导出 HTML 使用 `data-image-layout="two-column"`；独立下游渲染器需要支持该字段：图片外层容器占半行、保留间距、每两张换行，而不是仅修改图片像素宽度。组件自己的编辑和预览视图已支持。

## 样式与嵌入

样式限定在 `.article-studio` 下，不修改宿主 body、#app、按钮或全局字体，不请求 Google Fonts。布局按组件容器宽度响应，弹层定位在组件内部。容器小于 900px 隐藏右侧属性面板，小于 640px 隐藏左侧模块库；默认最小宽度 320px。宿主可通过 class 和 CSS 变量调整颜色：

```css
.my-editor.article-studio { --accent: #2563eb; --accent-dark: #1d4ed8; }
```

Vue 是 peer dependency，不打进包；Tiptap/ProseMirror 等运行时依赖由 npm 安装。Tiptap 固定为验证过的 3.31.3，升级时应一起升级并执行全部测试。

## 协议兼容

原始 `src/protocol/article-content-protocol-v1.json` 保持不变：根节点不添加 schemaVersion，普通块不添加通用 id，按钮 attrs.id 仍是业务 ID。导出清理 Tiptap 内部属性，tableHeader 转换为 tableCell。

文本颜色使用 `{"type":"textStyle","attrs":{"color":"#dc2626"}}`，高亮使用 `{"type":"highlight","attrs":{"color":"#fef08a"}}`，保存于文本节点 marks。颜色统一为六位十六进制，由独立的 text-formatting-v1.schema.json 扩展校验。

正文段落支持在右侧“正文设置”通过下拉菜单选择常用字号（8–96 px），作用于整段（包括列表、引用或表格内的段落）。选择“默认字号”或点击“恢复默认字号”后继承原有样式。已有文档的非预设字号也会显示为选项，不会被自动替换。JSON 保存为 `paragraph.attrs.fontSize`，仍支持 8–96 的整数，例如 `{"type":"paragraph","attrs":{"fontSize":24},"content":[{"type":"text","text":"正文"}]}`，通过独立的 `paragraph-font-size-v1.schema.json` 扩展校验。未设置时不输出该字段，标题字号仍由 H1–H6 控制。

旧 v1 文档无需迁移。含新样式的文档需要下游同时支持相应扩展；原 v1 校验器不接受两个颜色 mark、`paragraph.attrs.fontSize` 或 `image.attrs.imageLayout`。包公开：

```ts
import { toProtocolJSON, validateProtocolDocument, validateProtocolV1Document } from 'article-block-editor'
```

`validateProtocolDocument` 支持 v1 + 颜色 / 正文字号 / 图片排版扩展；`validateProtocolV1Document` 仅检查原始 v1。`toProtocolJSON` 用于规范化编辑器输出，不代替输入校验。

## npm 发布

发布前将 package.json 的 name 改为你有权限的包名（可用 `@你的组织/article-editor`），设置版本并确认许可证。当前使用 UNLICENSED，不擅自授予开源许可；如需开源，由维护者选择许可证并补充 LICENSE 文件。

```bash
npm test
npm run test:package
npm pack --dry-run
npm login
npm publish --access public
```

prepack 自动重新构建，prepublishOnly 自动运行测试和独立安装验证。只有 dist/、README 和 package.json 等 npm 必需文件进入发布包，演示页和测试代码不发布。仓库改造不等于已经发布，不会自动登录或发布 npm。

## 目录

```text
src/index.ts             公开包入口
src/ArticleEditor.vue    可复用组件（不依赖演示页）
src/editor/              协议、扩展与公共类型
src/components/          内部 UI 和 NodeView
src/style.css            组件命名空间样式
src/App.vue              测试入口与宿主存储示例
src/playground.css       仅用于测试页的全局样式
tests/consumer/          真实安装包的独立工程样例
scripts/test-package.mjs 打包与独立消费验证
dist/                   npm 发布产物
demo-dist/              测试页构建产物
```

配置参考：[Vite Library Mode](https://vite.dev/guide/build.html#library-mode)、[npm package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/)、[Vue 组件 v-model](https://vuejs.org/guide/components/v-model.html)。
