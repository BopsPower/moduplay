// 반주 소리: 드럼 루프(장르별 비트)와 드론(한 음을 계속 울리는 기준음)
// 드럼: 악보 재생에 쓰는 실제 드럼 녹음(MuseScore 드럼, MIT)을 씀. 받기 전·실패하면 브라우저가 만든 소리로 대신함

export type GrooveId = 'rock' | 'pop' | 'funk' | 'ballad' | 'blues' | 'shuffle' | 'swing' | 'waltz' | 'bossa' | 'hiphop'
type Hit = [step: number, vel?: number]
export type Groove = {
  id: GrooveId; name: string; hint: string
  steps: 16 | 12 | 9 // 한 마디 칸 수: 16(4박×16분음표) · 12(4박×셋잇단, 12/8) · 9(3박×셋잇단, 3박 스윙)
  bars?: 1 | 2 // 두 마디짜리 리듬(보사노바 클라베)은 2
  swingOn: 8 | 16 // 스윙을 거는 단위: 8분음표 엇박 / 16분음표 엇박
  swing: number // 처음 스윙 정도 0(똑바로)~1(셋잇단처럼 완전히 튐)
  range: [number, number] // 보통 쓰는 빠르기
  kick?: Hit[]; snare?: Hit[]; hat?: Hit[]; open?: Hit[]; ride?: Hit[]; rim?: Hit[]
}

const all16 = (v = 0.35, acc = 0.6): Hit[] => Array.from({ length: 16 }, (_, i) => [i, i % 2 === 0 ? acc : v])
const eighths = (v = 0.5): Hit[] => [0, 2, 4, 6, 8, 10, 12, 14].map(i => [i, i % 4 === 0 ? v + 0.1 : v])

const triplets = (beats: number, acc = 0.5, v = 0.3): Hit[] => Array.from({ length: beats * 3 }, (_, i) => [i, i % 3 === 0 ? acc : v])
const x2 = (hits: Hit[], len = 16): Hit[] => [...hits, ...hits.map(([i, v]) => [i + len, v] as Hit)] // 같은 걸 두 마디로

export const GROOVES: Groove[] = [
  // 8비트·16비트
  { id: 'rock', name: '록 8비트', hint: '록·팝 기본', steps: 16, swingOn: 8, swing: 0, range: [70, 160], kick: [[0], [8], [10, 0.8]], snare: [[4], [12]], hat: eighths() },
  { id: 'pop', name: '팝 16비트', hint: 'K-팝·팝', steps: 16, swingOn: 16, swing: 0, range: [90, 120], kick: [[0], [6, 0.8], [8], [11, 0.6]], snare: [[4], [12]], hat: all16() },
  { id: 'funk', name: '펑크', hint: '16비트 그루브', steps: 16, swingOn: 16, swing: 0, range: [90, 110], kick: [[0], [3, 0.7], [6, 0.8], [10]], snare: [[4], [7, 0.22], [9, 0.22], [12], [15, 0.25]], hat: all16(0.3, 0.55) },
  { id: 'ballad', name: '발라드', hint: '느린 8비트', steps: 16, swingOn: 8, swing: 0, range: [60, 80], kick: [[0], [10, 0.6]], rim: [[4, 0.7], [12, 0.7]], hat: eighths(0.32) },
  // 셋잇단(12/8)·스윙 — 빠르기는 한 박(점4분음표) 기준
  { id: 'blues', name: '12/8 블루스', hint: '느린 블루스', steps: 12, swingOn: 8, swing: 1, range: [50, 75], kick: [[0], [5, 0.45], [6, 0.9]], snare: [[3], [9]], hat: triplets(4, 0.5, 0.3) },
  { id: 'shuffle', name: '12/8 셔플', hint: '블루스·셔플', steps: 12, swingOn: 8, swing: 1, range: [80, 130], kick: [[0], [6]], snare: [[3], [9]], hat: [[0, 0.55], [2, 0.35], [3, 0.55], [5, 0.35], [6, 0.55], [8, 0.35], [9, 0.55], [11, 0.35]] },
  { id: 'swing', name: '재즈 스윙', hint: '4박 스윙', steps: 12, swingOn: 8, swing: 1, range: [100, 220], ride: [[0, 0.5], [3, 0.6], [5, 0.35], [6, 0.5], [9, 0.6], [11, 0.35]], hat: [[3, 0.3], [9, 0.3]], kick: [[0, 0.18], [3, 0.14], [6, 0.18], [9, 0.14]] },
  // 3박 스윙(재즈 왈츠): 라이드 '칭 · 칭가 · 칭', 하이햇은 발로 2박
  { id: 'waltz', name: '3박 스윙', hint: '재즈 왈츠', steps: 9, swingOn: 8, swing: 1, range: [100, 200], ride: [[0, 0.55], [3, 0.6], [5, 0.35], [6, 0.5]], hat: [[3, 0.32]], kick: [[0, 0.2]] },
  // 보사노바(두 마디): 킥 '쿵 . . 쿵 쿵 . . 쿵'(1·2&·3·4&), 사이드스틱 3-2 보사 클라베, 하이햇 8분
  { id: 'bossa', name: '보사노바', hint: '라틴·보사', steps: 16, bars: 2, swingOn: 8, swing: 0, range: [120, 150],
    kick: x2([[0, 0.8], [6, 0.5], [8, 0.75], [14, 0.5]]),
    rim: [[0, 0.9], [6, 0.9], [12, 0.9], [20, 0.9], [26, 0.9]],
    hat: x2(eighths(0.28)) },
  { id: 'hiphop', name: '힙합', hint: '붐뱁', steps: 16, swingOn: 16, swing: 0.5, range: [85, 95], kick: [[0], [7, 0.7], [10, 0.9]], snare: [[4], [12]], hat: eighths(0.42) },
]

