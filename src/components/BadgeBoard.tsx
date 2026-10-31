import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { BADGES, checkBadges } from '../lib/badges'
import { usePractice } from '../lib/practice'

// 뮤지션 배지판: 받은 배지는 색, 아직인 배지는 회색 + 받는 방법
export default function BadgeBoard() {
  const { session } = useAuth()
  const p = usePractice()
  const [owned, setOwned] = useState<Set<string> | null>(null)
  useEffect(() => {
    if (!session) return
    checkBadges(session.user.id, p.days).then(list => setOwned(new Set(list)))
  }, [session, p.days.length])
  const n = owned ? BADGES.filter(b => owned.has(b.id)).length : 0
  return (
    <section className="card soft" style={{ padding: 18 }}>
      <div className="sec-h"><h2 style={{ fontSize: 17 }}>🎖️ 뮤지션 배지</h2><span className="muted" style={{ fontSize: 13 }}>{n} / {BADGES.length}</span></div>
      <div className="badges">
        {BADGES.map(b => {
          const on = !!owned?.has(b.id)
          return (
            <div key={b.id} className={'badge' + (on ? ' on' : '')} title={b.how}>
              <span className="ic">{b.icon}</span>
              <b>{b.name}</b>
              <small>{on ? '받았어요' : b.how}</small>
            </div>
          )
        })}
      </div>
    </section>
  )
}
