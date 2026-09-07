# Article Studio

基于 Vue 3、Tiptap 3 和 ProseMirror 的三栏式结构化文章编辑器。项目以 `article-content-protocol-v1.json` 为存储边界，而不是把编辑器 HTML 当作内容源。

## 功能

- 左侧模块库：标题、正文、图片、文章按钮、分割线、引用、列表、代码块和表格；支持点击或拖入画布。
- 中间内容画布：富文本编辑、块拖拽排序、图片与按钮 NodeView、手机/平板/桌面宽度和只读预览。
- 右侧属性面板：选区同步、协议属性编辑、模块移动/复制/删除以及表格行列操作。
- 顶部工具栏：块类型、bold/italic/strike/underline/code/link、列表、撤销重做、预览、JSON 和保存。
- JSON 工作流：严格校验、双向导入、复制和下载；保存到浏览器 `localStorage`。

## 协议兼容策略

附件协议的 `documentSchema` 设置了 `additionalProperties: false`。因此：

- 根节点不会写入会话建议中的 `schemaVersion`；
- 普通块不会增加通用 `id`；`articleButton.attrs.id` 仍只表示协议定义的业务 ID；
- Tiptap 内部的 `null`、表格展示字段等在导出时被清理；
- `tableHeader` 会降级为 v1 的 `tableCell`；
- 保存与导出前使用附件原始 Draft-07 Schema 做最终校验。

如果后续需要稳定块 ID 或文档版本，应发布 Article Content Protocol v2 并提供显式迁移器，而不是向 v1 JSON 偷加字段。

## 开发

```bash
npm install
npm run dev
npm run test
npm run build
```

项目当前使用 Node 22、Vue 3.5、Tiptap 3.31 和 TypeScript 5.9 验证。
