import { useTools } from '../lib/tools'
import { GROOVES, NOTE_NAMES } from '../lib/backing'

// 연습 도구 > 반주: 드럼 루프(장르 리듬)와 드론(기준음)
// 판을 닫아도 계속 울림 (메트로놈처럼). 드럼 루프를 켜면 메트로놈은 꺼짐
const SWINGS: [number, string][] = [[0, '똑바로'], [0.33, '약하게'], [0.66, '중간'], [1, '강하게']]

export default function BackingPanel() {
  const t = useTools()
  const g = GROOVES.find(x => x.id === t.groove) ?? GROOVES[0]
  const swingPick = SWINGS.reduce((b, s) => Math.abs(s[0] - t.swing) < Math.abs(b[0] - t.swing) ? s : b)[0]

  return (
    <div className="tools-body backing">
      <section className="bk-sec" aria-label="드럼 루프">
        <div className="bk-h"><b>🥁 드럼 루프</b><span className="muted">장르를 고르고 빠르기·스윙을 맞춰요</span></div>
        <div className="bk-grooves" role="radiogroup" aria-label="리듬">
          {GROOVES.map(x => (
            <button key={x.id} type="button" role="radio" aria-checked={t.groove === x.id} className={'bk-g' + (t.groove === x.id ? ' on' : '')} onClick={() => t.setGroove(x.id)}>
              <b>{x.name}</b><small>{x.hint}</small>
            </button>
          ))}
        </div>

        <div className="big-num" style={{ fontSize: 34 }}>♩ = {t.bpm}</div>
        <div className="row">
          <button type="button" className="round" aria-label="5 느리게" onClick={() => t.setBpm(t.bpm - 5)}>−5</button>
          <button type="button" className="round" aria-label="1 느리게" onClick={() => t.setBpm(t.bpm - 1)}>−</button>
          <input type="range" min={40} max={240} value={t.bpm} onChange={e => t.setBpm(Number(e.target.value))} aria-label="빠르기" />
          <button type="button" className="round" aria-label="1 빠르게" onClick={() => t.setBpm(t.bpm + 1)}>+</button>
          <button type="button" className="round" aria-label="5 빠르게" onClick={() => t.setBpm(t.bpm + 5)}>+5</button>
        </div>
        <div className="bk-sub">
          <span className="muted">{g.name}은 보통 ♩{g.range[0]}~{g.range[1]}</span>
          <button type="button" className="linkish" onClick={t.tap} title="박자에 맞춰 여러 번 누르면 빠르기를 잡아요">탭으로 빠르기 잡기</button>
        </div>

        <div className="bk-row">
          <span className="lbl">스윙</span>
          <div className="seg sm" role="radiogroup" aria-label="스윙" style={{ flex: 1 }}>
            {SWINGS.map(([v, l]) => (
              <button key={l} type="button" role="radio" aria-checked={swingPick === v} className={swingPick === v ? 'on' : ''} onClick={() => t.setSwing(v)}>{l}</button>
            ))}
          </div>
        </div>
        <div className="bk-row">
          <span className="lbl" />
          <input type="range" min={0} max={100} step={1} value={Math.round(t.swing * 100)} onChange={e => t.setSwing(Number(e.target.value) / 100)} aria-label="스윙 세밀하게" style={{ flex: 1 }} />
          <span className="muted" style={{ width: 40, textAlign: 'right', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{Math.round(t.swing * 100)}%</span>
        </div>
        <p className="hint" style={{ marginTop: -6 }}>{t.swing < 0.15 ? '박을 똑같은 간격으로 쳐요 (록·팝).' : t.swing > 0.85 ? '엇박이 셋잇단처럼 튀어요 (셔플·재즈 스윙).' : '엇박을 살짝 뒤로 밀어 그루브가 생겨요 (힙합·R&B).'}</p>

        <div className="bk-row">
          <span className="lbl">음량</span>
          <input type="range" min={0.1} max={1} step={0.05} value={t.grooveVol} onChange={e => t.setGrooveVol(Number(e.target.value))} aria-label="드럼 음량" style={{ flex: 1 }} />
        </div>
        <button type="button" className={'btn wide' + (t.grooveOn ? ' dark' : ' primary')} onClick={t.toggleGroove}>{t.grooveOn ? '■ 드럼 멈춤' : '▶ 드럼 시작'}</button>
      </section>

      <section className="bk-sec" aria-label="드론">
        <div className="bk-h"><b>🎵 드론 (기준음)</b><span className="muted">한 음을 계속 울려 음정·스케일 연습</span></div>
        <div className="bk-notes" role="radiogroup" aria-label="음">
          {NOTE_NAMES.map((n, i) => (
            <button key={n} type="button" role="radio" aria-checked={t.droneNote === i} className={'bk-n' + (t.droneNote === i ? ' on' : '')} onClick={() => t.setDroneNote(i)}>{n}</button>
          ))}
        </div>
        <div className="bk-row">
          <span className="lbl">높이</span>
          <div className="seg sm" style={{ flex: 1 }}>
            {([[2, '낮게'], [3, '보통'], [4, '높게']] as const).map(([o, l]) => <button key={o} type="button" className={t.droneOct === o ? 'on' : ''} onClick={() => t.setDroneOct(o)}>{l}</button>)}
          </div>
        </div>
        <label className="check"><input type="checkbox" checked={t.droneFifth} onChange={e => t.setDroneFifth(e.target.checked)} /><span>5도 음도 같이 (예: C를 고르면 C와 G)</span></label>
        <div className="bk-row">
          <span className="lbl">음량</span>
          <input type="range" min={0.1} max={1} step={0.05} value={t.droneVol} onChange={e => t.setDroneVol(Number(e.target.value))} aria-label="드론 음량" style={{ flex: 1 }} />
        </div>
        <button type="button" className={'btn wide' + (t.droneOn ? ' dark' : ' primary')} onClick={t.toggleDrone}>{t.droneOn ? `■ ${NOTE_NAMES[t.droneNote]} 드론 끄기` : `▶ ${NOTE_NAMES[t.droneNote]} 드론 켜기`}</button>
        <p className="hint">켜 둔 채로 다른 음을 누르면 바로 그 음으로 바뀌어요. 드럼 루프와 같이 틀어도 돼요.</p>
      </section>
    </div>
  )
}
