// 화면 맞춤 점검 (주소 끝에 ?debug=fit 를 붙이면 켜짐, 이 탭에서만)
// - 화면 폭보다 삐져나간 요소 (옆으로 흔들림·잘림의 원인)
// - 아이폰에서 누르면 화면이 확대되는 작은 글씨(16px 미만) 입력칸
// 결과는 콘솔에 [fit] 로 찍음. 일반 사용자에게는 아무 영향 없음
const desc = (el: Element) => {
  const id = el.id ? '#' + el.id : ''
  const cls = typeof (el as HTMLElement).className === 'string' && (el as HTMLElement).className ? '.' + (el as HTMLElement).className.trim().split(/\s+/).slice(0, 3).join('.') : ''
  const txt = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24)
  return `${el.tagName.toLowerCase()}${id}${cls}${txt ? ` "${txt}"` : ''}`
}

export function fitCheck() {
  const vw = document.documentElement.clientWidth
  const out: string[] = [`vw=${vw} vh=${innerHeight} docScrollW=${document.documentElement.scrollWidth} bodyScrollW=${document.body.scrollWidth} dpr=${devicePixelRatio}`]
  const fixedOrClipped = (el: Element) => {
    for (let p: Element | null = el; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p)
      if (cs.position === 'fixed') return true
      if (p !== el && cs.overflowX !== 'visible') {
        const r = p.getBoundingClientRect()
        if (r.right <= vw + 1 && r.left >= -1) return true
      }
    }
    return false
  }
  const hits: Element[] = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    if (r.right <= vw + 1 && r.left >= -1) continue
    if (hits.some(h => h.contains(el))) continue
    if (fixedOrClipped(el)) continue
    hits.push(el)
    out.push(`OVER ${desc(el)} L${Math.round(r.left)} R${Math.round(r.right)} W${Math.round(r.width)}`)
    if (hits.length > 25) break
  }
  const small = [...document.querySelectorAll('input, select, textarea')].filter(i => {
    const t = (i as HTMLInputElement).type
    if (['range', 'checkbox', 'radio', 'hidden', 'file', 'button', 'submit', 'color'].includes(t)) return false
    return (i as HTMLElement).offsetParent !== null && parseFloat(getComputedStyle(i).fontSize) < 16
  })
  if (small.length) out.push('SMALLINPUT ' + small.slice(0, 10).map(i => `${desc(i)}(${getComputedStyle(i).fontSize})`).join(', '))
  console.log('[fit] ' + location.pathname + location.search + '\n' + out.join('\n'))
}

export function startFitCheck() {
  try {
    if (/[?&]debug=fit\b/.test(location.search)) sessionStorage.setItem('mp_fit', '1')
    if (/[?&]debug=off\b/.test(location.search)) sessionStorage.removeItem('mp_fit')
    if (sessionStorage.getItem('mp_fit') !== '1') return
  } catch { return }
  ;(window as unknown as { __fit: () => void }).__fit = fitCheck
  let last = ''
  let t = 0
  setInterval(() => {
    const k = location.pathname + location.search + innerWidth
    if (k !== last) { last = k; clearTimeout(t); t = window.setTimeout(fitCheck, 2500) }
  }, 500)
  // 화면을 다 그린 뒤 한 번 더 (느린 화면)
  addEventListener('scroll', () => { clearTimeout(t); t = window.setTimeout(fitCheck, 1500) }, { passive: true })
}

// 휴대폰·아이패드에서 글자 칸을 누르면(키보드가 올라오면) 아래 고정 막대가 입력칸을 가리지 않게 잠시 숨김
export function watchKeyboard() {
  const typing = (el: EventTarget | null) => {
    if (!(el instanceof HTMLElement)) return false
    if (el instanceof HTMLTextAreaElement) return true
    if (el instanceof HTMLInputElement) return !['range', 'checkbox', 'radio', 'button', 'submit', 'file', 'color'].includes(el.type)
    return el.isContentEditable
  }
  addEventListener('focusin', e => { if (typing(e.target)) document.body.classList.add('kb-open') })
  addEventListener('focusout', () => setTimeout(() => { if (!typing(document.activeElement)) document.body.classList.remove('kb-open') }, 50))
}
