import { useMemo, useState } from 'react'
import type { Student } from '../lib/supabase'
import { BRAND } from '../lib/brand'
import { matches } from '../lib/search'

// 학생 고르기: 30명이 넘어도 찾기 쉽게 — 검색(초성 가능) + 전공 필터 + 고른 학생 위에 모아 보기
export default function StudentPicker({ students, picked, onChange }: { students: Student[]; picked: Set<string>; onChange: (n: Set<string>) => void }) {
  const [q, setQ] = useState('')
  const [major, setMajor] = useState('')
  const majors = useMemo(() => {
    const has = new Set(students.map(s => s.class_name || '전공 없음'))
    return [...BRAND.majors, '전공 없음'].filter(m => has.has(m))
  }, [students])
  const shown = students
    .filter(s => !major || (s.class_name || '전공 없음') === major)
    .filter(s => matches(q, s.name, s.class_name))
  const set = (fn: (n: Set<string>) => void) => { const n = new Set(picked); fn(n); onChange(n) }
  const allShownOn = shown.length > 0 && shown.every(s => picked.has(s.id))
  const chosen = students.filter(s => picked.has(s.id))

  if (!students.length) return <p className="muted" style={{ margin: 0, fontSize: 14 }}>아직 담당 학생이 없어요. [학생] 탭에서 먼저 추가해 주세요.</p>

  return (
    <div className="spick">
      {chosen.length > 0 && (
        <div className="chosen">
          <span className="muted">고른 학생 {chosen.length}명</span>
          {chosen.map(s => <button key={s.id} type="button" className="chip on" onClick={() => set(n => n.delete(s.id))} aria-label={`${s.name} 빼기`}>{s.name} ✕</button>)}
          <button type="button" className="btn sm ghost" onClick={() => onChange(new Set())}>모두 해제</button>
        </div>
      )}
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="이름 검색 (초성도 돼요: ㄱㅈㅇ)" aria-label="학생 검색" />
      {majors.length > 1 && (
        <div className="chips" role="tablist" aria-label="전공으로 거르기">
          <button type="button" className={'chip' + (!major ? ' on' : '')} onClick={() => setMajor('')}>전체 {students.length}</button>
          {majors.map(m => <button key={m} type="button" className={'chip' + (major === m ? ' on' : '')} onClick={() => setMajor(m)}>{m} {students.filter(s => (s.class_name || '전공 없음') === m).length}</button>)}
        </div>
      )}
      <div className="list-head">
        <span className="muted">{shown.length}명 보임</span>
        {shown.length > 0 && (
          <button type="button" className="btn sm ghost" onClick={() => set(n => shown.forEach(s => allShownOn ? n.delete(s.id) : n.add(s.id)))}>
            {allShownOn ? '보이는 학생 해제' : '보이는 학생 모두 고르기'}
          </button>
        )}
      </div>
      <ul className="rows">
        {shown.map(s => (
          <li key={s.id}>
            <label>
              <input type="checkbox" checked={picked.has(s.id)} onChange={e => set(n => e.target.checked ? n.add(s.id) : n.delete(s.id))} />
              <b>{s.name}</b><span className="muted">{s.class_name ?? '전공 없음'}</span>
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="muted" style={{ padding: 12 }}>찾는 학생이 없어요.</li>}
      </ul>
    </div>
  )
}
