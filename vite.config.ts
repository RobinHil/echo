import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // @ffmpeg/ffmpeg instancie son worker via import.meta.url :
    // il doit rester hors du pre-bundling pour que l'URL reste valide en dev.
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
})
