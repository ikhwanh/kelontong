import { all, run, bump } from '../db/index.js';
import { exportChanges, importChanges, readSyncFile, wrapSyncFile } from '../db/sync.js';
import { SCHEMA_VERSION } from '../db/schema.js';
import { newId } from '../lib/ids.js';
import { fileStamp } from '../lib/time.js';
import { APP_VERSION, device, checkCodeCollision } from './device.js';
import { markExported, loadSettings } from './settings.js';
import { rebuildSummary } from './stock.js';
import { refreshCartProducts } from './cart.js';

export async function buildSyncFile() {
  const gz = await exportChanges({ appVersion: APP_VERSION, schemaVersion: SCHEMA_VERSION, deviceId: device.id, deviceCode: device.code });
  const name = `pos-sync-${device.code}-${fileStamp(Date.now())}.txt`;
  return new File([wrapSyncFile(gz)], name, { type: 'text/plain' });
}

/** Opens the share sheet, or downloads the file where sharing files isn't supported. */
export async function shareSyncFile() {
  const file = await buildSyncFile();
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
      await markExported();
      return 'shared';
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  await markExported();
  return 'downloaded';
}

async function logImport(entry) {
  await run(
    `INSERT INTO sync_imports (id, imported_at, file_device_code, file_device_id, file_app_version, file_exported_at,
       change_count, applied_count, status, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId(), Date.now(), entry.code || '', entry.deviceId || '', entry.version || '', entry.exportedAt || 0,
      entry.changeCount || 0, entry.applied || 0, entry.status, entry.message || ''],
  );
  bump();
}

/** Imports a sync file. Returns { status, message, applied }. */
export async function importSyncFile(file) {
  let payload;
  try {
    payload = await readSyncFile(await file.text());
  } catch {
    const message = `${file.name} isn’t a sync file from this app.`;
    await logImport({ status: 'invalid_file', message });
    return { status: 'invalid_file', message };
  }
  const meta = {
    code: payload.device_code, deviceId: payload.device_id, version: payload.app_version,
    exportedAt: payload.exported_at, changeCount: payload.changes.length,
  };
  if (payload.app_version !== APP_VERSION) {
    const message = `File from ${payload.device_code} was made with app ${payload.app_version}; this device runs ${APP_VERSION}. Update both devices to the same version, then import again.`;
    await logImport({ ...meta, status: 'version_mismatch', message });
    return { status: 'version_mismatch', message };
  }
  try {
    const applied = await importChanges(payload);
    await rebuildSummary();
    await loadSettings();
    await refreshCartProducts();
    const collision = await checkCodeCollision();
    const message = payload.device_id === device.id ? 'This device’s own file. Nothing new to merge.' : '';
    await logImport({ ...meta, applied, status: 'merged', message });
    return { status: 'merged', applied, collision, message };
  } catch (e) {
    const message = 'Import failed, nothing changed: ' + (e?.message || e);
    await logImport({ ...meta, status: 'error', message });
    return { status: 'error', message };
  }
}

export async function importHistory(limit = 10) {
  return all('SELECT * FROM sync_imports ORDER BY imported_at DESC LIMIT ?', [limit]);
}

export async function lastImportPerDevice() {
  return all(
    `SELECT file_device_code, file_device_id, MAX(imported_at) AS imported_at FROM sync_imports
     WHERE status = 'merged' GROUP BY file_device_id`,
  );
}
