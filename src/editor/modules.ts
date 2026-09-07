import type { EditorModule, ProseMirrorJSON } from './types'

const defaultImage = 'https://placehold.co/1200x675/F1EEE7/3A3A36?text=Article+Image'

export const editorModules: EditorModule[] = [
  {
    type: 'heading',
    title: '标题',
    description: 'H1–H6 语义标题',
    icon: 'heading',
    group: 'basic',
    create: () => ({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: '新的章节标题' }],
    }),
  },
  {
    type: 'paragraph',
    title: '正文',
    description: '可应用行内格式的段落',
    icon: 'paragraph',
    group: 'basic',
    create: () => ({
      type: 'paragraph',
      content: [{ type: 'text', text: '在这里开始书写正文…' }],
    }),
  },
  {
    type: 'image',
    title: '图片',
    description: '带尺寸与对齐设置',
    icon: 'image',
    group: 'basic',
    create: () => ({
      type: 'image',
      attrs: { src: defaultImage, alt: '文章图片', imageAlign: 'center' },
    }),
  },
  {
    type: 'articleButton',
    title: '文章按钮',
    description: '文本、按钮或链接动作',
    icon: 'button',
    group: 'basic',
    create: () => ({
      type: 'articleButton',
      attrs: {
        id: `action-${crypto.randomUUID().slice(0, 8)}`,
        text: '了解更多',
        style: 'button',
        title: '文章操作',
      },
    }),
  },
  {
    type: 'horizontalRule',
    title: '分割线',
    description: '划分内容章节',
    icon: 'rule',
    group: 'basic',
    create: () => ({ type: 'horizontalRule' }),
  },
  {
    type: 'blockquote',
    title: '引用',
    description: '包含一个或多个块',
    icon: 'quote',
    group: 'structure',
    create: () => ({
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '输入引用内容…' }],
        },
      ],
    }),
  },
  {
    type: 'bulletList',
    title: '无序列表',
    description: '项目符号列表',
    icon: 'bulletList',
    group: 'structure',
    create: () => listDocument('bulletList'),
  },
  {
    type: 'orderedList',
    title: '有序列表',
    description: '可设置起始序号',
    icon: 'orderedList',
    group: 'structure',
    create: () => ({ ...listDocument('orderedList'), attrs: { start: 1 } }),
  },
  {
    type: 'codeBlock',
    title: '代码块',
    description: '支持语言标识',
    icon: 'code',
    group: 'structure',
    create: () => ({
      type: 'codeBlock',
      attrs: { language: 'typescript' },
      content: [{ type: 'text', text: "const hello = 'world'" }],
    }),
  },
  {
    type: 'table',
    title: '表格',
    description: '基础语义表格',
    icon: 'table',
    group: 'structure',
    create: () => tableDocument(),
  },
]

function listDocument(type: 'bulletList' | 'orderedList'): ProseMirrorJSON {
  return {
    type,
    content: ['第一项', '第二项'].map((text) => ({
      type: 'listItem',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text }],
        },
      ],
    })),
  }
}

function tableDocument(): ProseMirrorJSON {
  return {
    type: 'table',
    content: Array.from({ length: 3 }, (_, row) => ({
      type: 'tableRow',
      content: Array.from({ length: 3 }, (_, column) => ({
        type: 'tableCell',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: `R${row + 1}C${column + 1}` }],
          },
        ],
      })),
    })),
  }
}

export const initialDocument: ProseMirrorJSON = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1, textAlign: 'left' },
      content: [{ type: 'text', text: '把复杂内容，编辑得简单一点' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Article Studio ' , marks: [{ type: 'bold' }] },
        { type: 'text', text: '是一款面向结构化文章的块编辑器。选择任意内容块，即可在右侧调整它的协议属性。' },
      ],
    },
    {
      type: 'image',
      attrs: {
        src: defaultImage,
        alt: '文章封面示例',
        title: 'Article Studio',
        width: 1200,
        height: 675,
        imageAlign: 'center',
      },
    },
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: '所见即所得，存储仍然结构化' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: '正文保留在 ' },
        { type: 'text', text: 'content', marks: [{ type: 'code' }] },
        { type: 'text', text: '，配置保留在 ' },
        { type: 'text', text: 'attrs', marks: [{ type: 'code' }] },
        { type: 'text', text: '。导出的 JSON 始终经过 v1 协议校验。' },
      ],
    },
    {
      type: 'bulletList',
      content: ['点击左侧模块即可插入', '拖动模块到画布指定位置', '通过右侧面板更新属性'].map((text) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      })),
    },
    {
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '每一次属性变更都通过 ProseMirror transaction 提交，因此天然支持撤销与重做。' }],
        },
      ],
    },
    {
      type: 'articleButton',
      attrs: {
        id: 'action-demo',
        title: '开始体验',
        text: '开始创作',
        style: 'button',
      },
    },
  ],
}
