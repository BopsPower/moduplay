import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ytId } from '../lib/materials'
import { handAudio } from '../lib/handoff'
import { DAILY_LIMIT } from '../lib/stems'
import { useTools } from '../lib/tools'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { InboxItem, loadInbox, type InboxRow } from '../pages/Inbox'

// 홈 맨 위 상자들 (원장님 2026-11-06)
// - 학생: "자료 올리기" 대신 '내 곡 연습하기' — 유튜브 붙여 넣기 / 내 음원 올려 바로 악기 나누기 / 코치님께 보내기
//   (자료실에 자료 올리기는 자료실 화면 안에 그대로 있음)
// - 코치: 자료 올리기는 그대로 + 학생들이 이 앱에서 하는 연습 기능을 한눈에 + 학생이 보낸 자료

export function MyPracticeBox() {
  const nav = useNavigate()
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const openYt = (u: string) => { if (!ytId(u)) return false; nav('/player?yt=' + encodeURIComponent(u.trim())); return true }
  const submit = (e: FormEvent) => { e.preventDefault(); setErr(''); if (!openYt(url)) setErr('유튜브 영상 주소를 붙여 넣어 주세요. (예: https://youtu.be/…)') }
  return (
    <section className="card mybox" aria-labelledby="mybox-h">
      <div className="mybox-h">
        <b id="mybox-h">🎧 내 곡 연습하기</b>
        <span>카피하고 싶은 곡을 바로 열어요</span>
      </div>
      <form className="mybox-yt" onSubmit={submit} noValidate>
        <input type="url" inputMode="url" value={url} onChange={e => { setUrl(e.target.value); setErr('') }}
          onPaste={e => { const t = e.clipboardData.getData('text'); if (ytId(t)) { e.preventDefault(); setUrl(t); openYt(t) } }}
          placeholder="유튜브 주소 붙여 넣기" aria-label="유튜브 영상 주소" />
        <button className="btn dark">▶ 열기</button>
      </form>
      {err && <p className="err">{err}</p>}
      <div className="mybox-btns">
        <button type="button" className="mybox-b" onClick={() => fileRef.current?.click()}>
          <i aria-hidden="true">🎛</i><span><b>내 음원 올리기</b><small>올리면 바로 악기를 나눠서 내 악기만 빼고 연습</small></span>
        </button>
        <Link to="/send" className="mybox-b">
          <i aria-hidden="true">📤</i><span><b>코치님께 보내기</b><small>내가 딴 카피·공부 자료·연습 녹음</small></span>
        </Link>
      </div>
      <input ref={fileRef} type="file" hidden accept="audio/*,.mp3,.m4a,.wav,.aac"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { handAudio(f, true); nav('/player?tab=file') } }} />
      <p className="mybox-note">유튜브는 느리게·구간 반복으로 연습해요. 악기 나누기는 음원 파일로 돼요 (하루 {DAILY_LIMIT}곡).</p>
    </section>
  )
}

// 코치: 학생들이 이 앱에서 하는 연습 — 레슨에서 바로 권할 수 있게 한눈에
export function CoachFeatures() {
  const tools = useTools()
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('mp_coach_feat') !== 'closed' } catch { return true } })
  const toggle = () => setOpen(o => { try { localStorage.setItem('mp_coach_feat', o ? 'closed' : 'open') } catch { /* 무시 */ } return !o })
  return (
    <section className="card feat-card">
      <button type="button" className="feat-h" aria-expanded={open} onClick={toggle}>
        <b>🎓 학생들이 이 앱에서 하는 연습</b>
        <span className="muted">{open ? '접기 ▴' : '펼치기 ▾'}</span>
      </button>
      {open && (
        <>
          <p className="feat-sub">레슨 때 "이걸로 연습해 와"라고 권해 주세요. 눌러서 바로 써 볼 수 있어요.</p>
          <div className="feat-grid">
            <Link to="/player" className="feat"><i aria-hidden="true">▶</i><span><b>유튜브 느리게·구간 반복</b><small>곡을 75%로 늦추고 막히는 구간만 반복. 같은 속도·구간을 카톡으로 학생에게 보내기</small></span></Link>
            <Link to="/player?tab=file" className="feat"><i aria-hidden="true">🎛</i><span><b>악기 나누기</b><small>음원을 보컬·기타·건반·베이스·드럼으로 나눠 내 악기만 빼고 반주처럼</small></span></Link>
            <Link to="/player?tab=bt" className="feat"><i aria-hidden="true">🎹</i><span><b>백킹트랙</b><small>코드 진행만 적으면 반주가 바로</small></span></Link>
            <Link to="/board" className="feat"><i aria-hidden="true">🎼</i><span><b>악보 재생</b><small>자료실 악보를 실제 악기 소리로. 빠르기·마디 구간 반복·템포 사다리</small></span></Link>
            <button type="button" className="feat" onClick={() => tools.show('metro')}><i aria-hidden="true">🥁</i><span><b>연습 도구</b><small>메트로놈·튜너·타이머. 어느 화면에서나 오른쪽 아래 동그라미</small></span></button>
            <Link to="/inbox" className="feat"><i aria-hidden="true">📥</i><span><b>학생이 보낸 자료</b><small>학생이 딴 카피·연습 녹음을 코치님께 보내요. 댓글로 의견</small></span></Link>
          </div>
        </>
      )}
    </section>
  )
}

// 코치: 학생이 보낸 자료 (새로 온 게 있을 때만 홈 위쪽에)
export function InboxCard() {
  const { session } = useAuth()
  const [rows, setRows] = useState<InboxRow[]>([])
  useEffect(() => {
    if (!session) return
    supabase.from('teachers').select('id').eq('user_id', session.user.id).maybeSingle()
      .then(async ({ data }) => { if (data?.id) setRows(await loadInbox(data.id, 30)) })
  }, [session])
  const fresh = rows.filter(r => !r.seen_at)
  if (!fresh.length) return null
  return (
    <section className="card inbox-card">
      <div className="sec-h"><h2>📥 학생이 보낸 자료 <span className="ib-n">{fresh.length}</span></h2><Link to="/inbox">모두 보기 ›</Link></div>
      <ul className="inbox-list">{fresh.slice(0, 3).map(r => <InboxItem key={r.score_id} r={r} />)}</ul>
    </section>
  )
}
