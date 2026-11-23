import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import CoachMultiPick from './CoachPick'
import { ask } from '../lib/dialog'
import { copyText } from '../lib/copy'
import { BRAND } from '../lib/brand'

// 반려 (원장님 2026-11-18 "학생이 아닌 경우 반려… 알림도 가게. 학생이면 연락을 직접 줘라")
// 고른 이유의 문구가 신청자 화면에 그대로 보이고, 센터 전화·카톡 채널이 함께 나옴
const REASONS: Record<'student' | 'coach', { k: string; label: string; note: string }[]> = {
  student: [
    { k: 'not', label: '학원생이 아니에요', note: '모두의음악 학원생으로 확인되지 않았어요. 학원생이라면 다니는 센터로 직접 연락 주세요. 확인되면 바로 열어 드릴게요.' },
    { k: 'info', label: '이름·정보가 달라요', note: '신청한 이름이나 센터·전공이 학원 기록과 달라요. 실명과 다니는 센터를 확인해 다시 신청해 주세요. 잘 모르겠으면 센터로 연락 주세요.' },
    { k: 'own', label: '직접 적기', note: '' },
  ],
  coach: [
    { k: 'not', label: '코치가 아니에요', note: '모두의음악 코치로 확인되지 않았어요. 학원생이라면 [학생이에요]를 골라 다시 신청해 주세요. 코치님이라면 원장님께 직접 연락 주세요.' },
    { k: 'own', label: '직접 적기', note: '' },
  ],
}
export const KAKAO_URL = BRAND.sns.find(l => l.name.includes('카카오') && l.url)?.url
function noticeText(name: string, note: string) {
  return [`안녕하세요, 모두의음악입니다.`, ``, `${name} 님이 보내 주신 모두플레이(play.modu-music.com) 이용 신청이 반려되었어요.`, note, ``,
    `문의: ${BRAND.campuses.map(c => `${c.name} ${c.tel}`).join(' / ')}`, ...(KAKAO_URL ? [`카카오톡 채널: ${KAKAO_URL}`] : [])].join('\n')
}

// 코치 화면: 학생 가입 신청 승인 대기 목록
type Req = { id: string; name: string; email: string | null; major: string | null; campus: string | null; teacher_id: string | null; extra_teacher_ids?: string[] | null; kind?: 'student' | 'coach'; created_at: string }
type Coach = { id: string; name: string }

