/*
 * ASL sign drawings for early words — original illustrations made for Mimzi.
 *
 * Each drawing shows a signer facing you (so their right hand is on YOUR left), the
 * handshape, where it is made, and an arrow for the movement. Every sign was checked
 * against published ASL references (see `source` on each) before drawing; the written
 * `how` describes the movement in plain words for grown-ups.
 *
 * A drawing can't show movement as well as a person can. For learning a sign, attach a
 * real video with "See sign" (Parent Mode), or watch the linked reference.
 */
import type { ReactElement } from 'react';

const INK = '#28384A';
const SKIN = '#F4C7A1';
const SKIN2 = '#EDB98F';
const MOVE = '#2F6FB3';

type Pt = [number, number];

/* ---------- body ---------- */

function Signer({ eyesClosed = false }: { eyesClosed?: boolean }) {
  return (
    <g>
      <path d="M8 100 C10 68 28 54 50 54 C72 54 90 68 92 100 Z" fill="#E9E4F7" stroke={INK} strokeWidth={2.5} />
      <rect x={44} y={40} width={12} height={10} fill={SKIN} />
      <circle cx={50} cy={25} r={16} fill="#FFF3E6" stroke={INK} strokeWidth={2.5} />
      {eyesClosed ? (
        <path d="M41 23 Q44 25.5 47 23 M53 23 Q56 25.5 59 23" stroke={INK} strokeWidth={1.8} fill="none" strokeLinecap="round" />
      ) : (
        <g fill={INK}>
          <circle cx={44} cy={22.5} r={1.8} />
          <circle cx={56} cy={22.5} r={1.8} />
        </g>
      )}
      <path d="M44.5 30.5 Q50 34 55.5 30.5" stroke={INK} strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </g>
  );
}

/* ---------- hands (local coords: wrist at 0,0, fingers pointing up) ---------- */

interface Pose {
  x: number;
  y: number;
  rot?: number;
  s?: number;
  /** Mirror (draw the other hand). */
  flip?: boolean;
  tone?: string;
}

function place(p: Pose) {
  return `translate(${p.x} ${p.y}) rotate(${p.rot ?? 0}) scale(${(p.flip ? -1 : 1) * (p.s ?? 1)} ${p.s ?? 1})`;
}

