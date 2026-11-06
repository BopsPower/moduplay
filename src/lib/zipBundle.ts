// 음원 묶음(ZIP) 자료 도우미 (2026-11-06 원장님 요청: 외국 교재처럼 교재 + 음원 ZIP을 짝으로)
// 1) ZIP 안 파일 목록 읽기: 파일 끝의 목록(중앙 디렉터리)만 읽어서, 300MB ZIP도 바로 읽음 (압축은 풀지 않음)
// 2) 큰 파일 올리기: Supabase 이어 올리기(TUS) — 6MB씩 나눠 올리고, 끊기면 그 자리부터 다시
import { supabase, SUPABASE_KEY, SUPABASE_URL } from './supabase'

export type ZipInfo = { size: number; audio: number; files: { n: string; s: number }[] }

export const ZIP_EXT = /\.zip$/i
export const ZIP_LIMIT = 300 * 1024 * 1024
export const ZIP_AUDIO = /\.(mp3|m4a|wav|aac|flac|ogg|aif|aiff)$/i

/** ZIP 파일 안의 파일 이름·크기 목록. ZIP이 아니거나 못 읽으면 null */
export async function readZipList(file: File | Blob): Promise<ZipInfo | null> {
  try {
    const size = file.size
    if (size < 22) return null
    const tailLen = Math.min(size, 22 + 65535)
    const tail = new DataView(await file.slice(size - tailLen).arrayBuffer())
    let eocd = -1
    for (let i = tail.byteLength - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break }
    if (eocd < 0) return null
    let count = tail.getUint16(eocd + 10, true)
    let cdSize = tail.getUint32(eocd + 12, true)
    let cdOff = tail.getUint32(eocd + 16, true)
    if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff) {
      // ZIP64 (아주 큰 ZIP이나 일부 프로그램이 만든 ZIP)
      const loc = eocd - 20
      if (loc < 0 || tail.getUint32(loc, true) !== 0x07064b50) return null
      const z64 = Number(tail.getBigUint64(loc + 8, true))
      const z = new DataView(await file.slice(z64, z64 + 56).arrayBuffer())
      if (z.getUint32(0, true) !== 0x06064b50) return null
      count = Number(z.getBigUint64(32, true)); cdSize = Number(z.getBigUint64(40, true)); cdOff = Number(z.getBigUint64(48, true))
    }
    if (cdOff + cdSize > size) return null
    const cd = new DataView(await file.slice(cdOff, cdOff + cdSize).arrayBuffer())
    const strict = new TextDecoder('utf-8', { fatal: true }), loose = new TextDecoder('utf-8')
    let kr: TextDecoder | null = null
    try { kr = new TextDecoder('euc-kr') } catch { kr = null } // 윈도우에서 만든 ZIP은 이름이 한글 윈도우 글자(CP949)
    const files: { n: string; s: number }[] = []
    let p = 0
    for (let k = 0; k < count && p + 46 <= cd.byteLength; k++) {
      if (cd.getUint32(p, true) !== 0x02014b50) break
      const flag = cd.getUint16(p + 8, true)
      let s = cd.getUint32(p + 24, true)
      const nl = cd.getUint16(p + 28, true), el = cd.getUint16(p + 30, true), cl = cd.getUint16(p + 32, true)
      const raw = new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nl)
      let name: string
      if (flag & 0x800) name = loose.decode(raw)
      else { try { name = strict.decode(raw) } catch { name = kr ? kr.decode(raw) : loose.decode(raw) } }
      if (s === 0xffffffff) { // ZIP64: 크기는 덧붙인 칸(id 0x0001)에
        let e = p + 46 + nl
        const end = e + el
        while (e + 4 <= end) {
          const id = cd.getUint16(e, true), len = cd.getUint16(e + 2, true)
          if (id === 0x0001 && len >= 8) { s = Number(cd.getBigUint64(e + 4, true)); break }
          e += 4 + len
        }
      }
      p += 46 + nl + el + cl
      if (name.endsWith('/') || /(^|\/)(__MACOSX\/|\.DS_Store$|\._)/.test(name) || /(^|\/)Thumbs\.db$/i.test(name)) continue
      files.push({ n: name, s })
    }
    files.sort((a, b) => a.n.localeCompare(b.n, 'ko', { numeric: true }))
    return { size, audio: files.filter(f => ZIP_AUDIO.test(f.n)).length, files: files.slice(0, 1000) }
  } catch { return null }
}

