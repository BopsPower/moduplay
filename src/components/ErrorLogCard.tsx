import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Row = { id: number; at: string; user_id: string | null; build: string | null; url: string | null; kind: string | null; message: string | null; stack: string | null; ua: string | null }

const device = (ua: string | null) => !ua ? '' : /iPhone|iPad/.test(ua) ? '아이폰·아이패드' : /Android/.test(ua) ? '안드로이드' : /Mac/.test(ua) ? '맥' : /Windows/.test(ua) ? '윈도우' : '기타'

// 관리자 화면 › 앱 오류 기록 (학생·코치 화면에서 난 오류. 최근 50개)
export default function ErrorLogCard() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  async function load() {
    const { data } = await supabase.from('client_errors').select('*').order('at', { ascending: false }).limit(50)
    const list = (data ?? []) as Row[]; setRows(list)
    const ids = [...new Set(list.map(r => r.user_id).filter(Boolean))] as string[]
    if (ids.length) {
      const [{ data: s }, { data: t }] = await Promise.all([
        supabase.from('students').select('user_id, name').in('user_id', ids),
        supabase.from('teachers').select('user_id, name').in('user_id', ids),
      ])
      setNames(Object.fromEntries([...(s ?? []), ...(t ?? [])].map((x: any) => [x.user_id, x.name])))
    }
  }
  useEffect(() => { load() }, [])
  async function clearAll() {
    if (!confirm('오류 기록을 모두 지울까요? (앱 사용에는 영향 없어요)')) return
    await supabase.from('client_errors').delete().gt('id', 0); load()
  }
  const week = rows?.filter(r => Date.now() - new Date(r.at).getTime() < 7 * 864e5).length ?? 0
  return (
    <details className="card" style={{ padding: '14px 18px' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
        앱 오류 기록 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>{rows === null ? '' : rows.length ? `최근 7일 ${week}건` : '없음 👍'}</span>
      </summary>
      {rows && rows.length > 0 && (
        <>
          <ul className="rows" style={{ marginTop: 10, maxHeight: 420, overflow: 'auto' }}>
            {rows.map(r => (
              <li key={r.id} style={{ padding: '8px 4px', display: 'block' }}>
                <div style={{ fontSize: 13 }}><b>{r.message}</b></div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {new Date(r.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · {r.user_id ? names[r.user_id] ?? '회원' : '로그인 전'} · {device(r.ua)} · {r.url} · {r.kind} · 버전 {r.build}
                </div>
                {r.stack && <details><summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>자세히</summary><pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', margin: 0 }}>{r.stack}</pre></details>}
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button className="btn sm ghost" onClick={load}>새로 보기</button>
            <button className="btn sm ghost" onClick={clearAll}>모두 지우기</button>
          </div>
        </>
      )}
      <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>학생·코치 화면에서 오류가 나면 여기에 저절로 남아요. 같은 오류가 여러 사람에게 보이면 Claude에게 알려 주세요.</p>
    </details>
  )
}
