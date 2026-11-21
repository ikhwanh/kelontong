import { reactive } from 'vue';

export const toasts = reactive([]);
let seq = 0;

export function toast(message, { type = 'info', action = null, timeout = 3500 } = {}) {
  const id = ++seq;
  toasts.push({ id, message, type, action });
  if (timeout) setTimeout(() => dismissToast(id), timeout);
  return id;
}

export function dismissToast(id) {
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}

export function errorToast(e) {
  toast(e?.message || String(e), { type: 'error', timeout: 5000 });
}

let audio;
export function beep(ok = true) {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = ok ? 1760 : 220;
    osc.type = ok ? 'sine' : 'square';
    gain.gain.value = 0.08;
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + (ok ? 0.09 : 0.25));
  } catch {
    /* audio is optional */
  }
}
