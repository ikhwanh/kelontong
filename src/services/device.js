import { reactive } from 'vue';
import { all, one, run, bump } from '../db/index.js';
import { siteIdHex } from '../db/sync.js';

export const APP_VERSION = __APP_VERSION__;

export const device = reactive({ id: '', code: '', name: '', codeCollision: null });

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

export function randomCode(taken) {
  for (let i = 0; i < 500; i++) {
    const code = LETTERS[Math.floor(Math.random() * LETTERS.length)] + Math.floor(Math.random() * 10);
    if (!taken.has(code)) return code;
  }
  return LETTERS[Math.floor(Math.random() * LETTERS.length)] + String(Math.floor(Math.random() * 90) + 10);
}

export async function ensureDevice() {
  const id = await siteIdHex();
  const now = Date.now();
  let row = await one('SELECT * FROM devices WHERE id = ?', [id]);
  if (!row) {
    const taken = new Set((await all('SELECT code FROM devices')).map((d) => d.code));
    const code = randomCode(taken);
    await run('INSERT INTO devices (id, code, name, app_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [id, code, '', APP_VERSION, now, now]);
    row = { id, code, name: '' };
  } else if (row.app_version !== APP_VERSION) {
    await run('UPDATE devices SET app_version = ?, updated_at = ? WHERE id = ?', [APP_VERSION, now, id]);
  }
  Object.assign(device, { id: row.id, code: row.code, name: row.name });
  await checkCodeCollision();
}

export async function checkCodeCollision() {
  const other = await one('SELECT id, code FROM devices WHERE code = ? AND id <> ?', [device.code, device.id]);
  device.codeCollision = other ? other.code : null;
  return device.codeCollision;
}

export function validCode(code) {
  return /^[A-Z][A-Z0-9]{1,3}$/.test(code);
}

export async function setDeviceCode(code) {
  code = code.trim().toUpperCase();
  if (!validCode(code)) throw new Error('Use 2–4 letters or digits, starting with a letter.');
  const other = await one('SELECT id FROM devices WHERE code = ? AND id <> ?', [code, device.id]);
  if (other) throw new Error(`Code ${code} is already used by another device.`);
  await run('UPDATE devices SET code = ?, updated_at = ? WHERE id = ?', [code, Date.now(), device.id]);
  device.code = code;
  await checkCodeCollision();
  bump();
}

export async function setDeviceName(name) {
  await run('UPDATE devices SET name = ?, updated_at = ? WHERE id = ?', [name.trim(), Date.now(), device.id]);
  device.name = name.trim();
  bump();
}

export async function listDevices() {
  return all('SELECT * FROM devices ORDER BY code');
}
