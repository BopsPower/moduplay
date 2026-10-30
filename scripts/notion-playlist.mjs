// 노션 "전공별 추천 플레이리스트" 페이지(노션 마크다운) → src/data/playlists.json
// 사용: node scripts/notion-playlist.mjs <폴더>   (폴더 안에 보컬.md, 피아노.md … 전공 이름으로 저장)
// 노션 내용을 고친 뒤에는 페이지를 다시 받아 이 스크립트를 돌리고 커밋하면 앱에 반영됩니다.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const MAJORS = ['보컬', '피아노', '기타', '드럼', '베이스', '미디작곡', '연주작곡']
const NOTION = {
  보컬: '310eff71306080c4a66aff76989b2c22', 피아노: '310eff71306080f6a211e8315971d6f8', 기타: '310eff7130608068b81ee5f12c2d7d96',
  드럼: '310eff7130608097bca7ce69cdfce091', 베이스: '310eff7130608017adcdc6e4c18d1290', 미디작곡: '310eff71306080b3889fdaac9262c665',
  연주작곡: '310eff713060801e9d12fa6fd04b2210',
}

// 글자 안 꾸밈: <b> <i> <br> 링크만 남기고 나머지 태그는 벗기고, 그 밖의 < > & 는 이스케이프
function inline(s) {
  let t = s.trim()
  t = t.replace(/<\/?(span|u|s|p)(\s[^>]*)?>/g, '')
  t = t.replace(/<mention[^>]*>([^<]*)<\/mention>/g, '$1')
  const keep = []
  const hold = h => `\u0000${keep.push(h) - 1}\u0000`
  t = t.replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (_, a, u) => hold(`<a href="${u.replace(/"/g, '%22')}" target="_blank" rel="noreferrer">`) + a + hold('</a>'))
  t = t.replace(/<br\s*\/?>/g, () => hold('<br />'))
  t = t.replace(/<(\/?)(b|i)>/g, (_, sl, tg) => hold(`<${sl}${tg}>`))
  t = t.replace(/\*\*([^*]+)\*\*/g, (_, a) => hold('<b>') + a + hold('</b>'))
  t = t.replace(/\\([|*_\[\]()<>])/g, '$1')
  t = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  t = t.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i])
  // 빈 링크 (▶ 같은 장식만 남은 것) 정리
  return t.replace(/<a [^>]*><\/a>/g, '')
}
const plain = s => inline(s).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()

function cells(line) {
  const parts = line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/)
  return parts.map(c => inline(c))
}

