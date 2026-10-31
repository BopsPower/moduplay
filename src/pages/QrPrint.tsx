import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import qrcode from 'qrcode-generator'
import Shell from '../components/Shell'
import { supabase, type Score } from '../lib/supabase'
import { BRAND } from '../lib/brand'

// QR 스티커 뽑기: 연습노트에 붙여 두면 휴대폰으로 찍어 바로 자료를 열 수 있어요
function QrSvg({ text, size }: { text: string; size: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    const n = qr.getModuleCount(), m = 2
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`
    return { n: n + m * 2, d }
  }, [text])
  return (
    <svg viewBox={`0 0 ${svg.n} ${svg.n}`} style={{ width: size, height: size, display: 'block' }} shapeRendering="crispEdges" role="img" aria-label="자료 QR 코드">
      <rect width={svg.n} height={svg.n} fill="#fff" />
      <path d={svg.d} fill="#000" />
    </svg>
  )
}

const SIZES = [
  { key: 's', label: '작게 3cm', cm: 3, count: 24, note: 'A4 한 장에 24개 · 연습노트 귀퉁이용' },
  { key: 'm', label: '보통 5cm', cm: 5, count: 8, note: 'A4 한 장에 8개 · 노트 한 칸에 붙이기 좋아요' },
  { key: 'l', label: '크게 A4', cm: 15, count: 1, note: '한 장에 1개 · 연습실 벽이나 보면대용' },
] as const

export default function QrPrint() {
  const { id } = useParams()
  const [score, setScore] = useState<Score | null>(null)
  const [size, setSize] = useState<(typeof SIZES)[number]['key']>('m')
  useEffect(() => { supabase.from('scores').select('*').eq('id', id).single().then(({ data }) => setScore(data as Score | null)) }, [id])
  const url = `${window.location.origin}/score/${id}`
  const opt = SIZES.find(s => s.key === size)!

  return (
    <Shell>
      <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Link to={`/score/${id}`} className="muted" style={{ fontSize: 14 }}>← 자료로 돌아가기</Link>
        <div>
          <p className="muted" style={{ margin: '0 0 4px', fontSize: 14 }}>연습노트에 붙여 두면 휴대폰 카메라로 찍어서 바로 열 수 있어요</p>
          <h1 className="title">QR 스티커 뽑기</h1>
        </div>
        <div className="seg">
          {SIZES.map(s => <button key={s.key} type="button" className={size === s.key ? 'on' : ''} onClick={() => setSize(s.key)}>{s.label}</button>)}
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>{opt.note}. 스티커 용지나 일반 종이에 프린트해서 오려 붙이세요. QR은 로그인한 학원 학생·코치만 열 수 있어요.</p>
        <button type="button" className="btn primary" onClick={() => window.print()} disabled={!score}>프린트하기</button>
      </div>

      {score && (
        <div className={'qr-sheet ' + size}>
          {Array.from({ length: opt.count }, (_, i) => (
            <div key={i} className="qr-cell">
              <QrSvg text={url} size={`${opt.cm}cm`} />
              <span className="qr-t" style={{ width: `${opt.cm}cm` }}>{score.title}</span>
              {size !== 's' && <span className="qr-s">{BRAND.app}</span>}
            </div>
          ))}
        </div>
      )}
    </Shell>
  )
}
