// 앙상블 합주곡 MR: 곡마다 원곡 · 전체 반주 · 파트 빼고 · 리드시트가 한 묶음
// 묶는 표시(태그): auto:ens:<곡 번호>, auto:ens-part:<파트 이름>
// 원본 파일 이름 규칙 (학원 공유 드라이브 '통합 커리큘럼 교육자료 › 1. MR / 4. 뮤즈스코어 파일')
//   59. Herbie Hancock - Chameleon (No BASS).mp3
//   1. Beatles - Let It Be (Full INST).mp3
//   49. Bright Size Life (Lead Sheet).mscz

export const ENS_PARTS = ['원곡', '전체 반주', '베이스 빼고', '드럼 빼고', '기타 빼고', '건반 빼고', '보컬 빼고', '리드시트'] as const

const PART_OF: [RegExp, string][] = [
  [/^original( song)?$/i, '원곡'], [/^full ?inst/i, '전체 반주'], [/^no ?bass/i, '베이스 빼고'], [/^no ?drums?/i, '드럼 빼고'],
  [/^no ?guitars?/i, '기타 빼고'], [/^no ?(piano|keyboards?|keys)/i, '건반 빼고'], [/^no ?vocals?/i, '보컬 빼고'], [/^lead ?sheet/i, '리드시트'],
]

export type EnsInfo = { no: number; song: string; artist: string | null; part: string }

/** 파일 이름(확장자 뺀 것)이 앙상블 규칙이면 곡 번호·곡·뮤지션·파트를 돌려줌 */
export function parseEnsemble(stem: string): EnsInfo | null {
  const m = /^(\d{1,3})\.\s*(.+?)\s*\(([^()]+)\)\s*$/.exec(stem.trim())
  if (!m) return null
  const part = PART_OF.find(([re]) => re.test(m[3].trim()))?.[1]
  if (!part) return null
  const body = m[2].trim()
  const i = body.indexOf(' - ')
  return { no: +m[1], song: (i > 0 ? body.slice(i + 3) : body).trim(), artist: i > 0 ? body.slice(0, i).trim() : null, part }
}

export const ensNo = (tags?: string[] | null) => { const t = (tags ?? []).find(x => x.startsWith('auto:ens:')); return t ? +t.slice(9) : null }
export const ensPart = (tags?: string[] | null) => (tags ?? []).find(x => x.startsWith('auto:ens-part:'))?.slice(14) ?? null

/** 학생 전공 → 먼저 보여 줄 MR */
export const MY_PART: Record<string, string> = { 베이스: '베이스 빼고', 드럼: '드럼 빼고', 기타: '기타 빼고', 피아노: '건반 빼고', 보컬: '전체 반주' }
