// 앱 안에서 뜨는 확인·알림 창 (브라우저 기본 confirm/alert 대신)
// 일부 앱 속 브라우저(카카오톡·Claude 데스크톱 등)는 기본 창을 막아서 버튼이 '안 눌리는' 것처럼 보임
function open(msg: string, buttons: { label: string; primary?: boolean; value: boolean }[]): Promise<boolean> {
  return new Promise(resolve => {
    const prevFocus = document.activeElement as HTMLElement | null
    const bg = document.createElement('div')
    bg.className = 'modal-bg'
    bg.style.zIndex = '1000'
    const box = document.createElement('div')
    box.className = 'card modal'
    box.setAttribute('role', 'alertdialog')
    box.setAttribute('aria-modal', 'true')
    box.style.maxWidth = '420px'
    const p = document.createElement('p')
    p.style.cssText = 'margin:0;white-space:pre-wrap;line-height:1.6;font-size:15px'
    p.textContent = msg
    const row = document.createElement('div')
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap'
    const done = (v: boolean) => { removeEventListener('keydown', key, true); bg.remove(); prevFocus?.focus?.(); resolve(v) }
    let primaryBtn: HTMLButtonElement | null = null
    for (const b of buttons) {
      const el = document.createElement('button')
      el.type = 'button'
      el.className = 'btn' + (b.primary ? ' primary' : ' ghost')
      el.textContent = b.label
      el.onclick = () => done(b.value)
      if (b.primary) primaryBtn = el
      row.appendChild(el)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); done(false) }
      if (e.key === 'Enter') { e.preventDefault(); done(true) }
    }
    addEventListener('keydown', key, true)
    bg.onclick = e => { if (e.target === bg) done(false) }
    box.append(p, row); bg.appendChild(box); document.body.appendChild(bg)
    ;(primaryBtn as HTMLButtonElement | null)?.focus()
  })
}

/** 확인 창: 확인 누르면 true */
export function ask(msg: string, ok = '확인', cancel = '취소') {
  return open(msg, [{ label: cancel, value: false }, { label: ok, primary: true, value: true }])
}
/** 알림 창 */
export function say(msg: string) {
  return open(msg, [{ label: '확인', primary: true, value: true }]).then(() => undefined)
}
