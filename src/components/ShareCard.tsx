import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { BADGES } from '../lib/badges'
import { seoulDay, streakOf, usePractice } from '../lib/practice'
import { ladderSteps } from './TempoLadder'
import { INSTS, ITEMS, defaultLook, instOfMajor, lookOf, nickOf } from '../lib/avatar'
import { canvasBlob, drawCard, loadCardFont, type CardInput } from '../lib/shareCard'
import Avatar from './Avatar'
import AvatarEdit from './AvatarEdit'

type NameMode = 'nick' | 'mask' | 'hide'
const mask = (n: string) => (n.length <= 1 ? n : n[0] + '○'.repeat(Math.min(2, n.length - 1)))

/** 성과 카드 만들기 창: 미리 보기 → 공유하기 / 그림 저장 */
export function ShareCardModal({ input, onClose }: { input: CardInput; onClose: () => void }) {
  const { session, student } = useAuth()
  const saved = lookOf(session?.user.user_metadata)
  const major = (student as { major?: string | null } | null)?.major ?? student?.class_name
  const look = saved ?? defaultLook(instOfMajor(major), 'f')
  const [mode, setMode] = useState<NameMode>('nick')
  const [url, setUrl] = useState('')
  const [blob, setBlob] = useState<Blob | null>(null)
  const [msg, setMsg] = useState('')
  const [edit, setEdit] = useState(false)
  const svgBox = useRef<HTMLDivElement>(null)
  const realName = student?.name ?? ''
  const name = mode === 'nick' ? nickOf(look) : mode === 'mask' ? (realName ? mask(realName) : null) : null
  const tag = INSTS.find(x => x[0] === look.inst)?.[1] ?? ''

  useEffect(() => {
    let off = false
    loadCardFont().then(async () => {
      const svg = svgBox.current?.querySelector('svg')
      if (!svg) return
      const c = await drawCard(input, new XMLSerializer().serializeToString(svg), { name, tag })
      if (off) return
      const b = await canvasBlob(c)
      if (off) return
      setBlob(b)
      setUrl(old => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(b) })
    }).catch(() => setMsg('카드를 만들지 못했어요. 잠시 뒤 다시 해 주세요.'))
    return () => { off = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(input), name, tag, JSON.stringify(look)])

  const fileName = `모두플레이_${input.kind === 'week' ? '이번주연습' : input.kind === 'ladder' ? '템포사다리' : '배지'}_${seoulDay()}.png`
  const file = () => new File([blob!], fileName, { type: 'image/png' })
  const canShare = !!blob && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file()] })

  async function share() {
    if (!blob) return
    try { await navigator.share({ files: [file()] }) } catch { /* 닫으면 그냥 끝 */ }
  }
  function download() {
    if (!url) return
    const a = document.createElement('a'); a.href = url; a.download = fileName
    document.body.appendChild(a); a.click(); a.remove()
    setMsg('그림을 저장했어요. 인스타그램에서 스토리 만들기 → 방금 저장한 그림을 고르면 돼요.')
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="card modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, maxHeight: '94vh', overflowY: 'auto' }}>
        <b style={{ fontSize: 17 }}>🏆 성과 카드로 자랑하기</b>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ width: 200, aspectRatio: '9 / 16', borderRadius: 14, overflow: 'hidden', background: '#eee', border: '2px solid #1d1a17', flex: 'none' }}>
            {url ? <img src={url} alt="성과 카드 미리 보기" style={{ width: '100%', height: '100%', display: 'block' }} /> : <div className="loading" style={{ padding: 20, fontSize: 13 }}>그리는 중…</div>}
          </div>
          <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <b style={{ fontSize: 13 }}>카드에 보일 이름</b>
            <div className="chips" style={{ gap: 6 }}>
              {([['nick', `별명 (${nickOf(look)})`], ['mask', realName ? `이름 가리기 (${mask(realName)})` : '이름 가리기'], ['hide', '안 보이기']] as [NameMode, string][]).map(([k, l]) => (
                <button key={k} type="button" className={'chip' + (mode === k ? ' on' : '')} style={{ borderRadius: 999 }} onClick={() => setMode(k)} disabled={k === 'mask' && !realName}>{l}</button>
              ))}
            </div>
            {!saved && (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                아직 내 캐릭터가 없어서 기본 캐릭터로 그렸어요. <button type="button" className="linkish" onClick={() => setEdit(true)}>내 캐릭터 만들기</button>
              </p>
            )}
            <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>
              내 기록은 원래 나만 볼 수 있어요. 이 카드는 내가 고른 것만 그림으로 만들어요. 올릴지 말지는 내가 정해요.
            </p>
            {msg && <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>{msg}</p>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 'auto' }}>
              {canShare && <button type="button" className="btn primary" onClick={share}>공유하기 (인스타·카톡)</button>}
              <button type="button" className={canShare ? 'btn ghost' : 'btn primary'} onClick={download} disabled={!url}>그림 저장</button>
              <button type="button" className="btn ghost" onClick={onClose}>닫기</button>
            </div>
          </div>
        </div>
        <div ref={svgBox} aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
          <Avatar look={look} size={600} />
        </div>
        {edit && <AvatarEdit onClose={() => setEdit(false)} />}
      </div>
    </div>
  )
}

type LadderRow = { score_id: string; start_bpm: number; goal_bpm: number; step: number; done_at: string; title?: string }

