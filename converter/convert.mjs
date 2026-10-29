// 모두플레이 악보 변환 서버
// - Supabase에서 convert_status = 'pending' 인 악보를 20초마다 확인
// - MuseScore 4로 PDF / PNG(페이지별) / MP3 / MusicXML 생성 → storage 'scores' 버킷에 업로드
// - 완료되면 scores 행을 갱신
import { createClient } from '@supabase/supabase-js'
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

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
const log = (...a) => console.log(new Date().toISOString(), ...a)

async function mscore(args, cwd) {
  // 화면 없는 서버에서 MuseScore 실행 (xvfb-run으로 가상 화면)
  const env = { ...process.env, QT_QPA_PLATFORM: 'offscreen', HOME: cwd }
  const { stdout, stderr } = await run('xvfb-run', ['-a', MSCORE, '--no-webview', ...args], { cwd, env, timeout: 180000, maxBuffer: 32 * 1024 * 1024 })
  return stdout + stderr
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
    const src = path.join(work, 'score.mscz')
    await fs.writeFile(src, Buffer.from(await data.arrayBuffer()))

    // 한 번에 여러 형식으로 내보내기 (MuseScore -j 배치)
    const job = [
      { in: 'score.mscz', out: ['score.pdf', 'score.mp3', 'score.musicxml', 'page.png', 'meta.json'] },
    ]
    await fs.writeFile(path.join(work, 'job.json'), JSON.stringify(job))
    const out = await mscore(['-j', 'job.json'], work)

    const files = await fs.readdir(work)
    const pngs = files.filter(f => /^page-\d+\.png$/.test(f)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
    if (!files.includes('score.pdf') || pngs.length === 0) throw new Error('MuseScore 출력 없음: ' + out.slice(-600))

    let meta = {}
    try { meta = JSON.parse(await fs.readFile(path.join(work, 'meta.json'), 'utf8')) } catch { /* 없어도 진행 */ }

    const base = `out/${id}`
    await upload(`${base}/score.pdf`, path.join(work, 'score.pdf'), 'application/pdf')
    if (files.includes('score.mp3')) await upload(`${base}/score.mp3`, path.join(work, 'score.mp3'), 'audio/mpeg')
    if (files.includes('score.musicxml')) await upload(`${base}/score.musicxml`, path.join(work, 'score.musicxml'), 'application/vnd.recordare.musicxml+xml')
    for (let i = 0; i < pngs.length; i++) await upload(`${base}/page-${i + 1}.png`, path.join(work, pngs[i]), 'image/png')
    if (files.includes('meta.json')) await upload(`${base}/meta.json`, path.join(work, 'meta.json'), 'application/json')

    const { error: e2 } = await sb.rpc('mark_converted', {
      p_score_id: id,
      p_pdf: `${base}/score.pdf`,
      p_mp3: files.includes('score.mp3') ? `${base}/score.mp3` : null,
      p_xml: files.includes('score.musicxml') ? `${base}/score.musicxml` : null,
      p_pages: pngs.length,
      p_duration: meta.duration ?? null,
      p_title: meta.title ?? '',
      p_composer: meta.composer ?? '',
    })
    if (e2) throw new Error('DB 갱신 실패: ' + e2.message)
    log('변환 완료', id, `${pngs.length}쪽`)
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
