// 학원 구글 드라이브(링크 공개 폴더)의 음원을 모두플레이 자료로 가져오기. 관리자만.
// - list: 폴더 안 하위 폴더·파일 목록 (drive.google.com/embeddedfolderview, 링크 공개 폴더만)
// - import: 파일 하나를 받아 저장소(scores)에 올리고 자료(행)로 등록
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const MAX = 50 * 1024 * 1024
const AUDIO: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', aac: 'audio/aac' }
const unesc = (s: string) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()

async function listFolder(id: string) {
  const r = await fetch(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(id)}`)
  if (!r.ok) throw new Error(`폴더 목록 ${r.status}`)
  const html = await r.text()
  const out: { id: string; name: string; folder: boolean }[] = []
  for (const m of html.matchAll(/<div class="flip-entry" id="entry-([\w-]+)"[\s\S]*?<a href="([^"]+)"[\s\S]*?<div class="flip-entry-title">([^<]*)<\/div>/g)) {
    out.push({ id: m[1], name: unesc(m[3]), folder: /\/folders\//.test(m[2]) })
  }
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

    if (body.action === 'list') return json({ items: await listFolder(String(body.id)) })

    // 파일을 그대로 넘겨줌 (화면에서 wav → mp3로 바꿔 올릴 때)
    if (body.action === 'proxy') {
      const r = await fetch(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(String(body.fileId))}&export=download&confirm=t`)
      if (!r.ok || /text\/html/.test(r.headers.get('content-type') ?? '')) return json({ error: `드라이브 ${r.status}` }, 502)
      return new Response(r.body, { headers: { ...cors, 'Content-Type': r.headers.get('content-type') ?? 'application/octet-stream' } })
    }

    if (body.action === 'import') {
      const { fileId, name, row } = body as { fileId: string; name: string; row: Record<string, unknown> }
      const ext = (name.match(/\.(\w+)$/)?.[1] ?? '').toLowerCase()
      if (!AUDIO[ext]) return json({ status: 'skip', reason: '음원 아님' })
      const r = await fetch(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`)
      if (!r.ok) return json({ status: 'error', error: `드라이브 ${r.status}` })
      if (/text\/html/.test(r.headers.get('content-type') ?? '')) return json({ status: 'error', error: '드라이브가 파일 대신 안내 화면을 줌 (공개 안 됨?)' })
      const len = Number(r.headers.get('content-length') ?? 0)
      if (len > MAX) return json({ status: 'skip', reason: `${Math.round(len / 1048576)}MB — 50MB 넘음` })
      // 크기 머리글이 없을 때가 많아서, 받으면서 세다가 50MB를 넘으면 바로 멈춤
      const chunks: Uint8Array[] = []; let total = 0
      const rd = r.body!.getReader()
      for (;;) {
        const { done, value } = await rd.read()
        if (done) break
        total += value.byteLength
        if (total > MAX) { await rd.cancel(); return json({ status: 'skip', reason: '50MB 넘음' }) }
        chunks.push(value)
      }
      const buf = new Uint8Array(total); let o = 0
      for (const c of chunks) { buf.set(c, o); o += c.byteLength }
      const id = crypto.randomUUID()
      const path = `${id}.${ext}`
      const up = await sb.storage.from('scores').upload(path, new Blob([buf], { type: AUDIO[ext] }), { contentType: AUDIO[ext] })
      if (up.error) return json({ status: 'error', error: '올리기 실패: ' + up.error.message })
      const { data: u } = await sb.auth.getUser(authz.replace(/^Bearer\s+/i, ''))
      const now = new Date().toISOString()
      const { error } = await sb.from('scores').insert({
        areas: [], yt_marks: [], view_only: false, category: '연습곡', visibility: 'students', ...row,
        id, file_path: path, created_by: u.user?.id ?? null,
        convert_status: 'done', mp3_path: path, converted_at: now, convert_error: '음원 자료',
      })
      if (error) { await sb.storage.from('scores').remove([path]); return json({ status: 'error', error: '저장 실패: ' + error.message }) }
      return json({ status: 'ok', id, size: buf.byteLength })
    }
    return json({ error: '알 수 없는 요청' }, 400)
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500)
  }
})
