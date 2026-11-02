import { useEffect, useState } from 'react'

// 악보·PDF 여는 동안 보여 주는 재미있는 기다림 화면
// 오선 위에서 통통 튀는 음표(눌러서 잡기) + 연습 팁이 돌아가며 나옴
const TIPS = [
  '기다리는 동안 손가락 스트레칭 한 번! 🖐️',
  '오늘 연습할 마디를 먼저 정해 두면 집중이 잘 돼요 🎯',
  '느리게 정확히 → 한 칸씩 빠르게 🪜',
  '어깨 힘 빼고, 숨 한 번 크게 🌬️',
  '메트로놈은 오른쪽 아래 연습 도구에 있어요 ⏱️',
  '물 한 모금 마시고 시작해요 💧',
  '튜닝은 다 됐나요? 🎸',
  '어려운 마디는 구간 반복으로 열 번! 🔁',
  '틀려도 괜찮아요. 천천히가 제일 빨라요 🐢',
]
const NOTES = ['♪', '♫', '♩', '♬', '♪']

export default function MusicLoader({ label = '악보를 펼치는 중', sub }: { label?: string; sub?: string }) {
  const [i, setI] = useState(() => Math.floor(Math.random() * TIPS.length))
  const [sec, setSec] = useState(0)
  const [caught, setCaught] = useState(0)
  const [popped, setPopped] = useState<number[]>([])
  useEffect(() => {
    const a = window.setInterval(() => setI(n => (n + 1) % TIPS.length), 3200)
    const b = window.setInterval(() => setSec(s => s + 1), 1000)
    return () => { window.clearInterval(a); window.clearInterval(b) }
  }, [])
  const catchNote = (k: number) => {
    if (popped.includes(k)) return
    setCaught(c => c + 1); setPopped(p => [...p, k])
    window.setTimeout(() => setPopped(p => p.filter(x => x !== k)), 900)
  }
  return (
    <div className="mloader" role="status" aria-live="polite">
      <div className="ml-staff" aria-hidden="true">
        {[0, 1, 2, 3, 4].map(l => <i key={l} style={{ top: 18 + l * 14 }} />)}
        {NOTES.map((n, k) => (
          <button key={k} type="button" tabIndex={-1} className={'ml-note' + (popped.includes(k) ? ' pop' : '')}
            style={{ left: `${8 + k * 19}%`, animationDelay: `${k * 0.18}s` }} onClick={() => catchNote(k)}>{n}</button>
        ))}
      </div>
      <b className="ml-t">{label}<span className="ml-dots"><span>.</span><span>.</span><span>.</span></span></b>
      {sub && <span className="ml-sub">{sub}</span>}
      <span className="ml-tip" key={i}>{TIPS[i]}</span>
      <span className="ml-meta">
        {caught > 0 ? `🎵 음표 ${caught}개 잡았어요!` : '통통 튀는 음표를 눌러 잡아 보세요'}
        {sec >= 8 && ' · 큰 파일은 조금 더 걸려요'}
      </span>
    </div>
  )
}
