import { CHOICES, DRUMS, labelOf, type SamplePlayer, type Track } from '../lib/sampler'

// 악보 화면 › 소리 고르기: 실제 악기 / 기본 소리, 파트마다 악기·끄기·혼자 듣기
export default function SoundPanel({ mode, setMode, hasMp3, hasMidi, player, tracks, busy, err, onChange }: {
  mode: 'real' | 'mp3'; setMode: (m: 'real' | 'mp3') => void; hasMp3: boolean; hasMidi: boolean
  player: SamplePlayer | null; tracks: Track[]; busy: boolean; err?: string; onChange: () => void
}) {
  if (!hasMidi) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}>
        <span>소리</span>
        <span className="muted" style={{ fontWeight: 400 }}>{busy ? '악기 소리 받는 중…' : mode === 'real' ? '실제 악기 녹음' : '기본 소리'}</span>
      </span>
      <div className="seg">
        <button className={mode === 'real' ? 'on' : ''} onClick={() => setMode('real')}>🎹 실제 악기</button>
        {hasMp3 && <button className={mode === 'mp3' ? 'on' : ''} onClick={() => setMode('mp3')}>기본 소리</button>}
      </div>
      {mode === 'real' && player && tracks.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tracks.map((t, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ flex: '1 1 100%', fontSize: 12, fontWeight: 700, opacity: t.mute ? .45 : 1 }} title={t.name}>
                {t.name}
              </span>
              {t.drum ? (
                <span className="muted" style={{ flex: '1 1 140px', fontSize: 13, padding: '6px 0' }}>{labelOf(DRUMS)}</span>
              ) : (
                <select value={t.inst} aria-label={`${t.name} 악기`} disabled={busy}
                  onChange={async e => { await player.setInstrument(i, e.target.value); onChange() }}
                  style={{ flex: '1 1 140px', minWidth: 0, padding: '6px 8px', border: '1px solid #d1d5db', font: 'inherit', fontSize: 13 }}>
                  {!CHOICES.some(c => c.items.some(([k]) => k === t.inst)) && <option value={t.inst}>{labelOf(t.inst)}</option>}
                  {CHOICES.map(c => <optgroup key={c.group} label={c.group}>{c.items.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</optgroup>)}
                </select>
              )}
              <button type="button" className={'btn sm' + (t.mute ? ' primary' : ' ghost')} aria-pressed={t.mute} title="이 파트 끄기 (내가 연주할 파트)"
                onClick={() => { player.setTrack(i, { mute: !t.mute }); onChange() }}>{t.mute ? '🔇 꺼짐' : '🔈 끄기'}</button>
              <button type="button" className={'btn sm' + (t.solo ? ' primary' : ' ghost')} aria-pressed={t.solo} title="이 파트만 듣기"
                onClick={() => { player.setTrack(i, { solo: !t.solo }); onChange() }}>🎧 혼자</button>
            </li>
          ))}
        </ul>
      )}
      {mode === 'real' && <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        {err ? `⚠️ ${err}` : '파트마다 악기를 바꿀 수 있어요. 내가 연주할 파트는 꺼 두고 반주에 맞춰 연습해 보세요. 처음 한 번은 악기 소리를 받느라 몇 초 걸려요.'}
      </p>}
    </div>
  )
}
