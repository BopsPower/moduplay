import { useEffect, useState } from 'react'
import Shell from '../../components/Shell'
import { BRAND } from '../../lib/brand'
import { matches } from '../../lib/search'
import { supabase, type Score, type Teacher } from '../../lib/supabase'

// 관리자 화면 › 악보 전체: 누가 올렸든 모든 악보를 찾아보고 공개 범위를 바꾸거나 삭제
export default function AdminScores() {
  const [scores, setScores] = useState<Score[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [q, setQ] = useState('')
  const [by, setBy] = useState('')

  async function load() {
    const [{ data: sc }, { data: t }] = await Promise.all([
      supabase.from('scores').select('*').order('created_at', { ascending: false }),
      supabase.from('teachers').select('*').order('name'),
    ])
    setScores(sc ?? []); setTeachers(t ?? [])
  }
  useEffect(() => { load() }, [])

  const who = (sc: Score) => teachers.find(t => t.user_id && t.user_id === sc.created_by)?.name ?? ''
  async function setVis(sc: Score, v: Score['visibility']) { await supabase.from('scores').update({ visibility: v }).eq('id', sc.id); load() }
  async function remove(sc: Score) {
    if (!confirm(`"${sc.title}" 악보를 삭제할까요? 이 악보로 준 과제도 모두 사라져요.`)) return
    await supabase.storage.from('scores').remove([sc.file_path])
    await supabase.from('scores').delete().eq('id', sc.id); load()
  }

  const uploaders = [...new Set(scores.map(who))]
  const shown = scores.filter(sc => (!by || who(sc) === by) && matches(q, sc.title, sc.composer, sc.major, sc.category, who(sc)))

  return (
    <Shell>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>관리자 화면 · {BRAND.academyShort}</p>
        <h1 className="title">악보 전체 <span className="muted" style={{ fontSize: 16, fontWeight: 400 }}>{scores.length}</span></h1>
      </div>

      <div className="form-row" style={{ alignItems: 'center' }}>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="곡 이름·작곡가·전공 검색 (초성도 돼요)" aria-label="악보 검색"
          style={{ padding: '10px 12px', border: '1px solid #d1d5db', flex: '2 1 240px', font: 'inherit' }} />
        <select value={by} onChange={e => setBy(e.target.value)} aria-label="올린 사람" style={{ padding: '10px 12px', border: '1px solid #d1d5db', font: 'inherit', flex: '1 1 160px' }}>
          <option value="">올린 사람 전체</option>
          {uploaders.map(u => <option key={u || 'none'} value={u}>{u || '기록 없음'}</option>)}
        </select>
      </div>

      <ul className="rows card" style={{ maxHeight: 'none' }}>
        {shown.map(sc => (
          <li key={sc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 12px' }}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <b>{sc.title}</b>
              <div className="muted" style={{ fontSize: 12 }}>
                {[sc.composer, sc.major ?? '공통', sc.category, who(sc) ? `올린 사람 ${who(sc)}` : '올린 사람 기록 없음', (sc as any).created_at?.slice(0, 10),
                  sc.convert_status === 'done' ? '' : sc.convert_status === 'failed' ? '준비 실패' : '준비 중'].filter(Boolean).join(' · ')}
              </div>
            </div>
            <select value={sc.visibility} onChange={e => setVis(sc, e.target.value as Score['visibility'])} aria-label="공개 범위" style={{ padding: '6px 8px', border: '1px solid #d1d5db', font: 'inherit', fontSize: 13 }}>
              <option value="students">자료실 (학원생 전체)</option>
              <option value="assigned">과제 받은 학생만</option>
              <option value="public">외부 공개</option>
            </select>
            <button className="btn sm ghost" onClick={() => remove(sc)}>삭제</button>
          </li>
        ))}
        {shown.length === 0 && <li className="muted" style={{ padding: 16 }}>찾는 악보가 없어요.</li>}
      </ul>
    </Shell>
  )
}
