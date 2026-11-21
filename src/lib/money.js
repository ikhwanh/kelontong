export function groupThousands(n) {
  const sign = n < 0 ? '-' : '';
  return sign + Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function formatRp(n) {
  const v = Math.round(n || 0);
  return (v < 0 ? '− Rp ' : 'Rp ') + groupThousands(Math.abs(v));
}

export function formatMinusRp(n) {
  return n > 0 ? '− ' + formatRp(n) : formatRp(0);
}

// Accepts "12.500", "12500", "Rp 12.500". Returns null when the text holds anything
// other than a whole rupiah amount (a decimal comma, letters), so imports can flag it.
export function parseRupiah(text) {
  if (typeof text === 'number') return Number.isInteger(text) ? text : null;
  const s = String(text ?? '').trim().replace(/^rp\.?\s*/i, '');
  if (s === '') return null;
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) return parseInt(s.replace(/\./g, ''), 10);
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  return null;
}

export function shortRp(n) {
  return n >= 1000 && n % 1000 === 0 ? groupThousands(n / 1000) + 'k' : formatRp(n);
}

export function compactRp(n) {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2).replace('.', ',') + ' jt';
  if (Math.abs(n) >= 1000) return Math.round(n / 1000) + 'k';
  return String(n);
}
