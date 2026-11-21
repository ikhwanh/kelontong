export const MILLI = 1000;

export function formatQty(milli) {
  const sign = milli < 0 ? '−' : '';
  const abs = Math.abs(milli);
  const whole = Math.trunc(abs / MILLI);
  const frac = abs % MILLI;
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (!frac) return sign + wholeStr;
  return sign + wholeStr + ',' + String(frac).padStart(3, '0').replace(/0+$/, '');
}

export function formatQtyUnit(milli, unit, decimal) {
  return decimal ? formatQty(milli) + ' ' + unit : formatQty(milli);
}

export function formatSignedQty(milli) {
  return (milli > 0 ? '+' : '') + formatQty(milli);
}

// "1,5" / "1.5" / "12" → thousandths. Returns null when the text isn't a quantity
// with at most three decimals.
export function parseQty(text) {
  if (typeof text === 'number') {
    const m = Math.round(text * MILLI);
    return Math.abs(m - text * MILLI) < 1e-6 ? m : null;
  }
  const s = String(text ?? '').trim().replace(/\s/g, '');
  if (s === '') return null;
  const m = /^(-?)(\d*)(?:[.,](\d{0,3}))?$/.exec(s);
  if (!m || (m[2] === '' && !m[3])) return null;
  const whole = parseInt(m[2] || '0', 10);
  const frac = parseInt((m[3] || '').padEnd(3, '0') || '0', 10);
  const v = whole * MILLI + frac;
  return m[1] ? -v : v;
}

export function qtyToInput(milli) {
  return formatQty(milli).replace(/\./g, '');
}

export function isWholeMilli(milli) {
  return milli % MILLI === 0;
}
