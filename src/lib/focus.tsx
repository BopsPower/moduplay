// 몰입 모드 (원장님 2026-11-24 "이 앱을 켜는 동시에 다른 앱은 다 정지… 완전히 연습에 몰입" → "2가지 동시에 쓰자")
// 웹앱은 다른 앱을 끌 수 없어서 두 가지를 함께 씀:
//  1) 휴대폰 기본 잠금 안내: 아이폰·아이패드 '사용법 유도', 안드로이드 '앱 고정' (진짜로 다른 앱을 막음)
//  2) 앱 안 몰입 모드: 화면 가득 + 화면 안 꺼짐 + 다른 앱으로 나간 횟수·시간을 셈. 한 번도 안 나가면 '완전 몰입'
// 기록은 이 기기에만 (계정별). 몰입 중에는 연습 시간도 쌓임 (화면을 보고 있을 때만)
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './auth'
import { seoulDay, usePracticeActive } from './practice'
import { useWakeLock } from './wakeLock'
import { celebrate } from './celebrate'
import { ask } from './dialog'

type Cur = { planned: number; startedAt: number; focusSec: number; leaves: number; awaySec: number; lastSeen: number; hiddenAt: number | null; fs: boolean }
export type FocusRec = { d: string; at: number; planned: number; focusSec: number; leaves: number; awaySec: number; done: boolean }

const MIN_AWAY = 3 // 3초 넘게 나가야 '나감'으로 셈 (알림 잠깐 내렸다 올린 건 봐줌)
const STALE = 3 * 3600 * 1000 // 3시간 넘게 안 돌아오면 그 몰입은 끝난 것으로
export const FOCUS_MINS = [15, 25, 45, 60, 0] // 0 = 시간 제한 없이

const lsGet = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
const lsSet = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* 무시 */ } }

export const mmss = (s: number) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + String(x).padStart(2, '0') }
export const secTxt = (s: number) => { s = Math.round(s); return s >= 60 ? `${Math.floor(s / 60)}분${s % 60 ? ` ${s % 60}초` : ''}` : `${s}초` }

export function platform(): 'ios' | 'android' | 'pc' {
  if (typeof navigator === 'undefined') return 'pc'
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'pc'
}
const isIPhone = () => typeof navigator !== 'undefined' && /iPhone|iPod/.test(navigator.userAgent)

type Ctx = { running: boolean; openFocus: () => void }
const C = createContext<Ctx>({ running: false, openFocus: () => {} })
export const useFocus = () => useContext(C)

