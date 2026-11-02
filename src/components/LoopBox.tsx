import { fmtTime } from '../lib/materials'

// 🔁 구간 반복 상자 — 유튜브 플레이어와 내 음원 플레이어가 같이 씀 (모양·동작을 똑같이)
export default function LoopBox({ a, b, setA, setB, now, go, ready, className = '' }: {
  a: number | null; b: number | null
  setA: (t: number | null) => void; setB: (t: number | null) => void
  now: () => number; go: (t: number) => void; ready: boolean; className?: string
}) {
  const setAHere = () => { const t = now(); setA(t); if (b != null && b <= t + 0.5) setB(null) }
  const setBHere = () => { const t = now(); if (a == null) { setA(Math.max(0, t - 5)); setB(t) } else if (t > a + 0.5) setB(t) }
  const nudge = (which: 'a' | 'b', d: number) => {
    if (which === 'a' && a != null) setA(Math.max(0, b != null ? Math.min(b - 0.5, a + d) : a + d))
    if (which === 'b' && b != null && a != null) setB(Math.max(a + 0.5, b + d))
  }
  return (
    <div className={'ytp-loop' + (a != null && b != null ? ' on' : '') + (className ? ' ' + className : '')}>
      <div className="ytp-loop-h">
        <b>🔁 구간 반복</b>
        <span>{a != null && b != null ? `${fmtTime(a)} ~ ${fmtTime(b)} 반복 중` : a != null ? '이제 끝낼 곳에서 B를 누르세요' : '연습할 부분의 시작에서 A, 끝에서 B'}</span>
      </div>
      <div className="ytp-loop-row">
        <button type="button" className={'ytp-ab-btn' + (a != null ? ' set' : '')} disabled={!ready} onClick={setAHere}>
          <small>시작</small><b>A</b><span>{a != null ? fmtTime(a) : '여기서 찍기'}</span>
        </button>
        <button type="button" className={'ytp-ab-btn' + (b != null ? ' set' : '')} disabled={!ready} onClick={setBHere}>
          <small>끝</small><b>B</b><span>{b != null ? fmtTime(b) : '여기서 찍기'}</span>
        </button>
        <div className="ytp-loop-side">
          <button type="button" className="btn sm" disabled={!ready || a == null} onClick={() => a != null && go(a)}>⏮ A부터</button>
          <button type="button" className="btn sm ghost" disabled={a == null} onClick={() => { setA(null); setB(null) }}>반복 끄기</button>
        </div>
      </div>
      {a != null && (
        <div className="ytp-loop-fine">
          <span>미세 조정</span>
          <button type="button" onClick={() => nudge('a', -0.5)}>A −0.5초</button><button type="button" onClick={() => nudge('a', 0.5)}>A +0.5초</button>
          {b != null && <><button type="button" onClick={() => nudge('b', -0.5)}>B −0.5초</button><button type="button" onClick={() => nudge('b', 0.5)}>B +0.5초</button></>}
        </div>
      )}
    </div>
  )
}
