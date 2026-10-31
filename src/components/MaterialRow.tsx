import { Link } from 'react-router-dom'
import type { Score } from '../lib/supabase'
import { BRAND } from '../lib/brand'
import { coachLabel, isAudioFile, isVideoOnly, kindOf, musicianOf, pickedBy, uploaderLabel, VIS_LABEL } from '../lib/materials'
import { useMyLadders } from '../lib/ladders'

// 종류 표시 (글자 배지)
export function KindBadge({ s }: { s: Score }) {
  const k = kindOf(s)
  return <span className={'kind-b' + (k === '교재' ? ' book' : k === '시범 영상' ? ' video' : '')} title={BRAND.kindHelp[k]}>{BRAND.kindShort[k] ?? k}</span>
}

// 자료 한 줄: 제목 · 종류 · 원곡 · 단계 · 올린 사람
export default function MaterialRow({ s, showScope }: { s: Score; showScope?: boolean }) {
  const student = s.uploader_role === 'student'
  const lad = useMyLadders()?.get(s.id)
  const extra = isVideoOnly(s) ? null : isAudioFile(s.file_path) ? '♪ 음원' : s.youtube_url ? '▶ 영상 있음' : null
  return (
    <Link to={`/score/${s.id}`} className="mat-row">
      <span className="txt">
        <span className="t">{s.title}</span>
        <span className="s">
          <KindBadge s={s} />
          {[s.major, ...(s.areas ?? []), musicianOf(s), s.level, extra].filter(Boolean).join(' · ')}
          {' · '}
          {pickedBy(s) ? <b className="by-co">🎁 {coachLabel(pickedBy(s))} 추천</b> : <b className={student ? 'by-st' : 'by-co'}>{uploaderLabel(s)}</b>}
          {student && <span className="st-badge">학생 자료</span>}
        </span>
      </span>
      <span className="side">
        {lad && <span className={'lad-b' + (lad.done_at ? ' done' : '')} title="내 템포 사다리">🪜 {lad.done_at ? '완주' : `♩${lad.best_bpm ?? '-'}/${lad.goal_bpm}`}</span>}
        {s.hidden ? <span className="muted">가려 둠</span>
          : showScope && s.visibility !== 'students' && s.visibility !== 'public' ? <span className="muted">{VIS_LABEL[s.visibility]}</span>
          : s.view_only ? <span className="muted">🔒 보기 전용</span> : null}
        <span className="go" aria-hidden="true">›</span>
      </span>
    </Link>
  )
}
