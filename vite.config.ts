import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import packageJson from './package.json' with { type: 'json' }

const external = [...Object.keys(packageJson.dependencies), ...Object.keys(packageJson.peerDependencies)]

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  resolve: {
    dedupe: ['vue', '@tiptap/core', '@tiptap/pm'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: mode === 'demo' ? { outDir: 'demo-dist' } : {
    outDir: 'dist',
    lib: {
      entry: fileURLToPath(new URL('./src/library.ts', import.meta.url)),
      formats: ['es'],
      fileName: 'article-editor',
      cssFileName: 'article-editor',
    },
    rolldownOptions: {
      external: (id) => external.some((name) => id === name || id.startsWith(`${name}/`)),
    },
  },
}))
