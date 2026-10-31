// 내 뮤지션 캐릭터: 계정 정보(user_metadata.avatar)에 저장 — 표 추가 없이 본인만 읽고 씀
import { supabase } from './supabase'

export type Inst = 'mic' | 'guitar' | 'bass' | 'drum' | 'keys' | 'midi'
export type ItemKey = 'phones' | 'beanie' | 'shades' | 'gold' | 'stage' | 'spot' | 'crown'
export type AvatarLook = {
  inst: Inst; gender: 'm' | 'f'; outfit: string; color: string; color2: string; bg: string
  face: string; hairStyle: string; hairColor: string; skin: string
  nick?: string; items?: Partial<Record<ItemKey, boolean>>
}

export const INSTS: [Inst, string][] = [['mic', '보컬'], ['guitar', '기타'], ['bass', '베이스'], ['drum', '드럼'], ['keys', '건반'], ['midi', '미디 작곡']]
export const NICKS: Record<'m' | 'f', Record<Inst, string>> = {
  m: { mic: '고음장인', guitar: '리프중독', bass: '저음담당', drum: '비트깡패', keys: '보이싱맛집', midi: '새벽작업러' },
  f: { mic: '음색깡패', guitar: '코드천재', bass: '그루브퀸', drum: '필인장인', keys: '감성충만', midi: '808러버' },
}
export const OUTFITS: [string, string][] = [['hoodie', '후드티'], ['jacket', '재킷'], ['tee', '반팔티'], ['ballad', '발라드 니트'], ['hiphop', '힙합 저지'], ['classic', '클래식 턱시도'], ['jazz', '재즈 베스트'], ['rock', '록 라이더 재킷']]
export const COLORS: [string, string, string][] = [['#3d5afe', '코발트', '#ffffff'], ['#ff4fa3', '핫핑크', '#ffe14d'], ['#c6f432', '라임', '#1d1a17'], ['#b69cff', '라일락', '#ff4fa3'], ['#00c2a8', '민트', '#ffffff'], ['#1d1a17', '블랙', '#c6f432']]
export const BGS: [string, string][] = [['#ffd6e8', '핑크'], ['#c6f432', '라임'], ['#b69cff', '라일락'], ['#9be7ff', '하늘'], ['#ffe14d', '옐로']]
export const SKIN_LIST: [string, string, string][] = [['light', '#fde3cf', '밝은'], ['base', '#f6d0b0', '기본'], ['tan', '#e3ab7c', '태닝'], ['brown', '#b0744c', '브라운'], ['deep', '#74462c', '딥']]
export const HAIR_COLORS: [string, string][] = [['#2a1d17', '흑갈색'], ['#1d1a17', '검정'], ['#e8c45a', '탈색'], ['#8a3ffc', '보라'], ['#ff4fa3', '핑크']]
export const FACES: [string, string][] = [['smile', '웃음'], ['calm', '쿨'], ['wink', '장난'], ['focus', '집중']]
export const HAIRS: [string, string][] = [['short', '댄디'], ['spiky', '삐죽'], ['curly', '펌'], ['long', '긴머리'], ['bob', '단발'], ['bun', '양갈래 번'], ['afro', '소울 아프로'], ['mohawk', '펑크 모히칸'], ['dreads', '레게 드레드'], ['pomp', '로큰롤 리젠트'], ['metal', '메탈 장발']]

/** 꾸밈 아이템: 이미 있는 뮤지션 배지와 이어짐 (badge가 없으면 처음부터 열림) */
export const ITEMS: { key: ItemKey; name: string; how: string; badge?: string }[] = [
  { key: 'phones', name: '헤드폰', how: '처음부터 열려 있어요' },
  { key: 'beanie', name: '비니', how: '3일 연속 연습', badge: 'streak3' },
  { key: 'shades', name: '선글라스', how: '7일 연속 연습', badge: 'streak7' },
  { key: 'gold', name: '금색 악기', how: '템포 사다리 첫 완주', badge: 'ladder1' },
  { key: 'stage', name: '네온 무대', how: '누적 10시간 연습', badge: 'total10h' },
  { key: 'spot', name: '스포트라이트', how: '30일 연속 연습', badge: 'streak30' },
  { key: 'crown', name: '왕관', how: '뮤지션 배지 16개 모두', badge: '*all' },
]

