import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useTools } from '../lib/tools'
import { usePractice } from '../lib/practice'
import { celebrate } from '../lib/celebrate'
import { checkBadges } from '../lib/badges'
import { refreshLadders } from '../lib/ladders'
import { ShareCardModal } from './ShareCard'

export type Ladder = { score_id: string; start_bpm: number; goal_bpm: number; step: number; best_bpm: number | null; done_at: string | null }

export const ladderSteps = (l: Pick<Ladder, 'start_bpm' | 'goal_bpm' | 'step'>) => {
  const out: number[] = []
  for (let b = l.start_bpm; b < l.goal_bpm; b += l.step) out.push(b)
  out.push(l.goal_bpm)
  return out
}
const round5 = (n: number) => Math.round(n / 5) * 5

// 템포 사다리: 느리게 정확히 → 한 칸씩 빠르게. 기록은 나만 봄.
export default function TempoLadder({ scoreId, origTempo }: { scoreId: string; origTempo: number | null }) {
  const { session } = useAuth()
  const tools = useTools()
  const practice = usePractice()
  const [lad, setLad] = useState<Ladder | null>(null)
  const [loading, setLoading] = useState(true)
  const [edit, setEdit] = useState(false)
  const [goal, setGoal] = useState(origTempo || 120)
  const [start, setStart] = useState(Math.max(40, round5((origTempo || 120) * 0.6)))
  const [step, setStep] = useState(10)
  const [card, setCard] = useState<null | { title: string }>(null)
  async function openCard() {
    const { data } = await supabase.from('scores').select('title').eq('id', scoreId).maybeSingle()
    setCard({ title: data?.title ?? '내 연습곡' })
  }

  useEffect(() => {
    supabase.from('tempo_ladders').select('*').eq('score_id', scoreId).maybeSingle().then(({ data }) => {
      setLad(data as Ladder | null); setLoading(false)
      if (data) { setGoal(data.goal_bpm); setStart(data.start_bpm); setStep(data.step) }
    })
  }, [scoreId])

  async function save(next: Partial<Ladder>) {
    const row = { score_id: scoreId, start_bpm: start, goal_bpm: goal, step, best_bpm: lad?.best_bpm ?? null, done_at: lad?.done_at ?? null, ...next, updated_at: new Date().toISOString() }
    const { data, error } = await supabase.from('tempo_ladders').upsert(row, { onConflict: 'user_id,score_id' }).select().single()
    if (!error && data) { setLad(data as Ladder); refreshLadders() }
    return !error
  }

  async function makeLadder() {
    if (start >= goal) return alert('시작 템포가 목표보다 느려야 해요.')
    await save({ start_bpm: start, goal_bpm: goal, step, best_bpm: lad && lad.best_bpm && lad.best_bpm <= goal ? lad.best_bpm : null, done_at: null })
    setEdit(false)
  }

  if (loading) return null
  const steps = lad ? ladderSteps(lad) : []
  const next = lad ? steps.find(b => !lad.best_bpm || b > lad.best_bpm) ?? null : null
  const doneCount = lad ? steps.filter(b => lad.best_bpm && b <= lad.best_bpm).length : 0

  function play(bpm: number) {
    tools.setBpm(bpm)
    if (!tools.metroOn) tools.toggleMetro()
    tools.show('metro')
  }
  async function clear(bpm: number) {
    const finished = bpm >= (lad?.goal_bpm ?? 0)
    const ok = await save({ best_bpm: bpm, done_at: finished ? new Date().toISOString() : null })
    if (!ok) return
    if (finished) celebrate(`템포 사다리 완주! ♩${bpm} 🪜`)
    else {
      const nb = steps.find(b => b > bpm)
      if (nb && tools.metroOn) tools.setBpm(nb) // 메트로놈이 켜져 있으면 다음 칸 템포로
    }
    if (session) checkBadges(session.user.id, practice.days)
  }

  if (!lad || edit) {
    return (
      <section className="ladder card">
        <div className="ladder-h"><b>🪜 템포 사다리</b><span className="muted">느리게 정확히 → 한 칸씩 빠르게</span></div>
        <div className="ladder-set">
          <label>시작 ♩<input type="number" min={20} max={300} value={start} onChange={e => setStart(Number(e.target.value))} /></label>
          <label>목표 ♩<input type="number" min={30} max={400} value={goal} onChange={e => setGoal(Number(e.target.value))} /></label>
          <label>한 칸<select value={step} onChange={e => setStep(Number(e.target.value))}>{[2, 4, 5, 8, 10, 15, 20].map(n => <option key={n} value={n}>+{n}</option>)}</select></label>
        </div>
        {origTempo ? <p className="muted" style={{ margin: 0, fontSize: 12 }}>이 악보의 원래 템포는 ♩{origTempo}예요.</p> : null}
        <div className="row">
          <button type="button" className="btn primary" style={{ flex: 1 }} onClick={makeLadder}>{lad ? '사다리 다시 만들기' : '사다리 만들기'}</button>
          {lad && <button type="button" className="btn ghost" onClick={() => setEdit(false)}>취소</button>}
        </div>
      </section>
    )
  }

  return (
    <section className="ladder card">
      <div className="ladder-h">
        <b>🪜 템포 사다리</b>
        <span className="muted">{lad.done_at ? '완주! 🎉' : `${doneCount}/${steps.length}칸`}</span>
        <button type="button" className="linkish muted" style={{ marginLeft: 'auto', fontSize: 12 }} onClick={() => setEdit(true)}>바꾸기</button>
      </div>
      <div className="ladder-steps" role="list">
        {steps.map(b => {
          const ok = !!lad.best_bpm && b <= lad.best_bpm
          return (
            <button key={b} type="button" role="listitem" className={'ls' + (ok ? ' ok' : '') + (b === next ? ' next' : '')} onClick={() => play(b)} title={`♩${b}로 메트로놈 켜기`}>
              {ok ? '✓' : ''}{b}
            </button>
          )
        })}
      </div>
      {next ? (
        <div className="row">
          <button type="button" className="btn ghost" onClick={() => play(next)}>♩{next} 메트로놈</button>
          <button type="button" className="btn primary" style={{ flex: 1 }} onClick={() => clear(next)}>♩{next} 성공 ✓</button>
        </div>
      ) : (
        <div className="row">
          <p className="muted" style={{ margin: 0, fontSize: 13, flex: 1 }}>목표 템포까지 다 올랐어요. 더 빠르게 가 보려면 사다리를 바꿔 보세요.</p>
          <button type="button" className="btn primary" onClick={openCard}>🏆 카드로 자랑하기</button>
        </div>
      )}
      {card && <ShareCardModal input={{ kind: 'ladder', start: lad.start_bpm, goal: lad.goal_bpm, steps, title: card.title }} onClose={() => setCard(null)} />}
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>칸을 누르면 그 템포로 메트로놈이 켜져요. 틀리지 않고 칠 수 있을 때 "성공"을 눌러요. · 나만 볼 수 있어요</p>
    </section>
  )
}
