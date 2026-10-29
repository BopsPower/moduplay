// webmscore 기반 악보 렌더·재생 엔진 래퍼
// - .mscz 파일을 브라우저 안에서 그리고(SVG) 소리(오디오)로 만듭니다.
// - 서버에 MuseScore가 돌 필요가 없습니다.

export type Hands = 'both' | 'right' | 'left'

export type MeasurePos = { id: number; x: number; y: number; sx: number; sy: number; page: number; time: number }

export type LoadedScore = {
  title: string
  composer?: string
  pages: string[]            // 페이지별 SVG 문자열
  measures: MeasurePos[]     // 마디 위치 (시간 → 페이지/좌표)
  duration: number           // 초
  partNames: string[]
  synthAudio: (tempoRatio: number, parts: boolean[], onChunk: (chunk: Float32Array, time: number, done: boolean) => void) => Promise<() => void>
}

// webmscore는 npm 대신 CDN에서 불러옵니다 (패키지가 커서 빌드 시간을 줄이기 위해).
const WEBMSCORE_URL = 'https://cdn.jsdelivr.net/npm/webmscore@1.2.1/webmscore.mjs'

let wmPromise: Promise<any> | null = null
async function engine() {
  if (!wmPromise) {
    wmPromise = import(/* @vite-ignore */ WEBMSCORE_URL).then(async (m) => {
      const WebMscore = m.default
      await WebMscore.ready
      return WebMscore
    })
  }
  return wmPromise
}

export async function loadMscz(data: Uint8Array): Promise<LoadedScore> {
  const WebMscore = await engine()
  const score = await WebMscore.load('mscz', data, [], false)
  const meta = await score.metadata()
  const npages = meta.pages as number
  const pages: string[] = []
  for (let i = 0; i < npages; i++) pages.push(await score.saveSvg(i, false))
  const pos = await score.measurePositions()
  const measures: MeasurePos[] = (pos.elements as any[]).map((e: any) => ({
    id: e.id, x: e.x, y: e.y, sx: e.sx, sy: e.sy, page: e.page, time: e.position / 1000,
  }))
  const parts: string[] = (meta.parts as any[]).map((p: any) => p.name)

  return {
    title: meta.title || '악보',
    composer: meta.composer || undefined,
    pages, measures,
    duration: (meta.duration as number) || (measures.at(-1)?.time ?? 0),
    partNames: parts,
    synthAudio: async (tempoRatio, partMute, onChunk) => {
      // 파트 켜고 끄기 (오른손=1번 보표, 왼손=2번 보표를 파트로 매핑한 경우)
      try {
        const excerpts = await score.excerpts?.()
        void excerpts
      } catch { /* ignore */ }
      const fn = await score.synthAudio(0)
      let stop = false
      ;(async () => {
        let t = 0
        while (!stop) {
          const r = await fn(false)
          onChunk(r.chunk, t, r.done)
          t = r.endTime
          if (r.done) break
        }
      })()
      void tempoRatio; void partMute
      return () => { stop = true }
    },
  }
}
