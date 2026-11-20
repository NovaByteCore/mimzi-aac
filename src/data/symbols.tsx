/*
 * Original Mimzi symbols for core and abstract words that have no clear picture.
 * Drawn for this project (no third-party symbol sets). Everyday nouns use the
 * device's own emoji font, and every tile can be replaced with a real photo.
 */
import type { ReactElement } from 'react';

const INK = '#28384A';
const S = { stroke: INK, strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;

const Person = ({ x = 50, y = 22, fill = '#F8E1D2' }: { x?: number; y?: number; fill?: string }) => (
  <g>
    <circle cx={x} cy={y} r={10} fill={fill} stroke={INK} strokeWidth={5} />
    <path d={`M${x} ${y + 10} V${y + 42} M${x - 16} ${y + 24} H${x + 16} M${x} ${y + 42} L${x - 12} ${y + 64} M${x} ${y + 42} L${x + 12} ${y + 64}`} {...S} />
  </g>
);

const Arrow = ({ d, head }: { d: string; head: string }) => (
  <g>
    <path d={d} {...S} strokeWidth={7} />
    <path d={head} {...S} strokeWidth={7} />
  </g>
);

const Box = ({ y = 58 }: { y?: number }) => <rect x={24} y={y} width={52} height={30} rx={5} fill="#F8E1D2" stroke={INK} strokeWidth={5} />;

const Bin = () => <path d="M20 46 V86 H80 V46" {...S} fill="#DCECF8" />;

const Shield = ({ fill }: { fill: string }) => (
  <path d="M50 10 L82 22 V48 C82 70 66 84 50 90 C34 84 18 70 18 48 V22 Z" fill={fill} stroke={INK} strokeWidth={5} strokeLinejoin="round" />
);

const Heart = ({ x = 50, y = 54, s = 1, fill = '#F4B6B6' }) => (
  <path
    transform={`translate(${x} ${y}) scale(${s})`}
    d="M0 22 C-26 4 -30 -14 -16 -22 C-8 -26 -2 -22 0 -16 C2 -22 8 -26 16 -22 C30 -14 26 4 0 22 Z"
    fill={fill}
    stroke={INK}
    strokeWidth={5}
    strokeLinejoin="round"
  />
);

const Check = ({ d = 'M28 52 L44 68 L74 34' }) => <path d={d} {...S} strokeWidth={9} />;
const Cross = () => <path d="M33 33 L67 67 M67 33 L33 67" {...S} strokeWidth={9} />;


/** A soap bubble with a shine. */
const Bubble = ({ x, y, r }: { x: number; y: number; r: number }) => (
  <g>
    <circle cx={x} cy={y} r={r} fill="#CFE8FA" stroke={INK} strokeWidth={4} />
    <path d={`M${x - r * 0.55} ${y - r * 0.1} A${r * 0.6} ${r * 0.6} 0 0 1 ${x - r * 0.05} ${y - r * 0.6}`} stroke="#FFFFFF" strokeWidth={Math.max(2.5, r * 0.22)} strokeLinecap="round" fill="none" />
  </g>
);

/** An open hand, palm facing out (fingers up), centred on its palm. */
const OpenHand = ({ x, y, tilt = 0, thumbRight = false }: { x: number; y: number; tilt?: number; thumbRight?: boolean }) => (
  <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${thumbRight ? -1 : 1} 1)`}>
    {/* fingers */}
    {[-10.5, -3.5, 3.5, 10.5].map((fx, i) => (
      <rect key={i} x={fx - 3.6} y={-30 + (i === 0 || i === 3 ? 6 : 0)} width={7.2} height={24} rx={3.6} fill="#F8E1D2" stroke={INK} strokeWidth={3.2} />
    ))}
    {/* thumb */}
    <rect x={-25} y={-6} width={7.2} height={20} rx={3.6} fill="#F8E1D2" stroke={INK} strokeWidth={3.2} transform="rotate(-38 -21 4)" />
    {/* palm */}
    <path d="M-15 -10 H15 V8 C15 18 8 24 0 24 C-8 24 -15 18 -15 8 Z" fill="#F8E1D2" stroke={INK} strokeWidth={3.2} strokeLinejoin="round" />
  </g>
);

export const SYMBOLS: Record<string, () => ReactElement> = {
  more: () => (
    <g>
      <rect x={14} y={14} width={72} height={72} rx={18} fill="#DDEEDC" stroke={INK} strokeWidth={5} />
      <path d="M50 30 V70 M30 50 H70" {...S} strokeWidth={10} />
    </g>
  ),
  yes: () => (
    <g>
      <circle cx={50} cy={50} r={38} fill="#CDEBC8" stroke={INK} strokeWidth={5} />
      <Check />
    </g>
  ),
  no: () => (
    <g>
      <circle cx={50} cy={50} r={38} fill="#F7CFCF" stroke={INK} strokeWidth={5} />
      <Cross />
    </g>
  ),
  like: () => <Heart />,
  want: () => (
    <g>
      <Heart x={40} y={50} s={1.15} />
      <Arrow d="M92 50 H70" head="M78 42 L70 50 L78 58" />
    </g>
  ),
  go: () => (
    <g>
      <circle cx={50} cy={50} r={38} fill="#A9D8A4" stroke={INK} strokeWidth={5} />
      <Arrow d="M30 50 H68" head="M56 38 L70 50 L56 62" />
    </g>
  ),
  stop: () => (
    <g>
      <path d="M35 12 H65 L88 35 V65 L65 88 H35 L12 65 V35 Z" fill="#F2A7A7" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      <path d="M36 66 V40 M44 66 V32 M52 66 V32 M60 66 V36 M36 66 C36 76 64 76 64 66 V48" {...S} />
    </g>
  ),
  open: () => (
    <g>
      <Box />
      <path d="M24 52 L42 22 L78 34" {...S} fill="#F8E1D2" />
    </g>
  ),
  close: () => (
    <g>
      <Box />
      <rect x={20} y={46} width={60} height={10} rx={4} fill="#F8E1D2" stroke={INK} strokeWidth={5} />
      <Arrow d="M50 8 V34" head="M42 26 L50 34 L58 26" />
    </g>
  ),
  in: () => (
    <g>
      <Bin />
      <rect x={40} y={60} width={20} height={20} rx={3} fill="#F8E1D2" stroke={INK} strokeWidth={5} />
      <Arrow d="M50 8 V44" head="M42 36 L50 44 L58 36" />
    </g>
  ),
  out: () => (
    <g>
      <Bin />
      <rect x={40} y={14} width={20} height={20} rx={3} fill="#F8E1D2" stroke={INK} strokeWidth={5} />
      <Arrow d="M50 80 V46" head="M42 54 L50 46 L58 54" />
    </g>
  ),
  on: () => (
    <g>
      <rect x={14} y={70} width={72} height={10} rx={3} fill="#DCECF8" stroke={INK} strokeWidth={5} />
      <rect x={38} y={46} width={24} height={24} rx={3} fill="#F8E1D2" stroke={INK} strokeWidth={5} />
      <Arrow d="M50 10 V36" head="M42 28 L50 36 L58 28" />
    </g>
  ),
  off: () => (
    <g>
      <rect x={14} y={70} width={72} height={10} rx={3} fill="#DCECF8" stroke={INK} strokeWidth={5} />
      <rect x={38} y={14} width={24} height={24} rx={3} fill="#F8E1D2" stroke={INK} strokeWidth={5} />
      <Arrow d="M50 62 V44" head="M42 52 L50 44 L58 52" />
    </g>
  ),
  up: () => <Arrow d="M50 88 V16" head="M28 38 L50 14 L72 38" />,
  down: () => <Arrow d="M50 12 V84" head="M28 62 L50 86 L72 62" />,
  'all-done': () => (
    <g>
      <path d="M14 52 H86 C86 72 70 84 50 84 C30 84 14 72 14 52 Z" fill="#E9E4F7" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      <Check d="M36 28 L46 38 L66 16" />
    </g>
  ),
  me: () => (
    <g>
      <Person x={40} />
      <Arrow d="M92 50 H60" head="M68 42 L60 50 L68 58" />
    </g>
  ),
  you: () => (
    <g>
      <Person x={60} />
      <Arrow d="M8 92 L36 64" head="M24 64 L36 64 L36 76" />
    </g>
  ),
  mine: () => (
    <g>
      <Person x={50} />
      <circle cx={50} cy={46} r={13} fill="#FFE7A3" stroke={INK} strokeWidth={5} />
    </g>
  ),
  this: () => (
    <g>
      <rect x={18} y={56} width={34} height={34} rx={5} fill="#FFE7A3" stroke={INK} strokeWidth={5} />
      <Arrow d="M80 14 L46 48" head="M46 36 L46 48 L58 48" />
    </g>
  ),
  that: () => (
    <g>
      <rect x={64} y={12} width={24} height={24} rx={4} fill="#FFE7A3" stroke={INK} strokeWidth={5} />
      <path d="M14 86 L58 42" {...S} strokeWidth={6} strokeDasharray="2 12" />
      <path d="M46 42 H58 V54" {...S} strokeWidth={6} />
    </g>
  ),
  give: () => (
    <g>
      <Person x={74} />
      <rect x={8} y={36} width={22} height={22} rx={3} fill="#FFE7A3" stroke={INK} strokeWidth={5} />
      <Arrow d="M34 47 H54" head="M46 39 L54 47 L46 55" />
    </g>
  ),
  get: () => (
    <g>
      <Person x={26} />
      <rect x={70} y={36} width={22} height={22} rx={3} fill="#FFE7A3" stroke={INK} strokeWidth={5} />
      <Arrow d="M66 47 H46" head="M54 39 L46 47 L54 55" />
    </g>
  ),
  come: () => (
    <g>
      <Person x={50} y={30} />
      <Arrow d="M12 16 C12 40 20 52 30 58" head="M20 58 L30 58 L30 48" />
      <Arrow d="M88 16 C88 40 80 52 70 58" head="M80 58 L70 58 L70 48" />
    </g>
  ),
  safe: () => (
    <g>
      <Shield fill="#CDEBC8" />
      <Check d="M34 50 L46 62 L68 38" />
    </g>
  ),
  'not-safe': () => (
    <g>
      <Shield fill="#F7CFCF" />
      <path d="M36 36 L64 64 M64 36 L36 64" {...S} strokeWidth={9} />
    </g>
  ),
  break: () => (
    <g>
      <circle cx={50} cy={50} r={38} fill="#E9E4F7" stroke={INK} strokeWidth={5} />
      <path d="M40 32 V68 M60 32 V68" {...S} strokeWidth={10} />
    </g>
  ),
  wait: () => (
    <g>
      <path d="M28 12 H72 M28 88 H72 M32 12 C32 36 50 42 50 50 C50 58 32 64 32 88 M68 12 C68 36 50 42 50 50 C50 58 68 64 68 88" {...S} fill="#FFF1C9" />
      <path d="M40 80 H60" {...S} strokeWidth={8} />
    </g>
  ),
  again: () => (
    <g>
      <path d="M78 50 A28 28 0 1 1 64 26" {...S} strokeWidth={8} />
      <path d="M56 14 L68 26 L54 36" {...S} strokeWidth={8} />
    </g>
  ),
  please: () => (
    <g>
      {/* two hands pressed together, asking nicely */}
      <path d="M50 18 C40 26 36 44 38 62 L46 84 H54 L62 62 C64 44 60 26 50 18 Z" fill="#F8E1D2" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      <path d="M50 22 V80" {...S} strokeWidth={4} />
      <Heart x={78} y={30} s={0.5} />
    </g>
  ),
  'thank-you': () => (
    <g>
      <circle cx={34} cy={30} r={14} fill="#FFF3E6" stroke={INK} strokeWidth={5} />
      <path d="M28 34 Q34 38 40 34" {...S} strokeWidth={3} />
      <path d="M44 46 L64 40 Q72 38 72 44 L70 50 L52 56 Z" fill="#F8E1D2" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <Arrow d="M56 64 Q72 70 84 62" head="M76 58 L85 61 L80 70" />
      <Heart x={80} y={28} s={0.5} />
    </g>
  ),
  bye: () => (
    <g>
      <Person x={36} />
      <path d="M58 14 L64 32 M66 10 L70 30 M74 12 L74 30 M60 32 Q66 42 76 34 L76 28" {...S} strokeWidth={4} />
      <path d="M80 18 Q86 24 82 32 M86 12 Q94 22 88 36" {...S} strokeWidth={3} />
    </g>
  ),
  friend: () => (
    <g>
      <Person x={32} y={24} fill="#F8E1D2" />
      <Person x={68} y={24} fill="#FFE7A3" />
      <path d="M48 48 H52" {...S} strokeWidth={6} />
    </g>
  ),
  pee: () => (
    <g>
      <path d="M50 14 C40 32 32 44 32 58 A18 18 0 0 0 68 58 C68 44 60 32 50 14 Z" fill="#FFE27A" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      <path d="M22 88 H78" {...S} strokeWidth={5} />
    </g>
  ),
  poop: () => (
    <g>
      <path d="M24 80 Q24 66 36 66 Q30 54 42 50 Q40 38 52 36 Q60 30 60 22 Q72 30 66 44 Q78 46 74 58 Q84 62 80 80 Z" fill="#B07A4F" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
      <path d="M18 88 H82" {...S} strokeWidth={5} />
    </g>
  ),
  'my-turn': () => (
    <g>
      <Person x={30} />
      <path d="M58 40 A16 16 0 1 1 74 56" {...S} strokeWidth={6} />
      <path d="M66 50 L74 57 L82 50" {...S} strokeWidth={6} />
      <Arrow d="M92 82 H52" head="M60 74 L52 82 L60 90" />
    </g>
  ),
  'your-turn': () => (
    <g>
      <Person x={70} />
      <path d="M42 40 A16 16 0 1 0 26 56" {...S} strokeWidth={6} />
      <path d="M34 50 L26 57 L18 50" {...S} strokeWidth={6} />
      <Arrow d="M8 82 H48" head="M40 74 L48 82 L40 90" />
    </g>
  ),
  throw: () => (
    <g>
      <Person x={26} y={30} />
      <path d="M42 54 Q60 20 80 30" {...S} strokeWidth={4} strokeDasharray="4 7" />
      <circle cx={84} cy={34} r={9} fill="#E57373" stroke={INK} strokeWidth={4} />
    </g>
  ),
  /** "More": one bubble becomes several (concrete for toddlers; replaces the abstract plus). */
  'more-bubbles': () => (
    <g>
      <Bubble x={18} y={52} r={12} />
      <Arrow d="M34 52 H46" head="M40 45 L47 52 L40 59" />
      <Bubble x={68} y={28} r={12} />
      <Bubble x={89} y={48} r={9} />
      <Bubble x={68} y={63} r={13} />
      <Bubble x={89} y={78} r={8} />
    </g>
  ),
  /** "All done": both open hands with the turning motion of the sign. */
  'all-done-hands': () => (
    <g>
      {/* palms face out, so both thumbs point to the middle */}
      <OpenHand x={27} y={60} tilt={-14} thumbRight />
      <OpenHand x={73} y={60} tilt={14} />
      <path d="M14 22 A20 20 0 0 1 34 12" {...S} strokeWidth={4} />
      <path d="M86 22 A20 20 0 0 0 66 12" {...S} strokeWidth={4} />
      <path d="M28 10 L34 12 L31 18" {...S} strokeWidth={4} />
      <path d="M72 10 L66 12 L69 18" {...S} strokeWidth={4} />
    </g>
  ),
  /** "Needs" folder: everyday care — a drink, a bed and a heart (the toilet is kept for "potty"). */
  needs: () => (
    <g>
      {/* cup with straw */}
      <path d="M12 40 H40 L36 84 H16 Z" fill="#DCECF8" stroke={INK} strokeWidth={4.5} strokeLinejoin="round" />
      <path d="M14 56 H38" stroke="#7FB8E6" strokeWidth={6} />
      <path d="M30 40 L34 22 H42" {...S} strokeWidth={4.5} />
      {/* bed with pillow */}
      <path d="M50 84 V54 M50 72 H92 V84" {...S} strokeWidth={4.5} />
      <rect x={53} y={58} width={14} height={11} rx={4} fill="#FFFFFF" stroke={INK} strokeWidth={4} />
      <path d="M68 72 V62 Q80 56 92 62 V72 Z" fill="#E9E4F7" stroke={INK} strokeWidth={4} strokeLinejoin="round" />
      <Heart x={70} y={26} s={0.62} />
    </g>
  ),
  help: () => (
    <g>
      {/* rescue ring */}
      <circle cx={50} cy={50} r={27} fill="none" stroke="#FFFFFF" strokeWidth={22} />
      <circle cx={50} cy={50} r={27} fill="none" stroke="#E57373" strokeWidth={22} strokeDasharray="21.2 21.2" strokeDashoffset={10.6} />
      <circle cx={50} cy={50} r={38} fill="none" stroke={INK} strokeWidth={5} />
      <circle cx={50} cy={50} r={16} fill="#DCECF8" stroke={INK} strokeWidth={5} />
    </g>
  ),
};

export const SYMBOL_KEYS = Object.keys(SYMBOLS);

export function SymbolSvg({ name, title }: { name: string; title?: string }) {
  const draw = SYMBOLS[name];
  if (!draw) return null;
  return (
    <svg viewBox="0 0 100 100" className="symbol-svg" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}
      {draw()}
    </svg>
  );
}
