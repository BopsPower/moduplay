import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, type Score } from '../lib/supabase'
import { soundsliceUrl } from '../lib/materials'

// 관리자만: 악기별로 나눈 악보 ↔ 원본 합본 오가기 + 아직 안 그린 악보를 그 자리에서 그리기
// (원장님 2026-11-11 "나눈 곡을 확인할 수 없어서 그래" — 나눈 파트는 '관리자만'·변환 보류라 화면에서 볼 수 없었음)
// - 그리기 = convert_status hold → pending. 공개 범위('관리자만')는 그대로
type Item = { id: string; title: string; major: string | null; convert_status: string; file_path: string | null; hidden?: boolean | null }
const COLS = 'id,title,major,convert_status,file_path,hidden'
const origOf = (tags?: string[] | null) => tags?.find(t => t.startsWith('auto:원본:'))?.slice('auto:원본:'.length) ?? null
const ORDER = ['보컬', '기타', '피아노', '베이스', '드럼']

export default function PartFamily({ score }: { score: Score }) {
  const tags = score.tags ?? []
  const origId = tags.includes('auto:파트원본') ? score.id : origOf(tags)
  const [orig, setOrig] = useState<Item | null>(null)
  const [parts, setParts] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!origId) return
    let dead = false
    Promise.all([
      supabase.from('scores').select(COLS).eq('id', origId).maybeSingle(),
      supabase.from('scores').select(COLS).contains('tags', ['auto:원본:' + origId]),
    ]).then(([o, p]) => {
      if (dead) return
      setOrig((o.data as Item | null) ?? null)
      const rank = (x: Item) => { const r = ORDER.indexOf(x.major ?? ''); return r < 0 ? 99 : r }
      setParts(((p.data ?? []) as Item[]).filter(x => !x.hidden).sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title)))
    })
    return () => { dead = true }
  }, [origId])

  if (!origId || (!orig && !parts.length)) return null
  const all = [...(orig ? [orig] : []), ...parts]
  const waiting = all.filter(x => x.convert_status === 'hold')
  const label = (x: Item) => x.id === origId ? '원본(전체 악기)' : (x.title.match(/\(([^()]+)\)\s*$/)?.[1] ?? x.major ?? '파트')
  const state = (x: Item) => x.convert_status === 'hold' ? ' · 그림 없음' : x.convert_status === 'pending' || x.convert_status === 'converting' ? ' · 그리는 중' : x.convert_status === 'failed' ? ' · 실패' : ''
  const ss = soundsliceUrl(orig?.file_path)

  async function drawAll() {
    if (!waiting.length) return
    setBusy(true); setMsg('')
    const ids = waiting.map(x => x.id)
    const { error } = await supabase.from('scores').update({ convert_status: 'pending', convert_error: null }).in('id', ids).eq('convert_status', 'hold')
    setBusy(false)
    if (error) { setMsg('그리기를 시작하지 못했어요: ' + error.message); return }
    const mark = (x: Item) => ids.includes(x.id) ? { ...x, convert_status: 'pending' } : x
    setOrig(o => o && mark(o)); setParts(ps => ps.map(mark))
    setMsg(`${ids.length}개를 그리기 시작했어요. 하나에 30초~1분쯤 걸려요. 공개 범위는 그대로('관리자만')예요.`)
  }

  return (
    <div className="part-family" aria-label="같은 곡 악기별 악보">
      <div className="ens-row">
        <span className="muted ens-lab">🎼 악기별로 나눈 악보 · 관리자만 보여요</span>
        {all.map(x => x.id === score.id
          ? <span key={x.id} className="btn sm primary" aria-current="page">{label(x)}{state(x)}</span>
          : <Link key={x.id} to={`/score/${x.id}`} className="btn sm ghost">{label(x)}{state(x)}</Link>)}
      </div>
      {(waiting.length > 0 || ss) && (
        <div className="ens-row">
          {waiting.length > 0 && <button type="button" className="btn sm" disabled={busy} onClick={drawAll}>{busy ? '시작하는 중…' : `🎨 그림 없는 ${waiting.length}개 모두 그리기`}</button>}
          {ss && <a className="btn sm ghost" href={ss} target="_blank" rel="noreferrer">사운드슬라이스 원본 ↗</a>}
        </div>
      )}
      {msg && <p className="muted" role="status" style={{ margin: 0, fontSize: 13 }}>{msg}</p>}
    </div>
  )
}
