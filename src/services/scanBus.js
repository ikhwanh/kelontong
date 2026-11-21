// Hands a camera-scanned code back to the screen that opened the scanner in capture mode.
let pending = null;

export function setCapturedCode(code) {
  pending = code;
}

export function takeCapturedCode() {
  const c = pending;
  pending = null;
  return c;
}
