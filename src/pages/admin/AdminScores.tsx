import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../../components/Shell'
import { BRAND } from '../../lib/brand'
import { matches } from '../../lib/search'
import { supabase, type Score, type Teacher } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import BulkUpload from '../../components/BulkUpload'
import { cacheGet, cacheSet } from '../../lib/idbCache'

// 목록에 필요한 칸만 (전부 받으면 느려서)
const COLS = 'id,title,composer,category,tempo,file_path,visibility,created_by,created_at,description,convert_status,convert_error,major,kind,hidden'
const CACHE = 'admin-scores-v1'
const PREF = 'mp_admin_scores_filter'
const pref = (() => { try { return JSON.parse(localStorage.getItem(PREF) ?? '{}') } catch { return {} } })()

// 관리자 화면 › 악보 전체: 누가 올렸든 모든 악보를 찾아보고 공개 범위를 바꾸거나 삭제
export default function AdminScores() {
  const { session } = useAuth()
  const [scores, setScores] = useState<Score[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  // 검색어·거르기는 기억해 두었다가 다시 열 때 그대로
  const [q, setQ] = useState<string>(pref.q ?? '')
  const [by, setBy] = useState<string>(pref.by ?? '')
  const [vf, setVf] = useState<string>(pref.vf ?? '') // 공개 범위로 거르기
  const [syncing, setSyncing] = useState(false) // 기억해 둔 목록을 보여 주면서 최신으로 맞추는 중
  const [loaded, setLoaded] = useState(false)
  const [limit, setLimit] = useState(200) // 한 번에 그리는 개수
  const [edit, setEdit] = useState<Score | null>(null) // 고치는 중인 악보
  const [saving, setSaving] = useState(false)

  // 1) 이 브라우저에 기억해 둔 목록을 바로 보여 주고  2) 뒤에서 최신 목록을 한꺼번에(동시에) 받아 바꿔 끼움
  async function load() {
    setSyncing(true)
    const [{ count }, { data: t }] = await Promise.all([
      supabase.from('scores').select('id', { count: 'exact', head: true }),
      supabase.from('teachers').select('*').order('name'),
    ])
    setTeachers(t ?? [])
    const pages = Math.max(1, Math.ceil((count ?? 0) / 1000))
    const parts = await Promise.all(Array.from({ length: pages }, (_, i) =>
      supabase.from('scores').select(COLS).order('created_at', { ascending: false }).order('id').range(i * 1000, i * 1000 + 999)))
    if (parts.some(p => p.error)) { setSyncing(false); return }
    const all = parts.flatMap(p => (p.data ?? []) as unknown as Score[])
    setScores(all); setLoaded(true); setSyncing(false)
    cacheSet(CACHE, { at: Date.now(), rows: all, teachers: t ?? [] })
  }
  useEffect(() => {
    cacheGet<{ rows: Score[]; teachers: Teacher[] }>(CACHE).then(c => {
      if (c?.rows?.length) { setScores(s => s.length ? s : c.rows); setTeachers(x => x.length ? x : c.teachers ?? []); setLoaded(true) }
    })
    load()
  }, [])
  useEffect(() => { try { localStorage.setItem(PREF, JSON.stringify({ q, by, vf })) } catch { /* 무시 */ } }, [q, by, vf])
  // 한 개만 바뀐 건 전체를 다시 받지 않고 그 자리에서 고치기
  function patch(id: string, ch: Partial<Score> | null) {
    setScores(list => {
      const next = ch ? list.map(x => x.id === id ? { ...x, ...ch } : x) : list.filter(x => x.id !== id)
      cacheSet(CACHE, { at: Date.now(), rows: next, teachers })
      return next
    })
  }

  const who = (sc: Score) => teachers.find(t => t.user_id && t.user_id === sc.created_by)?.name ?? ''
  // 사운드슬라이스에서 가져와 변환 보류(hold)인 악보는 공개 범위를 바꾸는 순간 변환 시작
  async function setVis(sc: Score, v: Score['visibility']) {
    const start = (sc as any).convert_status === 'hold' && v !== 'admin'
    const ch: any = start ? { visibility: v, convert_status: 'pending', convert_error: null } : { visibility: v }
    const { error } = await supabase.from('scores').update(ch).eq('id', sc.id)
    if (error) return alert('바꾸지 못했어요: ' + error.message)
    patch(sc.id, ch)
  }
  async function save() {
    if (!edit) return
    if (!edit.title.trim()) return alert('제목을 입력해 주세요.')
    setSaving(true)
    const ch = {
      title: edit.title.trim(), composer: edit.composer?.trim() || null, major: edit.major || null, category: edit.category,
      tempo: edit.tempo || null, description: edit.description?.trim() || null, visibility: edit.visibility,
    }
    const { error } = await supabase.from('scores').update(ch).eq('id', edit.id)
    setSaving(false)
    if (error) return alert('저장하지 못했어요: ' + error.message)
    patch(edit.id, ch); setEdit(null)
  }
  async function remove(sc: Score) {
    if (!confirm(`"${sc.title}" 자료를 삭제할까요? 댓글·보관함 기록도 함께 사라지고 되돌릴 수 없어요.`)) return
    if (sc.file_path) await supabase.storage.from('scores').remove([sc.file_path])
    const { error } = await supabase.from('scores').delete().eq('id', sc.id)
    if (error) return alert('삭제하지 못했어요: ' + error.message)
    patch(sc.id, null)
  }

  const uploaders = [...new Set(scores.map(who))]
  const shown = scores.filter(sc => (!by || who(sc) === by) && (!vf || sc.visibility === vf) && matches(q, sc.title, sc.composer, sc.major, sc.category, who(sc)))

  return (
    <Shell>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>관리자 화면 · {BRAND.academyShort}</p>
        <h1 className="title">악보 전체 <span className="muted" style={{ fontSize: 16, fontWeight: 400 }}>{loaded ? scores.length.toLocaleString() : '불러오는 중…'}</span>
          {syncing && loaded && <span className="muted" style={{ fontSize: 13, fontWeight: 400, marginLeft: 8 }}>· 최신으로 맞추는 중…</span>}</h1>
      </div>
      <Link to="/admin/soundslice" className="btn" style={{ alignSelf: 'flex-start' }}>🎼 사운드슬라이스에서 가져오기</Link>

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
        <select value={vf} onChange={e => setVf(e.target.value)} aria-label="공개 범위로 거르기" style={{ padding: '10px 12px', border: '1px solid #d1d5db', font: 'inherit', flex: '1 1 160px' }}>
          <option value="">공개 범위 전체</option>
          <option value="admin">관리자만 ({scores.filter(s => s.visibility === 'admin').length})</option>
          <option value="coaches">코치끼리만</option>
          <option value="students">학원 전체</option>
          <option value="mine">올린 코치의 학생만</option>
        </select>
      </div>

      <ul className="rows card" style={{ maxHeight: 'none' }}>
        {shown.slice(0, limit).map(sc => (
          <li key={sc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 12px' }}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <b>{sc.title}</b>
              <div className="muted" style={{ fontSize: 12 }}>
                {[sc.composer, sc.major ?? '공통', sc.category, who(sc) ? `올린 사람 ${who(sc)}` : '올린 사람 기록 없음', (sc as any).created_at?.slice(0, 10),
                  sc.convert_status === 'done' ? '' : sc.convert_status === 'failed' ? '준비 실패' : (sc as any).convert_status === 'hold' ? '변환 보류(공개하면 시작)' : '준비 중'].filter(Boolean).join(' · ')}
              </div>
            </div>
            <select value={sc.visibility} onChange={e => setVis(sc, e.target.value as Score['visibility'])} aria-label="공개 범위" style={{ padding: '6px 8px', border: '1px solid #d1d5db', font: 'inherit', fontSize: 13 }}>
              <option value="students">학원 전체</option>
              <option value="mine">올린 코치의 학생만</option>
              <option value="coaches">코치끼리만</option>
              <option value="admin">관리자만</option>
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
        {shown.length === 0 && <li className="muted" style={{ padding: 16 }}>{loaded ? '찾는 악보가 없어요.' : '악보 목록을 불러오는 중이에요… (처음 한 번만 오래 걸리고, 다음부터는 바로 보여요)'}</li>}
      </ul>
      {shown.length > limit && <button type="button" className="btn" style={{ alignSelf: 'center' }} onClick={() => setLimit(l => l + 200)}>더 보기 ({shown.length - limit}개 남음)</button>}
    </Shell>
  )
}
