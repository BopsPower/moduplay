// 실제 악기 소리로 악보 재생 (MIDI + 녹음 샘플)
// - 변환 서버가 만든 MIDI(midi_path)를 브라우저에서 읽고, 파트마다 고른 악기 샘플로 연주
// - 샘플: MusyngKite(멜로디 악기) · FluidR3 드럼 (github.io 공개 사운드폰트, 처음 한 번만 받고 브라우저가 기억)
// - <audio>와 같은 모양(currentTime·paused·play·pause·playbackRate·duration·이벤트)이라 악보 화면 코드를 거의 그대로 씀

export const GM = 'acoustic_grand_piano bright_acoustic_piano electric_grand_piano honkytonk_piano electric_piano_1 electric_piano_2 harpsichord clavinet celesta glockenspiel music_box vibraphone marimba xylophone tubular_bells dulcimer drawbar_organ percussive_organ rock_organ church_organ reed_organ accordion harmonica tango_accordion acoustic_guitar_nylon acoustic_guitar_steel electric_guitar_jazz electric_guitar_clean electric_guitar_muted overdriven_guitar distortion_guitar guitar_harmonics acoustic_bass electric_bass_finger electric_bass_pick fretless_bass slap_bass_1 slap_bass_2 synth_bass_1 synth_bass_2 violin viola cello contrabass tremolo_strings pizzicato_strings orchestral_harp timpani string_ensemble_1 string_ensemble_2 synth_strings_1 synth_strings_2 choir_aahs voice_oohs synth_choir orchestra_hit trumpet trombone tuba muted_trumpet french_horn brass_section synth_brass_1 synth_brass_2 soprano_sax alto_sax tenor_sax baritone_sax oboe english_horn bassoon clarinet piccolo flute recorder pan_flute blown_bottle shakuhachi whistle ocarina lead_1_square lead_2_sawtooth lead_3_calliope lead_4_chiff lead_5_charang lead_6_voice lead_7_fifths lead_8_bass__lead pad_1_new_age pad_2_warm pad_3_polysynth pad_4_choir pad_5_bowed pad_6_metallic pad_7_halo pad_8_sweep fx_1_rain fx_2_soundtrack fx_3_crystal fx_4_atmosphere fx_5_brightness fx_6_goblins fx_7_echoes fx_8_scifi sitar banjo shamisen koto kalimba bagpipe fiddle shanai tinkle_bell agogo steel_drums woodblock taiko_drum melodic_tom synth_drum reverse_cymbal guitar_fret_noise breath_noise seashore bird_tweet telephone_ring helicopter applause gunshot'.split(' ')

export const DRUMS = 'percussion'
// 고를 수 있는 악기 (자주 쓰는 것만, 한글 이름)
export const CHOICES: { group: string; items: [string, string][] }[] = [
  { group: '건반', items: [['acoustic_grand_piano', '그랜드 피아노'], ['bright_acoustic_piano', '밝은 피아노'], ['electric_piano_1', '일렉 피아노 (로즈)'], ['electric_piano_2', '일렉 피아노 (FM)'], ['drawbar_organ', '오르간'], ['rock_organ', '록 오르간'], ['vibraphone', '비브라폰'], ['marimba', '마림바']] },
  { group: '기타', items: [['acoustic_guitar_nylon', '나일론 기타'], ['acoustic_guitar_steel', '어쿠스틱 기타'], ['electric_guitar_clean', '일렉 기타 (클린)'], ['electric_guitar_jazz', '재즈 기타'], ['overdriven_guitar', '일렉 기타 (오버드라이브)'], ['distortion_guitar', '일렉 기타 (디스토션)']] },
  { group: '베이스', items: [['electric_bass_finger', '일렉 베이스 (핑거)'], ['electric_bass_pick', '일렉 베이스 (피크)'], ['acoustic_bass', '콘트라베이스'], ['fretless_bass', '프렛리스 베이스'], ['slap_bass_1', '슬랩 베이스'], ['synth_bass_1', '신스 베이스']] },
  { group: '현악·관악', items: [['string_ensemble_1', '스트링'], ['violin', '바이올린'], ['cello', '첼로'], ['alto_sax', '알토 색소폰'], ['tenor_sax', '테너 색소폰'], ['trumpet', '트럼펫'], ['trombone', '트롬본'], ['flute', '플루트'], ['clarinet', '클라리넷']] },
  { group: '목소리·신스', items: [['choir_aahs', '코러스 (아~)'], ['voice_oohs', '보이스 (우~)'], ['lead_1_square', '신스 리드'], ['pad_2_warm', '신스 패드']] },
]
export const labelOf = (inst: string) => inst === DRUMS ? '드럼' : CHOICES.flatMap(c => c.items).find(([k]) => k === inst)?.[1] ?? inst.replace(/_/g, ' ')

