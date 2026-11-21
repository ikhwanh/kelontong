import initWasm from '@vlcn.io/crsqlite-wasm';
import wasmUrl from '@vlcn.io/crsqlite-wasm/crsqlite.wasm?url';
import { ref } from 'vue';
import { migrations } from './schema.js';

let sqlitePromise;
let db;

// Bumped after every write so views can reload what they show.
export const dataVersion = ref(0);
export function bump() {
  dataVersion.value++;
}

function sqlite() {
  sqlitePromise ??= initWasm(() => wasmUrl);
  return sqlitePromise;
}

export async function openDatabase(filename = 'pos.db') {
  const handle = await (await sqlite()).open(filename);
  await migrate(handle);
  return handle;
}

export async function initDb(filename) {
  db = await openDatabase(filename);
  return db;
}

export function getDb() {
  return db;
}

async function migrate(handle) {
  const [{ user_version: current }] = await handle.execO('PRAGMA user_version');
  for (let v = current; v < migrations.length; v++) {
    await handle.tx(async (tx) => {
      for (const sql of migrations[v]) await tx.exec(sql);
      await tx.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

// `x` is the database or an open transaction, so service functions can run inside a caller's tx.
export const all = (sql, bind = [], x = db) => x.execO(sql, bind);
export const one = async (sql, bind = [], x = db) => (await x.execO(sql, bind))[0];
export const run = (sql, bind = [], x = db) => x.exec(sql, bind);
export const tx = (fn) => db.tx(fn);

export async function getMeta(key, x = db) {
  const row = await one('SELECT value FROM local_meta WHERE key = ?', [key], x);
  return row ? row.value : null;
}

export async function setMeta(key, value, x = db) {
  await run('INSERT INTO local_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, String(value)], x);
}
