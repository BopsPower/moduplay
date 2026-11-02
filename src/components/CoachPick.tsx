// 코치 여러 명 고르기 (눌러서 켜고 끄기). 담당(첫 번째) 코치는 빼고 보여 줌
type Coach = { id: string; name: string }

export default function CoachMultiPick({ coaches, value, onChange, exclude, small }: {
  coaches: Coach[]; value: string[]; onChange: (v: string[]) => void; exclude?: string | null; small?: boolean
}) {
  const list = coaches.filter(c => c.id !== exclude)
  if (!list.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {list.map(c => {
        const on = value.includes(c.id)
        return (
          <button key={c.id} type="button" className={'pill' + (on ? ' on' : '')} aria-pressed={on}
            style={{ cursor: 'pointer', border: 'none', fontSize: small ? 12 : 13 }}
            onClick={() => onChange(on ? value.filter(x => x !== c.id) : [...value, c.id])}>
            {on ? '✓ ' : ''}{c.name}
          </button>
        )
      })}
    </div>
  )
}
