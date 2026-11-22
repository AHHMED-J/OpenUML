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

/** The same small diagram on the light canvas (left) and the dark one (right). */
function DarkCanvas(): React.JSX.Element {
  const half = (x: number, canvas: string, ink: string, box: string): React.JSX.Element => (
    <g>
      <rect x={x} y={24} width={200} height={162} rx={4} fill={canvas} stroke="var(--border-strong)" strokeWidth={1.5} />
      <rect x={x + 22} y={52} width={66} height={36} rx={2} fill={box} stroke={ink} strokeWidth={1.5} />
      <rect x={x + 112} y={122} width={66} height={36} rx={2} fill={box} stroke={ink} strokeWidth={1.5} />
      <path d={`M${x + 88} 70 H${x + 145} V116`} fill="none" stroke={ink} strokeWidth={1.8} />
      <path d={`M${x + 145} 122 l-4.5 -8 h9 z`} fill={ink} />
    </g>
  )
  return (
    <>
      {half(50, '#ffffff', '#1f2329', '#ffffff')}
      {half(270, '#0f1115', '#e8e8e8', '#1b1f27')}
    </>
  )
}

/** Tabs and the Working Diagrams list, both full as soon as a file opens. */
function WorkingDiagrams(): React.JSX.Element {
  const names = ['A-0 Context', 'A0 Diagram', 'A1 Diagram', 'A2 Diagram']
  return (
    <>
      <rect x={70} y={30} width={380} height={150} rx={6} fill={SURFACE} stroke="var(--border-strong)" strokeWidth={1.5} />
      {names.map((name, i) => (
        <g key={name}>
          <rect x={84 + i * 90} y={42} width={84} height={22} rx={4} fill={i === 1 ? 'var(--selection)' : 'none'} stroke={i === 1 ? ACCENT : 'var(--border-strong)'} strokeWidth={1.5} />
          <text x={126 + i * 90} y={57} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--text)">
            {name}
          </text>
          <rect x={84} y={76 + i * 24} width={352} height={20} rx={3} fill={i === 1 ? 'var(--selection)' : 'none'} />
          <rect x={92} y={81 + i * 24} width={10} height={10} rx={2} fill={i === 1 ? ACCENT : INK} />
          <text x={110} y={90 + i * 24} fontSize={12} fill="var(--text)">
            {name}
          </text>
        </g>
      ))}
    </>
  )
}

/** The canvas with the thin compact column at its right and no tab row. */
function CompactToolbar(): React.JSX.Element {
  const buttons = [46, 74, 102]
  return (
    <>
      <rect x={60} y={24} width={400} height={162} rx={6} fill={SURFACE} stroke="var(--border-strong)" strokeWidth={1.5} />
      <path d="M66 24 H420 V186 H66 a6 6 0 0 1 -6 -6 V30 a6 6 0 0 1 6 -6 z" fill="var(--canvas-bg)" />
      <rect x={96} y={58} width={88} height={44} rx={2} fill="var(--canvas-bg)" stroke={INK} strokeWidth={1.5} />
      <rect x={250} y={112} width={88} height={44} rx={2} fill="var(--canvas-bg)" stroke={INK} strokeWidth={1.5} />
      <path d="M184 80 H294 V106" fill="none" stroke={INK} strokeWidth={1.8} />
      <path d="M294 112 l-4.5 -8 h9 z" fill={INK} />
      <line x1={420} y1={24} x2={420} y2={186} stroke="var(--border-strong)" strokeWidth={1.5} />
      {buttons.map((y, i) => (
        <rect key={y} x={430} y={y - 10} width={20} height={20} rx={4} fill={i === 0 ? 'var(--selection)' : 'none'} stroke={ACCENT} strokeWidth={1.5} />
      ))}
      <text x={440} y={140} textAnchor="middle" fontSize={14} fontWeight={700} fill={ACCENT}>
        ⋯
      </text>
      <Chip x={326} y={34} label="Compact" w={76} />
    </>
  )
}

/** The Toolbox with each tool in the color of its kind of element. */
function ToolboxColors(): React.JSX.Element {
  const tools: readonly [string, string][] = [
    ['Class', 'var(--tool-classifier)'],
    ['Package', 'var(--tool-package)'],
    ['Attribute', 'var(--tool-feature)'],
    ['State', 'var(--tool-behavior)'],
    ['Use Case', 'var(--tool-usecase)'],
    ['Note', 'var(--tool-note)'],
    ['Association', 'var(--tool-connection)'],
    ['Dependency', 'var(--tool-connection)']
  ]
  return (
    <>
      <rect x={110} y={20} width={300} height={170} rx={6} fill={SURFACE} stroke="var(--border-strong)" strokeWidth={1.5} />
      <rect x={110} y={20} width={300} height={26} rx={6} fill="var(--panel-header)" />
      <text x={124} y={38} fontSize={11} fontWeight={700} fill="var(--text-muted)" letterSpacing={0.8}>
        TOOLBOX
      </text>
      {tools.map(([label, color], i) => {
        const x = 128 + (i % 2) * 140
        const y = 62 + Math.floor(i / 2) * 32
        return (
          <g key={label}>
            {i < 6 ? <rect x={x} y={y} width={14} height={14} rx={2} fill={color} /> : <path d={`M${x} ${y + 14} L${x + 14} ${y}`} stroke={color} strokeWidth={2.2} />}
            <text x={x + 24} y={y + 12} fontSize={13} fill="var(--text)">
              {label}
            </text>
          </g>
        )
      })}
    </>
  )
}

