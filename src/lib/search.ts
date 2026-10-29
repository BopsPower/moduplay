// 느슨한 검색: 띄어쓰기·기호·대소문자 무시, 일부만 맞아도 찾음, 초성(ㅎㄴ → 하농)도 지원
const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']

export function norm(s: string) {
  return (s ?? '').toLowerCase().normalize('NFC').replace(/[^0-9a-z가-힣ㄱ-ㅎ]/g, '')
}

function chosung(s: string) {
  let out = ''
  for (const ch of s) {
    const c = ch.charCodeAt(0)
    if (c >= 0xac00 && c <= 0xd7a3) out += CHO[Math.floor((c - 0xac00) / 588)]
    else out += ch
  }
  return out
}

export function matches(query: string, ...fields: (string | null | undefined)[]) {
  const q = norm(query)
  if (!q) return true
  const text = norm(fields.filter(Boolean).join(' '))
  if (text.includes(q)) return true
  if (/^[ㄱ-ㅎ]+$/.test(q)) return chosung(text).includes(q) // 초성만 입력한 경우
  return false
}
