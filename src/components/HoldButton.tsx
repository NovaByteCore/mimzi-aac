import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  onHold: () => void;
  holdMs?: number;
  className?: string;
  label: string;
  children: ReactNode;
}

/**
 * A button that only fires after being held down (pointer, or Enter/Space for keyboard
 * and switch users). Stops quick toddler taps from opening grown-up screens.
 */
export function HoldButton({ onHold, holdMs = 1500, className, label, children }: Props) {
  const [progress, setProgress] = useState(0);
  const start = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const fired = useRef(false);

  const stop = () => {
    start.current = null;
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = null;
    setProgress(0);
  };

  const tick = () => {
    if (start.current === null) return;
    const p = Math.min(1, (performance.now() - start.current) / holdMs);
    setProgress(p);
    if (p >= 1) {
      if (!fired.current) {
        fired.current = true;
        stop();
        onHold();
      }
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };

  const begin = () => {
    if (start.current !== null) return;
    fired.current = false;
    start.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => stop(), []);

  return (
    <button
      type="button"
      className={`hold-btn ${className ?? ''}`}
      aria-label={label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        begin();
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={stop}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          begin();
        }
      }}
      onKeyUp={stop}
      onContextMenu={(e) => e.preventDefault()}
      style={{ ['--hold' as string]: progress }}
    >
      {children}
      <span className="hold-ring" aria-hidden="true" />
    </button>
  );
}
