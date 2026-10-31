// 성과 카드 그리기: 인스타 스토리 크기(1080×1920) PNG
// 글자는 캔버스에 직접 (주아 글꼴), 캐릭터는 SVG를 그림으로 얹음
export type CardInput =
  | { kind: 'week'; range: string; seconds: number; days: number[]; streak: number; badges: number }
  | { kind: 'ladder'; start: number; goal: number; steps: number[]; title: string }
  | { kind: 'badge'; icon: string; name: string; how: string; item?: string; owned: number; total: number }

export type Who = { name: string | null; tag: string }

export const HASHTAG = '#모두의음악버클리음대동문실용음악학원'
const W = 1080, H = 1920
const INK = '#1d1a17', LIME = '#c6f432', PINK = '#ff4fa3'
const F = (px: number) => `${px}px Jua, 'Noto Sans KR', sans-serif`

let fontReady: Promise<unknown> | null = null
export function loadCardFont() {
  if (!fontReady) {
    if (!document.querySelector('link[data-jua]')) {
      const l = document.createElement('link')
      l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Jua&display=swap'; l.dataset.jua = '1'
      document.head.appendChild(l)
    }
    fontReady = new Promise(r => setTimeout(r, 50))
      .then(() => document.fonts.load(F(60), '모두의음악 연습 0123'))
      .catch(() => null)
  }
  return fontReady
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath()
}
/** 스티커 느낌: 검은 테두리 + 오른쪽 아래 그림자 */
function sticker(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, shadow = 12) {
  if (shadow) { g.fillStyle = INK; rr(g, x + shadow, y + shadow, w, h, r); g.fill() }
  g.fillStyle = fill; rr(g, x, y, w, h, r); g.fill()
  g.lineWidth = 6; g.strokeStyle = INK; g.stroke()
}
function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, color: string, align: CanvasTextAlign = 'left', maxW?: number) {
  g.font = F(px); g.fillStyle = color; g.textAlign = align; g.textBaseline = 'alphabetic'
  if (maxW) {
    let t = s
    while (t.length > 1 && g.measureText(t).width > maxW) t = t.slice(0, -1)
    if (t !== s) t = t.slice(0, -1) + '…'
    g.fillText(t, x, y)
  } else g.fillText(s, x, y)
}
function pill(g: CanvasRenderingContext2D, s: string, cx: number, y: number, px: number, bg: string, fg: string) {
  g.font = F(px)
  const w = g.measureText(s).width + px * 1.4, h = px * 1.8
  sticker(g, cx - w / 2, y, w, h, h / 2, bg, 0)
  text(g, s, cx, y + h * 0.68, px, fg, 'center')
  return w
}

function loadSvg(svg: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.onload = () => res(img); img.onerror = rej
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })
}

export const fmtHM = (sec: number) => {
  const m = Math.round(sec / 60), h = Math.floor(m / 60)
  return h ? `${h}시간 ${m % 60}분` : `${m}분`
}

function footer(g: CanvasRenderingContext2D, who: Who, extra: string, dark: boolean) {
  const sub = dark ? '#b9b3c9' : '#3c3a2a', main = dark ? '#ffffff' : INK
  const parts = [who.name, '모두의음악 · MODU PLAY', extra].filter(Boolean).join(' · ')
  text(g, parts, 72, H - 132, 38, main, 'left', W - 144)
  text(g, HASHTAG, 72, H - 76, 38, sub, 'left', W - 144)
}

