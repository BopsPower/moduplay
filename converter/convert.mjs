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

async function upload(storagePath, localPath, contentType) {
  const data = await fs.readFile(localPath)
  const { error } = await sb.storage.from('scores').upload(storagePath, data, { contentType, upsert: true })
  if (error) throw new Error(`upload ${storagePath}: ${error.message}`)
}

async function convertOne(score) {
  const id = score.id
  log('변환 시작', id, score.title)
  await sb.from('scores').update({ convert_status: 'converting', convert_error: null }).eq('id', id)
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'mp-'))
  try {
    const { data, error } = await sb.storage.from('scores').download(score.file_path)
    if (error || !data) throw new Error('원본 파일을 받지 못했어요: ' + (error?.message ?? ''))
    // 원본 확장자 유지 (.mscz / .musicxml / .mxl / .xml 모두 MuseScore가 읽음)
    const ext = (score.file_path.match(/\.(mscz|musicxml|mxl|xml|mid|midi|gp|gp3|gp4|gp5|gpx)$/i)?.[1] ?? 'mscz').toLowerCase()
    const inName = `score.${ext}`
    const src = path.join(work, inName)
    await fs.writeFile(src, Buffer.from(await data.arrayBuffer()))
    await fs.copyFile(src, `/tmp/last-input.${ext}`).catch(() => {})

    // 1단계(빠름, ~30초): PDF + 페이지 PNG + meta → 바로 'done' 처리해서 학생이 볼 수 있게 함
    // 2단계(느림, 수 분): MP3(소리 합성) + MusicXML → 끝나는 대로 덧붙임
    const base = `out/${id}`
    const errors = []
    const out = await mscore(['-o', 'score.pdf', inName], work)
    await mscore(['-r', String(process.env.PNG_DPI || 150), '-o', 'page.png', inName], work) // 150dpi: 화면용으로 충분, 360dpi보다 훨씬 빠름
    try { await mscore(['-o', 'meta.json', inName], work) } catch (e) { errors.push('meta.json: ' + e.message.split('\n')[0]) }
    // 마디 위치/시간표 (재생 커서, 마디 클릭 이동, 구간 반복에 사용)
    try { await mscore(['-o', 'score.mpos', inName], work) } catch (e) { errors.push('mpos: ' + e.message.split('\n')[0]) }

    let files = await fs.readdir(work)
    const pngs = files.filter(f => /^page-\d+\.png$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
    if (!files.includes('score.pdf') || pngs.length === 0) throw new Error('MuseScore 출력 없음: ' + clean(out))

    let meta = {}
    try { meta = JSON.parse(await fs.readFile(path.join(work, 'meta.json'), 'utf8')) } catch { /* 없어도 진행 */ }

    await upload(`${base}/score.pdf`, path.join(work, 'score.pdf'), 'application/pdf')
    for (let i = 0; i < pngs.length; i++) await upload(`${base}/page-${i + 1}.png`, path.join(work, pngs[i]), 'image/png')
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
    log('페이지 준비 완료', id, `${pngs.length}쪽 — 학생 열람 가능. 소리 파일 만드는 중…`)

    // 2단계
    const phase2 = ['score.mp3']
    if (ext !== 'mscz') phase2.push('score.mscz') // MusicXML로 올린 악보도 프로그램에서 열 수 있게 .mscz 생성
    if (ext === 'mscz') phase2.push('score.musicxml')
    for (const o of phase2) {
      try { await mscore(['-o', o, inName], work) }
      catch (e) { errors.push(`${o}: ${e.message.split('\n')[0]}`); log('선택 출력 실패', id, o, e.message.split('\n')[0]) }
    }
    files = await fs.readdir(work)
    const patch = {}
    if (files.includes('score.mp3')) { await upload(`${base}/score.mp3`, path.join(work, 'score.mp3'), 'audio/mpeg'); patch.mp3_path = `${base}/score.mp3` }
    if (ext === 'mscz' && files.includes('score.musicxml')) { await upload(`${base}/score.musicxml`, path.join(work, 'score.musicxml'), 'application/vnd.recordare.musicxml+xml'); patch.xml_path = `${base}/score.musicxml` }
    if (ext !== 'mscz') { patch.xml_path = score.file_path; if (files.includes('score.mscz')) { await upload(`${base}/score.mscz`, path.join(work, 'score.mscz'), 'application/octet-stream'); patch.mscz_path = `${base}/score.mscz` } }
    if (errors.length) patch.convert_error = ('일부 형식 실패 — ' + errors.join(' | ')).slice(0, 500)
    if (Object.keys(patch).length) await sb.from('scores').update(patch).eq('id', id)
    log('변환 완료', id, patch.mp3_path ? '소리 포함' : '소리 없음', errors.length ? `(실패 ${errors.length}개)` : '')
  } catch (err) {
    log('변환 실패', id, err.message)
    await sb.from('scores').update({ convert_status: 'failed', convert_error: String(err.message).slice(0, 500) }).eq('id', id)
  } finally {
    await fs.rm(work, { recursive: true, force: true })
  }
}

let busy = false
async function tick() {
  if (busy) return
  busy = true
  try {
    const { data, error } = await sb.from('scores').select('id, title, file_path').eq('convert_status', 'pending').order('created_at').limit(3)
    if (error) log('조회 실패', error.message)
    for (const s of data ?? []) await convertOne(s)
  } finally { busy = false }
}

log('변환 서버 시작, MuseScore:', MSCORE)
tick()
setInterval(tick, INTERVAL)
