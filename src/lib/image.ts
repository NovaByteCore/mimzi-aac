/*
 * Photo crop maths + rendering. Photos are cropped to a square, resized to 640 px and
 * stored as JPEG in IndexedDB on the device. Nothing is uploaded.
 */
export const OUTPUT_SIZE = 640;

export interface CropState {
  zoom: number; // 1 = photo fills the square
  offsetX: number; // px in viewport space
  offsetY: number;
}

/** Smallest zoom: the whole photo fits inside the square (no cropping at all). */
export function minZoom(w: number, h: number): number {
  return Math.min(w, h) / Math.max(w, h);
}

export function drawRect(w: number, h: number, viewport: number, crop: CropState) {
  const scale = (viewport / Math.min(w, h)) * crop.zoom;
  const dw = w * scale;
  const dh = h * scale;
  return { x: (viewport - dw) / 2 + crop.offsetX, y: (viewport - dh) / 2 + crop.offsetY, w: dw, h: dh };
}

/** Keep the photo from being dragged out of the square. */
export function clampCrop(w: number, h: number, viewport: number, crop: CropState): CropState {
  const zoom = Math.min(4, Math.max(minZoom(w, h), crop.zoom));
  const { w: dw, h: dh } = drawRect(w, h, viewport, { zoom, offsetX: 0, offsetY: 0 });
  const maxX = Math.abs(dw - viewport) / 2;
  const maxY = Math.abs(dh - viewport) / 2;
  return {
    zoom,
    offsetX: Math.min(maxX, Math.max(-maxX, crop.offsetX)),
    offsetY: Math.min(maxY, Math.max(-maxY, crop.offsetY)),
  };
}

export function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That picture could not be opened. Try a JPEG or PNG photo.'));
    };
    img.src = url;
  });
}

export function renderCrop(img: HTMLImageElement, viewport: number, crop: CropState): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Could not prepare the photo.'));
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  ctx.imageSmoothingQuality = 'high';
  const r = drawRect(img.naturalWidth, img.naturalHeight, viewport, crop);
  const f = OUTPUT_SIZE / viewport;
  ctx.drawImage(img, r.x * f, r.y * f, r.w * f, r.h * f);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save the photo.'))), 'image/jpeg', 0.86),
  );
}
