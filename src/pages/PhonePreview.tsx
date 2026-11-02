import { useEffect, useRef, useState } from 'react'

// PC에서 모두플레이를 휴대폰 화면으로 보여 주기: /phone
// 화면 가운데 휴대폰 틀 안에 실제 앱이 돌아감 (같은 로그인 그대로). 설명회·강사 교육·화면 녹화용
const DEVICES = [
  { id: 'iphone', name: 'iPhone', w: 390, h: 844, r: 54 },
  { id: 'galaxy', name: '갤럭시', w: 360, h: 780, r: 40 },
  { id: 'ipad', name: 'iPad mini', w: 744, h: 1133, r: 36 },
] as const
const PAGES: [string, string][] = [['/', '홈'], ['/board', '자료실'], ['/playlist', '플레이리스트'], ['/player', '연습 플레이어'], ['/me', '내 연습'], ['/saved', '내 보관함'], ['/apps', '추천 앱']]

export default function PhonePreview() {
  const [dev, setDev] = useState<(typeof DEVICES)[number]>(DEVICES[0])
  const [land, setLand] = useState(false)
  const [src, setSrc] = useState('/')
  const [scale, setScale] = useState(1)
  const stage = useRef<HTMLDivElement>(null)
  const frame = useRef<HTMLIFrameElement>(null)
  const W = land ? dev.h : dev.w, H = land ? dev.w : dev.h
  const B = 14 // 틀 두께

  // 창 크기에 맞춰 휴대폰 크기 줄이기
  useEffect(() => {
    const fit = () => {
      const el = stage.current; if (!el) return
      setScale(Math.min(1, (el.clientWidth - 24) / (W + B * 2), (el.clientHeight - 24) / (H + B * 2)))
    }
    fit(); window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [W, H])

  const go = (p: string) => { setSrc(p); try { frame.current?.contentWindow?.location.assign(p) } catch { /* 다음 렌더에서 src로 */ } }
  const btn = (on: boolean) => ({ padding: '8px 14px', borderRadius: 999, border: '1px solid ' + (on ? '#f3791f' : '#444'), background: on ? '#f3791f' : 'transparent', color: '#fff', font: 'inherit', fontSize: 13, cursor: 'pointer' })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(circle at 50% 30%, #2b2b2b, #111)', color: '#fff', display: 'flex', flexDirection: 'column', fontFamily: 'inherit' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid #2a2a2a' }}>
        <b style={{ marginRight: 8 }}>📱 모두플레이 휴대폰 미리 보기</b>
        {DEVICES.map(d => <button key={d.id} type="button" style={btn(dev.id === d.id)} onClick={() => setDev(d)}>{d.name}</button>)}
        <button type="button" style={btn(land)} onClick={() => setLand(v => !v)}>⟲ 가로</button>
        <span style={{ width: 1, height: 22, background: '#333', margin: '0 4px' }} />
        {PAGES.map(([p, l]) => <button key={p} type="button" style={btn(src === p)} onClick={() => go(p)}>{l}</button>)}
        <button type="button" style={btn(false)} onClick={() => frame.current?.contentWindow?.location.reload()}>↻ 새로고침</button>
        <a href="/" style={{ marginLeft: 'auto', color: '#bbb', fontSize: 13 }}>PC 화면으로 ↩</a>
      </div>
      <div ref={stage} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <div style={{ width: W + B * 2, height: H + B * 2, transform: `scale(${scale})`, transformOrigin: 'center', borderRadius: dev.r + B, background: '#0b0b0b', padding: B, boxShadow: '0 0 0 2px #3a3a3a, 0 30px 80px rgba(0,0,0,.6)', position: 'relative', flex: 'none' }}>
          {dev.id !== 'ipad' && !land && <div style={{ position: 'absolute', top: B + 10, left: '50%', transform: 'translateX(-50%)', width: dev.id === 'iphone' ? 120 : 14, height: dev.id === 'iphone' ? 34 : 14, borderRadius: 20, background: '#000', zIndex: 2 }} />}
          <iframe ref={frame} src={src} title="모두플레이 휴대폰 화면" style={{ width: W, height: H, border: 0, borderRadius: dev.r, background: '#fff', display: 'block' }} />
        </div>
      </div>
      <p style={{ margin: 0, padding: '8px 16px 12px', fontSize: 12, color: '#999', textAlign: 'center' }}>
        {dev.name} {W}×{H}{scale < 1 ? ` · 화면에 맞춰 ${Math.round(scale * 100)}%로 줄여 보여요` : ''} · 틀 안은 실제 앱이라 누르고 스크롤하고 재생할 수 있어요 (같은 로그인)
      </p>
    </div>
  )
}
