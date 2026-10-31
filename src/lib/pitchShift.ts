// 내 음원의 키를 반음 단위로 바꿉니다. 빠르기는 그대로입니다.
// 브라우저 안에서만 계산하고, 파일은 서버로 보내지 않습니다.
import { SoundTouch } from '@soundtouchjs/core' // MPL-2.0, https://github.com/cutterbl/SoundTouchJS

const CHUNK = 8192

/** 스테레오 PCM(좌·우 Float32Array)을 받아 키를 바꾼 PCM을 돌려줍니다. */
export async function shiftPcm(
  left: Float32Array, right: Float32Array, sampleRate: number, semitones: number,
  onProgress?: (p: number) => void,
): Promise<[Float32Array, Float32Array]> {
  const n = left.length
  if (!semitones) return [left, right]
  const st = new SoundTouch({ sampleRate })
  st.pitchSemitones = semitones
  const outL = new Float32Array(n)
  const outR = new Float32Array(n)
  const inter = new Float32Array(CHUNK * 2)
  const recv = new Float32Array(CHUNK * 2)
  let written = 0
  const drain = () => {
    const ob = st.outputBuffer
    while (ob.frameCount > 0 && written < n) {
      const k = Math.min(ob.frameCount, CHUNK, n - written)
      ob.extract(recv, 0, k)
      ob.receive(k)
      for (let i = 0; i < k; i++) { outL[written + i] = recv[i * 2]; outR[written + i] = recv[i * 2 + 1] }
      written += k
    }
    if (written >= n) ob.receive()
  }
  // 끝부분이 잘리지 않도록 무음을 조금 덧붙여 밀어냅니다
  const pad = Math.ceil(sampleRate * 0.5)
  const total = n + pad
  let lastYield = performance.now()
  for (let pos = 0; pos < total && written < n; pos += CHUNK) {
    const k = Math.min(CHUNK, total - pos)
    for (let i = 0; i < k; i++) {
      const j = pos + i
      inter[i * 2] = j < n ? left[j] : 0
      inter[i * 2 + 1] = j < n ? right[j] : 0
    }
    st.inputBuffer.putSamples(inter, 0, k)
    st.process()
    drain()
    if (performance.now() - lastYield > 40) {
      onProgress?.(Math.min(1, pos / total))
      await new Promise(r => setTimeout(r, 0))
      lastYield = performance.now()
    }
  }
  onProgress?.(1)
  return [outL, outR]
}

/** PCM을 WAV 파일(Blob)로 만듭니다. audio 요소에서 바로 재생할 수 있어요. */
export function toWav(left: Float32Array, right: Float32Array, sampleRate: number): Blob {
  const n = left.length
  const buf = new ArrayBuffer(44 + n * 4)
  const v = new DataView(buf)
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); w(8, 'WAVE')
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true)
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true)
  w(36, 'data'); v.setUint32(40, n * 4, true)
  let o = 44
  for (let i = 0; i < n; i++) {
    const a = Math.max(-1, Math.min(1, left[i])), b = Math.max(-1, Math.min(1, right[i]))
    v.setInt16(o, a < 0 ? a * 0x8000 : a * 0x7fff, true)
    v.setInt16(o + 2, b < 0 ? b * 0x8000 : b * 0x7fff, true)
    o += 4
  }
  return new Blob([buf], { type: 'audio/wav' })
}
