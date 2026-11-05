// 전자드럼으로 친 MIDI → 표준(GM) 드럼 음 번호로 맞추기 (원장님 2026-11-05 "음번호 맞추기는 하자")
// - 전자드럼은 하이햇·심벌 가장자리, 림을 표준에 없거나 다른 악기인 번호로 보냄
//   (예: 하이햇 가장자리 22·26 = 표준에 없음, 크래시 가장자리 55 = 표준에선 스플래시, 탐3 림 58 = 비브라슬랩)
//   → 그대로 올리면 악보에 엉뚱한 음표가 생기고 소리도 틀림
// - 롤랜드 TD-17·TD-27 기본 음 번호 기준 (support.roland.com 'Default MIDI Note Map')
// - 파일을 새로 짜지 않고 음 번호·채널 바이트만 그 자리에서 바꿈 → 박·세기·길이·빠르기는 그대로
// - 코치는 DAW에서 박 맞추기(퀀타이즈) → MIDI로 내보내기 → 모두플레이에 올리기

export const DRUM_CH = 9 // MIDI 10번 채널

// 롤랜드 기본 번호 → 표준 번호, 화면에 보일 이름
export const ROLAND_GM: Record<number, [number, string]> = {
  22: [42, '하이햇 닫힘 가장자리'],
  26: [46, '하이햇 열림 가장자리'],
  40: [38, '스네어 림'],
  50: [48, '탐1 림'],
  47: [45, '탐2 림'],
  58: [43, '탐3 림'],
  55: [49, '크래시1 가장자리'],
  52: [57, '크래시2 가장자리'],
  59: [51, '라이드 가장자리'],
}
// 표준에 없는 번호인데 롤랜드에서만 나오는 것: 있으면 롤랜드 전자드럼으로 친 것
const ROLAND_ONLY = [22, 26]
// 보조 패드(AUX, 27~32): 무엇을 연결했는지 몰라서 그대로 둠
const AUX = (n: number) => n >= 27 && n <= 32
const GM_OK = (n: number) => n >= 35 && n <= 81

export type MidiScan = {
  byCh: Map<number, Map<number, number>> // 채널 → 음 번호 → 친 횟수
  total: number
}

// 표준 MIDI 파일을 처음부터 끝까지 읽으며 음 메시지(노트 온·오프·애프터터치)마다
// onNote(상태 바이트 위치, 음 번호 바이트 위치, 상태, 음 번호, 세기)
// 이어 쓰기 상태(running status)면 상태 바이트 위치 = 앞 메시지의 상태 바이트 위치
function walk(buf: ArrayBuffer, onNote: (statusPos: number, notePos: number, st: number, note: number, vel: number) => void) {
  const b = new DataView(buf); let p = 0
  const u32 = () => { const v = b.getUint32(p); p += 4; return v }
  const vlq = () => { let v = 0, c; do { c = b.getUint8(p++); v = (v << 7) | (c & 0x7f) } while (c & 0x80); return v }
  if (buf.byteLength < 14 || u32() !== 0x4d546864) throw new Error('MIDI 파일이 아니에요')
  const hl = u32(); const ntr = b.getUint16(10); p = 8 + hl
  for (let k = 0; k < ntr && p + 8 <= buf.byteLength; k++) {
    const id = u32(), len = u32(), end = Math.min(buf.byteLength, p + len)
    if (id !== 0x4d54726b) { p = end; continue }
    let run = 0, runPos = -1
    while (p < end) {
      vlq()
      let st = b.getUint8(p), sp = p
      if (st < 0x80) { st = run; sp = runPos } else p++
      if (st === 0xff) { p++; const l = vlq(); p += l; continue } // 메타
      if (st === 0xf0 || st === 0xf7) { const l = vlq(); p += l; continue } // 시스템 익스클루시브
      if (st < 0x80) throw new Error('MIDI 파일을 읽지 못했어요')
      run = st; runPos = sp
      const hi = st & 0xf0
      const ap = p, a = b.getUint8(p++)
      const b2 = hi === 0xc0 || hi === 0xd0 ? 0 : b.getUint8(p++)
      if (hi === 0x80 || hi === 0x90 || hi === 0xa0) onNote(sp, ap, st, a, hi === 0x90 ? b2 : 0)
    }
    p = end
  }
}

