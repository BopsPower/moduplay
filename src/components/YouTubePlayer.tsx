import { useEffect, useRef, useState } from 'react'
import { fmtTime, ytId, ytStart } from '../lib/materials'
import { usePracticeActive } from '../lib/practice'
import LoopBox from './LoopBox'

// 유튜브 영상을 앱 안에서 재생: 느리게 보기 · A–B 구간 반복 · 구간 표시로 바로 가기
// (영상·음원을 내려받지 않고 유튜브 공식 플레이어로만 재생)

declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void } }

let apiPromise: Promise<any> | null = null
function loadApi(): Promise<any> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise(resolve => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT) }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.async = true
    document.head.appendChild(s)
  })
  return apiPromise
}

const SPEEDS = [0.5, 0.75, 1]

type AB = { speed: number; a: number | null; b: number | null }

export default function YouTubePlayer({ url, marks, title, speeds = SPEEDS, initial, onState }: {
  url: string; marks?: { t: number; label: string }[] | null; title?: string
  speeds?: number[]; initial?: Partial<AB>; onState?: (s: AB) => void // 연습 플레이어: 속도·구간 기억
}) {
  const id = ytId(url)
  const box = useRef<HTMLDivElement>(null)
  const player = useRef<any>(null)
  const [ready, setReady] = useState(false)
  const [ytPlaying, setYtPlaying] = useState(false)
  usePracticeActive('yt-' + (ytId(url) ?? ''), ytPlaying)
  const [failed, setFailed] = useState(false)
  const [speed, setSpeed] = useState(initial?.speed ?? 1)
  const [a, setA] = useState<number | null>(initial?.a ?? null)
  const [b, setB] = useState<number | null>(initial?.b ?? null)
  const first = useRef(true)
  useEffect(() => { if (first.current) { first.current = false; return } onState?.({ speed, a, b }) }, [speed, a, b])
  const [now, setNow] = useState(0)
  const ab = useRef<{ a: number | null; b: number | null }>({ a: null, b: null })
  const speedRef = useRef(speed)
  useEffect(() => { speedRef.current = speed }, [speed])
  useEffect(() => { ab.current = { a, b } }, [a, b])

  useEffect(() => {
    if (!id || !box.current) return
    let alive = true
    // 구간(A·B)이 정해진 채로 열면 A부터 재생 (원장님 2026-11-06 "공유했을 때 바로 A부터 재생되게. 지금은 노래 처음으로 가 있어")
    // - 유튜브 시작 위치(start)는 초 단위 정수만 됨 → A의 정수 초로 두고, 처음 재생될 때 A로 한 번 더 정확히 맞춤
    const a0 = initial?.a ?? null, b0 = initial?.b ?? null
    const startAtA = a0 != null && b0 != null && b0 > a0
    let firstPlay = true
    const el = document.createElement('div')
    box.current.appendChild(el)
    loadApi().then(YT => {
      if (!alive) return
      player.current = new YT.Player(el, {
        videoId: id,
        host: 'https://www.youtube-nocookie.com',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, start: startAtA ? Math.floor(a0!) : ytStart(url) || undefined },
        events: {
          onReady: (e: any) => { if (!alive) return; setReady(true); if (speedRef.current !== 1) e.target.setPlaybackRate?.(speedRef.current) },
          onError: () => alive && setFailed(true),
          onStateChange: (e: any) => {
            if (!alive) return
            setYtPlaying(e.data === 1)
            if (e.data === 1 && firstPlay) {
              firstPlay = false
              const { a, b } = ab.current, t = e.target.getCurrentTime?.() ?? 0
              if (startAtA && a != null && b != null && (t < a - 0.3 || t >= b)) e.target.seekTo(a, true)
            }
          },
        },
      })
    }).catch(() => setFailed(true))
    const iv = window.setInterval(() => {
      const p = player.current
      if (!p?.getCurrentTime) return
      const t = p.getCurrentTime() || 0
      setNow(t)
      const { a, b } = ab.current
      if (a != null && b != null && t >= b) p.seekTo(a, true)
    }, 200)
    return () => { alive = false; clearInterval(iv); try { player.current?.destroy() } catch { /* 이미 닫힘 */ } player.current = null; el.remove() }
  }, [id])

  if (!id) return <p className="muted" style={{ margin: 0, fontSize: 14 }}>유튜브 주소를 읽지 못했어요.</p>

  const go = (t: number) => { const p = player.current; if (!p) return; p.seekTo(t, true); p.playVideo?.() }
  const pickSpeed = (s: number) => { setSpeed(s); player.current?.setPlaybackRate?.(s) }
  // 구간 반복: A(시작)·B(끝)를 따로 찍고 고칠 수 있게

  return (
    <div className="ytp">
      <div className="ytp-frame" ref={box} aria-label={title ? `${title} 유튜브 영상` : '유튜브 영상'} />
      {failed && (
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          앱 안에서 재생할 수 없는 영상이에요. <a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-deep)' }}>유튜브에서 보기 ↗</a>
        </p>
      )}
      <div className="ytp-ctl">
        <span className="muted">속도</span>
        {speeds.map(s => (
          <button key={s} type="button" className={'chip sm' + (speed === s ? ' on' : '')} disabled={!ready} onClick={() => pickSpeed(s)}>{s}배</button>
        ))}
      </div>
      <LoopBox a={a} b={b} setA={setA} setB={setB} now={() => player.current?.getCurrentTime?.() ?? 0} go={go} ready={ready} />
      {!!marks?.length && (
        <div className="ytp-marks">
          {marks.map((m, i) => {
            const on = now >= m.t && (i === marks.length - 1 || now < marks[i + 1].t)
            return (
              <button key={i} type="button" className={on ? 'on' : ''} disabled={!ready} onClick={() => go(m.t)}>
                <b>{fmtTime(m.t)}</b><span>{m.label || '여기부터'}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
