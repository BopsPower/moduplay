// 내 음원 보관함: 서버(비공개, 나만)에 한 사람당 10곡까지 저장 → 어느 기기에서나 다시 열기
// 이 기기에는 음원을 한 번 받아 두어(캐시) 다음엔 바로 열림. 템포·A–B 구간·이름 붙인 위치도 음원별로 기억
// 서버 표가 아직 없으면(설치 전) 예전처럼 이 기기에만 저장
import { supabase } from './supabase'

export type Mark = { t: number; name: string }
export type TrackInfo = {
  id: string; name: string; size: number; type: string; path?: string
  added_at: string; played_at: string
  tempo?: number; a?: number | null; b?: number | null; marks?: Mark[]; dur?: number | null
  local?: boolean // 서버가 아니라 이 기기에만 있는 음원
}
export const MAX_TRACKS = 10
export const MAX_BYTES = 30 * 1024 * 1024

// ── 이 기기 저장소 (IndexedDB) ──
const DB = 'moduplay-audio', STORE = 'tracks'
type LocalRow = TrackInfo & { blob: Blob }
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' })
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  return db().then(d => new Promise<T>((res, rej) => {
    const tx = d.transaction(STORE, mode)
    const q = fn(tx.objectStore(STORE))
    tx.oncomplete = () => res((q && (q as IDBRequest).result) as T)
    tx.onerror = () => rej(tx.error)
    tx.onabort = () => rej(tx.error)
  }))
}
const localGet = (id: string) => run<LocalRow | undefined>('readonly', s => s.get(id)).catch(() => undefined)
const localPut = (row: LocalRow) => run('readwrite', s => s.put(row)).catch(() => {})
const localDel = (id: string) => run('readwrite', s => s.delete(id)).catch(() => {})
const localAll = () => run<LocalRow[]>('readonly', s => s.getAll()).catch(() => [] as LocalRow[])

// ── 서버 ──
type Row = { id: string; name: string; size: number; type: string; path: string; tempo: number; loop_a: number | null; loop_b: number | null; marks: Mark[]; dur: number | null; added_at: string; played_at: string }
const toInfo = (r: Row): TrackInfo => ({ id: r.id, name: r.name, size: r.size, type: r.type, path: r.path, added_at: r.added_at, played_at: r.played_at, tempo: r.tempo, a: r.loop_a, b: r.loop_b, marks: r.marks ?? [], dur: r.dur })
let serverOk: boolean | null = null

/** 목록 (최근 재생 순) */
export async function listTracks(): Promise<{ list: TrackInfo[]; server: boolean }> {
  const { data, error } = await supabase.from('my_audio').select('*').order('played_at', { ascending: false })
  if (error) {
    serverOk = false
    const all = (await localAll()) ?? []
    return { list: all.filter(r => !r.path).map(({ blob: _b, ...t }) => ({ ...t, local: true })).sort((x, y) => y.played_at.localeCompare(x.played_at)), server: false }
  }
  serverOk = true
  return { list: (data as Row[]).map(toInfo), server: true }
}

export type SaveResult = { track: TrackInfo } | { error: 'full' | 'big' | 'fail'; message: string }

/** 연 음원 저장: 같은 이름·크기가 이미 있으면 그걸 다시 씀 */
export async function saveFile(f: File, existing: TrackInfo[]): Promise<SaveResult> {
  const now = new Date().toISOString()
  const same = existing.find(t => t.name === f.name && t.size === f.size)
  if (same) {
    await updateTrack(same, { played_at: now })
    if (!(await localGet(same.id))) localPut({ ...same, blob: f })
    return { track: { ...same, played_at: now } }
  }
  if (serverOk === false) {
    const t: TrackInfo = { id: `${f.name}__${f.size}`, name: f.name, size: f.size, type: f.type || 'audio/mpeg', added_at: now, played_at: now, tempo: 100, a: null, b: null, marks: [], local: true }
    await localPut({ ...t, blob: f })
    return { track: t }
  }
  if (f.size > MAX_BYTES) return { error: 'big', message: `30MB가 넘는 음원은 보관함에 저장하지 않아요. 재생·연습은 그대로 돼요.` }
  if (existing.length >= MAX_TRACKS) return { error: 'full', message: `보관함이 꽉 찼어요 (${MAX_TRACKS}곡). 아래에서 하나 지우고 다시 열면 저장돼요. 재생·연습은 그대로 돼요.` }
  const type = f.type || (/\.m4a$/i.test(f.name) ? 'audio/mp4' : /\.wav$/i.test(f.name) ? 'audio/wav' : 'audio/mpeg')
  const { data, error } = await supabase.from('my_audio').insert({ name: f.name.slice(0, 200), size: f.size, type }).select().single()
  if (error || !data) {
    if (/MY_AUDIO_LIMIT/.test(error?.message ?? '')) return { error: 'full', message: `보관함이 꽉 찼어요 (${MAX_TRACKS}곡). 하나 지우고 다시 열면 저장돼요.` }
    return { error: 'fail', message: '보관함에 저장하지 못했어요. 재생·연습은 그대로 돼요.' }
  }
  const row = data as Row
  const up = await supabase.storage.from('my-audio').upload(row.path, f, { contentType: type, upsert: false })
  if (up.error) {
    await supabase.from('my_audio').delete().eq('id', row.id)
    return { error: 'fail', message: '음원을 올리지 못했어요 (인터넷 연결을 확인해 주세요). 재생·연습은 그대로 돼요.' }
  }
  const t = toInfo(row)
  localPut({ ...t, blob: f })
  return { track: t }
}

/** 음원 받기: 이 기기에 있으면 바로, 없으면 서버에서 받아 두기 */
export async function getBlob(t: TrackInfo): Promise<Blob | null> {
  const c = await localGet(t.id)
  if (c?.blob) return c.blob
  if (!t.path) return null
  const { data, error } = await supabase.storage.from('my-audio').download(t.path)
  if (error || !data) return null
  localPut({ ...t, blob: data })
  return data
}

export async function updateTrack(t: TrackInfo, patch: Partial<Pick<TrackInfo, 'tempo' | 'a' | 'b' | 'marks' | 'dur' | 'played_at'>>) {
  if (t.local) {
    const c = await localGet(t.id)
    if (c) await localPut({ ...c, ...patch })
    return
  }
  const row: Record<string, unknown> = {}
  if ('tempo' in patch) row.tempo = patch.tempo
  if ('a' in patch) row.loop_a = patch.a
  if ('b' in patch) row.loop_b = patch.b
  if ('marks' in patch) row.marks = patch.marks
  if ('dur' in patch) row.dur = patch.dur
  if ('played_at' in patch) row.played_at = patch.played_at
  await supabase.from('my_audio').update(row).eq('id', t.id)
}

export async function deleteTrack(t: TrackInfo) {
  if (!t.local) {
    if (t.path) await supabase.storage.from('my-audio').remove([t.path])
    await supabase.from('my_audio').delete().eq('id', t.id)
  }
  await localDel(t.id)
}

export const fmtSize = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`