export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B']
export const noteFreq = (note: number, octave: number, a4 = 440) => a4 * Math.pow(2, (12 * (octave + 1) + note - 69) / 12)

// ── 드럼 소리 (짧게 만들어 바로 버림) ──
let noise: AudioBuffer | null = null
const noiseBuf = (ctx: BaseAudioContext) => {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return (noise = b)
}
const env = (ctx: BaseAudioContext, out: AudioNode, t: number, peak: number, decay: number) => {
  const g = ctx.createGain()
  g.gain.setValueAtTime(Math.max(0.0001, peak), t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
  g.connect(out)
  return g
}
const noiseHit = (ctx: BaseAudioContext, out: AudioNode, t: number, peak: number, decay: number, type: BiquadFilterType, freq: number, q = 0.7) => {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf(ctx)
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q
  s.connect(f).connect(env(ctx, out, t, peak, decay)); s.start(t); s.stop(t + decay + 0.02)
}
function kick(ctx: BaseAudioContext, out: AudioNode, t: number, v: number) {
  const o = ctx.createOscillator(); o.type = 'sine'
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12)
  o.connect(env(ctx, out, t, 0.9 * v, 0.38)); o.start(t); o.stop(t + 0.4)
}
function snare(ctx: BaseAudioContext, out: AudioNode, t: number, v: number) {
  noiseHit(ctx, out, t, 0.55 * v, 0.18, 'highpass', 1400)
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08)
  o.connect(env(ctx, out, t, 0.35 * v, 0.1)); o.start(t); o.stop(t + 0.12)
}
const hat = (ctx: BaseAudioContext, out: AudioNode, t: number, v: number, open = false) => noiseHit(ctx, out, t, 0.28 * v, open ? 0.28 : 0.045, 'highpass', 7500)
const ride = (ctx: BaseAudioContext, out: AudioNode, t: number, v: number) => { noiseHit(ctx, out, t, 0.2 * v, 0.45, 'bandpass', 6000, 0.9); noiseHit(ctx, out, t, 0.12 * v, 0.06, 'highpass', 9000) }
function rim(ctx: BaseAudioContext, out: AudioNode, t: number, v: number) {
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 1700
  o.connect(env(ctx, out, t, 0.32 * v, 0.035)); o.start(t); o.stop(t + 0.05)
  noiseHit(ctx, out, t, 0.18 * v, 0.02, 'highpass', 3000)
}

// 일반 MIDI 드럼 번호: 킥 36 · 스네어 38 · 사이드스틱(림) 37 · 닫힌 하이햇 42 · 열린 하이햇 46 · 라이드 51 · 발 하이햇 44
// (백킹트랙용) 크래시 49 · 탐 높은 48 · 중간 45 · 낮은 41
const GM_DRUM = { kick: 36, snare: 38, rim: 37, hat: 42, open: 46, ride: 51, foot: 44, crash: 49, tomHi: 48, tomMid: 45, tomLow: 41 } as const
export type DrumPart = keyof typeof GM_DRUM
// 울림(공간감) 줄이기: 처음 때리는 소리(이 시간)는 그대로 두고, 그 뒤 울림만 작고 짧게
const HOLD: Record<number, number> = { 36: 0.09, 38: 0.08, 37: 0.05, 42: 0.04, 44: 0.04, 46: 0.15, 51: 0.2, 49: 0.3, 48: 0.12, 45: 0.12, 41: 0.14 }
export type Kit = Map<number, AudioBuffer>

