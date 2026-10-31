// 사운드슬라이스(학원 계정) 악보를 MusicXML로 가져와 모두플레이 자료로 넣기. 관리자만.
// 비밀값: SOUNDSLICE_APP_ID, SOUNDSLICE_PASSWORD (Supabase > Edge Functions > Secrets)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const SS = 'https://www.soundslice.com/api/v1'
// 학원 라이브러리 맨 위 목록 (사운드슬라이스 API에 '전체 목록 보기'가 없어서 직접 적어 둠)
const ROOTS: [string, string][] = [
  ['QbJH7', '🎤 보컬 관련 강의'], ['XbJH7', '🎸 기타 관련 강의'], ['ndJH7', '🥁 드럼 관련 강의'],
  ['TbJH7', '🎼 라이브 악보'], ['FbJH7', '🎸 베이스 관련 강의'], ['gjJH7', '🎹 피아노 관련 강의'],
  ['N9JH7', '📷 유튜브 컨텐츠'], ['DdJH7', '🎻 생활악기'], ['yfJH7', '광고용'], ['GZJH7', '클래식 강의'],
  ['cvJH7', '🎚️음악이론 관련 강의'], ['mg6G7', 'TEST'],
]
const MAJOR: [RegExp, string][] = [[/보컬/, '보컬'], [/피아노/, '피아노'], [/베이스/, '베이스'], [/기타/, '기타'], [/드럼/, '드럼'], [/미디|작곡/, '미디작곡']]

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function ssAuth() {
  const id = Deno.env.get('SOUNDSLICE_APP_ID'), pw = Deno.env.get('SOUNDSLICE_PASSWORD')
  if (!id || !pw) throw new Error('사운드슬라이스 키가 설정되지 않았어요 (SOUNDSLICE_APP_ID / SOUNDSLICE_PASSWORD)')
  return 'Basic ' + btoa(`${id}:${pw}`)
}
// 사운드슬라이스가 너무 잦은 요청을 429로 막으므로, 기다렸다가 다시 시도
async function ss(path: string, auth: string) {
  for (let k = 0; ; k++) {
    const r = await fetch(SS + path, { headers: { Authorization: auth } })
    if (r.status !== 429 || k >= 2) return r
    const wait = Math.min(10, Number(r.headers.get('retry-after')) || 4 * (k + 1))
    await new Promise(res => setTimeout(res, wait * 1000))
  }
}
async function ssJson(path: string, auth: string) {
  const r = await ss(path, auth)
  if (!r.ok) throw new Error(`사운드슬라이스 ${path} → ${r.status}`)
  return r.json()
}

type Node = { id: string; name: string; path: string[]; slices: { hash: string; name: string }[] }

async function walk(auth: string) {
  const out: Node[] = []
  let level: { id: string; path: string[] }[] = ROOTS.map(([id, name]) => ({ id, path: [name] }))
  const seen = new Set<string>()
  while (level.length) {
    level = level.filter(l => !seen.has(l.id) && l.path.length <= 6); level.forEach(l => seen.add(l.id))
    // 요청 제한 때문에 3개씩만 동시에
    const res: { l: { id: string; path: string[] }; d: any }[] = []
    for (let i = 0; i < level.length; i += 3) {
      res.push(...await Promise.all(level.slice(i, i + 3).map(async l => {
        try { return { l, d: await ssJson(`/lists/${l.id}/`, auth) } } catch { return { l, d: null } }
      })))
    }
    const next: { id: string; path: string[] }[] = []
    for (const { l, d } of res) {
      if (!d) continue
      const path = l.path.length === 1 ? [l.path[0]] : l.path
      out.push({ id: l.id, name: d.name, path, slices: (d.slices ?? []).filter((s: any) => s.is_accessible !== false).map((s: any) => ({ hash: s.scorehash, name: s.name })) })
      for (const s of d.sublists ?? []) next.push({ id: s.id, path: [...path, s.name] })
    }
    level = next
  }
  return out
}

// MusicXML 안의 악기 이름으로 전공 정하기 (목록에 없는 악보도 분류되게)
const INST: [RegExp, string][] = [
  [/drum|percussion|kit|드럼|타악/i, '드럼'], [/\bbass\b|e\.?\s?bass|electric bass|베이스/i, '베이스'],
  [/guitar|gtr|기타|우쿨렐레|ukulele/i, '기타'], [/piano|keyboard|organ|rhodes|피아노|건반/i, '피아노'],
  [/voice|vocal|vox|soprano|alto|tenor|보컬|노래|melody/i, '보컬'],
]
function instrumentsOf(xml: ArrayBuffer) {
  const head = new TextDecoder().decode(xml.slice(0, 300000))
  const plist = head.match(/<part-list>[\s\S]*?<\/part-list>/)?.[0] ?? ''
  const names = [...plist.matchAll(/<(?:part-name|instrument-name)[^>]*>([^<]{1,60})</g)].map(m => m[1].trim()).filter(Boolean)
  const unpitched = /<unpitched>/.test(head) || /<sign>percussion<\/sign>/.test(head)
  const majors = new Set<string>()
  for (const n of names) { const hit = INST.find(([re]) => re.test(n)); if (hit) majors.add(hit[1]) }
  if (unpitched) majors.add('드럼')
  return { names: [...new Set(names)].slice(0, 6), majors: [...majors] }
}

