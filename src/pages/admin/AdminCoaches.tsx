import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../../components/Shell'
import { supabase } from '../../lib/supabase'
import { fmtMin, seoulDay } from '../../lib/practice'
import { BRAND } from '../../lib/brand'
import { ago } from '../../lib/materials'

// 관리자만: 코치 이용 현황 (원장님 2026-11-06 "학생 연습 현황처럼 강사도 이용 현황이 나오게")
// DB 함수 admin_coach_overview() (관리자 아니면 막힘). 순위 번호는 붙이지 않음 (학생 쪽과 같은 원칙)
// - 활동 = 자료 올리기 · 추천 · 댓글(학생 피드백) · 앱 사용(연습 기록과 같은 방식, 하루 1분 이상)
type Day = { day: string; up: number; rec: number; cmt: number; sec: number }
type Row = {
  teacher_id: string; name: string; majors: string[] | null; campuses: string[] | null; joined: boolean; last_login: string | null
  students: number; uploads_total: number; recs_total: number; comments_total: number; reviews_total: number
  sends_total: number; sends_unseen: number; app_total_sec: number; days: Day[]
}
const PERIODS = [{ k: 7, l: '최근 7일' }, { k: 30, l: '최근 30일' }, { k: 90, l: '최근 90일' }, { k: 0, l: '전체' }] as const
const SORTS = [{ k: 'act', l: '활동 많은 순' }, { k: 'recent', l: '최근 활동순' }, { k: 'name', l: '이름순' }] as const
const dayAgo = (n: number) => { const d = new Date(seoulDay() + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10) }
const active = (d: Day) => d.up + d.rec + d.cmt > 0 || d.sec >= 60
const md = (day: string) => day.slice(5).replace('-', '/')