// ───────── MIDI 읽기 (표준 MIDI 파일) ─────────
export type Note = { t: number; d: number; n: number; v: number } // 시작(초) · 길이(초) · 음 번호 · 세기(0~1)
export type Part = { name: string; program: number; drum: boolean; notes: Note[] }

export function parseMidi(buf: ArrayBuffer): { parts: Part[]; duration: number } {
  const b = new DataView(buf); let p = 0
  const u32 = () => { const v = b.getUint32(p); p += 4; return v }
  const u16 = () => { const v = b.getUint16(p); p += 2; return v }
  const vlq = () => { let v = 0, c; do { c = b.getUint8(p++); v = (v << 7) | (c & 0x7f) } while (c & 0x80); return v }
  if (u32() !== 0x4d546864) throw new Error('MIDI 파일이 아니에요')
  const hl = u32(); u16(); const ntr = u16(); const div = u16(); p = 8 + hl
  if (div & 0x8000) throw new Error('지원하지 않는 MIDI 시간 형식')
  type Raw = { tick: number; type: 'on' | 'off' | 'prog' | 'tempo' | 'name'; ch: number; a: number; b2: number; s?: string }
  const tracks: Raw[][] = []
  for (let k = 0; k < ntr && p < b.byteLength; k++) {
    const id = u32(), len = u32(), end = p + len
    if (id !== 0x4d54726b) { p = end; continue }
    const ev: Raw[] = []; let tick = 0, run = 0
    while (p < end) {
      tick += vlq()
      let st = b.getUint8(p)
      if (st < 0x80) st = run; else p++
      if (st === 0xff) {
        const ty = b.getUint8(p++), l = vlq()
        if (ty === 0x51 && l === 3) ev.push({ tick, type: 'tempo', ch: 0, a: (b.getUint8(p) << 16) | (b.getUint8(p + 1) << 8) | b.getUint8(p + 2), b2: 0 })
        if (ty === 0x03 || ty === 0x04) { let s = ''; const bytes = new Uint8Array(buf, p, l); try { s = new TextDecoder().decode(bytes) } catch { /* 이름 없음 */ } ev.push({ tick, type: 'name', ch: 0, a: 0, b2: 0, s: s.trim() }) }
        p += l
      } else if (st === 0xf0 || st === 0xf7) { p += vlq() }
      else {
        run = st; const hi = st & 0xf0, ch = st & 0x0f
        const a = b.getUint8(p++); const b2 = hi === 0xc0 || hi === 0xd0 ? 0 : b.getUint8(p++)
        if (hi === 0x90 && b2 > 0) ev.push({ tick, type: 'on', ch, a, b2 })
        else if (hi === 0x80 || (hi === 0x90 && b2 === 0)) ev.push({ tick, type: 'off', ch, a, b2 })
        else if (hi === 0xc0) ev.push({ tick, type: 'prog', ch, a, b2 })
      }
    }
    p = end; tracks.push(ev)
  }
  // 빠르기 지도 → 틱을 초로
  const tempos = tracks.flat().filter(e => e.type === 'tempo').sort((x, y) => x.tick - y.tick)
  const segs: { tick: number; sec: number; spt: number }[] = [{ tick: 0, sec: 0, spt: 0.5 / div }]
  for (const e of tempos) {
    const last = segs[segs.length - 1]
    const sec = last.sec + (e.tick - last.tick) * last.spt
    if (e.tick === last.tick) last.spt = e.a / 1e6 / div; else segs.push({ tick: e.tick, sec, spt: e.a / 1e6 / div })
  }
  const toSec = (tick: number) => { let s = segs[0]; for (const x of segs) { if (x.tick <= tick) s = x; else break } return s.sec + (tick - s.tick) * s.spt }

  const parts: Part[] = []; let duration = 0
  for (const ev of tracks) {
    const name = ev.find(e => e.type === 'name' && e.s)?.s ?? ''
    // 한 트랙 안에서도 채널별로 나눔 (드럼은 10번 채널)
    const byCh = new Map<number, { prog: number; notes: Note[]; open: Map<number, { t: number; v: number }[]> }>()
    for (const e of ev) {
      if (e.type !== 'on' && e.type !== 'off' && e.type !== 'prog') continue
      let c = byCh.get(e.ch); if (!c) byCh.set(e.ch, c = { prog: 0, notes: [], open: new Map() })
      if (e.type === 'prog') { if (!c.notes.length) c.prog = e.a; continue }
      const t = toSec(e.tick)
      if (e.type === 'on') { const q = c.open.get(e.a) ?? []; q.push({ t, v: e.b2 / 127 }); c.open.set(e.a, q) }
      else { const q = c.open.get(e.a); const o = q?.shift(); if (o) { c.notes.push({ t: o.t, d: Math.max(0.03, t - o.t), n: e.a, v: o.v }); duration = Math.max(duration, t) } }
    }
    for (const [ch, c] of byCh) {
      if (!c.notes.length) continue
      c.notes.sort((x, y) => x.t - y.t)
      parts.push({ name: name || (ch === 9 ? '드럼' : `파트 ${parts.length + 1}`), program: c.prog, drum: ch === 9, notes: c.notes })
    }
  }
  return { parts, duration }
}