/** A finger/thumb as an outlined capsule along a polyline. */
function Digit({ pts, w = 4.6, tone = SKIN }: { pts: Pt[]; w?: number; tone?: string }) {
  const d = `M${pts.map((p) => p.join(' ')).join(' L')}`;
  return (
    <g>
      <path d={d} stroke={INK} strokeWidth={w + 2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} stroke={tone} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

const BASES: Pt[] = [
  [-5.2, -13],
  [-1.8, -14],
  [1.8, -14],
  [5.2, -13],
];
const THUMB_BASE: Pt = [-6.5, -5];

/** Generic front-view hand from finger end points. */
function Hand({ pose, fingers, thumb, palm = 'M-7.5 0 L-8 -12 Q-8 -15.5 -4 -15.5 L4 -15.5 Q8 -15.5 8 -12 L7.5 0 Z' }: { pose: Pose; fingers: (Pt[] | null)[]; thumb: Pt[] | null; palm?: string }) {
  const tone = pose.tone ?? SKIN;
  const digits = fingers.map((f, i) => (f ? [BASES[i], ...f] : null));
  const th = thumb ? [THUMB_BASE, ...thumb] : null;
  return (
    <g transform={place(pose)}>
      {/* outlines first, then palm, then fills, so fingers join the palm cleanly */}
      {digits.map((pts, i) => pts && <path key={`o${i}`} d={`M${pts.map((p) => p.join(' ')).join(' L')}`} stroke={INK} strokeWidth={7.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
      {th && <path d={`M${th.map((p) => p.join(' ')).join(' L')}`} stroke={INK} strokeWidth={7.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
      <path d={palm} fill={tone} stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
      {digits.map((pts, i) => pts && <path key={`f${i}`} d={`M${pts.map((p) => p.join(' ')).join(' L')}`} stroke={tone} strokeWidth={4.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
      {th && <path d={`M${th.map((p) => p.join(' ')).join(' L')}`} stroke={tone} strokeWidth={4.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
    </g>
  );
}

/** Flat "B": fingers together and straight, thumb alongside. */
const FlatHand = (p: Pose) => (
  <Hand pose={p} fingers={[[[-5, -29]], [[-1.8, -31]], [[1.8, -31]], [[5, -28.5]]]} thumb={[[-10, -12]]} />
);
/** Open "5": fingers spread. */
const FiveHand = (p: Pose) => (
  <Hand pose={p} fingers={[[[-13, -27]], [[-4.5, -32]], [[4.5, -32]], [[12.5, -26]]]} thumb={[[-16, -9]]} />
);
/** Fist "S" (thumb across the front). */
const FistHand = (p: Pose) => (
  <g transform={place(p)}>
    <rect x={-8.5} y={-17} width={17} height={17} rx={5.5} fill={p.tone ?? SKIN} stroke={INK} strokeWidth={2.4} />
    <path d="M-4 -17 V-12 M0 -17 V-12 M4 -17 V-12" stroke={INK} strokeWidth={1.6} />
    <Digit pts={[[-8, -7], [3, -9]]} w={4.2} tone={p.tone ?? SKIN} />
  </g>
);
/** Thumbs-up "A/10". */
const ThumbUpHand = (p: Pose) => (
  <g transform={place(p)}>
    <Digit pts={[[-6, -12], [-6.5, -26]]} tone={p.tone ?? SKIN} />
    <rect x={-8.5} y={-16} width={17} height={16} rx={5.5} fill={p.tone ?? SKIN} stroke={INK} strokeWidth={2.4} />
    <path d="M-2 -16 V-11 M2 -16 V-11 M6 -15 V-11" stroke={INK} strokeWidth={1.6} />
  </g>
);
/** "Y": thumb and pinky out. */
const YHand = (p: Pose) => (
  <g transform={place(p)}>
    <Digit pts={[[5, -14], [10, -27]]} tone={p.tone ?? SKIN} />
    <Digit pts={[[-6, -8], [-17, -14]]} tone={p.tone ?? SKIN} />
    <rect x={-8} y={-16} width={16} height={16} rx={5.5} fill={p.tone ?? SKIN} stroke={INK} strokeWidth={2.4} />
    <path d="M-4 -16 V-11 M0 -16 V-11 M3.5 -16 V-11" stroke={INK} strokeWidth={1.6} />
  </g>
);
/** "1": index finger pointing. */
const IndexHand = (p: Pose) => (
  <g transform={place(p)}>
    <Digit pts={[[-4.5, -14], [-4.5, -31]]} tone={p.tone ?? SKIN} />
    <rect x={-8} y={-16} width={16} height={16} rx={5.5} fill={p.tone ?? SKIN} stroke={INK} strokeWidth={2.4} />
    <path d="M0 -16 V-11 M4 -16 V-11" stroke={INK} strokeWidth={1.6} />
    <Digit pts={[[-7.5, -7], [2, -9]]} w={4.2} tone={p.tone ?? SKIN} />
  </g>
);
/** Index + middle extended over the thumb (sign NO, open position). */
const NoHand = (p: Pose) => (
  <g transform={place(p)}>
    <Digit pts={[[-4.5, -14], [-6, -30]]} tone={p.tone ?? SKIN} />
    <Digit pts={[[-0.5, -15], [-1.5, -31]]} tone={p.tone ?? SKIN} />
    <Digit pts={[[-7, -8], [-13, -22]]} tone={p.tone ?? SKIN} />
    <rect x={-8} y={-16} width={16} height={16} rx={5.5} fill={p.tone ?? SKIN} stroke={INK} strokeWidth={2.4} />
    <path d="M3.5 -16 V-11" stroke={INK} strokeWidth={1.6} />
  </g>
);
/** Flattened "O", seen from the side: fingertips meet the thumb (pointing +x). */
const FlatOHand = (p: Pose) => (
  <g transform={place(p)}>
    <path d="M0 -8 L13 -9.5 Q21 -7 27 0 Q21 6 13 8.5 L0 7.5 Z" fill={p.tone ?? SKIN} stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
    <path d="M13 0.5 Q20 0 26 0" stroke={INK} strokeWidth={1.6} fill="none" />
  </g>
);
/** "C", seen from the side (opening points +x). */
const CHand = (p: Pose) => (
  <g transform={place(p)}>
    <path d="M14 -11 Q-1 -15 -1 0 Q-1 15 14 11" stroke={INK} strokeWidth={10} fill="none" strokeLinecap="round" />
    <path d="M14 -11 Q-1 -15 -1 0 Q-1 15 14 11" stroke={p.tone ?? SKIN} strokeWidth={6.6} fill="none" strokeLinecap="round" />
  </g>
);
/** Flat hand palm up, seen edge-on (a "table" for the other hand). */
const PalmUpHand = (p: Pose) => (
  <g transform={place(p)}>
    <path d="M0 -3 L30 -4.5 Q35 -4 35 0 Q35 3.5 30 3.5 L0 4 Z" fill={p.tone ?? SKIN2} stroke={INK} strokeWidth={2.4} strokeLinejoin="round" />
    <path d="M4 -3.4 Q2 -9 7 -10" stroke={INK} strokeWidth={6.6} fill="none" strokeLinecap="round" />
    <path d="M4 -3.4 Q2 -9 7 -10" stroke={p.tone ?? SKIN2} strokeWidth={3.8} fill="none" strokeLinecap="round" />
  </g>
);
/** Claw hand palm up, seen from the front: an open cup with curled fingertips. */
const ClawUpHand = (p: Pose) => (
  <g transform={place(p)}>
    <Digit pts={[[-9, -2], [-12, -12], [-8, -16]]} tone={p.tone ?? SKIN} />
    <Digit pts={[[-3, -3], [-4, -15], [0, -18]]} tone={p.tone ?? SKIN} />
    <Digit pts={[[3, -3], [4, -15], [7, -17]]} tone={p.tone ?? SKIN} />
    <Digit pts={[[9, -2], [12, -11], [14, -13]]} tone={p.tone ?? SKIN} />
    <ellipse cx={0} cy={0} rx={12} ry={6} fill={p.tone ?? SKIN} stroke={INK} strokeWidth={2.4} />
    <Digit pts={[[-11, 2], [-17, -4]]} tone={p.tone ?? SKIN} />
  </g>
);

/* ---------- movement marks ---------- */

function Arrow({ d, head }: { d: string; head: string }) {
  return (
    <g stroke={MOVE} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
      <path d={head} />
    </g>
  );
}

/** Small "contact / tap" marks around a point. */
function Taps({ x, y, r = 7 }: { x: number; y: number; r?: number }) {
  return (
    <g stroke={MOVE} strokeWidth={2.6} strokeLinecap="round">
      <path d={`M${x} ${y - r} v-4 M${x - r * 0.8} ${y - r * 0.6} l-3 -3 M${x + r * 0.8} ${y - r * 0.6} l3 -3`} />
    </g>
  );
}

function Frame({ children, eyesClosed }: { children: ReactElement | ReactElement[]; eyesClosed?: boolean }) {
  return (
    <g>
      <rect x={1} y={1} width={98} height={98} rx={14} fill="#F5FAFF" />
      <Signer eyesClosed={eyesClosed} />
      {children}
    </g>
  );
}

/* ---------- signs ---------- */

export interface AslSign {
  gloss: string;
  how: string;
  source: string;
  draw: () => ReactElement;
}

export const ASL_SIGNS: Record<string, AslSign> = {
  more: {
    gloss: 'MORE',
    how: 'Both hands in a flattened O (fingertips touching the thumb). Tap the fingertips of both hands together in front of the chest, a couple of times.',
    source: 'https://lifeprint.com/asl101/pages-signs/m/more.htm',
    draw: () => (
      <Frame>
        <FlatOHand x={24} y={74} />
        <FlatOHand x={76} y={74} flip tone={SKIN2} />
        <Taps x={50} y={70} />
      </Frame>
    ),
  },
  want: {
    gloss: 'WANT',
    how: 'Both hands open, palms up, fingers a little curved like claws. Pull both hands back toward your body while the fingers curl more.',
    source: 'https://lifeprint.com/asl101/pages-signs/w/want.htm',
    draw: () => (
      <Frame>
        <ClawUpHand x={22} y={84} />
        <ClawUpHand x={78} y={84} flip tone={SKIN2} />
        <Arrow d="M34 90 Q40 86 43 79" head="M38 80 L43 78 L45 83" />
        <Arrow d="M66 90 Q60 86 57 79" head="M62 80 L57 78 L55 83" />
      </Frame>
    ),
  },
  help: {
    gloss: 'HELP',
    how: 'Make a thumbs-up and rest it on the flat, palm-up other hand. Lift both hands up together.',
    source: 'https://lifeprint.com/asl101/pages-signs/h/help.htm',
    draw: () => (
      <Frame>
        <PalmUpHand x={64} y={86} flip tone={SKIN2} />
        <ThumbUpHand x={46} y={82} />
        <Arrow d="M70 78 V60" head="M65 65 L70 59 L75 65" />
      </Frame>
    ),
  },
  stop: {
    gloss: 'STOP',
    how: 'Hold one hand flat, palm up. Bring the edge of the other flat hand down onto it sharply, like a karate chop.',
    source: 'https://www.signingtime.com/dictionary/stop/',
    draw: () => (
      <Frame>
        <PalmUpHand x={72} y={90} flip tone={SKIN2} />
        <FlatHand x={42} y={66} rot={90} s={0.85} />
        <Arrow d="M28 60 V80" head="M23 75 L28 81 L33 75" />
        <g stroke={MOVE} strokeWidth={2.4} strokeLinecap="round">
          <path d="M44 82 l-4 -3 M66 82 l4 -3" />
        </g>
      </Frame>
    ),
  },
  'all-done': {
    gloss: 'ALL DONE (FINISHED)',
    how: 'Both hands open with fingers spread, palms toward you. Quickly twist the wrists so the palms turn to face out.',
    source: 'https://www.babysignlanguage.com/dictionary/all-done/',
    draw: () => (
      <Frame>
        <FiveHand x={30} y={92} s={0.95} rot={-8} />
        <FiveHand x={70} y={92} s={0.95} rot={8} flip tone={SKIN2} />
        <Arrow d="M12 66 Q8 56 16 50" head="M11 51 L16 49 L17 55" />
        <Arrow d="M88 66 Q92 56 84 50" head="M89 51 L84 49 L83 55" />
      </Frame>
    ),
  },
  please: {
    gloss: 'PLEASE',
    how: 'Put one flat hand on the middle of your chest and rub it in small circles.',
    source: 'https://www.lifeprint.com/asl101/pages-signs/p/please.htm',
    draw: () => (
      <Frame>
        <FlatHand x={47} y={92} s={0.95} rot={-10} />
        <Arrow d="M64 70 A15 13 0 1 1 52 58" head="M56 54 L52 58 L57 61" />
      </Frame>
    ),
  },
  'thank-you': {
    gloss: 'THANK YOU',
    how: 'Touch the fingertips of a flat hand to your chin, then move the hand forward and down toward the person, ending palm up.',
    source: 'https://signingtime.com/blogs/dictionary/thank',
    draw: () => (
      <Frame>
        <FlatHand x={40} y={66} s={0.8} rot={-6} />
        <Arrow d="M60 44 Q74 52 76 68" head="M71 64 L76 69 L80 63" />
      </Frame>
    ),
  },
  eat: {
    gloss: 'EAT',
    how: 'Make a flattened O (fingertips touching the thumb) and tap the fingertips to your lips a couple of times.',
    source: 'https://signingtime.com/blogs/dictionary/eat',
    draw: () => (
      <Frame>
        <FlatOHand x={22} y={34} rot={-12} />
        <Taps x={50} y={36} r={6} />
      </Frame>
    ),
  },
  drink: {
    gloss: 'DRINK',
    how: 'Shape one hand like a C as if holding a cup. Bring it to your mouth and tip it up, as if drinking.',
    source: 'https://signingtime.com/blogs/dictionary/drink',
    draw: () => (
      <Frame>
        <CHand x={30} y={34} rot={-20} />
        <Arrow d="M24 52 Q18 42 24 32" head="M20 35 L24 31 L28 35" />
      </Frame>
    ),
  },
  milk: {
    gloss: 'MILK',
    how: 'Hold one hand like a loose C and squeeze it closed into a fist, then open again — like milking a cow. Repeat.',
    source: 'https://www.ava.me/asl/milk',
    draw: () => (
      <Frame>
        <FistHand x={50} y={84} />
        <g stroke={MOVE} strokeWidth={2.6} strokeLinecap="round" fill="none">
          <path d="M36 68 Q33 74 36 80 M64 68 Q67 74 64 80" />
          <path d="M31 66 Q27 74 31 82 M69 66 Q73 74 69 82" />
        </g>
      </Frame>
    ),
  },
  mom: {
    gloss: 'MOM',
    how: 'Open hand with fingers spread. Touch the thumb to your chin (often tapped twice).',
    source: 'https://www.lifeprint.com/asl101//pages-signs/m/mom.htm',
    draw: () => (
      <Frame>
        <FiveHand x={38} y={56} s={0.8} rot={-25} flip />
        <Taps x={52} y={43} r={4} />
      </Frame>
    ),
  },
  dad: {
    gloss: 'DAD',
    how: 'Open hand with fingers spread. Touch the thumb to your forehead (often tapped twice).',
    source: 'https://www.lifeprint.com/asl101//pages-signs/d/dad.htm',
    draw: () => (
      <Frame>
        <FiveHand x={36} y={30} s={0.68} rot={-40} flip />
        <Taps x={54} y={12} r={3} />
      </Frame>
    ),
  },
  yes: {
    gloss: 'YES',
    how: 'Make a fist and nod it up and down at the wrist, like a head nodding.',
    source: 'https://www.ndsd.nd.gov/sites/www/files/documents/Outreach/Adult/Medical%20Signs%20Booklet.pdf',
    draw: () => (
      <Frame>
        <FistHand x={28} y={80} s={1.1} />
        <Arrow d="M44 58 Q50 64 44 72" head="M41 68 L44 73 L48 69" />
        <Arrow d="M44 72 Q38 64 44 58" head="M40 60 L44 57 L47 61" />
      </Frame>
    ),
  },
  no: {
    gloss: 'NO',
    how: 'Hold the index and middle fingers out above the thumb, then snap them down to touch the thumb.',
    source: 'https://www.hdilearning.org/wp-content/uploads/2023/12/ECE-130-ASL-Basic-Signs.pdf',
    draw: () => (
      <Frame>
        <NoHand x={30} y={88} s={1.05} rot={-20} />
        <Arrow d="M40 54 Q48 58 46 66" head="M42 63 L46 67 L50 62" />
      </Frame>
    ),
  },
  sleep: {
    gloss: 'SLEEP',
    how: 'Open hand in front of your face, palm toward you. Move it down past your chin while closing the fingers to touch the thumb — and close your eyes.',
    source: 'https://www.brainscape.com/flashcards/15370507/packs/21875347',
    draw: () => (
      <Frame eyesClosed>
        <FiveHand x={24} y={50} s={0.75} rot={10} tone="rgba(244,199,161,0.92)" />
        <Arrow d="M10 22 V44" head="M5 39 L10 45 L15 39" />
      </Frame>
    ),
  },
  play: {
    gloss: 'PLAY',
    how: 'Both hands in a Y shape (thumb and pinky out). Shake or twist them back and forth at the wrists.',
    source: 'https://signingtime.com/blogs/dictionary/play',
    draw: () => (
      <Frame>
        <YHand x={28} y={90} />
        <YHand x={72} y={90} flip tone={SKIN2} />
        <Arrow d="M14 62 Q20 56 26 62" head="M23 58 L26 62 L21 63" />
        <Arrow d="M86 62 Q80 56 74 62" head="M77 58 L74 62 L79 63" />
      </Frame>
    ),
  },
  hurt: {
    gloss: 'HURT',
    how: 'Point both index fingers toward each other and jab them toward each other a couple of times (near where it hurts).',
    source: 'https://www.ndsd.nd.gov/sites/www/files/documents/Outreach/Adult/Medical%20Signs%20Booklet.pdf',
    draw: () => (
      <Frame>
        <IndexHand x={24} y={80} rot={70} />
        <IndexHand x={76} y={80} rot={-70} flip tone={SKIN2} />
        <g stroke={MOVE} strokeWidth={2.6} strokeLinecap="round">
          <path d="M50 58 v6 M44 60 l2 4 M56 60 l-2 4" />
        </g>
      </Frame>
    ),
  },
};

export const ASL_KEYS = Object.keys(ASL_SIGNS);

export function AslSignSvg({ name, title }: { name: string; title?: string }) {
  const sign = ASL_SIGNS[name];
  if (!sign) return null;
  return (
    <svg viewBox="0 0 100 100" className="symbol-svg asl-svg" role="img" aria-label={title ?? `ASL sign: ${sign.gloss}`}>
      {sign.draw()}
    </svg>
  );
}
