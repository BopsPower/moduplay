// 모두플레이 뮤지션 캐릭터 (시안 "모두플레이 뮤지션 캐릭터 시안"에서 옮김)
// head: 머리·어깨만 (화면 위 동그라미 아이콘용)
import type { AvatarLook } from '../lib/avatar'

const SKINS: Record<string, [string, string]> = { light: ['#fde3cf', '#f3cdb2'], base: ['#f6d0b0', '#ebbd98'], tan: ['#e3ab7c', '#d1966a'], brown: ['#b0744c', '#9a6140'], deep: ['#74462c', '#603822'] }
const NAMES: Record<string, string> = { mic: '보컬', guitar: '기타', bass: '베이스', drum: '드럼', keys: '건반', midi: '미디 작곡' }

export default function Avatar({ look, size = 240, head = false, title }: { look: AvatarLook; size?: number; head?: boolean; title?: string }) {
  const inst = look.inst
  const face = look.face
  const g = look.gender
  const hs = look.hairStyle
  const o = look.outfit
  const it = look.items ?? {}
  const capped = !!it.beanie
  const SK = SKINS[look.skin] ?? SKINS.base
  const showInst = !head
  const v = {
    skin: SK[0], skin2: SK[1],
    color: look.color, color2: look.color2, hair: look.hairColor, bg: look.bg, neon: '#c6f432',
    wood: it.gold ? '#e8c45a' : '#e0954a', bassBody: it.gold ? '#e8c45a' : '#ff4fa3', drumShell: it.gold ? '#e8c45a' : '#3d5afe', synth: it.gold ? '#b8892a' : '#1d1a17',
    stage: !!it.stage && !head, spot: !!it.spot && !head, plain: !it.stage && !head,
    oHoodie: o === 'hoodie', oJacket: o === 'jacket', oTee: o === 'tee', oBallad: o === 'ballad', oHiphop: o === 'hiphop', sleeve: (o === 'classic' || o === 'rock') ? '#1d1a17' : o === 'jazz' ? '#f7f4ef' : look.color, oClassic: o === 'classic', oJazz: o === 'jazz', oRock: o === 'rock', chain: o === 'jacket' || o === 'hiphop',
    earrings: g === 'f',
    iMic: showInst && inst === 'mic', iGuitar: showInst && inst === 'guitar', iBass: showInst && inst === 'bass', iDrum: showInst && inst === 'drum', iKeys: showInst && inst === 'keys', iMidi: showInst && inst === 'midi',
    faceSmile: face === 'smile', faceCalm: face === 'calm', faceWink: face === 'wink', faceFocus: face === 'focus',
    lashes: g === 'f' && !it.shades,
    hairBackLong: hs === 'long', afroBack: hs === 'afro' && !capped, dreadsBack: hs === 'dreads', metalBack: hs === 'metal',
    hairAfro: hs === 'afro' && !capped, hairMohawk: hs === 'mohawk' && !capped, hairDreads: hs === 'dreads' && !capped, hairPomp: hs === 'pomp' && !capped, hairMetal: hs === 'metal' && !capped,
    hairShort: hs === 'short' && !capped, hairSpiky: hs === 'spiky' && !capped, hairCurly: hs === 'curly' && !capped,
    hairLong: hs === 'long' && !capped, hairBob: hs === 'bob', hairBun: hs === 'bun' && !capped && !it.crown,
    shades: !!it.shades, phones: !!it.phones || inst === 'midi', beanie: capped, crown: !!it.crown && !capped,
  }
  const label = title ?? `${NAMES[inst] ?? ''} 뮤지션 캐릭터`
  return (
    <svg viewBox={head ? '30 22 140 140' : '0 0 200 240'} width={size} height={head ? size : Math.round(size * 1.2)} role="img" aria-label={label} style={{ display: 'block' }}>
      {head && <rect x="0" y="0" width="200" height="240" fill={it.stage ? '#141225' : look.bg} />}

{v.plain && <>
<rect x="14" y="30" width="172" height="200" rx="40" fill={v.bg} transform="rotate(-4 100 130)"></rect>
<path d="M30 52 l4 10 l10 4 l-10 4 l-4 10 l-4 -10 l-10 -4 l10 -4 Z" fill="#1d1a17"></path>
<path d="M168 70 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 Z" fill="#ffffff"></path>
<circle cx="164" cy="44" r="4" fill="#1d1a17"></circle>
</>}
{v.stage && <>
<rect x="14" y="30" width="172" height="200" rx="40" fill="#141225" transform="rotate(-4 100 130)"></rect>
<path d="M36 50 l5 12 l12 5 l-12 5 l-5 12 l-5 -12 l-12 -5 l12 -5 Z" fill="#c6f432"></path>
<path d="M160 60 l4 9 l9 4 l-9 4 l-4 9 l-4 -9 l-9 -4 l9 -4 Z" fill="#ff4fa3"></path>
<circle cx="150" cy="40" r="3" fill="#ffffff"></circle><circle cx="46" cy="96" r="2.5" fill="#ffffff"></circle>
</>}
{v.spot && <>
<path d="M80 0 L120 0 L172 238 L28 238 Z" fill="#fffbe0" opacity="0.5"></path>
</>}

<g transform="translate(100 102) scale(0.86) translate(-100 -90)">
{v.hairBackLong && <>
<path d="M50 88 C46 56 70 34 100 34 C130 34 154 56 150 88 L156 162 C144 170 128 164 126 150 L74 150 C72 164 56 170 44 162 Z" fill={v.hair}></path>
</>}
{v.afroBack && <><circle cx="100" cy="40" r="30" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5"></circle><circle cx="66" cy="50" r="26" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5"></circle><circle cx="134" cy="50" r="26" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5"></circle><circle cx="48" cy="80" r="22" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5"></circle><circle cx="152" cy="80" r="22" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5"></circle><circle cx="54" cy="110" r="18" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5"></circle><circle cx="146" cy="110" r="18" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5"></circle><circle cx="100" cy="62" r="42" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5"></circle><circle cx="100" cy="40" r="28.5" fill={v.hair}></circle><circle cx="66" cy="50" r="24.5" fill={v.hair}></circle><circle cx="134" cy="50" r="24.5" fill={v.hair}></circle><circle cx="48" cy="80" r="20.5" fill={v.hair}></circle><circle cx="152" cy="80" r="20.5" fill={v.hair}></circle><circle cx="54" cy="110" r="16.5" fill={v.hair}></circle><circle cx="146" cy="110" r="16.5" fill={v.hair}></circle><circle cx="100" cy="62" r="40.5" fill={v.hair}></circle></>}
{v.dreadsBack && <><rect x="42" y="70" width="11" height="96" rx="5.5" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5"></rect><rect x="55" y="70" width="11" height="104" rx="5.5" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5"></rect><rect x="134" y="70" width="11" height="104" rx="5.5" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5"></rect><rect x="147" y="70" width="11" height="96" rx="5.5" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5"></rect></>}
{v.metalBack && <>
<path d="M48 80 C46 50 70 36 100 36 C130 36 154 50 152 80 L158 178 L132 178 L128 124 L72 124 L68 178 L42 178 Z" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5" strokeLinejoin="round"></path>
</>}
</g>

<path d="M22 240 L26 194 C30 162 62 146 100 146 C138 146 170 162 174 194 L178 240 Z" fill={v.color} stroke="#1d1a17" strokeWidth="2.5"></path>
{v.oHoodie && <>
<path d="M66 156 C72 142 128 142 134 156 C122 166 78 166 66 156 Z" fill={v.color2} stroke="#1d1a17" strokeWidth="2.5"></path>
<path d="M90 164 L88 192 M110 164 L112 192" stroke="#ffffff" strokeWidth="3" strokeLinecap="round"></path>
<circle cx="88" cy="194" r="3" fill="#ffffff"></circle><circle cx="112" cy="194" r="3" fill="#ffffff"></circle>
</>}
{v.oJacket && <>
<path d="M84 152 L100 196 L116 152 Z" fill={v.color2}></path>
<path d="M84 152 L96 178 L82 184 Z M116 152 L104 178 L118 184 Z" fill="#1d1a17" opacity="0.85"></path>
<path d="M100 196 L100 240" stroke="#1d1a17" strokeWidth="2"></path>
</>}
{v.oTee && <>
<path d="M84 152 C88 160 112 160 116 152" stroke="#1d1a17" strokeWidth="2.5" fill={v.color2}></path>
<rect x="74" y="190" width="52" height="14" rx="3" fill={v.color2}></rect>
<path d="M80 197 L120 197" stroke="#1d1a17" strokeWidth="2" strokeDasharray="4 3"></path>
</>}
{v.oBallad && <>
<path d="M44 178 L44 238 M62 166 L62 238 M138 166 L138 238 M156 178 L156 238" stroke="#1d1a17" strokeWidth="1.2" opacity="0.25"></path>
<path d="M88 156 L80 240 M112 156 L120 240" stroke="#1d1a17" strokeWidth="2.5"></path>
<path d="M88 156 L80 240 L120 240 L112 156 Z" fill={v.color2}></path>
<path d="M92 170 L108 170 M92 186 L108 186 M90 202 L110 202 M90 218 L110 218" stroke="#1d1a17" strokeWidth="1.2" opacity="0.3"></path>
<circle cx="84" cy="190" r="2.5" fill="#1d1a17"></circle><circle cx="83" cy="210" r="2.5" fill="#1d1a17"></circle>
</>}
{v.oHiphop && <>
<path d="M84 150 L100 176 L116 150" stroke={v.color2} strokeWidth="7" fill="none" strokeLinejoin="round"></path>
<path d="M30 196 L34 240 M170 196 L166 240" stroke={v.color2} strokeWidth="7"></path>
<text x="100" y="222" textAnchor="middle" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="34" fill={v.color2} stroke="#1d1a17" strokeWidth="1.5">08</text>
</>}
{v.oClassic && <>
<path d="M22 240 L26 194 C30 162 62 146 100 146 C138 146 170 162 174 194 L178 240 Z" fill="#1d1a17" stroke="#1d1a17" strokeWidth="2.5"></path>
<path d="M86 152 L100 204 L114 152 Z" fill="#ffffff"></path>
<path d="M86 152 L98 200 L74 184 L80 160 Z M114 152 L102 200 L126 184 L120 160 Z" fill="#3a3640"></path>
<circle cx="100" cy="180" r="2" fill="#1d1a17"></circle><circle cx="100" cy="192" r="2" fill="#1d1a17"></circle>
<path d="M130 176 L142 174 L140 182 Z" fill="#ffffff"></path>
</>}
{v.oJazz && <>
<path d="M22 240 L26 194 C30 162 62 146 100 146 C138 146 170 162 174 194 L178 240 Z" fill="#f7f4ef" stroke="#1d1a17" strokeWidth="2.5"></path>
<path d="M36 200 L50 198 M164 200 L150 198" stroke="#1d1a17" strokeWidth="1.5" opacity="0.4"></path>
<path d="M54 160 C66 152 84 149 90 150 L100 198 L110 150 C116 149 134 152 146 160 L150 240 L50 240 Z" fill={v.color} stroke="#1d1a17" strokeWidth="2.5" strokeLinejoin="round"></path>
<path d="M100 156 L96 162 L98 196 L100 202 L102 196 L104 162 Z" fill={v.color2} stroke="#1d1a17" strokeWidth="1.5"></path>
<circle cx="112" cy="206" r="2.5" fill="#1d1a17"></circle><circle cx="112" cy="220" r="2.5" fill="#1d1a17"></circle><circle cx="88" cy="206" r="2.5" fill="#1d1a17"></circle><circle cx="88" cy="220" r="2.5" fill="#1d1a17"></circle>
<path d="M120 176 L134 174" stroke="#e8c45a" strokeWidth="2"></path>
</>}
{v.oRock && <>
<path d="M22 240 L26 194 C30 162 62 146 100 146 C138 146 170 162 174 194 L178 240 Z" fill="#1d1a17" stroke="#1d1a17" strokeWidth="2.5"></path>
<path d="M86 152 L100 240 L118 240 L114 152 Z" fill={v.color2}></path>
<path d="M104 172 L96 192 L104 192 L98 212 L112 186 L104 186 L110 172 Z" fill="#1d1a17"></path>
<path d="M86 152 L70 176 L82 186 L100 240" stroke="#55505a" strokeWidth="3" fill="none" strokeLinejoin="round"></path>
<path d="M114 152 L130 172 L120 182 L118 240" stroke="#55505a" strokeWidth="3" fill="none" strokeLinejoin="round"></path>
<path d="M120 182 L120 240" stroke="#c7ccd2" strokeWidth="2" strokeDasharray="3 2"></path>
<circle cx="44" cy="172" r="2.5" fill="#c7ccd2"></circle><circle cx="54" cy="164" r="2.5" fill="#c7ccd2"></circle><circle cx="156" cy="172" r="2.5" fill="#c7ccd2"></circle><circle cx="146" cy="164" r="2.5" fill="#c7ccd2"></circle>
</>}
{v.chain && <>
<path d="M82 154 C86 172 114 172 118 154" stroke="#e8c45a" strokeWidth="2.5" fill="none"></path>
</>}
<rect x="90" y="132" width="20" height="24" rx="6" fill={v.skin2} stroke="#1d1a17" strokeWidth="2.5"></rect>
{v.oBallad && <>
<rect x="84" y="142" width="32" height="18" rx="8" fill={v.color} stroke="#1d1a17" strokeWidth="2.5"></rect>
<path d="M90 145 L90 157 M96 145 L96 157 M102 145 L102 157 M108 145 L108 157" stroke="#1d1a17" strokeWidth="1" opacity="0.3"></path>
</>}
{v.oClassic && <>
<path d="M100 160 L86 152 L86 168 Z M100 160 L114 152 L114 168 Z" fill={v.color} stroke="#1d1a17" strokeWidth="2.5" strokeLinejoin="round"></path>
<circle cx="100" cy="160" r="4" fill={v.color} stroke="#1d1a17" strokeWidth="2.5"></circle>
</>}

<g transform="translate(100 102) scale(0.86) translate(-100 -90)">
<circle cx="100" cy="90" r="48" fill={v.skin} stroke="#1d1a17" strokeWidth="2.5"></circle>
<ellipse cx="53" cy="94" rx="7" ry="10" fill={v.skin2} stroke="#1d1a17" strokeWidth="2.5"></ellipse>
<ellipse cx="147" cy="94" rx="7" ry="10" fill={v.skin2} stroke="#1d1a17" strokeWidth="2.5"></ellipse>
{v.earrings && <>
<circle cx="50" cy="110" r="5" fill="none" stroke="#e8c45a" strokeWidth="2.5"></circle>
<circle cx="150" cy="110" r="5" fill="none" stroke="#e8c45a" strokeWidth="2.5"></circle>
</>}
<ellipse cx="74" cy="110" rx="8" ry="5" fill="#ff8fa3" opacity="0.45"></ellipse>
<ellipse cx="126" cy="110" rx="8" ry="5" fill="#ff8fa3" opacity="0.45"></ellipse>

{v.hairShort && <>
<path d="M52 90 C46 54 72 34 102 34 C134 34 158 56 148 92 C144 74 132 62 116 62 C110 70 90 74 70 70 C62 76 56 82 52 90 Z" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5" strokeLinejoin="round"></path>
</>}
{v.hairSpiky && <>
<path d="M52 88 L48 60 L64 64 L64 38 L82 52 L92 26 L106 48 L122 28 L126 52 L144 42 L140 64 L156 62 L148 90 C138 74 120 66 100 66 C80 66 62 74 52 88 Z" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5" strokeLinejoin="round"></path>
</>}
{v.hairLong && <>
<path d="M52 94 C46 56 72 36 100 36 C130 36 156 56 148 94 C140 72 124 60 104 60 C96 74 76 82 58 86 Z" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5" strokeLinejoin="round"></path>
</>}
{v.hairBob && <>
<path d="M46 122 C38 76 58 36 100 36 C142 36 162 76 154 122 L140 122 C142 96 136 76 124 66 L76 66 C64 76 58 96 60 122 Z" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5" strokeLinejoin="round"></path>
<path d="M72 64 C82 74 116 76 128 64" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5"></path>
</>}
{v.hairBun && <>
<circle cx="80" cy="34" r="14" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5"></circle>
<circle cx="120" cy="34" r="14" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5"></circle>
<path d="M52 90 C48 58 72 42 100 42 C130 42 154 58 148 90 C134 72 118 64 100 66 C82 64 66 72 52 90 Z" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5" strokeLinejoin="round"></path>
</>}
{v.hairCurly && <>
<path d="M50 86 C40 76 48 62 58 64 C56 48 72 42 80 48 C84 34 104 32 110 44 C120 34 138 42 136 54 C150 54 156 70 148 84 C140 76 126 70 112 72 C100 66 84 66 74 72 C64 72 56 78 50 86 Z" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5" strokeLinejoin="round"></path>
</>}

{v.hairAfro && <>
<path d="M54 84 C52 56 76 46 100 46 C124 46 148 56 146 84 C136 70 118 64 100 66 C82 64 64 70 54 84 Z" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5" strokeLinejoin="round"></path>
</>}
{v.hairMohawk && <>
<path d="M58 74 C66 60 80 54 90 52 M142 74 C134 60 120 54 110 52" stroke={v.hair} strokeWidth="5" strokeDasharray="2 3" fill="none" opacity="0.7"></path>
<path d="M86 68 L80 14 L94 28 L100 2 L106 28 L120 14 L114 68 C106 62 94 62 86 68 Z" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5" strokeLinejoin="round"></path>
</>}
{v.hairDreads && <>
<path d="M52 88 C46 54 72 36 100 36 C130 36 156 54 148 88 C142 74 132 66 120 64 L118 78 L108 64 L100 80 L92 64 L82 78 L80 64 C68 66 58 76 52 88 Z" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5" strokeLinejoin="round"></path>
<path d="M70 44 L74 58 M88 38 L90 54 M110 38 L108 54 M128 44 L124 58" stroke="#ffffff" strokeWidth="1.5" opacity="0.35"></path>
</>}
{v.hairPomp && <>
<path d="M54 88 C48 62 58 40 80 32 C92 14 138 12 152 34 C160 50 154 72 148 90 C142 72 130 64 112 64 C96 64 72 70 54 88 Z" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5" strokeLinejoin="round"></path>
<path d="M88 36 C104 22 132 22 144 38" stroke="#ffffff" strokeWidth="2" fill="none" opacity="0.4"></path>
</>}
{v.hairMetal && <>
<path d="M52 98 C48 56 72 38 100 38 C128 38 152 56 148 98 C142 72 120 56 100 50 C80 56 58 72 52 98 Z" fill={v.hair} stroke="#1d1a17" strokeWidth="2.5" strokeLinejoin="round"></path>
</>}

<path d="M74 86 Q84 80 94 86" stroke="#1d1a17" strokeWidth="3.5" fill="none" strokeLinecap="round"></path>
<path d="M106 86 Q116 80 126 86" stroke="#1d1a17" strokeWidth="3.5" fill="none" strokeLinecap="round"></path>
{v.faceSmile && <>
<ellipse cx="84" cy="99" rx="5.5" ry="7" fill="#1d1a17"></ellipse><circle cx="86" cy="96" r="2" fill="#ffffff"></circle>
<ellipse cx="116" cy="99" rx="5.5" ry="7" fill="#1d1a17"></ellipse><circle cx="118" cy="96" r="2" fill="#ffffff"></circle>
<path d="M90 116 Q100 124 110 116" stroke="#1d1a17" strokeWidth="3.5" fill="none" strokeLinecap="round"></path>
</>}
{v.faceCalm && <>
<ellipse cx="84" cy="100" rx="5.5" ry="5" fill="#1d1a17"></ellipse>
<ellipse cx="116" cy="100" rx="5.5" ry="5" fill="#1d1a17"></ellipse>
<path d="M76 96 L92 96 M108 96 L124 96" stroke="#1d1a17" strokeWidth="3.5" strokeLinecap="round"></path>
<path d="M94 118 Q102 120 110 115" stroke="#1d1a17" strokeWidth="3.5" fill="none" strokeLinecap="round"></path>
</>}
{v.faceWink && <>
<ellipse cx="84" cy="99" rx="5.5" ry="7" fill="#1d1a17"></ellipse><circle cx="86" cy="96" r="2" fill="#ffffff"></circle>
<path d="M110 100 Q116 94 122 100" stroke="#1d1a17" strokeWidth="3.5" fill="none" strokeLinecap="round"></path>
<path d="M90 114 Q100 126 110 114 Z" fill="#1d1a17"></path>
<path d="M96 119 Q100 124 104 119" fill="#ff6b81"></path>
</>}
{v.faceFocus && <>
<path d="M74 84 L94 90 M126 84 L106 90" stroke="#1d1a17" strokeWidth="3.5" strokeLinecap="round"></path>
<ellipse cx="84" cy="100" rx="5" ry="6" fill="#1d1a17"></ellipse>
<ellipse cx="116" cy="100" rx="5" ry="6" fill="#1d1a17"></ellipse>
<path d="M92 118 L108 116" stroke="#1d1a17" strokeWidth="3.5" strokeLinecap="round"></path>
</>}
{v.lashes && <>
<path d="M78 94 L74 90 M122 94 L126 90" stroke="#1d1a17" strokeWidth="2.5" strokeLinecap="round"></path>
</>}

{v.shades && <>
<path d="M66 92 L96 92 L94 106 C92 110 72 110 70 106 Z" fill="#1d1a17"></path>
<path d="M104 92 L134 92 L130 106 C128 110 108 110 106 106 Z" fill="#1d1a17"></path>
<path d="M96 95 L104 95" stroke="#1d1a17" strokeWidth="3"></path>
<path d="M72 96 L80 96" stroke="#c6f432" strokeWidth="2.5" strokeLinecap="round"></path>
</>}
{v.phones && <>
<path d="M52 92 C52 44 148 44 148 92" stroke="#1d1a17" strokeWidth="9" fill="none" strokeLinecap="round"></path>
<rect x="40" y="80" width="20" height="32" rx="10" fill={v.neon} stroke="#1d1a17" strokeWidth="2.5"></rect>
<rect x="140" y="80" width="20" height="32" rx="10" fill={v.neon} stroke="#1d1a17" strokeWidth="2.5"></rect>
</>}
{v.beanie && <>
<path d="M52 74 C46 30 154 30 148 74 Z" fill={v.neon} stroke="#1d1a17" strokeWidth="2.5"></path>
<rect x="48" y="66" width="104" height="16" rx="6" fill="#1d1a17"></rect>
<rect x="88" y="69" width="24" height="10" rx="2" fill="#ffffff"></rect>
</>}
{v.crown && <>
<path d="M68 46 L76 18 L92 38 L100 12 L108 38 L124 18 L132 46 Z" fill="#ffd23f" stroke="#1d1a17" strokeWidth="2.5" strokeLinejoin="round"></path>
<circle cx="100" cy="34" r="4" fill="#ff4fa3"></circle>
</>}
</g>

{v.iMic && <>
<rect x="36" y="118" width="5" height="122" rx="2" fill="#4a4440"></rect>
<rect x="36" y="116" width="34" height="5" rx="2" fill="#4a4440" transform="rotate(-24 38 118)"></rect>
<rect x="62" y="94" width="16" height="26" rx="8" fill="#1d1a17" transform="rotate(-24 70 107)"></rect>
<ellipse cx="74" cy="98" rx="11" ry="13" fill="#c7ccd2" stroke="#1d1a17" strokeWidth="2" transform="rotate(-24 74 98)"></ellipse>
<path d="M66 94 L82 102 M66 99 L80 106 M68 90 L82 97" stroke="#6b7177" strokeWidth="1.2"></path>
<path d="M41 236 C60 226 50 210 70 204" stroke="#1d1a17" strokeWidth="2" fill="none"></path>
<path d="M60 172 C56 150 58 134 66 122" stroke="#1d1a17" strokeWidth="23" fill="none" strokeLinecap="round"></path><path d="M60 172 C56 150 58 134 66 122" stroke={v.sleeve} strokeWidth="18" fill="none" strokeLinecap="round"></path>
</>}

{v.iGuitar && <>
<path d="M132 154 C120 176 100 196 70 216" stroke="#1d1a17" strokeWidth="6" fill="none" strokeLinecap="round"></path>
<g transform="translate(4 20) rotate(-24 100 200) scale(0.92)">
<rect x="98" y="195" width="80" height="10" rx="2" fill="#7a4a2a" stroke="#1d1a17" strokeWidth="1.5"></rect>
<path d="M112 195 L112 205 M126 195 L126 205 M140 195 L140 205 M154 195 L154 205 M166 195 L166 205" stroke="#d9c3a5" strokeWidth="1.2"></path>
<rect x="176" y="191" width="20" height="18" rx="4" fill="#1d1a17"></rect>
<circle cx="181" cy="189" r="2.5" fill="#d9d4cf"></circle><circle cx="189" cy="189" r="2.5" fill="#d9d4cf"></circle>
<circle cx="181" cy="211" r="2.5" fill="#d9d4cf"></circle><circle cx="189" cy="211" r="2.5" fill="#d9d4cf"></circle>
<path d="M38 200 C38 178 64 172 80 182 C92 174 122 176 120 200 C122 224 92 226 80 218 C64 228 38 222 38 200 Z" fill={v.wood} stroke="#1d1a17" strokeWidth="2.5"></path>
<circle cx="92" cy="200" r="9" fill="#1d1a17"></circle>
<rect x="58" y="193" width="6" height="14" rx="2" fill="#1d1a17"></rect>
<path d="M61 197 L196 197 M61 200 L196 200 M61 203 L196 203" stroke="#fff3dc" strokeWidth="0.7"></path>
</g>
</>}

{v.iBass && <>
<path d="M132 154 C120 176 100 196 70 216" stroke="#1d1a17" strokeWidth="6" fill="none" strokeLinecap="round"></path>
<g transform="translate(4 22) rotate(-28 100 204) scale(0.88) translate(6 10)">
<rect x="96" y="195" width="100" height="9" rx="2" fill="#4a3020" stroke="#1d1a17" strokeWidth="1.5"></rect>
<path d="M112 195 L112 204 M128 195 L128 204 M144 195 L144 204 M160 195 L160 204 M174 195 L174 204 M186 195 L186 204" stroke="#d9c3a5" strokeWidth="1.2"></path>
<path d="M194 190 L218 188 L218 212 L194 209 Z" fill="#1d1a17"></path>
<circle cx="200" cy="186" r="3" fill="#d9d4cf"></circle><circle cx="210" cy="185" r="3" fill="#d9d4cf"></circle>
<circle cx="200" cy="212" r="3" fill="#d9d4cf"></circle><circle cx="210" cy="213" r="3" fill="#d9d4cf"></circle>
<path d="M36 186 C40 170 62 170 70 180 C82 172 102 176 104 188 L104 212 C104 228 82 232 70 222 C56 232 32 228 34 212 C30 204 32 194 36 186 Z" fill={v.bassBody} stroke="#1d1a17" strokeWidth="2.5"></path>
<path d="M50 190 C56 182 68 184 72 190 L100 190 L100 210 L72 210 C66 218 52 218 48 208 C46 202 46 196 50 190 Z" fill="#fbf7f2"></path>
<rect x="62" y="194" width="14" height="10" rx="3" fill="#1d1a17"></rect>
<rect x="82" y="196" width="8" height="8" rx="2" fill="#1d1a17"></rect>
<circle cx="44" cy="214" r="3.5" fill="#d9d4cf"></circle><circle cx="54" cy="220" r="3.5" fill="#d9d4cf"></circle>
<path d="M40 197 L216 197 M40 199.5 L216 199.5 M40 202 L216 202 M40 204.5 L216 204.5" stroke="#efe6d8" strokeWidth="0.8"></path>
</g>
</>}

{v.iDrum && <>
<rect x="162" y="148" width="4" height="92" fill="#9aa0a6"></rect>
<ellipse cx="164" cy="148" rx="30" ry="7" fill="#e8c45a" stroke="#1d1a17" strokeWidth="2" transform="rotate(-12 164 148)"></ellipse>
<rect x="56" y="200" width="88" height="30" fill={v.drumShell} stroke="#1d1a17" strokeWidth="2.5"></rect>
<path d="M56 206 L144 206 M56 224 L144 224" stroke="#ffffff" strokeWidth="2"></path>
<ellipse cx="100" cy="200" rx="44" ry="11" fill="#f7f4f0" stroke="#1d1a17" strokeWidth="2.5"></ellipse>
<path d="M62 166 C56 178 58 188 66 192" stroke="#1d1a17" strokeWidth="23" fill="none" strokeLinecap="round"></path><path d="M62 166 C56 178 58 188 66 192" stroke={v.sleeve} strokeWidth="18" fill="none" strokeLinecap="round"></path>
<path d="M138 166 C146 174 146 184 140 192" stroke="#1d1a17" strokeWidth="23" fill="none" strokeLinecap="round"></path><path d="M138 166 C146 174 146 184 140 192" stroke={v.sleeve} strokeWidth="18" fill="none" strokeLinecap="round"></path>
<rect x="60" y="152" width="6" height="58" rx="3" fill="#e2bd90" stroke="#1d1a17" strokeWidth="1.5" transform="rotate(-38 63 192)"></rect>
<rect x="134" y="152" width="6" height="58" rx="3" fill="#e2bd90" stroke="#1d1a17" strokeWidth="1.5" transform="rotate(42 137 192)"></rect>
<circle cx="66" cy="192" r="9" fill={v.skin} stroke="#1d1a17" strokeWidth="2"></circle>
<circle cx="140" cy="192" r="9" fill={v.skin} stroke="#1d1a17" strokeWidth="2"></circle>
</>}

{v.iKeys && <>
<g transform="translate(0 12)">
<path d="M56 240 L84 216 M144 240 L116 216 M84 240 L56 216 M116 240 L144 216" stroke="#4a4440" strokeWidth="4"></path>
<rect x="22" y="184" width="156" height="34" rx="6" fill={v.synth} stroke="#1d1a17" strokeWidth="2.5"></rect>
<circle cx="34" cy="192" r="3" fill={v.neon}></circle><circle cx="44" cy="192" r="3" fill="#f3f1ee"></circle><circle cx="54" cy="192" r="3" fill="#f3f1ee"></circle>
<rect x="132" y="189" width="36" height="6" rx="2" fill={v.neon}></rect>
<rect x="28" y="198" width="144" height="17" fill="#ffffff"></rect>
<path d="M38 198 L38 215 M48 198 L48 215 M58 198 L58 215 M68 198 L68 215 M78 198 L78 215 M88 198 L88 215 M98 198 L98 215 M108 198 L108 215 M118 198 L118 215 M128 198 L128 215 M138 198 L138 215 M148 198 L148 215 M158 198 L158 215" stroke="#c9c4be" strokeWidth="1"></path>
<rect x="35" y="198" width="6" height="10" fill="#1d1a17"></rect><rect x="45" y="198" width="6" height="10" fill="#1d1a17"></rect>
<rect x="65" y="198" width="6" height="10" fill="#1d1a17"></rect><rect x="75" y="198" width="6" height="10" fill="#1d1a17"></rect><rect x="85" y="198" width="6" height="10" fill="#1d1a17"></rect>
<rect x="105" y="198" width="6" height="10" fill="#1d1a17"></rect><rect x="115" y="198" width="6" height="10" fill="#1d1a17"></rect>
<rect x="135" y="198" width="6" height="10" fill="#1d1a17"></rect><rect x="145" y="198" width="6" height="10" fill="#1d1a17"></rect><rect x="155" y="198" width="6" height="10" fill="#1d1a17"></rect>
<path d="M70 172 C66 182 68 192 74 200" stroke="#1d1a17" strokeWidth="22" fill="none" strokeLinecap="round"></path><path d="M70 172 C66 182 68 192 74 200" stroke={v.sleeve} strokeWidth="17" fill="none" strokeLinecap="round"></path>
<path d="M130 172 C134 182 132 192 126 200" stroke="#1d1a17" strokeWidth="22" fill="none" strokeLinecap="round"></path><path d="M130 172 C134 182 132 192 126 200" stroke={v.sleeve} strokeWidth="17" fill="none" strokeLinecap="round"></path>
<ellipse cx="76" cy="202" rx="9" ry="6" fill={v.skin} stroke="#1d1a17" strokeWidth="2"></ellipse>
<ellipse cx="124" cy="202" rx="9" ry="6" fill={v.skin} stroke="#1d1a17" strokeWidth="2"></ellipse>
</g>
</>}

{v.iMidi && <>
<path d="M16 168 L82 168 L88 208 L10 208 Z" fill="#2c2833" stroke="#1d1a17" strokeWidth="2.5"></path>
<rect x="20" y="172" width="58" height="30" rx="2" fill="#141225"></rect>
<path d="M24 194 L32 186 L40 190 L48 180 L56 188 L64 178 L74 184" stroke={v.neon} strokeWidth="2.5" fill="none"></path>
<rect x="6" y="208" width="88" height="6" rx="3" fill="#6b625b"></rect>
<rect x="100" y="188" width="84" height="44" rx="6" fill="#1d1a17"></rect>
<rect x="106" y="194" width="16" height="10" rx="2" fill="#ff4fa3"></rect><rect x="125" y="194" width="16" height="10" rx="2" fill="#c6f432"></rect><rect x="144" y="194" width="16" height="10" rx="2" fill="#3d5afe"></rect><rect x="163" y="194" width="16" height="10" rx="2" fill="#b69cff"></rect>
<rect x="106" y="207" width="16" height="10" rx="2" fill="#3d5afe"></rect><rect x="125" y="207" width="16" height="10" rx="2" fill="#ff4fa3"></rect><rect x="144" y="207" width="16" height="10" rx="2" fill="#c6f432"></rect><rect x="163" y="207" width="16" height="10" rx="2" fill="#ff4fa3"></rect>
<rect x="106" y="220" width="16" height="8" rx="2" fill="#c6f432"></rect><rect x="125" y="220" width="16" height="8" rx="2" fill="#b69cff"></rect><rect x="144" y="220" width="16" height="8" rx="2" fill="#ff4fa3"></rect><rect x="163" y="220" width="16" height="8" rx="2" fill="#3d5afe"></rect>
<path d="M132 170 C140 182 140 194 136 202" stroke="#1d1a17" strokeWidth="22" fill="none" strokeLinecap="round"></path><path d="M132 170 C140 182 140 194 136 202" stroke={v.sleeve} strokeWidth="17" fill="none" strokeLinecap="round"></path>
<circle cx="136" cy="206" r="9" fill={v.skin} stroke="#1d1a17" strokeWidth="2"></circle>
</>}

    </svg>
  )
}