export function FocusProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const uid = session?.user.id ?? 'x'
  const kCur = 'mp_focus_cur_' + uid, kLog = 'mp_focus_log_' + uid
  const [cur, setCur] = useState<Cur | null>(null)
  const curRef = useRef<Cur | null>(null); curRef.current = cur
  const [sheet, setSheet] = useState(false)
  const [result, setResult] = useState<FocusRec | null>(null)
  const [toast, setToast] = useState('')
  const lastTick = useRef(Date.now())

  const readLog = useCallback((): FocusRec[] => { try { return JSON.parse(lsGet(kLog) || '[]') } catch { return [] } }, [kLog])
  const save = (c: Cur | null) => lsSet(kCur, c ? JSON.stringify(c) : null)

  const finish = useCallback((done: boolean, c0?: Cur | null) => {
    const c = c0 ?? curRef.current; if (!c) return
    const rec: FocusRec = { d: seoulDay(new Date(c.startedAt)), at: c.startedAt, planned: c.planned, focusSec: Math.round(c.focusSec), leaves: c.leaves, awaySec: Math.round(c.awaySec), done }
    if (rec.focusSec >= 60) lsSet(kLog, JSON.stringify([...readLog(), rec].slice(-300)))
    save(null); setCur(null)
    try { const d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void }; if (c.fs && (d.fullscreenElement || d.webkitFullscreenElement)) (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.())?.catch?.(() => {}) } catch { /* 무시 */ }
    setResult(rec)
    if (done && rec.leaves === 0) celebrate(`완전 몰입! ${Math.round(rec.focusSec / 60)}분 동안 한 번도 안 나갔어요`)
  }, [kCur, kLog, readLog])

  // 앱을 다시 열었을 때: 하던 몰입 이어 가기 (닫혀 있던 시간은 '나감')
  useEffect(() => {
    let c: Cur | null = null
    try { c = JSON.parse(lsGet(kCur) || 'null') } catch { c = null }
    if (!c) { setCur(null); return }
    const gap = Date.now() - (c.hiddenAt ?? c.lastSeen)
    if (gap > STALE) { finish(false, c); setResult(null); return }
    if (gap >= MIN_AWAY * 1000) { c = { ...c, leaves: c.leaves + 1, awaySec: c.awaySec + gap / 1000 } }
    c = { ...c, hiddenAt: null, lastSeen: Date.now() }
    lastTick.current = Date.now(); setCur(c); save(c)
  }, [kCur]) // eslint-disable-line react-hooks/exhaustive-deps

  // 1초마다: 화면을 보고 있을 때만 몰입 시간이 늘어남
  const running = !!cur
  useEffect(() => {
    if (!running) return
    lastTick.current = Date.now()
    let n = 0
    const iv = window.setInterval(() => {
      const c = curRef.current; if (!c) return
      const now = Date.now()
      if (document.visibilityState !== 'visible' || c.hiddenAt) { lastTick.current = now; return }
      const dt = Math.min(2, (now - lastTick.current) / 1000); lastTick.current = now
      const nc = { ...c, focusSec: c.focusSec + dt, lastSeen: now }
      if (++n % 5 === 0) save(nc)
      if (nc.planned && nc.focusSec >= nc.planned * 60) { finish(true, nc); return }
      setCur(nc)
    }, 1000)
    const vis = () => {
      const c = curRef.current; if (!c) return
      const now = Date.now()
      if (document.visibilityState === 'hidden') { const nc = { ...c, hiddenAt: now }; save(nc); setCur(nc); return }
      if (!c.hiddenAt) return
      const away = (now - c.hiddenAt) / 1000
      const out = away >= MIN_AWAY
      const nc = { ...c, hiddenAt: null, lastSeen: now, leaves: c.leaves + (out ? 1 : 0), awaySec: c.awaySec + (out ? away : 0) }
      lastTick.current = now; save(nc); setCur(nc)
      if (out) { setToast(`다른 앱에 ${secTxt(away)} 있었어요 · 다시 집중해요 💪`); window.setTimeout(() => setToast(''), 5000) }
    }
    const bye = () => { const c = curRef.current; if (c) save({ ...c, hiddenAt: c.hiddenAt ?? Date.now() }) }
    document.addEventListener('visibilitychange', vis)
    window.addEventListener('pagehide', bye)
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', vis); window.removeEventListener('pagehide', bye) }
  }, [running, finish])

  usePracticeActive('focus', running) // 몰입 중 = 연습 중 (화면을 볼 때만 쌓임)
  // 몰입 막대 자리를 비워 둠 (머리 줄·위에 붙는 막대가 가려지지 않게)
  useEffect(() => { document.documentElement.classList.toggle('focus-on', running) }, [running])
  useWakeLock('focus', running)

  const start = (min: number) => {
    lsSet('mp_focus_min', String(min))
    let fs = false
    // 화면 가득: 안드로이드·아이패드·PC (아이폰 사파리는 웹페이지 전체 화면이 안 됨 → 홈 화면에 추가하면 주소창이 사라짐)
    try {
      const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void }
      if (!isIPhone() && !matchMedia('(display-mode: standalone)').matches) {
        const r = el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.()
        fs = !!(el.requestFullscreen || el.webkitRequestFullscreen)
        ;(r as Promise<void> | undefined)?.catch?.(() => {})
      }
    } catch { /* 안 되는 기기는 그대로 */ }
    const now = Date.now()
    const c: Cur = { planned: min, startedAt: now, focusSec: 0, leaves: 0, awaySec: 0, lastSeen: now, hiddenAt: null, fs }
    save(c); setCur(c); setSheet(false); setResult(null)
  }
  const stop = async () => {
    const c = curRef.current; if (!c) return
    if (!await ask(`몰입을 끝낼까요?\n지금까지 ${secTxt(c.focusSec)} 몰입했어요.`, '끝내기', '계속하기')) return
    finish(!!c.planned && c.focusSec >= c.planned * 60)
  }

  const value = useMemo(() => ({ running, openFocus: () => { setResult(null); setSheet(true) } }), [running])
  return (
    <C.Provider value={value}>
      {children}
      {cur && <FocusPill cur={cur} toast={toast} onStop={stop} />}
      {sheet && !cur && <FocusSheet log={readLog()} onStart={start} onClose={() => setSheet(false)} />}
      {result && <FocusResult rec={result} log={readLog()} onAgain={() => { setResult(null); setSheet(true) }} onClose={() => setResult(null)} />}
    </C.Provider>
  )
}

