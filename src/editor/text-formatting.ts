import { Mark } from '@tiptap/core'

// Store one deterministic color format in JSON; browsers expose pasted CSS as rgb().
export function normalizeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const color = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(color)) return color
  if (/^#[0-9a-f]{3}$/.test(color)) {
    return `#${color.slice(1).split('').map((part) => part + part).join('')}`
  }
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(color)
  if (!rgb) return null
  const channels = rgb.slice(1).map(Number)
  if (channels.some((channel) => channel > 255)) return null
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

// Match Tiptap's textStyle/color and highlight/color JSON conventions.
export const TextColor = Mark.create({
  name: 'textStyle',
  priority: 1010,
  addAttributes() {
    return { color: { default: null, rendered: false } }
  },
  parseHTML() {
    return [{
      style: 'color',
      getAttrs: (value) => {
        const color = normalizeColor(value)
        return color ? { color } : false
      },
    }]
  },
  renderHTML({ mark }) {
    const color = normalizeColor(mark.attrs.color)
    return ['span', color ? { style: `color: ${color}` } : {}, 0]
  },
})

export const TextHighlight = Mark.create({
  name: 'highlight',
  addAttributes() {
    return { color: { default: '#fef08a', rendered: false } }
  },
  parseHTML() {
    return [
      {
        tag: 'mark',
        getAttrs: (element) => ({
          color: normalizeColor(element.style.backgroundColor || element.getAttribute('data-color')) || '#fef08a',
        }),
      },
      {
        style: 'background-color',
        getAttrs: (value) => {
          const color = normalizeColor(value)
          return color ? { color } : false
        },
      },
    ]
  },
  renderHTML({ mark }) {
    const color = normalizeColor(mark.attrs.color) || '#fef08a'
    return ['mark', { 'data-color': color, style: `background-color: ${color}; color: inherit` }, 0]
  },
})
