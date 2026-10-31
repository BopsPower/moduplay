import { useEffect, useState } from 'react'
import Shell from '../../components/Shell'
import { BRAND } from '../../lib/brand'
import { matches } from '../../lib/search'
import { supabase, type Score, type Teacher } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import BulkUpload from '../../components/BulkUpload'

// 관리자 화면 › 악보 전체: 누가 올렸든 모든 악보를 찾아보고 공개 범위를 바꾸거나 삭제
export default function AdminScores() {
  const { session } = useAuth()
  const [scores, setScores] = useState<Score[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [q, setQ] = useState('')
  const [by, setBy] = useState('')
  const [edit, setEdit] = useState<Score | null>(null) // 고치는 중인 악보
  const [saving, setSaving] = useState(false)

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
  async function save() {
    if (!edit) return
    if (!edit.title.trim()) return alert('제목을 입력해 주세요.')
    setSaving(true)
    const { error } = await supabase.from('scores').update({
      title: edit.title.trim(), composer: edit.composer?.trim() || null, major: edit.major || null, category: edit.category,
      tempo: edit.tempo || null, description: edit.description?.trim() || null, visibility: edit.visibility,
    }).eq('id', edit.id)
    setSaving(false)
    if (error) return alert('저장하지 못했어요: ' + error.message)
    setEdit(null); load()
  }
  async function remove(sc: Score) {
    if (!confirm(`"${sc.title}" 자료를 삭제할까요? 댓글·보관함 기록도 함께 사라지고 되돌릴 수 없어요.`)) return
    if (sc.file_path) await supabase.storage.from('scores').remove([sc.file_path])
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

      <details className="card" style={{ padding: '14px 18px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>여러 개 한꺼번에 올리기 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>PC에서 파일·폴더 끌어다 놓기</span></summary>
        <div style={{ marginTop: 12 }}><BulkUpload createdBy={session?.user.id} existingTitles={scores.map(x => x.title)} onDone={load} /></div>
      </details>

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
              <option value="students">학원 전체</option>
              <option value="mine">올린 코치의 학생만</option>
              <option value="coaches">코치끼리만</option>
              {sc.visibility === 'selected' && <option value="selected">고른 학생만</option>}
              {sc.visibility === 'assigned' && <option value="assigned">과제 받은 학생만 (예전)</option>}
              {sc.visibility === 'public' && <option value="public">학원 전체 (예전 값)</option>}
            </select>
            <button className="btn sm ghost" onClick={() => setEdit(edit?.id === sc.id ? null : { ...sc })}>{edit?.id === sc.id ? '닫기' : '고치기'}</button>
            <button className="btn sm ghost" onClick={() => remove(sc)}>삭제</button>
            {edit?.id === sc.id && (
              <div className="edit-box">
                <div className="form-row">
                  <label className="field" style={{ flex: '2 1 220px' }}><span>제목 <em className="req">필수</em></span><input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} /></label>
                  <label className="field" style={{ flex: '1 1 160px' }}><span>작곡가 <em className="opt">선택</em></span><input value={edit.composer ?? ''} onChange={e => setEdit({ ...edit, composer: e.target.value })} /></label>
                </div>
                <div className="form-row">
                  <label className="field"><span>전공</span>
                    <select value={edit.major ?? ''} onChange={e => setEdit({ ...edit, major: e.target.value || null })}><option value="">공통</option>{BRAND.majors.map(m => <option key={m}>{m}</option>)}</select>
                  </label>
                  <label className="field"><span>분류</span>
                    <select value={edit.category} onChange={e => setEdit({ ...edit, category: e.target.value })}>{BRAND.categories.map(c => <option key={c}>{c}</option>)}</select>
                  </label>
                  <label className="field" style={{ flex: '0 1 150px' }}><span>기본 빠르기(BPM) <em className="opt">선택</em></span>
                    <input type="number" min={20} max={300} value={edit.tempo ?? ''} onChange={e => setEdit({ ...edit, tempo: e.target.value ? Number(e.target.value) : null })} placeholder="비우면 100" /></label>
                </div>
                <label className="field"><span>한 줄 소개 <em className="opt">선택 · 자료실에 보여요</em></span><input value={edit.description ?? ''} onChange={e => setEdit({ ...edit, description: e.target.value })} /></label>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn sm" onClick={() => setEdit(null)}>취소</button>
                  <button className="btn sm primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
                </div>
              </div>
            )}
          </li>
        ))}
        {shown.length === 0 && <li className="muted" style={{ padding: 16 }}>찾는 악보가 없어요.</li>}
      </ul>
    </Shell>
  )
}