/** 전공 글자로 기본 악기 고르기 */
export function instOfMajor(major?: string | null): Inst {
  const m = major ?? ''
  if (/보컬|노래|싱어/.test(m) && !/송라이터/.test(m)) return 'mic'
  if (/베이스/.test(m)) return 'bass'
  if (/드럼|타악/.test(m)) return 'drum'
  if (/피아노|건반|키보드/.test(m)) return 'keys'
  if (/작곡|미디|프로듀/.test(m)) return 'midi'
  if (/기타|송라이터/.test(m)) return 'guitar'
  return 'mic'
}

/** 처음 만들 때의 기본 모습 (전공별 시안 캐릭터) */
export function defaultLook(inst: Inst, gender: 'm' | 'f'): AvatarLook {
  const base: Record<string, Omit<AvatarLook, 'inst' | 'gender'>> = {
    'mic-m': { outfit: 'classic', color: '#1d1a17', color2: '#ff4fa3', bg: '#c6f432', face: 'smile', hairStyle: 'pomp', hairColor: '#1d1a17', skin: 'base' },
    'mic-f': { outfit: 'ballad', color: '#ff4fa3', color2: '#ffe14d', bg: '#b69cff', face: 'wink', hairStyle: 'long', hairColor: '#2a1d17', skin: 'base' },
    'guitar-m': { outfit: 'rock', color: '#3d5afe', color2: '#ffffff', bg: '#ffd6e8', face: 'calm', hairStyle: 'metal', hairColor: '#1d1a17', skin: 'base' },
    'guitar-f': { outfit: 'jazz', color: '#7c4dff', color2: '#c6f432', bg: '#ffe14d', face: 'smile', hairStyle: 'bob', hairColor: '#1d1a17', skin: 'base' },
    'bass-m': { outfit: 'hiphop', color: '#2b2d42', color2: '#c6f432', bg: '#ff9e7a', face: 'calm', hairStyle: 'short', hairColor: '#1d1a17', skin: 'base' },
    'bass-f': { outfit: 'jazz', color: '#c6f432', color2: '#1d1a17', bg: '#b69cff', face: 'calm', hairStyle: 'long', hairColor: '#8a3ffc', skin: 'base' },
    'drum-m': { outfit: 'rock', color: '#ff5a36', color2: '#1d1a17', bg: '#9be7ff', face: 'focus', hairStyle: 'spiky', hairColor: '#2a1d17', skin: 'base' },
    'drum-f': { outfit: 'hoodie', color: '#00c2a8', color2: '#ff4fa3', bg: '#ffe14d', face: 'focus', hairStyle: 'bun', hairColor: '#1d1a17', skin: 'base' },
    'keys-m': { outfit: 'classic', color: '#00c2a8', color2: '#ffffff', bg: '#ffd6e8', face: 'calm', hairStyle: 'short', hairColor: '#2a1d17', skin: 'base' },
    'keys-f': { outfit: 'ballad', color: '#ffe14d', color2: '#3d5afe', bg: '#9be7ff', face: 'smile', hairStyle: 'bun', hairColor: '#5a3a2a', skin: 'base' },
    'midi-m': { outfit: 'hiphop', color: '#141225', color2: '#b69cff', bg: '#3d5afe', face: 'calm', hairStyle: 'short', hairColor: '#2a1d17', skin: 'base' },
    'midi-f': { outfit: 'jacket', color: '#b69cff', color2: '#ff4fa3', bg: '#c6f432', face: 'wink', hairStyle: 'bob', hairColor: '#1d1a17', skin: 'base' },
  }
  return { inst, gender, ...base[`${inst}-${gender}`], items: {} }
}

export const nickOf = (l: AvatarLook) => (l.nick?.trim() || NICKS[l.gender][l.inst])

/** 저장된 내 캐릭터 (없으면 null) */
export function lookOf(meta: Record<string, unknown> | undefined | null): AvatarLook | null {
  const a = meta?.avatar as AvatarLook | undefined
  return a && typeof a === 'object' && a.inst ? a : null
}

export async function saveLook(look: AvatarLook) {
  const { error } = await supabase.auth.updateUser({ data: { avatar: look } })
  return error
}

/** 열린 아이템: 직원(코치·관리자)은 모두, 학생은 받은 배지로 */
export async function unlockedItems(isStaff: boolean): Promise<Set<ItemKey>> {
  if (isStaff) return new Set(ITEMS.map(i => i.key))
  const { data } = await supabase.from('musician_badges').select('badge')
  const have = new Set((data ?? []).map(r => r.badge as string))
  return new Set(ITEMS.filter(i => !i.badge || (i.badge === '*all' ? have.size >= 16 : have.has(i.badge))).map(i => i.key))
}
