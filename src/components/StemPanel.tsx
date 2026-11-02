import { useEffect, useRef, useState } from 'react'
import { aheadOf, DAILY_LIMIT, getJob, mixStems, requestJob, findJob, STEM_NAME, STEM_ORDER, type StemJob, type StemSource } from '../lib/stems'

// 연습 플레이어 › 🎛 악기 나누기: 맡기기 → 차례 기다리기 → 악기마다 켜고 끄기·소리 크기 → 섞어서 플레이어로
export default function StemPanel({ src, onMix }: { src: StemSource; onMix: (f: File) => void }) {
  const [job, setJob] = useState<StemJob | null>(null)
  const [ahead, setAhead] = useState<number | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [gains, setGains] = useState<Record<string, number>>({})
  const key = src.bucket + ':' + src.path
  const timer = useRef<number>()

  useEffect(() => { setJob(null); setErr(''); setGains({}); findJob(src).then(setJob).catch(() => {}) }, [key])
  // 기다리는 동안 15초마다 확인
  useEffect(() => {
    if (!job || job.status === 'done' || job.status === 'failed') return
    const check = async () => { const j = await getJob(job.id); if (j) setJob(j); if (j && j.status === 'queued') setAhead(await aheadOf(j)) }
    check()
    timer.current = window.setInterval(check, 15000)
    return () => clearInterval(timer.current)
  }, [job?.id, job?.status])

  async function start() {
    setErr(''); setBusy('맡기는 중…')
    try { setJob(await requestJob(src)) } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }
  async function listen() {
    if (!job?.stems) return
    setErr('')
    try {
      const off = STEM_ORDER.filter(s => (gains[s] ?? 1) === 0).map(s => STEM_NAME[s])
      const base = (src.title || '음원').replace(/\.[^.]+$/, '')
      const f = await mixStems(job.stems, gains, `${base}${off.length ? ` (${off.join('·')} 뺌)` : ' (악기 나눔)'}.wav`, setBusy)
      onMix(f)
    } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }

  const stems = job?.stems ? STEM_ORDER.filter(s => job.stems![s]) : []
  return (
    <section className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <b style={{ fontSize: 16 }}>🎛 악기 나누기</b>
        <span className="muted" style={{ fontSize: 12 }}>보컬 · 기타 · 건반 · 베이스 · 드럼으로 나눠서 내 악기만 끄고 연습</span>
      </div>
      {!job && (
        <>
          <button type="button" className="btn primary" onClick={start} disabled={!!busy}>{busy || '이 음원 악기별로 나누기'}</button>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>학원 서버가 나눠요 (한 곡에 몇 분). 내 음원은 하루 {DAILY_LIMIT}곡까지, 자료실 음원은 한 번 나누면 모두 같이 써요.</p>
        </>
      )}
      {job && (job.status === 'queued' || job.status === 'working') && (
        <p style={{ margin: 0 }}>
          {job.status === 'working' ? '⏳ 지금 나누는 중이에요. 몇 분 걸려요.' : `⏳ 차례를 기다리는 중${ahead ? ` · 앞에 ${ahead}곡` : ''}. 서버가 쉬고 있었다면 켜지는 데 1~2분 더 걸려요.`}
          <br /><span className="muted" style={{ fontSize: 12 }}>이 화면을 닫아도 돼요. 다시 열면 결과가 보여요.</span>
        </p>
      )}
      {job?.status === 'failed' && (
        <>
          <p style={{ margin: 0 }}>나누지 못했어요. {job.error && <span className="muted" style={{ fontSize: 12 }}>({job.error.slice(0, 80)})</span>}</p>
          <button type="button" className="btn" onClick={() => { setJob(null); start() }}>다시 맡기기</button>
        </>
      )}
      {job?.status === 'done' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {stems.map(s => {
              const g = gains[s] ?? 1
              return (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button type="button" className={'btn sm' + (g === 0 ? ' ghost' : ' primary')} style={{ minWidth: 76 }}
                    onClick={() => setGains({ ...gains, [s]: g === 0 ? 1 : 0 })} aria-pressed={g > 0}>{g === 0 ? '🔇 ' : '🔈 '}{STEM_NAME[s]}</button>
                  <input type="range" min={0} max={150} step={5} value={Math.round(g * 100)} aria-label={`${STEM_NAME[s]} 소리 크기`}
                    onChange={e => setGains({ ...gains, [s]: Number(e.target.value) / 100 })} style={{ flex: 1 }} />
                  <span className="muted" style={{ width: 40, fontSize: 12, textAlign: 'right' }}>{Math.round(g * 100)}%</span>
                </label>
              )
            })}
          </div>
          <button type="button" className="btn primary" onClick={listen} disabled={!!busy}>{busy || '▶ 이대로 듣기 (위 플레이어로)'}</button>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>내 악기를 🔇로 끄고 들으면 반주처럼 연습할 수 있어요. 템포·키·구간 반복도 그대로 돼요. 나누기는 AI라 악기 소리가 조금 섞여 들릴 수 있어요.</p>
        </>
      )}
      {err && <p style={{ margin: 0, color: '#b42318', fontSize: 13 }}>{err}</p>}
    </section>
  )
}
