import { useMemo, useState } from 'react'
import Shell from '../components/Shell'
import { useAuth } from '../lib/auth'
import { matches } from '../lib/search'
import raw from '../data/playlists.json'

// 전공별 추천 플레이리스트 (노션 "전공별 추천 플레이리스트" 내용을 그대로 옮김 → scripts/notion-playlist.mjs)
type Item = { text: string; sub: string[] }
type Block =
  | { t: 'h1' | 'h2' | 'h3' | 'p' | 'quote' | 'pre'; text: string }
  | { t: 'ul' | 'ol'; items: Item[] }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'callout'; blocks: Block[] }
type Genre = { t: 'genre'; name: string; color: string; blocks: Block[] }
type Page = { notion: string; title: string; quote: string; intro: Block[]; genres: Genre[]; outro: Block[] }
const DATA = raw as unknown as { updated: string; majors: Record<string, Page> }
const MAJORS = Object.keys(DATA.majors)

const strip = (h: string) => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const Html = ({ h, as: As = 'span' }: { h: string; as?: any }) => <As dangerouslySetInnerHTML={{ __html: h }} />

// 표 한 줄 → 유튜브 검색어 (아티스트 표: 이름 + 들어볼 곡 / 앨범 표: 앨범 + 아티스트 / 곡 표: 곡 + 아티스트)
function ytQuery(head: string[], row: string[]) {
  const clean = (s: string) => strip(s)
    .replace(/\([^)]*\)/g, ' ').replace(/참고:[^,]*/g, ' ').replace(/[“”"《》『』「」]/g, ' ')
    .replace(/\s(작곡|외|등)(\s|$)/g, ' ').split(/\s\/\s|\s·\s|\s—\s|\s–\s/)[0].replace(/\s+/g, ' ').trim()
  const col = (re: RegExp) => head.findIndex((h, i) => i > 0 && re.test(h))
  const first = clean(row[0] ?? '')
  const h0 = head[0] ?? ''
  const artist = col(/아티스트/) >= 0 ? clean(row[col(/아티스트/)] ?? '') : ''
  if (/앨범|사운드트랙/.test(h0)) return `${first} ${artist}`.trim()
  if (/곡/.test(h0)) return `${first} ${artist}`.trim()
  // 사람 표: 따옴표 안 곡 이름을 찾아 붙임
  const song = row.slice(1).map(c => /“([^”]+)”/.exec(strip(c))?.[1]).find(Boolean)
  return `${first} ${song ?? ''}`.trim()
}
const ytUrl = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`

function Rows({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="pl-rows">
      {rows.map((r, i) => {
        const q = ytQuery(head, r)
        return (
          <div key={i} className="pl-row">
            <div className="pl-row-main">
              <Html h={r[0]} as="b" />
              {head.slice(1).map((h, k) => r[k + 1] && strip(r[k + 1]).trim() ? (
                <div key={k} className="pl-kv"><span>{h}</span><Html h={r[k + 1]} /></div>
              ) : null)}
            </div>
            {q && <a className="pl-yt" href={ytUrl(q)} target="_blank" rel="noreferrer" aria-label={`${q} 유튜브에서 듣기`}>▶ 유튜브</a>}
          </div>
        )
      })}
    </div>
  )
}

function Blocks({ list }: { list: Block[] }) {
  return (
    <>
      {list.map((b, i) => {
        switch (b.t) {
          case 'h1': case 'h2': return <h3 key={i} className="pl-h">{b.text}</h3>
          case 'h3': return <h4 key={i} className="pl-sub">{b.text}</h4>
          case 'p': return <Html key={i} h={b.text} as="p" />
          case 'quote': return <Html key={i} h={b.text} as="blockquote" />
          case 'pre': return <pre key={i} className="pl-pre">{b.text}</pre>
          case 'callout': return <div key={i} className="pl-callout"><Blocks list={b.blocks} /></div>
          case 'table': return <Rows key={i} head={b.head} rows={b.rows} />
          case 'ul': case 'ol': {
            const L = b.t === 'ol' ? 'ol' : 'ul'
            return <L key={i} className="pl-list">{b.items.map((it, k) => (
              <li key={k}><Html h={it.text} />{it.sub.length > 0 && <ul>{it.sub.map((s, j) => <li key={j}><Html h={s} /></li>)}</ul>}</li>
            ))}</L>
          }
        }
      })}
    </>
  )
}

export default function Playlist() {
  const { student } = useAuth()
  const saved = (() => { try { return localStorage.getItem('mp_pl_major') } catch { return null } })()
  const start = [saved, student?.class_name].find(m => m && MAJORS.includes(m)) ?? MAJORS[0]
  const [major, setMajorState] = useState<string>(start!)
  const [q, setQ] = useState('')
  const [showIntro, setShowIntro] = useState(false)
  const setMajor = (m: string) => { setMajorState(m); setQ(''); try { localStorage.setItem('mp_pl_major', m) } catch { /* 무시 */ } }
  const page = DATA.majors[major]

  // 찾기: 장르 안 모든 표에서 맞는 줄만
  const found = useMemo(() => {
    if (!q.trim()) return null
    const out: { genre: string; head: string[]; rows: string[][] }[] = []
    for (const g of page.genres) {
      const walk = (bs: Block[], sub: string) => bs.forEach(b => {
        if (b.t === 'h3') sub = b.text
        if (b.t === 'table') {
          const rows = b.rows.filter(r => matches(q, ...r.map(strip)))
          if (rows.length) out.push({ genre: `${g.name} · ${sub}`, head: b.head, rows })
        }
      })
      walk(g.blocks, '')
    }
    return out
  }, [q, page])

  return (
    <Shell>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>전공별 추천</p>
        <h1 className="title">플레이리스트</h1>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.6 }}>
          장르별로 꼭 들어 볼 아티스트·앨범·곡을 모았어요. <b>▶ 유튜브</b>를 누르면 바로 찾아서 들을 수 있어요.
        </p>
      </div>

      <div className="chips" role="tablist" aria-label="전공 고르기">
        {MAJORS.map(m => <button key={m} type="button" role="tab" aria-selected={major === m} className={'chip' + (major === m ? ' on' : '')} onClick={() => setMajor(m)}>{m}</button>)}
      </div>

      <div className="card pl-head">
        {page.quote && <Html h={page.quote} as="p" />}
        <button type="button" className="btn sm ghost" onClick={() => setShowIntro(v => !v)}>{showIntro ? '서론 접기' : '서론 읽기'}</button>
        {showIntro && <div className="pl-body"><Blocks list={page.intro} /></div>}
      </div>

      <input className="pl-search" value={q} onChange={e => setQ(e.target.value)} placeholder={`${major} 플레이리스트에서 아티스트·곡 찾기`} aria-label="아티스트·곡 찾기" />

      {found ? (
        found.length === 0 ? <p className="muted">찾는 아티스트·곡이 없어요.</p> : found.map((f, i) => (
          <section key={i} className="card pl-found">
            <p className="muted" style={{ margin: '0 0 6px', fontSize: 13 }}>{f.genre}</p>
            <Rows head={f.head} rows={f.rows} />
          </section>
        ))
      ) : (
        <div className="pl-genres">
          {page.genres.map(g => (
            <details key={g.name} className={'card pl-genre c-' + g.color}>
              <summary>{g.name}</summary>
              <div className="pl-body"><Blocks list={g.blocks} /></div>
            </details>
          ))}
          {page.outro.length > 0 && (
            <details className="card pl-genre">
              <summary>마무리</summary>
              <div className="pl-body"><Blocks list={page.outro.filter(b => !(b.t === 'h2' && b.text === '마무리'))} /></div>
            </details>
          )}
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
        유튜브 버튼은 검색 결과로 연결돼요. 원곡·라이브 등 여러 버전이 나오니 맞는 연주를 골라 들어 보세요. ({DATA.updated} 기준)
      </p>
    </Shell>
  )
}
