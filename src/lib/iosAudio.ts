// 아이폰·아이패드 무음 스위치(벨소리 끔)가 켜져 있어도 메트로놈·악보 소리가 나게
// 아이폰은 Web Audio 소리를 무음 모드에서 꺼 버림 (삼성폰은 그런 규칙이 없어서 문제 없음)
// - iOS 17 이상: navigator.audioSession.type = 'playback' (재생용 세션 → 무음 스위치 무시)
// - 그보다 옛 iOS: 소리 없는 아주 짧은 음원을 <audio>로 반복 재생해 재생용 세션으로 바꿈
// 반드시 사용자가 누른 직후(재생·시작 버튼)에 부름
const SILENT = 'data:audio/wav;base64,UklGRvQHAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YdAHAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA=='
// 사파리·아이폰/아이패드의 모든 브라우저(웹킷). 크롬·엣지·안드로이드는 아님
export const IS_WEBKIT = typeof navigator !== 'undefined' && /AppleWebKit/.test(navigator.userAgent) && !/Chrome\/|Chromium|Edg\/|OPR\/|Android/.test(navigator.userAgent)

/** 누른 그 순간 아주 짧은 무음을 한 번 틀어 소리 장치를 실제로 깨움.
 *  아이패드(2026-11-05 기록: state=running인데 시계가 0에서 안 감)처럼 resume()만으로는 소리가 안 나가는 기기가 있음 */
export function unlockAudio(ctx: AudioContext) {
  try {
    const b = ctx.createBuffer(1, 1, ctx.sampleRate)
    const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0)
  } catch { /* 무시 */ }
  try { ctx.resume().catch(() => {}) } catch { /* 무시 */ }
}

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && 'ontouchend' in document)
let silent: HTMLAudioElement | null = null

// 마이크를 쓰는 중(튜너)에는 세션을 그대로 둬야 함: 이때 메트로놈·반주를 켜도 'playback'으로 바꾸지 않음
// (바꾸면 아이폰에서 마이크 소리가 끊김)
let micUsers = 0
type AS = { audioSession?: { type: string } }

/** 튜너가 마이크를 켜고 끌 때 부름 (켤 때는 누른 그 순간, getUserMedia 전에) */
export function micSession(on: boolean) {
  micUsers = Math.max(0, micUsers + (on ? 1 : -1))
  try {
    const as = (navigator as unknown as AS).audioSession
    // 마이크를 쓸 때는 'auto' (사파리가 알아서 녹음+재생으로 바꿈). 직접 'play-and-record'로 정했을 때 아이패드에서 소리가 0으로 들어왔음(2026-11-05, 원인 후보)
    if (as) as.type = micUsers > 0 ? 'auto' : 'playback'
  } catch { /* 세션을 못 바꿔도 앱은 그대로 */ }
}

export function playbackSession() {
  try {
    const as = (navigator as unknown as AS).audioSession
    if (as) { if (micUsers === 0 && as.type !== 'playback') as.type = 'playback'; return }
    if (!isIOS() || silent) return
    silent = new Audio(SILENT)
    silent.loop = true
    silent.setAttribute('playsinline', '')
    silent.play().catch(() => { silent = null })
  } catch { /* 소리 세션을 못 바꿔도 앱은 그대로 */ }
}
