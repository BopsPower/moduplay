import { useEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import Avatar from './Avatar'
import {
  BGS, COLORS, INST_COLORS, FACES, HAIRS, HAIR_COLORS, INSTS, ITEMS, NICKS, OUTFITS, SKIN_LIST,
  defaultLook, instOfMajor, lookOf, nickOf, saveLook, unlockedItems, type AvatarLook, type ItemKey,
} from '../lib/avatar'

// 내 캐릭터 꾸미기: 화면 오른쪽 위 동그라미에 이 캐릭터 얼굴이 보여요
export default function AvatarEdit({ onClose }: { onClose: () => void }) {
  const { session, student, isTeacher } = useAuth()
  const saved = lookOf(session?.user.user_metadata)
  const major = (student as { major?: string | null } | null)?.major ?? student?.class_name
  const [look, setLook] = useState<AvatarLook>(() => saved ?? defaultLook(instOfMajor(major), 'f'))
  const [open, setOpen] = useState<Set<ItemKey>>(new Set(['phones']))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => { unlockedItems(isTeacher).then(setOpen).catch(() => { /* 못 불러와도 기본 아이템만 */ }) }, [isTeacher])

  const set = (p: Partial<AvatarLook>) => setLook(l => ({ ...l, ...p }))
  // 성별·악기를 바꾸면 그 전공 기본 모습으로 (별명·피부색은 유지)
  const base = (inst = look.inst, gender = look.gender) => setLook(l => ({ ...defaultLook(inst, gender), skin: l.skin, nick: l.nick, items: l.items, instColor: l.instColor }))
  const toggle = (k: ItemKey) => open.has(k) && set({ items: { ...look.items, [k]: !look.items?.[k] } })

  async function save() {
    const n = (look.nick ?? '').trim()
    if (n.length > 12) return setErr('별명은 12자까지 쓸 수 있어요.')
    setBusy(true); setErr('')
    const e = await saveLook({ ...look, nick: n || undefined })
    setBusy(false)
    if (e) return setErr('저장하지 못했어요: ' + e.message)
    onClose()
  }

  const chip = (on: boolean, label: string, pick: () => void, locked = false) => (
    <button key={label} type="button" className={'chip' + (on ? ' on' : '')} onClick={pick} disabled={locked}
      style={{ borderRadius: 999, opacity: locked ? 0.45 : 1 }}>{locked ? '🔒 ' : ''}{label}</button>
  )
  const dot = (on: boolean, c: string, label: string, pick: () => void) => (
    <button key={label} type="button" aria-label={label} title={label} onClick={pick}
      style={{ width: 34, height: 34, borderRadius: '50%', background: c, cursor: 'pointer', border: '2px solid #1d1a17', boxShadow: on ? '0 0 0 3px #fff, 0 0 0 5px #1d1a17' : 'none' }} />
  )
  const row = (t: string, kids: ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <b style={{ fontSize: 13 }}>{t}</b>
      <div className="chips" style={{ gap: 6 }}>{kids}</div>
    </div>
  )

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="card modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 760, maxHeight: '92vh', overflowY: 'auto' }}>
        <b style={{ fontSize: 17 }}>내 뮤지션 캐릭터</b>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 18, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, position: 'sticky', top: 0 }}>
            <Avatar look={look} size={200} />
            <span style={{ background: '#1d1a17', color: '#fff', borderRadius: 999, padding: '6px 16px', fontWeight: 800 }}>
              {nickOf(look)} <span style={{ color: '#c6f432', fontSize: 12 }}>#{INSTS.find(x => x[0] === look.inst)?.[1]}</span>
            </span>
            <input value={look.nick ?? ''} onChange={e => set({ nick: e.target.value })} maxLength={12}
              placeholder={`별명 (비우면 '${NICKS[look.gender][look.inst]}')`} aria-label="별명" style={{ width: '100%' }} />
            <p className="muted" style={{ margin: 0, fontSize: 12, textAlign: 'center' }}>화면 오른쪽 위에 이 캐릭터 얼굴이 보여요</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {row('캐릭터', (['m', 'f'] as const).map(g => chip(look.gender === g, g === 'm' ? '남자' : '여자', () => base(look.inst, g))))}
            {row('악기', INSTS.map(([k, l]) => chip(look.inst === k, l, () => base(k, look.gender))))}
            {row('악기 색', INST_COLORS.map(([k, c, l]) => dot((look.instColor ?? '') === k, c, l, () => set({ instColor: k }))))}
            {row('옷', OUTFITS.map(([k, l]) => chip(look.outfit === k, l, () => set({ outfit: k }))))}
            {row('옷 색', COLORS.map(([c, l, c2]) => dot(look.color === c, c, l, () => set({ color: c, color2: c2 }))))}
            {row('배경', BGS.map(([c, l]) => dot(look.bg === c, c, l, () => set({ bg: c }))))}
            {row('피부색', SKIN_LIST.map(([k, c, l]) => dot(look.skin === k, c, l, () => set({ skin: k }))))}
            {row('머리 모양', HAIRS.map(([k, l]) => chip(look.hairStyle === k, l, () => set({ hairStyle: k }))))}
            {row('머리 색', HAIR_COLORS.map(([c, l]) => dot(look.hairColor === c, c, l, () => set({ hairColor: c }))))}
            {row('표정', FACES.map(([k, l]) => chip(look.face === k, l, () => set({ face: k }))))}
            {row('꾸밈 아이템 (연습하면 열려요)', ITEMS.map(i => (
              <span key={i.key} title={open.has(i.key) ? i.name : `${i.how}하면 열려요`}>
                {chip(!!look.items?.[i.key], i.name, () => toggle(i.key), !open.has(i.key))}
              </span>
            )))}
            <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>
              🔒 {ITEMS.filter(i => !open.has(i.key)).map(i => `${i.name}: ${i.how}`).join(' · ') || '모든 아이템이 열렸어요!'}
            </p>
          </div>
        </div>
        {err && <p style={{ color: '#c62828', margin: 0, fontSize: 13 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={onClose}>닫기</button>
          <button type="button" className="btn" onClick={save} disabled={busy}>{busy ? '저장 중…' : '저장하기'}</button>
        </div>
      </div>
    </div>
  )
}
