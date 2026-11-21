import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

// The default loader fetches the .wasm from a CDN, which an offline PWA can't reach.
prepareZXingModule({
  overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
});

const READER_OPTIONS = {
  formats: ['EAN-13', 'EAN-8', 'UPC-A', 'UPC-E', 'Code128', 'Code39', 'Code93', 'ITF', 'Codabar', 'QRCode', 'DataMatrix'],
  tryHarder: true,
  maxNumberOfSymbols: 1,
};

/**
 * Streams the rear camera into `video` and calls `onCode(text)` for each decoded barcode.
 * Returns { stop, setTorch, torchSupported }.
 */
export async function startCamera(video, onCode) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();

  const track = stream.getVideoTracks()[0];
  const caps = track.getCapabilities?.() || {};
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let running = true;
  let busy = false;
  let timer = null;

  async function tick() {
    if (!running) return;
    if (!busy && video.readyState >= 2 && video.videoWidth) {
      busy = true;
      try {
        // Decode only the middle band, where the on-screen frame is; it's faster and
        // avoids picking up a neighbouring product's barcode.
        const vw = video.videoWidth, vh = video.videoHeight;
        const w = Math.round(vw * 0.8), h = Math.round(Math.min(vh * 0.6, w * 0.65));
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, (vw - w) / 2, (vh - h) / 2, w, h, 0, 0, w, h);
        const results = await readBarcodes(ctx.getImageData(0, 0, w, h), READER_OPTIONS);
        const hit = results.find((r) => r.isValid && r.text);
        if (hit && running) onCode(hit.text.trim());
      } catch {
        /* a frame that fails to decode is normal */
      } finally {
        busy = false;
      }
    }
    timer = setTimeout(tick, 120);
  }
  tick();

  return {
    torchSupported: !!caps.torch,
    async setTorch(on) {
      if (caps.torch) await track.applyConstraints({ advanced: [{ torch: on }] });
    },
    stop() {
      running = false;
      clearTimeout(timer);
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}
