import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// 배포마다 바뀌는 빌드 번호: 앱이 새 버전을 알아채고(version.json), 서비스워커 저장소도 배포마다 새로 씀
const BUILD = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12) + '-' + Math.random().toString(36).slice(2, 6)
function buildVersion(): Plugin {
  let outDir = 'dist'
  return {
    name: 'build-version',
    configResolved(c) { outDir = c.build.outDir },
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) }) },
    writeBundle() {
      const sw = resolve(outDir, 'sw.js')
      if (existsSync(sw)) writeFileSync(sw, readFileSync(sw, 'utf8').replace(/__BUILD__/g, BUILD))
    },
  }
}

export default defineConfig({
  plugins: [react(), buildVersion()],
  define: { __BUILD__: JSON.stringify(BUILD) },
})
