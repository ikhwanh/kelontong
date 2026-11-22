// Room around the on-screen frame: 1D barcodes need blank quiet zones beside the bars
// (about 10% of the width on each side for EAN-13), which sit outside the frame when
// the bars fill it.
const MARGIN_X = 0.1;
const MARGIN_Y = 0.05;

// On large screens the video is scaled up, so the frame covers few camera pixels and a
// barcode that fits inside it is too small to read. Decoding at least this share of the
// stream width lets the cashier hold the barcode closer, past the frame's edges.
const MIN_WIDTH = 0.6;

function clamp(v, lo, hi) {
  return Math.min(Math.max(v, lo), hi);
}

export function centeredCrop(vw, vh) {
  const w = Math.round(vw * 0.8), h = Math.round(Math.min(vh * 0.6, w * 0.65));
  return { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w, h };
}

/**
 * Maps the on-screen frame (`region`, a client rect) onto the camera stream's pixels,
 * for a <video> of client rect `view` showing a `vw`×`vh` stream with object-fit: cover.
 */
export function cropForRegion(view, region, vw, vh) {
  if (!view.width || !view.height || !region.width || !region.height) return centeredCrop(vw, vh);
  const scale = Math.max(view.width / vw, view.height / vh);
  const left = view.left + (view.width - vw * scale) / 2;
  const top = view.top + (view.height - vh * scale) / 2;
  const cx = (region.left + region.width / 2 - left) / scale;
  const cy = (region.top + region.height / 2 - top) / scale;
  const w = Math.min(vw, Math.max((region.width / scale) * (1 + 2 * MARGIN_X), vw * MIN_WIDTH));
  const h = Math.min(vh, (region.height / scale) * (1 + 2 * MARGIN_Y));
  const x = clamp(cx - w / 2, 0, vw - w);
  const y = clamp(cy - h / 2, 0, vh - h);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}
