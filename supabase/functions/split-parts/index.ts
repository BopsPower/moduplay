// 여러 악기가 든 MusicXML 악보를 '같은 악기끼리' 묶어 파트별 새 악보로 나누기. 관리자만.
// - 기타1·기타2·어쿠스틱 기타 → 한 악보('기타'), 드럼·베이스·피아노·보컬도 같은 방식
// - 새 악보: 제목 "원래 제목 (기타)", 전공 자동, 공개 범위 '관리자만', 변환 보류(공개할 때 변환)
// - 원본 합본은 그대로 두고 태그 auto:파트원본 만 붙임
// - 다섯 악기에 안 들어가는 파트(관악·현악 등)는 원본 합본에만 남음
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// soundslice-import 와 같은 규칙
// 관악·현악 등 다섯 악기가 아닌 것은 먼저 걸러 냄 (알토·테너 색소폰이 보컬로, 스틸 드럼이 드럼으로, 베이스 클라리넷이 베이스로 가던 문제)
const NOT_FIVE = /sax|saxo|clarinet|flute|piccolo|trumpet|trombone|horn|tuba|oboe|bassoon|violin|viola|cello|string|harp|steel ?drum|synth|glock|xylo|marimba|vibra/i
const INST: [RegExp, string][] = [
  [/drum|percussion|kit|드럼|타악/i, '드럼'], [/\bbass\b|e\.?\s?bass|electric bass|베이스/i, '베이스'],
  [/guitar|gtr|기타|우쿨렐레|ukulele/i, '기타'], [/piano|keyboard|organ|rhodes|피아노|건반/i, '피아노'],
  [/voice|vocal|vox|soprano|alto|tenor|보컬|노래|melody/i, '보컬'],
]
const ORDER = ['보컬', '피아노', '기타', '베이스', '드럼']
const FILE = { 보컬: 'vocal', 피아노: 'piano', 기타: 'guitar', 베이스: 'bass', 드럼: 'drums' } as Record<string, string>

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function analyze(xml: string) {
  const plist = xml.match(/<part-list\b[^>]*>[\s\S]*?<\/part-list>/)?.[0]
  if (!plist) return null
  const sp = [...plist.matchAll(/<score-part\b[^>]*\bid="([^"]+)"[^>]*>[\s\S]*?<\/score-part>/g)].map(m => ({ id: m[1], block: m[0] }))
  const parts = sp.map(p => {
    const names = [...p.block.matchAll(/<(?:part-name|part-abbreviation|instrument-name)[^>]*>([^<]{1,80})</g)].map(m => m[1].trim()).join(' ')
    const body = xml.match(new RegExp(`<part\\b[^>]*\\bid="${esc(p.id)}"[^>]*>[\\s\\S]*?<\\/part>`))?.[0] ?? ''
    // 소리 높이 없는 음표·타악기 음자리표면 드럼, 아니면 이름으로
    const drum = /<unpitched>/.test(body) || /<sign>percussion<\/sign>/.test(body)
    const fam = NOT_FIVE.test(names) && !drum ? null : drum ? '드럼' : (INST.find(([re]) => re.test(names))?.[1] ?? null)
    return { ...p, names, fam, hasBody: !!body }
  })
  return { plist, parts }
}

