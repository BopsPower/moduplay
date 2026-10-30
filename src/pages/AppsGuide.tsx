import { useState } from 'react'
import Shell from '../components/Shell'
import { ALL_MAJORS, APP_GROUPS, type Major } from '../lib/apps'

// 전공생 추천 앱·사이트 (썸네일은 로고 대신 글자 타일, 전공별로 거르기)
export default function AppsGuide() {
  const [major, setMajor] = useState<Major | ''>('')
  const groups = APP_GROUPS.map(g => ({ ...g, items: g.items.filter(a => !major || a.for.includes(major)) })).filter(g => g.items.length)
  return (
    <Shell>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>뮤지션 추천</p>
        <h1 className="title">추천 앱·사이트</h1>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.6 }}>
          해외 음대·교육자 자료와 국내외 전공생 후기를 바탕으로 골랐어요. 카드마다 <b>추천 근거</b>를 적어 두었어요.
        </p>
      </div>
      <div className="chips" role="tablist" aria-label="전공으로 거르기">
        <button type="button" className={'chip' + (!major ? ' on' : '')} onClick={() => setMajor('')}>전체</button>
        {ALL_MAJORS.map(m => <button key={m} type="button" className={'chip' + (major === m ? ' on' : '')} onClick={() => setMajor(m)}>{m}</button>)}
      </div>
      {groups.map(g => (
        <section key={g.title} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div><h2 style={{ margin: 0, fontSize: 18 }}>{g.title}</h2><p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>{g.desc}</p></div>
          <div className="app-grid">
            {g.items.map(a => (
              <a key={a.name} href={a.url} target="_blank" rel="noreferrer" className="card app-card">
                <div className="app-top">
                  <span className="app-mark" style={{ background: a.color }} aria-hidden>{a.mark}</span>
                  <div style={{ minWidth: 0 }}>
                    <b className="app-name">{a.name}</b>
                    <span className="muted" style={{ fontSize: 12 }}>{a.ko} · {a.tag}</span>
                  </div>
                </div>
                <p className="app-what">{a.what}</p>
                <p className="app-why">{a.why}</p>
                <p className="app-ev">추천 근거 · {a.ev}</p>
                <div className="app-meta"><span>{a.price}</span><span>{a.on}</span></div>
                <span className="app-go">열어 보기 ↗</span>
              </a>
            ))}
          </div>
        </section>
      ))}
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
        2026년 10월 기준이에요. 가격·기능은 바뀔 수 있으니 설치 전에 스토어에서 확인해 주세요. 모두의음악과 제휴한 앱은 없어요.
        앱은 연습을 돕는 도구일 뿐, 많이 듣고 함께 연주하는 것을 대신하지는 못해요.
      </p>
    </Shell>
  )
}
