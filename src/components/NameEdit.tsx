import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'

// 관리자: 내 이름 바꾸기 (코치 이름 + 내 학생 미리보기 기록 + 내가 올린 자료의 '올린 사람' 표시)
export default function NameEdit({ onClose }: { onClose: () => void }) {
  const { session, student, refresh } = useAuth()
  const uid = session?.user.id
  const [name, setName] = useState('')
  const [old, setOld] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!uid) return
    supabase.from('teachers').select('name').eq('user_id', uid).maybeSingle().then(({ data }) => { setOld(data?.name ?? ''); setName(data?.name ?? '') })
  }, [uid])

  async function save(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!uid || !n) return
    if (n.length > 30) return setErr('30자까지 쓸 수 있어요.')
    setBusy(true); setErr('')
    const { error } = await supabase.from('teachers').update({ name: n }).eq('user_id', uid)
    if (error) { setBusy(false); return setErr('바꾸지 못했어요: ' + error.message) }
    // 학생 화면 미리보기용 기록과, 내가 올린 자료에 보이는 이름도 같이 바꿈
    if (student) await supabase.from('students').update({ name: n }).eq('id', student.id)
    await supabase.from('scores').update({ uploader_name: n }).eq('created_by', uid).eq('uploader_role', 'coach')
    await refresh()
    setBusy(false)
    onClose()
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="card modal" onClick={e => e.stopPropagation()} onSubmit={save}>
        <b style={{ fontSize: 17 }}>내 이름 바꾸기</b>
        <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>
          자료의 '올린 사람', 댓글, 코치 목록에 이 이름이 보여요. 이름만 쓰면 뒤에 "코치"가 붙고, "원장"처럼 직함까지 쓰면 그대로 보여요.
        </p>
        <label className="field">
          <span className="l">이름</span>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={30} autoFocus placeholder="예: 정장민 원장" />
        </label>
        {old && <span className="muted" style={{ fontSize: 12 }}>지금 이름: {old}</span>}
        {err && <p className="err">{err}</p>}
        <p className="muted" style={{ margin: 0, fontSize: 12 }}>이미 남긴 댓글의 이름은 그대로 남아요.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn ghost" style={{ flex: 1 }} onClick={onClose}>취소</button>
          <button className="btn primary" style={{ flex: 1 }} disabled={busy || !name.trim() || name.trim() === old}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </form>
    </div>
  )
}
