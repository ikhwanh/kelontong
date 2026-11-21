const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const pad = (n) => String(n).padStart(2, '0');

export function tzOffsetMin(date = new Date()) {
  return -date.getTimezoneOffset();
}

export function startOfLocalDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function addDays(ms, days) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

export function hhmm(ms) {
  const d = new Date(ms);
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

export function dayMonth(ms) {
  const d = new Date(ms);
  return d.getDate() + ' ' + MON[d.getMonth()];
}

export function longDateTime(ms) {
  const d = new Date(ms);
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}, ${hhmm(ms)}`;
}

export function shortDate(ms) {
  const d = new Date(ms);
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
}

export function numericDateTime(ms) {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${hhmm(ms)}`;
}

export function isoDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseIsoDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

export function fileStamp(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export function relativeDays(ms, now = Date.now()) {
  const days = Math.round((startOfLocalDay(new Date(now)) - startOfLocalDay(new Date(ms))) / 86400000);
  if (days <= 0) return 'today ' + hhmm(ms);
  if (days === 1) return 'yesterday';
  return days + ' days ago';
}

export function dowShort(isoDay) {
  return DOW[new Date(parseIsoDate(isoDay)).getDay()];
}

export function monthName(i) {
  return MON[i];
}
