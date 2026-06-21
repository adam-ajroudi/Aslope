import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/main.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'electron/preload.ts'),
          overlay: resolve(__dirname, 'electron/preload-overlay.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'renderer'),
    build: {
      target: 'esnext',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'renderer/index.html'),
          overlay: resolve(__dirname, 'renderer/overlay.html')
        }
      }
    },
    plugins: [react()],
    optimizeDeps: {
      exclude: ['@huggingface/transformers', 'onnxruntime-node']
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared')
      }
    }
  }
})
