// 내 음원 보관함: 연 음원을 이 기기(브라우저) 안에 저장해 두고 다시 열기
// 서버로 보내지 않아요. 템포·A–B 구간·이름 붙인 위치도 음원별로 함께 기억
export type Mark = { t: number; name: string }
export type Track = {
  id: string; name: string; size: number; type: string; blob: Blob
  added_at: string; played_at: string
  tempo?: number; a?: number | null; b?: number | null; marks?: Mark[]; dur?: number
}
export type TrackInfo = Omit<Track, 'blob'>

const DB = 'moduplay-audio', STORE = 'tracks'
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

export const trackId = (f: { name: string; size: number }) => `${f.name}__${f.size}`

/** 목록 (음원 데이터는 빼고 가볍게) */
export async function listTracks(): Promise<TrackInfo[]> {
  const all = await run<Track[]>('readonly', s => s.getAll()).catch(() => [] as Track[])
  return (all ?? []).map(({ blob: _b, ...t }) => t).sort((x, y) => y.played_at.localeCompare(x.played_at))
}
export const getTrack = (id: string) => run<Track | undefined>('readonly', s => s.get(id)).catch(() => undefined)

/** 새 음원 저장 (이미 있으면 기록만 그대로 두고 최근 재생 시간만 갱신) */
export async function saveFile(f: File): Promise<Track> {
  const id = trackId(f)
  const old = await getTrack(id)
  const now = new Date().toISOString()
  const t: Track = old ? { ...old, played_at: now } : { id, name: f.name, size: f.size, type: f.type || 'audio/mpeg', blob: f, added_at: now, played_at: now, tempo: 100, a: null, b: null, marks: [] }
  try { navigator.storage?.persist?.() } catch { /* 없어도 됨 */ }
  await run('readwrite', s => s.put(t))
  return t
}

export async function updateTrack(id: string, patch: Partial<Omit<Track, 'id' | 'blob'>>) {
  const t = await getTrack(id)
  if (!t) return
  await run('readwrite', s => s.put({ ...t, ...patch })).catch(() => {})
}

export const deleteTrack = (id: string) => run('readwrite', s => s.delete(id)).catch(() => {})

export const fmtSize = (n: number) => n >= 1048576 ? `${(n / 1048576).toFixed(1)}MB` : `${Math.max(1, Math.round(n / 1024))}KB`
