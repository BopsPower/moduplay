// 플레이리스트 표 한 줄 → 유튜브 검색어. 확실한 "작품 이름"(곡 또는 앨범)이 있을 때만 만든다.
// 이름만 있거나 "라이브 영상·세션 녹음"처럼 막연한 줄, 교재·리듬 패턴 줄에는 버튼을 달지 않는다(null).
const strip = (h) => String(h ?? '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

// 사람 이름 칸 정리: (1926–2002), (bass: …), 참고: … 같은 부가 정보 제거, "A / B"는 앞사람만
const person = (s) => strip(s)
  .replace(/\([^)]*\)/g, ' ').replace(/참고:.*/g, ' ').replace(/[“”"]/g, ' ')
  .replace(/\s(작곡|작사|외|등|프로듀스|편곡)(\s|$)/g, ' ')
  .split(/\s\/\s|\s·\s|\s—\s/)[0].replace(/\s+/g, ' ').trim()

// 작품 이름 칸 정리: 따옴표·겹낫표 제거, 괄호 속 부가 설명 제거
const work = (s) => strip(s).split(/\s\/\s/)[0].replace(/\([^)]*\)/g, ' ').replace(/[“”"《》『』「」]/g, ' ').replace(/\s+/g, ' ').trim()

const GENERIC = /(솔로|라이브|리더|협연|세션|가스펠|레슨|교본|클리닉|영상|녹음|레퍼토리|레이블|리듬 트랙|밴드 연주|예제)/
const VAGUE = /(라이브|영상|녹음|세션|레퍼토리|수록곡\s*$|음반\s*$|예제|클리닉|패턴|리프|트랙|연주$)/

const HINT = { 보컬: 'jazz vocal', 피아노: 'jazz piano', 기타: 'jazz guitar', 베이스: 'jazz bass', 드럼: 'jazz drums' }

// 곡 표의 아티스트 칸: "X 작곡 / Y 연주"면 연주자 Y, 작곡자만 있거나 "재즈 스탠다드"면 전공별 재즈 연주로 검색
function songArtist(raw, major) {
  const t = strip(raw).replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  if (/작곡\s*\//.test(t)) return person(t.split('/').slice(1).join(' ').replace(/연주|버전|등/g, ' '))
  if (/스탠다드|스탠더드|작곡$/.test(t)) return HINT[major] ?? 'jazz'
  return person(t.replace(/뮤지컬·영화|뮤지컬|영화/g, ' '))
}

export function ytQuery(head, row, major) {
  const h0 = (head[0] ?? '').trim()
  if (/교재|패턴/.test(h0)) return null
  const col = (re) => head.findIndex((h, i) => i > 0 && re.test(h))
  const ai = col(/^아티스트/)
  const artist = ai >= 0 ? person(row[ai]) : ''

  // 앨범 표: 앨범 + 아티스트
  if (/^앨범/.test(h0)) {
    const a = work(row[0]); if (!a || !artist) return null
    return `${a} ${artist}`
  }
  // 곡 표: 곡 + 아티스트 (아티스트가 없거나 막연하면 버튼 없음)
  if (/^곡$/.test(h0)) {
    const s = work(row[0]); if (!s) return null
    if (/OST/.test(strip(row[ai] ?? ''))) {
      const film = strip(row[ai]).replace(/\([^)]*\)/g, ' ').replace(/영화|\(|\)/g, ' ').replace(/\s+/g, ' ').trim()
      return `${s} ${film}`
    }
    const a = songArtist(row[ai] ?? '', major)
    if (!a || /여러|다양|미상/.test(a)) return null
    if (/패턴|리프|템포 곡/.test(s)) return null
    return `${s.replace(/\s*\((19|20)\d\d\)/, '')} ${a}`
  }
  // 사람 표(아티스트·작곡가·프로듀서): 이름 + 따옴표 속 첫 곡, 없으면 『앨범』 또는 "(앨범)"
  const name = person(row[0]); if (!name) return null
  const si = col(/들어볼 곡/)
  const cell = strip(row[si] ?? '')
  const song = /“([^”]+)”/.exec(cell)?.[1]
  if (song) return `${name} ${song.replace(/\s*\((19|20)\d\d\)/, '')}`
  const album = /『([^』]+)』/.exec(cell)?.[1] ?? (/^(.+?)\s*\(앨범\)/.exec(cell)?.[1])
  if (album && !VAGUE.test(album)) return `${name} ${album.trim()}`
  // 따옴표 없이 적힌 작품·앨범 이름 ("Black Radio 수록곡", "Oracle 앨범 수록곡", "Dolmen Music")
  const bare = cell.replace(/\s*(앨범\s*)?(수록곡|음반)\s*$/, '').split(/,\s/)[0].trim()
  if (bare && !GENERIC.test(bare) && bare !== cell.trim() || (bare && !GENERIC.test(bare) && /[A-Za-z]/.test(bare) && !VAGUE.test(cell))) return `${name} ${bare}`
  return null
}
export const ytUrl = (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
