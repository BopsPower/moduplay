import { useEffect, useRef, useState } from 'react'
import Shell from '../components/Shell'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { IS_WEBKIT, audioReport, playbackSession, resetAllAudio, unlockAudio } from '../lib/iosAudio'
import { loadFont } from '../lib/sampler'

// 소리 점검 (2026-11-05 "PDF 보다가 왔다갔다 하다 보면 갑자기 소리가 안 남, 특히 아이패드")
// 소리가 안 날 때 이 화면에서 단추를 하나씩 눌러 보면, 어떤 방식은 되고 어떤 방식은 안 되는지 기기에서 바로 알 수 있음.
// 결과는 [결과 보내기]로 client_errors(kind 'soundcheck')에 남김 → 관리자가 원인 찾기
// 단추마다 '누른 그 순간'에 소리 장치를 만들고 켬 (사파리 규칙). 한 단추에 시험 하나

type Row = { id: string; name: string; ok: boolean | null; info: string; heard?: boolean }
const AC = () => (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

function beep(ctx: AudioContext, f = 660, dur = 0.35) {
  const o = ctx.createOscillator(), g = ctx.createGain()
  const t = ctx.currentTime + 0.03
  o.frequency.value = f
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  o.connect(g); g.connect(ctx.destination); o.start(t); o.stop(t + dur + 0.05)
}
async function clock(ctx: AudioContext) {
  const t0 = ctx.currentTime, w0 = performance.now()
  await sleep(900)
  const adv = ctx.currentTime - t0, wall = (performance.now() - w0) / 1000
  return { ok: adv > 0.5, info: `시계 ${adv.toFixed(2)}초/${wall.toFixed(2)}초 · ${ctx.state} · ${ctx.sampleRate}Hz` }
}
// 1초짜리 '삐' 소리 wav (기본 소리 시험용, 서버 없이)
function beepWav() {
  const sr = 22050, n = sr, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf)
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * 520 * i / sr) * 6000 * Math.min(1, (n - i) / 2000)), true)
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
}

