import { useEffect, useState } from 'react'
import { tourDone } from './Tour'

// 휴대폰 홈 화면에 모두플레이 추가(앱처럼 쓰기)
// 1) InstallSheet: 휴대폰으로 열면 아래에서 올라오는 추천 (나중에 → 3일 뒤 다시)
// 2) InstallHint: 홈 화면 카드 (닫아도 7일 뒤 다시)
// 3) InstallMenuItem: 내 계정 메뉴에 늘 있는 '홈 화면에 앱으로 추가' → 기기별 방법
// 이미 앱(홈 화면 아이콘)으로 연 사람에게는 아무것도 안 보임
type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferred: BIP | null = null
const subs = new Set<() => void>()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as BIP; subs.forEach(f => f()) })
  window.addEventListener('appinstalled', () => { deferred = null; try { localStorage.setItem('mp_installed', '1') } catch { /* 무시 */ } subs.forEach(f => f()) })
}

const ua = () => (typeof navigator !== 'undefined' ? navigator.userAgent : '')
export const isStandalone = () => typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true)
const isIOS = () => /iPhone|iPad|iPod/.test(ua()) || (/Macintosh/.test(ua()) && typeof document !== 'undefined' && 'ontouchend' in document)
const isMobile = () => isIOS() || /Android/.test(ua())
const isKakao = () => /KAKAOTALK/i.test(ua())
const isSamsung = () => /SamsungBrowser/i.test(ua())
const inApp = () => /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\//i.test(ua())
const installed = () => { try { return localStorage.getItem('mp_installed') === '1' } catch { return false } }

const lsNum = (k: string) => { try { return Number(localStorage.getItem(k) || 0) } catch { return 0 } }
const lsSet = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch { /* 무시 */ } }

/** 홈 화면 추가를 추천할 대상인지 */
export const shouldSuggest = () => isMobile() && !isStandalone()

function useCanPrompt() {
  const [, tick] = useState(0)
  useEffect(() => { const f = () => tick(n => n + 1); subs.add(f); return () => { subs.delete(f) } }, [])
  return !!deferred
}

async function runPrompt(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const r = await deferred.userChoice
  deferred = null; subs.forEach(f => f())
  if (r.outcome === 'accepted') { lsSet('mp_installed', '1'); return true }
  return false
}

/** 기기별 추가 방법 (그림 대신 순서) */
function Steps() {
  if (isKakao() || inApp()) {
    const url = location.origin + '/?source=inapp'
    return (
      <div className="ih-steps">
        <p>지금은 <b>{isKakao() ? '카카오톡' : '앱'} 안의 브라우저</b>라 홈 화면에 추가할 수 없어요. 먼저 {isIOS() ? '사파리' : '크롬'}로 열어 주세요.</p>
        {isKakao() && <a className="btn primary" href={`kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`}>{isIOS() ? '사파리' : '크롬'}로 열기</a>}
        {!isKakao() && <p className="muted">오른쪽 위 ⋯ 메뉴 → <b>다른 브라우저로 열기</b></p>}
      </div>
    )
  }
  if (isIOS()) return (
    <ol className="ih-steps">
      <li>사파리 아래쪽(아이패드는 위쪽) <b>공유 버튼 <span className="ih-key">□↑</span></b>을 눌러요.</li>
      <li>목록을 올려 <b>‘홈 화면에 추가’</b>를 눌러요.</li>
      <li>오른쪽 위 <b>‘추가’</b> → 홈 화면에 모두플레이 아이콘이 생겨요.</li>
    </ol>
  )
  if (isSamsung()) return (
    <ol className="ih-steps">
      <li>아래쪽 <b>메뉴 <span className="ih-key">≡</span></b>를 눌러요.</li>
      <li><b>‘현재 페이지 추가’ → ‘홈 화면’</b>을 골라요.</li>
      <li><b>‘추가’</b> → 홈 화면에 모두플레이 아이콘이 생겨요.</li>
    </ol>
  )
  return (
    <ol className="ih-steps">
      <li>크롬 오른쪽 위 <b>메뉴 <span className="ih-key">⋮</span></b>를 눌러요.</li>
      <li><b>‘앱 설치’</b> 또는 <b>‘홈 화면에 추가’</b>를 골라요.</li>
      <li><b>‘설치’(추가)</b> → 홈 화면에 모두플레이 아이콘이 생겨요.</li>
    </ol>
  )
}

const BENEFIT = '아이콘 한 번이면 바로 열리고, 주소창 없이 화면을 넓게 써요. 앱스토어·설치비 없이 1초면 끝나요.'