// ───────── 악기 샘플 받기 ─────────
type Font = Map<number, AudioBuffer> // 음 번호 → 소리
const fonts = new Map<string, Promise<Font>>()
const NOTE: Record<string, number> = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 }
const urlOf = (inst: string) => inst === DRUMS
  ? 'https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/percussion-mp3.js'
  : `https://gleitz.github.io/midi-js-soundfonts/MusyngKite/${inst}-mp3.js`

export function loadFont(ctx: BaseAudioContext, inst: string): Promise<Font> {
  let f = fonts.get(inst)
  if (!f) {
    f = (async () => {
      const r = await fetch(urlOf(inst))
      if (!r.ok) throw new Error('악기 소리를 받지 못했어요 (' + inst + ')')
      const txt = await r.text()
      const out: Font = new Map()
      const jobs: Promise<void>[] = []
      for (const m of txt.matchAll(/"([A-G]b?)(-?\d)"\s*:\s*"data:audio\/[a-z0-9]+;base64,([^"]+)"/g)) {
        const n = (Number(m[2]) + 1) * 12 + NOTE[m[1]]
        const bin = atob(m[3]); const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        jobs.push(ctx.decodeAudioData(bytes.buffer).then(ab => { out.set(n, ab) }, () => { /* 한 음 실패는 건너뜀 */ }))
      }
      await Promise.all(jobs)
      if (!out.size) throw new Error('악기 소리를 읽지 못했어요 (' + inst + ')')
      return out
    })()
    f.catch(() => fonts.delete(inst)) // 실패하면 다음에 다시 시도
    fonts.set(inst, f)
  }
  return f
}

// ───────── 재생기 ─────────
export type Track = { name: string; inst: string; drum: boolean; mute: boolean; solo: boolean; vol: number; count: number }

type Voice = { src: AudioBufferSourceNode; g: GainNode; at: number }

export class SamplePlayer extends EventTarget {
  ctx: AudioContext | null = null
  parts: Part[] = []
  tracks: Track[] = []
  duration = 0
  paused = true
  preservesPitch = true // <audio>와 모양만 맞춤
  private rate = 1
  private anchorCtx = 0 // 재생 시작한 오디오 시계
  private anchorPos = 0 // 그때 악보 시간(초)
  private pos = 0
  private idx: number[] = []
  private timer = 0
  private voices = new Set<Voice>()
  private master: GainNode | null = null
  private gains: GainNode[] = []
  private fontsReady: (Font | null)[] = []
  onLoading?: (busy: boolean, err?: string) => void

