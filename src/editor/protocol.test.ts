import { describe, expect, it } from 'vitest'
import { getSchema } from '@tiptap/core'
import { EditorState } from '@tiptap/pm/state'
import { history, undo, redo } from '@tiptap/pm/history'
import { createProtocolExtensions } from './extensions'
import { initialDocument } from './modules'
import { toProtocolJSON, validateProtocolDocument, validateProtocolV1Document } from './protocol'
import { normalizeColor } from './text-formatting'
import { normalizeFontSize } from './font-size'
import type { ProseMirrorJSON } from './types'

describe('Article Content Protocol v1 adapter', () => {
  it('keeps the starter document strictly valid', () => {
    const document = toProtocolJSON(initialDocument)
    expect(validateProtocolDocument(document)).toEqual({ valid: true, errors: [] })
    expect(validateProtocolV1Document(document).valid).toBe(true)
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

describe('Text formatting persistence', () => {
  const schema = getSchema(createProtocolExtensions())
  const coloredDocument: ProseMirrorJSON = {
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: '彩色重点',
        marks: [
          { type: 'textStyle', attrs: { color: '#dc2626' } },
          { type: 'highlight', attrs: { color: '#fef08a' } },
          { type: 'bold' },
          { type: 'link', attrs: { type: 'href', href: '#detail', target: '_self' } },
        ],
      }],
    }],
  }

  it('retains colors alongside bold and links through editor JSON save/reload', () => {
    const node = schema.nodeFromJSON(coloredDocument)
    node.check()
    const saved = toProtocolJSON(node.toJSON())
    const loaded = schema.nodeFromJSON(JSON.parse(JSON.stringify(saved)))
    loaded.check()
    expect(toProtocolJSON(loaded.toJSON())).toEqual(saved)
    expect(saved.content?.[0].content?.[0].marks).toEqual(expect.arrayContaining(coloredDocument.content![0]!.content![0]!.marks!))
    expect(validateProtocolDocument(saved).valid).toBe(true)
    expect(validateProtocolV1Document(saved).valid).toBe(false)
  })

  it('undoes and redoes color changes without losing the text', () => {
    let state = EditorState.create({
      schema,
      doc: schema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '正文' }] }] }),
      plugins: [history()],
    })
    state = state.apply(state.tr.addMark(1, 3, schema.marks.textStyle!.create({ color: '#dc2626' })).addMark(1, 3, schema.marks.highlight!.create({ color: '#fef08a' })))
    const saved = toProtocolJSON(state.doc.toJSON())
    expect(undo(state, (transaction) => { state = state.apply(transaction) })).toBe(true)
    expect(state.doc.textContent).toBe('正文')
    expect(state.doc.firstChild!.firstChild!.marks).toHaveLength(0)
    expect(redo(state, (transaction) => { state = state.apply(transaction) })).toBe(true)
    expect(toProtocolJSON(state.doc.toJSON())).toEqual(saved)
    state = state.apply(state.tr.removeMark(1, 3, schema.marks.highlight))
    expect(state.doc.firstChild!.firstChild!.marks.map((mark) => mark.type.name)).toEqual(['textStyle'])
  })

  it.each(['red; background: url(x)', '', '#12', 'rgb(300, 0, 0)'])('rejects invalid color %s on import', (color) => {
    const document = structuredClone(coloredDocument)
    document.content![0]!.content![0]!.marks![0]!.attrs!.color = color
    expect(validateProtocolDocument(document).valid).toBe(false)
  })

  it('normalizes browser CSS colors without losing them on export', () => {
    expect(normalizeColor('rgb(220, 38, 38)')).toBe('#dc2626')
    expect(normalizeColor('#ABC')).toBe('#aabbcc')
    const document = structuredClone(coloredDocument)
    document.content![0]!.content![0]!.marks![0]!.attrs!.color = 'rgb(220, 38, 38)'
    expect(toProtocolJSON(document)).toEqual(coloredDocument)
  })
})

describe('Paragraph font size extension', () => {
  const schema = getSchema(createProtocolExtensions())
  const paragraph: ProseMirrorJSON = {
    type: 'paragraph',
    attrs: { textAlign: 'center', fontSize: 24 },
    content: [{ type: 'text', text: '自定义字号', marks: [{ type: 'bold' }, { type: 'textStyle', attrs: { color: '#dc2626' } }] }],
  }

  it('persists paragraph size alongside alignment and inline formatting', () => {
    const value = { type: 'doc', content: [paragraph] }
    const node = schema.nodeFromJSON(value)
    node.check()
    const saved = toProtocolJSON(node.toJSON())
    expect(saved.content?.[0]?.attrs).toEqual(paragraph.attrs)
    expect(validateProtocolDocument(saved).valid).toBe(true)
    expect(validateProtocolV1Document(saved).valid).toBe(false)
    expect(toProtocolJSON(schema.nodeFromJSON(JSON.parse(JSON.stringify(saved))).toJSON())).toEqual(saved)
  })

  it('supports nested paragraphs without adding fontSize to their parent nodes', () => {
    const value: ProseMirrorJSON = { type: 'doc', content: [
      { type: 'blockquote', content: [paragraph] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [paragraph] }] },
      { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [paragraph] }] }] },
    ] }
    expect(validateProtocolDocument(value).valid).toBe(true)
    const node = schema.nodeFromJSON(value)
    node.check()
    expect(toProtocolJSON(node.toJSON()).content?.[2]?.content?.[0]?.content?.[0]?.content?.[0]?.attrs?.fontSize).toBe(24)
    expect(validateProtocolDocument({ type: 'doc', content: [{ type: 'heading', attrs: { level: 1, fontSize: 24 } }] }).valid).toBe(false)
    expect(validateProtocolDocument({ type: 'doc', content: [{ ...paragraph, attrs: { fontSize: 24, custom: true } }] }).valid).toBe(false)
  })

  it.each([7, 97, 0, -12, 12.5, '24', '24px', null])('rejects invalid fontSize %s', (fontSize) => {
    expect(normalizeFontSize(fontSize)).toBeNull()
    expect(validateProtocolDocument({ type: 'doc', content: [{ ...paragraph, attrs: { fontSize } }] }).valid).toBe(false)
  })

  it('accepts boundaries and omits the unset attribute to retain strict legacy compatibility', () => {
    expect(normalizeFontSize(8)).toBe(8)
    expect(normalizeFontSize(96)).toBe(96)
    const value = toProtocolJSON(schema.nodeFromJSON({ type: 'doc', content: [{ type: 'paragraph' }] }).toJSON())
    expect(value.content?.[0]?.attrs?.fontSize).toBeUndefined()
    expect(validateProtocolV1Document(value).valid).toBe(true)
  })
})