export default function AdminCoaches() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState('')
  const [period, setPeriod] = useState<number>(30)
  const [sort, setSort] = useState<'act' | 'recent' | 'name'>('act')
  const [major, setMajor] = useState('전체')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('admin_coach_overview').then(({ data, error }) => {
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
        const sum = (k: 'up' | 'rec' | 'cmt' | 'sec') => inP.reduce((a, d) => a + d[k], 0)
        const p = period
          ? { up: sum('up'), rec: sum('rec'), cmt: sum('cmt'), sec: sum('sec') }
          : { up: r.uploads_total, rec: r.recs_total, cmt: r.comments_total, sec: Number(r.app_total_sec) }
        const actDays = inP.filter(active).length
        const lastAct = [...r.days].reverse().find(active)?.day ?? null
        return { ...r, p, actDays, lastAct, score: actDays * 1000 + p.up + p.rec + p.cmt * 2 + Math.round(p.sec / 600) }
      })
      .filter(r => major === '전체' || (r.majors ?? []).includes(major))
      .filter(r => !q.trim() || r.name.includes(q.trim()))
      .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name)
        : sort === 'recent' ? (b.lastAct ?? '').localeCompare(a.lastAct ?? '') || a.name.localeCompare(b.name)
        : b.score - a.score || a.name.localeCompare(b.name))
  }, [rows, period, sort, major, q])

  const used = list.filter(r => r.actDays > 0)
  const tot = list.reduce((a, r) => ({ up: a.up + r.p.up, rec: a.rec + r.p.rec, cmt: a.cmt + r.p.cmt }), { up: 0, rec: 0, cmt: 0 })
  const unseen = list.reduce((a, r) => a + r.sends_unseen, 0)
  const notJoined = list.filter(r => !r.joined).length
  const majors = useMemo(() => [...new Set((rows ?? []).flatMap(r => r.majors ?? []))].sort((a, b) => (BRAND.majors as readonly string[]).indexOf(a) - (BRAND.majors as readonly string[]).indexOf(b)), [rows])
  const last14 = Array.from({ length: 14 }, (_, i) => dayAgo(13 - i))

  return (
    <Shell>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 980 }}>
        <div>
          <p className="muted" style={{ margin: '0 0 4px', fontSize: 13 }}>관리자 화면 · 코치님과 학생에게는 보이지 않아요 · <Link to="/admin/practice" style={{ color: 'var(--accent-deep)' }}>학생 연습 현황 ›</Link></p>
          <h1 style={{ margin: 0 }}>코치 이용 현황</h1>
        </div>
        <div className="chips">
          {PERIODS.map(p => <button key={p.k} type="button" className={'chip' + (period === p.k ? ' on' : '')} onClick={() => setPeriod(p.k)}>{p.l}</button>)}
        </div>
        <div className="chips sm">
          {['전체', ...majors].map(m => <button key={m} type="button" className={'chip' + (major === m ? ' on' : '')} onClick={() => setMajor(m)}>{m}</button>)}
        </div>
        <div className="chips sm" style={{ alignItems: 'center' }}>
          {SORTS.map(s => <button key={s.k} type="button" className={'chip' + (sort === s.k ? ' on' : '')} onClick={() => setSort(s.k)}>{s.l}</button>)}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름 찾기" aria-label="코치 이름 찾기" style={{ marginLeft: 'auto', padding: '6px 10px', border: '1px solid var(--line)', borderRadius: 999, font: 'inherit', fontSize: 13, minWidth: 120 }} />
        </div>
        {err && <p className="err">{err}</p>}
        {!rows && !err && <p className="muted">불러오는 중…</p>}
        {rows && (
          <div className="ap-sum ac-sum">
            <div><b>{used.length}</b><span>/ {list.length}명 활동함{period ? '' : ' (90일 안)'}</span></div>
            <div><b>{tot.up}</b><span>올린 자료</span></div>
            <div><b>{tot.cmt}</b><span>학생 피드백(댓글)</span></div>
            <div><b>{tot.rec}</b><span>추천</span></div>
          </div>
        )}
        {rows && (unseen > 0 || notJoined > 0) && (
          <p className="ac-note">
            {notJoined > 0 && <>아직 가입하지 않은 코치님 <b>{notJoined}명</b></>}
            {notJoined > 0 && unseen > 0 && ' · '}
            {unseen > 0 && <>학생이 보낸 자료 중 아직 안 본 것 <b>{unseen}개</b></>}
          </p>
        )}
        {rows && (
          <div className="ap-list">
            {list.map(r => {
              const set = new Map(r.days.map(d => [d.day, d]))
              const isOpen = open === r.teacher_id
              const bits = [r.p.up && `올림 ${r.p.up}`, r.p.rec && `추천 ${r.p.rec}`, r.p.cmt && `댓글 ${r.p.cmt}`, r.p.sec >= 60 && `앱 ${fmtMin(r.p.sec)}`].filter(Boolean)
              return (
                <div key={r.teacher_id} className={'card ap-row' + (r.actDays ? '' : ' none')}>
                  <button type="button" className="ap-main ac-main" onClick={() => setOpen(isOpen ? null : r.teacher_id)} aria-expanded={isOpen}>
                    <span className="ap-who"><b>{r.name}</b><small>{[(r.majors ?? []).join('·'), (r.campuses ?? []).join('·')].filter(Boolean).join(' · ') || '전공 미정'}</small></span>
                    <span className="ap-time">
                      <b>{!r.joined ? '가입 전' : r.actDays ? `${r.actDays}일 활동` : '활동 없음'}</b>
                      <small>{bits.length ? bits.join(' · ') : r.joined ? (r.lastAct ? `마지막 활동 ${md(r.lastAct)}` : '최근 90일 활동 없음') : '아직 가입하지 않았어요'}</small>
                    </span>
                    <span className="ac-side">
                      <b>학생 {r.students}명</b>
                      {r.sends_unseen > 0 && <small className="ac-unseen">안 본 자료 {r.sends_unseen}</small>}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="ap-detail">
                      <div className="ap-grass" aria-label="최근 14일 활동">
                        {last14.map(d => { const x = set.get(d); const n = x ? x.up + x.rec + x.cmt : 0; const s = x?.sec ?? 0; const lv = n >= 5 || s >= 3600 ? 'l3' : n >= 2 || s >= 1200 ? 'l2' : n >= 1 || s >= 60 ? 'l1' : ''
                          return <span key={d} className={lv} title={`${md(d)} ${x ? [x.up && `올림 ${x.up}`, x.rec && `추천 ${x.rec}`, x.cmt && `댓글 ${x.cmt}`, s >= 60 && `앱 ${fmtMin(s)}`].filter(Boolean).join(' · ') || '활동 없음' : '활동 없음'}`} /> })}
                        <small>최근 14일 (오른쪽이 오늘)</small>
                      </div>
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
                        전체 누적: 올린 자료 <b>{r.uploads_total}</b> · 추천 <b>{r.recs_total}</b> · 댓글 <b>{r.comments_total}</b> · 검수 <b>{r.reviews_total}</b> · 앱 사용 <b>{fmtMin(Number(r.app_total_sec))}</b><br />
                        학생이 보낸 자료 <b>{r.sends_total}</b>개{r.sends_total ? <> (안 봄 <b>{r.sends_unseen}</b>)</> : null} · 마지막 활동 <b>{r.lastAct ? md(r.lastAct) : '없음'}</b> · 마지막 로그인 <b>{r.last_login ? ago(r.last_login) : r.joined ? '기록 없음' : '가입 전'}</b>
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
            {!list.length && <p className="muted">조건에 맞는 코치님이 없어요.</p>}
          </div>
        )}
        <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: 1.6 }}>
          활동은 자료 올리기·추천·댓글(학생 피드백)과 앱 사용(악보 재생·연습 플레이어·연습 도구를 쓴 시간, 하루 1분 이상)을 모두 합쳐 셉니다.
          '전체'의 활동한 날은 최근 90일 안에서만 셉니다. 마지막 로그인은 다시 로그인한 때라, 로그인한 채로 계속 쓰면 오래전으로 보일 수 있어요.
          레슨 중 앱 밖에서 한 일은 들어가지 않아요.
        </p>
      </div>
    </Shell>
  )
}