  async loadMidi(url: string, saved?: Record<string, string>) {
    const buf = await (await fetch(url)).arrayBuffer()
    const { parts, duration } = parseMidi(buf)
    this.parts = parts; this.duration = duration
    this.tracks = parts.map(p => {
      const inst = p.drum ? DRUMS : (saved?.[p.name] ?? GM[p.program] ?? GM[0])
      return { name: p.name, inst, drum: p.drum, mute: false, solo: false, vol: 1, count: p.notes.length }
    })
    this.idx = parts.map(() => 0)
    this.dispatchEvent(new Event('loadedmetadata'))
  }

  private ensureCtx() {
    if (!this.ctx) {
      const C = window.AudioContext || (window as any).webkitAudioContext
      this.ctx = new C({ latencyHint: 'playback' })
      // 살짝 눌러 주는 컴프레서로 여러 악기가 겹쳐도 깨지지 않게
      const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 3
      comp.connect(this.ctx.destination)
      this.master = this.ctx.createGain(); this.master.gain.value = 0.8; this.master.connect(comp)
    }
    const ctx = this.ctx!
    while (this.gains.length < this.tracks.length) { const g = ctx.createGain(); g.connect(this.master!); this.gains.push(g) }
    this.applyGains()
    return ctx
  }

  /** 지금 고른 악기들 받기 (재생 전에 불러 두면 바로 시작) */
  async prepare() {
    const ctx = this.ensureCtx()
    this.onLoading?.(true)
    try {
      this.fontsReady = await Promise.all(this.tracks.map(t => loadFont(ctx, t.inst).catch(() => null)))
      const bad = this.tracks.filter((_, i) => !this.fontsReady[i]).map(t => labelOf(t.inst))
      this.onLoading?.(false, bad.length ? `${bad.join(', ')} 소리를 받지 못했어요` : undefined)
    } catch (e) { this.onLoading?.(false, String(e)) }
  }

  async setInstrument(i: number, inst: string) {
    if (!this.tracks[i]) return
    this.tracks[i] = { ...this.tracks[i], inst }
    const ctx = this.ensureCtx()
    this.onLoading?.(true)
    const f = await loadFont(ctx, inst).catch(() => null)
    this.fontsReady[i] = f
    this.onLoading?.(false, f ? undefined : `${labelOf(inst)} 소리를 받지 못했어요`)
    if (!this.paused && this.ctx) { this.anchorPos = this.currentTime; this.anchorCtx = this.ctx.currentTime; this.reschedule(false) }
  }
  setTrack(i: number, ch: Partial<Pick<Track, 'mute' | 'solo' | 'vol'>>) {
    if (!this.tracks[i]) return
    this.tracks[i] = { ...this.tracks[i], ...ch }
    this.applyGains()
  }
  private applyGains() {
    const anySolo = this.tracks.some(t => t.solo)
    this.tracks.forEach((t, i) => {
      const g = this.gains[i]; if (!g || !this.ctx) return
      const on = !t.mute && (!anySolo || t.solo)
      g.gain.setTargetAtTime(on ? t.vol * (t.drum ? 0.9 : 1) : 0, this.ctx.currentTime, 0.02)
    })
  }

  get currentTime() {
    if (this.paused || !this.ctx) return this.pos
    return Math.min(this.duration, this.anchorPos + (this.ctx.currentTime - this.anchorCtx) * this.rate)
  }
  set currentTime(t: number) {
    this.pos = Math.max(0, Math.min(this.duration, t))
    if (!this.paused && this.ctx) { this.anchorCtx = this.ctx.currentTime; this.anchorPos = this.pos; this.reschedule() }
  }
  get playbackRate() { return this.rate }
  set playbackRate(r: number) {
    if (r === this.rate) return
    const now = this.currentTime
    this.rate = r
    if (!this.paused && this.ctx) { this.anchorCtx = this.ctx.currentTime; this.anchorPos = now; this.reschedule(false) }
  }

