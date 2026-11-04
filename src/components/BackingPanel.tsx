import { useState } from 'react'
import { useTools } from '../lib/tools'
import { GROOVES, NOTE_NAMES } from '../lib/backing'

// 연습 도구 > 반주: 드럼 루프(장르 리듬)와 드론(기준음)
// - 위쪽 '드럼 | 드론'으로 나눠 한 화면에 들어오게
// - 재생 단추와 지금 상태(리듬·빠르기 / 음)는 맨 위에 고정, 고르는 것들은 그 아래
// - 판을 닫아도 계속 울림 (메트로놈처럼). 드럼 루프를 켜면 메트로놈은 꺼짐
const SWINGS: [number, string][] = [[0, '똑바로'], [0.33, '약하게'], [0.66, '중간'], [1, '강하게']]
const OCTS: [number, string][] = [[2, '낮게'], [3, '보통'], [4, '높게']]
type Sub = 'drum' | 'drone'
const lsGet = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d } catch { return d } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* 무시 */ } }

const PlayIcon = () => <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg>
const StopIcon = () => <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>

export default function BackingPanel() {
  const t = useTools()
  const [sub, setSubS] = useState<Sub>(() => (lsGet('mp_tools_bksub', 'drum') === 'drone' ? 'drone' : 'drum'))
  const setSub = (s: Sub) => { setSubS(s); lsSet('mp_tools_bksub', s) }
  const g = GROOVES.find(x => x.id === t.groove) ?? GROOVES[0]
  const swingPick = SWINGS.reduce((b, s) => Math.abs(s[0] - t.swing) < Math.abs(b[0] - t.swing) ? s : b)[0]
  const swingName = SWINGS.find(s => s[0] === swingPick)?.[1] ?? ''
  const dotted = g.id === 'blues' || g.id === 'shuffle'
  const note = NOTE_NAMES[t.droneNote]

  return (
    <div className="tools-body backing">
      <div className="seg sm bk-tabs" role="tablist" aria-label="반주 종류">
        <button type="button" role="tab" aria-selected={sub === 'drum'} className={sub === 'drum' ? 'on' : ''} onClick={() => setSub('drum')}>🥁 드럼 루프{t.grooveOn ? ' ●' : ''}</button>
        <button type="button" role="tab" aria-selected={sub === 'drone'} className={sub === 'drone' ? 'on' : ''} onClick={() => setSub('drone')}>🎵 드론{t.droneOn ? ` ● ${note}` : ''}</button>
      </div>

      {sub === 'drum' ? (
        <>
          {/* 맨 위: 재생 + 지금 리듬·빠르기 */}
          <div className={'bk-trans' + (t.grooveOn ? ' on' : '')}>
            <button type="button" className="bk-play" onClick={t.toggleGroove} aria-label={t.grooveOn ? '드럼 멈춤' : '드럼 시작'}>{t.grooveOn ? <StopIcon /> : <PlayIcon />}</button>
            <div className="bk-now">
              <b>{g.name}</b>
              <small>스윙 {swingName} · 울림 {Math.round(t.room * 100)}%</small>
            </div>
            <div className="bk-tempo">
              <button type="button" aria-label="1 느리게" onClick={() => t.setBpm(t.bpm - 1)}>−</button>
              <span><small>{dotted ? '♩.' : '♩'}</small>{t.bpm}</span>
              <button type="button" aria-label="1 빠르게" onClick={() => t.setBpm(t.bpm + 1)}>+</button>
            </div>
          </div>

          <div className="bk-grooves" role="radiogroup" aria-label="리듬">
            {GROOVES.map(x => (
              <button key={x.id} type="button" role="radio" aria-checked={t.groove === x.id} className={'bk-g' + (t.groove === x.id ? ' on' : '')} onClick={() => t.setGroove(x.id)}>
                <b>{x.name}</b><small>{x.hint}</small>
              </button>
            ))}
          </div>

          <div className="bk-field">
            <div className="bk-lab"><b>빠르기</b><span className="muted">보통 {dotted ? '♩.' : '♩'}{g.range[0]}~{g.range[1]}{dotted ? ' (한 박 = 셋잇단 셋)' : g.id === 'waltz' ? ' (3박)' : ''}</span></div>
            <div className="bk-row">
              <button type="button" className="round sm" aria-label="5 느리게" onClick={() => t.setBpm(t.bpm - 5)}>−5</button>
              <input type="range" min={40} max={240} value={t.bpm} onChange={e => t.setBpm(Number(e.target.value))} aria-label="빠르기" style={{ flex: 1 }} />
              <button type="button" className="round sm" aria-label="5 빠르게" onClick={() => t.setBpm(t.bpm + 5)}>+5</button>
              <button type="button" className="btn sm ghost" onClick={t.tap} title="박자에 맞춰 여러 번 누르면 빠르기를 잡아요">탭</button>
            </div>
          </div>

          <div className="bk-field">
            <div className="bk-lab"><b>스윙</b><span className="muted">{t.swing < 0.15 ? '똑같은 간격 (록·팝)' : t.swing > 0.85 ? '셋잇단처럼 튐 (셔플·재즈)' : '살짝 뒤로 (힙합·R&B)'} · {Math.round(t.swing * 100)}%</span></div>
            <div className="seg sm" role="radiogroup" aria-label="스윙">
              {SWINGS.map(([v, l]) => (
                <button key={l} type="button" role="radio" aria-checked={swingPick === v} className={swingPick === v ? 'on' : ''} onClick={() => t.setSwing(v)}>{l}</button>
              ))}
            </div>
            <input type="range" min={0} max={100} step={1} value={Math.round(t.swing * 100)} onChange={e => t.setSwing(Number(e.target.value) / 100)} aria-label="스윙 세밀하게" />
          </div>

          <details className="bk-more">
            <summary>소리 조절 <span className="muted">울림 {Math.round(t.room * 100)}% · 음량 {Math.round(t.grooveVol * 100)}%</span></summary>
            <div className="bk-row">
              <span className="lbl">울림</span>
              <input type="range" min={0} max={100} step={5} value={Math.round(t.room * 100)} onChange={e => t.setRoom(Number(e.target.value) / 100)} aria-label="드럼 울림(공간감)" style={{ flex: 1 }} />
            </div>
            <div className="bk-row">
              <span className="lbl">음량</span>
              <input type="range" min={0.1} max={1} step={0.05} value={t.grooveVol} onChange={e => t.setGrooveVol(Number(e.target.value))} aria-label="드럼 음량" style={{ flex: 1 }} />
            </div>
            <p className="hint">울림(공간감)을 줄이면 소리가 짧고 단단해져요. 100%는 녹음 그대로예요.</p>
          </details>
        </>
      ) : (
        <>
          {/* 맨 위: 재생 + 지금 음 */}
          <div className={'bk-trans' + (t.droneOn ? ' on' : '')}>
            <button type="button" className="bk-play" onClick={t.toggleDrone} aria-label={t.droneOn ? '드론 끄기' : '드론 켜기'}>{t.droneOn ? <StopIcon /> : <PlayIcon />}</button>
            <div className="bk-now">
              <b>{note}{t.droneFifth ? ` + ${NOTE_NAMES[(t.droneNote + 7) % 12]}` : ''} 드론</b>
              <small>{t.droneOn ? '울리는 중 · 다른 음을 누르면 바로 바뀌어요' : '음을 고르고 ▶를 눌러요'}</small>
            </div>
          </div>

          <div className="bk-notes" role="radiogroup" aria-label="음">
            {NOTE_NAMES.map((n, i) => (
              <button key={n} type="button" role="radio" aria-checked={t.droneNote === i} className={'bk-n' + (t.droneNote === i ? ' on' : '')} onClick={() => t.setDroneNote(i)}>{n}</button>
            ))}
          </div>

          <div className="bk-field">
            <div className="bk-lab"><b>높이</b></div>
            <div className="seg sm">
              {OCTS.map(([o, l]) => <button key={o} type="button" className={t.droneOct === o ? 'on' : ''} onClick={() => t.setDroneOct(o)}>{l}</button>)}
            </div>
          </div>
          <label className="check"><input type="checkbox" checked={t.droneFifth} onChange={e => t.setDroneFifth(e.target.checked)} /><span>5도 음도 같이 (예: C를 고르면 C와 G)</span></label>
          <div className="bk-row">
            <span className="lbl">음량</span>
            <input type="range" min={0.1} max={1} step={0.05} value={t.droneVol} onChange={e => t.setDroneVol(Number(e.target.value))} aria-label="드론 음량" style={{ flex: 1 }} />
          </div>
          <p className="hint">한 음을 계속 울려 음정·스케일·모드 연습을 해요. 드럼 루프와 같이 틀어도 돼요.</p>
        </>
      )}
    </div>
  )
}
