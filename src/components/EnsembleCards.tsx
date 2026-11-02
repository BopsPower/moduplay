import { Link } from 'react-router-dom'
import type { Score } from '../lib/supabase'
import { ENS_PARTS, ensNo, ensPart, MY_PART } from '../lib/ensemble'

// 자료실 › 🎸 앙상블: 곡마다 카드 1장 (원곡 · 전체 반주 · 내 파트 빼고 · 리드시트)
type Song = { no: number; song: string; artist: string | null; parts: Map<string, Score> }

export function groupEnsemble(list: Score[]): Song[] {
  const m = new Map<number, Song>()
  for (const s of list) {
    const no = ensNo(s.tags); const part = ensPart(s.tags)
    if (no == null || !part) continue
    const g = m.get(no) ?? { no, song: s.song || s.title.replace(/^\d+\.\s*/, '').replace(/\s*\([^()]*\)\s*$/, ''), artist: null, parts: new Map() }
    if (!g.artist && s.artist) g.artist = s.artist
    if (!g.parts.has(part)) g.parts.set(part, s)
    m.set(no, g)
  }
  return [...m.values()].sort((a, b) => a.no - b.no)
}

export default function EnsembleCards({ songs, major }: { songs: Song[]; major?: string | null }) {
  const mine = major ? MY_PART[major] : undefined
  if (!songs.length) return (
    <section className="card" style={{ padding: 20 }}>
      <p style={{ margin: 0, fontWeight: 700 }}>찾는 앙상블 곡이 없어요.</p>
    </section>
  )
  return (
    <div className="ens-list">
      {songs.map(g => {
        const play = ENS_PARTS.filter(p => p === '원곡' || p === '전체 반주').filter(p => g.parts.has(p))
        const minus = ENS_PARTS.filter(p => p.endsWith('빼고') && g.parts.has(p))
        const sheet = g.parts.get('리드시트')
        return (
          <section key={g.no} className="card ens-card">
            <div className="ens-h">
              <span className="ens-no">{g.no}</span>
              <span><b>{g.song}</b>{g.artist && <span className="muted"> · {g.artist}</span>}</span>
            </div>
            {mine && g.parts.get(mine) && (
              <Link to={`/score/${g.parts.get(mine)!.id}`} className="btn primary sm ens-mine">▶ 내 파트 연습 · {mine}</Link>
            )}
            <div className="ens-row">
              {play.map(p => <Link key={p} to={`/score/${g.parts.get(p)!.id}`} className="btn sm ghost">▶ {p}</Link>)}
            </div>
            {minus.length > 0 && (
              <div className="ens-row">
                <span className="muted ens-lab">파트 빼고</span>
                {minus.map(p => <Link key={p} to={`/score/${g.parts.get(p)!.id}`} className={'btn sm' + (p === mine ? ' primary' : ' ghost')}>{p.replace(' 빼고', '')}</Link>)}
              </div>
            )}
            {sheet && <Link to={`/score/${sheet.id}`} className="ens-sheet">📄 리드시트 보기</Link>}
          </section>
        )
      })}
    </div>
  )
}