function FocusPill({ cur, toast, onStop }: { cur: Cur; toast: string; onStop: () => void }) {
  const left = cur.planned ? cur.planned * 60 - cur.focusSec : 0
  return (
    <div className="focus-pill-wrap">
      <div className="focus-pill" role="status" aria-live="off">
        <span className="fp-ic" aria-hidden="true">🎯</span>
        <b>{cur.planned ? mmss(left) : mmss(cur.focusSec)}</b>
        <small>{cur.planned ? `남음 · ${cur.planned}분 몰입` : '몰입 중'}</small>
        <span className={'fp-out' + (cur.leaves ? ' on' : '')} title="다른 앱으로 나간 횟수">나감 {cur.leaves}</span>
        <button type="button" onClick={onStop}>끝내기</button>
      </div>
      {toast && <p className="focus-toast" role="alert">{toast}</p>}
    </div>
  )
}

function weekOf(log: FocusRec[]) {
  const since = seoulDay(new Date(Date.now() - 6 * 86400 * 1000))
  const w = log.filter(r => r.d >= since)
  return { n: w.length, perfect: w.filter(r => r.done && r.leaves === 0).length, sec: w.reduce((a, r) => a + r.focusSec, 0) }
}

export function LockGuide({ open }: { open?: boolean }) {
  const pf = platform()
  return (
    <details className="focus-guide" open={open}>
      <summary>📱 다른 앱을 <b>아예 잠그려면</b> (권장)</summary>
      {pf === 'ios' && <>
        <p className="fg-t">아이폰·아이패드 <b>'사용법 유도'</b></p>
        <ol>
          <li>설정 › 손쉬운 사용 › <b>사용법 유도</b>를 켜고, 암호를 정해요.</li>
          <li>모두플레이로 돌아와 <b>옆 버튼(홈 버튼)을 세 번</b> 빠르게 눌러요 → 오른쪽 위 <b>[시작]</b>.</li>
          <li>끝낼 땐 다시 <b>세 번</b> 누르고 암호 → 왼쪽 위 <b>[종료]</b>.</li>
        </ol>
        <p className="fg-n">잠긴 동안에는 다른 앱으로 나갈 수 없어요. 모두플레이를 홈 화면에 추가해 두면 앱처럼 열려요.</p>
      </>}
      {pf === 'android' && <>
        <p className="fg-t">안드로이드 <b>'앱 고정'</b></p>
        <ol>
          <li>설정에서 <b>'앱 고정'</b>을 검색해 켜요.</li>
          <li>최근 앱 화면을 열고, 모두플레이 위쪽 아이콘을 눌러 <b>[고정]</b>.</li>
          <li>풀 때는 화면에 나오는 안내대로 해요 (기종마다 조금 달라요).</li>
        </ol>
        <p className="fg-n">고정된 동안에는 다른 앱으로 나갈 수 없어요.</p>
      </>}
      {pf === 'pc' && <>
        <p className="fg-t">컴퓨터</p>
        <ol>
          <li>몰입을 시작하면 화면이 가득 차요 (Esc 로 빠져나와요).</li>
          <li>알림은 윈도우 <b>'집중 지원'</b>, 맥 <b>'집중 모드'</b>로 꺼 두세요.</li>
        </ol>
      </>}
      <p className="fg-n">알림까지 막으려면 휴대폰 <b>방해 금지(집중 모드)</b>도 함께 켜세요.</p>
    </details>
  )
}

