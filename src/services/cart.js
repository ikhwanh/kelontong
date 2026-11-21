import { reactive, computed } from 'vue';
import { all, one, run, tx, bump } from '../db/index.js';
import { newId } from '../lib/ids.js';
import { computeCart } from '../lib/checkout.js';
import { getProductsByIds } from './products.js';

// The cart is local to this device (DATABASE.md §4) and saved on every change, so a
// reload or crash never loses a sale in progress.
export const cart = reactive({
  id: null,
  note: '',
  lines: [], // { key, product_id, qty_milli, note, discount: {type, value} | null }
  bill_discount_type: null,
  bill_discount_value: 0,
  created_at: 0,
  products: {}, // product_id → product row, for display and pricing
});

export const cartCalc = computed(() => {
  const input = cart.lines.map((l) => {
    const p = cart.products[l.product_id];
    return { qty_milli: l.qty_milli, unit_price: p?.price ?? 0, discount: l.discount, decimal_qty: p?.decimal_qty ?? 0 };
  });
  const bill = cart.bill_discount_type ? { type: cart.bill_discount_type, value: cart.bill_discount_value } : null;
  return computeCart(input, bill);
});

export const cartQtyByProduct = computed(() => {
  const m = {};
  for (const l of cart.lines) m[l.product_id] = (m[l.product_id] || 0) + l.qty_milli;
  return m;
});

export const cartHasItems = computed(() => cart.lines.length > 0);

function resetCart() {
  Object.assign(cart, { id: null, note: '', lines: [], bill_discount_type: null, bill_discount_value: 0, created_at: 0 });
}

async function hydrate(row) {
  const lines = JSON.parse(row.lines_json || '[]').map((l) => ({ key: l.key || newId(), discount: null, note: '', ...l }));
  const products = await getProductsByIds([...new Set(lines.map((l) => l.product_id))]);
  for (const p of products) cart.products[p.id] = p;
  Object.assign(cart, {
    id: row.id, note: row.note || '', lines,
    bill_discount_type: row.bill_discount_type, bill_discount_value: row.bill_discount_value || 0, created_at: row.created_at,
  });
}

export async function loadActiveCart() {
  const row = await one(`SELECT * FROM carts WHERE status = 'active'`);
  if (row) await hydrate(row);
  else resetCart();
}

export async function refreshCartProducts() {
  const ids = [...new Set(cart.lines.map((l) => l.product_id))];
  for (const p of await getProductsByIds(ids)) cart.products[p.id] = p;
}

async function save() {
  const linesJson = JSON.stringify(cart.lines.map(({ key, product_id, qty_milli, note, discount }) => ({ key, product_id, qty_milli, note, discount })));
  if (!cart.id) {
    if (!cart.lines.length) return;
    cart.id = newId();
    cart.created_at = Date.now();
  }
  await run(
    `INSERT INTO carts (id, status, note, lines_json, bill_discount_type, bill_discount_value, created_at)
     VALUES (?, 'active', ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET note = excluded.note, lines_json = excluded.lines_json,
       bill_discount_type = excluded.bill_discount_type, bill_discount_value = excluded.bill_discount_value`,
    [cart.id, cart.note, linesJson, cart.bill_discount_type, cart.bill_discount_value, cart.created_at],
  );
}

export async function addToCart(product, qtyMilli = 1000) {
  cart.products[product.id] = product;
  const existing = !product.decimal_qty && cart.lines.find((l) => l.product_id === product.id && !l.note && !l.discount);
  if (existing) existing.qty_milli += qtyMilli;
  else cart.lines.push({ key: newId(), product_id: product.id, qty_milli: qtyMilli, note: '', discount: null });
  await save();
  return existing ? existing.key : cart.lines[cart.lines.length - 1].key;
}

export function findLine(key) {
  return cart.lines.find((l) => l.key === key);
}

export async function setLineQty(key, qtyMilli) {
  const line = findLine(key);
  if (!line) return;
  if (qtyMilli <= 0) cart.lines.splice(cart.lines.indexOf(line), 1);
  else line.qty_milli = qtyMilli;
  await save();
}

export async function removeLine(key) {
  await setLineQty(key, 0);
}

export async function setLineNote(key, note) {
  const line = findLine(key);
  if (!line) return;
  line.note = note.trim();
  await save();
}

export async function setLineDiscount(key, discount) {
  const line = findLine(key);
  if (!line) return;
  line.discount = discount && discount.value > 0 ? discount : null;
  await save();
}

export async function setBillDiscount(discount) {
  cart.bill_discount_type = discount && discount.value > 0 ? discount.type : null;
  cart.bill_discount_value = discount && discount.value > 0 ? discount.value : 0;
  await save();
}

export async function clearCart() {
  if (cart.id) await run('DELETE FROM carts WHERE id = ?', [cart.id]);
  resetCart();
}

export async function parkCart(note = '') {
  if (!cart.lines.length) return;
  await save();
  await run(`UPDATE carts SET status = 'parked', parked_at = ?, note = ? WHERE id = ?`, [Date.now(), note.trim(), cart.id]);
  resetCart();
  bump();
}

/** Resumes a parked cart. A cart already in progress is parked first so nothing is lost. */
export async function resumeCart(id) {
  const wasParked = cart.lines.length > 0;
  await tx(async (t) => {
    if (cart.lines.length) {
      await run(`UPDATE carts SET status = 'parked', parked_at = ? WHERE id = ?`, [Date.now(), cart.id], t);
    } else if (cart.id) {
      await run('DELETE FROM carts WHERE id = ?', [cart.id], t);
    }
    await run(`UPDATE carts SET status = 'active', parked_at = NULL WHERE id = ?`, [id], t);
  });
  resetCart();
  await loadActiveCart();
  bump();
  return wasParked;
}

export async function deleteParked(id) {
  await run(`DELETE FROM carts WHERE id = ? AND status = 'parked'`, [id]);
  bump();
}

export async function listParked() {
  const rows = await all(`SELECT * FROM carts WHERE status = 'parked' ORDER BY parked_at DESC`);
  const ids = new Set();
  for (const r of rows) {
    r.lines = JSON.parse(r.lines_json || '[]');
    r.lines.forEach((l) => ids.add(l.product_id));
  }
  const products = Object.fromEntries((await getProductsByIds([...ids])).map((p) => [p.id, p]));
  for (const r of rows) {
    const input = r.lines.map((l) => ({
      qty_milli: l.qty_milli, unit_price: products[l.product_id]?.price ?? 0, discount: l.discount, decimal_qty: products[l.product_id]?.decimal_qty ?? 0,
    }));
    const calc = computeCart(input, r.bill_discount_type ? { type: r.bill_discount_type, value: r.bill_discount_value } : null);
    r.total = calc.total;
    r.itemCount = calc.itemCount;
  }
  return rows;
}

export async function parkedCount() {
  const row = await one(`SELECT count(*) AS n FROM carts WHERE status = 'parked'`);
  return Number(row.n);
}

export async function activeCartHasItems() {
  return !!(await one(`SELECT 1 AS x FROM carts WHERE status = 'active' AND lines_json <> '[]'`));
}