// 블록 나누기
function blocks(lines) {
  const out = []
  let i = 0
  const push = b => out.push(b)
  while (i < lines.length) {
    const raw = lines[i]
    const line = raw.trim()
    if (!line || line === '---' || line === '<p />' || /^<\/?p>$/.test(line) || line.startsWith('<image') || line.startsWith('<table-of-contents') || line.startsWith('<empty-block')) { i++; continue }
    if (line.startsWith('```')) {
      const body = []; i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) body.push(lines[i++])
      i++; push({ t: 'pre', text: body.join('\n') }); continue
    }
    if (line.startsWith('<callout')) {
      const body = []; i++
      while (i < lines.length && lines[i].trim() !== '</callout>') body.push(lines[i++])
      i++
      const text = body.join('\n')
      if (/뮤지션을 양성하는|이 페이지 보는 법/.test(text)) continue // 학원 안내·보는 법은 앱이 따로 보여줌
      push({ t: 'callout', blocks: blocks(body) }); continue
    }
    if (/^<h[1-4]/.test(line)) {
      const body = []; i++
      while (i < lines.length && !/^<\/h[1-4]>/.test(lines[i].trim())) body.push(lines[i++])
      i++; push({ t: 'h2', text: plain(body.join(' ')) }); continue
    }
    if (/^#{1,4} /.test(line)) { push({ t: line.startsWith('# ') ? 'h1' : 'h3', text: plain(line.replace(/^#+ /, '')) }); i++; continue }
    if (line.startsWith('>')) { push({ t: 'quote', text: inline(line.replace(/^>\s?/, '')) }); i++; continue }
    if (line.startsWith('|')) {
      const rows = []
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(lines[i].trim()); i++ }
      const body = rows.filter(r => !/^\|\s*:?-{2,}/.test(r)).map(cells)
      push({ t: 'table', head: body[0].map(h => plain(h)), rows: body.slice(1) }); continue
    }
    const li = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(raw)
    if (li) {
      const ordered = /\d/.test(li[2])
      const items = []
      while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i])
        const l = lines[i].trim()
        if (m && m[1].length === 0 && (/\d/.test(m[2]) === ordered)) { items.push({ text: inline(m[3]), sub: [] }); i++; continue }
        if (items.length && (m || (/^\s+/.test(lines[i]) && l && l !== '---'))) {
          if (!/^<\/?p>$/.test(l)) items[items.length - 1].sub.push(inline(m ? m[3] : l))
          i++; continue
        }
        if (!l && i + 1 < lines.length && /^(\s+)([-*]|\d+\.)?\s*\S/.test(lines[i + 1]) && items.length) { i++; continue }
        break
      }
      push({ t: ordered ? 'ol' : 'ul', items }); continue
    }
    if (line.startsWith('<toggle') || line === '</toggle>') { i++; continue }
    push({ t: 'p', text: inline(line) }); i++
  }
  return out
}

function parse(md) {
  const lines = md.replace(/\r/g, '').split('\n')
  const page = { title: '', quote: '', intro: [], genres: [], outro: [] }
  const top = []
  let i = 0
  while (i < lines.length) {
    const l = lines[i].trim()
    const tg = /^<toggle heading="h\d"(?: color="([^"]*)")?>/.exec(l)
    if (tg) {
      const name = plain(lines[i + 1] ?? '')
      const body = []; i += 2
      let depth = 1
      while (i < lines.length) {
        const t = lines[i].trim()
        if (t.startsWith('<toggle')) depth++
        if (t === '</toggle>' && --depth === 0) break
        body.push(lines[i]); i++
      }
      i++
      top.push({ t: 'genre', name, color: (tg[1] || '').replace('_bg', ''), blocks: blocks(body) })
      continue
    }
    top.push(lines[i]); i++
  }
  // 토글 바깥: 제목·인용·서론 / 마무리
  let phase = 'intro'
  let buf = []
  const flush = () => { if (buf.length) { (phase === 'intro' ? page.intro : page.outro).push(...blocks(buf)); buf = [] } }
  for (const x of top) {
    if (typeof x === 'string') { buf.push(x); continue }
    flush(); phase = 'outro'
    page.genres.push(x)
  }
  flush()
  const take = (arr, t) => { const k = arr.findIndex(b => b.t === t); return k >= 0 ? arr.splice(k, 1)[0] : null }
  page.title = take(page.intro, 'h1')?.text ?? ''
  page.quote = take(page.intro, 'quote')?.text ?? ''
  page.intro = page.intro.filter(b => !(b.t === 'h2' && b.text === '서론'))
  return page
}

const dir = process.argv[2]
if (!dir) { console.error('폴더를 넣어 주세요'); process.exit(1) }
const data = {}
for (const m of MAJORS) {
  const f = join(dir, `${m}.md`)
  if (!existsSync(f)) { console.warn('없음:', f); continue }
  const p = parse(readFileSync(f, 'utf8'))
  data[m] = { notion: NOTION[m], ...p }
  console.log(m, '장르', p.genres.length, '|', p.genres.map(g => g.name).join(' / '))
}
writeFileSync(new URL('../src/data/playlists.json', import.meta.url), JSON.stringify({ updated: new Date().toISOString().slice(0, 10), majors: data }))
console.log('→ src/data/playlists.json')
