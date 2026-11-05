// 실제 악기 소리로 악보 재생 (MIDI + 녹음 샘플)
import { IS_WEBKIT, audioOk, audioReport, closeAudio, playbackSession, resetAllAudio, trackAudio, unlockAudio } from './iosAudio'
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

import { logError } from './errorLog'

// ───────── MIDI 읽기 (표준 MIDI 파일) ─────────
export type Note = { t: number; d: number; n: number; v: number } // 시작(초) · 길이(초) · 음 번호 · 세기(0~1)
export type Part = { name: string; program: number; drum: boolean; notes: Note[] }

// 드럼 악보 표준 자리(타악기 음자리표, 높은음자리표 자리 기준) → GM 드럼 소리 번호
const DRUM_NAME = /drum|드럼|perc|kit|타악/i
// FluidR3 드럼 묶음 소리 크기 맞춤 (스네어 기준, 하이햇은 녹음이 7배쯤 작음)
const DRUM_GAIN: Record<number, number> = { 42: 4, 44: 4, 46: 2.5, 51: 1.6, 53: 1.6, 59: 1.6, 49: 1.3, 57: 1.3 }
const STAFF_DRUM: Record<number, number> = {
  60: 36, 62: 44, 64: 36, 65: 36, 67: 41, 69: 43, 71: 45, 72: 38, 74: 45, 76: 48, 77: 51, 79: 42, 81: 49, 83: 49, 84: 49,
}
function staffToDrum(n: number) {
  if (n >= 35 && n <= 59) return n // 이미 드럼 번호 범위면 그대로
  if (STAFF_DRUM[n]) return STAFF_DRUM[n]
  let best = 38, d = 99
  for (const k of Object.keys(STAFF_DRUM)) { const dd = Math.abs(Number(k) - n); if (dd < d) { d = dd; best = STAFF_DRUM[Number(k)] } }
  return best
}

