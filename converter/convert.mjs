// 모두플레이 악보 변환 서버
// - Supabase에서 convert_status = 'pending' 인 악보를 20초마다 확인
// - MuseScore 4로 PDF / PNG(페이지별) / MP3 / MusicXML 생성 → storage 'scores' 버킷에 업로드
// - 완료되면 scores 행을 갱신
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const MSCORE = process.env.MSCORE || '/opt/musescore/mscore'
const INTERVAL = Number(process.env.POLL_SECONDS || 20) * 1000
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('SUPABASE_URL, SUPABASE_SERVICE_KEY 필요'); process.exit(1) }

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket } })
const log = (...a) => console.log(new Date().toISOString(), ...a)

// 라이브러리 경고(findlib/fallback 등)를 걷어내고 실제 메시지만 남김
const clean = (t) => String(t).split('\n').filter(l => l && !/findlib|fallback for library|^\/lib\/|^\/usr\/lib\//.test(l)).slice(-12).join('\n')

async function mscore(args, cwd, timeoutSec = 1500) {
  // 화면 없는 서버에서 MuseScore 실행 (xvfb-run으로 가상 화면). 페이지가 많으면 오래 걸리므로 기본 25분.
  const env = { ...process.env, HOME: cwd, XDG_RUNTIME_DIR: cwd }
  try {
    const { stdout, stderr } = await run('xvfb-run', ['-a', MSCORE, ...args], { cwd, env, timeout: timeoutSec * 1000, maxBuffer: 32 * 1024 * 1024 })
    await fs.writeFile('/tmp/last-mscore.log', stdout + stderr).catch(() => {})
    return stdout + stderr
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '')
    await fs.writeFile('/tmp/last-mscore.log', out).catch(() => {})
    throw new Error(`MuseScore 종료코드 ${e.code ?? '?'}: ` + clean(out))
  }
}

// PNG 머리글에서 가로/세로 픽셀 읽기
async function pngSize(file) {
  const fh = await fs.open(file, 'r')
  try { const b = Buffer.alloc(24); await fh.read(b, 0, 24, 0); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } }
  finally { await fh.close() }
}

// MuseScore .mpos(XML) → 마디별 { page, x,y,w,h (페이지 비율 0~1), t: [시작초...] }
// mpos 좌표 단위는 MuseScore 내부 픽셀(MPOS_DPI). PNG는 PNG_DPI로 뽑았으므로 비율로 환산.
// 실측 보정: mpos 1단위 = 1/14400 인치 (하농 악보에서 오선 위치와 정확히 일치 확인)
const MPOS_DPI = Number(process.env.MPOS_DPI || 14400)
function parseMpos(xml, pngSizes) {
  const attrs = (s) => Object.fromEntries([...s.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]))
  const els = [...xml.matchAll(/<element\s+([^>]*?)\/?>/g)].map(m => attrs(m[1]))
  const evs = [...xml.matchAll(/<event\s+([^>]*?)\/?>/g)].map(m => attrs(m[1]))
  const times = new Map()
  for (const e of evs) { const k = e.elid; if (!times.has(k)) times.set(k, []); times.get(k).push(Number(e.position) / 1000) }
  const pngDpi = Number(process.env.PNG_DPI || 150)
  const k = pngDpi / MPOS_DPI // mpos px → png px
  let maxX = 0, maxY = 0
  const measures = els.map((e, i) => {
    const page = Number(e.page || 0)
    const pg = pngSizes[page] || pngSizes[0] || { w: 1, h: 1 }
    const x = Number(e.x), y = Number(e.y), w = Number(e.sx), h = Number(e.sy)
    maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h)
    return { i, id: e.id, page, x: x * k / pg.w, y: y * k / pg.h, w: w * k / pg.w, h: h * k / pg.h, t: (times.get(e.id) || []).sort((a, b) => a - b) }
  })
  return { version: 1, pages: pngSizes, measures, raw: { maxX, maxY, count: els.length } }
}

const exists = (p) => fs.access(p).then(() => true, () => false)