const clean = (n: string) => n.replace(/\.(pdf|mxl|musicxml|xml|musx|mscz|gp\d?|gpx)$/i, '').replace(/\.(musx)$/i, '').trim() || n

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: admin } = await sb.rpc('is_admin')
    if (!admin) return json({ error: '관리자만 쓸 수 있어요' }, 403)
    const body = await req.json().catch(() => ({}))
    const auth = ssAuth()

    // 요청 제한 확인용: 한 번만 불러 보고 상태·제한 머리글을 돌려줌
    if (body.action === 'probe') {
      const r = await fetch(SS + '/lists/' + ROOTS[0][0] + '/', { headers: { Authorization: auth } })
      const h: Record<string, string> = {}
      r.headers.forEach((v, k) => { if (/rate|retry|limit|quota/i.test(k)) h[k] = v })
      return json({ status: r.status, headers: h, body: r.status === 429 ? (await r.text()).slice(0, 300) : undefined })
    }
    // 화면이 한 목록씩 차례로 불러 가도록 (한 번에 다 하면 시간 초과)
    if (body.action === 'list') {
      const d = await ssJson(`/lists/${body.id}/`, auth)
      return json({ name: d.name, sublists: d.sublists ?? [], slices: (d.slices ?? []).filter((s: any) => s.is_accessible !== false).map((s: any) => ({ hash: s.scorehash, name: s.name })) })
    }
    if (body.action === 'slices') {
      const impRows: { id: string; file_path: string }[] = []
      for (let from = 0; ; from += 1000) {
        const { data } = await sb.from('scores').select('id, file_path').like('file_path', 'ss-%').order('file_path').range(from, from + 999)
        impRows.push(...(data ?? [])); if (!data || data.length < 1000) break
      }
      const imported: Record<string, string> = {}
      for (const r of impRows) { const h = r.file_path.match(/^ss-(.+)\.musicxml$/)?.[1]; if (h) imported[h] = r.id }
      const all = await ssJson('/slices/', auth)
      const slices = (all as any[]).map(s => ({ hash: s.scorehash, name: s.name, artist: s.artist, notation: s.has_notation, recordings: s.recording_count }))
      return json({ roots: ROOTS, slices, imported })
    }

    if (body.action === 'tree') {
      // 이미 가져온 것 (한 번에 1000개까지만 오므로 나눠서)
      const impRows: { id: string; file_path: string }[] = []
      const readImported = async () => {
        for (let from = 0; ; from += 1000) {
          const { data } = await sb.from('scores').select('id, file_path').like('file_path', 'ss-%').order('file_path').range(from, from + 999)
          impRows.push(...(data ?? [])); if (!data || data.length < 1000) break
        }
      }
      const [lists, all] = await Promise.all([walk(auth), ssJson('/slices/', auth), readImported()])
      const imported: Record<string, string> = {}
      for (const r of impRows) { const h = r.file_path.match(/^ss-(.+)\.musicxml$/)?.[1]; if (h) imported[h] = r.id }
      const slices = (all as any[]).map(s => ({ hash: s.scorehash, name: s.name, artist: s.artist, notation: s.has_notation, recordings: s.recording_count }))
      return json({ lists, slices, imported })
    }

    if (body.action === 'import') {
      const { data: u } = await sb.auth.getUser((req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, ''))
      const items: { hash: string; name: string; artist?: string; path?: string[] }[] = (body.items ?? []).slice(0, 5)
      const results: any[] = []
      for (const it of items) results.push(await (async () => {
        const file_path = `ss-${it.hash}.musicxml`
        const { data: ex } = await sb.from('scores').select('id').eq('file_path', file_path).maybeSingle()
        if (ex) return { hash: it.hash, status: 'exists', id: ex.id }
        const r = await ss(`/slices/${it.hash}/musicxml/`, auth)
        if (r.status === 404) return { hash: it.hash, status: 'no-notation' }
        if (!r.ok) return { hash: it.hash, status: 'error', error: `사운드슬라이스 ${r.status}`, retry: r.status === 429 }
        const xml = await r.arrayBuffer()
        const up = await sb.storage.from('scores').upload(file_path, new Blob([xml], { type: 'application/vnd.recordare.musicxml+xml' }), { upsert: false })
        if (up.error) return { hash: it.hash, status: 'error', error: up.error.message, size: xml.byteLength }
        const path = it.path ?? []
        const top = path.join(' ')
        const inst = instrumentsOf(xml)
        // 목록 이름이 우선, 없으면 악보 안 악기가 하나로 정해질 때만
        const major = MAJOR.find(([re]) => re.test(top))?.[1] ?? (inst.majors.length === 1 ? inst.majors[0] : null)
        const book = /\.pdf$/i.test(it.name)
        // 새 행을 돌려받으면(select) 읽기 규칙 때문에 막혀서, id를 미리 정하고 넣기만
        const id = crypto.randomUUID()
        const { error } = await sb.from('scores').insert({
          id, title: clean(it.name).slice(0, 200), artist: it.artist?.trim() || null, file_path,
          category: book ? '교재' : '연습곡', kind: book ? '교재' : '곡 악보', major,
          visibility: 'admin', created_by: u.user?.id ?? null,
          tags: ['사운드슬라이스', ...path.slice(1).map(p => p.replace(/^[^\p{L}\p{N}]+/u, '').trim()).filter(Boolean), ...inst.majors.map(m => '악기:' + m)].slice(0, 8),
          description: '사운드슬라이스에서 가져온 악보예요.' + (book ? ' PDF를 스캔해 만든 악보라 틀린 음이 있을 수 있어요.' : ''),
          // 변환은 보류: 관리자가 공개할 때 'pending'으로 바뀌어 변환 서버가 처리
          convert_status: 'hold', convert_error: '변환 보류: 공개할 때 소리·악보 그림을 만들어요', areas: [], yt_marks: [],
        })
        if (error) { await sb.storage.from('scores').remove([file_path]); return { hash: it.hash, status: 'error', error: error.message } }
        return { hash: it.hash, status: 'imported', id, size: xml.byteLength }
      })())
      return json({ results })
    }
    return json({ error: '알 수 없는 요청' }, 400)
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500)
  }
})
