// 브라우저 안에 큰 목록을 기억해 두는 작은 저장소 (IndexedDB).
// localStorage는 5MB 안팎이라 악보 1만 개 목록을 담기엔 작아서 이걸 씀. 실패하면 조용히 넘어감.
const DB = 'moduplay-cache', STORE = 'kv'

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE)
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}

export async function cacheGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await open()
    return await new Promise<T | undefined>(res => {
      const q = db.transaction(STORE).objectStore(STORE).get(key)
      q.onsuccess = () => res(q.result as T | undefined)
      q.onerror = () => res(undefined)
    })
  } catch { return undefined }
}

export async function cacheSet(key: string, value: unknown) {
  try {
    const db = await open()
    await new Promise<void>(res => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => res(); tx.onerror = () => res()
    })
  } catch { /* 기억 못 해도 화면은 정상 */ }
}
