/**
 * Hero drawings of the What's New slides: small vector scenes in the app's own style, using the
 * theme variables (no images, no network). Each is drawn in a 520 x 210 view box.
 */
import type React from 'react'
import type { IllustrationId } from './releases'

const INK = 'var(--text-muted)'
const SURFACE = 'var(--surface)'
const ACCENT = 'var(--accent)'
const MONO = 'var(--font-mono)'

function Box({ x, y, label, w = 96, h = 64, active }: { x: number; y: number; label: string; w?: number; h?: number; active?: boolean }): React.JSX.Element {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={3} fill={SURFACE} stroke={active ? ACCENT : INK} strokeWidth={active ? 2 : 1.5} />
      <text x={x + w / 2} y={y + h / 2 + 4} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--text)">
        {label}
      </text>
    </g>
  )
}

/** A solid arrow from (x1, y) to (x2, y), head pointing right. */
function Arrow({ x1, x2, y, dashed, color = INK }: { x1: number; x2: number; y: number; dashed?: boolean; color?: string }): React.JSX.Element {
  return (
    <g stroke={color} fill={color}>
      <line x1={x1} y1={y} x2={x2 - 6} y2={y} strokeWidth={1.8} strokeDasharray={dashed ? '5 4' : undefined} />
      <path d={`M${x2} ${y} l-8 -4.5 v9 z`} stroke="none" />
    </g>
  )
}

function Chip({ x, y, label, w }: { x: number; y: number; label: string; w: number }): React.JSX.Element {
  return (
    <g>
      <rect x={x} y={y} width={w} height={20} rx={10} fill="var(--selection)" />
      <text x={x + w / 2} y={y + 14} textAnchor="middle" fontSize={11} fontWeight={600} fill={ACCENT}>
        {label}
      </text>
    </g>
  )
}

function PendingArrows(): React.JSX.Element {
  return (
    <>
      <Box x={150} y={73} label="A1" />
      <Box x={290} y={30} label="A2" />
      <Box x={290} y={116} label="A3" />
      <Arrow x1={90} x2={150} y={105} dashed color={ACCENT} />
      <circle cx={90} cy={105} r={5} fill={ACCENT} />
      <text x={90} y={90} textAnchor="middle" fontSize={11} fontFamily={MONO} fill={ACCENT}>
        I1
      </text>
      <Arrow x1={246} x2={290} y={62} />
      <Arrow x1={246} x2={290} y={148} />
      <Arrow x1={386} x2={450} y={62} />
      <Arrow x1={386} x2={450} y={148} />
      <Chip x={34} y={122} label="pending" w={62} />
    </>
  )
}

function BoxTable(): React.JSX.Element {
  const rows = ['A1', 'A2', 'A3']
  return (
    <>
      <rect x={150} y={20} width={220} height={170} rx={6} fill={SURFACE} stroke="var(--border-strong)" strokeWidth={1.5} />
      <text x={166} y={44} fontSize={12} fontWeight={600} fill="var(--text)">
        Connect I1 to...
      </text>
      {rows.map((label, i) => {
        const y = 62 + i * 34
        const checked = i !== 1
        return (
          <g key={label}>
            <rect x={166} y={y} width={16} height={16} rx={3} fill={checked ? ACCENT : SURFACE} stroke={checked ? ACCENT : INK} strokeWidth={1.5} />
            {checked ? <path d={`M170 ${y + 8} l3 3.5 l6 -7`} fill="none" stroke="var(--accent-text)" strokeWidth={2} /> : null}
            <text x={192} y={y + 13} fontSize={13} fill="var(--text)">
              {label}
            </text>
          </g>
        )
      })}
      <Chip x={268} y={96} label="fork to 2" w={64} />
      <Arrow x1={50} x2={150} y={105} dashed color={ACCENT} />
    </>
  )
}

function AdvancedArrows(): React.JSX.Element {
  const cols = ['A1', 'A2', 'A3']
  const rows = ['I1', 'C1', 'O1']
  const on = new Set(['0,0', '1,0', '1,1', '2,2'])
  return (
    <>
      <rect x={130} y={24} width={260} height={162} rx={6} fill={SURFACE} stroke="var(--border-strong)" strokeWidth={1.5} />
      {cols.map((c, i) => (
        <text key={c} x={226 + i * 52} y={52} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--text)">
          {c}
        </text>
      ))}
      {rows.map((r, j) => (
        <g key={r}>
          <text x={150} y={92 + j * 36} fontSize={12} fontFamily={MONO} fill="var(--text)">
            {r}
          </text>
          {cols.map((c, i) => {
            const checked = on.has(`${j},${i}`)
            return (
              <g key={c}>
                <rect x={218 + i * 52} y={78 + j * 36} width={16} height={16} rx={3} fill={checked ? ACCENT : SURFACE} stroke={checked ? ACCENT : INK} strokeWidth={1.5} />
                {checked ? <path d={`M${222 + i * 52} ${86 + j * 36} l3 3.5 l6 -7`} fill="none" stroke="var(--accent-text)" strokeWidth={2} /> : null}
              </g>
            )
          })}
        </g>
      ))}
    </>
  )
}

