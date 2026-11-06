import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../components/Shell'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { MATERIAL_EXT, uploadScore } from '../lib/uploadScore'
import { imagesToPdf, isImageFile } from '../lib/imagePdf'
import { ago, coachLabel, ytId } from '../lib/materials'
import { ask } from '../lib/dialog'

// 📤 코치님께 보내기 (원장님 2026-11-06 "자신이 카피하고 또는 공부하는 자료를 보내거나" · "코치님 선택해서 보내야지")
// - 공개 범위 'sent': 보낸 학생 · 고른 코치님 · 관리자만 봄 (DB 규칙 2026-11-06_send_to_coach.sql)
// - 손으로 딴 악보 사진은 PDF 한 개로 묶어서 올림
// - 학생 이름은 목록에서 '김○○'로만 보여서, 받는 코치님이 누군지 알게 이름을 숨은 태그(auto:보낸이:)로 남김 (보낸 학생·받은 코치님·관리자만 봄)

const MB = 1024 * 1024
const LIMIT = 50 * MB
type Coach = { id: string; name: string; majors: string[] | null; mine: boolean }
type What = 'copy' | 'rec' | 'study' | 'yt'
const WHAT: { k: What; t: string; d: string }[] = [
  { k: 'copy', t: '📝 내가 딴 카피', d: '악보 파일이나 손으로 쓴 악보 사진' },
  { k: 'rec', t: '🎙 연습 녹음', d: '내가 연주하거나 부른 녹음 (mp3·m4a)' },
  { k: 'study', t: '📚 공부 자료', d: '공부하는 PDF·악보·정리한 사진' },
  { k: 'yt', t: '▶ 유튜브 링크', d: '내 연주 영상이나 같이 보고 싶은 영상' },
]
type Sent = { id: string; title: string; created_at: string; description: string | null; score_sends: { teacher_id: string; seen_at: string | null }[] }

