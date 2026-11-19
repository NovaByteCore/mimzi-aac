import { useEffect, useRef, useState } from 'react';
import { clampCrop, drawRect, loadImage, minZoom, renderCrop, type CropState } from '../lib/image';

interface Props {
  file: Blob;
  onDone: (blob: Blob) => void;
  onCancel: () => void;
}

const VIEWPORT = 280;

export function PhotoCropper({ file, onDone, onCancel }: Props) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState('');
  const [crop, setCrop] = useState<CropState>({ zoom: 1, offsetX: 0, offsetY: 0 });
  const [saving, setSaving] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    let alive = true;
    let url: string | undefined;
    loadImage(file).then(
      (i) => {
        url = i.src;
        if (alive) setImg(i);
      },
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  if (error) {
    return (
      <div className="cropper">
        <p role="alert">{error}</p>
        <button type="button" className="btn" onClick={onCancel}>
          Back
        </button>
      </div>
    );
  }
  if (!img) return <p className="muted">Opening photo…</p>;

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const rect = drawRect(w, h, VIEWPORT, crop);
  const set = (next: CropState) => setCrop(clampCrop(w, h, VIEWPORT, next));
  const fitZoom = minZoom(w, h);

  return (
    <div className="cropper">
      <p className="muted">Drag to move. Use the slider to zoom. Keep the whole object visible so it’s easy to recognise.</p>
      <div
        className="crop-viewport"
        style={{ width: VIEWPORT, height: VIEWPORT }}
        data-testid="crop-viewport"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX, y: e.clientY, ox: crop.offsetX, oy: crop.offsetY };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          set({ ...crop, offsetX: drag.current.ox + e.clientX - drag.current.x, offsetY: drag.current.oy + e.clientY - drag.current.y });
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        <img src={img.src} alt="Photo being positioned" draggable={false} style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />
      </div>
      <label className="field">
        <span>Zoom</span>
        <input
          type="range"
          min={fitZoom}
          max={4}
          step={0.01}
          value={crop.zoom}
          onChange={(e) => set({ ...crop, zoom: Number(e.target.value) })}
        />
      </label>
      <div className="row">
        <button type="button" className="btn btn-quiet" onClick={() => set({ zoom: fitZoom, offsetX: 0, offsetY: 0 })}>
          Show whole photo
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => set({ zoom: 1, offsetX: 0, offsetY: 0 })}>
          Fill square
        </button>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              onDone(await renderCrop(img, VIEWPORT, crop));
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not save the photo.');
            } finally {
              setSaving(false);
            }
          }}
        >
          Use photo
        </button>
      </div>
    </div>
  );
}
