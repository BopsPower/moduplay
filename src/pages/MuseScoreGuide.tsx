import { Link } from 'react-router-dom'
import Shell from '../components/Shell'
import { BRAND } from '../lib/brand'

// 편곡·수정 안내: 연습은 모두플레이, 악보를 고치는 일은 공식 뮤즈스코어(무료)에서
export default function MuseScoreGuide() {
  return (
    <Shell>
      <Link to="/board" className="muted" style={{ fontSize: 14 }}>← 악보 자료실</Link>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>편곡 · 조옮김 · 나만의 연습 버전</p>
        <h1 className="title">이 곡을 고쳐 보고 싶다면, 뮤즈스코어로</h1>
      </div>

      <section className="card guide">
        <p className="lead">모두플레이는 <b>연습하는 곳</b>이고, 악보를 <b>고치는 일</b>은 무료 프로그램 <b>뮤즈스코어(MuseScore Studio)</b>에서 합니다. 자료실 악보는 모두 뮤즈스코어로 만들어서, 받으면 그대로 열립니다.</p>
        <ol className="steps">
          <li>
            <b>뮤즈스코어 설치 (처음 한 번)</b>
            <span>컴퓨터(Windows·Mac)에서 공식 사이트에 들어가 설치합니다. 무료입니다.</span>
            <span className="muted">설치 화면에서 ‘Muse Hub’를 함께 권하는데, 없어도 됩니다. 다운로드 페이지에서 <b>‘without MuseHub’</b>라고 적힌 링크를 고르면 프로그램만 깔립니다.</span>
            <a className="btn primary sm" href={BRAND.musescoreDownload} target="_blank" rel="noreferrer">뮤즈스코어 공식 다운로드 ↗</a>
          </li>
          <li>
            <b>악보 받기</b>
            <span>악보 자료실에서 곡을 열고, 위쪽 <b>다운로드 ▾ → MuseScore 파일 (.mscz)</b>을 누릅니다.</span>
          </li>
          <li>
            <b>열어서 고치기</b>
            <span>받은 .mscz 파일을 두 번 누르면 뮤즈스코어에서 열립니다. 조옮김(키 바꾸기)은 <b>도구 메뉴 → 조옮김</b>에서, 빠르기는 악보 위 빠르기 표시를 눌러 바꿉니다.</span>
            <span className="muted">원본은 그대로 두고 <b>파일 → 다른 이름으로 저장</b>으로 내 이름을 붙여 저장하세요.</span>
          </li>
          <li>
            <b>코치님께 보여드리기</b>
            <span>고친 파일은 레슨 때 가져오거나 코치님께 보내 주세요. 코치님이 모두플레이에 올려 주면, 내 버전으로 연습할 수 있습니다.</span>
          </li>
        </ol>
      </section>

      <section className="card guide">
        <p className="k">자주 묻는 것</p>
        <dl className="faq">
          <dt>휴대폰에서도 고칠 수 있나요?</dt>
          <dd>뮤즈스코어 편집 프로그램은 컴퓨터용만 있습니다. 휴대폰에서는 모두플레이로 보고 듣고 연습하세요.</dd>
          <dt>파일이 안 열려요.</dt>
          <dd>뮤즈스코어를 최신 버전(4)으로 업데이트한 뒤 다시 열어 보세요. 그래도 안 되면 다운로드 메뉴의 <b>MusicXML</b> 파일로 열 수 있습니다.</dd>
          <dt>앱스토어의 ‘MuseScore’ 앱과 같은 건가요?</dt>
          <dd>아니요. 그 앱은 musescore.com 악보를 보는 앱이라 편집이 되지 않습니다. 컴퓨터용 MuseScore Studio를 설치하세요.</dd>
          <dt>받은 악보를 다른 곳에 올려도 되나요?</dt>
          <dd>자료실 악보는 {BRAND.academyShort} 수업용입니다. 다른 곳에 올리기 전에 코치님께 먼저 물어봐 주세요.</dd>
        </dl>
      </section>
    </Shell>
  )
}
