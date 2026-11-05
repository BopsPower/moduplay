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

// ───────── 소리 장치 건강 점검 (2026-11-05 "PDF 보다가 왔다갔다 하면 갑자기 소리가 안 남, 특히 아이패드") ─────────
// 기록: 아이패드·맥 사파리에서 소리 장치가 'running'인데 시계(currentTime)가 0에서 안 가는 일이 있음.
// 사파리는 같은 설정의 소리 장치들이 출력 하나를 같이 쓰는 것으로 보임 → 하나가 멈추면 새로 만든 장치도 멈춤.
// 그래서: 앱의 모든 소리 장치를 여기 등록해 1초마다 시계가 가는지 보고,
//   - 쉬고 있는 장치가 멈춰 있으면 다음에 누를 때 새로 만듦 (audioOk가 false)
//   - 재생을 시작했는데 시계가 안 가면 모든 장치를 닫고(resetAllAudio) 한 번 더 누르게 함 → 출력이 새로 열림
type Entry = { ctx: AudioContext; label: string; drop?: () => void; t: number; wall: number; stuck: boolean }
const live = new Set<Entry>()
let beat = 0
let resets = 0
function sample() {
  const now = performance.now()
  for (const e of [...live]) {
    if (e.ctx.state === 'closed') { live.delete(e); continue }
    const dw = now - e.wall
    if (e.ctx.state !== 'running') { e.stuck = false; e.t = e.ctx.currentTime; e.wall = now; continue }
    if (dw > 700) { e.stuck = e.ctx.currentTime - e.t < 0.05; e.t = e.ctx.currentTime; e.wall = now }
  }
  if (!live.size && beat) { clearInterval(beat); beat = 0 }
}

/** 소리 장치 등록. drop: 모두 닫을 때(resetAllAudio) 그 장치를 쓰던 곳이 정리할 일 (멈추고 참조 지우기) */
export function trackAudio(ctx: AudioContext, label: string, drop?: () => void) {
  live.add({ ctx, label, drop, t: ctx.currentTime, wall: performance.now(), stuck: false })
  if (!beat && typeof window !== 'undefined') beat = window.setInterval(sample, 1000)
}

/** 등록을 풀고 닫음 */
export function closeAudio(ctx: AudioContext | null | undefined) {
  if (!ctx) return
  for (const e of [...live]) if (e.ctx === ctx) live.delete(e)
  try { ctx.close().catch(() => {}) } catch { /* 이미 닫힘 */ }
}

/** 이 장치를 지금 써도 되는지: 켜져 있고(running) 시계가 가고 있음 */
export function audioOk(ctx: AudioContext) {
  sample()
  if (ctx.state !== 'running') return false
  for (const e of live) if (e.ctx === ctx) return !e.stuck
  return true
}

/** 앱의 모든 소리 장치를 닫음 → 다음에 누를 때 각자 새로 만듦 (같이 쓰던 출력도 새로 열림) */
export function resetAllAudio() {
  resets++
  for (const e of [...live]) {
    live.delete(e)
    try { e.drop?.() } catch { /* 무시 */ }
    try { e.ctx.close().catch(() => {}) } catch { /* 무시 */ }
  }
}

/** 진단 기록용 한 줄: 장치마다 이름·상태·시계·샘플레이트 */
export function audioReport() {
  sample()
  const list = [...live].map(e => `${e.label}:${e.ctx.state}${e.stuck ? '(stuck)' : ''}@${e.ctx.currentTime.toFixed(1)}/${e.ctx.sampleRate}`)
  const as = (navigator as unknown as AS).audioSession?.type ?? '-'
  return `ctx[${list.join(' ') || 'none'}] resets=${resets} session=${as} vis=${typeof document !== 'undefined' ? document.visibilityState : '-'} up=${Math.round(performance.now() / 1000)}s`
}