function Head() {
  return (
    <div className="ih-head">
      <img src="/icons/icon-192.png" alt="" width={52} height={52} />
      <div><b>모두플레이를 앱처럼 쓰세요</b><span>휴대폰 홈 화면에 아이콘 추가</span></div>
    </div>
  )
}

/** 방법 안내 창 (메뉴·카드에서 열기) */
export function InstallGuide({ onClose }: { onClose: () => void }) {
  const can = useCanPrompt()
  const [done, setDone] = useState(false)
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="card modal ih-modal" onClick={e => e.stopPropagation()}>
        <Head />
        {isStandalone() ? <p>이미 홈 화면 아이콘으로 열었어요 👍</p> : done ? <p>추가했어요! 홈 화면의 <b>모두플레이</b> 아이콘으로 열어 보세요 🎉</p> : <>
          <p className="ih-sub">{BENEFIT}</p>
          {can ? <button type="button" className="btn primary ih-big" onClick={async () => { if (await runPrompt()) setDone(true) }}>📲 홈 화면에 추가</button> : <Steps />}
          {!isMobile() && <p className="muted" style={{ fontSize: 13 }}>휴대폰으로 play.modu-music.com 에 들어가서 해 주세요.</p>}
        </>}
        <button type="button" className="btn ghost" onClick={onClose}>닫기</button>
      </div>
    </div>
  )
}

/** 휴대폰으로 열면 아래에서 올라오는 추천 */
const SHEET_NEXT = 'mp_install_sheet_next'
export function InstallSheet() {
  const can = useCanPrompt()
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!shouldSuggest() || installed() || Date.now() < lsNum(SHEET_NEXT)) return
    if (document.documentElement.classList.contains('in-frame')) return // PC '휴대폰 화면으로 보기' 안에서는 안 띄움
    let t = 0
    // 처음 온 사람은 화면 안내(투어)를 끝낸 뒤에
    const go = () => { if ((tourDone('student') || tourDone('coach')) && !/[?&]tour=1/.test(location.search)) { window.clearTimeout(t); t = window.setTimeout(() => setShow(true), 2500) } }
    go(); addEventListener('mp-tour', go)
    return () => { window.clearTimeout(t); removeEventListener('mp-tour', go) }
  }, [])
  if (!show) return null
  const later = (days: number) => { lsSet(SHEET_NEXT, String(Date.now() + days * 86400000)); setShow(false) }
  return (
    <div className="ih-sheet-bg" onClick={() => later(3)}>
      <div className="ih-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label="홈 화면에 모두플레이 추가">
        <Head />
        <p className="ih-sub">{BENEFIT}</p>
        {can ? <button type="button" className="btn primary ih-big" onClick={async () => { if (await runPrompt()) setShow(false) }}>📲 홈 화면에 추가</button> : <Steps />}
        <div className="ih-row">
          <button type="button" className="btn ghost" onClick={() => later(3)}>나중에</button>
          <button type="button" className="linkish" style={{ fontSize: 12 }} onClick={() => later(30)}>한 달 동안 안 보기</button>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>언제든 오른쪽 위 내 동그라미 → <b>📲 홈 화면에 앱으로 추가</b></p>
      </div>
    </div>
  )
}

/** 내 계정 메뉴에 늘 있는 항목 */
export function InstallMenuItem() {
  const [open, setOpen] = useState(false)
  if (isStandalone()) return null
  return (
    <>
      <button type="button" onClick={e => { e.currentTarget.closest('details')?.removeAttribute('open'); setOpen(true) }}>📲 홈 화면에 앱으로 추가</button>
      {open && <InstallGuide onClose={() => setOpen(false)} />}
    </>
  )
}

/** 홈 화면 카드 (닫으면 7일 뒤 다시) */
const CARD_NEXT = 'mp_install_card_next'
export default function InstallHint() {
  const [hide, setHide] = useState(() => Date.now() < lsNum(CARD_NEXT) || installed())
  const [open, setOpen] = useState(false)
  if (!shouldSuggest() || hide) return null
  return (
    <section className="card install">
      <div className="ic"><img src="/icons/icon-192.png" alt="" width={44} height={44} /></div>
      <div className="body">
        <p className="t">📲 모두플레이를 앱처럼 쓰세요</p>
        <p className="s">휴대폰 홈 화면에 아이콘을 추가하면 한 번에 열려요. 설치비·앱스토어 필요 없어요.</p>
        <div className="row">
          <button className="btn primary sm" onClick={() => setOpen(true)}>홈 화면에 추가하는 법</button>
          <button className="btn sm" onClick={() => { lsSet(CARD_NEXT, String(Date.now() + 7 * 86400000)); setHide(true) }}>닫기</button>
        </div>
      </div>
      {open && <InstallGuide onClose={() => setOpen(false)} />}
    </section>
  )
}
