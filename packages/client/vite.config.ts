import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { fileURLToPath } from 'url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    viteStaticCopy({
      targets: [
        { src: '../../node_modules/onnxruntime-web/dist/*.wasm', dest: 'ort-wasm' },
        { src: '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded*.mjs', dest: 'ort-wasm' },
      ],
    }),
  ],
  base: '/thirteen/',
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  resolve: {
    alias: {
      '@assets': fileURLToPath(new URL('../../assets', import.meta.url)),
      // Point to game-logic source for hot reload
      '@thirteen/game-logic': fileURLToPath(new URL('../game-logic/src/index.ts', import.meta.url))
    }
  }
})
