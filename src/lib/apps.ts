// 추천 앱·사이트 (2026년 10월 확인 · 가격·기능은 바뀔 수 있음)
export type AppPick = {
  name: string; ko: string; what: string; why: string; price: string; on: string; url: string
  tag: string; color: string; mark: string; pick?: boolean // pick: 원장님 추천
}

export const APP_GROUPS: { title: string; desc: string; items: AppPick[] }[] = [
  {
    title: '반주·즉흥 연습', desc: '혼자서도 밴드와 함께 연주하는 것처럼',
    items: [
      { name: 'iReal Pro', ko: '아이리얼 프로', mark: 'iR', color: '#e8553d', pick: true, tag: '재즈·즉흥 필수',
        what: '코드 차트를 넣으면 피아노·베이스·드럼 반주를 만들어 줘요. 스윙·보사노바·블루스 등 50가지 스타일.',
        why: '스탠더드 곡을 원하는 키·빠르기로 무한 반복하며 즉흥 연습. 전 세계 재즈 전공생이 거의 다 써요.',
        price: '유료 (iPhone·iPad 약 33,000원, 기기별 따로 구매)', on: 'iPhone·iPad · Android · Mac · Windows', url: 'https://www.irealpro.com/' },
    ],
  },
  {
    title: '메트로놈·튜너', desc: '매일 켜 두는 기본 도구',
    items: [
      { name: 'Soundcorset', ko: '사운드코르셋', mark: 'SC', color: '#2f80ed', pick: true, tag: '튜너+메트로놈 한 번에',
        what: '튜너와 메트로놈이 한 앱에. 연습 녹음, 연습 시간 기록, 템포를 조금씩 올려 주는 스피드 트레이너.',
        why: '한국 개발 앱이라 한국어가 자연스럽고, 기본 기능은 무료로 충분해요.',
        price: '무료 (광고 · 광고 제거는 유료)', on: 'iPhone · Android', url: 'https://www.soundcorset.com/' },
      { name: 'The Metronome by Soundbrenner', ko: '사운드브레너 메트로놈', mark: 'SB', color: '#111827', tag: '메트로놈',
        what: '박자·세분박·강세를 자유롭게. 연습 기록, 세트리스트, 튜너도 들어 있어요.',
        why: '화면이 깔끔하고 홀수 박자·복잡한 리듬도 쉽게 만들어요.',
        price: '무료 (일부 기능 유료)', on: 'iPhone · Android', url: 'https://www.soundbrenner.com/' },
      { name: 'TonalEnergy', ko: '토널에너지', mark: 'TE', color: '#0f9d58', tag: '음정 연습',
        what: '튜너 + 메트로놈 + 드론(기준음 지속) + 녹음.',
        why: '관악기·현악기·보컬이 음정을 눈으로 보며 맞추기 좋아요. 드론에 맞춰 스케일 연습.',
        price: '유료', on: 'iPhone · Android · Windows · Mac', url: 'https://www.tonalenergy.com/' },
    ],
  },
  {
    title: '카피·귀로 따기', desc: '좋아하는 곡을 느리게, 악기별로',
    items: [
      { name: 'Moises', ko: '모이세스', mark: 'Mo', color: '#7c3aed', pick: true, tag: 'AI 악기 분리',
        what: '노래에서 보컬·드럼·베이스·피아노 등을 AI로 분리. 빠르기·키 조절, 코드 표시, 구간 반복.',
        why: '내 악기만 빼고 반주로 쓰거나, 베이스 라인만 크게 들으며 카피할 수 있어요.',
        price: '무료 (한 달 곡 수 제한) · 유료 구독', on: 'iPhone · Android · 웹', url: 'https://moises.ai/' },
      { name: 'Transcribe!', ko: '트랜스크라이브', mark: 'Tr', color: '#b45309', tag: 'PC 카피 전용',
        what: '음정 그대로 느리게 재생, 구간 표시·반복, 코드·음 추정, 영상도 재생.',
        why: '솔로·보이싱을 한 음씩 따는 데 오래 써 온 프로그램이에요.',
        price: '30일 무료 체험 후 유료', on: 'Windows · Mac · Linux', url: 'https://www.seventhstring.com/' },
    ],
  },
  {
    title: '악보', desc: '보고, 고치고, 찾기',
    items: [
      { name: 'MuseScore Studio', ko: '뮤즈스코어', mark: 'MS', color: '#1a73e8', pick: true, tag: '무료 악보 프로그램',
        what: '악보를 직접 쓰고 고치고, 소리로 들어 보는 프로그램. 모두플레이 자료실 악보도 이걸로 열어요.',
        why: '편곡·이조·파트 악보 만들기까지 무료로 가능해요.',
        price: '무료', on: 'Windows · Mac · Linux', url: 'https://musescore.org/ko/download' },
      { name: 'IMSLP', ko: '페트루치 악보 도서관', mark: 'IM', color: '#7f1d1d', tag: '클래식 악보',
        what: '저작권이 끝난 클래식 악보를 모아 둔 세계 최대 악보 도서관 (약 89만 개).',
        why: '하농·체르니·바흐 등 교본과 곡의 원본 악보를 찾을 때.',
        price: '무료 열람 (후원 회원 있음)', on: '웹', url: 'https://imslp.org/' },
    ],
  },
  {
    title: '이론·청음', desc: '코어뮤직 수업과 함께 하면 좋아요',
    items: [
      { name: 'Musicca', ko: '뮤지카', mark: 'Mu', color: '#e11d48', pick: true, tag: '한국어 지원',
        what: '음표·리듬·음정·화음·스케일 연습 문제, 가상 피아노·기타, 메트로놈·튜너, 화음·스케일 찾기.',
        why: '한국어로 되어 있고 무료라 기보법·화성학 복습에 바로 쓰기 좋아요.',
        price: '무료 (가입하면 광고 없음)', on: '웹 (휴대폰 브라우저 OK)', url: 'https://www.musicca.com/ko' },
      { name: 'musictheory.net', ko: '뮤직띠어리 닷넷', mark: 'mt', color: '#374151', tag: '이론 기초',
        what: '이론 레슨, 음 읽기·음정·화음 연습, 청음 훈련.',
        why: '오래전부터 전 세계 음악 수업에서 쓰는 기본 사이트예요. (영어)',
        price: '웹 무료 · 앱(Tenuto)은 유료', on: '웹 · iPhone·iPad 앱', url: 'https://www.musictheory.net/' },
      { name: 'Functional Ear Trainer', ko: '펑셔널 이어 트레이너', mark: 'FE', color: '#0e7490', tag: '시창청음',
        what: '조성 안에서 각 음이 "도·레·미 중 무엇인지" 듣고 맞히는 훈련.',
        why: '상대음감 기르기에 많이 추천돼요. 입시 청음 대비 기초.',
        price: '무료 (추가 과정 유료)', on: 'iPhone · Android', url: 'https://getfet.app/' },
      { name: 'EarMaster', ko: '이어마스터', mark: 'EM', color: '#ca8a04', tag: '체계적 청음',
        what: '음정·화음·리듬 받아쓰기, 시창(마이크로 내 노래 채점).',
        why: '단계별 과정이 잘 짜여 있어 꾸준히 하기 좋아요.',
        price: '일부 무료 · 유료', on: 'iPhone·iPad · Windows · Mac', url: 'https://www.earmaster.com/' },
    ],
  },
  {
    title: '듣기·작곡', desc: '많이 듣고, 직접 만들어 보기',
    items: [
      { name: 'AccuRadio', ko: '아큐라디오', mark: 'AR', color: '#f97316', pick: true, tag: '장르별 라디오',
        what: '사람이 직접 고른 장르별 인터넷 라디오. 재즈 채널이 특히 많아요.',
        why: '재즈·퓨전·블루스를 틀어 두고 많이 듣기. 몰랐던 연주자를 만나기 좋아요.',
        price: '무료 (광고)', on: '웹 · iPhone · Android', url: 'https://www.accuradio.com/' },
      { name: 'BandLab', ko: '밴드랩', mark: 'BL', color: '#dc2626', tag: '무료 작곡·녹음',
        what: '휴대폰에서 멀티트랙 녹음, 가상 악기, 간단한 마스터링.',
        why: '싱어송라이터·미디작곡 전공생이 아이디어를 바로 녹음해 두기 좋아요.',
        price: '무료 (멤버십 선택)', on: 'iPhone · Android · 웹', url: 'https://www.bandlab.com/' },
    ],
  },
]
