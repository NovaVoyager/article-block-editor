import type { ImageUploadHandler } from './editor/public-types'

/** Playground adapter only: no server, no network request. Production supplies its own callback. */
export const demoImageUpload: ImageUploadHandler = (file, { signal }) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  const abort = () => reader.abort()
  const cleanup = () => signal.removeEventListener('abort', abort)
  if (signal.aborted) { reject(new Error('已取消')); return }
  signal.addEventListener('abort', abort, { once: true })
  reader.onload = () => { cleanup(); resolve({ src: String(reader.result), alt: file.name }) }
  reader.onerror = () => { cleanup(); reject(new Error('无法读取图片文件')) }
  reader.onabort = () => { cleanup(); reject(new Error('已取消')) }
  reader.readAsDataURL(file)
})
