import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import { centeredCrop, cropForRegion, regionCenter } from './scanRegion.js';

// The default loader fetches the .wasm from a CDN, which an offline PWA can't reach.
prepareZXingModule({
  overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
});

// Each extra format costs decode time on every frame, and the 2D ones (QR, DataMatrix)
// are the most expensive, so only the formats found on retail goods and shelf labels.
// The on-screen frame keeps barcodes horizontal and upright, so rotation and inverted
// (light-on-dark) passes are wasted work. tryHarder stays on: it scans many more rows
// across the barcode, which is what finds a clean row in blurry, noisy low-light frames.
const READER_OPTIONS = {
  formats: ['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E', 'Code128', 'Code39', 'ITF'],
  tryHarder: true,
  tryRotate: false,
  tryInvert: false,
  maxNumberOfSymbols: 1,
};

// A code counts as a new scan once it has been out of view this long, so the same
// item can be scanned again quickly without a held barcode adding itself repeatedly.
const REAPPEAR_MS = 500;

// Re-aim focus and exposure only when the frame has moved this far (as a share of the
// stream), since each applyConstraints call can make the camera refocus.
const POINT_MOVE = 0.02;

const SIZE = { width: { ideal: 1280 }, height: { ideal: 720 } };

/**
 * Streams the rear camera into `video` and calls `onCode(text)` each time a barcode
 * comes into view inside `region`, the on-screen frame element (the middle of the
 * stream when omitted). Focus and exposure are aimed at `region` where the browser
 * supports it. Returns { stop, setTorch, torchSupported }.
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
  const canAim = !!navigator.mediaDevices.getSupportedConstraints?.().pointsOfInterest;
  let point = null;
  let torchOn = false;

  // Separate advanced sets so a device that rejects one still gets the others.
  // applyConstraints replaces earlier constraints, so every call sends the full set.
  function constraints() {
    const sets = [];
    if (caps.focusMode?.includes('continuous')) sets.push({ focusMode: 'continuous' });
    if (point) sets.push({ pointsOfInterest: [point] });
    if (caps.torch) sets.push({ torch: torchOn });
    return { ...SIZE, advanced: sets };
  }

  if (caps.focusMode?.includes('continuous')) await track.applyConstraints(constraints()).catch(() => {});

  function aimAt(view, box, vw, vh) {
    const next = regionCenter(view, box, vw, vh);
    if (!next) return;
    if (point && Math.abs(next.x - point.x) < POINT_MOVE && Math.abs(next.y - point.y) < POINT_MOVE) return;
    point = next;
    track.applyConstraints(constraints()).catch(() => {});
  }

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
        let crop;
        if (region) {
          const view = video.getBoundingClientRect();
          const box = region.getBoundingClientRect();
          crop = cropForRegion(view, box, vw, vh);
          if (canAim) aimAt(view, box, vw, vh);
        } else {
          crop = centeredCrop(vw, vh);
        }
        const { x, y, w, h } = crop;
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
      if (!caps.torch) return;
      const was = torchOn;
      torchOn = on;
      await track.applyConstraints(constraints()).catch((e) => {
        torchOn = was;
        throw e;
      });
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
