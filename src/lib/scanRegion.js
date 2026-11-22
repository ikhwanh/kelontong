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

function hasSize(r) {
  return r.width > 0 && r.height > 0;
}

/** Position and size of `region` in stream pixels, for a cover-fitted <video> at `view`. */
function regionInStream(view, region, vw, vh) {
  const scale = Math.max(view.width / vw, view.height / vh);
  const left = view.left + (view.width - vw * scale) / 2;
  const top = view.top + (view.height - vh * scale) / 2;
  return {
    cx: (region.left + region.width / 2 - left) / scale,
    cy: (region.top + region.height / 2 - top) / scale,
    w: region.width / scale,
    h: region.height / scale,
  };
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
  if (!hasSize(view) || !hasSize(region)) return centeredCrop(vw, vh);
  const r = regionInStream(view, region, vw, vh);
  const w = Math.min(vw, Math.max(r.w * (1 + 2 * MARGIN_X), vw * MIN_WIDTH));
  const h = Math.min(vh, r.h * (1 + 2 * MARGIN_Y));
  const x = clamp(r.cx - w / 2, 0, vw - w);
  const y = clamp(r.cy - h / 2, 0, vh - h);
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** Center of the on-screen frame as a 0–1 point in the stream, the form `pointsOfInterest` takes. */
export function regionCenter(view, region, vw, vh) {
  if (!hasSize(view) || !hasSize(region)) return null;
  const r = regionInStream(view, region, vw, vh);
  return { x: clamp(r.cx / vw, 0, 1), y: clamp(r.cy / vh, 0, 1) };
}