async function upload(storagePath, localPath, contentType) {
  const data = await fs.readFile(localPath)
  const { error } = await sb.storage.from('scores').upload(storagePath, data, { contentType, upsert: true })
  if (error) throw new Error(`upload ${storagePath}: ${error.message}`)
}

const PNG_DPI = String(process.env.PNG_DPI || 150) // 150dpi: 화면용으로 충분
const isPage = (f) => /^page-\d+\.png$/.test(f)
const pageSort = (a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0])

// 여러 형식을 MuseScore 한 번 실행으로 뽑음(작은 서버에서 실행 시간 절약).
// 한 번에 뽑기가 실패하거나 빠진 파일이 있으면 그 파일만 예전처럼 하나씩 다시 시도 → 최악이어도 예전 속도.
async function exportAll(inName, outs, work) {
  const errs = []
  const made = async (o) => o === 'page.png' ? (await fs.readdir(work)).some(isPage) : exists(path.join(work, o))
  try {
    await fs.writeFile(path.join(work, 'job.json'), JSON.stringify([{ in: inName, out: outs }]))
    await mscore(['-r', PNG_DPI, '-j', 'job.json'], work)
  } catch (e) { log('한 번에 내보내기 실패 → 하나씩 다시', e.message.split('\n')[0]) }
  for (const o of outs) {
    if (await made(o)) continue
    try { await mscore([...(o.endsWith('.png') ? ['-r', PNG_DPI] : []), '-o', o, inName], work) }
    catch (e) { errs.push(`${o}: ${e.message.split('\n')[0]}`) }
  }
  return errs
}

// 원본을 작업 폴더에 받음 (+ MusicXML 제목/작곡가 보정)
async function prepare(score, work) {
  const { data, error } = await sb.storage.from('scores').download(score.file_path)
  if (error || !data) throw new Error('원본 파일을 받지 못했어요: ' + (error?.message ?? ''))
  // 원본 확장자 유지 (.mscz / .musicxml / .mxl / .xml / .gp 등 모두 MuseScore가 읽음)
  const ext = (score.file_path.match(/\.(mscz|musicxml|mxl|xml|mid|midi|gp|gp3|gp4|gp5|gpx|pdf)$/i)?.[1] ?? 'mscz').toLowerCase()
  const inName = `score.${ext}`
  const src = path.join(work, inName)
  await fs.writeFile(src, Buffer.from(await data.arrayBuffer()))
  await fs.copyFile(src, `/tmp/last-input.${ext}`).catch(() => {})
  // MusicXML에 제목/작곡가가 없으면(예: Soundslice 내보내기) 선생님이 적은 제목·작곡가를 넣어서 악보 위에 찍히게 함
  if (ext === 'xml' || ext === 'musicxml') {
    let xml = await fs.readFile(src, 'utf8')
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    let changed = false
    if (!/<work-title>|<movement-title>/.test(xml) && score.title) {
      xml = xml.replace(/(<score-partwise[^>]*>)/, `$1\n  <work><work-title>${esc(score.title)}</work-title></work>`); changed = true
    }
    if (!/<creator\b/.test(xml) && score.composer) {
      if (/<identification>/.test(xml)) xml = xml.replace('<identification>', `<identification>\n    <creator type="composer">${esc(score.composer)}</creator>`)
      else xml = xml.replace(/(<\/work>)/, `$1\n  <identification><creator type="composer">${esc(score.composer)}</creator></identification>`)
      changed = true
    }
    if (changed) { await fs.writeFile(src, xml); log('제목/작곡가 삽입', score.id) }
  }
  return { ext, inName }
}

