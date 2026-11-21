import { onMounted, onBeforeUnmount } from 'vue';

const MAX_GAP_MS = 40;
const MIN_LENGTH = 4;

/**
 * Hand scanners in keyboard mode type the code very fast and end with Enter. Treat
 * such a burst as a scan even when no input has focus. Inputs keep their own typing;
 * an input marked data-scan-target handles Enter itself.
 */
export function useHandScanner(onScan) {
  let buffer = '';
  let last = 0;

  function onKeydown(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
    if (document.querySelector('.sheet-wrap')) return;
    const now = performance.now();
    if (now - last > MAX_GAP_MS) buffer = '';
    last = now;
    if (e.key === 'Enter') {
      if (buffer.length >= MIN_LENGTH) {
        // Without this, Enter would also click whatever button has focus.
        e.preventDefault();
        e.stopPropagation();
        const code = buffer;
        buffer = '';
        onScan(code);
      }
      buffer = '';
      return;
    }
    if (e.key.length === 1) {
      buffer += e.key;
      if (buffer.length > 1) e.preventDefault();
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown, true));
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true));
}
