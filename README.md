# 모두플레이 (ModuPlay)

모두의음악 버클리음대동문 실용음악학원 연주 자료실 · play.modu-music.com

학생이 브라우저에서 학원 악보를 보고, 듣고, 느리게 연습하는 사이트입니다.
악보 파일(.mscz)은 MuseScore 엔진의 브라우저 버전(webmscore)으로 학생 기기 안에서 그려지고 재생됩니다.

## 구성
- 프런트엔드: Vite + React + TypeScript
- 데이터·로그인·파일 저장: Supabase (프로젝트 `moduplay`)
- 악보 렌더·재생: webmscore

## 로컬 실행
```
npm install
npm run dev
```
`.env.example`을 `.env`로 복사하면 됩니다.

## 학생 연결 방식
- 강사가 학생을 등록할 때 이메일을 넣으면, 학생이 그 이메일로 로그인하는 순간 자동 연결됩니다.
- 이메일을 모르면 "초대 링크 복사"로 카톡에 보내면, 링크로 들어와 로그인할 때 연결됩니다.
- 강사 화면: `/teacher` (teachers 테이블에 등록된 계정만)
