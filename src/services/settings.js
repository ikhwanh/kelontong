import { reactive } from 'vue';
import { all, run, bump, getMeta, setMeta } from '../db/index.js';

export const settings = reactive({ shop_name: '', receipt_header: '', receipt_footer: '' });

export async function loadSettings() {
  for (const row of await all('SELECT key, value FROM settings')) settings[row.key] = row.value;
}

export async function saveSetting(key, value) {
  if (settings[key] === value) return;
  await run(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
    [key, value, Date.now()],
  );
  settings[key] = value;
  bump();
}

export const prefs = reactive({ theme: 'system', lastExportAt: null, persistGranted: null });

export async function loadPrefs() {
  prefs.theme = (await getMeta('theme')) || 'system';
  const last = await getMeta('last_export_at');
  prefs.lastExportAt = last ? Number(last) : null;
  const p = await getMeta('persist_granted');
  prefs.persistGranted = p === null ? null : p === '1';
  applyTheme();
}

export async function setTheme(theme) {
  prefs.theme = theme;
  await setMeta('theme', theme);
  applyTheme();
}

export function applyTheme() {
  const root = document.documentElement;
  if (prefs.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', prefs.theme);
}

export async function markExported() {
  prefs.lastExportAt = Date.now();
  await setMeta('last_export_at', prefs.lastExportAt);
}

export async function requestPersistence() {
  if (!navigator.storage?.persist) return;
  const already = await navigator.storage.persisted();
  const granted = already || (await navigator.storage.persist());
  prefs.persistGranted = granted;
  await setMeta('persist_granted', granted ? '1' : '0');
}
