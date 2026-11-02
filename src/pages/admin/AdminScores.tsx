import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Shell from '../../components/Shell'
import { BRAND } from '../../lib/brand'
import { matches } from '../../lib/search'
import { supabase, type Score, type Teacher } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import BulkUpload from '../../components/BulkUpload'
import { cacheGet, cacheSet } from '../../lib/idbCache'
import { kindOf } from '../../lib/materials'
import { ask, say } from '../../lib/dialog'
const ReviewModal = lazy(() => import('../../components/ReviewModal'))

// 목록에 필요한 칸만 (전부 받으면 느려서)
const COLS = 'id,title,artist,composer,category,tempo,file_path,visibility,created_by,created_at,description,convert_status,convert_error,major,kind,hidden,tags'
const CACHE = 'admin-scores-v3'
// Claude가 자동으로 정리한 표시 (화면엔 안 보이는 태그)
const AUTO: [string, string][] = [['auto:뮤지션', '뮤지션·장르 자동으로 넣음'], ['auto:종류', '테크닉 연습으로 자동 분류'], ['auto:확인필요', '확인 필요 (뮤지션 못 찾음·애매함)'], ['auto:파트', '🎼 파트별로 나눈 악보'], ['auto:파트원본', '파트 나누기 끝난 원본 합본']]
const PREF = 'mp_admin_scores_filter'
const VIS_NAME: Record<string, string> = { students: '학원 전체', mine: '올린 코치의 학생만', coaches: '코치끼리만', review: '담당 코치 검수 (그 전공 코치만)', admin: '관리자만' }
const pref = (() => { try { return JSON.parse(localStorage.getItem(PREF) ?? '{}') } catch { return {} } })()

