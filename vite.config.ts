/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  plugins: [
    react(),
    // Shared chunks (noise, blackbody) are pulled in with #include "...". Three's own
    // `#include <chunk>` syntax is left alone by the plugin.
    glsl({ warnDuplicatedImports: false, removeDuplicatedImports: true }),
  ],
  build: {
    target: 'es2022',
    // three.js alone is ~700 kB minified. It gets its own long-cacheable chunk.
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      // The plugin timing report is informational noise in every build log.
      checks: { bundlerTimings: false },
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
