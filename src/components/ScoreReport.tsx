import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ago, coachLabel } from '../lib/materials'

const REASONS = ['악보가 틀려요 (음·리듬)', '곡·뮤지션 정보가 틀려요', '종류·전공이 틀려요', '학생에게 맞지 않아요', '파일이 깨졌어요']

/** 코치: 악보 화면의 '관리자에게 확인 요청' 단추 + 쓰는 창 */
export function ReportButton({ scoreId, uid }: { scoreId: string; uid: string }) {
  const [open, setOpen] = useState(false)
  const [mine, setMine] = useState<'none' | 'open' | 'loading' | 'off'>('loading')
  const [pick, setPick] = useState<string[]>([])
  const [memo, setMemo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    supabase.from('score_reports').select('id').eq('score_id', scoreId).eq('user_id', uid).eq('status', 'open').limit(1)
      .then(({ data, error }) => setMine(error ? 'off' : data?.length ? 'open' : 'none')) // 표가 아직 없으면 단추 숨김
  }, [scoreId, uid])

  async function send() {
    const reason = [...pick, memo.trim()].filter(Boolean).join(' / ').slice(0, 500)
    if (!reason) return setErr('무엇이 이상한지 하나 골라 주세요.')
    setBusy(true); setErr('')
    const { error } = await supabase.from('score_reports').insert({ score_id: scoreId, reason })
    setBusy(false)
    if (error) return setErr('보내지 못했어요: ' + error.message)
    setMine('open'); setOpen(false)
  }

  if (mine === 'loading' || mine === 'off') return null
  if (mine === 'open') return <span className="btn sm ghost" style={{ cursor: 'default', opacity: .7 }} title="관리자가 확인하면 처리돼요">🚩 확인 요청함</span>
  return (
    <>
      <button type="button" className="btn sm ghost" onClick={() => setOpen(true)} title="이상한 악보를 관리자에게 알려요">🚩 확인 요청</button>
      {open && (
        <div className="modal-bg" onClick={() => setOpen(false)}>
          <div className="card modal" onClick={e => e.stopPropagation()}>
            <b style={{ fontSize: 17 }}>🚩 관리자에게 확인 요청</b>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>이상한 점을 알려 주시면 관리자가 확인하고 고치거나 숨겨요.</p>
            <div className="chips" style={{ gap: 6 }}>
              {REASONS.map(r => (
                <button key={r} type="button" className={'chip' + (pick.includes(r) ? ' on' : '')} style={{ borderRadius: 999 }}
                  onClick={() => setPick(p => p.includes(r) ? p.filter(x => x !== r) : [...p, r])}>{r}</button>
              ))}
            </div>
            <textarea value={memo} onChange={e => setMemo(e.target.value)} maxLength={300} rows={3} placeholder="더 적을 말이 있으면 (예: 12마디 음이 틀려요)" aria-label="자세한 내용" />
            {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>취소</button>
              <button type="button" className="btn primary" onClick={send} disabled={busy}>{busy ? '보내는 중…' : '보내기'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

type Report = { id: string; score_id: string | null; score_title: string; reporter_name: string; by_coach?: boolean; reason: string; status: string; created_at: string; resolved_at: string | null }
const DONE: Record<string, string> = { ok: '문제없음', hidden: '숨김', deleted: '삭제' }

/** 관리자: 확인 요청 목록과 처리 */
export function ReportsCard() {
  const [list, setList] = useState<Report[] | null>(null)
  const [showDone, setShowDone] = useState(false)
  const [busy, setBusy] = useState('')
  const load = () => supabase.from('score_reports').select('*').order('created_at', { ascending: false }).limit(100)
    .then(({ data, error }) => setList(error ? null : (data as Report[])))
  useEffect(() => { load() }, [])

  async function resolve(r: Report, how: 'ok' | 'hidden' | 'deleted') {
    if (how === 'deleted' && !confirm(`"${r.score_title}" 자료를 삭제할까요? 댓글·보관함 기록도 함께 사라지고 되돌릴 수 없어요.`)) return
    setBusy(r.id)
    if (r.score_id && how === 'hidden') {
      const { error } = await supabase.from('scores').update({ hidden: true }).eq('id', r.score_id)
      if (error) { setBusy(''); return alert('숨기지 못했어요: ' + error.message) }
    }
    if (r.score_id && how === 'deleted') {
      const { data: sc } = await supabase.from('scores').select('file_path').eq('id', r.score_id).maybeSingle()
      if (sc?.file_path) await supabase.storage.from('scores').remove([sc.file_path])
      const { error } = await supabase.from('scores').delete().eq('id', r.score_id)
      if (error) { setBusy(''); return alert('삭제하지 못했어요: ' + error.message) }
    }
    // 같은 악보에 온 다른 요청도 함께 처리
    const q = supabase.from('score_reports').update({ status: how, resolved_at: new Date().toISOString() }).eq('status', 'open')
    await (r.score_id ? q.eq('score_id', r.score_id) : q.eq('id', r.id))
    setBusy('')
    load()
  }

  if (list == null) return null
  const open = list.filter(r => r.status === 'open')
  const done = list.filter(r => r.status !== 'open')
  return (
    <section className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12, borderLeft: open.length ? '4px solid #e5484d' : undefined }}>
      <div className="sec-h">
        <h2 style={{ fontSize: 17 }}>🚩 확인 요청 {open.length ? <span style={{ color: '#e5484d' }}>{open.length}</span> : null}</h2>
        {done.length > 0 && <button type="button" className="linkish muted" style={{ fontSize: 13 }} onClick={() => setShowDone(v => !v)}>{showDone ? '처리한 것 접기' : `처리한 것 ${done.length}개`}</button>}
      </div>
      {open.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 14 }}>지금 확인할 요청이 없어요.</p>}
      <ul className="lounge-list">
        {[...open, ...(showDone ? done : [])].map(r => (
          <li key={r.id} style={r.status !== 'open' ? { opacity: .6 } : undefined}>
            <div className="body">
              <b>{r.score_id ? <Link to={`/score/${r.score_id}`}>{r.score_title || '(제목 없음)'}</Link> : r.score_title || '(지운 자료)'}</b>
              <p style={{ margin: '4px 0' }}>{r.reason}</p>
              <span className="muted" style={{ fontSize: 12 }}>{r.by_coach ? coachLabel(r.reporter_name) : `${r.reporter_name || '학생'} 학생`} · {ago(r.created_at)}{r.status !== 'open' ? ` · ${DONE[r.status]}` : ''}</span>
            </div>
            {r.status === 'open' && (
              <div className="acts">
                <button type="button" className="btn sm ghost" disabled={!!busy} onClick={() => resolve(r, 'ok')}>문제없음</button>
                <button type="button" className="btn sm" disabled={!!busy || !r.score_id} onClick={() => resolve(r, 'hidden')}>숨기기</button>
                <button type="button" className="btn sm dark" disabled={!!busy || !r.score_id} onClick={() => resolve(r, 'deleted')}>삭제</button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>숨기기: 학생·코치 목록에서 빠져요(관리자 › 악보 전체에서 다시 보이게 할 수 있어요). 삭제: 되돌릴 수 없어요.</p>
    </section>
  )
}