// 1단계(빠름): PDF + 페이지 그림 + 마디 위치 → 'done' 처리해서 학생이 바로 볼 수 있게 함
// 성공하면 2단계 작업 정보를 돌려줌
async function phase1(score) {
  const id = score.id
  // 같은 묶음으로 가져온 사이에 상태가 바뀌었으면(예: 앱이 이미 처리) 건너뜀
  const { data: now } = await sb.from('scores').select('convert_status').eq('id', id).maybeSingle()
  if (!now || now.convert_status !== 'pending') { log('건너뜀(이미 처리됨)', id, score.title); return null }
  // PDF는 변환하지 않음: 앱이 브라우저에서 바로 그려서 보여줌 (500쪽 책도 기다림 없음)
  if (/\.pdf$/i.test(score.file_path)) {
    await sb.from('scores').update({ convert_status: 'done', pdf_path: score.file_path, converted_at: new Date().toISOString(),
      convert_error: 'PDF 원본: 보기·인쇄만 가능 (재생·마디 이동·MIDI 변환 없음)' }).eq('id', id)
    log('PDF는 변환 없이 공개', id, score.title)
    return null
  }
  log('1단계 시작', id, score.title)
  await sb.from('scores').update({ convert_status: 'converting', convert_error: null }).eq('id', id)
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'mp-'))
  try {
    const { ext, inName } = await prepare(score, work)
    const base = `out/${id}`
    const t0 = Date.now()
    const errors = await exportAll(inName, ['score.pdf', 'page.png', 'score.mpos'], work)
    try { await mscore(['-o', 'meta.json', inName], work) } catch (e) { errors.push('meta.json: ' + e.message.split('\n')[0]) }

    const files = await fs.readdir(work)
    const pngs = files.filter(isPage).sort(pageSort)
    if (!files.includes('score.pdf') || pngs.length === 0) throw new Error('MuseScore 출력 없음: ' + errors.join(' | '))
    let meta = {}
    try { meta = JSON.parse(await fs.readFile(path.join(work, 'meta.json'), 'utf8')) } catch { /* 없어도 진행 */ }

    await upload(`${base}/score.pdf`, path.join(work, 'score.pdf'), 'application/pdf')
    await Promise.all(pngs.map((f, i) => upload(`${base}/page-${i + 1}.png`, path.join(work, f), 'image/png')))
    if (files.includes('meta.json')) await upload(`${base}/meta.json`, path.join(work, 'meta.json'), 'application/json')

    // 마디 데이터 → measures.json (페이지 PNG 크기 기준으로 좌표 정규화)
    let measuresPath = null
    if (files.includes('score.mpos')) {
      try {
        const pngSizes = await Promise.all(pngs.map(f => pngSize(path.join(work, f))))
        const mj = parseMpos(await fs.readFile(path.join(work, 'score.mpos'), 'utf8'), pngSizes)
        await fs.writeFile(path.join(work, 'measures.json'), JSON.stringify(mj))
        await upload(`${base}/measures.json`, path.join(work, 'measures.json'), 'application/json')
        measuresPath = `${base}/measures.json`
        log('마디 데이터', id, `${mj.measures.length}마디, 원본 단위 최대 x=${mj.raw.maxX} y=${mj.raw.maxY}, png=${pngSizes[0]?.w}x${pngSizes[0]?.h}`)
      } catch (e) { errors.push('measures: ' + e.message) }
    }

    const { error: e2 } = await sb.rpc('mark_converted', {
      p_score_id: id, p_pdf: `${base}/score.pdf`, p_mp3: null, p_xml: null,
      p_pages: pngs.length, p_duration: meta.duration ?? null, p_title: meta.title ?? '', p_composer: meta.composer ?? '',
    })
    if (e2) throw new Error('DB 갱신 실패: ' + e2.message)
    if (measuresPath) await sb.from('scores').update({ measures_path: measuresPath }).eq('id', id)
    log('1단계 완료', id, `${pngs.length}쪽, ${Math.round((Date.now() - t0) / 1000)}초 — 학생 열람 가능`)
    return { score, work, ext, inName, base, errors }
  } catch (err) {
    log('변환 실패', id, err.message)
    await sb.from('scores').update({ convert_status: 'failed', convert_error: String(err.message).slice(0, 500) }).eq('id', id)
    await fs.rm(work, { recursive: true, force: true })
    return null
  }
}