export type Beat = { t: number; down: boolean } // 메트로놈 박 (down = 마디 첫 박)
export function parseMidi(buf: ArrayBuffer): { parts: Part[]; duration: number; beats: Beat[]; bpm: number | null } {
  const b = new DataView(buf); let p = 0
  const u32 = () => { const v = b.getUint32(p); p += 4; return v }
  const u16 = () => { const v = b.getUint16(p); p += 2; return v }
  const vlq = () => { let v = 0, c; do { c = b.getUint8(p++); v = (v << 7) | (c & 0x7f) } while (c & 0x80); return v }
  if (u32() !== 0x4d546864) throw new Error('MIDI 파일이 아니에요')
  const hl = u32(); u16(); const ntr = u16(); const div = u16(); p = 8 + hl
  if (div & 0x8000) throw new Error('지원하지 않는 MIDI 시간 형식')
  type Raw = { tick: number; type: 'on' | 'off' | 'prog' | 'tempo' | 'name' | 'ts'; ch: number; a: number; b2: number; s?: string }
  let maxTick = 0
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
        if (ty === 0x58 && l >= 2) ev.push({ tick, type: 'ts', ch: 0, a: b.getUint8(p), b2: Math.pow(2, b.getUint8(p + 1)) })
        if (ty === 0x51 && l === 3) ev.push({ tick, type: 'tempo', ch: 0, a: (b.getUint8(p) << 16) | (b.getUint8(p + 1) << 8) | b.getUint8(p + 2), b2: 0 })
        if (ty === 0x03 || ty === 0x04) { let s = ''; const bytes = new Uint8Array(buf, p, l); try { s = new TextDecoder().decode(bytes) } catch { /* 이름 없음 */ } ev.push({ tick, type: 'name', ch: 0, a: 0, b2: 0, s: s.trim() }) }
        p += l
      } else if (st === 0xf0 || st === 0xf7) { p += vlq() }
      else {
        run = st; const hi = st & 0xf0, ch = st & 0x0f
        const a = b.getUint8(p++); const b2 = hi === 0xc0 || hi === 0xd0 ? 0 : b.getUint8(p++)
        if (hi === 0x90 && b2 > 0) ev.push({ tick, type: 'on', ch, a, b2 })
        else if (hi === 0x80 || (hi === 0x90 && b2 === 0)) { ev.push({ tick, type: 'off', ch, a, b2 }); maxTick = Math.max(maxTick, tick) }
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
      // 드럼인데 10번 채널이 아닌 경우: 악보에서 타악기 음자리표에 '보통 음'으로 적힌 드럼(사운드슬라이스 등)
      // → MuseScore가 피아노 음으로 내보냄. 이름이 드럼이면 오선 위치를 드럼 소리 번호로 바꿔 드럼으로 연주
      const named = ch !== 9 && DRUM_NAME.test(name)
      parts.push({ name: name || (ch === 9 ? '드럼' : `파트 ${parts.length + 1}`), program: c.prog, drum: ch === 9 || named, notes: named ? c.notes.map(x => ({ ...x, n: staffToDrum(x.n) })) : c.notes })
    }
  }
  // 같은 소리가 두 번 나오는 트랙 빼기 (예: 베이스·기타의 오선보+타브보가 같은 음을 두 번 내보냄)
  const sig = (q: Part) => q.name + '|' + q.notes.length + '|' + q.notes.slice(0, 40).map(x => x.t.toFixed(3) + ':' + x.n).join(',')
  const seenSig = new Set<string>()
  const uniq: Part[] = []
  for (const q of parts) { const k = sig(q); if (seenSig.has(k)) continue; seenSig.add(k); uniq.push(q) }
  parts.length = 0; parts.push(...uniq)

  // 메트로놈 박: 박자표 따라 (6/8·12/8은 점4분음표 한 박), 마디 첫 박은 강하게
  const tss = tracks.flat().filter(e => e.type === 'ts').sort((x, y) => x.tick - y.tick)
  if (!tss.length || tss[0].tick > 0) tss.unshift({ tick: 0, type: 'ts', ch: 0, a: 4, b2: 4 })
  const beats: Beat[] = []
  tss.forEach((ts, k) => {
    const end = k + 1 < tss.length ? tss[k + 1].tick : maxTick
    const num = ts.a || 4, den = ts.b2 || 4
    const compound = den === 8 && num % 3 === 0 && num > 3
    const beatT = div * 4 / den * (compound ? 3 : 1)
    const barT = div * 4 / den * num
    for (let tk = ts.tick; tk < end - 1; tk += beatT) beats.push({ t: toSec(tk), down: Math.abs(((tk - ts.tick) % barT)) < 1 })
  })
  const first = tempos.find(e => e.tick === 0) ?? tempos[0]
  const bpm = first ? Math.round(60e6 / first.a) : 120
  return { parts, duration, beats, bpm }
}

// MuseScore 4가 내보낸 MIDI는 악기 번호가 모두 0(피아노)이라, 파트 이름으로 악기를 짐작
const GUESS: [RegExp, string][] = [
  [/contra|double ?bass|upright|acoustic bass|콘트라|더블/i, 'acoustic_bass'],
  [/fretless|프렛리스/i, 'fretless_bass'], [/slap|슬랩/i, 'slap_bass_1'],
  [/bass|베이스/i, 'electric_bass_finger'],
  [/nylon|classical guitar|클래식 ?기타|나일론/i, 'acoustic_guitar_nylon'],
  [/acoustic guitar|steel|어쿠스틱/i, 'acoustic_guitar_steel'],
  [/distortion|디스토션/i, 'distortion_guitar'], [/overdrive|오버/i, 'overdriven_guitar'],
  [/jazz guitar|재즈 ?기타/i, 'electric_guitar_jazz'],
  [/guitar|gtr|기타/i, 'electric_guitar_clean'],
  [/e\.? ?piano|electric piano|rhodes|wurli|일렉 ?피아노|로즈/i, 'electric_piano_1'],
  [/organ|오르간/i, 'drawbar_organ'],
  [/piano|keyboard|keys|피아노|건반/i, 'acoustic_grand_piano'],
  [/vibra/i, 'vibraphone'], [/marimba|마림바/i, 'marimba'],
  [/tenor sax|테너/i, 'tenor_sax'], [/bari/i, 'baritone_sax'], [/sax|색소폰/i, 'alto_sax'],
  [/trumpet|트럼펫/i, 'trumpet'], [/trombone|트롬본/i, 'trombone'], [/flute|플루트/i, 'flute'], [/clarinet|클라리넷/i, 'clarinet'],
  [/violin|바이올린/i, 'violin'], [/viola|비올라/i, 'viola'], [/cello|첼로/i, 'cello'], [/string|스트링|현악/i, 'string_ensemble_1'],
  [/voice|vocal|vox|soprano|alto|tenor|melody|목소리|보컬|노래|멜로디/i, 'voice_oohs'],
  [/synth|신스/i, 'lead_1_square'],
]
export const guessInst = (name: string, program: number) => program ? GM[program] : (GUESS.find(([re]) => re.test(name))?.[1] ?? GM[0])

