import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  /** Runs after a press-and-hold (pointer, or holding Enter/Space). */
  onHold: () => void;
  /**
   * Runs on standard activation: a tap/click, a quick Enter/Space press, or a screen-reader
   * "activate". Never runs as well as `onHold` for the same press.
   */
  onTap?: () => void;
  holdMs?: number;
  className?: string;
  label: string;
  children: ReactNode;
}

/**
 * A button with a press-and-hold shortcut. Holding fires `onHold`; a normal activation fires
 * `onTap` (for example opening the PIN gate, or showing how to reach grown-up controls), so the
 * control never depends on a sustained hold.
 */
export function HoldButton({ onHold, onTap, holdMs = 1500, className, label, children }: Props) {
  const [progress, setProgress] = useState(0);
  const start = useRef<number | null>(null);
  const raf = useRef<number | null>(null);
  const fired = useRef(false);
  const keyDown = useRef(false);

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
      onClick={() => {
        // Pointer taps and assistive-technology activation arrive here. A completed hold
        // already ran onHold, so its trailing click is ignored.
        if (fired.current) {
          fired.current = false;
          return;
        }
        onTap?.();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); // handled here and on key-up (no synthetic click)
          if (!keyDown.current) {
            keyDown.current = true;
            begin();
          }
        }
      }}
      onKeyUp={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        keyDown.current = false;
        const held = fired.current;
        stop();
        fired.current = false;
        if (!held) onTap?.();
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{ ['--hold' as string]: progress }}
    >
      {children}
      <span className="hold-ring" aria-hidden="true" />
    </button>
  );
}
