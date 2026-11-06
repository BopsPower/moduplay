// 홈 '내 곡 연습하기'에서 고른 음원을 연습 플레이어로 넘기기 (주소로는 파일을 못 넘겨서 잠깐 맡겨 둠)
// split: 플레이어에서 보관함에 저장되면 바로 악기 나누기를 맡김
let pending: { file: File; split: boolean } | null = null
export function handAudio(file: File, split = true) { pending = { file, split } }
export function takeAudio() { const p = pending; pending = null; return p }
