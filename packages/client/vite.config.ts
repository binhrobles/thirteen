import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { fileURLToPath } from 'url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  base: '/thirteen/',
  resolve: {
    alias: {
      '@assets': fileURLToPath(new URL('../../assets', import.meta.url)),
      // Point to game-logic source for hot reload
      '@thirteen/game-logic': fileURLToPath(new URL('../game-logic/src/index.ts', import.meta.url))
    }
  }
})
