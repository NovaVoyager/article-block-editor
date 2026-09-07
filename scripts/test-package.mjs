import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import postcss from 'postcss'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
// npm supplies its CLI path to lifecycle scripts; avoid platform-dependent shell quoting.
const npmCli = process.env.npm_execpath
assert(npmCli, 'Run this script with npm run test:package')
function run(args, cwd = root, capture = false) {
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', windowsHide: true,
  })
  if (result.status !== 0) throw new Error(`npm ${args.join(' ')} failed\n${result.stderr ?? ''}\n${result.stdout ?? ''}`)
  return result.stdout
}

run(['run', 'build'])
const artifacts = join(root, '.package-smoke')
mkdirSync(artifacts, { recursive: true })
const pack = JSON.parse(run(['pack', '--ignore-scripts', '--json', '--pack-destination', artifacts], root, true))[0]
const files = pack.files.map((file) => file.path)
assert(files.includes('dist/article-editor.js'))
assert(files.includes('dist/article-editor.css'))
assert(files.includes('dist/types/index.d.ts'))
assert(!files.some((file) => /(^src\/|^tests\/|demo-dist|demo-image-upload|\.test\.|playground|App\.vue|main\.d\.ts)/.test(file)), 'Demo/tests must not ship')
const js = readFileSync(join(root, 'dist/article-editor.js'), 'utf8')
assert(!js.includes('localStorage'), 'Library must not persist host content')
const css = postcss.parse(readFileSync(join(root, 'dist/article-editor.css'), 'utf8'))
css.walkRules((rule) => {
  if (rule.parent.type === 'atrule' && rule.parent.name.includes('keyframes')) return
  assert(rule.selectors.every((selector) => selector.startsWith('.article-studio')), `Unscoped CSS: ${rule.selector}`)
})
css.walkAtRules('import', () => { throw new Error('Library CSS must not fetch external fonts') })

// A genuine isolated consumer outside this repository: no source aliases or parent node_modules.
const consumer = mkdtempSync(join(tmpdir(), 'article-editor-consumer-'))
cpSync(join(root, 'tests/consumer'), consumer, { recursive: true })
// Keep the fixture usable if the publisher changes the package name.
for (const file of ['App.vue', 'typecheck.ts']) {
  const path = join(consumer, file)
  writeFileSync(path, readFileSync(path, 'utf8').replaceAll('article-block-editor', pkg.name))
}
writeFileSync(join(consumer, 'package.json'), JSON.stringify({
  name: 'article-editor-isolated-consumer', private: true, type: 'module',
  scripts: { build: 'vue-tsc --noEmit && vite build', dev: 'vite' },
  dependencies: { [pkg.name]: `file:${join(artifacts, pack.filename).replaceAll('\\', '/')}`, vue: pkg.devDependencies.vue },
  devDependencies: Object.fromEntries(['vite', '@vitejs/plugin-vue', 'typescript', 'vue-tsc'].map((name) => [name, pkg.devDependencies[name]])),
}, null, 2))
console.log(`\nIsolated consumer: ${consumer}`)
run(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'], consumer)
run(['run', 'build'], consumer)
const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
  import assert from 'node:assert/strict';
  import { h } from 'vue';
  import { renderToString } from 'vue/server-renderer';
  import Component, { ArticleEditor, createEmptyDocument, validateProtocolDocument } from ${JSON.stringify(pkg.name)};
  assert.equal(Component, ArticleEditor);
  assert.equal(validateProtocolDocument(createEmptyDocument()).valid, true);
  assert.match(await renderToString(h(ArticleEditor)), /article-studio/);
  console.log('Installed ESM entry and server-side import/render passed.');
`], { cwd: consumer, stdio: 'inherit', windowsHide: true })
assert.equal(result.status, 0, 'Installed package import failed')
console.log(`\nPackage checks passed: ${join(artifacts, pack.filename)}\nPreview consumer: cd "${consumer}" && npm run dev`)