export default function PendingRequests({ onChange }: { onChange?: () => void }) {
  const { isAdmin } = useAuth()
  const [reqs, setReqs] = useState<Req[]>([])
  const [coaches, setCoaches] = useState<Coach[]>([])
  const [pick, setPick] = useState<Record<string, string>>({})
  const [extras, setExtras] = useState<Record<string, string[]>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [rej, setRej] = useState<{ id: string; k: string; note: string } | null>(null) // 반려 창이 열린 신청
  const [done, setDone] = useState<{ name: string; email: string | null; note: string } | null>(null) // 방금 반려한 신청 (알리기)

  async function load() {
    const [{ data }, { data: c }] = await Promise.all([
      supabase.from('join_requests').select('id,name,email,major,campus,teacher_id,extra_teacher_ids,kind,created_at').eq('status', 'pending').order('created_at'),
      supabase.rpc('list_coaches'),
    ])
    setReqs((data as Req[]) ?? []); setCoaches((c as Coach[]) ?? [])
  }
  useEffect(() => { load() }, [])

  async function approve(r: Req) {
    setMsg('')
    const coach = pick[r.id] ?? r.teacher_id ?? ''
    if (!coach) return setMsg(`${r.name} 학생의 담당 코치를 먼저 골라 주세요.`)
    if (isStaffLike(r) && !await ask(`${r.name} 님은 학원 직원 이메일(${r.email})이에요.\n학생으로 승인할까요? 직원이면 [거절]을 누르고 \"코치예요\"로 다시 신청하도록 안내해 주세요.`)) return
    setBusy(r.id)
    const extra = (extras[r.id] ?? r.extra_teacher_ids ?? []).filter(x => x !== coach)
    const { error } = await supabase.rpc('approve_join_request', { req: r.id, coach, extra })
    setBusy(null)
    if (error) {
      if (error.message.includes('staff account')) return setMsg(`${r.name} 님은 이미 코치·관리자로 등록된 계정이라 학생으로 승인할 수 없어요.`)
      if (error.message.includes('coach required')) return setMsg('담당 코치를 골라 주세요.')
      return setMsg('승인하지 못했어요. 새로고침 후 다시 해 주세요.')
    }
    setMsg(`${r.name} 학생을 승인했어요.`); load(); onChange?.()
  }
  async function approveCoach(r: Req, admin: boolean) {
    if (!await ask(`${r.name} 님을 ${admin ? '관리자' : '코치'}로 등록할까요?\n${r.email}`)) return
    setBusy(r.id); setMsg('')
    const { error } = await supabase.rpc('approve_coach_request', { req: r.id, make_admin: admin })
    setBusy(null)
    if (error) return setMsg('등록하지 못했어요. 새로고침 후 다시 해 주세요.')
    setMsg(`${r.name} 님을 ${admin ? '관리자' : '코치'}로 등록했어요. 다시 로그인하면 코치 화면이 열려요.`); load(); onChange?.()
  }
  function openReject(r: Req) {
    const first = REASONS[r.kind === 'coach' ? 'coach' : 'student'][0]
    setRej(x => x?.id === r.id ? null : { id: r.id, k: first.k, note: first.note }); setMsg('')
  }
  async function reject(r: Req) {
    if (!rej || rej.id !== r.id) return
    const note = rej.note.trim()
    if (!note) return setMsg('신청자에게 보일 안내 문구를 적어 주세요.')
    setBusy(r.id)
    const { error } = await supabase.rpc('reject_join_request', { req: r.id, note })
    setBusy(null)
    if (error) return setMsg('반려하지 못했어요. 새로고침 후 다시 해 주세요.')
    setRej(null); setDone({ name: r.name, email: r.email, note }); setMsg('')
    load(); onChange?.()
  }

  // 학원 도메인 이메일이거나 코치 명단과 같은 이름이면 직원일 수 있음
  const isStaffLike = (r: Req) => !!r.email?.toLowerCase().endsWith('@modu-music.com') || coaches.some(c => c.name.replace(/\s|원장|코치|피디/g, '') === r.name.replace(/\s/g, ''))

  const doneBox = done && (
    <div className="card rej-done">
      <p style={{ margin: 0, fontWeight: 700 }}>{done.name} 님 신청을 반려했어요.</p>
      <p className="muted" style={{ margin: '4px 0 8px', fontSize: 13, lineHeight: 1.6 }}>신청자가 모두플레이에 들어오면 아래 문구와 센터 연락처가 바로 보여요. 기다리는 화면을 열어 두었다면 30초 안에 바뀌어요. 바로 알리려면 메일이나 카톡으로도 보내 주세요.</p>
      <p className="rej-note">{done.note}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        {done.email && <a className="btn sm primary" href={`mailto:${done.email}?subject=${encodeURIComponent('[모두플레이] 이용 신청 안내')}&body=${encodeURIComponent(noticeText(done.name, done.note))}`}>📧 메일로 알리기</a>}
        <button type="button" className="btn sm" onClick={async () => setMsg(await copyText(noticeText(done.name, done.note)) ? '알림 문구를 복사했어요. 카톡·문자에 붙여 넣으세요.' : '복사하지 못했어요.')}>📋 알림 문구 복사</button>
        <button type="button" className="btn sm ghost" onClick={() => setDone(null)}>닫기</button>
      </div>
    </div>
  )
  if (!reqs.length) return (done || msg) ? <>{doneBox}{msg && <p className="ok">{msg}</p>}</> : null
  const fmt = (d: string) => new Date(d).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })

  return (
    <>
    {doneBox}
    <section className="card pending">
      <p className="t">승인 대기 <b>{reqs.length}</b>명</p>
      <p className="muted" style={{ margin: '0 0 6px', fontSize: 13 }}>모두의음악 학원생이 맞는지 확인한 뒤 담당 코치를 골라 승인해 주세요. 승인해야 자료실을 볼 수 있어요. 학원생이 아니거나 모르는 신청은 <b>반려</b>해 주세요. 신청자 화면에 이유와 센터 연락처가 보여요.
        {' '}<b>코치 신청</b>은 {isAdmin ? <>여기서 [코치로 승인]을 눌러 주세요. 관리자 권한은 승인 뒤 <Link to="/admin">관리자 화면</Link>에서 올려요</> : '원장님만 등록할 수 있어요'}. 직원을 학생으로 승인하지 마세요.</p>
      {reqs.map(r => (
        <div key={r.id} className="pending-row">
          <div className="who">
            <b>{r.name}</b> {r.kind !== 'coach' && isStaffLike(r) && <span className="pill" style={{ background: '#fff4d6', color: '#8a5a00' }}>직원일 수 있어요</span>} {r.kind === 'coach'
              ? <><span className="pill on">코치 신청</span> <span className="muted">· {(r.campus ?? '-').split(',').join(', ')} · {fmt(r.created_at)}</span></>
              : <span className="muted">· {r.major ?? '-'} · {r.campus ?? '-'} · {fmt(r.created_at)}</span>}
            <div className="muted" style={{ fontSize: 12 }}>{r.email}</div>
          </div>
{r.kind === 'coach' ? (
            <>
              <button className="btn primary sm" disabled={busy === r.id || !isAdmin} onClick={() => approveCoach(r, false)}>코치로 승인</button>
            </>
          ) : (
            <>
                    <select value={pick[r.id] ?? r.teacher_id ?? ''} onChange={e => setPick(p => ({ ...p, [r.id]: e.target.value }))} aria-label="담당 코치">
            <option value="">담당 코치 선택</option>
            {coaches.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className="btn primary sm" disabled={busy === r.id} onClick={() => approve(r)}>승인</button>
          <div style={{ flexBasis: '100%', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
            <span className="muted" style={{ fontSize: 12 }}>함께 배우는 코치</span>
            <CoachMultiPick small coaches={coaches} exclude={pick[r.id] ?? r.teacher_id} value={extras[r.id] ?? r.extra_teacher_ids ?? []} onChange={v => setExtras(x => ({ ...x, [r.id]: v }))} />
          </div>
            </>
          )}
          <button className={'btn sm' + (rej?.id === r.id ? ' on' : '')} disabled={busy === r.id} onClick={() => openReject(r)} aria-expanded={rej?.id === r.id}>반려</button>
          {rej?.id === r.id && (
            <div className="rej-box">
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>왜 반려하나요? <span className="muted" style={{ fontWeight: 400 }}>· 아래 문구가 신청자 화면에 보여요</span></p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {REASONS[r.kind === 'coach' ? 'coach' : 'student'].map(x => (
                  <button key={x.k} type="button" className={'chip' + (rej.k === x.k ? ' on' : '')} onClick={() => setRej({ id: r.id, k: x.k, note: x.note || (rej.k === 'own' ? rej.note : '') })}>{x.label}</button>
                ))}
              </div>
              <textarea value={rej.note} maxLength={300} rows={4} placeholder="신청자에게 보일 안내를 적어 주세요" onChange={e => setRej({ ...rej, note: e.target.value })} />
              <p className="muted" style={{ margin: 0, fontSize: 12 }}>문구 아래에 센터 전화({BRAND.campuses.map(c => c.tel).join(' · ')})와 카카오톡 채널이 함께 보여요. 신청자는 내용을 고쳐 다시 신청할 수 있어요.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn sm ghost" onClick={() => setRej(null)}>취소</button>
                <button type="button" className="btn sm danger" disabled={busy === r.id} onClick={() => reject(r)}>{busy === r.id ? '반려하는 중…' : '반려하고 알리기'}</button>
              </div>
            </div>
          )}
        </div>
      ))}
      {msg && <p className="ok" style={{ marginTop: 8 }}>{msg}</p>}
    </section>
    </>
  )
}
