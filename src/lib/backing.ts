// 반주 소리: 드럼 루프(장르별 비트)와 드론(한 음을 계속 울리는 기준음)
// 드럼: 악보 재생에 쓰는 실제 드럼 녹음(MuseScore 드럼, MIT)을 씀. 받기 전·실패하면 브라우저가 만든 소리로 대신함

export type GrooveId = 'rock' | 'pop' | 'funk' | 'ballad' | 'blues' | 'shuffle' | 'swing' | 'waltz' | 'bossa' | 'hiphop'
type Hit = [step: number, vel?: number]
type Groove = {
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
const GM_DRUM = { kick: 36, snare: 38, rim: 37, hat: 42, open: 46, ride: 51, foot: 44 } as const
// 울림(공간감) 줄이기: 처음 때리는 소리(이 시간)는 그대로 두고, 그 뒤 울림만 작고 짧게
const HOLD: Record<number, number> = { 36: 0.09, 38: 0.08, 37: 0.05, 42: 0.04, 44: 0.04, 46: 0.15, 51: 0.2 }
export type Kit = Map<number, AudioBuffer>

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
    const ctx = this.ctx, out = this.out!
    while (this.next < ctx.currentTime + 0.15) {
      const g = this.getGroove(), steps = g.steps
      if (g.id !== this.lastId) { this.lastId = g.id; this.step = 0 } // 리듬을 바꾸면 그 리듬 첫 박부터
      const beat = 60 / Math.max(30, Math.min(240, this.getBpm()))
      const dur = beat / (steps === 16 ? 4 : 3) // 16칸은 한 박 4칸, 12·9칸은 한 박 3칸(셋잇단)
      const i = this.step % (steps * (g.bars ?? 1))
      // 스윙: 엇박을 뒤로 밀어 '쿵-따'가 '쿵--따'처럼 튀게 (0 똑바로 ~ 1 셋잇단)
      const sw = Math.max(0, Math.min(1, this.getSwing()))
      let t = this.next
      if (steps === 16) {
        if (g.swingOn === 16 && i % 2 === 1) t += sw * (2 * dur) / 6
        if (g.swingOn === 8 && i % 4 === 2) t += sw * (4 * dur) / 6
      } else if (i % 3 === 2) t -= (1 - sw) * beat / 6 // 12칸(셋잇단): 스윙을 줄이면 엇박이 반 박 자리로
      const at = (list: Hit[] | undefined) => list?.find(h => h[0] === i)
      const kit = this.kit
      // 실제 드럼 녹음 한 번 치기 (세기에 따라 크기, 하이햇·라이드는 아주 조금씩 다르게 → 기계 같지 않게)
      const room = Math.max(0, Math.min(1, this.getRoom())) // 1 = 녹음 그대로, 0.6 = 울림 40% 줄임
      const play = (note: number, v: number, wobble = 0) => {
        const b = kit?.get(note); if (!b) return false
        const s = ctx.createBufferSource(); s.buffer = b
        const peak = Math.max(0.02, v * (1 + (Math.random() - 0.5) * wobble)) * 2.2
        const gn = ctx.createGain()
        const full = Math.min(b.duration, 1.6)
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
        s.connect(gn).connect(out); s.start(t)
        return true
      }
      let h
      if ((h = at(g.kick))) play(GM_DRUM.kick, h[1] ?? 1) || kick(ctx, out, t, h[1] ?? 1)
      if ((h = at(g.snare))) play(GM_DRUM.snare, h[1] ?? 1) || snare(ctx, out, t, h[1] ?? 1)
      if ((h = at(g.hat))) {
        // 재즈 스윙의 2·4박 하이햇은 발로 밟는 소리
        const foot = g.id === 'swing'
        play(foot ? GM_DRUM.foot : GM_DRUM.hat, h[1] ?? 0.5, 0.15) || hat(ctx, out, t, h[1] ?? 0.5)
      }
      if ((h = at(g.open))) play(GM_DRUM.open, h[1] ?? 0.5) || hat(ctx, out, t, h[1] ?? 0.5, true)
      if ((h = at(g.ride))) play(GM_DRUM.ride, h[1] ?? 0.5, 0.12) || ride(ctx, out, t, h[1] ?? 0.5)
      if ((h = at(g.rim))) play(GM_DRUM.rim, h[1] ?? 1) || rim(ctx, out, t, h[1] ?? 1)
      this.next += dur
      this.step++
    }
  }
}

/** 드론: 고른 음을 끊김 없이 부드럽게 (톱니파 두 개를 살짝 어긋나게 + 낮은 음 + 고르면 5도)
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
    add('sawtooth', freq, 0.18, -4)
    add('sawtooth', freq, 0.18, 4)
    add('sine', freq / 2, 0.35)
    add('triangle', freq * 2, 0.06)
    if (fifth) { add('sawtooth', freq * 1.5, 0.1, -3); add('sawtooth', freq * 1.5, 0.1, 3) }
    // 아주 느린 흔들림 (탄푸라처럼 살아 있는 느낌)
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.18
    const depth = ctx.createGain(); depth.gain.value = Math.min(400, freq * 1.5)
    lfo.connect(depth).connect(lp.frequency); lfo.start(t); nodes.push(lfo)
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
