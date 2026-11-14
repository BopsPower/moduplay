import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useMarks, COLORS, type Tool } from '../lib/marks'

// 악보에 쓰기 도구 막대 (쓰기를 켰을 때만 화면 위에 떠 있음, 보면대 화면 위에도)
// 코치·관리자: "누구에게" — 내 메모 / 담당 학생 고르기 (학생 화면에 '코치님 표시'로 보임)
const TOOLS: { k: Tool; label: string; icon: string }[] = [
  { k: 'pen', label: '펜', icon: '✏️' },
  { k: 'hl', label: '형광펜', icon: '🖍️' },
  { k: 'eraser', label: '지우개', icon: '🧽' },
  { k: 'text', label: '글자', icon: '🔤' },
]
const COLOR_NAME: Record<string, string> = { '#e5322d': '빨강', '#1f6feb': '파랑', '#111111': '검정', '#16a34a': '초록', '#f5c400': '노랑' }

type Stu = { id: string; name: string; major: string | null }

export default function MarkBar({ major }: { major?: string | null }) {
  const mk = useMarks()
  const { isTeacher, isAdmin } = useAuth()
  const [stus, setStus] = useState<Stu[] | null>(null)
  const [hint, setHint] = useState(true)
  const coach = isTeacher || isAdmin

  useEffect(() => {
    if (!mk?.drawing || !coach || stus) return
    // 코치는 담당 학생만, 관리자는 모든 학생 (권한은 DB가 거름)
    supabase.from('students').select('id, name, major').eq('active', true).order('name').then(({ data }) => setStus((data ?? []) as Stu[]))
  }, [mk?.drawing, coach, stus])
  useEffect(() => { if (mk?.drawing) { setHint(true); const t = setTimeout(() => setHint(false), 7000); return () => clearTimeout(t) } }, [mk?.drawing])

  if (!mk?.enabled || !mk.drawing) return null
  const sorted = stus ? [...stus].sort((a, b) => Number(b.major === major) - Number(a.major === major) || a.name.localeCompare(b.name)) : []
  const forStu = mk.target.startsWith('s:') ? stus?.find(s => 's:' + s.id === mk.target) : null

  return (
    <div className="markbar" role="toolbar" aria-label="악보에 쓰기 도구">
      <div className="mb-row">
        {TOOLS.map(t => (
          <button key={t.k} type="button" className={'mb-tool' + (mk.tool === t.k ? ' on' : '')} aria-pressed={mk.tool === t.k} aria-label={t.label} onClick={() => mk.setTool(t.k)}>
            <span aria-hidden="true">{t.icon}</span><small>{t.label}</small>
          </button>
        ))}
        <button type="button" className="mb-tool" disabled={!mk.canUndo} aria-label="되돌리기" onClick={mk.undo}><span aria-hidden="true">↶</span><small>되돌리기</small></button>
        <button type="button" className="mb-done" onClick={() => mk.setDrawing(false)}>✓ 완료</button>
      </div>
      <div className="mb-row mb-sub">
        <span className="mb-colors">
          {COLORS.map(c => (
            <button key={c} type="button" className={'mb-color' + (mk.color === c ? ' on' : '')} style={{ background: c }} aria-label={COLOR_NAME[c] ?? c} aria-pressed={mk.color === c} onClick={() => { mk.setColor(c); if (mk.tool === 'eraser') mk.setTool('pen') }} />
          ))}
        </span>
        {coach ? (
          <label className="mb-who">
            <span>누구에게</span>
            <select value={mk.target} onChange={e => mk.setTarget(e.target.value)}>
              <option value="me">📝 내 메모 (나만 보기)</option>
              {sorted.length > 0 && <optgroup label="🎓 학생에게 보여 주기">
                {sorted.map(s => <option key={s.id} value={'s:' + s.id}>{s.name}{s.major ? ` · ${s.major}` : ''}</option>)}
              </optgroup>}
            </select>
          </label>
        ) : <span className="mb-who">📝 내 메모 · 나만 봐요</span>}
        {mk.coachNames.length > 0 && (
          <label className="mb-chk"><input type="checkbox" checked={mk.showCoach} onChange={e => mk.setShowCoach(e.target.checked)} /> 코치님 표시</label>
        )}
        <span className={'mb-status ' + mk.status}>{mk.status === 'saving' ? '저장 중…' : mk.status === 'saved' ? '저장됨' : mk.status === 'error' ? '저장 못 함 · 다시 시도해요' : ''}</span>
      </div>
      {forStu && <p className="mb-note">🎓 <b>{forStu.name}</b> 학생 화면에 보여요. 학생은 보기만 할 수 있어요.</p>}
      {hint && !mk.penSeen && <p className="mb-note">한 손가락으로 쓰고, <b>두 손가락으로 밀면</b> 화면이 움직여요. 애플펜슬로 쓰면 손가락 하나로도 넘길 수 있어요.</p>}
    </div>
  )
}

// 떠 있는 '쓰기' 단추 (원장님 2026-11-14 "장수가 많은 pdf는 쓰는 기능이 위에 있어서 쓸 수가 없어")
// 위쪽 [✏️ 악보에 쓰기]가 화면 밖으로 올라가면 왼쪽 아래에 나타남 → 50쪽을 보다가도 바로 그 쪽에 쓰기
export function MarkFab() {
  const mk = useMarks()
  const on = !!mk?.enabled
  const [away, setAway] = useState(false)
  useEffect(() => {
    if (!on) return
    const el = document.getElementById('mk-entry')
    if (el && typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver(([e]) => setAway(!e.isIntersecting && e.boundingClientRect.top < 0))
      io.observe(el)
      return () => io.disconnect()
    }
    const f = () => setAway(window.scrollY > 400)
    f(); window.addEventListener('scroll', f, { passive: true })
    return () => window.removeEventListener('scroll', f)
  }, [on])
  if (!mk || !on || mk.drawing || !away) return null
  return (
    <button type="button" className="mk-fab" onClick={() => mk.setDrawing(true)} aria-label="악보에 쓰기 (지금 보는 쪽)">
      <span aria-hidden="true">✏️</span> 쓰기
    </button>
  )
}

// 악보 화면의 '쓰기' 단추 + 보이기 켜고 끄기
export function MarkEntry({ compact }: { compact?: boolean }) {
  const mk = useMarks()
  if (!mk?.enabled) return null
  if (compact) return (
    <button type="button" className={'x mk-entry' + (mk.drawing ? ' on' : '')} onClick={() => mk.setDrawing(!mk.drawing)} aria-pressed={mk.drawing}>✏️ {mk.drawing ? '쓰는 중' : '쓰기'}</button>
  )
  return (
    <>
      <button type="button" id="mk-entry" className={'btn sm' + (mk.drawing ? ' primary' : '')} onClick={() => mk.setDrawing(!mk.drawing)} aria-pressed={mk.drawing}>✏️ 악보에 쓰기</button>
      {mk.coachNames.length > 0 && !mk.drawing && (
        <button type="button" className={'btn sm' + (mk.showCoach ? '' : ' ghost')} onClick={() => mk.setShowCoach(!mk.showCoach)} aria-pressed={mk.showCoach}>🎓 코치님 표시 {mk.showCoach ? '켜짐' : '꺼짐'}</button>
      )}
      {mk.hasAny && !mk.drawing && (
        <button type="button" className={'btn sm' + (mk.show ? '' : ' ghost')} onClick={() => mk.setShow(!mk.show)} aria-pressed={mk.show}>📝 내 메모 {mk.show ? '보임' : '숨김'}</button>
      )}
    </>
  )
}
