import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../components/Shell'
import { supabase, type Score } from '../lib/supabase'
import { BRAND } from '../lib/brand'
import { matches } from '../lib/search'

const CATS = ['전체', ...BRAND.categories]

// 악보 종류 아이콘 (과제곡·연습곡·교재·기타)
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
    // 과제곡: 체크 표시가 있는 클립보드
    과제곡: <><rect x="6" y="4" width="12" height="17" rx="1.5" /><path d="M9 4h6v3H9z" /><path d="M9 13l2 2 4-4" /></>,
    // 연습곡: 음표
    연습곡: <><path d="M10 18V6l9-2v12" /><circle cx="7.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></>,
    // 교재: 펼친 책
    교재: <><path d="M3 5.5c3-1 6-1 9 1v13c-3-2-6-2-9-1z" /><path d="M21 5.5c-3-1-6-1-9 1v13c3-2 6-2 9-1z" /></>,
    // 기타: 악보 한 장
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

export default function Board() {
  const [scores, setScores] = useState<Score[]>([])
  const [cat, setCat] = useState('전체')
  const [major, setMajor] = useState('전체')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('scores').select('*').in('visibility', ['students', 'public']).order('created_at', { ascending: false })
      .then(({ data }) => { setScores(data ?? []); setLoading(false) })
  }, [])

  const shown = useMemo(() => scores
    .filter(s => major === '전체' || (major === '공통' ? !s.major : s.major === major))
    .filter(s => cat === '전체' || s.category === cat)
    .filter(s => matches(q, s.title, s.composer, s.description, s.major, s.category)),
  [scores, cat, major, q])

  return (
    <Shell>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>{BRAND.academyShort}이 올려둔 악보</p>
        <h1 className="title">악보 자료실</h1>
      </div>

      <section className="card ms-note">
        <p><b>편곡하거나 고쳐 보고 싶은 곡이 있나요?</b><br />악보를 열고 <b>다운로드 → MuseScore 파일</b>을 받아, 무료 프로그램 뮤즈스코어에서 열면 됩니다.</p>
        <Link to="/guide/musescore" className="btn sm">뮤즈스코어 사용법</Link>
      </section>

      <div className="chips" style={{ marginBottom: -8 }}>
        {['전체', ...BRAND.majors, '공통'].map(m => <button key={m} className={'chip' + (major === m ? ' on' : '')} onClick={() => setMajor(m)}>{m}</button>)}
      </div>
      <div className="chips">
        {CATS.map(c => <button key={c} className={'chip cat' + (cat === c ? ' on' : '')} onClick={() => setCat(c)}>{c !== '전체' && <CatIcon cat={c} />}{c}</button>)}
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }} className="muted">
          검색
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="곡 이름, 작곡가 (일부만, 초성도 돼요)"
            style={{ padding: '8px 12px', border: '1px solid #d1d5db', width: 200 }} />
        </label>
      </div>

      {loading ? <div className="loading">악보를 불러오는 중…</div> : (
        <div className="score-list">
          {shown.map(s => (
            <Link key={s.id} to={`/score/${s.id}`} className="score-row">
              <CatIcon cat={s.category} />
              <span className="txt">
                <span className="t">{s.title}</span>
                <span className="s">{[s.category, s.major, s.composer, s.key_sig, s.tempo && `♩=${s.tempo}`].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="go" aria-hidden="true">›</span>
            </Link>
          ))}
          {shown.length === 0 && <p className="muted">아직 올라온 악보가 없어요.</p>}
        </div>
      )}
    </Shell>
  )
}