function Website(): React.JSX.Element {
  return (
    <>
      <rect x={110} y={22} width={300} height={166} rx={6} fill={SURFACE} stroke="var(--border-strong)" strokeWidth={1.5} />
      <line x1={110} y1={46} x2={410} y2={46} stroke="var(--border)" />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={126 + i * 14} cy={34} r={3.5} fill="var(--border-strong)" />
      ))}
      <line x1={200} y1={46} x2={200} y2={188} stroke="var(--border)" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={212 - (i === 0 ? 0 : 10)} y={62 + i * 24} width={i === 0 ? 70 : 54} height={9} rx={4} fill={i === 1 ? ACCENT : 'var(--border-strong)'} />
      ))}
      <Box x={232} y={80} label="A1" w={72} h={50} active />
      <Box x={326} y={80} label="A2" w={72} h={50} />
      <Arrow x1={304} x2={326} y={105} />
      <text x={265} y={158} textAnchor="middle" fontSize={11} fill={INK}>
        ← →
      </text>
    </>
  )
}

function RadLines(): React.JSX.Element {
  return (
    <>
      <rect x={60} y={24} width={180} height={162} rx={4} fill={SURFACE} stroke={INK} strokeWidth={1.5} />
      <rect x={280} y={24} width={180} height={162} rx={4} fill={SURFACE} stroke={INK} strokeWidth={1.5} />
      <text x={150} y={44} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--text)">
        Customer
      </text>
      <text x={370} y={44} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--text)">
        Clerk
      </text>
      <rect x={116} y={70} width={68} height={28} rx={3} fill="var(--surface-alt)" stroke={INK} strokeWidth={1.5} />
      <rect x={336} y={120} width={68} height={28} rx={3} fill="var(--surface-alt)" stroke={INK} strokeWidth={1.5} />
      <path d="M184 84 H260 V134 H336" fill="none" stroke={ACCENT} strokeWidth={2} />
      <path d="M336 134 l-8 -4.5 v9 z" fill={ACCENT} />
      <circle cx={260} cy={84} r={4} fill={ACCENT} />
      <circle cx={260} cy={134} r={4} fill={ACCENT} />
    </>
  )
}

function ShowInFolder(): React.JSX.Element {
  return (
    <>
      <rect x={90} y={30} width={340} height={44} rx={6} fill={SURFACE} stroke="var(--border-strong)" strokeWidth={1.5} />
      <rect x={110} y={44} width={16} height={16} rx={2} fill="none" stroke={INK} strokeWidth={1.5} />
      <rect x={146} y={44} width={16} height={16} rx={2} fill="none" stroke={INK} strokeWidth={1.5} />
      <rect x={176} y={38} width={28} height={28} rx={5} fill="var(--selection)" stroke={ACCENT} strokeWidth={1.5} />
      <path d="M183 55h5l1.5 -2h8v9h-14.5zM187 59l5 -5M189 54h3.5v3.5" fill="none" stroke={ACCENT} strokeWidth={1.5} />
      <path d="M190 74 V104" stroke={ACCENT} strokeWidth={1.5} strokeDasharray="4 3" />
      <rect x={130} y={104} width={260} height={84} rx={6} fill={SURFACE} stroke="var(--border-strong)" strokeWidth={1.5} />
      <rect x={146} y={118} width={228} height={22} rx={4} fill="var(--selection)" />
      <rect x={156} y={124} width={10} height={10} rx={2} fill={ACCENT} />
      <text x={174} y={134} fontSize={12} fontWeight={600} fill="var(--text)">
        model.mdj
      </text>
      <rect x={146} y={150} width={140} height={8} rx={4} fill="var(--border-strong)" />
      <rect x={146} y={166} width={100} height={8} rx={4} fill="var(--border-strong)" />
    </>
  )
}

function WhatsNewScene(): React.JSX.Element {
  return (
    <>
      <rect x={140} y={24} width={240} height={162} rx={8} fill={SURFACE} stroke="var(--border-strong)" strokeWidth={1.5} />
      <Chip x={156} y={40} label="NEW IN 0.1.8" w={92} />
      <rect x={156} y={76} width={150} height={12} rx={6} fill="var(--text)" opacity={0.8} />
      <rect x={156} y={102} width={200} height={8} rx={4} fill="var(--border-strong)" />
      <rect x={156} y={118} width={180} height={8} rx={4} fill="var(--border-strong)" />
      <circle cx={162} cy={166} r={4} fill={ACCENT} />
      <circle cx={176} cy={166} r={4} fill="var(--border-strong)" />
      <circle cx={190} cy={166} r={4} fill="var(--border-strong)" />
      <rect x={300} y={154} width={64} height={22} rx={4} fill={ACCENT} />
      <text x={332} y={169} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--accent-text)">
        Next →
      </text>
    </>
  )
}

const SCENES: Readonly<Record<IllustrationId, () => React.JSX.Element>> = {
  'pending-arrows': PendingArrows,
  'box-table': BoxTable,
  'advanced-arrows': AdvancedArrows,
  website: Website,
  'rad-lines': RadLines,
  'show-in-folder': ShowInFolder,
  'whats-new': WhatsNewScene
}

export function Illustration({ id }: { id: IllustrationId }): React.JSX.Element {
  const Scene = SCENES[id]
  return (
    <svg className="wn-hero-art" viewBox="0 0 520 210" role="img" aria-hidden="true" focusable="false">
      <Scene />
    </svg>
  )
}
