import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { centeredCrop, cropForRegion } from './scanRegion.js';

// The default loader fetches the .wasm from a CDN, which an offline PWA can't reach.
prepareZXingModule({
  overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
});

// Each extra format costs decode time on every frame, and the 2D ones (QR, DataMatrix)
// are the most expensive, so only the formats found on retail goods and shelf labels.
// The on-screen frame keeps barcodes horizontal and upright, so rotation and inverted
// (light-on-dark) passes are wasted work.
const READER_OPTIONS = {
  formats: ['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E', 'Code128', 'Code39', 'ITF'],
  tryHarder: false,
  tryRotate: false,
  tryInvert: false,
  maxNumberOfSymbols: 1,
};

// A code counts as a new scan once it has been out of view this long, so the same
// item can be scanned again quickly without a held barcode adding itself repeatedly.
const REAPPEAR_MS = 500;

// Many phones' main lens can't focus closer than ~10 cm; a little zoom lets the
// cashier hold the phone further back where the barcode is sharp.
const PREFERRED_ZOOM = 1.5;

const SIZE = { width: { ideal: 1280 }, height: { ideal: 720 } };

function cameraTuning(caps) {
  const sets = [];
  if (caps.focusMode?.includes('continuous')) sets.push({ focusMode: 'continuous' });
  if (caps.zoom && caps.zoom.max >= PREFERRED_ZOOM) {
    sets.push({ zoom: Math.max(caps.zoom.min, PREFERRED_ZOOM) });
  }
  return sets;
}

/**
 * Streams the rear camera into `video` and calls `onCode(text)` each time a barcode
 * comes into view inside `region`, the on-screen frame element (the middle of the
 * stream when omitted). Returns { stop, setTorch, torchSupported }.
 */
export async function startCamera(video, onCode, { region } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, ...SIZE },
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();

  const track = stream.getVideoTracks()[0];
  const caps = track.getCapabilities?.() || {};
  // Separate advanced sets so a device that rejects one (e.g. zoom) still gets the other.
  // applyConstraints replaces earlier constraints, so the torch call re-sends these too.
  const tuning = cameraTuning(caps);
  if (tuning.length) await track.applyConstraints({ ...SIZE, advanced: tuning }).catch(() => {});

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const lastSeen = new Map();
  const useFrameCallback = 'requestVideoFrameCallback' in video;
  let running = true;
  let handle = 0;

  function schedule() {
    if (!running) return;
    handle = useFrameCallback ? video.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
  }

  function report(code) {
    const now = performance.now();
    const prev = lastSeen.get(code);
    lastSeen.set(code, now);
    for (const [c, t] of lastSeen) if (now - t > REAPPEAR_MS) lastSeen.delete(c);
    if (prev === undefined || now - prev > REAPPEAR_MS) onCode(code);
  }

  async function tick() {
    if (!running) return;
    if (video.readyState >= 2 && video.videoWidth) {
      try {
        // Decode only what's under the on-screen frame; it's faster and avoids picking up
        // a neighbouring product's barcode. Measured every frame because the frame moves
        // when the panel below it grows or the phone rotates.
        const vw = video.videoWidth, vh = video.videoHeight;
        const { x, y, w, h } = region
          ? cropForRegion(video.getBoundingClientRect(), region.getBoundingClientRect(), vw, vh)
          : centeredCrop(vw, vh);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        ctx.drawImage(video, x, y, w, h, 0, 0, w, h);
        const results = await readBarcodes(ctx.getImageData(0, 0, w, h), READER_OPTIONS);
        const hit = results.find((r) => r.isValid && r.text);
        if (hit && running) report(hit.text.trim());
      } catch {
        /* a frame that fails to decode is normal */
      }
    }
    schedule();
  }
  schedule();

  return {
    torchSupported: !!caps.torch,
    async setTorch(on) {
      if (caps.torch) await track.applyConstraints({ ...SIZE, advanced: [...tuning, { torch: on }] });
    },
    stop() {
      running = false;
      if (useFrameCallback) video.cancelVideoFrameCallback(handle);
      else cancelAnimationFrame(handle);
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}
