import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../../components/Shell'
import { supabase } from '../../lib/supabase'

// 관리자 › 사운드슬라이스에서 가져오기: 학원 계정 악보를 MusicXML로 받아 '코치만' 자료로 넣기
type SL = { hash: string; name: string; artist?: string; notation?: boolean; recordings?: number }
type ListNode = { id: string; name: string; path: string[]; slices: { hash: string; name: string }[] }
type Tree = { lists: ListNode[]; slices: SL[]; imported: Record<string, string> }
type Res = { hash: string; status: 'imported' | 'exists' | 'no-notation' | 'error'; id?: string; error?: string; size?: number }

const STATUS: Record<Res['status'], string> = { imported: '가져옴', exists: '이미 있음', 'no-notation': '악보 없음', error: '실패' }

async function call(body: unknown) {
  const { data, error } = await supabase.functions.invoke('soundslice-import', { body })
  if (error) {
    let msg = error.message
    try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error } catch { /* 무시 */ }
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export default function SoundsliceImport() {
  const [tree, setTree] = useState<Tree | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [done, setDone] = useState<Record<string, Res>>({})
  const [prog, setProg] = useState<{ n: number; total: number } | null>(null)

  async function load() {
    setBusy(true); setErr('')
    try { setTree(await call({ action: 'tree' })) } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  const meta = useMemo(() => new Map((tree?.slices ?? []).map(s => [s.hash, s])), [tree])
  // 목록별로 묶기 + 어느 목록에도 없는 악보
  const groups = useMemo(() => {
    if (!tree) return []
    const seen = new Set<string>()
    const g = tree.lists.filter(l => l.slices.length).map(l => { l.slices.forEach(s => seen.add(s.hash)); return { key: l.id, title: l.path.join(' › '), path: l.path, items: l.slices } })
    const rest = tree.slices.filter(s => !seen.has(s.hash)).map(s => ({ hash: s.hash, name: s.name }))
    if (rest.length) g.push({ key: 'rest', title: '목록에 없는 악보', path: ['목록 없음'], items: rest })
    const term = q.trim().toLowerCase()
    return g.map(x => ({ ...x, items: term ? x.items.filter(i => i.name.toLowerCase().includes(term) || x.title.toLowerCase().includes(term)) : x.items })).filter(x => x.items.length)
  }, [tree, q])

  const pathOf = useMemo(() => { const m = new Map<string, string[]>(); groups.forEach(g => g.items.forEach(i => { if (!m.has(i.hash)) m.set(i.hash, g.path) })); return m }, [groups])
  const has = (h: string) => !!tree?.imported[h] || done[h]?.status === 'imported' || done[h]?.status === 'exists'
  const toggle = (h: string) => setPick(p => { const n = new Set(p); n.has(h) ? n.delete(h) : n.add(h); return n })
  const toggleGroup = (hs: string[]) => setPick(p => { const n = new Set(p); const free = hs.filter(h => !has(h)); const all = free.every(h => n.has(h)); free.forEach(h => all ? n.delete(h) : n.add(h)); return n })

  async function run() {
    const list = [...pick].filter(h => !has(h))
    if (!list.length) return
    setBusy(true); setErr(''); setProg({ n: 0, total: list.length })
    // 5개씩 한 묶음, 묶음 3개를 동시에 (사운드슬라이스·서버에 무리 가지 않게)
    const batches: string[][] = []
    for (let i = 0; i < list.length; i += 5) batches.push(list.slice(i, i + 5))
    let next = 0, finished = 0, stop = false
    const worker = async () => {
      while (!stop && next < batches.length) {
        const b = batches[next++]
        const items = b.map(h => ({ hash: h, name: meta.get(h)?.name ?? h, artist: meta.get(h)?.artist ?? '', path: pathOf.get(h) ?? [] }))
        let ok = false
        for (let t = 0; t < 3 && !ok; t++) {
          try {
            const { results } = await call({ action: 'import', items }) as { results: Res[] }
            setDone(d => { const n = { ...d }; results.forEach(r => { n[r.hash] = r }); return n }); ok = true
          } catch (e) { if (t === 2) { setErr((e as Error).message); stop = true } else await new Promise(r => setTimeout(r, 3000)) }
        }
        finished += b.length; setProg({ n: finished, total: list.length })
      }
    }
    await Promise.all([worker(), worker(), worker()])
    setPick(new Set()); setBusy(false)
  }

  const bytes = Object.values(done).reduce((a, r) => a + (r.size ?? 0), 0)
  const counts = Object.values(done).reduce((a, r) => { a[r.status] = (a[r.status] ?? 0) + 1; return a }, {} as Record<string, number>)

  return (
    <Shell>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>관리자 화면 · <Link to="/admin/scores">악보 전체</Link></p>
        <h1 className="title">사운드슬라이스에서 가져오기</h1>
      </div>

      <section className="card" style={{ padding: '14px 18px', fontSize: 14, lineHeight: 1.7, color: 'var(--ink-2)' }}>
        학원 사운드슬라이스 계정의 악보를 <b>MusicXML</b>로 받아 모두플레이 자료로 넣어요.
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          <li>처음에는 <b>관리자만</b> 볼 수 있게 들어가요(코치·학생에게 안 보임). <Link to="/admin/scores">악보 전체</Link>에서 '관리자만'으로 걸러 보고, 공개 범위를 바꿔 공개하세요.</li>
          <li>가져온 악보는 <b>변환 보류</b> 상태로 들어가요. 공개 범위를 바꾸는 순간 변환 서버가 소리·악보 그림을 만들어요(한 곡에 1~2분).</li>
          <li>PDF를 스캔해 만든 악보는 틀린 음이 섞여 있을 수 있어요. 판매용 교재는 학생 공개 전에 저작권을 확인해 주세요.</li>
          <li>이미 가져온 악보는 다시 가져오지 않아요.</li>
        </ul>
      </section>

      {!tree ? (
        <button type="button" className="btn primary" disabled={busy} onClick={load} style={{ alignSelf: 'flex-start' }}>{busy ? '불러오는 중… (목록이 많으면 30초쯤)' : '사운드슬라이스 목록 불러오기'}</button>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="제목·목록 이름으로 찾기" aria-label="찾기" style={{ flex: '1 1 220px' }} />
            <span className="muted" style={{ fontSize: 13 }}>전체 {tree.slices.length}개 · 가져온 것 {Object.keys(tree.imported).length + (counts.imported ?? 0)}개</span>
          </div>
          {groups.map(g => {
            const hs = g.items.map(i => i.hash)
            const free = hs.filter(h => !has(h))
            const allOn = free.length > 0 && free.every(h => pick.has(h))
            return (
              <details key={g.key} className="card" style={{ padding: '10px 14px' }}>
                <summary style={{ cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input type="checkbox" checked={allOn} disabled={!free.length} onChange={() => toggleGroup(hs)} onClick={e => e.stopPropagation()} aria-label={`${g.title} 모두 고르기`} />
                  <b style={{ fontSize: 15 }}>{g.title}</b>
                  <span className="muted" style={{ fontSize: 13 }}>{g.items.length}개{free.length < g.items.length ? ` · 가져옴 ${g.items.length - free.length}` : ''}</span>
                </summary>
                <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {g.items.map(i => {
                    const m = meta.get(i.hash); const r = done[i.hash]; const id = tree.imported[i.hash] ?? r?.id
                    return (
                      <li key={g.key + i.hash} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, padding: '4px 0', borderTop: '1px solid var(--line)' }}>
                        <input type="checkbox" checked={pick.has(i.hash)} disabled={has(i.hash) || m?.notation === false} onChange={() => toggle(i.hash)} aria-label={i.name} />
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}{m?.artist ? <span className="muted"> · {m.artist}</span> : null}</span>
                        {m?.notation === false && <span className="muted" style={{ fontSize: 12 }}>악보 없음</span>}
                        {r && r.status !== 'imported' && <span style={{ fontSize: 12, color: r.status === 'error' ? '#c0392b' : 'var(--muted)' }} title={r.error}>{STATUS[r.status]}</span>}
                        {id && <Link to={`/score/${id}`} style={{ fontSize: 12 }}>가져옴 ✓</Link>}
                      </li>
                    )
                  })}
                </ul>
              </details>
            )
          })}
          <div style={{ position: 'sticky', bottom: 76, display: 'flex', gap: 12, alignItems: 'center', background: 'var(--card)', padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 14, boxShadow: '0 6px 18px rgba(0,0,0,.08)' }}>
            <button type="button" className="btn primary" disabled={busy || !pick.size} onClick={run}>{busy && prog ? `가져오는 중 ${prog.n}/${prog.total}` : `고른 ${pick.size}개 가져오기`}</button>
            {Object.keys(counts).length > 0 && <span className="muted" style={{ fontSize: 13 }}>{Object.entries(counts).map(([k, v]) => `${STATUS[k as Res['status']]} ${v}`).join(' · ')}{bytes ? ` · 받은 용량 ${(bytes / 1048576).toFixed(1)}MB` : ''}</span>}
            {busy && <span className="muted" style={{ fontSize: 13 }}>이 화면을 닫지 마세요</span>}
          </div>
        </>
      )}
      {err && <p style={{ color: '#c0392b', margin: 0 }}>{err}</p>}
    </Shell>
  )
}
