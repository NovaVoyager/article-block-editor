import type { Editor } from '@tiptap/core'
import type { Transaction } from '@tiptap/pm/state'
import { closeHistory } from '@tiptap/pm/history'
import type { ImageUploadHandler, ImageUploadResult } from './public-types'
import { validateProtocolDocument } from './protocol'

export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif', 'image/bmp']
export const IMAGE_ACCEPT = IMAGE_MIME_TYPES.join(',')
export const DEFAULT_MAX_IMAGE_SIZE = 10 * 1024 * 1024

type Target = { kind: 'insert' | 'replace'; pos: number }
type Job = Target & { file: File; controller: AbortController }

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
  function mapTargets({ transaction }: { transaction: Transaction }) {
    if (!transaction.docChanged) return
    for (const job of jobs) {
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
    for (const file of target.kind === 'replace' ? files.slice(0, 1) : files) {
      const error = imageFileError(file, options.getMaximum())
      if (error) { options.onError(error, file); continue }
      const job = { ...target, file, controller: new AbortController() }
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
        const node = editor.state.doc.nodeAt(job.pos)
        if (job.kind === 'replace' && node?.type.name !== 'image') throw new Error('原图片已不存在，请重新上传')
        // Remove this job before dispatch so its own node replacement cannot cancel itself.
        jobs.delete(job)
        const transaction = closeHistory(editor.state.tr)
        if (job.kind === 'replace' && node) {
          transaction.setNodeMarkup(job.pos, undefined, {
            ...node.attrs, width: null, height: null, title: null, ...attrs,
          })
        } else {
          transaction.insert(job.pos, editor.schema.nodes.image!.create({ imageAlign: 'center', ...attrs }))
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
    get pending() { return jobs.size },
    destroy() { disposed = true; cancelAll(); editor.off('transaction', mapTargets) },
  }
}
