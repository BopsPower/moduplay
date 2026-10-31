import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { fmtWatch, useTools, type ToolTab } from '../lib/tools'

// 어느 화면에서든 꺼내 쓰는 연습 도구: 떠 있는 버튼 + 아래에서 올라오는 판
// 판을 닫아도 메트로놈·스톱워치는 계속 돌아가고, 버튼 자리에 지금 상태가 보여요.
const TABS: [ToolTab, string][] = [['metro', '메트로놈'], ['watch', '스톱워치'], ['reps', '횟수 세기']]

export default function ToolsDock() {
  const { session, student, isTeacher } = useAuth()
  const t = useTools()
  const loc = useLocation()
  const nav = useNavigate()

  // 앱 아이콘 길게 누르기 바로가기: /?tool=metronome|stopwatch|counter
  useEffect(() => {
    const q = new URLSearchParams(loc.search).get('tool')
    if (!q) return
    const map: Record<string, ToolTab> = { metronome: 'metro', stopwatch: 'watch', counter: 'reps' }
    if (map[q]) t.show(map[q])
    const n = new URLSearchParams(loc.search); n.delete('tool')
    nav({ pathname: loc.pathname, search: n.toString() ? `?${n}` : '' }, { replace: true })
  }, [loc.search])

  // 판이 열려 있으면 뒤로가기 대신 닫기 (Esc)
  useEffect(() => {
    if (!t.open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') t.hide() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [t.open])

  if (!session || (!student && !isTeacher) || loc.pathname.startsWith('/login') || loc.pathname.endsWith('/qr')) return null

  const active = t.metroOn || t.running || t.reps > 0
  const watchTxt = fmtWatch(t.ms)

  return (
    <>
      {!t.open && (
        active ? (
          <button type="button" className="tools-pill" onClick={() => t.show()} aria-label="연습 도구 열기">
            {t.metroOn && <span className="seg-i"><i className={'dot' + (t.beat === 0 ? ' acc' : t.beat >= 0 ? ' on' : '')} />♩{t.bpm}</span>}
            {(t.running || t.ms > 0) && <span className="seg-i">{t.running ? '●' : '❚❚'} {watchTxt}</span>}
            {t.reps > 0 && <span className="seg-i">{t.reps}/{t.target}회</span>}
          </button>
        ) : (
          <button type="button" className="tools-fab" onClick={() => t.show()} aria-label="연습 도구 (메트로놈 · 스톱워치 · 횟수 세기)" title="연습 도구">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 3h6l3.5 17h-13z" /><path d="M7.2 14h9.6" /><path d="M12 14l4.5-8" />
            </svg>
          </button>
        )
      )}

      {t.open && (
        <div className="tools-bg" onClick={t.hide}>
          <section className="tools-sheet" role="dialog" aria-label="연습 도구" onClick={e => e.stopPropagation()}>
            <div className="tools-head">
              <div className="seg" role="tablist">
                {TABS.map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={t.tab === k} className={t.tab === k ? 'on' : ''} onClick={() => t.setTab(k)}>
                    {l}{k === 'metro' && t.metroOn ? ' ●' : k === 'watch' && t.running ? ' ●' : ''}
                  </button>
                ))}
              </div>
              <button type="button" className="tools-x" onClick={t.hide} aria-label="닫기 (계속 돌아가요)">✕</button>
            </div>

            {t.tab === 'metro' && (
              <div className="tools-body">
                <div className="big-num">♩ = {t.bpm}</div>
                <div className="beats">
                  {Array.from({ length: t.beats }, (_, i) => <span key={i} className={t.beat === i ? (i === 0 ? 'acc' : 'on') : ''} />)}
                </div>
                <div className="row">
                  <button type="button" className="round" aria-label="5 느리게" onClick={() => t.setBpm(t.bpm - 5)}>−5</button>
                  <button type="button" className="round" aria-label="1 느리게" onClick={() => t.setBpm(t.bpm - 1)}>−</button>
                  <input type="range" min={30} max={240} value={t.bpm} onChange={e => t.setBpm(Number(e.target.value))} aria-label="빠르기" />
                  <button type="button" className="round" aria-label="1 빠르게" onClick={() => t.setBpm(t.bpm + 1)}>+</button>
                  <button type="button" className="round" aria-label="5 빠르게" onClick={() => t.setBpm(t.bpm + 5)}>+5</button>
                </div>
                <div className="row">
                  <button type="button" className="btn primary" style={{ flex: 1 }} onClick={t.toggleMetro}>{t.metroOn ? '멈춤' : '시작'}</button>
                  <select value={t.beats} onChange={e => t.setBeats(Number(e.target.value))} aria-label="박자">
                    {[2, 3, 4, 6].map(n => <option key={n} value={n}>{n}박</option>)}
                  </select>
                  <button type="button" className="btn ghost" onClick={t.tap} title="박자에 맞춰 여러 번 누르면 빠르기를 잡아요">탭</button>
                </div>
                <p className="hint">첫 박은 높은 소리로 울려요. 탭을 박자에 맞춰 여러 번 누르면 빠르기를 잡아요.</p>
              </div>
            )}

            {t.tab === 'watch' && (
              <div className="tools-body">
                <div className="seg sm">
                  <button type="button" className={t.mode === 'up' ? 'on' : ''} disabled={t.running} onClick={() => t.setMode('up')}>스톱워치</button>
                  <button type="button" className={t.mode === 'down' ? 'on' : ''} disabled={t.running} onClick={() => t.setMode('down')}>타이머</button>
                </div>
                {t.mode === 'down' && (
                  <div className="seg sm">
                    {[1, 2, 3, 5, 10].map(m => <button key={m} type="button" className={t.minutes === m ? 'on' : ''} disabled={t.running} onClick={() => t.setMinutes(m)}>{m}분</button>)}
                  </div>
                )}
                <div className={'big-num time' + (t.running ? ' run' : '')}>{fmtWatch(t.ms, t.mode === 'up')}</div>
                <div className="row">
                  <button type="button" className="btn primary" style={{ flex: 1 }} onClick={t.running ? t.pauseWatch : t.startWatch}>
                    {t.running ? '멈춤' : (t.mode === 'up' ? t.ms > 0 : t.ms > 0 && t.ms < t.minutes * 60000) ? '계속' : '시작'}
                  </button>
                  <button type="button" className="btn ghost" disabled={t.running} onClick={t.resetWatch}>처음으로</button>
                </div>
                {t.mode === 'down'
                  ? <p className="hint">0이 되면 소리가 나요.{t.autoRep ? ' 끝날 때마다 횟수가 1 올라가요.' : ''}</p>
                  : <p className="hint">연습한 시간을 재요. 화면을 옮겨도 계속 흘러가요.</p>}
              </div>
            )}

            {t.tab === 'reps' && (
              <div className="tools-body">
                <div className="row" style={{ justifyContent: 'center', gap: 16 }}>
                  <button type="button" className="round" aria-label="한 번 빼기" onClick={() => t.setReps(t.reps - 1)}>−</button>
                  <div className="big-num" style={{ minWidth: 120 }}>{t.reps}<span className="of"> / {t.target}회</span></div>
                  <button type="button" className="round main big" aria-label="한 번 더 했어요" onClick={() => t.setReps(t.reps + 1)}>+</button>
                </div>
                <div className="bar"><div style={{ width: `${Math.min(100, (t.reps / t.target) * 100)}%` }} /></div>
                <div className="row">
                  <label className="muted" style={{ fontSize: 13 }}>목표
                    <select value={t.target} onChange={e => t.setTarget(Number(e.target.value))} style={{ marginLeft: 6 }}>
                      {[3, 5, 8, 10, 15, 20, 30, 50].map(n => <option key={n} value={n}>{n}회</option>)}
                    </select>
                  </label>
                  <button type="button" className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => t.setReps(0)}>0으로</button>
                </div>
                <label className="check" style={{ fontSize: 13 }}>
                  <input type="checkbox" checked={t.autoRep} onChange={e => t.setAutoRep(e.target.checked)} />
                  <span>타이머가 끝날 때마다 자동으로 1회 올리기</span>
                </label>
                <p className="hint">{t.reps >= t.target ? '목표 달성! 잘했어요.' : '한 번 끝낼 때마다 + 를 눌러요.'}</p>
              </div>
            )}

            <p className="tools-foot">✕ 로 닫아도 메트로놈·스톱워치는 계속 돌아가요.</p>
          </section>
        </div>
      )}
    </>
  )
}
