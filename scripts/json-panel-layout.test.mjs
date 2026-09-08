import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'

const stylesheet = postcss.parse(readFileSync(resolve('src/style.css'), 'utf8'))
function declarations(selector) {
  const result = {}
  stylesheet.walkRules(selector, rule => {
    rule.walkDecls(declaration => { result[declaration.prop] = declaration.value })
  })
  return result
}

describe('JSON drawer layout regression', () => {
  it('reserves named rows so a missing validation panel cannot move the footer into the growing row', () => {
    const drawer = declarations('.article-studio .json-drawer')
    expect(drawer['grid-template-rows']).toBe('auto auto auto minmax(0, 1fr) auto')
    expect(drawer['grid-template-areas']).toBe("'header' 'status' 'errors' 'content' 'footer'")
    for (const [selector, area] of [
      ['.drawer-header', 'header'], ['.json-status', 'status'], ['.validation-errors', 'errors'],
      ['textarea', 'content'], ['.drawer-footer', 'footer'],
    ]) {
      expect(declarations(`.article-studio .json-drawer > ${selector}`)['grid-area']).toBe(area)
    }
  })

  it('lets the content shrink in short editors while keeping errors scrollable', () => {
    expect(declarations('.article-studio .json-drawer textarea')['min-height']).toBe('0')
    expect(declarations('.article-studio .validation-errors').overflow).toBe('auto')
  })

  it('keeps buttons compact and permits wrapping in narrow editors and on copy errors', () => {
    const footer = declarations('.article-studio .drawer-footer')
    expect(footer['align-items']).toBe('center')
    expect(footer['flex-wrap']).toBe('wrap')
    expect(declarations('.article-studio .drawer-footer .action-button').height).toBe('36px')
    expect(declarations(".article-studio .drawer-footer [role='status']")['flex-basis']).toBe('100%')
  })
})
