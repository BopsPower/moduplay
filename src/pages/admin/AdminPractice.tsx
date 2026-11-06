import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../../components/Shell'
import { supabase } from '../../lib/supabase'
import { BADGES } from '../../lib/badges'
import { fmtMin, seoulDay, streakOf } from '../../lib/practice'
import { BRAND } from '../../lib/brand'

// 관리자만: 학생 연습 현황 (연습 시간·순위·연속 일수·뮤지션 배지). 코치·학생 화면에는 순위가 없음
type Row = { student_id: string; name: string; major: string | null; class_name: string | null; campus: string | null; total_sec: number; days: { day: string; seconds: number }[]; badges: string[]; ladders_done: number; best_bpm: number }
const PERIODS = [{ k: 7, l: '최근 7일' }, { k: 30, l: '최근 30일' }, { k: 90, l: '최근 90일' }, { k: 0, l: '전체' }] as const
const BADGE = new Map(BADGES.map(b => [b.id, b]))
const dayAgo = (n: number) => { const d = new Date(seoulDay() + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10) }

export default function AdminPractice() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState('')
  const [period, setPeriod] = useState<number>(7)
  const [major, setMajor] = useState('전체')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('admin_practice_overview').then(({ data, error }) => {
      if (error) setErr(error.message.includes('not allowed') ? '관리자만 볼 수 있어요.' : '불러오지 못했어요: ' + error.message)
      else setRows((data ?? []) as Row[])
    })
  }, [])

  const list = useMemo(() => {
    if (!rows) return []
    const from = period ? dayAgo(period - 1) : ''
    return rows
      .map(r => {
        const inP = period ? r.days.filter(d => d.day >= from) : r.days
        const sec = period ? inP.reduce((a, d) => a + d.seconds, 0) : Number(r.total_sec)
        const majorOf = r.major ?? r.class_name ?? null
        return { ...r, majorOf, sec, activeDays: period ? inP.filter(d => d.seconds >= 60).length : null, streak: streakOf(r.days), last: r.days.length ? r.days[r.days.length - 1].day : null }
      })
      .filter(r => major === '전체' || r.majorOf === major)
      .filter(r => !q.trim() || r.name.includes(q.trim()))
      .sort((a, b) => b.sec - a.sec || a.name.localeCompare(b.name))
  }, [rows, period, major, q])

  const practiced = list.filter(r => r.sec > 0)
  const totalSec = practiced.reduce((a, r) => a + r.sec, 0)
  const majors = useMemo(() => [...new Set((rows ?? []).map(r => r.major ?? r.class_name).filter(Boolean) as string[])].sort((a, b) => (BRAND.majors as readonly string[]).indexOf(a) - (BRAND.majors as readonly string[]).indexOf(b)), [rows])
  const last14 = Array.from({ length: 14 }, (_, i) => dayAgo(13 - i))

  return (
    <Shell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 980 }}>
        <div>
          <p className="muted" style={{ margin: '0 0 4px', fontSize: 13 }}>관리자 화면 · 코치님과 학생에게는 보이지 않아요 · <Link to="/admin/coaches" style={{ color: 'var(--accent-deep)' }}>코치 이용 현황 ›</Link></p>
          <h1 style={{ margin: 0 }}>학생 연습 현황</h1>
        </div>
        <div className="chips">
          {PERIODS.map(p => <button key={p.k} type="button" className={'chip' + (period === p.k ? ' on' : '')} onClick={() => setPeriod(p.k)}>{p.l}</button>)}
        </div>
        <div className="chips sm">
          {['전체', ...majors].map(m => <button key={m} type="button" className={'chip' + (major === m ? ' on' : '')} onClick={() => setMajor(m)}>{m}</button>)}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름 찾기" aria-label="학생 이름 찾기" style={{ marginLeft: 'auto', padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 999, font: 'inherit', fontSize: 13, minWidth: 120 }} />
        </div>
        {err && <p className="err">{err}</p>}
        {!rows && !err && <p className="muted">불러오는 중…</p>}
        {rows && (
          <div className="ap-sum">
            <div><b>{practiced.length}</b><span>/ {list.length}명 연습함</span></div>
            <div><b>{fmtMin(totalSec)}</b><span>모두 합친 시간</span></div>
            <div><b>{practiced.length ? fmtMin(Math.round(totalSec / practiced.length)) : '—'}</b><span>연습한 학생 평균</span></div>
          </div>
        )}
        {rows && (
          <div className="ap-list">
            {list.map((r, i) => {
              const rank = r.sec > 0 ? practiced.indexOf(r) + 1 : null
              const set = new Map(r.days.map(d => [d.day, d.seconds]))
              const isOpen = open === r.student_id
              return (
                <div key={r.student_id} className={'card ap-row' + (r.sec ? '' : ' none')}>
                  <button type="button" className="ap-main" onClick={() => setOpen(isOpen ? null : r.student_id)} aria-expanded={isOpen}>
                    <span className={'ap-rank' + (rank && rank <= 3 ? ' top' : '')}>{rank ?? '—'}</span>
                    <span className="ap-who"><b>{r.name}</b><small>{[r.majorOf, r.campus].filter(Boolean).join(' · ')}</small></span>
                    <span className="ap-time"><b>{r.sec ? fmtMin(r.sec) : '기록 없음'}</b><small>{r.activeDays != null ? `${r.activeDays}일 연습` : `${r.days.filter(d => d.seconds >= 60).length}일(90일 안)`}{r.streak >= 2 ? ` · 🔥${r.streak}일 연속` : ''}</small></span>
                    <span className="ap-badges" aria-label={`배지 ${r.badges.length}개`}>{r.badges.slice(-6).map(b => <span key={b} title={BADGE.get(b)?.name ?? b}>{BADGE.get(b)?.icon ?? '🏅'}</span>)}{r.badges.length > 6 && <small>+{r.badges.length - 6}</small>}</span>
                  </button>
                  {isOpen && (
                    <div className="ap-detail">
                      <div className="ap-grass" aria-label="최근 14일 연습">
                        {last14.map(d => { const s = set.get(d) ?? 0; return <span key={d} title={`${d.slice(5)} ${s ? fmtMin(s) : '연습 안 함'}`} className={s >= 3600 ? 'l3' : s >= 1200 ? 'l2' : s >= 60 ? 'l1' : ''} /> })}
                        <small>최근 14일 (오른쪽이 오늘)</small>
                      </div>
                      <p style={{ margin: 0, fontSize: 13 }}>
                        전체 누적 <b>{fmtMin(Number(r.total_sec))}</b> · 마지막 연습 <b>{r.last ? r.last.slice(5).replace('-', '/') : '없음'}</b> · 템포 사다리 완주 <b>{r.ladders_done}개</b>{r.best_bpm ? <> · 최고 ♩<b>{r.best_bpm}</b></> : null}
                      </p>
                      <div className="ap-badge-list">
                        {r.badges.length ? r.badges.map(b => <span key={b} className="chip sm">{BADGE.get(b)?.icon} {BADGE.get(b)?.name ?? b}</span>) : <span className="muted" style={{ fontSize: 13 }}>아직 받은 뮤지션 배지가 없어요</span>}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {!list.length && <p className="muted">조건에 맞는 학생이 없어요.</p>}
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>연습 시간은 앱에서 악보 재생·연습 플레이어·유튜브·연습 도구를 쓰는 동안 자동으로 쌓인 시간이에요. 하루 1분 이상이면 '연습한 날'로 셉니다. 앱 밖에서 한 연습은 들어가지 않아요.</p>
      </div>
    </Shell>
  )
}
