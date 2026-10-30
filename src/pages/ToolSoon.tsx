import { useParams } from 'react-router-dom'
import Shell from '../components/Shell'

// 연습 도구 자리 (아직 준비 중)
export default function ToolSoon() {
  const { id } = useParams()
  return (
    <Shell>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>연습 도구</p>
        <h1 className="title">연습 도구 {String(id ?? '').toUpperCase()}</h1>
      </div>
      <div className="card loading" style={{ padding: 32 }}>
        <p style={{ margin: '0 0 6px', fontWeight: 700, color: 'var(--ink)' }}>준비 중이에요</p>
        <p style={{ margin: 0 }}>곧 여기에서 바로 쓸 수 있는 연습 도구가 생겨요.</p>
      </div>
    </Shell>
  )
}
