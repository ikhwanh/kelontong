import { all, one, run, tx, bump, getDb } from '../db/index.js';
import { newId } from '../lib/ids.js';
import { replayCost } from '../lib/costing.js';
import { device } from './device.js';

/** Rebuilds the local on-hand / average-cost cache from the ledger (DATABASE.md §5). */
export async function rebuildSummary(productIds = null, x = getDb()) {
  const ids = productIds ?? (await all('SELECT id FROM products', [], x)).map((r) => r.id);
  if (!ids.length) return;
  const now = Date.now();
  const chunk = 400;
  for (let i = 0; i < ids.length; i += chunk) {
    const part = ids.slice(i, i + chunk);
    const marks = part.map(() => '?').join(',');
    const products = await all(`SELECT id, cost_price FROM products WHERE id IN (${marks})`, part, x);
    const moves = await all(
      `SELECT product_id, kind, qty_milli, unit_cost FROM stock_movements
       WHERE product_id IN (${marks}) ORDER BY product_id, occurred_at, id`,
      part, x,
    );
    const byProduct = new Map();
    for (const m of moves) {
      if (!byProduct.has(m.product_id)) byProduct.set(m.product_id, []);
      byProduct.get(m.product_id).push(m);
    }
    const costs = new Map(products.map((p) => [p.id, p.cost_price]));
    const write = async (t) => {
      for (const id of part) {
        const { onHand, avg } = replayCost(byProduct.get(id) || [], costs.get(id) || 0);
        await run(
          `INSERT INTO stock_summary (product_id, on_hand_milli, avg_cost, updated_at) VALUES (?, ?, ?, ?)
           ON CONFLICT(product_id) DO UPDATE SET on_hand_milli = excluded.on_hand_milli, avg_cost = excluded.avg_cost, updated_at = excluded.updated_at`,
          [id, onHand, avg, now], t,
        );
      }
    };
    if (x === getDb()) await x.tx(write);
    else await write(x);
  }
}

export async function getSummary(productId, x = getDb()) {
  const row = await one('SELECT on_hand_milli, avg_cost FROM stock_summary WHERE product_id = ?', [productId], x);
  if (row) return row;
  const p = await one('SELECT cost_price FROM products WHERE id = ?', [productId], x);
  return { on_hand_milli: 0, avg_cost: p?.cost_price ?? 0 };
}

function baseMovement(productId) {
  const now = Date.now();
  return { id: newId(), product_id: productId, device_id: device.id, occurred_at: now, created_at: now };
}

export async function insertMovement(m, x) {
  await run(
    `INSERT INTO stock_movements (id, product_id, kind, qty_milli, unit_cost, reason, note, counted_milli, system_milli,
       sale_id, sale_line_id, is_opening, device_id, occurred_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [m.id, m.product_id, m.kind, m.qty_milli, m.unit_cost ?? 0, m.reason ?? null, m.note ?? '', m.counted_milli ?? null,
      m.system_milli ?? null, m.sale_id ?? null, m.sale_line_id ?? null, m.is_opening ?? 0, m.device_id, m.occurred_at, m.created_at],
    x,
  );
}

async function writeMovement(m) {
  await tx(async (t) => {
    await insertMovement(m, t);
    await rebuildSummary([m.product_id], t);
  });
  bump();
}

export async function stockIn({ productId, qtyMilli, unitCost, note }) {
  if (!(qtyMilli > 0)) throw new Error('Enter a quantity above zero.');
  if (!(unitCost >= 0)) throw new Error('Enter the cost per unit.');
  await writeMovement({ ...baseMovement(productId), kind: 'stock_in', qty_milli: qtyMilli, unit_cost: unitCost, note: note || '' });
}

export async function stockOut({ productId, qtyMilli, reason, note }) {
  if (!(qtyMilli > 0)) throw new Error('Enter a quantity above zero.');
  if (!['damaged', 'lost', 'own_use'].includes(reason)) throw new Error('Choose a reason.');
  await writeMovement({ ...baseMovement(productId), kind: 'stock_out', qty_milli: -qtyMilli, reason, note: note || '' });
}

export async function opname({ productId, countedMilli, systemMilli, note }) {
  if (!(countedMilli >= 0)) throw new Error('Enter the count on the shelf.');
  await writeMovement({
    ...baseMovement(productId), kind: 'opname', qty_milli: countedMilli - systemMilli,
    counted_milli: countedMilli, system_milli: systemMilli, note: note || '',
  });
}

export async function recentMovements(productId, limit = 20) {
  return all(
    `SELECT m.*, s.receipt_no FROM stock_movements m LEFT JOIN sales s ON s.id = m.sale_id
     WHERE m.product_id = ? ORDER BY m.occurred_at DESC, m.id DESC LIMIT ?`,
    [productId, limit],
  );
}

export const KIND_LABEL = {
  sale: 'Sale',
  sale_cancel: 'Cancelled sale',
  stock_in: 'Stock in',
  stock_out: 'Stock out',
  opname: 'Opname',
};

export const REASON_LABEL = { damaged: 'Damaged', lost: 'Lost', own_use: 'Own use' };
