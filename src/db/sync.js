// The only module that talks to cr-sqlite directly (DATABASE.md §12.3), apart from
// the crsql_as_crr calls in migrations.
import { all, one, getDb } from './index.js';

export const SYNC_FORMAT = 1;
const FILE_MAGIC = 'POSSYNC1';

export function bytesToBase64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(s);
}

export function base64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

const encodeVal = (v) => {
  if (v instanceof Uint8Array) return { b: bytesToBase64(v) };
  if (typeof v === 'bigint') return { i: v.toString() };
  return v;
};

const decodeVal = (v) => {
  if (v && typeof v === 'object') {
    if ('b' in v) return base64ToBytes(v.b);
    if ('i' in v) return BigInt(v.i);
  }
  return v;
};

export async function siteIdHex(x = getDb()) {
  const row = await one('SELECT lower(hex(crsql_site_id())) AS id', [], x);
  return row.id;
}

export async function dbVersion(x = getDb()) {
  const row = await one('SELECT crsql_db_version() AS v', [], x);
  return Number(row.v);
}

/** Returns the gzip-compressed sync payload for every change this database holds. */
export async function exportChanges({ appVersion, schemaVersion, deviceId, deviceCode }, x = getDb()) {
  const rows = await x.execA(
    `SELECT "table", pk, cid, val, col_version, db_version,
            COALESCE(site_id, crsql_site_id()), cl, seq
     FROM crsql_changes`,
  );
  const payload = {
    format: SYNC_FORMAT,
    app_version: appVersion,
    schema_version: schemaVersion,
    device_id: deviceId,
    device_code: deviceCode,
    exported_at: Date.now(),
    db_version: await dbVersion(x),
    changes: rows.map(([table, pk, cid, val, colVersion, dbv, site, cl, seq]) => [
      table, bytesToBase64(pk), cid, encodeVal(val), encodeVal(colVersion), encodeVal(dbv),
      bytesToBase64(site), encodeVal(cl), encodeVal(seq),
    ]),
  };
  const json = new TextEncoder().encode(JSON.stringify(payload));
  return pipe(json, new CompressionStream('gzip'));
}

// Chrome's Web Share only allows a short list of file types, and .gz is not on it, so the
// gzip bytes travel as base64 inside a .txt file (DATABASE.md §7).
export function wrapSyncFile(gzBytes) {
  return FILE_MAGIC + '\n' + bytesToBase64(gzBytes) + '\n';
}

export async function readSyncFile(text) {
  const body = text.trim().startsWith(FILE_MAGIC) ? text.trim().slice(FILE_MAGIC.length) : text;
  const gz = base64ToBytes(body.replace(/\s+/g, ''));
  const json = await pipe(gz, new DecompressionStream('gzip'));
  const payload = JSON.parse(new TextDecoder().decode(json));
  if (payload?.format !== SYNC_FORMAT || !Array.isArray(payload.changes)) throw new Error('Not a sync file');
  return payload;
}

/**
 * Merges a decoded payload into the database. Never replaces it: cr-sqlite ignores
 * changes it already has, so importing the same file twice changes nothing.
 * Returns the number of changes that altered local state.
 */
export async function importChanges(payload, x = getDb()) {
  const before = await dbVersion(x);
  await x.tx(async (t) => {
    const stmt = await t.prepare(
      `INSERT INTO crsql_changes ("table", pk, cid, val, col_version, db_version, site_id, cl, seq)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    try {
      for (const [table, pk, cid, val, colVersion, dbv, site, cl, seq] of payload.changes) {
        await stmt.run(
          t,
          table, base64ToBytes(pk), cid, decodeVal(val), decodeVal(colVersion), decodeVal(dbv),
          base64ToBytes(site), decodeVal(cl), decodeVal(seq),
        );
      }
    } finally {
      await stmt.finalize(t);
    }
  });
  const [{ n }] = await all('SELECT count(*) AS n FROM crsql_changes WHERE db_version > ?', [before], x);
  return Number(n);
}
