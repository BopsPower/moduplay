// 모두플레이 악기 나누기 서버 (Demucs htdemucs_6s: 보컬·기타·피아노·베이스·드럼·나머지)
// - stem_jobs 표에서 status='queued' 를 하나씩 가져와 처리
// - 원본: 저장소(source_bucket/source_path)에서 받음 → Demucs → mp3 6개를 'stems' 버킷 <job id>/ 에 올림
// - 할 일이 없는 채로 IDLE_MINUTES 지나면 서버를 스스로 끔 (요금 절약). 켜는 건 변환 서버가 해 줌
import { createClient } from '@supabase/supabase-js'
import WebSocket from 'ws'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env
const MODEL = process.env.STEM_MODEL || 'htdemucs_6s'
const PY = process.env.STEM_PYTHON || '/opt/stems-venv/bin/python'
const IDLE = Number(process.env.IDLE_MINUTES || 10) * 60 * 1000
const POLL = Number(process.env.POLL_SECONDS || 10) * 1000
const AUTO_OFF = process.env.AUTO_SHUTDOWN !== '0'
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { console.error('SUPABASE_URL, SUPABASE_SERVICE_KEY 필요'); process.exit(1) }

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket } })
const log = (...a) => console.log(new Date().toISOString(), ...a)
const STEMS = ['vocals', 'guitar', 'piano', 'bass', 'drums', 'other']

async function take() {
  // 가장 오래 기다린 것 하나를 'working'으로 (다른 서버와 겹치지 않게 상태 조건 걸고 바꿈)
  const { data } = await sb.from('stem_jobs').select('*').eq('status', 'queued').order('created_at').limit(1)
  const job = data?.[0]
  if (!job) return null
  const { data: got } = await sb.from('stem_jobs').update({ status: 'working', started_at: new Date().toISOString(), error: null })
    .eq('id', job.id).eq('status', 'queued').select('id')
  return got?.length ? job : null
}

async function work(job) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'stem-'))
  try {
    const ext = (job.source_path.match(/\.(\w+)$/)?.[1] || 'mp3').toLowerCase()
    const { data, error } = await sb.storage.from(job.source_bucket).download(job.source_path)
    if (error || !data) throw new Error('원본 받기 실패: ' + (error?.message || ''))
    const input = path.join(dir, `in.${ext}`)
    await fs.writeFile(input, Buffer.from(await data.arrayBuffer()))
    log('나누기 시작', job.id, job.source_path)
    const t0 = Date.now()
    // 작은 서버: 한 번에 짧게 잘라 처리(--segment)해서 메모리 아낌, mp3로 바로 저장
    await run(PY, ['-m', 'demucs', '-n', MODEL, '--mp3', '--mp3-bitrate', '192', '--segment', '7', '-j', '1', '-o', dir, input],
      { timeout: 60 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 })
    const outDir = path.join(dir, MODEL, 'in')
    const stems = {}
    for (const s of STEMS) {
      const f = path.join(outDir, `${s}.mp3`)
      try { await fs.access(f) } catch { continue }
      const dest = `${job.id}/${s}.mp3`
      const up = await sb.storage.from('stems').upload(dest, await fs.readFile(f), { contentType: 'audio/mpeg', upsert: true })
      if (up.error) throw new Error(`${s} 올리기 실패: ${up.error.message}`)
      stems[s] = dest
    }
    if (!Object.keys(stems).length) throw new Error('나눈 파일이 없어요')
    await sb.from('stem_jobs').update({ status: 'done', stems, model: MODEL, finished_at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000) }).eq('id', job.id)
    log('완료', job.id, Math.round((Date.now() - t0) / 1000) + '초')
  } catch (e) {
    log('실패', job.id, e.message)
    await sb.from('stem_jobs').update({ status: 'failed', error: String(e.message).slice(0, 500), finished_at: new Date().toISOString() }).eq('id', job.id)
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

// 서버가 꺼지는 바람에(스팟 회수 등) 'working'에 멈춘 일은 다시 줄 세움
async function recover() {
  const { data } = await sb.from('stem_jobs').update({ status: 'queued' }).eq('status', 'working').select('id')
  if (data?.length) log('멈췄던 작업 다시 줄 세움', data.length)
}

let last = Date.now()
async function loop() {
  for (;;) {
    const job = await take().catch(e => { log('조회 실패', e.message); return null })
    if (job) { await work(job); last = Date.now(); continue }
    if (AUTO_OFF && Date.now() - last > IDLE) {
      log(`${IDLE / 60000}분 동안 할 일이 없어 서버를 꺼요`)
      await run('sudo', ['shutdown', '-h', 'now']).catch(e => log('끄기 실패', e.message))
      return
    }
    await new Promise(r => setTimeout(r, POLL))
  }
}

log('악기 나누기 서버 시작, 모델:', MODEL)
recover().finally(loop)