export function scanMidi(buf: ArrayBuffer): MidiScan {
  const byCh = new Map<number, Map<number, number>>(); let total = 0
  walk(buf, (_sp, _ap, st, note, vel) => {
    if ((st & 0xf0) !== 0x90 || vel === 0) return
    const ch = st & 0x0f
    let m = byCh.get(ch); if (!m) byCh.set(ch, m = new Map())
    m.set(note, (m.get(note) ?? 0) + 1); total++
  })
  return { byCh, total }
}

const has = (m: Map<number, number> | undefined, ns: number[]) => !!m && ns.some(n => m.has(n))

// 롤랜드 전자드럼으로 친 드럼 MIDI로 보이는지
// - 10번 채널에 22·26(하이햇 가장자리)이 있으면 확실
// - 10번 채널이 비었는데 다른 채널 하나에만 음이 있고, 그 안에 22·26이 있으면 (DAW가 1번 채널로 내보낸 경우)
export function looksRoland(s: MidiScan): boolean {
  if (has(s.byCh.get(DRUM_CH), ROLAND_ONLY)) return true
  if (s.byCh.get(DRUM_CH)?.size) return false
  const chs = [...s.byCh.entries()].filter(([, m]) => m.size)
  return chs.length === 1 && has(chs[0][1], ROLAND_ONLY) && [...chs[0][1].keys()].every(n => n >= 22 && n <= 81)
}

export const hasDrumCh = (s: MidiScan) => !!s.byCh.get(DRUM_CH)?.size

export type DrumFix = {
  out: ArrayBuffer
  moved: number // 10번 채널로 옮긴 음 개수
  changed: { name: string; to: number; count: number }[] // 바꾼 음 (롤랜드 이름별)
  aux: number // 그대로 둔 보조 패드 음
  odd: { note: number; count: number }[] // 바꾼 뒤에도 표준 드럼 번호(35~81)가 아닌 음
}

// 드럼 MIDI로 맞추기: 롤랜드 번호를 표준 번호로
// - 10번 채널에 드럼이 있으면 10번 채널만 고침 (다른 악기 채널은 그대로)
// - 10번 채널이 비었으면 (DAW가 1번 채널 등으로 내보낸 경우) 모든 음을 10번 채널로 옮긴 뒤 고침
export function fixDrumMidi(buf: ArrayBuffer, moveAll = !hasDrumCh(scanMidi(buf))): DrumFix {
  const out = buf.slice(0)
  const v = new DataView(out)
  let moved = 0, aux = 0
  const changed = new Map<number, number>(), odd = new Map<number, number>()
  const touchedStatus = new Set<number>()
  walk(out, (sp, ap, st, note, vel) => {
    const on = (st & 0xf0) === 0x90 && vel > 0
    if ((st & 0x0f) !== DRUM_CH) {
      if (!moveAll) return
      // 상태 바이트 하나를 이어 쓰는 메시지들이 같이 씀 → 한 번만 바꾸고, 그 뒤 메시지는 이미 10번
      if (!touchedStatus.has(sp)) { v.setUint8(sp, (st & 0xf0) | DRUM_CH); touchedStatus.add(sp) }
      if (on) moved++
    }
    const m = ROLAND_GM[note]
    if (m) { v.setUint8(ap, m[0]); if (on) changed.set(note, (changed.get(note) ?? 0) + 1) }
    else if (on && AUX(note)) aux++
    else if (on && !GM_OK(note)) odd.set(note, (odd.get(note) ?? 0) + 1)
  })
  return {
    out, moved, aux,
    changed: [...changed.entries()].map(([n, count]) => ({ name: ROLAND_GM[n][1], to: ROLAND_GM[n][0], count })),
    odd: [...odd.entries()].map(([note, count]) => ({ note, count })),
  }
}

const GM_NAME: Record<number, string> = { 38: '스네어', 42: '하이햇', 43: '탐3', 45: '탐2', 46: '열린 하이햇', 48: '탐1', 49: '크래시1', 51: '라이드', 57: '크래시2' }

// 화면에 보일 한 줄: "하이햇 닫힘 가장자리 32개 → 하이햇, 크래시1 가장자리 4개 → 크래시1"
export function fixSummary(f: DrumFix): string {
  const parts = f.changed.sort((a, b) => b.count - a.count).map(c => `${c.name} ${c.count}개 → ${GM_NAME[c.to] ?? c.to + '번'}`)
  if (f.moved) parts.push(`드럼 채널(10번)로 옮김 ${f.moved}개`)
  return parts.join(', ')
}

export const isMidiName = (name: string) => /\.(mid|midi)$/i.test(name)
