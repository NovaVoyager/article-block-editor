import type { ArticleEditorProps, ArticleEditorExpose, ArticleEditorError, ImageUploadHandler, ImageUploadContext, ImageUploadResult } from 'article-block-editor'
import type { ResourceQuestionData, ResourceQuestionPickerScope } from 'article-block-editor'
import { getCurrentProtocol } from 'article-block-editor'
const resource: ResourceQuestionData = { resourceId: 'q', title: '问题', description: '', options: [{ id: 'a', label: '选项' }] }
function selectResource(scope: ResourceQuestionPickerScope) {
  const accepted: boolean = scope.select(resource)
  // @ts-expect-error Resource options require an external string ID.
  scope.select({ ...resource, options: [{ label: '无 ID' }] })
  return accepted
}
void selectResource
void getCurrentProtocol().resourceQuestionRules
const valid: ArticleEditorProps = { readonly: true, height: '100%' }
void valid
// @ts-expect-error Readonly accepts a boolean, not an arbitrary string.
const invalid: ArticleEditorProps = { readonly: 'yes' }
void invalid
function checkApi(editor: ArticleEditorExpose) {
  const found: boolean = editor.scrollToAnchor('paragraph-target')
  void found
  // @ts-expect-error A string is not a ProseMirror JSON document.
  editor.setContent('invalid')
  const result: boolean = editor.setContent({ type: 'doc', content: [] })
  return result
}
void checkApi

const upload: ImageUploadHandler = async (file: File, context: ImageUploadContext) => {
  const signal: AbortSignal = context.signal
  void signal
  const result: ImageUploadResult = { src: `/images/${encodeURIComponent(file.name)}`, width: 320, height: 180 }
  return result
}
const uploadOptions: ArticleEditorProps = { uploadImage: upload, maxImageSize: 1024 * 1024 }
const uploadError: ArticleEditorError = { source: 'upload', message: 'failed', errors: ['failed'], fileName: 'example.png' }
void uploadOptions
void uploadError
// @ts-expect-error The upload callback must return a URL or an image result, not a number.
const invalidUpload: ImageUploadHandler = async () => 42
void invalidUpload
