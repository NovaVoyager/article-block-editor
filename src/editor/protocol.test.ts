import { describe, expect, it } from 'vitest'
import { initialDocument } from './modules'
import { toProtocolJSON, validateProtocolDocument } from './protocol'
import type { ProseMirrorJSON } from './types'

describe('Article Content Protocol v1 adapter', () => {
  it('keeps the starter document strictly valid', () => {
    const document = toProtocolJSON(initialDocument)
    expect(validateProtocolDocument(document)).toEqual({ valid: true, errors: [] })
  })

  it('removes Tiptap defaults and protocol-external attributes', () => {
    const tiptapDocument: ProseMirrorJSON = {
      type: 'doc',
      attrs: { schemaVersion: 1 },
      content: [
        {
          type: 'paragraph',
          attrs: { textAlign: null, id: 'internal-only' },
          content: [{ type: 'text', text: '正文' }],
        },
        {
          type: 'image',
          attrs: {
            src: '/cover.jpg',
            alt: '',
            title: null,
            width: '640',
            height: null,
            imageAlign: 'center',
            draggable: true,
          },
        },
      ],
    }

    const protocolDocument = toProtocolJSON(tiptapDocument)
    expect(protocolDocument).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '正文' }] },
        {
          type: 'image',
          attrs: { src: '/cover.jpg', alt: '', width: 640, imageAlign: 'center' },
        },
      ],
    })
    expect(validateProtocolDocument(protocolDocument).valid).toBe(true)
  })

  it('normalizes table headers into v1 table cells', () => {
    const document: ProseMirrorJSON = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  attrs: { colspan: 1 },
                  content: [
                    {
                      type: 'paragraph',
                      content: [{ type: 'text', text: '标题' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }

    const protocolDocument = toProtocolJSON(document)
    expect(protocolDocument.content?.[0].content?.[0].content?.[0].type).toBe('tableCell')
    expect(validateProtocolDocument(protocolDocument).valid).toBe(true)
  })

  it('rejects a non-link article button without a business id', () => {
    const document: ProseMirrorJSON = {
      type: 'doc',
      content: [
        {
          type: 'articleButton',
          attrs: { text: '提交', style: 'button' },
        },
      ],
    }

    expect(validateProtocolDocument(document).valid).toBe(false)
  })

  it('preserves the custom-link field contract', () => {
    const document = toProtocolJSON({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '打开资源',
              marks: [
                {
                  type: 'link',
                  attrs: {
                    type: 'custom',
                    id: 'resource-42',
                    title: '资源详情',
                    href: 'must-be-removed',
                    target: '_self',
                  },
                },
              ],
            },
          ],
        },
      ],
    })

    expect(document.content?.[0].content?.[0].marks?.[0].attrs).toEqual({
      type: 'custom',
      id: 'resource-42',
      title: '资源详情',
      target: '_self',
    })
    expect(validateProtocolDocument(document).valid).toBe(true)
  })
})
