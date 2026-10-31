import Shell from '../components/Shell'
import { Grass, LEVELS } from '../components/PracticeCard'
import BadgeBoard from '../components/BadgeBoard'
import { IntroButton } from '../components/IntroVideo'
import { fmtMin, seoulDay, streakOf, usePractice } from '../lib/practice'

// 내 연습: 잔디 · 연속 · 이번 주/이번 달 · 하루 목표 (본인만 볼 수 있음)
export default function Stats() {
  const p = usePractice()
  const today = seoulDay()
  const d = new Date(today + 'T00:00:00Z')
  const monday = new Date(d); monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  const wk = monday.toISOString().slice(0, 10), mo = today.slice(0, 8) + '01'
  const sum = (from: string) => p.days.filter(x => x.day >= from).reduce((a, x) => a + x.seconds, 0)
  const week = sum(wk), month = sum(mo), total = p.days.reduce((a, x) => a + x.seconds, 0)
  const practiced = p.days.filter(x => x.seconds >= 60).length
  const best = p.days.reduce((a, x) => Math.max(a, x.seconds), 0)
  const streak = streakOf(p.days)

  return (
    <Shell>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>나만 볼 수 있는 기록이에요 🔒</p>
        <h1 className="title">내 연습</h1>
      </div>

      <section className="stat-grid">
        <div className="stat"><span>🔥 연속 연습</span><b>{streak}일</b></div>
        <div className="stat"><span>오늘</span><b>{fmtMin(p.todaySec)}</b></div>
        <div className="stat"><span>이번 주</span><b>{fmtMin(week)}</b></div>
        <div className="stat"><span>이번 달</span><b>{fmtMin(month)}</b></div>
      </section>

      <BadgeBoard />

      <section className="card soft" style={{ padding: 18 }}>
        <div className="sec-h"><h2 style={{ fontSize: 17 }}>연습 잔디</h2><span className="muted" style={{ fontSize: 12 }}>최근 26주</span></div>
        <div style={{ overflowX: 'auto', marginTop: 10 }}><Grass days={p.days} weeks={26} /></div>
        <div className="grass-legend">{LEVELS.map((l, i) => <span key={l} className="lg"><i className={`l${i + 1}`} />{l}</span>)}</div>
        <p className="muted" style={{ margin: '10px 0 0', fontSize: 13 }}>지금까지 {practiced}일 · 모두 {fmtMin(total)} · 가장 많이 한 날 {fmtMin(best)}</p>
      </section>

      <section className="card soft" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <b>하루 목표</b>
        <div className="chips">
          {[1, 2, 3, 4, 5, 6, 7, 8].map(h => <button key={h} type="button" className={'chip' + (p.goalMin === h * 60 ? ' on' : '')} onClick={() => p.setGoalMin(h * 60)}>{h}시간{h === 8 ? ' 이상' : ''}</button>)}
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>목표를 채우면 축하해 드려요 🎉</p>
      </section>

      <section className="card soft" style={{ padding: 18 }}>
        <b>어떻게 쌓이나요?</b>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 14, lineHeight: 1.8, color: 'var(--ink-2)' }}>
          <li>메트로놈·스톱워치를 켜 두거나, 악보·내 음원·유튜브를 재생하는 동안 저절로 쌓여요.</li>
          <li>하루 1분 이상 연습하면 잔디가 칠해져요.</li>
          <li>🔥 연속 연습은 하루 쉬어도 이어져요. 이틀 연속 쉬면 처음부터 다시 세요.</li>
          <li>🪜 템포 사다리는 악보·자료 화면에서 만들 수 있어요.</li>
          <li>이 기록과 뮤지션 배지는 나만 볼 수 있어요. 코치님도 볼 수 없어요.</li>
        </ul>
        <div style={{ marginTop: 10 }}><IntroButton label="🎬 30초 소개 영상 다시 보기" /></div>
      </section>
    </Shell>
  )
}
