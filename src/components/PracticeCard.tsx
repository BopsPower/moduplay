import { Link } from 'react-router-dom'
import { fmtMin, seoulDay, streakOf, usePractice } from '../lib/practice'

// 잔디 색 (연습 시간 기준)
export const LEVELS = ['1분~1시간', '1~2시간', '2~4시간', '4~6시간', '6시간 이상']

type Day = { day: string; seconds: number }

// 연습 잔디: 오래된 주 → 최근 주 (세로 7칸 = 월~일)
export function Grass({ days, weeks = 18 }: { days: Day[]; weeks?: number }) {
  const map = new Map(days.map(d => [d.day, d.seconds]))
  const today = new Date(seoulDay() + 'T00:00:00Z')
  const dow = (today.getUTCDay() + 6) % 7 // 월=0
  const start = new Date(today); start.setUTCDate(today.getUTCDate() - dow - (weeks - 1) * 7)
  const cols: { k: string; s: number; future: boolean }[][] = []
  for (let w = 0; w < weeks; w++) {
    const col = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setUTCDate(start.getUTCDate() + w * 7 + i)
      const k = d.toISOString().slice(0, 10)
      col.push({ k, s: map.get(k) ?? 0, future: d > today })
    }
    cols.push(col)
  }
  const lv = (s: number) => s < 60 ? 0 : s < 3600 ? 1 : s < 7200 ? 2 : s < 14400 ? 3 : s < 21600 ? 4 : 5
  return (
    <div className="grass" role="img" aria-label="최근 연습한 날">
      {cols.map((c, i) => (
        <div key={i} className="grass-col">
          {c.map(d => <span key={d.k} className={d.future ? 'f' : `l${lv(d.s)}`} title={`${d.k} · ${fmtMin(d.s)}`} />)}
        </div>
      ))}
    </div>
  )
}

// 홈 맨 위: 오늘 연습 + 연속 + 잔디
export default function PracticeCard() {
  const p = usePractice()
  const streak = streakOf(p.days)
  const pct = Math.min(100, Math.round(p.todaySec / (p.goalMin * 60) * 100))
  return (
    <Link to="/me" className="pcard">
      <div className="pcard-top">
        <div className="ring" style={{ ['--p' as any]: pct }}>
          <span className="ring-txt"><b>{Math.floor(p.todaySec / 3600)}:{String(Math.floor(p.todaySec / 60) % 60).padStart(2, '0')}</b><small>/ {p.goalMin / 60}시간</small></span>
        </div>
        <div className="pcard-txt">
          <span className="k">오늘의 연습 {p.active && <i className="live">● 기록 중</i>}</span>
          <b className="t">{pct >= 100 ? '오늘 목표 달성! 🎉' : p.todaySec < 60 ? '오늘도 시작해 볼까요?' : `목표까지 ${fmtMin(Math.max(0, p.goalMin * 60 - p.todaySec))} 남았어요`}</b>
          <span className="s">🔥 {streak}일 연속 연습{streak === 0 ? ' · 오늘부터 시작!' : ''}</span>
        </div>
      </div>
      <Grass days={p.days} weeks={14} />
      <span className="pcard-foot">메트로놈·스톱워치·악보 재생·연습 플레이어를 쓰면 저절로 쌓여요 · 나만 볼 수 있어요 ›</span>
    </Link>
  )
}
