/** Simple line icons for the child screens (no emoji, consistent with AAC symbol styling). */
const PATHS: Record<string, string> = {
  back: 'M15 5l-7 7 7 7',
  home: 'M4 11l8-7 8 7M6 9.5V20h4.5v-5h3v5H18V9.5',
  talk: 'M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  day: 'M5 6h14v14H5zM5 10h14M9 3v5M15 3v5',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z',
  people: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3.5 20a5.5 5.5 0 0 1 11 0M16.5 11a2.5 2.5 0 1 0 0-5M17 14.5a4.5 4.5 0 0 1 3.5 4.5',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  speak: 'M4 9.5h4l5-4v13l-5-4H4zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  backspace: 'M9 5h11v14H9l-6-7zM12.5 9.5l5 5M17.5 9.5l-5 5',
  close: 'M6 6l12 12M18 6L6 18',
  prev: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  play: 'M8 5l11 7-11 7z',
  pause: 'M8 5v14M16 5v14',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  reset: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5',
  arrowRight: 'M4 12h15M13 6l6 6-6 6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  steps: 'M4 6h4v4H4zM10 8h10M4 14h4v4H4zM10 16h10',
  heart: 'M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z',
  circle: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z',
  camera: 'M4 8h3.5l1.5-2.5h6L16.5 8H20v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15.5 9.5h.01',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  copy: 'M8 8h11v11H8zM5 16V5h11',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  unlock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 6.8-1.2',
  cloud: 'M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z',
  device: 'M7 3h10v18H7zM11 18h2',
  warn: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  sprout: 'M12 20v-8M12 12c0-4 3-6 7-6 0 4-3 6-7 6zM12 14c0-3-2.5-5-6-5 0 3 2.5 5 6 5z',
};

export function Icon({ name, size = 22 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg className="ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}

/** Filled token shapes for the reward board. */
export function TokenShape({ style, filled, color }: { style: 'star' | 'check' | 'circle' | 'heart' | 'dot'; filled: boolean; color?: string }) {
  const c = color || '#d9a400';
  const common = { width: '100%', height: '100%', viewBox: '0 0 24 24', 'aria-hidden': true, focusable: 'false' } as const;
  if (!filled) return <svg {...common} className="token-shape" />;
  if (style === 'check')
    return (
      <svg {...common} className="token-shape">
        <circle cx="12" cy="12" r="10" fill={c} />
        <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (style === 'circle')
    return (
      <svg {...common} className="token-shape">
        <circle cx="12" cy="12" r="9.5" fill={c} />
      </svg>
    );
  if (style === 'dot')
    return (
      <svg {...common} className="token-shape">
        <circle cx="12" cy="12" r="5.5" fill={c} />
      </svg>
    );
  return (
    <svg {...common} className="token-shape">
      <path d={PATHS[style === 'heart' ? 'heart' : 'star']} fill={c} stroke={c} strokeWidth={1} strokeLinejoin="round" />
    </svg>
  );
}
