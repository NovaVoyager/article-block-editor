import type { ProseMirrorJSON, ResourceQuestionData } from './index'

export const demoQuestions: ResourceQuestionData[] = [
  { resourceId: 'sleep-check', title: '🌙 你的入睡时间是多久？', description: '选择符合你的情况，查看对应的睡眠建议。', options: [
    { id: 'within-5', label: '😴 5 分钟以内' }, { id: 'within-30', label: '🌛 10～30 分钟' },
    { id: 'over-30', label: '💭 超过 30 分钟' },
  ] },
  { resourceId: 'reading-time', title: '📖 你每天阅读多久？', description: '选择一个选项，配置跳转到文章中的建议段落。', options: [
    { id: 'short', label: '15 分钟以内' }, { id: 'long', label: '15 分钟以上' },
  ] },
]

export function resourceQuestionDemo(): ProseMirrorJSON {
  return { type: 'doc', content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '资源问题 · 段落跳转演示' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '点击问题卡片右下方的“更换资源问题”可体验外部选择组件；点击选项会定位并高亮对应段落。右侧可重新绑定目标。' }] },
    { type: 'resourceQuestion', attrs: {
      id: 'demo-question', ...JSON.parse(JSON.stringify(demoQuestions[0])),
      options: demoQuestions[0]!.options.map((option, index) => ({ ...option, targetAnchorId: `sleep-advice-${index}` })),
      hideFollowing: true, revealKey: 'sleep-report',
    } },
    ...demoQuestions[0]!.options.flatMap((option, index): ProseMirrorJSON[] => [
      { type: 'heading', attrs: { level: 2, anchorId: `sleep-advice-${index}` }, content: [{ type: 'text', text: `建议 ${index + 1}：${option.label}` }] },
      ...Array.from({ length: 3 }, (_, line): ProseMirrorJSON => ({ type: 'paragraph', content: [{ type: 'text', text: `这是第 ${index + 1} 组演示内容（${line + 1}）。这里仅用于测试定位，不是睡眠诊断或医疗建议。你可以修改文字、移动段落，已配置的锚点不会随文字和顺序变化。` }] })),
    ]),
  ] }
}
