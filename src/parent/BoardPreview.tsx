import { useLayoutEffect, useRef, useState } from 'react';

type Shape = 'sideways' | 'upright';
const SIZES: Record<Shape, { w: number; h: number }> = {
  // An 8" Android tablet (onn), in CSS pixels.
  sideways: { w: 960, h: 600 },
  upright: { w: 600, h: 960 },
};

const KEY = 'mimzi:boardPreview';
function load(): { open: boolean; shape: Shape } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && typeof v.open === 'boolean' && (v.shape === 'sideways' || v.shape === 'upright')) return v;
  } catch {
    /* storage unavailable */
  }
  return { open: true, shape: 'sideways' };
}

/**
 * Live, look-only preview of the child's Talk board inside Parent Mode. It shows `page`
 * (the page being edited) and refreshes by itself after every change.
 */
export function BoardPreview({ page }: { page?: string }) {
  const [state, setState] = useState(load);
  const save = (next: typeof state) => {
    setState(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };
  const box = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.5);
  const size = SIZES[state.shape];

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const avail = el.clientWidth;
      const maxH = state.shape === 'upright' ? 420 : 340;
      if (avail > 0) setScale(Math.min(avail / size.w, maxH / size.h, 1));
    };
    fit();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [state.open, state.shape, size.w, size.h]);

  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  const src = `${base}?preview=1${page ? `&page=${encodeURIComponent(page)}` : ''}`;

  return (
    <section className="board-preview" data-testid="board-preview">
      <div className="board-preview-bar">
        <strong>Board preview</strong>
        {state.open && (
          <div className="seg" role="group" aria-label="Tablet direction">
            {(['sideways', 'upright'] as Shape[]).map((s) => (
              <button key={s} type="button" className={`seg-btn${state.shape === s ? ' seg-on' : ''}`} aria-pressed={state.shape === s} onClick={() => save({ ...state, shape: s })}>
                {s === 'sideways' ? 'Sideways' : 'Upright'}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="btn btn-quiet" onClick={() => save({ ...state, open: !state.open })} aria-expanded={state.open} data-testid="board-preview-toggle">
          {state.open ? 'Hide' : 'Show'}
        </button>
      </div>
      {state.open && (
        <div ref={box} className="board-preview-box" style={{ height: size.h * scale }}>
          <iframe
            key={`${state.shape}-${page ?? ''}`}
            title="Board preview (look only)"
            src={src}
            tabIndex={-1}
            style={{ width: size.w, height: size.h, transform: `scale(${scale})`, transformOrigin: 'top left' }}
            data-testid="board-preview-frame"
          />
        </div>
      )}
    </section>
  );
}