/** 내 연습 화면: 카드 3종 고르기 */
export function ShareCardsSection() {
  const p = usePractice()
  const [badges, setBadges] = useState<{ badge: string; earned_at: string }[]>([])
  const [ladders, setLadders] = useState<LadderRow[]>([])
  const [open, setOpen] = useState<CardInput | null>(null)
  const [pickBadge, setPickBadge] = useState('')
  const [pickLadder, setPickLadder] = useState('')

  useEffect(() => {
    supabase.from('musician_badges').select('badge, earned_at').order('earned_at', { ascending: false }).then(({ data }) => {
      setBadges(data ?? []); if (data?.[0]) setPickBadge(data[0].badge)
    })
    supabase.from('tempo_ladders').select('score_id, start_bpm, goal_bpm, step, done_at').not('done_at', 'is', null).order('done_at', { ascending: false }).limit(30).then(async ({ data }) => {
      const rows = (data ?? []) as LadderRow[]
      if (rows.length) {
        const { data: sc } = await supabase.from('scores').select('id, title').in('id', rows.map(r => r.score_id))
        const t = new Map<string, string>((sc ?? []).map(s => [s.id as string, s.title as string]))
        rows.forEach(r => { r.title = t.get(r.score_id) ?? '내 연습곡' })
        setPickLadder(rows[0].score_id)
      }
      setLadders(rows)
    })
  }, [])

  // 이번 주 (월~일, 서울 기준)
  const today = seoulDay()
  const d = new Date(today + 'T00:00:00Z')
  const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  const week = Array.from({ length: 7 }, (_, i) => { const x = new Date(mon); x.setUTCDate(mon.getUTCDate() + i); return x.toISOString().slice(0, 10) })
  const byDay = new Map<string, number>(p.days.map((x: { day: string; seconds: number }) => [x.day, x.seconds] as [string, number]))
  const secs = week.map(k => byDay.get(k) ?? 0)
  const md = (k: string) => k.slice(5).replace('-', '.')

  const weekCard = (): CardInput => ({ kind: 'week', range: `${md(week[0])} – ${md(week[6])}`, seconds: secs.reduce((a, b) => a + b, 0), days: secs, streak: streakOf(p.days), badges: badges.length })
  const ladderCard = (): CardInput | null => {
    const l = ladders.find(x => x.score_id === pickLadder); if (!l) return null
    return { kind: 'ladder', start: l.start_bpm, goal: l.goal_bpm, steps: ladderSteps(l), title: l.title ?? '' }
  }
  const badgeCard = (): CardInput | null => {
    const b = BADGES.find(x => x.id === pickBadge); if (!b) return null
    const item = ITEMS.find(i => i.badge === b.id)
    return { kind: 'badge', icon: b.icon, name: b.name, how: b.how, item: item?.name, owned: badges.length, total: BADGES.length }
  }

  const box = { flex: '1 1 220px', padding: 14, border: '2px solid #1d1a17', borderRadius: 16, display: 'flex', flexDirection: 'column' as const, gap: 8 }
  return (
    <section className="card soft" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="sec-h"><h2 style={{ fontSize: 17 }}>🏆 성과 카드로 자랑하기</h2><span className="muted" style={{ fontSize: 12 }}>인스타 스토리 크기 그림</span></div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ ...box, background: '#141225', color: '#fff' }}>
          <b>이번 주 연습</b>
          <span style={{ fontSize: 13, color: '#c6f432' }}>{week[0].slice(5).replace('-', '.')}부터 연습한 시간·잔디·연속 일수</span>
          <button type="button" className="btn primary" style={{ marginTop: 'auto' }} onClick={() => setOpen(weekCard())}>카드 만들기</button>
        </div>
        <div style={{ ...box, background: '#c6f432' }}>
          <b>템포 사다리 완주</b>
          {ladders.length ? (
            <select value={pickLadder} onChange={e => setPickLadder(e.target.value)} aria-label="완주한 사다리 고르기">
              {ladders.map(l => <option key={l.score_id} value={l.score_id}>{l.title} (♩{l.start_bpm}→♩{l.goal_bpm})</option>)}
            </select>
          ) : <span style={{ fontSize: 13 }}>악보 화면에서 템포 사다리를 끝까지 오르면 만들 수 있어요</span>}
          <button type="button" className="btn primary" style={{ marginTop: 'auto' }} disabled={!ladders.length} onClick={() => { const c = ladderCard(); if (c) setOpen(c) }}>카드 만들기</button>
        </div>
        <div style={{ ...box, background: '#ffd6e8' }}>
          <b>뮤지션 배지</b>
          {badges.length ? (
            <select value={pickBadge} onChange={e => setPickBadge(e.target.value)} aria-label="배지 고르기">
              {badges.map(b => { const d = BADGES.find(x => x.id === b.badge); return d ? <option key={b.badge} value={b.badge}>{d.icon} {d.name}</option> : null })}
            </select>
          ) : <span style={{ fontSize: 13 }}>배지를 하나 받으면 만들 수 있어요</span>}
          <button type="button" className="btn primary" style={{ marginTop: 'auto' }} disabled={!badges.length} onClick={() => { const c = badgeCard(); if (c) setOpen(c) }}>카드 만들기</button>
        </div>
      </div>
      {open && <ShareCardModal input={open} onClose={() => setOpen(null)} />}
    </section>
  )
}
