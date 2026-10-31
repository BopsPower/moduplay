import { Link } from 'react-router-dom'
import type { Score } from '../lib/supabase'
import { isAudioFile, isVideoOnly, kindOf, uploaderLabel, VIS_LABEL } from '../lib/materials'

// 종류 표시 (글자 배지)
export function KindBadge({ s }: { s: Score }) {
  const k = kindOf(s)
  return <span className={'kind-b' + (k === '교재' ? ' book' : k === '시범 영상' ? ' video' : '')}>{k === '시범 영상' ? '▶ 시범 영상' : k}</span>
}

// 자료 한 줄: 제목 · 종류 · 원곡 · 단계 · 올린 사람
export default function MaterialRow({ s, showScope }: { s: Score; showScope?: boolean }) {
  const student = s.uploader_role === 'student'
  const extra = isVideoOnly(s) ? null : isAudioFile(s.file_path) ? '♪ 음원' : s.youtube_url ? '▶ 영상 있음' : null
  return (
    <Link to={`/score/${s.id}`} className="mat-row">
      <span className="txt">
        <span className="t">{s.title}</span>
        <span className="s">
          <KindBadge s={s} />
          {[s.major, ...(s.areas ?? []), s.artist, s.level, extra].filter(Boolean).join(' · ')}
          {' · '}
          <b className={student ? 'by-st' : 'by-co'}>{uploaderLabel(s)}</b>
          {student && <span className="st-badge">학생 자료</span>}
        </span>
      </span>
      <span className="side">
        {s.hidden ? <span className="muted">가려 둠</span>
          : showScope && s.visibility !== 'students' && s.visibility !== 'public' ? <span className="muted">{VIS_LABEL[s.visibility]}</span>
          : s.view_only ? <span className="muted">🔒 보기 전용</span> : null}
        <span className="go" aria-hidden="true">›</span>
      </span>
    </Link>
  )
}