function extract(xml: string, plist: string, keep: Set<string>, all: { id: string; block: string }[]) {
  // part-list: 남길 파트만, part-group(괄호 묶음)은 빼기
  let pl = plist.replace(/<part-group\b[^>]*\/>/g, '').replace(/<part-group\b[^>]*>[\s\S]*?<\/part-group>/g, '')
  for (const p of all) if (!keep.has(p.id)) pl = pl.replace(p.block, () => '')
  let out = xml.replace(plist, () => pl)
  for (const p of all) if (!keep.has(p.id)) out = out.replace(new RegExp(`\\s*<part\\b[^>]*\\bid="${esc(p.id)}"[^>]*>[\\s\\S]*?<\\/part>`), '')
  return out
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const authz = req.headers.get('Authorization') ?? ''
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authz } } })
    const { data: admin } = await sb.rpc('is_admin')
    if (!admin) return json({ error: '관리자만 쓸 수 있어요' }, 403)
    const body = await req.json().catch(() => ({}))
    const { data: u } = await sb.auth.getUser(authz.replace(/^Bearer\s+/i, ''))

    if (body.action === 'split') {
      const ids: string[] = (body.ids ?? []).slice(0, 5)
      const results: any[] = []
      for (const id of ids) results.push(await (async () => {
        const { data: sc, error: e0 } = await sb.from('scores').select('*').eq('id', id).maybeSingle()
        if (e0 || !sc) return { id, status: 'error', error: e0?.message ?? '악보 없음' }
        const tags: string[] = sc.tags ?? []
        if (tags.includes('auto:파트원본')) return { id, status: 'done-before' }
        if (tags.includes('auto:파트')) return { id, status: 'is-part' }
        if (!/\.(musicxml|xml)$/i.test(sc.file_path ?? '')) return { id, status: 'skip', reason: 'MusicXML 아님' }
        const dl = await sb.storage.from('scores').download(sc.file_path)
        if (dl.error || !dl.data) return { id, status: 'error', error: '원본 받기 실패: ' + (dl.error?.message ?? '') }
        const xml = await dl.data.text()
        const a = analyze(xml)
        if (!a) return { id, status: 'skip', reason: 'part-list 없음' }
        const fams = ORDER.filter(f => a.parts.some(p => p.fam === f && p.hasBody))
        const others = a.parts.filter(p => !p.fam).map(p => p.names || p.id)
        if (fams.length < 2) {
          await sb.from('scores').update({ tags: [...tags, 'auto:파트원본'] }).eq('id', id) // 다시 안 보게 표시
          return { id, status: 'single', fams, others }
        }
        const made: string[] = []
        for (const f of fams) {
          const keep = new Set(a.parts.filter(p => p.fam === f).map(p => p.id))
          const out = extract(xml, a.plist, keep, a.parts)
          const file_path = `split/${id}/${FILE[f]}.musicxml`
          const up = await sb.storage.from('scores').upload(file_path, new Blob([out], { type: 'application/vnd.recordare.musicxml+xml' }), { upsert: true })
          if (up.error) return { id, status: 'error', error: `${f} 올리기 실패: ${up.error.message}`, made }
          const { data: ex } = await sb.from('scores').select('id').eq('file_path', file_path).maybeSingle()
          if (ex) { made.push(f); continue }
          const keepTags = tags.filter(t => !t.startsWith('악기:') && !t.startsWith('auto:'))
          const { error } = await sb.from('scores').insert({
            id: crypto.randomUUID(), title: `${sc.title} (${f})`.slice(0, 200), artist: sc.artist, composer: sc.composer,
            file_path, category: sc.category, kind: sc.kind, major: f, level: sc.level, areas: sc.areas ?? [], key_sig: sc.key_sig, tempo: sc.tempo,
            visibility: 'admin', created_by: u.user?.id ?? sc.created_by,
            tags: [...keepTags, '악기:' + f, 'auto:파트', `auto:원본:${id}`],
            description: [sc.description, `여러 악기 합본에서 ${f} 파트만 뽑은 악보예요.`].filter(Boolean).join(' '),
            convert_status: 'hold', convert_error: '변환 보류: 공개할 때 소리·악보 그림을 만들어요', yt_marks: [],
          })
          if (error) return { id, status: 'error', error: `${f} 저장 실패: ${error.message}`, made }
          made.push(f)
        }
        await sb.from('scores').update({ tags: [...tags, 'auto:파트원본'] }).eq('id', id)
        return { id, status: 'split', made, others }
      })())
      return json({ results })
    }
    return json({ error: '알 수 없는 요청' }, 400)
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500)
  }
})