// ───────── 악기 샘플 받기 ─────────
type Font = Map<number, AudioBuffer> // 음 번호 → 소리
const fonts = new Map<string, Promise<Font>>()
const NOTE: Record<string, number> = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 }
// 1순위: 우리 Supabase '소리' 폴더 (mp3 묶음 .bin, 1년 캐시)  2순위: 원래 공개 사운드폰트(github.io)
export const SOUNDS_BASE = 'https://stnyjclifmcbxeorcoje.supabase.co/storage/v1/object/public/sounds/v1/'
const backupUrl = (inst: string) => inst === DRUMS
  ? 'https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/percussion-mp3.js'
  : `https://gleitz.github.io/midi-js-soundfonts/MusyngKite/${inst}-mp3.js`

// .bin: "MPSF" + 머리글 길이(4바이트) + 머리글 JSON {notes:[[음번호, 위치, 길이]...]} + mp3들
async function fromPack(inst: string): Promise<[number, ArrayBuffer][]> {
  const r = await fetch(SOUNDS_BASE + inst + '.bin')
  if (!r.ok) throw new Error('pack ' + r.status)
  const buf = await r.arrayBuffer(); const dv = new DataView(buf)
  if (dv.getUint32(0) !== 0x4d505346) throw new Error('pack 형식')
  const hl = dv.getUint32(4, true)
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl))) as { notes: [number, number, number][] }
  const base = 8 + hl
  return head.notes.map(([n, off, len]) => [n, buf.slice(base + off, base + off + len)])
}
async function fromBackup(inst: string): Promise<[number, ArrayBuffer][]> {
  const r = await fetch(backupUrl(inst))
  if (!r.ok) throw new Error('악기 소리를 받지 못했어요 (' + inst + ')')
  const txt = await r.text()
  const out: [number, ArrayBuffer][] = []
  for (const m of txt.matchAll(/"([A-G]b?)(-?\d)"\s*:\s*"data:audio\/[a-z0-9]+;base64,([^"]+)"/g)) {
    const n = (Number(m[2]) + 1) * 12 + NOTE[m[1]]
    const bin = atob(m[3]); const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    out.push([n, bytes.buffer])
  }
  return out
}

// 드럼: MuseScore 드럼 소리(MIT, 변환 서버로 녹음)를 한 파일에 2초 간격으로 35~81번 순서대로 담아 둠 → 잘라서 씀
const KIT_FONTS = new WeakSet<Font>()
const MASTER = 3 // 전체 크기 (예전 0.8)
async function fromKit(ctx: BaseAudioContext): Promise<Font> {
  const r = await fetch(SOUNDS_BASE + 'drumkit_ms.mp3')
  if (!r.ok) throw new Error('kit ' + r.status)
  const all = await ctx.decodeAudioData(await r.arrayBuffer())
  const sr = all.sampleRate, nch = all.numberOfChannels, slot = 2 * sr
  const out: Font = new Map()
  for (let i = 0; i < 47; i++) {
    const a = i * slot, e = Math.min(all.length, a + slot)
    // 소리가 시작되는 곳 찾기 (앞 침묵 빼기)
    let on = -1
    for (let j = a; j < Math.min(e, a + 0.4 * sr) && on < 0; j++) for (let c = 0; c < nch; c++) if (Math.abs(all.getChannelData(c)[j]) > 0.004) { on = j; break }
    if (on < 0) continue
    on = Math.max(a, on - Math.round(0.002 * sr))
    const len = Math.min(e - on, Math.round(1.9 * sr)), fade = Math.round(0.03 * sr)
    const b = ctx.createBuffer(nch, len, sr)
    for (let c = 0; c < nch; c++) {
      const src = all.getChannelData(c).subarray(on, on + len), dst = b.getChannelData(c)
      dst.set(src)
      for (let j = 0; j < fade; j++) dst[len - 1 - j] *= j / fade
    }
    out.set(35 + i, b)
  }
  if (out.size < 20) throw new Error('kit 소리 부족')
  KIT_FONTS.add(out)
  return out
}

