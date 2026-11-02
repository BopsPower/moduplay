import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ENS_PARTS, ensNo, ensPart } from '../lib/ensemble'

// 앙상블 MR 화면 위: 같은 곡의 다른 버전(원곡 · 전체 반주 · 파트 빼고 · 리드시트)으로 바로 바꾸기
export default function EnsembleSwitch({ id, tags }: { id: string; tags?: string[] | null }) {
  const no = ensNo(tags)
  const [list, setList] = useState<{ id: string; part: string }[]>([])
  useEffect(() => {
    if (no == null) return
    supabase.from('scores').select('id,tags').contains('tags', [`auto:ens:${no}`]).then(({ data }) => {
      const rows = (data ?? []).map(r => ({ id: r.id as string, part: ensPart(r.tags as string[]) ?? '' })).filter(r => r.part)
      setList(rows.sort((a, b) => ENS_PARTS.indexOf(a.part as any) - ENS_PARTS.indexOf(b.part as any)))
    })
  }, [no])
  if (no == null || list.length < 2) return null
  return (
    <div className="ens-row" style={{ margin: '4px 0 8px' }} aria-label="같은 곡 다른 버전">
      <span className="muted ens-lab">🎸 앙상블 {no}번</span>
      {list.map(r => r.id === id
        ? <span key={r.id} className="btn sm primary" aria-current="page">{r.part}</span>
        : <Link key={r.id} to={`/score/${r.id}`} className="btn sm ghost">{r.part}</Link>)}
    </div>
  )
}
