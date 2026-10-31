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
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>모두의음악이 추천해요</p>
        <h1 className="title">추천 앱·사이트</h1>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.6 }}>
          집에서 혼자 연습할 때 함께 쓰면 좋은 앱과 사이트를 골랐어요. 카드마다 <b>연습할 때 이렇게 써 보세요</b>를 적어 두었으니, 내 전공을 눌러 필요한 것부터 하나씩 써 보세요. 쓰다가 궁금한 점은 레슨 때 코치님께 물어보세요.
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
                <p className="app-why"><b>연습할 때 이렇게</b> · {a.why}</p>
                <div className="app-meta"><span>{a.price}</span><span>{a.on}</span></div>
                <span className="app-go">열어 보기 ↗</span>
              </a>
            ))}
          </div>
        </section>
      ))}
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
        2026년 10월 기준이에요. 가격은 바뀔 수 있으니 설치 전에 스토어에서 확인해 주세요.
      </p>
    </Shell>
  )
}
