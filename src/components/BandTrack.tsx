import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BandPlayer, PRESETS, STYLES, chordName, guessKey, keyName, parseChart, slotAt, styleOf, useFlats, type Mix, type Pos, type Settings, type StyleId } from '../lib/bandTrack'
import { DRUMS, loadFont } from '../lib/sampler'
import { IS_WEBKIT, audioOk, audioReport, closeAudio, playbackSession, resetAllAudio, trackAudio, unlockAudio } from '../lib/iosAudio'
import { usePracticeActive } from '../lib/practice'
import { useTools } from '../lib/tools'
import { logError } from '../lib/errorLog'

// 연습 플레이어 > 백킹트랙: 코드 진행을 고르거나 적으면 드럼·베이스·피아노가 같이 연주
// - 맨 위 막대(스크롤해도 붙어 있음): ▶ · 지금 코드(크게) · 다음 코드 · 빠르기
// - 키·빠르기·스윙·악기 끄기 / 코치는 지금 설정 그대로 학생에게 링크로 보내기
// - 마지막 설정은 이 기기에 기억 (mp_bt)

type Saved = { text: string; preset: string | null; style: StyleId; bpm: number; swing: number; shift: number; mix: Mix; countIn: boolean }
const DEF: Saved = { text: PRESETS[0].text, preset: PRESETS[0].id, style: PRESETS[0].style, bpm: PRESETS[0].bpm, swing: 0, shift: 0, mix: { drums: 1, bass: 1, keys: 1 }, countIn: true }
const loadSaved = (): Saved => { try { const v = JSON.parse(localStorage.getItem('mp_bt') ?? 'null'); return v && typeof v.text === 'string' ? { ...DEF, ...v, mix: { ...DEF.mix, ...v.mix } } : DEF } catch { return DEF } }
const SWINGS: [number, string][] = [[0, '똑바로'], [0.33, '약하게'], [0.66, '중간'], [1, '강하게']]
const swingOf = (s: StyleId) => (s === 'swing' ? 1 : 0)
const PARTS: [keyof Mix, string, string][] = [['drums', '🥁', '드럼'], ['bass', '🎸', '베이스'], ['keys', '🎹', '피아노']]

const PlayIcon = () => <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
const StopIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>

