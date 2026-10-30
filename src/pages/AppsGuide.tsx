import Shell from '../components/Shell'
import { APP_GROUPS } from '../lib/apps'

// 전공생 추천 앱·사이트 (썸네일은 로고 대신 글자 타일)
export default function AppsGuide() {
  return (
    <Shell>
      <div>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>뮤지션 추천</p>
        <h1 className="title">추천 앱·사이트</h1>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.6 }}>전 세계 음악 전공생들이 많이 쓰는 앱과 사이트예요. <b style={{ color: 'var(--accent-deep)' }}>★</b>는 모두의음악 추천.</p>
      </div>
      {APP_GROUPS.map(g => (
        <section key={g.title} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div><h2 style={{ margin: 0, fontSize: 18 }}>{g.title}</h2><p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>{g.desc}</p></div>
          <div className="app-grid">
            {g.items.map(a => (
              <a key={a.name} href={a.url} target="_blank" rel="noreferrer" className="card app-card">
                <div className="app-top">
                  <span className="app-mark" style={{ background: a.color }} aria-hidden>{a.mark}</span>
                  <div style={{ minWidth: 0 }}>
                    <b className="app-name">{a.pick && <span style={{ color: 'var(--accent-deep)' }}>★ </span>}{a.name}</b>
                    <span className="muted" style={{ fontSize: 12 }}>{a.ko} · {a.tag}</span>
                  </div>
                </div>
                <p className="app-what">{a.what}</p>
                <p className="app-why">{a.why}</p>
                <div className="app-meta"><span>{a.price}</span><span>{a.on}</span></div>
                <span className="app-go">열어 보기 ↗</span>
              </a>
            ))}
          </div>
        </section>
      ))}
      <p className="muted" style={{ fontSize: 12 }}>2026년 10월 기준으로 확인했어요. 가격·기능은 바뀔 수 있으니 설치 전에 스토어에서 확인해 주세요.</p>
    </Shell>
  )
}
