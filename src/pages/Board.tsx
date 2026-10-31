import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Shell from '../components/Shell'
import MaterialRow from '../components/MaterialRow'
import { supabase, type Score } from '../lib/supabase'
import { BRAND } from '../lib/brand'
import { matches } from '../lib/search'
import { useAuth } from '../lib/auth'
import { kindOf, listable, publicDesc, publicTags, uploaderLabel } from '../lib/materials'
import { useRecommends } from '../lib/recommends'
import { lastView } from '../lib/view'

// 예전 화면(관리)에서 쓰는 분류 아이콘
const CAT_STYLE: Record<string, { bg: string; fg: string }> = {
  과제곡: { bg: 'var(--accent)', fg: '#fff' },
  연습곡: { bg: '#212121', fg: '#fff' },
  교재: { bg: '#fff1e6', fg: '#c45d0f' },
  기타: { bg: '#eeeeee', fg: '#555' },
}
export function CatIcon({ cat }: { cat?: string | null }) {
  const c = cat && CAT_STYLE[cat] ? cat : '기타'
  const { bg, fg } = CAT_STYLE[c]
  const path: Record<string, ReactElement> = {
    과제곡: <><rect x="6" y="4" width="12" height="17" rx="1.5" /><path d="M9 4h6v3H9z" /><path d="M9 13l2 2 4-4" /></>,
    연습곡: <><path d="M10 18V6l9-2v12" /><circle cx="7.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></>,
    교재: <><path d="M3 5.5c3-1 6-1 9 1v13c-3-2-6-2-9-1z" /><path d="M21 5.5c-3-1-6-1-9 1v13c3-2 6-2 9-1z" /></>,
    기타: <><path d="M6 3h9l4 4v14H6z" /><path d="M9 11h7M9 14h7M9 17h5" /></>,
  }
  return (
    <span className="cat-ic" style={{ background: bg, color: fg }} title={c} aria-hidden="true">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{path[c]}</svg>
    </span>
  )
}

export function Staff() {
  return (
    <svg width="200" height="60" viewBox="0 0 200 60" aria-hidden="true">
      <g stroke="#9e9e9e" strokeWidth="1">{[12, 20, 28, 36, 44].map(y => <line key={y} x1="10" x2="190" y1={y} y2={y} />)}</g>
      <g fill="#424242"><ellipse cx="55" cy="32" rx="4" ry="3" /><ellipse cx="85" cy="28" rx="4" ry="3" /><ellipse cx="115" cy="24" rx="4" ry="3" /><ellipse cx="145" cy="20" rx="4" ry="3" /></g>
    </svg>
  )
}

const KINDS = ['전체', ...BRAND.kinds]