/** The empty canvas of a new project: Add Diagram and the tip pointing at it. */
function FirstSteps(): React.JSX.Element {
  return (
    <>
      <rect x={70} y={20} width={380} height={170} rx={6} fill={SURFACE} stroke="var(--border-strong)" strokeWidth={1.5} />
      <rect x={160} y={50} width={200} height={10} rx={5} fill="var(--text)" opacity={0.8} />
      <rect x={190} y={70} width={140} height={7} rx={3.5} fill="var(--border-strong)" />
      <rect x={205} y={88} width={110} height={26} rx={4} fill={ACCENT} />
      <text x={260} y={105} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--accent-text)">
        Add Diagram...
      </text>
      <rect x={170} y={127} width={180} height={50} rx={6} fill={SURFACE} stroke={ACCENT} strokeWidth={1.5} />
      <path d="M252 127.75 L260 118 L268 127.75" fill={SURFACE} stroke={ACCENT} strokeWidth={1.5} strokeLinejoin="round" />
      <rect x={184} y={140} width={130} height={7} rx={3.5} fill="var(--text-muted)" />
      <rect x={184} y={156} width={90} height={7} rx={3.5} fill="var(--border-strong)" />
      <text x={336} y={146} textAnchor="middle" fontSize={11} fill="var(--text-muted)">
        ✕
      </text>
    </>
  )
}

/** A browser window with OpenUML open at its address. */
function BrowserApp(): React.JSX.Element {
  return (
    <>
      <rect x={60} y={18} width={400} height={174} rx={8} fill={SURFACE} stroke="var(--border-strong)" strokeWidth={1.5} />
      <path d="M60 50 H460" stroke="var(--border-strong)" strokeWidth={1.5} />
      {[78, 92, 106].map((x) => (
        <circle key={x} cx={x} cy={34} r={4} fill="var(--border-strong)" />
      ))}
      <rect x={130} y={25} width={250} height={18} rx={9} fill="var(--bg)" />
      <text x={255} y={38} textAnchor="middle" fontSize={11} fontFamily={MONO} fill="var(--text)">
        openuml.org/app
      </text>
      <rect x={61} y={51} width={398} height={16} fill="var(--panel-header)" />
      {['File', 'Edit', 'View', 'Help'].map((m, i) => (
        <text key={m} x={74 + i * 40} y={63} fontSize={10} fill="var(--text-muted)">
          {m}
        </text>
      ))}
      <rect x={61} y={67} width={89} height={117} fill="var(--surface-alt)" />
      {[80, 98, 116, 134].map((y, i) => (
        <rect key={y} x={i > 0 ? 82 : 72} y={y} width={i > 0 ? 56 : 66} height={7} rx={3.5} fill="var(--border-strong)" />
      ))}
      <rect x={150} y={67} width={309} height={117} fill="var(--canvas-bg)" />
      {(
        [
          [190, 'Order', INK],
          [340, 'Item', ACCENT]
        ] as const
      ).map(([x, label, stroke]) => (
        <g key={label}>
          <rect x={x} y={100} width={86} height={48} rx={2} fill="var(--canvas-bg)" stroke={stroke} strokeWidth={1.5} />
          <text x={x + 43} y={128} textAnchor="middle" fontSize={13} fontWeight={600} fill="#1f2328">
            {label}
          </text>
        </g>
      ))}
      <line x1={276} y1={124} x2={340} y2={124} stroke={INK} strokeWidth={1.8} />
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
  'whats-new': WhatsNewScene,
  'dark-canvas': DarkCanvas,
  'working-diagrams': WorkingDiagrams,
  'compact-toolbar': CompactToolbar,
  'toolbox-colors': ToolboxColors,
  'first-steps': FirstSteps,
  'browser-app': BrowserApp
}

export function Illustration({ id }: { id: IllustrationId }): React.JSX.Element {
  const Scene = SCENES[id]
  return (
    <svg className="wn-hero-art" viewBox="0 0 520 210" role="img" aria-hidden="true" focusable="false">
      <Scene />
    </svg>
  )
}
