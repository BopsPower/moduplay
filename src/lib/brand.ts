// 학원 정보 (본 사이트 www.modu-music.com 기준). 숫자·명칭은 여기서만 바꿉니다.
export const BRAND = {
  app: '모두플레이',
  academy: '모두의음악 버클리음대동문 실용음악학원',
  academyShort: '모두의음악',
  site: 'https://www.modu-music.com/',
  online: 'https://modu-music.liveklass.com/',
  onlineName: '모두온라인',
  campuses: [
    { name: '홍대뮤지션센터', tel: '02-6954-1988', addr: '서울 마포구 · 홍대입구역 6·8번 출구 도보 5분' },
    { name: '광명뮤지션센터', tel: '02-2685-7888', addr: '경기 광명시 · 광명사거리역 1번 출구 도보 1분' },
  ],
  email: 'gotogma1234@gmail.com',
  // 편곡·수정은 공식 뮤즈스코어(무료)로. 모두플레이 변환기와 같은 4.x 버전
  musescoreDownload: 'https://musescore.org/ko/download',
  // 전공 (학생 기본 구분)
  majors: ['보컬', '피아노', '기타', '드럼', '베이스', '미디작곡', '연주작곡'] as const,
  // 예전 악보 종류 (여러 개 올리기·관리 화면에서 씀)
  categories: ['과제곡', '연습곡', '교재', '기타'] as const,
  // 자료 종류 (교재는 코치만 올릴 수 있음)
  kinds: ['카피', '릭', '리듬', '초견', '보이싱·이론', '편곡', '연습곡', '교재', '기타'] as const,
  // 자료 단계
  levels: ['입문', '중급', '고급'] as const,
}