export default function Send() {
  const { session, student, isTeacher } = useAuth()
  const [coaches, setCoaches] = useState<Coach[] | null>(null)
  const [more, setMore] = useState(false)
  const [find, setFind] = useState('')
  const [to, setTo] = useState<Set<string>>(new Set())
  const [what, setWhat] = useState<What>('copy')
  const [files, setFiles] = useState<File[]>([])
  const [yt, setYt] = useState('')
  const [title, setTitle] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const [done, setDone] = useState('')
  const [sent, setSent] = useState<Sent[] | null>(null)
  const [cmt, setCmt] = useState<Map<string, number>>(new Map())
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.rpc('send_coaches').then(({ data }) => {
      const list = (data ?? []) as Coach[]
      setCoaches(list)
      const mine = list.filter(c => c.mine)
      if (mine.length === 1) setTo(new Set([mine[0].id])) // 담당 코치님이 한 분이면 미리 골라 둠
    })
    loadSent()
  }, [])
  async function loadSent() {
    if (!session) return
    const { data } = await supabase.from('scores').select('id,title,created_at,description,score_sends(teacher_id,seen_at)')
      .eq('visibility', 'sent').eq('created_by', session.user.id).order('created_at', { ascending: false }).limit(50)
    const list = (data ?? []) as Sent[]
    setSent(list)
    if (list.length) {
      const { data: c } = await supabase.from('score_comments').select('score_id').in('score_id', list.map(s => s.id))
      const m = new Map<string, number>(); for (const r of (c ?? []) as { score_id: string }[]) m.set(r.score_id, (m.get(r.score_id) ?? 0) + 1)
      setCmt(m)
    }
  }

  const byId = useMemo(() => new Map((coaches ?? []).map(c => [c.id, c])), [coaches])
  const mine = (coaches ?? []).filter(c => c.mine)
  const others = (coaches ?? []).filter(c => !c.mine && (!find.trim() || c.name.includes(find.trim()) || (c.majors ?? []).some(m => m.includes(find.trim()))))
  const toggle = (id: string) => setTo(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const imgs = files.filter(isImageFile)
  function pick(list: FileList | null) {
    setErr(''); setDone('')
    const fs = [...(list ?? [])]
    if (!fs.length) return
    const pics = fs.filter(isImageFile)
    if (pics.length && pics.length !== fs.length) return setErr('사진과 다른 파일은 따로 보내 주세요.')
    if (!pics.length && fs.length > 1) return setErr('파일은 한 번에 하나씩 보내 주세요. (사진은 여러 장을 한 번에 고를 수 있어요)')
    if (!pics.length && !MATERIAL_EXT.test(fs[0].name)) return setErr('이 파일은 보낼 수 없어요. PDF · 악보 파일 · mp3·m4a·wav · 사진만 돼요.')
    if (fs.some(f => f.size > LIMIT)) return setErr('50MB가 넘는 파일은 보낼 수 없어요.')
    setFiles(fs)
    if (!title.trim()) setTitle(pics.length ? '' : fs[0].name.replace(/\.[^.]+$/, ''))
  }

  async function send(e: FormEvent) {
    e.preventDefault()
    setErr(''); setDone('')
    if (!session || !student) return setErr('학생 계정으로 로그인해야 보낼 수 있어요.')
    if (!to.size) return setErr('받을 코치님을 골라 주세요.')
    if (what === 'yt' ? !ytId(yt) : !files.length) return setErr(what === 'yt' ? '유튜브 영상 주소를 붙여 넣어 주세요.' : '보낼 파일을 골라 주세요.')
    const name = title.trim() || (what === 'yt' ? '유튜브 영상' : imgs.length ? '손으로 딴 악보' : files[0].name.replace(/\.[^.]+$/, ''))
    let id = ''
    try {
      let file: File | null = null
      if (what !== 'yt') {
        if (imgs.length) { setBusy(`사진 ${imgs.length}장을 PDF로 묶는 중…`); file = await imagesToPdf(imgs, name) }
        else file = files[0]
        if (file.size > LIMIT) throw new Error('파일이 50MB를 넘어요. 사진 수를 줄여 주세요.')
      }
      setBusy('보내는 중…')
      const major = (student as { major?: string | null }).major ?? null
      const r = await uploadScore({
        file, title: name, category: '기타', kind: what === 'copy' ? '카피 악보' : what === 'yt' ? '시범 영상' : '기타',
        major: major ?? undefined, visibility: 'sent', description: msg, createdBy: session.user.id,
        youtubeUrl: what === 'yt' ? yt.trim() : null,
        tags: [`auto:보낸이:${student.name ?? '학생'}`, `auto:보낸것:${what}`],
      })
      id = r.id
      const { error } = await supabase.from('score_sends').insert([...to].map(t => ({ score_id: id, teacher_id: t })))
      if (error) throw new Error('코치님께 보내지 못했어요: ' + error.message)
      setDone(`${[...to].map(t => coachLabel(byId.get(t)?.name)).join(', ')}께 보냈어요. 코치님이 댓글을 남기면 아래 '내가 보낸 자료'에서 볼 수 있어요.`)
      setFiles([]); setYt(''); setTitle(''); setMsg('')
      loadSent()
    } catch (e2) {
      // 받는 코치님을 못 붙였으면 올린 자료도 지움 (아무도 못 보는 자료가 남지 않게)
      if (id) { const { data } = await supabase.from('scores').select('file_path').eq('id', id).maybeSingle(); await supabase.from('scores').delete().eq('id', id); if (data?.file_path) await supabase.storage.from('scores').remove([data.file_path]) }
      setErr((e2 as Error).message)
    } finally { setBusy('') }
  }

  async function cancel(s: Sent) {
    if (!await ask(`'${s.title}' 보내기를 취소할까요? 코치님 화면에서도 사라지고, 달린 댓글도 함께 지워져요.`)) return
    const { data } = await supabase.from('scores').select('file_path').eq('id', s.id).maybeSingle()
    const { error } = await supabase.from('scores').delete().eq('id', s.id)
    if (!error && data?.file_path) await supabase.storage.from('scores').remove([data.file_path])
    loadSent()
  }

  if (!student) return (
    <Shell>
      <h1 className="title">📤 코치님께 보내기</h1>
      <section className="card" style={{ padding: 18 }}>
        <p style={{ margin: 0 }}>학생 계정에서 쓰는 화면이에요.{isTeacher && <> 학생이 보낸 자료는 <Link to="/inbox" style={{ color: 'var(--accent-deep)' }}>📥 학생이 보낸 자료</Link>에서 볼 수 있어요.</>}</p>
      </section>
    </Shell>
  )

  return (
    <Shell>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>고른 코치님만 볼 수 있어요. 학원 전체에는 올라가지 않아요.</p>
        <h1 className="title">📤 코치님께 보내기</h1>
      </div>

      <form className="card send-form" onSubmit={send} noValidate>
        <fieldset className="field">
          <legend className="l">무엇을 보내나요?</legend>
          <div className="send-what">
            {WHAT.map(w => (
              <button key={w.k} type="button" className={'sw' + (what === w.k ? ' on' : '')} aria-pressed={what === w.k} onClick={() => { setWhat(w.k); setErr(''); setFiles([]) }}>
                <b>{w.t}</b><small>{w.d}</small>
              </button>
            ))}
          </div>
        </fieldset>

        {what === 'yt' ? (
          <label className="field">
            <span className="l">유튜브 영상 주소</span>
            <input type="url" inputMode="url" value={yt} onChange={e => setYt(e.target.value)} placeholder="https://youtu.be/…" />
            <span className="muted" style={{ fontSize: 12 }}>내 연주 영상은 유튜브에 '일부 공개'로 올리고 주소를 붙여 넣으면 돼요.</span>
          </label>
        ) : (
          <>
            <button type="button" className="drop" onClick={() => fileRef.current?.click()}>
              <b>{files.length ? (imgs.length ? `사진 ${imgs.length}장 (PDF 한 개로 묶어서 보내요)` : files[0].name) : what === 'rec' ? '녹음 파일 고르기' : '파일이나 사진 고르기'}</b>
              <span>{files.length ? '다른 파일로 바꾸려면 누르세요'
                : what === 'rec' ? 'mp3 · m4a · wav (휴대폰 음성 메모도 돼요)'
                : 'PDF · MuseScore · MusicXML · MIDI · Guitar Pro · 사진 여러 장'}</span>
            </button>
            <input ref={fileRef} type="file" hidden multiple={what !== 'rec'}
              accept={what === 'rec' ? 'audio/*,.mp3,.m4a,.wav,.aac' : 'image/*,.pdf,.mscz,.musicxml,.mxl,.xml,.mid,.midi,.gp,.gp3,.gp4,.gp5,.gpx,.mp3,.m4a,.wav,.aac'}
              onChange={e => { pick(e.target.files); e.target.value = '' }} />
          </>
        )}

        <label className="field">
          <span className="l">제목 <span className="muted">(곡 이름 등)</span></span>
          <input value={title} onChange={e => setTitle(e.target.value)} maxLength={120} placeholder={what === 'copy' ? '예: Isn’t She Lovely 베이스 카피' : '예: 2주차 연습 녹음'} />
        </label>
        <label className="field">
          <span className="l">코치님께 한마디 <span className="muted">(선택)</span></span>
          <textarea rows={3} value={msg} onChange={e => setMsg(e.target.value)} maxLength={500} placeholder="예: 2절 리듬이 맞게 땄는지 봐 주세요" />
        </label>

        <fieldset className="field">
          <legend className="l">받을 코치님 {to.size > 0 && <span className="muted">· {to.size}분 골랐어요</span>}</legend>
          {coaches === null ? <span className="muted">코치님 목록을 불러오는 중…</span> : (
            <>
              {mine.length > 0 ? (
                <div className="chips">{mine.map(c => <button key={c.id} type="button" className={'chip' + (to.has(c.id) ? ' on' : '')} aria-pressed={to.has(c.id)} onClick={() => toggle(c.id)}>{to.has(c.id) ? '✓ ' : ''}{coachLabel(c.name)}<small className="muted"> {(c.majors ?? []).join('·')}</small></button>)}</div>
              ) : <span className="muted" style={{ fontSize: 13 }}>아직 담당 코치님이 연결되지 않았어요. 아래에서 찾아 골라 주세요.</span>}
              <button type="button" className="linkish" style={{ alignSelf: 'flex-start', fontSize: 13 }} aria-expanded={more || !mine.length} onClick={() => setMore(m => !m)}>
                {more || !mine.length ? '▴ 다른 코치님 접기' : '▾ 다른 코치님께도 보내기'}
              </button>
              {(more || !mine.length) && (
                <div className="send-more">
                  <input className="send-find" value={find} onChange={e => setFind(e.target.value)} placeholder="이름이나 전공으로 찾기 (예: 드럼)" aria-label="코치님 찾기" />
                  <div className="chips">{others.map(c => <button key={c.id} type="button" className={'chip sm' + (to.has(c.id) ? ' on' : '')} aria-pressed={to.has(c.id)} onClick={() => toggle(c.id)}>{to.has(c.id) ? '✓ ' : ''}{coachLabel(c.name)}{c.majors?.length ? <small className="muted"> {c.majors.join('·')}</small> : null}</button>)}
                    {!others.length && <span className="muted" style={{ fontSize: 13 }}>찾는 코치님이 없어요.</span>}
                  </div>
                </div>
              )}
            </>
          )}
        </fieldset>

        {err && <p className="err">{err}</p>}
        {done && <p className="send-done">✅ {done}</p>}
        <button className="btn primary" disabled={!!busy}>{busy || '📤 보내기'}</button>
      </form>

      <section className="sec">
        <div className="sec-h"><h2>내가 보낸 자료</h2><span className="muted" style={{ fontSize: 12 }}>나와 받은 코치님만 보여요</span></div>
        {sent === null ? <div className="loading">불러오는 중…</div> : sent.length ? (
          <ul className="sent-list">
            {sent.map(s => (
              <li key={s.id}>
                <Link to={`/score/${s.id}`} className="sl-main">
                  <b>{s.title}</b>
                  <span className="muted">{ago(s.created_at)} · {s.score_sends.map(x => `${coachLabel(byId.get(x.teacher_id)?.name)} ${x.seen_at ? '👀 봤어요' : '아직 안 봄'}`).join(' · ') || '받는 코치님 없음'}</span>
                  {(cmt.get(s.id) ?? 0) > 0 && <span className="sl-c">💬 댓글 {cmt.get(s.id)}개</span>}
                </Link>
                <button type="button" className="linkish muted" style={{ fontSize: 12 }} onClick={() => cancel(s)}>보내기 취소</button>
              </li>
            ))}
          </ul>
        ) : <p className="muted" style={{ margin: 0, fontSize: 14 }}>아직 보낸 자료가 없어요.</p>}
      </section>
    </Shell>
  )
}
