import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { matches } from '../lib/search'
import raw from '../data/playlists.json'
import VERIFIED from '../data/yt-verified.json'
// @ts-ignore 검색어 규칙(JS)
import { ytQuery, ytUrl } from '../lib/yt.js'

// 자료실 › ▶ 영상: 전공별 추천 플레이리스트(노션)에 나온 뮤지션·곡을 유튜브 영상으로 바로 보기
// 플레이리스트 화면과 같은 규칙: 검증을 통과한 검색어(yt-verified.json)만 보여 줌
type Block = { t: string; text?: string; head?: string[]; rows?: string[][]; blocks?: Block[] }
type Page = { genres: { name: string; blocks: Block[] }[] }
const DATA = raw as unknown as { majors: Record<string, Page> }
const V = VERIFIED as Record<string, Record<string, string>>
const MAJORS = Object.keys(DATA.majors)
const strip = (h: string) => String(h ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()

type Vid = { genre: string; name: string; info: string; q: string }

function videosOf(major: string): Vid[] {
  const out: Vid[] = []; const seen = new Set<string>()
  for (const g of DATA.majors[major]?.genres ?? []) {
    const walk = (list: Block[]) => list.forEach(b => {
      if (b.t === 'callout') return walk(b.blocks ?? [])
      if (b.t !== 'table' || !b.head || !b.rows) return
      for (const r of b.rows) {
        const q0 = ytQuery(b.head, r, major); const q = q0 ? V[major]?.[q0] : null
        if (!q || seen.has(q)) continue
        seen.add(q)
        const ai = b.head.findIndex((h, i) => i > 0 && /^아티스트/.test(h))
        out.push({ genre: g.name, name: strip(r[0]), info: ai > 0 ? strip(r[ai]) : '', q })
      }
    })
    walk(g.blocks)
  }
  return out
}

export default function PlaylistVideos({ defaultMajor, q }: { defaultMajor?: string | null; q: string }) {
  const [major, setMajor] = useState(defaultMajor && MAJORS.includes(defaultMajor) ? defaultMajor : MAJORS[0])
  const [open, setOpen] = useState<string | null>(null)
  const all = useMemo(() => videosOf(major), [major])
  const list = all.filter(v => matches(q, v.name, v.info, v.q, v.genre))
  const genres = [...new Set(list.map(v => v.genre))]

  return (
    <section className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <b style={{ fontSize: 16 }}>🎧 전공별 추천 플레이리스트 영상</b>
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
          코치진이 고른 <Link to="/playlist" style={{ color: 'var(--accent-deep)' }}>플레이리스트</Link>의 뮤지션·곡이에요. ▶를 누르면 유튜브에서 바로 들을 수 있어요.
        </p>
      </div>
      <div className="chips sm">
        {MAJORS.map(m => <button key={m} type="button" className={'chip sm' + (major === m ? ' pick' : '')} onClick={() => { setMajor(m); setOpen(null) }}>{m}</button>)}
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>{q ? `'${q}' 찾은 영상 ${list.length}개` : `${major} ${all.length}개 · 장르 ${genres.length}개`}</p>
      {genres.map(g => {
        const vs = list.filter(v => v.genre === g)
        const on = !!q || open === g
        return (
          <div key={g}>
            <button type="button" className="more-f-btn" aria-expanded={on} onClick={() => setOpen(on && !q ? null : g)} style={{ width: '100%', justifyContent: 'space-between', display: 'flex' }}>
              <span>{g} <span className="muted">{vs.length}</span></span><span aria-hidden="true">{on ? '▴' : '▾'}</span>
            </button>
            {on && (
              <div className="pl-rows">
                {vs.map(v => (
                  <div key={v.q} className="pl-row">
                    <div className="pl-row-main">
                      <b>{v.name}</b>
                      {v.info && <div className="pl-kv"><span>아티스트</span><span>{v.info}</span></div>}
                      <div className="pl-kv"><span>영상</span><span>{v.q}</span></div>
                    </div>
                    <a className="pl-yt" href={ytUrl(v.q)} target="_blank" rel="noreferrer" aria-label={`${v.q} 유튜브에서 듣기`}>▶ 유튜브</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {!list.length && <p className="muted" style={{ margin: 0 }}>찾는 영상이 없어요.</p>}
    </section>
  )
}