function FocusSheet({ log, onStart, onClose }: { log: FocusRec[]; onStart: (min: number) => void; onClose: () => void }) {
  const [min, setMin] = useState(() => { const r = lsGet('mp_focus_min'); const v = Number(r); return r !== null && FOCUS_MINS.includes(v) ? v : 25 })
  const wk = weekOf(log)
  return (
    <div className="modal-bg" onClick={onClose}>
      <section className="card modal focus-sheet" role="dialog" aria-label="몰입 모드" onClick={e => e.stopPropagation()}>
        <p className="fs-title">🎯 몰입 모드</p>
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.65 }}>연습하는 동안 <b style={{ color: 'var(--ink)' }}>다른 앱으로 나가지 않기!</b> 나간 횟수를 세고, 한 번도 안 나가면 <b style={{ color: 'var(--ink)' }}>🌟 완전 몰입</b>으로 남아요. 몰입하는 시간은 연습 시간에도 쌓여요.</p>
        <div>
          <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 14 }}>얼마 동안 할까요?</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {FOCUS_MINS.map(m => <button key={m} type="button" className={'chip' + (min === m ? ' on' : '')} onClick={() => setMin(m)}>{m ? `${m}분` : '시간 제한 없이'}</button>)}
          </div>
        </div>
        <LockGuide />
        {wk.n > 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>최근 7일: 몰입 {wk.n}번 · {Math.round(wk.sec / 60)}분 · 🌟 완전 몰입 {wk.perfect}번</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn ghost" onClick={onClose}>닫기</button>
          <button type="button" className="btn primary" onClick={() => onStart(min)}>🎯 몰입 시작</button>
        </div>
      </section>
    </div>
  )
}

function FocusResult({ rec, log, onAgain, onClose }: { rec: FocusRec; log: FocusRec[]; onAgain: () => void; onClose: () => void }) {
  const perfect = rec.done && rec.leaves === 0
  const today = log.filter(r => r.d === seoulDay())
  const m = Math.round(rec.focusSec / 60)
  return (
    <div className="modal-bg" onClick={onClose}>
      <section className="card modal focus-sheet" role="dialog" aria-label="몰입 결과" onClick={e => e.stopPropagation()}>
        <p className="fs-big" aria-hidden="true">{perfect ? '🌟' : rec.done ? '🎯' : '⏸️'}</p>
        <p className="fs-title" style={{ textAlign: 'center' }}>{perfect ? '완전 몰입!' : rec.done ? `${rec.planned}분 몰입 완료` : `${m < 1 ? secTxt(rec.focusSec) : `${m}분`} 몰입했어요`}</p>
        <p style={{ margin: 0, textAlign: 'center', fontSize: 15, lineHeight: 1.65 }}>
          {perfect ? `${m}분 동안 한 번도 다른 앱으로 나가지 않았어요.`
            : rec.leaves ? <>다른 앱으로 <b>{rec.leaves}번</b> 나갔어요 ({secTxt(rec.awaySec)}). 다음엔 0번 도전!</>
            : '한 번도 나가지 않았어요. 다음엔 정한 시간까지 해 봐요!'}
        </p>
        {rec.focusSec < 60 && <p className="muted" style={{ margin: 0, fontSize: 12, textAlign: 'center' }}>1분이 안 된 몰입은 기록에 남기지 않아요.</p>}
        {today.length > 0 && <p className="muted" style={{ margin: 0, fontSize: 13, textAlign: 'center' }}>오늘 몰입 {today.length}번 · {Math.round(today.reduce((a, r) => a + r.focusSec, 0) / 60)}분 · 🌟 {today.filter(r => r.done && r.leaves === 0).length}번</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button type="button" className="btn ghost" onClick={onClose}>닫기</button>
          <button type="button" className="btn primary" onClick={onAgain}>🎯 한 번 더</button>
        </div>
      </section>
    </div>
  )
}

/** 화면 쪽 시작 단추 */
export function FocusButton({ className = 'btn', label = '🎯 몰입 모드' }: { className?: string; label?: string }) {
  const f = useFocus()
  if (f.running) return null
  return <button type="button" className={className} onClick={f.openFocus}>{label}</button>
}