/** 드럼 한 번 치기 (드럼 루프·백킹트랙 같이 씀). 실제 드럼 녹음이 없으면 브라우저가 만든 소리로
 *  room: 1 = 녹음 그대로, 0.6 = 울림 40% 줄임 / wobble: 세기를 조금씩 다르게(기계 같지 않게) */
export function drumHit(ctx: BaseAudioContext, out: AudioNode, kit: Kit | null, part: DrumPart, v: number, t: number, room = 1, wobble = 0) {
  const note = GM_DRUM[part]
  const b = kit?.get(note)
  if (!b) {
    if (part === 'kick' || part === 'tomLow') kick(ctx, out, t, v)
    else if (part === 'snare' || part === 'tomHi' || part === 'tomMid') snare(ctx, out, t, v)
    else if (part === 'hat' || part === 'foot') hat(ctx, out, t, v)
    else if (part === 'open' || part === 'crash') hat(ctx, out, t, v, true)
    else if (part === 'ride') ride(ctx, out, t, v)
    else rim(ctx, out, t, v)
    return
  }
  room = Math.max(0, Math.min(1, room))
  const s = ctx.createBufferSource(); s.buffer = b
  const peak = Math.max(0.02, v * (1 + (Math.random() - 0.5) * wobble)) * 2.2
  const gn = ctx.createGain()
  const full = Math.min(b.duration, part === 'crash' ? 1.9 : 1.6)
  s.connect(gn).connect(out); s.start(t) // start를 먼저 (stop을 먼저 부르면 소리가 안 남)
  if (room >= 0.99) {
    gn.gain.value = peak
    s.stop(t + full)
  } else {
    // 때리는 순간은 그대로 → 울림 부분은 room만큼 작게, room만큼 짧게 사라짐
    const hold = Math.min(HOLD[note] ?? 0.08, full)
    const tail = Math.max(0.03, (full - hold) * room)
    gn.gain.setValueAtTime(peak, t)
    gn.gain.setValueAtTime(peak, t + hold)
    gn.gain.linearRampToValueAtTime(peak * Math.max(0.05, room), t + hold + 0.025)
    gn.gain.setTargetAtTime(0.0001, t + hold + 0.025, tail / 4)
    s.stop(t + hold + 0.025 + tail + 0.02)
  }
}

/** 스윙: 엇박을 뒤로 밀어 '쿵-따'가 '쿵--따'처럼 튀게 (sw 0 똑바로 ~ 1 셋잇단). i = 마디 안 칸 번호, 돌려주는 값은 초 */
export function swingOffset(g: Groove, i: number, beat: number, sw: number) {
  sw = Math.max(0, Math.min(1, sw))
  if (g.steps === 16) {
    if (g.swingOn === 16 && i % 2 === 1) return sw * beat / 12
    if (g.swingOn === 8 && i % 4 === 2) return sw * beat / 6
    return 0
  }
  return i % 3 === 2 ? -(1 - sw) * beat / 6 : 0 // 셋잇단: 스윙을 줄이면 엇박이 반 박 자리로
}

/** 리듬의 i번 칸에 있는 드럼을 t초에 치기 (드럼 루프·백킹트랙 같이 씀) */
export function playGrooveStep(ctx: BaseAudioContext, out: AudioNode, kit: Kit | null, g: Groove, i: number, t: number, room: number, mult = 1) {
  const at = (list: Hit[] | undefined) => list?.find(h => h[0] === i)
  let h
  if ((h = at(g.kick))) drumHit(ctx, out, kit, 'kick', (h[1] ?? 1) * mult, t, room)
  if ((h = at(g.snare))) drumHit(ctx, out, kit, 'snare', (h[1] ?? 1) * mult, t, room)
  // 재즈 스윙의 2·4박 하이햇은 발로 밟는 소리 / 하이햇·라이드는 세기를 아주 조금씩 다르게 (기계 같지 않게)
  if ((h = at(g.hat))) drumHit(ctx, out, kit, g.id === 'swing' ? 'foot' : 'hat', (h[1] ?? 0.5) * mult, t, room, 0.15)
  if ((h = at(g.open))) drumHit(ctx, out, kit, 'open', (h[1] ?? 0.5) * mult, t, room)
  if ((h = at(g.ride))) drumHit(ctx, out, kit, 'ride', (h[1] ?? 0.5) * mult, t, room, 0.12)
  if ((h = at(g.rim))) drumHit(ctx, out, kit, 'rim', (h[1] ?? 1) * mult, t, room)
}

