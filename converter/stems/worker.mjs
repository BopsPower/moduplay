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

// 드라이브 원곡 가져오기 (앙상블): source_path = 'drive:<파일 id>', title = JSON {no, song, artist}
// 큰 wav(50MB 넘음)를 이 서버에서 받아 mp3 192k로 줄여 자료실 앙상블 '원곡'으로 등록
async function importDrive(job, dir) {
  const fileId = job.source_path.slice(6)
  const meta = JSON.parse(job.title || '{}')
  if (!meta.no || !meta.song) throw new Error('곡 정보 없음')
  const { data: had } = await sb.from('scores').select('id').contains('tags', [`auto:ens:${meta.no}`, 'auto:ens-part:원곡']).limit(1)
  if (had?.length) return { skipped: true }
  const r = await fetch(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=download&confirm=t`)
  if (!r.ok) throw new Error('드라이브 받기 실패 ' + r.status)
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length < 100000 || /^<!DOCTYPE|^<html/i.test(buf.subarray(0, 20).toString())) throw new Error('드라이브 파일이 공개되어 있지 않아요')
  const input = path.join(dir, 'in.wav'), out = path.join(dir, 'out.mp3')
  await fs.writeFile(input, buf)
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-codec:a', 'libmp3lame', '-b:a', '192k', out], { timeout: 10 * 60 * 1000 })
  // 같은 곡의 다른 파일에서 올린 사람·태그 형식을 그대로 따라 함
  const { data: sib } = await sb.from('scores').select('created_by, uploader_role, uploader_name, category, visibility').contains('tags', [`auto:ens:${meta.no}`]).eq('kind', '앙상블').limit(1)
  const s0 = sib?.[0] ?? {}
  const id = (await import('node:crypto')).randomUUID()
  const fp = `${id}.mp3`
  const up = await sb.storage.from('scores').upload(fp, await fs.readFile(out), { contentType: 'audio/mpeg', upsert: false })
  if (up.error) throw new Error('올리기 실패: ' + up.error.message)
  const { error } = await sb.from('scores').insert({
    id, title: `${meta.no}. ${meta.song} (원곡)`, kind: '앙상블', category: s0.category ?? '연습곡', visibility: s0.visibility ?? 'students',
    artist: meta.artist ?? null, song: meta.song, tags: [`auto:ens:${meta.no}`, 'auto:ens-part:원곡'], file_path: fp, mp3_path: fp,
    convert_status: 'done', created_by: s0.created_by ?? null, uploader_role: s0.uploader_role ?? 'coach', uploader_name: s0.uploader_name ?? null, areas: [],
  })
  if (error) { await sb.storage.from('scores').remove([fp]); throw new Error('자료 등록 실패: ' + error.message) }
  return { id }
}

async function work(job) {
  if (job.source_path?.startsWith('drive:')) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'drv-'))
    const t0 = Date.now()
    try {
      const r = await importDrive(job, dir)
      await sb.from('stem_jobs').update({ status: 'done', stems: r, model: 'drive-import', finished_at: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000) }).eq('id', job.id)
      log('드라이브 원곡 완료', job.id, JSON.stringify(r))
    } catch (e) {
      log('드라이브 원곡 실패', job.id, e.message)
      await sb.from('stem_jobs').update({ status: 'failed', error: String(e.message).slice(0, 500), finished_at: new Date().toISOString() }).eq('id', job.id)
    } finally { await fs.rm(dir, { recursive: true, force: true }).catch(() => {}) }
    return
  }
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

// 학생이 내 음원 보관함에서 지운 곡의 나눈 결과도 지움 (원장님 결정 2026-11-03: A)
async function cleanup() {
  const { data: jobs } = await sb.from('stem_jobs').select('id, source_path').eq('source_bucket', 'my-audio').limit(1000)
  if (!jobs?.length) return
  const paths = [...new Set(jobs.map(j => j.source_path))]
  const alive = new Set()
  for (let i = 0; i < paths.length; i += 200) {
    const { data } = await sb.from('my_audio').select('path').in('path', paths.slice(i, i + 200))
    for (const r of data ?? []) alive.add(r.path)
  }
  const gone = jobs.filter(j => !alive.has(j.source_path))
  for (const j of gone) {
    const files = ['vocals', 'guitar', 'piano', 'bass', 'drums', 'other'].map(s => `${j.id}/${s}.mp3`)
    await sb.storage.from('stems').remove(files).catch(() => {})
    await sb.from('stem_jobs').delete().eq('id', j.id)
  }
  if (gone.length) log('보관함에서 지운 곡의 나눈 결과 정리', gone.length, '개')
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
cleanup().catch(e => log('정리 실패', e.message))
setInterval(() => cleanup().catch(() => {}), 60 * 60 * 1000)
recover().finally(loop)
