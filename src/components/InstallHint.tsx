import { useEffect, useState } from 'react'

// 홈 화면에 추가 안내. 이미 앱으로 열었거나, '닫기'를 누른 사람에게는 보이지 않음.
type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
let deferred: BIP | null = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e as BIP })
}

const KEY = 'pm_install_hint_closed'
function read() { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
function save() { try { localStorage.setItem(KEY, '1') } catch { /* 저장 안 돼도 무시 */ } }

export default function InstallHint() {
  const standalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true)
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document)
  const mobile = ios || /Android/.test(ua)
  const [closed, setClosed] = useState(read())
  const [canPrompt, setCanPrompt] = useState(!!deferred)

  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); deferred = e as BIP; setCanPrompt(true) }
    window.addEventListener('beforeinstallprompt', on)
    return () => window.removeEventListener('beforeinstallprompt', on)
  }, [])

  if (standalone || closed || !mobile) return null
  const close = () => { save(); setClosed(true) }

  return (
    <section className="card install">
      <div className="ic"><img src="/icons/icon-192.png" alt="" width={44} height={44} /></div>
      <div className="body">
        <p className="t">휴대폰 홈 화면에 모두플레이를 추가하세요</p>
        {canPrompt ? (
          <p className="s">앱처럼 아이콘을 눌러 바로 연습할 수 있어요. 설치비·앱스토어는 필요 없습니다.</p>
        ) : ios ? (
          <p className="s">사파리 아래쪽 <b>공유 버튼(□↑)</b>을 누르고 <b>‘홈 화면에 추가’</b>를 고르면 앱처럼 쓸 수 있어요.</p>
        ) : (
          <p className="s">크롬 오른쪽 위 <b>⋮ 메뉴</b>에서 <b>‘홈 화면에 추가’</b>(또는 ‘앱 설치’)를 고르면 앱처럼 쓸 수 있어요.</p>
        )}
        <div className="row">
          {canPrompt && <button className="btn primary sm" onClick={async () => { if (!deferred) return; await deferred.prompt(); const r = await deferred.userChoice; deferred = null; setCanPrompt(false); if (r.outcome === 'accepted') close() }}>홈 화면에 추가</button>}
          <button className="btn sm" onClick={close}>닫기</button>
        </div>
      </div>
    </section>
  )
}