export default function BandTrack({ coach }: { coach?: boolean }) {
  const tools = useTools()
  const [sp, setSp] = useSearchParams()
  const [s, setS] = useState<Saved>(loadSaved)
  const [got, setGot] = useState(false) // 받은 링크로 열었는지
  const [playing, setPlaying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [warn, setWarn] = useState('')
  const [sent, setSent] = useState('')
  const [pos, setPos] = useState<Pos | null>(null)
  // 언제나 가장 최근 설정에서 바꿈 (빠르게 여러 번 눌러도 앞에 누른 게 사라지지 않게)
  const sRef = useRef(s)
  const up = (ch: Partial<Saved>) => { const n = { ...sRef.current, ...ch }; sRef.current = n; setS(n); try { localStorage.setItem('mp_bt', JSON.stringify(n)) } catch { /* 무시 */ } }

  // 받은 링크: ?tab=bt&bt=코드&st=pop&bpm=100&k=2&sw=0.5
  useEffect(() => {
    const t = sp.get('bt')
    if (!t) return
    const st = STYLES.some(x => x.id === sp.get('st')) ? sp.get('st') as StyleId : 'pop'
    const n = (k: string, d: number, lo: number, hi: number) => { const v = Number(sp.get(k)); return Number.isFinite(v) && sp.get(k) !== null ? Math.max(lo, Math.min(hi, v)) : d }
    const preset = PRESETS.find(p => p.text === t)?.id ?? null
    up({ text: t.slice(0, 400), preset, style: st, bpm: Math.round(n('bpm', styleOf(st).bpm, 40, 240)), shift: Math.round(n('k', 0, -11, 11)), swing: n('sw', swingOf(st), 0, 1) })
    setGot(true)
    const q = new URLSearchParams(sp); ['bt', 'st', 'bpm', 'k', 'sw'].forEach(k => q.delete(k)); setSp(q, { replace: true })
  }, [])

  const chart = useMemo(() => parseChart(s.text), [s.text])
  const style = styleOf(s.style)
  // 키 이름: 정해 둔 진행은 그 키, 직접 적은 건 코드들로 짐작
  const preset = PRESETS.find(p => p.id === s.preset && p.text === s.text)
  const gk = useMemo(() => preset?.key ?? guessKey(chart.bars), [chart, preset])
  const home = gk.key, keyMinor = gk.minor
  const flats = useFlats((home + s.shift + 120) % 12, keyMinor)
  const name = (c: Parameters<typeof chordName>[0]) => chordName(c, s.shift, flats)
  const keyLabel = keyName(home + s.shift, flats) + (keyMinor ? ' 마이너' : '')
  const origLabel = keyName(home, useFlats(home, keyMinor)) + (keyMinor ? ' 마이너' : '')

  // 엔진에 넘길 지금 설정 (재생 중에도 바로 읽음)
  const setRef = useRef<Settings>({ bars: chart.bars, style: s.style, bpm: s.bpm, swing: s.swing, shift: s.shift })
  setRef.current = { bars: chart.bars, style: s.style, bpm: s.bpm, swing: s.swing, shift: s.shift }
  const ctxRef = useRef<AudioContext | null>(null)
  const bpRef = useRef<BandPlayer | null>(null)

  // 이 리듬에 쓰는 악기 소리 받기 (처음 한 번은 몇 초)
  async function fontsFor(st: StyleId) {
    const ctx = ctxRef.current!
    const sy = styleOf(st)
    const [keys, bass, kit] = await Promise.all([sy.keys, sy.bass, DRUMS].map(i => loadFont(ctx, i).catch(e => { logError('sound', e); return null })))
    const miss = [!keys && sy.keysName, !bass && sy.bassName].filter(Boolean)
    setWarn(miss.length ? `${miss.join('·')} 소리를 받지 못해 간단한 소리로 대신 울려요. 인터넷을 확인하고 다시 눌러 보세요.` : '')
    return { keys, bass, kit }
  }
  useEffect(() => { // 재생 중에 리듬을 바꾸면 그 리듬 악기도 받아 둠
    if (!playing || !bpRef.current) return
    let off = false
    fontsFor(s.style).then(f => { if (!off && bpRef.current) bpRef.current.fonts = f })
    return () => { off = true }
  }, [s.style, playing])

  async function play() {
    if (playing) return stop()
    if (!chart.bars.length) return
    playbackSession()
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    // 사파리·아이패드: 쉬는 동안 멈춘(시계가 안 가는) 장치는 버리고 누른 그 순간 새로 만듦
    if (ctxRef.current && IS_WEBKIT && !audioOk(ctxRef.current)) { bpRef.current?.stop(); bpRef.current = null; closeAudio(ctxRef.current); ctxRef.current = null }
    if (!ctxRef.current) {
      const c = IS_WEBKIT ? new AC() : new AC({ latencyHint: 'playback' })
      ctxRef.current = c
      trackAudio(c, 'band', () => { bpRef.current?.stop(); bpRef.current = null; ctxRef.current = null; setPlaying(false); setPos(null) })
    }
    const ctx = ctxRef.current
    if (IS_WEBKIT) unlockAudio(ctx); else ctx.resume().catch(() => {})
    // 메트로놈·드럼 루프·기준음은 끔 (박·화음이 겹치지 않게)
    if (tools.metroOn) tools.toggleMetro()
    if (tools.grooveOn) tools.toggleGroove()
    if (tools.droneOn) tools.toggleDrone()
    setLoading(true)
    try {
      const f = await fontsFor(sRef.current.style)
      if (!bpRef.current) bpRef.current = new BandPlayer(ctx, () => setRef.current, sRef.current.mix)
      bpRef.current.setMix(sRef.current.mix)
      bpRef.current.fonts = f
      if (ctx.state !== 'running') await ctx.resume().catch(() => {})
      bpRef.current.start(sRef.current.countIn)
      setPlaying(true)
      // 1.5초 동안 시계가 안 가면: 앱의 모든 소리 장치를 닫고 한 번 더 누르게 함
      const t0 = ctx.currentTime
      window.setTimeout(() => {
        if (ctxRef.current !== ctx || ctx.currentTime - t0 >= 0.3) return
        logError('sound-diag', new Error(`band clock stuck: ${audioReport()}`))
        resetAllAudio()
        setWarn('소리가 멈춰서 다시 준비했어요. ▶를 한 번 더 눌러 주세요.')
      }, 1500)
    } catch (e) { logError('band', e); setWarn('재생을 시작하지 못했어요. 다시 눌러 주세요.') }
    setLoading(false)
  }
  function stop() { bpRef.current?.stop(); setPlaying(false); setPos(null) }
  useEffect(() => () => { bpRef.current?.stop(); closeAudio(ctxRef.current); ctxRef.current = null }, [])
  usePracticeActive('band', playing)

  // 지금 울리는 자리 → 화면 (마디·박)
  useEffect(() => {
    if (!playing) return
    let raf = 0, last = ''
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const p = bpRef.current?.position() ?? null
      const k = p ? `${p.count}.${p.bar}.${p.beat}` : ''
      if (k !== last) { last = k; setPos(p) }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const setMix = (ch: Partial<Mix>) => { const m = { ...sRef.current.mix, ...ch }; up({ mix: m }); bpRef.current?.setMix(m) }
  const pickPreset = (id: string) => { const p = PRESETS.find(x => x.id === id)!; up({ text: p.text, preset: p.id, style: p.style, bpm: p.bpm, swing: swingOf(p.style) }) }
  const pickStyle = (id: StyleId) => up({ style: id, swing: swingOf(id), bpm: sRef.current.style === id ? sRef.current.bpm : styleOf(id).bpm })
  const bpm = (v: number) => up({ bpm: Math.max(40, Math.min(240, Math.round(v))) })
  const bpmBy = (d: number) => bpm(sRef.current.bpm + d)
  const shift = (d: number) => { let v = sRef.current.shift + d; if (v > 6) v -= 12; if (v < -6) v += 12; up({ shift: v }) }

  // 지금 코드 · 다음 코드
  const bars = chart.bars
  const cb = pos && !pos.count ? pos.bar % Math.max(1, bars.length) : 0
  const curSlot = slotAt(bars[cb], pos && !pos.count ? pos.beat : 0)
  const nextSlot = (() => {
    const b = bars[cb]; if (!b || !curSlot) return null
    const k = b.indexOf(curSlot)
    return b[k + 1] ?? bars[(cb + 1) % bars.length]?.[0] ?? null
  })()
  async function share() {
    const q = new URLSearchParams({ tab: 'bt', bt: s.text, st: s.style, bpm: String(s.bpm) })
    if (s.shift) q.set('k', String(s.shift))
    if (Math.abs(s.swing - swingOf(s.style)) > 0.01) q.set('sw', s.swing.toFixed(2))
    const link = `${location.origin}/player?${q}`
    const sum = bars.slice(0, 8).map(b => b.map(x => name(x.c)).join(' ')).join(' | ') + (bars.length > 8 ? ' …' : '')
    const text = `🎹 백킹트랙: ${preset ? preset.name + ' · ' : ''}${style.name} · 키 ${keyLabel} · ♩${s.bpm}\n${sum}\n모두플레이 연습 플레이어에서 ▶만 누르면 같이 연주돼요`
    try { if (navigator.share) { await navigator.share({ title: '모두플레이 백킹트랙', text, url: link }); return } } catch (x) { if ((x as Error).name === 'AbortError') return }
    try { await navigator.clipboard.writeText(`${text}\n${link}`); setSent('링크를 복사했어요. 카톡에 붙여 넣어 보내 주세요.') } catch { setSent(link) }
  }

  const groups = [...new Set(PRESETS.map(p => p.group))]
  const swingPick = SWINGS.reduce((b, x) => Math.abs(x[0] - s.swing) < Math.abs(b[0] - s.swing) ? x : b)[0]

  return (
    <section className="sec bt" style={{ maxWidth: 720 }}>
      {got && <p className="bt-got">📨 받은 백킹트랙을 열었어요. ▶를 누르면 시작해요.</p>}

      {/* 맨 위: 재생 · 지금 코드 · 빠르기 */}
      <div className={'bk-trans bt-trans' + (playing ? ' on' : '')}>
        <button type="button" className="bk-play" onClick={play} disabled={loading || !bars.length} aria-label={playing ? '백킹트랙 멈춤' : '백킹트랙 시작'}>{playing ? <StopIcon /> : <PlayIcon />}</button>
        <div className="bt-now" aria-live="polite">
          {loading ? <small>악기 소리 받는 중…</small>
            : pos?.count ? <><b className="bt-count">{['하나', '둘', '셋', '넷'][pos.beat] ?? ''}</b><small>카운트 · 다음 {bars[0]?.[0] ? name(bars[0][0].c) : ''}</small></>
              : <><b>{curSlot ? name(curSlot.c) : '—'}</b><small>{playing ? (nextSlot ? `다음 ${name(nextSlot.c)}` : '') : bars.length ? `${style.name} · 키 ${keyLabel}` : '코드를 적어 주세요'}</small></>}
        </div>
        <div className="bk-tempo">
          <button type="button" aria-label="1 느리게" onClick={() => bpmBy(-1)}>−</button>
          <span><small>♩</small>{s.bpm}</span>
          <button type="button" aria-label="1 빠르게" onClick={() => bpmBy(1)}>+</button>
        </div>
      </div>

      {/* 마디 칸: 지금 마디에 불, 박 점 */}
      {bars.length > 0 && (
        <div className="bt-chart" aria-label="코드 진행">
          {bars.map((b, i) => {
            const on = playing && pos && !pos.count && cb === i
            return (
              <div key={i} className={'bt-bar' + (on ? ' on' : '')}>
                <span className="bt-no">{i + 1}</span>
                <span className="bt-cs">{b.map((x, k) => <span key={k} className={on && curSlot === x ? 'cur' : ''}>{name(x.c)}</span>)}</span>
                {on && <span className="bt-dots" aria-hidden="true">{[0, 1, 2, 3].map(d => <i key={d} className={pos!.beat === d ? 'on' : ''} />)}</span>}
              </div>
            )
          })}
        </div>
      )}
      {warn && <p className="bt-warn">{warn}</p>}

      <div className="bk-field">
        <div className="bk-lab"><b>코드 진행</b><span className="muted">고르거나 아래에 직접 적어요</span></div>
        {groups.map(gname => (
          <div key={gname} className="bt-group">
            <span className="bt-gname">{gname}</span>
            <div className="bt-presets">
              {PRESETS.filter(p => p.group === gname).map(p => (
                <button key={p.id} type="button" className={'bk-g' + (preset?.id === p.id ? ' on' : '')} onClick={() => pickPreset(p.id)}>
                  <b>{p.name}</b><small>{p.hint}</small>
                </button>
              ))}
            </div>
          </div>
        ))}
        <textarea className="bt-text" rows={2} value={s.text} spellCheck={false} autoCapitalize="off" autoCorrect="off"
          onChange={e => up({ text: e.target.value.slice(0, 400), preset: null })} aria-label="코드 직접 적기" placeholder="예: C | Am | Dm7 G7 | C" />
        {chart.bad.length > 0 && <p className="bt-warn">못 읽은 코드: {chart.bad.join(', ')}</p>}
        <p className="bt-help">마디는 <b>|</b> 로 나눠요. 한 마디에 코드 2개면 띄어 써요 (C G → 2박씩). <b>%</b> = 앞 마디 그대로. 키는 아래에서 바꾸면 돼요 (원래 키: {origLabel}).</p>
      </div>

      <div className="bk-field">
        <div className="bk-lab"><b>리듬</b><span className="muted">{style.bassName} · {style.keysName}</span></div>
        <div className="bt-styles" role="radiogroup" aria-label="리듬">
          {STYLES.map(x => (
            <button key={x.id} type="button" role="radio" aria-checked={s.style === x.id} className={'bk-g' + (s.style === x.id ? ' on' : '')} onClick={() => pickStyle(x.id)}>
              <b>{x.name}</b><small>{x.hint}</small>
            </button>
          ))}
        </div>
      </div>

      <div className="bt-two">
        <div className="bk-field">
          <div className="bk-lab"><b>키</b><span className="muted">{s.shift ? `원래보다 ${s.shift > 0 ? '+' : ''}${s.shift}` : '원래 키'}</span></div>
          <div className="bk-row">
            <button type="button" className="round sm" aria-label="반음 내리기" onClick={() => shift(-1)}>−</button>
            <b className="bt-key">{keyLabel}</b>
            <button type="button" className="round sm" aria-label="반음 올리기" onClick={() => shift(1)}>+</button>
            {s.shift !== 0 && <button type="button" className="btn sm ghost" onClick={() => up({ shift: 0 })}>원래대로</button>}
          </div>
        </div>
        <div className="bk-field">
          <div className="bk-lab"><b>빠르기</b><span className="muted">♩{s.bpm}</span></div>
          <div className="bk-row">
            <button type="button" className="round sm" aria-label="5 느리게" onClick={() => bpmBy(-5)}>−5</button>
            <input type="range" min={40} max={240} value={s.bpm} onChange={e => bpm(Number(e.target.value))} aria-label="빠르기" style={{ flex: 1, minWidth: 0 }} />
            <button type="button" className="round sm" aria-label="5 빠르게" onClick={() => bpmBy(5)}>+5</button>
          </div>
        </div>
      </div>

      <div className="bk-field">
        <div className="bk-lab"><b>악기</b><span className="muted">내가 칠 악기는 꺼 두세요</span></div>
        <div className="bt-parts">
          {PARTS.map(([k, ic, label]) => (
            <button key={k} type="button" aria-pressed={s.mix[k] > 0} className={'bt-part' + (s.mix[k] > 0 ? ' on' : '')}
              onClick={() => setMix({ [k]: sRef.current.mix[k] > 0 ? 0 : 1 })}>
              <span aria-hidden="true">{ic}</span>{label}<small>{s.mix[k] > 0 ? '켜짐' : '꺼짐'}</small>
            </button>
          ))}
        </div>
      </div>

      <details className="bk-more">
        <summary>더 보기 <span className="muted">스윙 {SWINGS.find(x => x[0] === swingPick)?.[1]} · 카운트 {s.countIn ? '켬' : '끔'}</span></summary>
        <div className="bk-field" style={{ paddingBottom: 12 }}>
          <div className="bk-lab"><b>스윙</b><span className="muted">{Math.round(s.swing * 100)}%</span></div>
          <div className="seg sm" role="radiogroup" aria-label="스윙">
            {SWINGS.map(([v, l]) => <button key={l} type="button" role="radio" aria-checked={swingPick === v} className={swingPick === v ? 'on' : ''} onClick={() => up({ swing: v })}>{l}</button>)}
          </div>
          <input type="range" min={0} max={100} value={Math.round(s.swing * 100)} onChange={e => up({ swing: Number(e.target.value) / 100 })} aria-label="스윙 세밀하게" />
          {PARTS.map(([k, ic, label]) => (
            <div key={k} className="bk-row">
              <span className="lbl" style={{ width: 64 }}>{ic} {label}</span>
              <input type="range" min={0} max={1.5} step={0.05} value={s.mix[k]} onChange={e => setMix({ [k]: Number(e.target.value) })} aria-label={`${label} 크기`} style={{ flex: 1 }} />
            </div>
          ))}
          <label className="check"><input type="checkbox" checked={s.countIn} onChange={e => up({ countIn: e.target.checked })} /><span>시작할 때 한 마디 카운트 (하나 둘 셋 넷)</span></label>
        </div>
      </details>

      <div className="pl-share">
        <button type="button" className="btn primary" onClick={() => { setSent(''); share() }} disabled={!bars.length}>{coach ? '📨 학생에게 이 백킹트랙 보내기' : '📨 친구·코치님께 이 백킹트랙 보내기'}</button>
      </div>
      {sent && <p className="muted" style={{ margin: 0, fontSize: 13, wordBreak: 'break-all' }}>{sent}</p>}
      <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>
        보낸 링크를 누르면 같은 코드·리듬·키·빠르기로 열려요. 빠르기·스윙은 바로, 코드·키·리듬은 다음 마디부터 바뀌어요.
        컴퓨터가 정해진 패턴으로 연주하는 반주라 실제 밴드처럼 자연스럽지는 않아요. 멜로디는 없어요.
      </p>
    </section>
  )
}