export default function SoundCheck() {
  const { session } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [report, setReport] = useState(() => audioReport())
  const [sent, setSent] = useState('')
  const pre = useRef<AudioContext | null>(null) // 이 화면을 열 때 미리 만든 장치 (누르기 전)
  const piano = useRef<Map<number, AudioBuffer> | null>(null)
  const wav = useRef<string>('')

  useEffect(() => {
    try { pre.current = new (AC())() } catch { pre.current = null }
    wav.current = beepWav()
    try {
      const O = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext
      loadFont(new O(2, 1, 48000), 'acoustic_grand_piano').then(f => { piano.current = f }).catch(() => {})
    } catch { /* 피아노 시험만 못 함 */ }
    const t = window.setInterval(() => setReport(audioReport()), 1500)
    return () => { clearInterval(t); pre.current?.close().catch(() => {}); URL.revokeObjectURL(wav.current) }
  }, [])

  const put = (r: Row) => setRows(rs => [...rs.filter(x => x.id !== r.id), r])
  const run = (id: string, name: string, start: () => Promise<{ ok: boolean; info: string }>) => {
    put({ id, name, ok: null, info: '시험 중…' })
    start().then(res => put({ id, name, ...res }), e => put({ id, name, ok: false, info: '오류: ' + String((e as Error)?.name ?? '') + ' ' + String((e as Error)?.message ?? e) }))
  }

  const tests: { id: string; name: string; help: string; go: () => Promise<{ ok: boolean; info: string }> }[] = [
    { id: 'new', name: '① 새 소리 장치', help: '누를 때 새로 만들고 무음으로 깨움 (앱이 지금 쓰는 방식)', go: async () => {
      playbackSession(); const c = new (AC())(); unlockAudio(c); beep(c); const r = await clock(c); c.close().catch(() => {}); return r } },
    { id: 'pre', name: '② 미리 만든 장치', help: '이 화면을 열 때 만들어 둔 장치를 누를 때 켬 (예전 방식)', go: async () => {
      playbackSession(); const c = pre.current; if (!c) return { ok: false, info: '장치 없음' }; c.resume().catch(() => {}); beep(c, 520); return clock(c) } },
    { id: 'nounlock', name: '③ 깨우기 없이 새 장치', help: '무음으로 깨우지 않고 resume만', go: async () => {
      playbackSession(); const c = new (AC())(); c.resume().catch(() => {}); beep(c, 780); const r = await clock(c); c.close().catch(() => {}); return r } },
    { id: 'latency', name: "④ 'playback' 설정 장치", help: "latencyHint 'playback'으로 만든 장치", go: async () => {
      playbackSession(); let c: AudioContext; try { c = new (AC())({ latencyHint: 'playback' }) } catch (e) { return { ok: false, info: '만들기 실패 ' + String(e) } }
      unlockAudio(c); beep(c, 880); const r = await clock(c); c.close().catch(() => {}); return r } },
    { id: 'piano', name: '⑤ 실제 악기(피아노)', help: '악보의 실제 악기 소리와 같은 방식으로 도·미·솔', go: async () => {
      playbackSession(); const f = piano.current; if (!f) return { ok: false, info: '피아노 소리를 아직 못 받음 (잠시 뒤 다시)' }
      const c = new (AC())(); unlockAudio(c)
      ;[60, 64, 67].forEach((n, i) => { const b = f.get(n); if (!b) return; const s = c.createBufferSource(); s.buffer = b; const g = c.createGain(); g.gain.value = 0.8; s.connect(g); g.connect(c.destination); s.start(c.currentTime + 0.05 + i * 0.12); s.stop(c.currentTime + 1.2) })
      const r = await clock(c); window.setTimeout(() => c.close().catch(() => {}), 800); return r } },
    { id: 'audio', name: '⑥ 기본 소리(<audio>)', help: "악보의 '기본 소리'와 같은 방식", go: async () => {
      const a = new Audio(wav.current); a.setAttribute('playsinline', '')
      await a.play()
      await sleep(900); const ok = a.currentTime > 0.5; const info = `재생 위치 ${a.currentTime.toFixed(2)}초`; a.pause(); return { ok, info } } },
  ]

  async function send() {
    setSent('보내는 중…')
    const msg = JSON.stringify({ rows: rows.map(r => ({ t: r.name, ok: r.ok, i: r.info, heard: r.heard })), report: audioReport(), webkit: IS_WEBKIT })
    const { error } = await supabase.from('client_errors').insert({
      user_id: session?.user.id ?? null, build: typeof __BUILD__ !== 'undefined' ? __BUILD__ : 'dev', kind: 'soundcheck',
      url: '/soundcheck', message: msg.slice(0, 1000), ua: navigator.userAgent.slice(0, 300),
    })
    setSent(error ? '보내지 못했어요: ' + error.message : '보냈어요. 고맙습니다!')
  }

  return (
    <Shell>
      <h1 className="title">소리 점검</h1>
      <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          소리가 갑자기 안 날 때, <b>새로고침하지 말고</b> 이 화면에서 단추를 위에서부터 하나씩 눌러 주세요.
          누를 때마다 짧은 소리가 나요. 소리가 들렸는지도 눌러 주신 뒤 <b>[결과 보내기]</b>를 눌러 주세요.
        </p>
        {tests.map(t => {
          const r = rows.find(x => x.id === t.id)
          return (
            <div key={t.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <button type="button" className="btn primary" onClick={() => run(t.id, t.name, t.go)}>{t.name}</button>
                <span className="muted" style={{ fontSize: 13 }}>{t.help}</span>
              </div>
              {r && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 14 }}>
                  <b>{r.ok == null ? '…' : r.ok ? '✅ 시계 가요' : '❌ 시계 멈춤'}</b>
                  <span className="muted">{r.info}</span>
                  {r.ok != null && (
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <button type="button" className={'chip' + (r.heard === true ? ' on' : '')} onClick={() => put({ ...r, heard: true })}>👂 들렸어요</button>
                      <button type="button" className={'chip' + (r.heard === false ? ' on' : '')} onClick={() => put({ ...r, heard: false })}>안 들렸어요</button>
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn" disabled={!rows.length} onClick={send}>결과 보내기</button>
          <button type="button" className="btn ghost" onClick={() => { resetAllAudio(); setReport(audioReport()) }}>앱 소리 장치 모두 다시 준비</button>
          {sent && <span className="muted" style={{ fontSize: 13 }}>{sent}</span>}
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 12, wordBreak: 'break-all' }}>앱이 쓰는 소리 장치: {report}</p>
      </div>
    </Shell>
  )
}