/** 카드 그리기. charSvg: 캐릭터 SVG 문자열(200×240 비율) */
export async function drawCard(input: CardInput, charSvg: string, who: Who): Promise<HTMLCanvasElement> {
  await loadCardFont()
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const g = c.getContext('2d')!
  const char = await loadSvg(charSvg).catch(() => null)
  const drawChar = (cx: number, top: number, w: number) => { if (char) g.drawImage(char, cx - w / 2, top, w, w * 1.2) }

  if (input.kind === 'week') {
    g.fillStyle = '#141225'; g.fillRect(0, 0, W, H)
    text(g, 'MODU PLAY · 이번 주 연습', 72, 120, 40, LIME)
    text(g, input.range, W - 72, 120, 38, '#b9b3c9', 'right')
    drawChar(W / 2, 170, 600)
    text(g, who.name ?? '', W / 2, 960, 84, '#ffffff', 'center', W - 144)
    text(g, '#' + who.tag, W / 2, 1020, 42, LIME, 'center')
    text(g, '이번 주 연습', W / 2, 1110, 42, '#b9b3c9', 'center')
    text(g, fmtHM(input.seconds), W / 2, 1260, 150, LIME, 'center', W - 120)
    const names = ['월', '화', '수', '목', '금', '토', '일'], sz = 104, gap = 20
    const x0 = (W - (7 * sz + 6 * gap)) / 2
    input.days.forEach((s, i) => {
      const m = s / 60
      const col = m < 1 ? '#2c2840' : m < 45 ? '#5e7a1c' : m < 70 ? '#9cc22a' : LIME
      sticker(g, x0 + i * (sz + gap), 1320, sz, sz, 26, col, 0)
      text(g, names[i], x0 + i * (sz + gap) + sz / 2, 1320 + sz + 50, 36, '#b9b3c9', 'center')
    })
    const a = `🔥 ${input.streak}일 연속`, b = `배지 ${input.badges}개`
    g.font = F(44)
    const wa = g.measureText(a).width + 62, wb = g.measureText(b).width + 62
    const sx = (W - wa - wb - 30) / 2
    pill(g, a, sx + wa / 2, 1540, 44, PINK, INK)
    pill(g, b, sx + wa + 30 + wb / 2, 1540, 44, '#ffffff', INK)
    footer(g, { ...who, name: null }, '', true)
  }

  if (input.kind === 'ladder') {
    g.fillStyle = LIME; g.fillRect(0, 0, W, H)
    text(g, 'MODU PLAY · 템포 사다리', 72, 120, 40, INK)
    pill(g, '완주!', W - 150, 72, 40, INK, LIME)
    text(g, `♩${input.start} → ♩${input.goal}`, 72, 330, 140, INK, 'left', W - 144)
    text(g, input.title, 72, 420, 52, INK, 'left', W - 144)
    text(g, `${input.steps.length}단계 완주`, 72, 485, 40, '#3c3a2a')
    const n = input.steps.length, gap = 16, bw = (W - 144 - gap * (n - 1)) / n, base = 900
    input.steps.forEach((bpm, i) => {
      const h = 70 + (n === 1 ? 300 : (i / (n - 1)) * 300)
      const x = 72 + i * (bw + gap)
      g.fillStyle = i === n - 1 ? PINK : INK; rr(g, x, base - h, bw, h + 6, 22); g.fill()
      g.lineWidth = 6; g.strokeStyle = INK; g.stroke()
      if (bw > 40) text(g, String(bpm), x + bw / 2, base - h - 18, Math.min(38, bw * 0.45), INK, 'center')
    })
    drawChar(W / 2, 1000, 600)
    footer(g, who, '', false)
  }

  if (input.kind === 'badge') {
    g.fillStyle = '#ffd6e8'; g.fillRect(0, 0, W, H)
    text(g, 'MODU PLAY · 새 배지', 72, 120, 40, INK)
    g.fillStyle = INK; g.beginPath(); g.arc(W / 2 + 12, 380 + 12, 200, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(W / 2, 380, 200, 0, Math.PI * 2); g.fill()
    g.lineWidth = 8; g.strokeStyle = INK; g.stroke()
    g.font = `190px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'
    g.fillText(input.icon, W / 2, 392); g.textBaseline = 'alphabetic'
    text(g, input.name, W / 2, 750, 120, INK, 'center', W - 120)
    text(g, input.how, W / 2, 830, 46, INK, 'center', W - 144)
    if (input.item) {
      const s = `✨ ${input.item} 아이템이 열렸어요`
      g.font = F(42)
      const w = g.measureText(s).width + 70
      sticker(g, (W - w) / 2, 880, w, 84, 30, INK, 0)
      text(g, s, W / 2, 935, 42, '#ffffff', 'center')
    }
    drawChar(W / 2, 1020, 600)
    footer(g, who, `배지 ${input.owned} / ${input.total}`, false)
  }
  return c
}

export function canvasBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('그림을 만들지 못했어요'))), 'image/png'))
}
