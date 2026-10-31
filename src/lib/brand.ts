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
  // 학원 공식 채널 (주소가 빈 곳은 화면에 안 보임 — 원장님께 받은 주소만 넣기)
  sns: [
    { name: '유튜브', icon: '▶', url: 'https://www.youtube.com/@Modu_Music_youtube', color: '#ff0033' },
    { name: '인스타그램', icon: '📸', url: 'https://www.instagram.com/modu_music_academy/', color: '#d62976' },
    { name: '페이스북', icon: 'f', url: 'https://www.facebook.com/Modumusic', color: '#1877f2' },
    { name: '학원 소식', icon: 'N', url: 'https://www.modu-music.com/news-01', color: '#f3791f' },
    { name: '블로그', icon: 'B', url: '', color: '#03c75a' },
    { name: '틱톡', icon: '♪', url: '', color: '#111111' },
    { name: '카카오톡 채널', icon: '💬', url: 'http://pf.kakao.com/_rxlTIj/chat', color: '#3a1d1d' },
  ],
  // 편곡·수정은 공식 뮤즈스코어(무료)로. 모두플레이 변환기와 같은 4.x 버전
  musescoreDownload: 'https://musescore.org/ko/download',
  // 전공 (학생 기본 구분)
  majors: ['보컬', '피아노', '기타', '드럼', '베이스', '미디작곡', '연주작곡'] as const,
  // 예전 악보 종류 (여러 개 올리기·관리 화면에서 씀)
  categories: ['과제곡', '연습곡', '교재', '기타'] as const,
  // 자료 형태 (하나만 고름 · 교재는 코치만)
  kinds: ['곡 악보', '카피 악보', '연습 악보', '반주·MR', '가이드 녹음', '시범 영상', '정리표', '교재', '기타'] as const,
  kindHelp: {
    '카피 악보': '녹음된 연주를 음 하나까지 그대로 받아 적은 악보 (솔로·드럼 그루브·베이스 라인 카피)',
    '곡 악보': '곡 전체를 연주할 때 보는 악보 (멜로디+코드 리드시트, 밴드·합주 편곡, 입시곡)',
    '연습 악보': '곡이 아니라 손과 귀를 기르는 연습 (스케일·릭·리듬·초견, 하농·체르니 같은 연습곡)',
    '반주·MR': '같이 맞춰 연주할 반주 음원',
    '가이드 녹음': '멜로디·가사를 불러 둔 가이드, 코치 시범 녹음',
    '시범 영상': '유튜브 등 보고 따라 할 영상',
    '정리표': '스케일·코드표, 이론 요약 한 장',
    '교재': '학원 PDF 교재 (보기 전용 · 다운로드·프린트는 학원에서)',
    '기타': '위에 맞는 게 없을 때',
  } as Record<string, string>,
  // 화면에 보이는 이름 (저장 값은 그대로 두고 이름만 알기 쉽게 — 2026-11-01)
  kindLabel: {
    '곡 악보': '🎵 곡 (리드시트·편곡)',
    '카피 악보': '🎧 연주 카피',
    '연습 악보': '💪 테크닉 연습',
    '시범 영상': '▶ 시범 영상',
    '교재': '📕 PDF 교재',
  } as Record<string, string>,
  // 목록 배지용 짧은 이름
  kindShort: { '곡 악보': '곡', '카피 악보': '연주 카피', '연습 악보': '테크닉 연습', '시범 영상': '▶ 시범 영상', '교재': 'PDF 교재' } as Record<string, string>,
  // 연습 영역 (여러 개 고를 수 있음 · 코어뮤직 4과목 + 전공 실기를 쉬운 말로)
  areas: ['리듬', '악보 읽기', '귀 훈련', '코드·화성', '테크닉', '즉흥·릭', '곡 표현'] as const,
  areaHelp: {
    '리듬': '박자·그루브·리듬 패턴',
    '악보 읽기': '초견, 기보',
    '귀 훈련': '듣고 부르기·받아 적기 (시창청음)',
    '코드·화성': '코드, 보이싱, 화성 진행',
    '테크닉': '손·호흡·발성 등 연주 기술',
    '즉흥·릭': '애드리브, 릭, 프레이즈',
    '곡 표현': '곡 완성, 음악적 표현',
  } as Record<string, string>,
  // 자료 단계
  levels: ['입문', '중급', '고급'] as const,
}
