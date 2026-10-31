import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../../components/Shell'
import BulkUpload from '../../components/BulkUpload'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'

// PC에서 악보 여러 개를 한꺼번에 올리기 (예전 '과제·악보' 화면의 일괄 올리기만 남김)
export default function BulkPage() {
  const { session } = useAuth()
  const [titles, setTitles] = useState<string[]>([])
  const load = () => { supabase.from('scores').select('title').neq('visibility', 'admin').then(({ data }) => setTitles((data ?? []).map(r => r.title as string))) }
  useEffect(load, [])
  return (
    <Shell>
      <Link to="/upload" className="muted" style={{ fontSize: 14 }}>← 자료 하나 올리기</Link>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>파일 여러 개나 폴더를 끌어다 놓으세요</p>
        <h1 className="title">여러 개 한꺼번에 올리기</h1>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>올린 뒤에 각 자료를 열어 <b>정보 고치기</b>에서 종류·단계·원곡·유튜브 영상을 더할 수 있어요. <Link to="/board" style={{ color: 'var(--accent-deep)' }}>자료실에서 확인 ›</Link></p>
      <BulkUpload createdBy={session?.user.id} existingTitles={titles} onDone={load} />
    </Shell>
  )
}
