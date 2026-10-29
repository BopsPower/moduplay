# 모두플레이 (ModuPlay)

모두의음악 피아노학원 연주 자료실 · play.modu-music.com

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

## 테스트 계정
- 학원 코드: `MODU-7K3F` (지우), `MODU-2PQ9` (민준), `MODU-HX4M` (서연)
- 가입 후 처음 한 번 학원 코드를 입력하면 그 학생으로 연결됩니다.
