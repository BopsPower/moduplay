import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react'
import { useLocation } from 'react-router-dom'

// 처음 들어온 사람에게 화면을 하나씩 짚어 주는 안내 (학생용 · 코치용)
type Step = { find: () => Element | null; title: string; body: string }
type Who = 'student' | 'coach'

const visible = (el: Element | null) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
// 메뉴 링크: 휴대폰은 아래 탭, PC는 위쪽 메뉴 중 보이는 것
const navLink = (href: string) => () => [...document.querySelectorAll(`.tabbar nav a[href="${href}"], header.top nav a[href="${href}"]`)].find(visible) ?? null
const one = (sel: string) => () => [...document.querySelectorAll(sel)].find(visible) ?? null
const tools = one('.tools-fab, .tools-pill')

const STEPS: Record<Who, Step[]> = {
  student: [
    { find: one('.pcard'), title: '오늘의 연습', body: '메트로놈·악보 음원·유튜브를 켜 두면 연습 시간이 저절로 쌓여요. 누르면 연습 잔디와 뮤지션 배지를 볼 수 있어요. 이 기록은 나만 봐요 🔒' },
    { find: tools, title: '연습 도구', body: '메트로놈 · 스톱워치 · 횟수 세기를 어느 화면에서든 꺼내 쓸 수 있어요.' },
    { find: navLink('/board'), title: '자료실', body: '코치님과 친구들이 올린 악보·음원·영상이 모여 있어요. 연습 플레이어(느리게·구간 반복)도 여기 있어요.' },
    { find: navLink('/playlist'), title: '플레이리스트', body: '전공별로 들어 보면 좋은 곡을 모아 뒀어요.' },
    { find: navLink('/saved'), title: '내 보관함', body: '자료에서 ☆를 누르면 여기 모여요. 자주 보는 악보를 저장해 두세요.' },
  ],
  coach: [
    { find: one('.page-head a[href="/upload"]'), title: '자료 올리기', body: 'PDF·악보·음원·유튜브 링크를 올려요. 아껴 둔 자료는 "보기 전용"을 체크하면 다운로드·프린트가 막혀요.' },
    { find: navLink('/board'), title: '자료실', body: '학생에게 공개된 자료 모음이에요. 자료 화면에서 QR을 뽑아 종이 악보에 붙일 수 있어요.' },
    { find: navLink('/lounge'), title: '코치 라운지', body: '코치끼리만 보는 자료, 학생의 확인 요청·자료 요청을 한 곳에서 처리해요.' },
    { find: navLink('/teacher'), title: '내 학생', body: '학생을 등록하고 초대 링크를 카톡으로 보내 연결해요.' },
    { find: tools, title: '연습 도구', body: '수업 중에도 메트로놈 · 스톱워치 · 횟수 세기를 바로 꺼내 쓸 수 있어요.' },
  ],
}

const key = (w: Who) => 'mp_tour_' + w
export function tourDone(w: Who) { try { return localStorage.getItem(key(w)) === '1' } catch { return true } }
function setDone(w: Who) { try { localStorage.setItem(key(w), '1') } catch { /* 무시 */ } window.dispatchEvent(new Event('mp-tour')) }
export function restartTour() { try { localStorage.removeItem(key('student')); localStorage.removeItem(key('coach')) } catch { /* 무시 */ } }

// 지금 화면이 코치 메뉴인지 (코치 라운지 링크가 보이면 코치)
const whoNow = (): Who => navLink('/lounge')() ? 'coach' : 'student'

export default function Tour() {
  const loc = useLocation()
  const [who, setWho] = useState<Who | null>(null)
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [, tick] = useState(0)

  // 화면이 그려진 뒤 누구용인지 정하고, 아직 안 봤으면 시작
  useEffect(() => {
    const t = setTimeout(() => {
      const w = whoNow()
      const force = new URLSearchParams(loc.search).get('tour') === '1'
      if (force || !tourDone(w)) { setWho(w); setI(0) }
    }, 700)
    return () => clearTimeout(t)
  }, [loc.key])

  const steps = who ? STEPS[who].filter(s => s.find()) : []
  const step = steps[i]

  useLayoutEffect(() => {
    if (!step) return
    const el = step.find()
    if (!el) return
    const r0 = el.getBoundingClientRect()
    const fixed = getComputedStyle(el).position === 'fixed' || !!el.closest('.tabbar')
    if (!fixed && (r0.top < 70 || r0.bottom > innerHeight - 220)) el.scrollIntoView({ block: 'center' })
    const upd = () => { const e = step.find(); if (e) setRect(e.getBoundingClientRect()) }
    upd(); const t = setTimeout(upd, 350)
    addEventListener('resize', upd); addEventListener('scroll', upd, true)
    return () => { clearTimeout(t); removeEventListener('resize', upd); removeEventListener('scroll', upd, true) }
  }, [who, i, step])

  useEffect(() => { const f = () => tick(n => n + 1); addEventListener('mp-tour', f); return () => removeEventListener('mp-tour', f) }, [])

  if (!who || !step || !rect) return null
  const finish = () => { setDone(who); setWho(null); setRect(null); if (location.search.includes('tour=1')) history.replaceState(history.state, '', location.pathname) }
  const last = i === steps.length - 1
  const pad = 6
  const box = { left: rect.left - pad, top: rect.top - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
  const below = rect.top + rect.height / 2 < innerHeight / 2
  const tipW = Math.min(340, innerWidth - 24)
  const tipLeft = Math.max(12, Math.min(innerWidth - tipW - 12, rect.left + rect.width / 2 - tipW / 2))
  const tipStyle: CSSProperties = below
    ? { left: tipLeft, top: box.top + box.height + 12, width: tipW }
    : { left: tipLeft, bottom: innerHeight - box.top + 12, width: tipW }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="화면 안내">
      <div className="tour-hole" style={box} />
      <div className="tour-tip" style={tipStyle}>
        <span className="tour-n">{i + 1} / {steps.length}</span>
        <b>{step.title}</b>
        <p>{step.body}</p>
        <div className="tour-btns">
          <button type="button" className="linkish" onClick={finish}>건너뛰기</button>
          <span style={{ flex: 1 }} />
          {i > 0 && <button type="button" className="btn sm" onClick={() => setI(i - 1)}>이전</button>}
          <button type="button" className="btn sm primary" onClick={() => last ? finish() : setI(i + 1)}>{last ? '시작하기 🎉' : '다음'}</button>
        </div>
      </div>
    </div>
  )
}