// 2단계(느림): 학생 다운로드용 MIDI / MusicXML / MuseScore 파일 / MP3(소리) — 줄 선 악보들의 1단계가 모두 끝난 뒤에 함
async function phase2(job) {
  const { score } = job
  const id = score.id
  let { work, ext, inName, base, errors } = job
  try {
    if (!work || !(await exists(path.join(work, inName ?? 'x')))) { // 서버 재시작 등으로 작업 폴더가 없으면 다시 받음
      work = await fs.mkdtemp(path.join(os.tmpdir(), 'mp-'))
      ;({ ext, inName } = await prepare(score, work))
      base = `out/${id}`; errors = []
    }
    log('2단계 시작', id, score.title)
    const t0 = Date.now()
    const outs = ['score.mid', 'score.musicxml']
    if (ext !== 'mscz') outs.push('score.mscz')
    outs.push('score.mp3')
    errors.push(...await exportAll(inName, outs, work))
    const patch = {}
    const put = async (f, type, key) => { if (await exists(path.join(work, f))) { await upload(`${base}/${f}`, path.join(work, f), type); patch[key] = `${base}/${f}` } }
    await put('score.mid', 'audio/midi', 'midi_path')
    await put('score.musicxml', 'application/vnd.recordare.musicxml+xml', 'xml_path')
    await put('score.mscz', 'application/octet-stream', 'mscz_path')
    await put('score.mp3', 'audio/mpeg', 'mp3_path')
    if (ext === 'mscz') patch.mscz_path = score.file_path
    if (!patch.mp3_path) patch.mp3_path = null
    if (errors.length) patch.convert_error = ('일부 형식 실패 — ' + errors.join(' | ')).slice(0, 500)
    else if (!patch.mp3_path) patch.convert_error = '소리 파일을 만들지 못했어요'
    await sb.from('scores').update(patch).eq('id', id)
    log('2단계 완료', id, patch.mp3_path ? '소리 포함' : '소리 없음', `${Math.round((Date.now() - t0) / 1000)}초`, errors.length ? `(실패 ${errors.length}개)` : '')
  } catch (err) {
    log('2단계 실패', id, err.message)
    await sb.from('scores').update({ convert_error: ('소리·다운로드 파일 실패 — ' + err.message).slice(0, 500) }).eq('id', id)
  } finally {
    if (work) await fs.rm(work, { recursive: true, force: true })
  }
}

// 줄 서기: 새로 올라온 악보의 1단계를 항상 먼저. 2단계(소리)는 1단계 줄이 비었을 때 하나씩.
const later = []
let busy = false
async function tick() {
  if (busy) return
  busy = true
  try {
    const seen = new Set() // 이번 차례에 이미 손댄 악보는 다시 잡지 않음 (무한 반복 방지)
    for (;;) {
      const { data, error } = await sb.from('scores').select('id, title, composer, file_path').eq('convert_status', 'pending').order('created_at').limit(5)
      if (error) { log('조회 실패', error.message); break }
      const fresh = (data ?? []).filter(s => !seen.has(s.id))
      if (fresh.length) {
        for (const s of fresh) { seen.add(s.id); const job = await phase1(s); if (job) later.push(job) }
        continue
      }
      const job = later.shift()
      if (!job) break
      await phase2(job)
    }
  } finally { busy = false }
}

// 서버가 2단계 도중에 재시작됐던 악보(페이지는 있는데 소리·오류 기록이 없음)를 다시 줄에 세움
async function recover() {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
  const { data } = await sb.from('scores').select('id, title, composer, file_path')
    .eq('convert_status', 'done').is('mp3_path', null).is('convert_error', null).gte('created_at', since)
  for (const s of data ?? []) if (!/\.pdf$/i.test(s.file_path) && !s.file_path.startsWith('demo/')) later.push({ score: s })
  if (data?.length) log('2단계 다시 줄 세움', later.length, '개')
}

log('변환 서버 시작, MuseScore:', MSCORE)
recover().catch(e => log('복구 확인 실패', e.message)).finally(() => { tick(); setInterval(tick, INTERVAL) })