export function loadFont(ctx: BaseAudioContext, inst: string): Promise<Font> {
  let f = fonts.get(inst)
  if (!f) {
    f = (async () => {
      if (inst === DRUMS) { const kit = await fromKit(ctx).catch(() => null); if (kit) return kit }
      const raw = await fromPack(inst).catch(() => fromBackup(inst))
      const out: Font = new Map()
      await Promise.all(raw.map(([n, ab]) => ctx.decodeAudioData(ab).then(b => { out.set(n, b) }, () => { /* 한 음 실패는 건너뜀 */ })))
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

type Voice = { src: AudioScheduledSourceNode; g: GainNode; at: number }

// 악기 소리 풀기(decode)는 소리를 내지 않는 장치(OfflineAudioContext)로 함 (2026-11-05)
// → 악보를 열 때 실제 소리 장치를 미리 만들지 않음. 사파리는 누르기 전에 만든 장치가 멈춘 채 남고, 그런 장치가 쌓이면 소리가 안 나는 일이 있었음
// (풀어 둔 소리 AudioBuffer는 어느 장치에서나 씀)
let decoder: BaseAudioContext | null = null
function getDecoder(): BaseAudioContext | null {
  if (decoder) return decoder
  try {
    const O = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext
    decoder = O ? new O(2, 1, 48000) : null
  } catch { decoder = null }
  return decoder
}

export class SamplePlayer extends EventTarget {
  ctx: AudioContext | null = null
  parts: Part[] = []
  tracks: Track[] = []
  duration = 0
  beats: Beat[] = []
  bpm: number | null = null // 악보 원래 빠르기 (첫 템포)
  metro = false // 메트로놈 같이 울리기
  private bIdx = 0
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
  onStuck?: () => void // 소리 장치 시계가 안 감 (이 기기에서 실제 악기 소리가 안 남)

  async loadMidi(url: string, saved?: Record<string, string>) {
    const buf = await (await fetch(url)).arrayBuffer()
    const { parts, duration, beats, bpm } = parseMidi(buf)
    this.parts = parts; this.duration = duration; this.beats = beats; this.bpm = bpm
    // 같은 이름 파트가 여럿이면 번호를 붙여 구분 (예: 리드시트의 '목소리' 멜로디와 코드)
    const seen = new Map<string, number>()
    parts.forEach(p => { const n = (seen.get(p.name) ?? 0) + 1; seen.set(p.name, n); if (n > 1) p.name = `${p.name} ${n}` })
    this.tracks = parts.map(p => {
      const inst = p.drum ? DRUMS : (saved?.[p.name] ?? guessInst(p.name, p.program))
      return { name: p.name, inst, drum: p.drum, mute: false, solo: false, vol: 1, count: p.notes.length }
    })
    this.idx = parts.map(() => 0)
    this.dispatchEvent(new Event('loadedmetadata'))
  }

  private ensureCtx() {
    if (!this.ctx) {
      const C = window.AudioContext || (window as any).webkitAudioContext
      // 아이폰 무음 스위치가 켜져 있어도 소리가 나게 (Safari 16.4+)
      playbackSession()
      // 웹킷은 기본 설정으로 (latencyHint 'playback'을 주면 아이패드에서 시계가 안 가는 일이 의심됨)
      this.ctx = IS_WEBKIT ? new C() : new C({ latencyHint: 'playback' })
      trackAudio(this.ctx, 'score', () => this.dropCtx())
      // 악기 녹음들이 작게 들어 있어서(최대 0.1~0.2) 전체를 크게 키우고,
      // 컴프레서로 고르게 + 마지막 리미터로 소리가 깨지지 않게
      const comp = this.ctx.createDynamicsCompressor()
      comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2
      const limit = this.ctx.createDynamicsCompressor()
      limit.threshold.value = -2; limit.knee.value = 0; limit.ratio.value = 20; limit.attack.value = 0.001; limit.release.value = 0.1
      comp.connect(limit); limit.connect(this.ctx.destination)
      this.master = this.ctx.createGain(); this.master.gain.value = MASTER; this.master.connect(comp)
    }
    const ctx = this.ctx!
    while (this.gains.length < this.tracks.length) { const g = ctx.createGain(); g.connect(this.master!); this.gains.push(g) }
    this.applyGains()
    return ctx
  }

  /** 지금 고른 악기들 받기 (재생 전에 불러 두면 바로 시작) */
  async prepare() {
    const ctx = getDecoder() ?? this.ensureCtx()
    this.onLoading?.(true)
    try {
      this.fontsReady = await Promise.all(this.tracks.map(t => loadFont(ctx, t.inst).catch(() => null)))
      const bad = this.tracks.filter((_, i) => !this.fontsReady[i]).map(t => labelOf(t.inst))
      if (bad.length) logError('sound', new Error('악기 소리 못 받음: ' + bad.join(', ')))
      this.onLoading?.(false, bad.length ? `${bad.join(', ')} 소리를 받지 못했어요` : undefined)
    } catch (e) { this.onLoading?.(false, String(e)) }
  }

  async setInstrument(i: number, inst: string) {
    if (!this.tracks[i]) return
    this.tracks[i] = { ...this.tracks[i], inst }
    const ctx = getDecoder() ?? this.ensureCtx()
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

  // 사파리(2026-11-05 "xml 악보 플레이시키면 소리가 안남"): 페이지를 열 때 미리 만든 소리 장치가
  // 멈춘(suspended·interrupted) 채로 남아 resume()이 끝나지 않는 일이 있음 → 누른 그 순간 새로 만듦
  // (받아 둔 악기 소리(AudioBuffer)는 어느 소리 장치에서나 쓸 수 있어 그대로 씀)
  // 모두 닫기(resetAllAudio) 때: 멈추고 장치 참조만 지움 → 다음 ▶에서 새로 만듦
  private dropCtx() {
    if (!this.paused) { this.pos = Math.max(0, this.currentTime); this.paused = true; clearInterval(this.timer); this.dispatchEvent(new Event('pause')) }
    this.voices.clear()
    this.ctx = null; this.master = null; this.gains = []
  }
  // 멈춘 장치를 버리고 누른 그 순간 새로 만듦 (받아 둔 악기 소리는 그대로)
  private freshCtx() {
    const old = this.ctx
    for (const v of this.voices) { try { v.src.stop() } catch { /* 이미 끝남 */ } }
    this.voices.clear()
    this.ctx = null; this.master = null; this.gains = []
    closeAudio(old)
    return this.ensureCtx()
  }
  private resetTried = false

  async play() {
    playbackSession() // 누를 때마다 (아이폰 무음 스위치·소리 세션은 누른 그 순간에만 바뀜)
    let ctx = this.ensureCtx()
    if (IS_WEBKIT && !audioOk(ctx)) ctx = this.freshCtx() // 멈춰 있거나 시계가 안 가는 장치는 버림
    if (IS_WEBKIT) unlockAudio(ctx) // 누른 그 순간 무음 한 번 → 소리 장치를 실제로 깨움
    if (ctx.state !== 'running') {
      const r = ctx.resume().catch(() => {}) // 누른 그 순간에 부름 (기다리기 전에)
      await Promise.race([r, new Promise(res => setTimeout(res, 1200))])
    }
    if (ctx.state !== 'running') {
      logError('sound-diag', new Error(`ctx not running: state=${ctx.state} sr=${ctx.sampleRate} webkit=${IS_WEBKIT} ${audioReport()}`))
      this.onLoading?.(false, '소리를 켜지 못했어요. ▶를 한 번 더 눌러 주세요. 계속 안 나면 \'기본 소리\'로 바꿔 주세요.')
    }
    if (this.fontsReady.length !== this.tracks.length || this.fontsReady.some((f, i) => !f && this.tracks[i])) await this.prepare()
    if (this.pos >= this.duration - 0.05) this.pos = 0
    this.paused = false
    this.anchorCtx = ctx.currentTime + 0.05; this.anchorPos = this.pos
    this.reschedule()
    this.timer = window.setInterval(() => this.pump(), 25)
    // 소리 시계가 안 가면(소리 장치가 멈춤) 원인 찾기용 기록
    const t0 = ctx.currentTime
    window.setTimeout(() => {
      if (!this.paused && this.ctx === ctx && ctx.currentTime - t0 < 0.3) {
        logError('sound-diag', new Error(`clock stuck${this.resetTried ? ' again' : ''}: state=${ctx.state} t=${ctx.currentTime.toFixed(2)} sr=${ctx.sampleRate} webkit=${IS_WEBKIT} fonts=${this.fontsReady.map(f => f?.size ?? 0).join('/')} ${audioReport()}`))
        this.pause()
        if (!this.resetTried) {
          // 1번째: 앱의 모든 소리 장치를 닫아 출력을 새로 열게 하고 한 번 더 누르게 함
          this.resetTried = true
          resetAllAudio()
          this.onLoading?.(false, '소리 장치를 다시 준비했어요. ▶를 한 번 더 눌러 주세요.')
          this.dispatchEvent(new Event('pause'))
        } else this.onStuck?.() // 2번째: 화면이 '기본 소리'로 바꿔 줌
      }
    }, 1500)
  }
  pause() {
    if (this.paused) return
    this.pos = Math.max(0, this.currentTime)
    this.paused = true
    clearInterval(this.timer)
    this.stopVoices(0)
  }
  destroy() { this.pause(); closeAudio(this.ctx); this.ctx = null; this.master = null; this.gains = [] }

  // 자리 이동이면 울리는 소리를 모두 끊고, 빠르기·악기 변경이면 아직 안 울린 예약만 다시
  private reschedule(cutAll = true) {
    this.stopVoices(0.03, !cutAll)
    const at = this.anchorPos
    this.idx = this.parts.map(p => { let lo = 0, hi = p.notes.length; while (lo < hi) { const m = (lo + hi) >> 1; if (p.notes[m].t < at - 0.005) lo = m + 1; else hi = m } return lo })
    { let lo = 0, hi = this.beats.length; while (lo < hi) { const m = (lo + hi) >> 1; if (this.beats[m].t < at - 0.005) lo = m + 1; else hi = m } this.bIdx = lo }
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
    while (this.bIdx < this.beats.length && this.beats[this.bIdx].t < until) {
      const bt = this.beats[this.bIdx++]
      if (!this.metro) continue
      const when = this.anchorCtx + (bt.t - this.anchorPos) / this.rate
      if (when >= ctx.currentTime - 0.02) this.click(Math.max(ctx.currentTime, when), bt.down)
    }
    if (this.currentTime >= this.duration) { this.pause(); this.pos = this.duration; this.dispatchEvent(new Event('ended')) }
  }
  setMetro(on: boolean) {
    this.metro = on
    if (!this.paused && this.ctx) { this.anchorPos = this.currentTime; this.anchorCtx = this.ctx.currentTime; this.reschedule(false) }
  }
  // 메트로놈 딸깍 (첫 박은 높고 크게)
  private click(when: number, down: boolean) {
    const ctx = this.ctx!; if (!this.master) return
    const o = ctx.createOscillator(); const g = ctx.createGain()
    o.type = 'square'; o.frequency.value = down ? 1760 : 1175
    const v = (down ? 0.35 : 0.22) * 1.4 / MASTER // 음악을 키운 만큼 딸깍은 조금만 키움 (묻히지 않을 정도)
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(v, when + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05)
    o.connect(g); g.connect(this.master)
    o.start(when); o.stop(when + 0.06)
    const voice: Voice = { src: o, g, at: when }
    this.voices.add(voice); o.onended = () => { this.voices.delete(voice); try { g.disconnect() } catch { /* 무시 */ } }
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
    // 세게/여리게가 귀에 자연스럽게. 드럼 소리 묶음은 하이햇·심벌 녹음이 아주 작아서 그만큼 키움
    const vel = (0.15 + 0.85 * nt.v * nt.v) * (drum && !KIT_FONTS.has(font) ? DRUM_GAIN[nt.n] ?? 1 : 1)
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
