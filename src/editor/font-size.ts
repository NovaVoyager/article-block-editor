import { Extension } from '@tiptap/core'
import fontSizeSchema from '../protocol/paragraph-font-size-v1.schema.json'

export const MIN_FONT_SIZE = fontSizeSchema.minimum
export const MAX_FONT_SIZE = fontSizeSchema.maximum

export function normalizeFontSize(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_FONT_SIZE && value <= MAX_FONT_SIZE
    ? value
    : null
}

export const ParagraphFontSize = Extension.create({
  name: 'paragraphFontSize',
  addGlobalAttributes() {
    return [{
      types: ['paragraph'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (element) => {
            const match = /^(\d+)px$/i.exec(element.style.fontSize.trim())
            return match ? normalizeFontSize(Number(match[1])) : null
          },
          renderHTML: (attributes) => {
            const size = normalizeFontSize(attributes.fontSize)
            return size === null ? {} : { style: `font-size: ${size}px` }
          },
        },
      },
    }]
  },
})