/** 목록에 보여 줄 짧은 이름 (폴더 경로 빼고) */
export const zipShortName = (n: string) => n.slice(n.lastIndexOf('/') + 1)

export const fmtMB = (b?: number | null) => b == null ? '' : b >= 1024 * 1024 * 100 ? `${Math.round(b / 1024 / 1024)}MB` : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`

const CHUNK = 6 * 1024 * 1024 // Supabase 이어 올리기는 6MB 조각만 받음
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)))

function resumableEndpoint() {
  // 큰 파일은 저장소 전용 주소(xxx.storage.supabase.co)가 더 빠르고 안정적
  const m = SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/)
  return m ? `https://${m[1]}.storage.supabase.co/storage/v1/upload/resumable` : `${SUPABASE_URL.replace(/\/$/, '')}/storage/v1/upload/resumable`
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession() // 오래 걸리는 업로드 중에도 새 토큰을 받아 씀
  const token = data.session?.access_token
  if (!token) throw new Error('로그인이 풀렸어요. 다시 로그인한 뒤 올려 주세요.')
  return { authorization: `Bearer ${token}`, apikey: SUPABASE_KEY, 'tus-resumable': '1.0.0' }
}

function tooBig(status: number) {
  return status === 413 ? new Error('저장 공간의 업로드 한도보다 큰 파일이에요. 관리자에게 Supabase 저장소 업로드 한도(300MB)를 확인해 달라고 해 주세요.') : null
}

/** 큰 파일 올리기 (6MB씩 · 끊기면 이어서 · onProgress 0~1) */
export async function resumableUpload(bucket: string, path: string, file: File, contentType: string, onProgress?: (p: number) => void) {
  const endpoint = resumableEndpoint()
  const create = await fetch(endpoint, {
    method: 'POST',
    headers: {
      ...(await authHeaders()),
      'upload-length': String(file.size),
      'upload-metadata': [`bucketName ${b64(bucket)}`, `objectName ${b64(path)}`, `contentType ${b64(contentType)}`, `cacheControl ${b64('3600')}`].join(','),
      'x-upsert': 'false',
    },
  })
  if (create.status !== 201) {
    const big = tooBig(create.status)
    if (big) throw big
    throw new Error(`파일 업로드를 시작하지 못했어요 (${create.status}). 잠시 뒤 다시 해 주세요.`)
  }
  const loc = create.headers.get('location')
  if (!loc) throw new Error('파일 업로드 주소를 받지 못했어요. 잠시 뒤 다시 해 주세요.')
  const url = new URL(loc, endpoint).toString()

  let offset = 0
  let fails = 0
  onProgress?.(0)
  while (offset < file.size) {
    const part = file.slice(offset, Math.min(file.size, offset + CHUNK))
    try {
      const r = await fetch(url, {
        method: 'PATCH',
        headers: { ...(await authHeaders()), 'upload-offset': String(offset), 'content-type': 'application/offset+octet-stream' },
        body: part,
      })
      if (r.status === 204 || r.ok) {
        const next = Number(r.headers.get('upload-offset'))
        offset = Number.isFinite(next) && next > offset ? next : offset + part.size
        fails = 0
        onProgress?.(offset / file.size)
        continue
      }
      const big = tooBig(r.status)
      if (big) throw big
      if (r.status === 409) { // 서버가 받은 위치와 다름 → 서버에 물어보고 거기서부터
        const h = await fetch(url, { method: 'HEAD', headers: await authHeaders() })
        const at = Number(h.headers.get('upload-offset'))
        if (Number.isFinite(at)) { offset = at; continue }
      }
      throw new Error(`올리다가 멈췄어요 (${r.status})`)
    } catch (e) {
      if ((e as Error).message.startsWith('저장 공간')) throw e
      if (++fails > 4) throw new Error('인터넷 연결이 자꾸 끊겨서 올리지 못했어요. 와이파이에서 다시 해 주세요.')
      await new Promise(res => setTimeout(res, 1500 * fails))
      try { // 끊긴 자리 확인
        const h = await fetch(url, { method: 'HEAD', headers: await authHeaders() })
        const at = Number(h.headers.get('upload-offset'))
        if (Number.isFinite(at) && at >= 0) offset = at
      } catch { /* 같은 자리에서 다시 */ }
    }
  }
  onProgress?.(1)
}
