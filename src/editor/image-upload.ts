import type { Editor } from '@tiptap/core'
import type { Transaction } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import type { ImageUploadHandler, ImageUploadResult } from './public-types'
import { validateProtocolDocument } from './protocol'
import { findQuestion, snapshotQuestionImage } from './resource-question'

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp']
export const IMAGE_ACCEPT = IMAGE_MIME_TYPES.join(',')
export const DEFAULT_MAX_IMAGE_SIZE = 10 * 1024 * 1024

type Target = { kind: 'insert' | 'replace'; pos: number } | { kind: 'resourceQuestion'; questionId: string }
type Job = Target & { file: File; controller: AbortController; imageBefore?: string }

export function imageFileError(file: File, maximum: number): string | null {
  if (!IMAGE_MIME_TYPES.includes(file.type.toLowerCase())) return '仅支持 PNG、JPEG、WebP、GIF、AVIF、BMP 图片'
  if (file.size === 0) return '不能上传空文件'
  if (!Number.isFinite(maximum) || maximum <= 0) return 'maxImageSize 必须为正数'
  if (file.size > maximum) return `图片大小不能超过 ${(maximum / 1024 / 1024).toFixed(1)} MB`
  return null
}

function uploadedAttributes(result: string | ImageUploadResult, file: File): Record<string, unknown> {
  const value = typeof result === 'string' ? { src: result } : result
  if (!value || typeof value.src !== 'string' || !value.src.trim()) throw new Error('上传接口未返回有效的图片地址 src')
  const src = value.src.trim()
  // Do not persist temporary blob URLs or executable/custom URL schemes.
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(src)?.[1]?.toLowerCase()
  const rasterData = /^data:image\/(png|jpeg|webp|gif|avif|bmp);base64,[a-z\d+/=]+$/i.test(src)
  if (/[\u0000-\u0020]/.test(src) || (scheme && !['http', 'https'].includes(scheme) && !rasterData)) {
    throw new Error('请返回持久的 HTTP(S) / 相对图片地址，不能使用临时 blob 地址')
  }
  const attrs: Record<string, unknown> = { src, alt: value.alt ?? file.name }
  for (const key of ['title', 'width', 'height'] as const) {
    if (value[key] !== undefined) attrs[key] = value[key]
  }
  const validation = validateProtocolDocument({ type: 'doc', content: [{ type: 'image', attrs }] })
  if (!validation.valid) throw new Error(`上传结果不符合图片协议：${validation.errors[0]}`)
  return attrs
}

/** Tracks upload anchors through edits, without adding temporary fields/nodes to protocol JSON. */
export function createImageUploadManager(editor: Editor, options: {
  getHandler: () => ImageUploadHandler | undefined
  getMaximum: () => number
  isReadonly: () => boolean
  onPending: (count: number) => void
  onError: (message: string, file: File) => void
}) {
  const jobs = new Set<Job>()
  let disposed = false
  const updatePending = () => options.onPending(jobs.size)

  function cancel(job: Job) {
    jobs.delete(job)
    job.controller.abort()
  }
  function cancelAll() {
    for (const job of jobs) cancel(job)
    updatePending()
  }
  function cancelQuestion(questionId: string) {
    for (const job of jobs) {
      if (job.kind === 'resourceQuestion' && job.questionId === questionId) cancel(job)
    }
    updatePending()
  }
  function mapTargets({ transaction }: { transaction: Transaction }) {
    if (!transaction.docChanged) return
    for (const job of jobs) {
      if (job.kind === 'resourceQuestion') {
        // Stable identity follows moves, never the selection or a copied module.
        const target = findQuestion(transaction.doc, job.questionId)
        if (!target || JSON.stringify(target.node.attrs.image ?? null) !== job.imageBefore) {
          cancel(job)
          options.onError('问题图片上传目标已被删除或修改，请重新上传', job.file)
        }
        continue
      }
      const mapped = transaction.mapping.mapResult(job.pos, 1)
      if (mapped.deleted || (job.kind === 'replace' && transaction.doc.nodeAt(mapped.pos)?.type.name !== 'image')) {
        cancel(job)
        options.onError('上传目标已被删除或修改，请重新上传', job.file)
      } else {
        job.pos = mapped.pos
      }
    }
    updatePending()
  }
  editor.on('transaction', mapTargets)

  async function upload(files: File[], target: Target) {
    if (disposed || editor.isDestroyed || options.isReadonly()) return
    const handler = options.getHandler()
    if (!handler) {
      for (const file of files) options.onError('请先由宿主配置 uploadImage 上传回调', file)
      return
    }
    const batch: Job[] = []
    for (const file of target.kind === 'insert' ? files : files.slice(0, 1)) {
      const error = imageFileError(file, options.getMaximum())
      if (error) { options.onError(error, file); continue }
      const question = target.kind === 'resourceQuestion' ? findQuestion(editor.state.doc, target.questionId) : undefined
      if (target.kind === 'resourceQuestion') {
        if (!question) { options.onError('资源问题已不存在，请重新选择', file); continue }
        cancelQuestion(target.questionId)
      }
      const job: Job = { ...target, file, controller: new AbortController(),
        ...(question && { imageBefore: JSON.stringify(question.node.attrs.image ?? null) }),
      }
      jobs.add(job)
      batch.push(job)
    }
    updatePending()
    // Commit each batch in file order; typing while an upload is pending remaps every anchor.
    for (const job of batch) {
      if (!jobs.has(job)) continue
      try {
        const result = await handler(job.file, { signal: job.controller.signal })
        if (!jobs.has(job) || disposed || editor.isDestroyed || options.isReadonly()) continue
        const attrs = uploadedAttributes(result, job.file)
        const question = job.kind === 'resourceQuestion' ? findQuestion(editor.state.doc, job.questionId) : undefined
        const pos = job.kind === 'resourceQuestion' ? question?.pos : job.pos
        if (pos === undefined) throw new Error('资源问题已不存在，请重新上传')
        const node = editor.state.doc.nodeAt(pos)
        const image = job.kind === 'resourceQuestion' ? snapshotQuestionImage(attrs as unknown as ImageUploadResult) : undefined
        if (job.kind === 'replace' && node?.type.name !== 'image') throw new Error('原图片已不存在，请重新上传')
        // Remove this job before dispatch so its own node replacement cannot cancel itself.
        jobs.delete(job)
        const transaction = closeHistory(editor.state.tr)
        if (job.kind === 'resourceQuestion' && node && image) {
          transaction.setNodeMarkup(pos, undefined, { ...node.attrs, image })
        } else if (job.kind === 'replace' && node) {
          transaction.setNodeMarkup(pos, undefined, {
            ...node.attrs, width: null, height: null, title: null, ...attrs,
          })
        } else {
          transaction.insert(pos, editor.schema.nodes.image!.create({ imageAlign: 'center', ...attrs }))
        }
        editor.view.dispatch(transaction)
        // Keep subsequent typing out of this upload's undo group as well.
        editor.view.dispatch(closeHistory(editor.state.tr))
      } catch (error) {
        if (!job.controller.signal.aborted && !disposed) {
          options.onError(error instanceof Error ? error.message : '图片上传失败，请重试', job.file)
        }
      } finally {
        jobs.delete(job)
        updatePending()
      }
    }
  }
  return {
    upload,
    cancelAll,
    cancelQuestion,
    get pending() { return jobs.size },
    destroy() { disposed = true; cancelAll(); editor.off('transaction', mapTargets) },
  }
}
