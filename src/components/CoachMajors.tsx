import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { BRAND } from '../lib/brand'

// 코치 담당 전공 (최대 3) — 자료실 기본 보기·악보 창고·같은 전공 학생 추천에 쓰임
export function useMyCoachMajors() {
  const { session } = useAuth()
  const [majors, setMajors] = useState<string[] | null>(null)
  useEffect(() => {
    if (!session) return
    const load = () => supabase.from('teachers').select('majors').eq('user_id', session.user.id).maybeSingle()
      .then(({ data }) => setMajors(((data as { majors?: string[] | null } | null)?.majors ?? []).filter(Boolean)))
    load(); addEventListener('mp-majors', load)
    return () => removeEventListener('mp-majors', load)
  }, [session])
  return majors
}

/** 고르기 창 */
export function CoachMajorsPicker({ initial, onClose }: { initial: string[]; onClose: () => void }) {
  const [pick, setPick] = useState<string[]>(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const toggle = (m: string) => setPick(p => p.includes(m) ? p.filter(x => x !== m) : p.length >= 3 ? p : [...p, m])
  async function save() {
    setBusy(true); setErr('')
    const { error } = await supabase.rpc('set_my_majors', { m: pick })
    setBusy(false)
    if (error) { setErr(/MAJORS_MAX_3/.test(error.message) ? '3개까지 고를 수 있어요.' : '저장하지 못했어요. 잠시 뒤 다시 해 주세요.'); return }
    dispatchEvent(new Event('mp-majors')); onClose()
  }
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="card modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <b style={{ fontSize: 18 }}>🎓 내 담당 전공 고르기</b>
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>최대 3개까지 골라요. 자료실이 처음부터 <b>내 전공 + 공통</b> 자료로 열리고, 악보 창고·같은 전공 학생 추천에도 쓰여요.</p>
        <div className="chips" style={{ gap: 8 }}>
          {BRAND.majors.map(m => (
            <button key={m} type="button" className={'chip' + (pick.includes(m) ? ' on' : '')} style={{ borderRadius: 999 }} onClick={() => toggle(m)} disabled={!pick.includes(m) && pick.length >= 3}>{m}</button>
          ))}
        </div>
        <span className="muted" style={{ fontSize: 12 }}>{pick.length}/3 · 나중에 오른쪽 위 내 동그라미 메뉴에서 바꿀 수 있어요</span>
        {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={onClose}>닫기</button>
          <button type="button" className="btn primary" onClick={save} disabled={busy || !pick.length}>{busy ? '저장 중…' : '저장하기'}</button>
        </div>
      </div>
    </div>
  )
}

/** 코치 홈: 담당 전공이 비어 있으면 고르라고 안내 */
export function CoachMajorsCard() {
  const majors = useMyCoachMajors()
  const [open, setOpen] = useState(false)
  if (!majors || majors.length) return null
  return (
    <>
      <button type="button" className="card" onClick={() => setOpen(true)}
        style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, background: '#fff1e6', border: '2px solid #f3791f', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit', width: '100%' }}>
        <span style={{ fontSize: 30 }} aria-hidden="true">🎓</span>
        <span style={{ flex: 1 }}>
          <b style={{ fontSize: 16 }}>코치님, 담당 전공을 골라 주세요</b>
          <span className="muted" style={{ display: 'block', fontSize: 13 }}>자료실이 내 전공 + 공통 자료로 열리고, 악보 창고·같은 전공 학생 추천이 켜져요 →</span>
        </span>
      </button>
      {open && <CoachMajorsPicker initial={[]} onClose={() => setOpen(false)} />}
    </>
  )
}

/** 내 계정 메뉴 항목 */
export function CoachMajorsMenuItem() {
  const majors = useMyCoachMajors()
  const [open, setOpen] = useState(false)
  if (majors === null) return null
  return (
    <>
      <button type="button" onClick={e => { e.currentTarget.closest('details')?.removeAttribute('open'); setOpen(true) }}>🎓 내 담당 전공{majors.length ? ` (${majors.join('·')})` : ' 고르기'}</button>
      {open && <CoachMajorsPicker initial={majors} onClose={() => setOpen(false)} />}
    </>
  )
}
