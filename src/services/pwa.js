import { reactive } from 'vue';
import { registerSW } from 'virtual:pwa-register';

export const pwa = reactive({
  standalone: false,
  platform: 'other', // 'ios' | 'android' | 'desktop' | 'other'
  installPrompt: null,
  installed: false,
  needRefresh: false,
});

let updateSW = null;

function detectPlatform() {
  const ua = navigator.userAgent;
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  if (/iPad|iPhone|iPod/.test(ua) || iPadOS) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Windows|Macintosh|Linux|CrOS/.test(ua)) return 'desktop';
  return 'other';
}

export function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    navigator.standalone === true
  );
}

export function initPwa() {
  pwa.platform = detectPlatform();
  pwa.standalone = isStandalone();
  window.matchMedia('(display-mode: standalone)').addEventListener('change', () => (pwa.standalone = isStandalone()));
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pwa.installPrompt = e;
  });
  window.addEventListener('appinstalled', () => {
    pwa.installed = true;
    pwa.installPrompt = null;
  });
  if ('serviceWorker' in navigator) {
    updateSW = registerSW({
      onNeedRefresh() {
        pwa.needRefresh = true;
      },
      onRegisteredSW(_url, reg) {
        if (reg) setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      },
    });
  }
}

export async function promptInstall() {
  const e = pwa.installPrompt;
  if (!e) return false;
  e.prompt();
  const choice = await e.userChoice;
  pwa.installPrompt = null;
  if (choice.outcome === 'accepted') pwa.installed = true;
  return choice.outcome === 'accepted';
}

export async function applyUpdate() {
  if (updateSW) await updateSW(true);
  else location.reload();
}