// 관리자 화면 › 악보 전체: 누가 올렸든 모든 악보를 찾아보고 공개 범위를 바꾸거나 삭제
export default function AdminScores() {
  const { session } = useAuth()
  const [scores, setScores] = useState<Score[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  // 검색어·거르기는 기억해 두었다가 다시 열 때 그대로
  const [q, setQ] = useState<string>(pref.q ?? '')
  const [by, setBy] = useState<string>(pref.by ?? '')
  const [vf, setVf] = useState<string>(({ students: 'live', mine: 'live', selected: 'live' } as Record<string, string>)[pref.vf] ?? pref.vf ?? '') // 상태로 거르기: live(공개됨)·admin(검수 전)·review·coaches
  const [showOrig, setShowOrig] = useState<boolean>(!!pref.showOrig) // 파트로 나눈 원본 합본·숨긴 악보도 보기
  const [af, setAf] = useState<string>(pref.af ?? '') // 자동 정리 표시로 거르기
  const [mf, setMf] = useState<string>(pref.mf ?? '') // 전공으로 거르기 ('공통' = 전공 없음)
  const [kf, setKf] = useState<string>(pref.kf ?? '') // 종류로 거르기
  const [syncing, setSyncing] = useState(false) // 기억해 둔 목록을 보여 주면서 최신으로 맞추는 중
  const [loaded, setLoaded] = useState(false)
  const [limit, setLimit] = useState(200) // 한 번에 그리는 개수
  // 여러 개 골라 한 번에 바꾸기
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [bKind, setBKind] = useState(''), [bMajor, setBMajor] = useState('-'), [bVis, setBVis] = useState('')
  const [bBusy, setBBusy] = useState(false)
  const [review, setReview] = useState<number | null>(null) // 검수 창 (보이는 목록에서 몇 번째)
  const [edit, setEdit] = useState<Score | null>(null) // 고치는 중인 악보
  const [saving, setSaving] = useState(false)

  // 1) 이 브라우저에 기억해 둔 목록을 바로 보여 주고  2) 뒤에서 최신 목록을 받아 바꿔 끼움
  async function load() {
    setSyncing(true)
    const [{ count }, { data: t }] = await Promise.all([
      supabase.from('scores').select('id', { count: 'exact', head: true }),
      supabase.from('teachers').select('*').order('name'),
    ])
    setTeachers(t ?? [])
    // 동시에 여러 개를 받으면 서버가 8초 제한에 걸려서, 1000개씩 차례로 (기억해 둔 목록은 그동안 그대로 보임)
    const all: Score[] = []
    for (let from = 0; from < Math.max(1, count ?? 0); from += 1000) {
      const { data, error } = await supabase.from('scores').select(COLS).order('created_at', { ascending: false }).order('id').range(from, from + 999)
      if (error) { setSyncing(false); return }
      all.push(...((data ?? []) as unknown as Score[]))
      if (!data || data.length < 1000) break
    }
    setScores(all); setLoaded(true); setSyncing(false)
    cacheSet(CACHE, { at: Date.now(), rows: all, teachers: t ?? [] })
  }
  useEffect(() => {
    cacheGet<{ rows: Score[]; teachers: Teacher[] }>(CACHE).then(c => {
      if (c?.rows?.length) { setScores(s => s.length ? s : c.rows); setTeachers(x => x.length ? x : c.teachers ?? []); setLoaded(true) }
    })
    load()
  }, [])
  useEffect(() => { try { localStorage.setItem(PREF, JSON.stringify({ q, by, vf, af, mf, kf, showOrig })) } catch { /* 무시 */ } }, [q, by, vf, af, mf, kf, showOrig])
  // 한 개만 바뀐 건 전체를 다시 받지 않고 그 자리에서 고치기
  function patch(id: string, ch: Partial<Score> | null) {
    setScores(list => {
      const next = ch ? list.map(x => x.id === id ? { ...x, ...ch } : x) : list.filter(x => x.id !== id)
      cacheSet(CACHE, { at: Date.now(), rows: next, teachers })
      return next
    })
  }

  const who = (sc: Score) => teachers.find(t => t.user_id && t.user_id === sc.created_by)?.name ?? ''
  // 사운드슬라이스에서 가져와 변환 보류(hold)인 악보는 공개 범위를 바꾸는 순간 변환 시작
  async function setVis(sc: Score, v: Score['visibility']) {
    const start = (sc as any).convert_status === 'hold' && v !== 'admin' && v !== 'review'
    const ch: any = start ? { visibility: v, convert_status: 'pending', convert_error: null } : { visibility: v }
    const { error } = await supabase.from('scores').update(ch).eq('id', sc.id)
    if (error) return say('바꾸지 못했어요: ' + error.message)
    patch(sc.id, ch)
  }
  async function save() {
    if (!edit) return
    if (!edit.title.trim()) return say('제목을 입력해 주세요.')
    setSaving(true)
    const ch = {
      title: edit.title.trim(), artist: edit.artist?.trim() || null,
      // 뮤지션을 직접 채우면 '확인 필요' 표시는 뗌
      ...(edit.artist?.trim() && (edit.tags ?? []).includes('auto:확인필요') ? { tags: (edit.tags ?? []).filter(t => t !== 'auto:확인필요') } : {}), composer: edit.composer?.trim() || null, major: edit.major || null, kind: kindOf(edit),
      tempo: edit.tempo || null, description: edit.description?.trim() || null, visibility: edit.visibility,
    }
    const { error } = await supabase.from('scores').update(ch).eq('id', edit.id)
    setSaving(false)
    if (error) return say('저장하지 못했어요: ' + error.message)
    patch(edit.id, ch); setEdit(null)
  }
  async function remove(sc: Score) {
    if (!await ask(`"${sc.title}" 자료를 삭제할까요? 댓글·보관함 기록도 함께 사라지고 되돌릴 수 없어요.`)) return
    if (sc.file_path) await supabase.storage.from('scores').remove([sc.file_path])
    const { error } = await supabase.from('scores').delete().eq('id', sc.id)
    if (error) return say('삭제하지 못했어요: ' + error.message)
    patch(sc.id, null)
  }

  const uploaders = [...new Set(scores.map(who))]
  const visNorm = (v: string) => v === 'public' ? 'students' : v // 예전 값 '학원 전체'
  const hitQ = (sc: Score) => matches(q, sc.title, sc.artist, sc.composer, sc.major, kindOf(sc), BRAND.kindLabel[kindOf(sc)] ?? '', who(sc), (sc.tags ?? []).join(' '))
  // 거르기: 전공·종류·공개 범위·올린 사람·자동 정리. 옆 숫자는 검색어와 '다른' 거르기를 모두 반영한 개수
  const majorOf = (sc: Score) => sc.major || '공통'
  // 상태 묶음: 검수 전(관리자만) / 코치 검수 중 / 코치끼리만 / 공개됨(학생에게 보임)
  const stOf = (sc: Score) => { const v = visNorm(sc.visibility); return v === 'admin' || v === 'review' || v === 'coaches' ? v : 'live' }
  const keys = { m: majorOf, k: (sc: Score) => kindOf(sc), v: stOf, b: who } as const
  const want = { m: mf, k: kf, v: vf, b: by }
  // 기본으로 숨김: 파트로 나눈 뒤의 원본 합본(같은 곡이 겹쳐 보여서)·숨긴 악보(빈 파트·시스템)
  const extra = (sc: Score) => showOrig || af === 'auto:파트원본' || (!(sc.tags ?? []).includes('auto:파트원본') && !sc.hidden)
  const hasAuto = (sc: Score) => extra(sc) && (!af || (sc.tags ?? []).includes(af))
  const passExcept = (sc: Score, skip: keyof typeof keys | '') => (Object.keys(keys) as (keyof typeof keys)[]).every(d => d === skip || !want[d] || keys[d](sc) === want[d])
  const shown = scores.filter(sc => passExcept(sc, '') && hasAuto(sc) && hitQ(sc))
  const counts = (() => {
    const c = { m: new Map<string, number>(), k: new Map<string, number>(), v: new Map<string, number>(), b: new Map<string, number>() }
    const tot = { m: 0, k: 0, v: 0, b: 0 }
    for (const sc of scores) {
      if (!hasAuto(sc) || !hitQ(sc)) continue
      for (const d of Object.keys(keys) as (keyof typeof keys)[]) {
        if (!passExcept(sc, d)) continue
        tot[d]++; const key = keys[d](sc); c[d].set(key, (c[d].get(key) ?? 0) + 1)
      }
    }
    return { c, tot }
  })()
  const byCount = counts.c.b, visCount = counts.c.v, byTotal = counts.tot.b, visTotal = counts.tot.v
  const n = (x?: number) => ` (${(x ?? 0).toLocaleString()})`

  function toggle(id: string) { setSel(x => { const n = new Set(x); n.has(id) ? n.delete(id) : n.add(id); return n }) }
  async function applyBulk() {
    const ids = [...sel]; if (!ids.length) return
    const ch: Partial<Score> = {}
    if (bKind) ch.kind = bKind
    if (bMajor !== '-') ch.major = bMajor || null
    if (!bKind && bMajor === '-' && !bVis) return say('바꿀 항목(종류·전공·공개 범위)을 하나 이상 골라 주세요.')
    const byId = new Map(scores.map(x => [x.id, x]))
    const startIds = bVis && bVis !== 'admin' && bVis !== 'review' ? ids.filter(id => (byId.get(id) as any)?.convert_status === 'hold') : []
    const what = [bKind && `종류 → ${BRAND.kindLabel[bKind] ?? bKind}`, bMajor !== '-' && `전공 → ${bMajor || '공통'}`, bVis && `공개 범위 → ${VIS_NAME[bVis]}`].filter(Boolean).join('\n')
    if (!await ask(`고른 ${ids.length.toLocaleString()}개를 이렇게 바꿀까요?\n\n${what}` + (startIds.length ? `\n\n⚠️ 변환 보류 중인 ${startIds.length.toLocaleString()}개는 공개되면서 변환(소리·악보 그림 만들기)이 시작돼요. 개수가 많으면 몇 시간 걸릴 수 있어요.` : ''))) return
    setBBusy(true)
    try {
      const startSet = new Set(startIds)
      const groups: [string[], any][] = [
        [ids.filter(id => !startSet.has(id)), { ...ch, ...(bVis ? { visibility: bVis } : {}) }],
        [startIds, { ...ch, visibility: bVis, convert_status: 'pending', convert_error: null }],
      ]
      for (const [list, patchCh] of groups) {
        for (let i = 0; i < list.length; i += 100) {
          const part = list.slice(i, i + 100)
          const { error } = await supabase.from('scores').update(patchCh).in('id', part)
          if (error) throw error
          const set = new Set(part)
          setScores(arr => arr.map(x => set.has(x.id) ? { ...x, ...patchCh } : x))
        }
      }
      setSel(new Set()); setBKind(''); setBMajor('-'); setBVis('')
      setScores(arr => { cacheSet(CACHE, { at: Date.now(), rows: arr, teachers }); return arr })
      say(`${ids.length.toLocaleString()}개를 바꿨어요.`)
    } catch (e: any) {
      say('일부를 바꾸지 못했어요: ' + (e?.message ?? e)); load()
    } finally { setBBusy(false) }
  }

  return (
    <Shell>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>관리자 화면 · {BRAND.academyShort}</p>
        <h1 className="title">악보 전체 <span className="muted" style={{ fontSize: 16, fontWeight: 400 }}>{loaded ? scores.length.toLocaleString() : '불러오는 중…'}</span>
          {syncing && loaded && <span className="muted" style={{ fontSize: 13, fontWeight: 400, marginLeft: 8 }}>· 최신으로 맞추는 중…</span>}</h1>
      </div>
      {/* 1. 검색 */}
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="🔎 곡 이름·뮤지션 검색 (초성도 돼요)" aria-label="악보 검색"
        style={{ padding: '14px 16px', border: '2px solid var(--line, #e5e7eb)', borderRadius: 12, font: 'inherit', fontSize: 16 }} />

      {/* 2. 상태 */}
      <div className="chips" style={{ gap: 6 }} role="tablist" aria-label="상태">
        {([['', '전체', visTotal], ['live', '✅ 공개됨', visCount.get('live')], ['admin', '🕐 검수 전', visCount.get('admin')], ['review', '👀 코치 검수 중', visCount.get('review')], ['coaches', '🤝 코치끼리만', visCount.get('coaches')]] as [string, string, number | undefined][])
          .filter(([k, , c]) => !k || (c ?? 0) > 0 || vf === k).map(([k, l, c]) => (
          <button key={k || 'all'} type="button" role="tab" aria-selected={vf === k} className={'chip' + (vf === k ? ' on' : '')} style={{ borderRadius: 999, padding: '8px 14px' }} onClick={() => setVf(k)}>
            {l} <span style={{ opacity: .7, fontSize: 12 }}>{(c ?? 0).toLocaleString()}</span></button>
        ))}
      </div>

      {/* 3. 전공 */}
      <div className="chips" style={{ gap: 6 }} aria-label="전공">
        {(['', ...BRAND.majors, '공통'] as string[]).map(m => {
          const c = m ? counts.c.m.get(m) ?? 0 : counts.tot.m
          if (m && !c && mf !== m) return null
          return <button key={m || 'all'} type="button" className={'chip sm' + (mf === m ? ' pick' : '')} onClick={() => setMf(m)}>{m || '모든 전공'} <span style={{ opacity: .6, fontSize: 11 }}>{c.toLocaleString()}</span></button>
        })}
      </div>

      {/* 4. 더 거르기 (자주 안 씀) */}
      <details>
        <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>더 거르기 (종류 · 올린 사람 · 자동 정리){kf || by || af ? ' · 적용 중' : ''}</summary>
        <div className="form-row" style={{ alignItems: 'center', marginTop: 8 }}>
          <select value={kf} onChange={e => setKf(e.target.value)} aria-label="종류로 거르기" style={{ padding: '10px 12px', border: '1px solid #d1d5db', font: 'inherit', flex: '1 1 150px' }}>
            <option value="">종류 전체{n(counts.tot.k)}</option>
            {BRAND.kinds.map(k => <option key={k} value={k}>{BRAND.kindLabel[k] ?? k}{n(counts.c.k.get(k))}</option>)}
          </select>
          <select value={by} onChange={e => setBy(e.target.value)} aria-label="올린 사람" style={{ padding: '10px 12px', border: '1px solid #d1d5db', font: 'inherit', flex: '1 1 150px' }}>
            <option value="">올린 사람 전체{n(byTotal)}</option>
            {uploaders.map(u => <option key={u || 'none'} value={u}>{u || '기록 없음'}{n(byCount.get(u))}</option>)}
          </select>
          <select value={af} onChange={e => setAf(e.target.value)} aria-label="자동 정리로 거르기" style={{ padding: '10px 12px', border: '1px solid #d1d5db', font: 'inherit', flex: '1 1 150px' }}>
            <option value="">자동 정리 전체</option>
            {AUTO.map(([k, l]) => <option key={k} value={k}>{l}{n(scores.filter(sc => (sc.tags ?? []).includes(k)).length)}</option>)}
          </select>
        </div>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginTop: 8 }}>
          <input type="checkbox" checked={showOrig} onChange={e => setShowOrig(e.target.checked)} /> 파트로 나누기 전 원본 합본·숨긴 악보도 보기
        </label>
      </details>

      <div className="card" style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 14 }}>
          <b style={{ fontSize: 15 }}>{sel.size ? `${sel.size.toLocaleString()}개 고름` : `${shown.length.toLocaleString()}개`}</b>
          {(mf || kf || vf || by || af || q) && <button type="button" className="linkish muted" style={{ fontSize: 12 }} onClick={() => { setMf(''); setKf(''); setVf(''); setBy(''); setAf(''); setQ('') }}>거르기 모두 풀기</button>}
          <span style={{ flex: 1 }} />
          <button type="button" className="btn sm" disabled={!shown.length} onClick={() => setReview(0)}>👀 차례로 검수</button>
          <button type="button" className="btn sm ghost" disabled={!shown.length} onClick={() => setSel(new Set(shown.map(x => x.id)))}>☑ 모두 고르기</button>
          {sel.size > 0 && <button type="button" className="btn sm ghost" onClick={() => setSel(new Set())}>고른 것 풀기</button>}
        </div>
        {sel.size > 0 && (
          <div className="form-row" style={{ alignItems: 'flex-end' }}>
            <label className="field" style={{ flex: '1 1 160px' }}><span>종류</span>
              <select value={bKind} onChange={e => setBKind(e.target.value)}><option value="">그대로</option>{BRAND.kinds.map(k => <option key={k} value={k}>{BRAND.kindLabel[k] ?? k}</option>)}</select></label>
            <label className="field" style={{ flex: '1 1 120px' }}><span>전공</span>
              <select value={bMajor} onChange={e => setBMajor(e.target.value)}><option value="-">그대로</option><option value="">공통</option>{BRAND.majors.map(m => <option key={m}>{m}</option>)}</select></label>
            <label className="field" style={{ flex: '1 1 160px' }}><span>공개 범위</span>
              <select value={bVis} onChange={e => setBVis(e.target.value)}><option value="">그대로</option>{(['students', 'mine', 'coaches', 'review', 'admin'] as const).map(v => <option key={v} value={v}>{VIS_NAME[v]}</option>)}</select></label>
            <button type="button" className="btn primary" disabled={bBusy} onClick={applyBulk}>{bBusy ? '바꾸는 중…' : `${sel.size.toLocaleString()}개 바꾸기`}</button>
          </div>
        )}
      </div>

      <ul className="rows card" style={{ maxHeight: 'none' }}>
        {shown.slice(0, limit).map(sc => (
          <li key={sc.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 12px', background: sel.has(sc.id) ? 'var(--orS, #fff1e6)' : undefined }}>
            <input type="checkbox" checked={sel.has(sc.id)} onChange={() => toggle(sc.id)} aria-label={`${sc.title} 고르기`} style={{ width: 18, height: 18, flex: 'none' }} />
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <b>{sc.title}</b>
              {/\.(musicxml|mxl|xml)$/i.test(sc.file_path ?? '') && <button type="button" className="linkish" onClick={() => setReview(shown.findIndex(x => x.id === sc.id))} style={{ marginLeft: 8, fontSize: 12, whiteSpace: 'nowrap' }} title="앱 안에서 악보를 바로 보고 공개·종류·전공을 정해요">👀 미리 보기</button>}
              <div className="muted" style={{ fontSize: 12 }}>
                {[sc.artist || sc.composer, (sc.tags ?? []).find(t => t.startsWith('auto:추천:'))?.replace('auto:추천:', '추천 뮤지션? '), sc.major ?? '공통', BRAND.kindShort[kindOf(sc)] ?? kindOf(sc), who(sc) ? `올린 사람 ${who(sc)}` : '올린 사람 기록 없음', (sc as any).created_at?.slice(0, 10),
                  sc.convert_status === 'done' ? '' : sc.convert_status === 'failed' ? '준비 실패' : (sc as any).convert_status === 'hold' ? '변환 보류(공개하면 시작)' : '준비 중'].filter(Boolean).join(' · ')}
              </div>
            </div>
            <select value={sc.visibility} onChange={e => setVis(sc, e.target.value as Score['visibility'])} aria-label="공개 범위" style={{ padding: '6px 8px', border: '1px solid #d1d5db', font: 'inherit', fontSize: 13 }}>
              <option value="students">학원 전체</option>
              <option value="mine">올린 코치의 학생만</option>
              <option value="coaches">코치끼리만</option>
              <option value="review">담당 코치 검수</option>
              <option value="admin">관리자만</option>
              {sc.visibility === 'selected' && <option value="selected">고른 학생만</option>}
              {sc.visibility === 'assigned' && <option value="assigned">과제 받은 학생만 (예전)</option>}
              {sc.visibility === 'public' && <option value="public">학원 전체 (예전 값)</option>}
            </select>
            <button className="btn sm ghost" onClick={() => setEdit(edit?.id === sc.id ? null : { ...sc })}>{edit?.id === sc.id ? '닫기' : '고치기'}</button>
            <button className="btn sm ghost" onClick={() => remove(sc)}>삭제</button>
            {edit?.id === sc.id && (
              <div className="edit-box">
                <div className="form-row">
                  <label className="field" style={{ flex: '2 1 220px' }}><span>제목 <em className="req">필수</em></span><input value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} /></label>
                  <label className="field" style={{ flex: '1 1 160px' }}><span>뮤지션 <em className="opt">선택 · 악보 화면에 보여요</em></span><input value={edit.artist ?? ''} onChange={e => setEdit({ ...edit, artist: e.target.value })} /></label>
                  <label className="field" style={{ flex: '1 1 160px' }}><span>작곡가 <em className="opt">선택</em></span><input value={edit.composer ?? ''} onChange={e => setEdit({ ...edit, composer: e.target.value })} /></label>
                </div>
                <div className="form-row">
                  <label className="field"><span>전공</span>
                    <select value={edit.major ?? ''} onChange={e => setEdit({ ...edit, major: e.target.value || null })}><option value="">공통</option>{BRAND.majors.map(m => <option key={m}>{m}</option>)}</select>
                  </label>
                  <label className="field"><span>종류</span>
                    <select value={kindOf(edit)} onChange={e => setEdit({ ...edit, kind: e.target.value })}>{BRAND.kinds.map(k => <option key={k} value={k}>{BRAND.kindLabel[k] ?? k}</option>)}</select>
                  </label>
                  <label className="field" style={{ flex: '0 1 150px' }}><span>기본 빠르기(BPM) <em className="opt">선택</em></span>
                    <input type="number" min={20} max={300} value={edit.tempo ?? ''} onChange={e => setEdit({ ...edit, tempo: e.target.value ? Number(e.target.value) : null })} placeholder="비우면 100" /></label>
                </div>
                <label className="field"><span>한 줄 소개 <em className="opt">선택 · 자료실에 보여요</em></span><input value={edit.description ?? ''} onChange={e => setEdit({ ...edit, description: e.target.value })} /></label>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="btn sm" onClick={() => setEdit(null)}>취소</button>
                  <button className="btn sm primary" onClick={save} disabled={saving}>{saving ? '저장 중…' : '저장'}</button>
                </div>
              </div>
            )}
          </li>
        ))}
        {shown.length === 0 && <li className="muted" style={{ padding: 16 }}>{loaded ? '찾는 악보가 없어요.' : '악보 목록을 불러오는 중이에요… (처음 한 번만 오래 걸리고, 다음부터는 바로 보여요)'}</li>}
      </ul>
      {shown.length > limit && <button type="button" className="btn" style={{ alignSelf: 'center' }} onClick={() => setLimit(l => l + 200)}>더 보기 ({shown.length - limit}개 남음)</button>}
      {review !== null && review >= 0 && (
        <Suspense fallback={null}>
          <ReviewModal list={shown} all={scores} start={review} onClose={() => setReview(null)} onVis={setVis}
            onField={async (sc, ch) => { const { error } = await supabase.from('scores').update(ch).eq('id', sc.id); if (error) return say('바꾸지 못했어요: ' + error.message); patch(sc.id, ch) }} />
        </Suspense>
      )}
      {/* 가져오기·정리 도구 (가끔 씀) */}
      <details className="card" style={{ padding: '14px 18px' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>🧰 가져오기 · 정리 도구 <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>사운드슬라이스 · 파트 나누기 · 여러 개 올리기</span></summary>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          <Link to="/admin/soundslice" className="btn" style={{ alignSelf: 'flex-start' }}>🎼 사운드슬라이스에서 가져오기</Link>
          {loaded && <SplitPartsCard scores={scores} onDone={load} onShow={() => { setAf('auto:파트'); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />}
          <div><b style={{ fontSize: 14 }}>여러 개 한꺼번에 올리기</b> <span className="muted" style={{ fontSize: 13 }}>PC에서 파일·폴더 끌어다 놓기</span>
            <div style={{ marginTop: 8 }}><BulkUpload createdBy={session?.user.id} existingTitles={scores.map(x => x.title)} onDone={load} /></div></div>
        </div>
      </details>
    </Shell>
  )
}

// 여러 악기 합본 → 같은 악기끼리 묶어 파트별 새 악보로 (Edge Function split-parts, 5개씩)
const isMulti = (sc: Score) => {
  const t = sc.tags ?? []
  return t.filter(x => x.startsWith('악기:')).length >= 2 && !t.includes('auto:파트원본') && !t.includes('auto:파트') && /\.(musicxml|xml)$/i.test(sc.file_path ?? '')
}
function SplitPartsCard({ scores, onDone, onShow }: { scores: Score[]; onDone: () => void; onShow: () => void }) {
  const todo = scores.filter(isMulti)
  const parts = scores.filter(sc => (sc.tags ?? []).includes('auto:파트')).length
  const [run, setRun] = useState<{ done: number; total: number; made: number; err: number; last?: string } | null>(null)
  const stop = useRef(false)
  async function start() {
    if (!todo.length) return
    if (!await ask(`여러 악기가 든 악보 ${todo.length.toLocaleString()}개를 같은 악기끼리 묶어 파트별 악보로 나눌까요?\n\n· 새 악보는 '관리자만(검수 전)'으로 들어가요\n· 원본 합본은 그대로 남아요\n· 공개할 때만 변환해요`, '나누기 시작')) return
    stop.current = false
    const ids = todo.map(x => x.id)
    const st = { done: 0, total: ids.length, made: 0, err: 0, last: '' as string | undefined }
    setRun({ ...st })
    for (let i = 0; i < ids.length && !stop.current; i += 5) {
      try {
        const { data, error } = await supabase.functions.invoke('split-parts', { body: { action: 'split', ids: ids.slice(i, i + 5) } })
        if (error) throw error
        for (const r of (data?.results ?? []) as any[]) {
          if (r.status === 'split') st.made += r.made?.length ?? 0
          if (r.status === 'error') { st.err++; st.last = r.error }
        }
      } catch (e: any) { st.err += 5; st.last = e?.message ?? String(e) }
      st.done = Math.min(ids.length, i + 5)
      setRun({ ...st })
    }
    onDone()
  }
  if (!todo.length && !parts && !run) return null
  return (
    <div className="card" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <b>🎼 여러 악기 악보 → 파트별로 나누기</b>
      <span className="muted" style={{ fontSize: 13 }}>같은 악기끼리 한 악보로 묶어요 (기타1·기타2는 함께). 나눈 악보는 '관리자만'으로 들어가고, 원본 합본은 그대로 남아요.</span>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {todo.length > 0 && !(run && run.done < run.total) && <button type="button" className="btn primary sm" onClick={start}>나누기 시작 ({todo.length.toLocaleString()}개 남음)</button>}
        {run && run.done < run.total && <button type="button" className="btn sm ghost" onClick={() => { stop.current = true }}>멈추기</button>}
        {parts > 0 && <button type="button" className="btn sm" onClick={onShow}>나눈 악보 보기 ({parts.toLocaleString()})</button>}
      </div>
      {run && (
        <div style={{ fontSize: 13 }}>
          <progress max={run.total} value={run.done} style={{ width: '100%' }} />
          <div>{run.done.toLocaleString()} / {run.total.toLocaleString()} · 새 파트 악보 {run.made.toLocaleString()}개{run.err ? ` · 실패 ${run.err}` : ''}{run.done >= run.total ? ' · 끝났어요 ✓' : ''}</div>
          {run.last && <div className="muted">마지막 오류: {run.last}</div>}
        </div>
      )}
    </div>
  )
}