/** 드럼 루프: bpm(얼마나 빠른지)은 함수로 받아 바뀌면 바로 따라감 */
export class GroovePlayer {
  kit: Kit | null = null
  private lastId = ''
  private timer: number | null = null
  private next = 0
  private step = 0
  private out: GainNode | null = null
  constructor(private ctx: AudioContext, private getBpm: () => number, private getGroove: () => Groove, private getSwing: () => number, vol = 0.8, private getRoom: () => number = () => 1) {
    this.out = ctx.createGain(); this.out.gain.value = vol; this.out.connect(ctx.destination)
  }
  setVolume(v: number) { if (this.out) this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05) }
  start() {
    this.stop()
    this.next = this.ctx.currentTime + 0.06; this.step = 0
    this.timer = window.setInterval(() => this.tick(), 50)
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null }
  close() { this.stop(); try { this.out?.disconnect() } catch { /* 무시 */ } this.out = null }
  private tick() {
    try { this.schedule() } catch { /* 한 번 실패해도 다음 박은 계속 */ this.next = Math.max(this.next, this.ctx.currentTime + 0.05) }
  }
  private schedule() {
    const ctx = this.ctx, out = this.out!
    while (this.next < ctx.currentTime + 0.15) {
      const g = this.getGroove(), steps = g.steps
      if (g.id !== this.lastId) { this.lastId = g.id; this.step = 0 } // 리듬을 바꾸면 그 리듬 첫 박부터
      const beat = 60 / Math.max(30, Math.min(240, this.getBpm()))
      const dur = beat / (steps === 16 ? 4 : 3) // 16칸은 한 박 4칸, 12·9칸은 한 박 3칸(셋잇단)
      const i = this.step % (steps * (g.bars ?? 1))
      const t = this.next + swingOffset(g, i, beat, this.getSwing())
      const room = this.getRoom() // 1 = 녹음 그대로, 0.6 = 울림 40% 줄임
      playGrooveStep(ctx, out, this.kit, g, i, t, room)
      this.next += dur
      this.step++
    }
  }
}

/** 드론: 고른 음을 끊김 없이, 크기가 일정하게 (톱니파 + 한 옥타브 아래 사인파 + 고르면 5도)
 *  음정 연습용이라 소리가 흔들리지 않게 함 — 예전엔 일부러 살짝 어긋난 음 두 개를 겹치고 밝기를 천천히 움직여
 *  '커졌다 작아졌다' 들렸음(원장님 2026-11-04) → 어긋남·흔들림 없앰
 *  음을 바꾸면 앞 소리는 천천히 줄이고 새 소리를 천천히 키움 (딱 끊기는 소리 없이) */
export class DronePlayer {
  private voice: { gain: GainNode; nodes: AudioScheduledSourceNode[] } | null = null
  private master: GainNode
  constructor(private ctx: AudioContext, vol = 0.5) {
    this.master = ctx.createGain(); this.master.gain.value = vol; this.master.connect(ctx.destination)
  }
  setVolume(v: number) { this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.08) }
  start(freq: number, fifth: boolean) {
    this.stop()
    const ctx = this.ctx, t = ctx.currentTime
    const gain = ctx.createGain(); gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(1, t + 0.5); gain.connect(this.master)
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(2400, freq * 6); lp.Q.value = 0.6
    lp.connect(gain)
    const nodes: AudioScheduledSourceNode[] = []
    const add = (type: OscillatorType, f: number, g0: number, detune = 0) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune
      const g = ctx.createGain(); g.gain.value = g0
      o.connect(g).connect(lp); o.start(t); nodes.push(o)
    }
    add('sawtooth', freq, 0.32)
    add('sine', freq / 2, 0.35)
    add('triangle', freq * 2, 0.06)
    if (fifth) add('sawtooth', freq * 1.5, 0.18)
    this.voice = { gain, nodes }
  }
  stop() {
    const v = this.voice
    if (!v) return
    this.voice = null
    const t = this.ctx.currentTime
    v.gain.gain.cancelScheduledValues(t)
    v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), t)
    v.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4)
    v.nodes.forEach(n => { try { n.stop(t + 0.45) } catch { /* 무시 */ } })
    window.setTimeout(() => { try { v.gain.disconnect() } catch { /* 무시 */ } }, 600)
  }
}