  async play() {
    const ctx = this.ensureCtx()
    if (ctx.state !== 'running') await ctx.resume()
    if (this.fontsReady.length !== this.tracks.length || this.fontsReady.some((f, i) => !f && this.tracks[i])) await this.prepare()
    if (this.pos >= this.duration - 0.05) this.pos = 0
    this.paused = false
    this.anchorCtx = ctx.currentTime + 0.05; this.anchorPos = this.pos
    this.reschedule()
    this.timer = window.setInterval(() => this.pump(), 25)
  }
  pause() {
    if (this.paused) return
    this.pos = this.currentTime
    this.paused = true
    clearInterval(this.timer)
    this.stopVoices(0)
  }
  destroy() { this.pause(); this.ctx?.close().catch(() => {}); this.ctx = null }

  // 자리 이동이면 울리는 소리를 모두 끊고, 빠르기·악기 변경이면 아직 안 울린 예약만 다시
  private reschedule(cutAll = true) {
    this.stopVoices(0.03, !cutAll)
    const at = this.anchorPos
    this.idx = this.parts.map(p => { let lo = 0, hi = p.notes.length; while (lo < hi) { const m = (lo + hi) >> 1; if (p.notes[m].t < at - 0.005) lo = m + 1; else hi = m } return lo })
    this.pump()
  }
  private stopVoices(fade: number, onlyFuture = false) {
    const ctx = this.ctx; if (!ctx) return
    for (const v of [...this.voices]) {
      if (onlyFuture && v.at <= ctx.currentTime) continue
      this.voices.delete(v)
      try { v.g.gain.cancelScheduledValues(ctx.currentTime); v.g.gain.setTargetAtTime(0, ctx.currentTime, fade || 0.01); v.src.stop(ctx.currentTime + (fade || 0.01) * 4) } catch { /* 이미 끝남 */ }
    }
  }
  private pump() {
    const ctx = this.ctx; if (!ctx || this.paused) return
    const ahead = 0.2 // 0.2초 앞까지 미리 예약
    const until = this.anchorPos + (ctx.currentTime + ahead - this.anchorCtx) * this.rate
    this.parts.forEach((p, i) => {
      const font = this.fontsReady[i]; const out = this.gains[i]
      while (this.idx[i] < p.notes.length && p.notes[this.idx[i]].t < until) {
        const nt = p.notes[this.idx[i]++]
        if (!font || !out) continue
        const when = this.anchorCtx + (nt.t - this.anchorPos) / this.rate
        if (when < ctx.currentTime - 0.02) continue
        this.voice(font, nt, Math.max(ctx.currentTime, when), nt.d / this.rate, out, this.tracks[i].drum)
      }
    })
    if (this.currentTime >= this.duration) { this.pause(); this.pos = this.duration; this.dispatchEvent(new Event('ended')) }
  }
  private voice(font: Font, nt: Note, when: number, dur: number, out: GainNode, drum: boolean) {
    const ctx = this.ctx!
    // 가장 가까운 음의 샘플을 골라 높이만 맞춤
    let buf = font.get(nt.n), shift = 0
    if (!buf) { for (let k = 1; k < 24 && !buf; k++) { if (font.get(nt.n - k)) { buf = font.get(nt.n - k); shift = k } else if (font.get(nt.n + k)) { buf = font.get(nt.n + k); shift = -k } } }
    if (!buf) return
    const src = ctx.createBufferSource(); src.buffer = buf
    if (shift) src.playbackRate.value = Math.pow(2, shift / 12)
    const g = ctx.createGain()
    const vel = 0.15 + 0.85 * nt.v * nt.v // 세게/여리게가 귀에 자연스럽게
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(vel, when + 0.004)
    const release = drum ? 0 : 0.18
    const end = drum ? when + buf.duration : when + dur
    if (!drum) { g.gain.setValueAtTime(vel, end); g.gain.setTargetAtTime(0, end, release / 3) }
    src.connect(g); g.connect(out)
    src.start(when); src.stop(end + release + 0.05)
    const v: Voice = { src, g, at: when }
    this.voices.add(v)
    src.onended = () => { this.voices.delete(v); try { g.disconnect() } catch { /* 무시 */ } }
  }
}