export default function Board() {
  const { isTeacher } = useAuth()
  const [sp, setSp] = useSearchParams()
  const [scores, setScores] = useState<Score[]>([])
  const [loading, setLoading] = useState(true)
  const kind = sp.get('kind') || '전체'
  const area = sp.get('area') || '전체'
  const major = sp.get('major') || '전체'
  const level = sp.get('level') || '전체'
  const who = sp.get('who') || '전체' // 코치 · 학생
  const recOnly = sp.get('rec') === '1'
  const recs = useRecommends()
  const [q, setQ] = useState(sp.get('q') || '')
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v === '전체' || !v) n.delete(k); else n.set(k, v); setSp(n, { replace: true }) }

  useEffect(() => {
    supabase.from('scores').select('*').not('visibility', 'in', '(admin,review)').order('created_at', { ascending: false })
      .then(({ data }) => { setScores((data ?? []) as Score[]); setLoading(false) })
  }, [])

  // 코치 화면에서는 '코치끼리만' 자료도 자료실에 같이 보임 (이름 옆에 '코치끼리만' 표시). 학생 화면으로 볼 때는 빠짐
  const coachView = isTeacher && lastView() !== 'student'
  const base = useMemo(() => scores.filter(s => listable(s, isTeacher) && (s.visibility !== 'coaches' || coachView)), [scores, isTeacher, coachView])
  const shown = useMemo(() => base
    .filter(s => major === '전체' || (major === '공통' ? !s.major : s.major === major))
    .filter(s => kind === '전체' || kindOf(s) === kind)
    .filter(s => area === '전체' || (s.areas ?? []).includes(area))
    .filter(s => level === '전체' || s.level === level)
    .filter(s => !recOnly || !!recs?.get(s.id)?.length)
    .filter(s => who === '전체' || (who === '학생' ? s.uploader_role === 'student' : s.uploader_role !== 'student'))
    .filter(s => matches(q, s.title, s.composer, s.artist, s.song, publicDesc(s.description), s.major, kindOf(s), BRAND.kindLabel[kindOf(s)] ?? '', publicTags(s.tags).join(' '), (s.areas ?? []).join(' '), uploaderLabel(s))),
  [base, kind, area, major, level, who, q, recOnly, recs])

  return (
    <Shell>
      <div className="page-head">
        <div>
          <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>코치님과 학생들이 나누는 연습 자료</p>
          <h1 className="title">자료실</h1>
        </div>
        <Link to="/upload" className="btn primary">＋ 자료 올리기</Link>
      </div>

      <label className="search-box">
        <span className="sr-only">자료 찾기</span>
        <input type="search" value={q} onChange={e => { setQ(e.target.value); set('q', e.target.value) }} placeholder="뮤지션·곡·태그로 찾기 (예: Wes, 셔플, 초성도 돼요)" />
      </label>

      <div className="filters">
        <div className="chips">
          {KINDS.map(k => <button key={k} type="button" className={'chip' + (kind === k ? ' on' : '')} onClick={() => set('kind', k)}>{BRAND.kindLabel[k] ?? k}</button>)}
          <button type="button" className={'chip' + (recOnly ? ' on' : '')} onClick={() => set('rec', recOnly ? '' : '1')} title="코치가 골라서 추천한 곡만">⭐ 코치 추천{recs ? ` ${[...recs.keys()].filter(id => base.some(b => b.id === id)).length}` : ''}</button>
        </div>
        <div className="chips sm">
          <span className="lab">영역</span>
          {['전체', ...BRAND.areas].map(a => <button key={a} type="button" title={BRAND.areaHelp[a]} className={'chip sm' + (area === a ? ' pick' : '')} onClick={() => set('area', a)}>{a}</button>)}
        </div>
        <div className="chips sm">
          <span className="lab">전공</span>
          {['전체', ...BRAND.majors, '공통'].map(m => <button key={m} type="button" className={'chip sm' + (major === m ? ' pick' : '')} onClick={() => set('major', m)}>{m}</button>)}
        </div>
        <div className="chips sm">
          <span className="lab">단계</span>
          {['전체', ...BRAND.levels].map(l => <button key={l} type="button" className={'chip sm' + (level === l ? ' pick' : '')} onClick={() => set('level', l)}>{l}</button>)}
          <span className="lab" style={{ marginLeft: 12 }}>올린 사람</span>
          {['전체', '코치', '학생'].map(w => <button key={w} type="button" className={'chip sm' + (who === w ? ' pick' : '')} onClick={() => set('who', w)}>{w}</button>)}
        </div>
      </div>

      {loading ? <div className="loading">자료를 불러오는 중…</div> : (
        <>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>{shown.length}개</p>
          <div className="mat-list">
            {shown.map(s => <MaterialRow key={s.id} s={s} showScope={isTeacher} />)}
          </div>
          {shown.length === 0 && (
            <section className="card" style={{ padding: 20 }}>
              <p style={{ margin: 0, fontWeight: 700 }}>조건에 맞는 자료가 아직 없어요.</p>
              <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
                내가 딴 카피나 연습한 릭이 있다면 먼저 올려 보세요. 필요한 자료는 <Link to="/#requests" style={{ color: 'var(--accent-deep)' }}>홈의 자료 요청</Link>에 남길 수 있어요.
              </p>
            </section>
          )}
        </>
      )}

      <section className="card ms-note">
        <p><b>더 많은 연습 도구</b><br />코치진이 고른 <Link to="/apps" style={{ color: 'var(--accent-deep)' }}>추천 앱</Link>, 유튜브 영상이나 내 음원을 느리게·구간 반복하는 <Link to="/player" style={{ color: 'var(--accent-deep)' }}>연습 플레이어</Link>, 편곡할 때 쓰는 <Link to="/guide/musescore" style={{ color: 'var(--accent-deep)' }}>뮤즈스코어 사용법</Link>도 있어요.</p>
      </section>
    </Shell>
  )
}
