// 모두플레이 서비스워커: 화면 껍데기만 저장. 로그인·악보 데이터(Supabase)는 건드리지 않음.
const CACHE = 'moduplay-__BUILD__' // 배포할 때 빌드 번호로 바뀜 → 옛 저장본은 자동 삭제
const SOUNDS = 'moduplay-sounds-v1' // 악기 소리: 배포와 상관없이 계속 보관 (파일 이름에 버전이 있음)
const SOUNDS_URL = 'https://stnyjclifmcbxeorcoje.supabase.co/storage/v1/object/public/sounds/'
const SHELL = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== SOUNDS).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (req.url.startsWith(SOUNDS_URL)) {
    // 악기 소리: 저장본 우선 (한 번 받으면 인터넷이 약해도 바로 재생)
    e.respondWith(caches.open(SOUNDS).then(c => c.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r }))))
    return
  }
  if (url.origin !== self.location.origin) return // Supabase 등 외부 요청은 그대로
  if (req.mode === 'navigate') {
    // 화면: 네트워크 우선, 오프라인이면 저장된 화면
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put('/', c)); return r }).catch(() => caches.match('/')))
    return
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/site/')) {
    // 빌드 파일·아이콘·사진: 저장본 우선
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(req, c)) } return r })))
  }
})
