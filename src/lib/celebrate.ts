// 목표 달성 축하: 색종이 + 한 줄 메시지 (라이브러리 없이 캔버스로)
export function celebrate(message?: string) {
  if (typeof document === 'undefined') return
  try { navigator.vibrate?.([30, 40, 30]) } catch { /* 진동 없어도 됨 */ }
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const c = document.createElement('canvas')
  c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:200'
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  c.width = innerWidth * dpr; c.height = innerHeight * dpr
  document.body.appendChild(c)
  const g = c.getContext('2d')!
  g.scale(dpr, dpr)
  const colors = ['#f3791f', '#ffb37a', '#1a1a1a', '#ffd166', '#4a90d9', '#ef476f']
  const N = reduce ? 0 : 140
  const ps = Array.from({ length: N }, () => ({
    x: innerWidth / 2 + (Math.random() - .5) * 80, y: innerHeight * .35,
    vx: (Math.random() - .5) * 12, vy: -Math.random() * 12 - 4,
    r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3,
    w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, col: colors[(Math.random() * colors.length) | 0],
  }))
  let msg: HTMLDivElement | null = null
  if (message) {
    msg = document.createElement('div')
    msg.className = 'celebrate-msg'
    msg.textContent = '🎉 ' + message
    document.body.appendChild(msg)
  }
  const t0 = performance.now()
  const step = (t: number) => {
    const dt = Math.min(32, t - (step as any).last || 16) / 16; (step as any).last = t
    g.clearRect(0, 0, innerWidth, innerHeight)
    for (const p of ps) {
      p.vy += .35 * dt; p.vx *= .99; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.col; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore()
    }
    if (t - t0 < 2600) requestAnimationFrame(step)
    else { c.remove(); msg?.remove() }
  }
  requestAnimationFrame(step)
}
