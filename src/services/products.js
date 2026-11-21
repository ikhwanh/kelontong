import { all, one, run, tx, bump, getDb } from '../db/index.js';
import { newId, productIdForSku, categoryIdForName, normalizeSku } from '../lib/ids.js';
import { isWholeMilli } from '../lib/qty.js';
import { rebuildSummary } from './stock.js';

const PRODUCT_COLUMNS = `p.id, p.sku, p.name, p.category_id, p.unit, p.decimal_qty, p.price, p.cost_price,
  p.min_stock_milli, p.is_active, COALESCE(s.on_hand_milli, 0) AS on_hand_milli,
  COALESCE(s.avg_cost, p.cost_price) AS avg_cost`;

export async function listProducts({ search = '', categoryId = null, includeInactive = false, limit = 500 } = {}) {
  const where = [];
  const bind = [];
  if (!includeInactive) where.push('p.is_active = 1');
  if (categoryId) {
    where.push('p.category_id = ?');
    bind.push(categoryId);
  }
  const q = search.trim();
  if (q) {
    where.push(`(p.name LIKE ? OR p.sku LIKE ? OR p.id IN (SELECT product_id FROM product_barcodes WHERE barcode LIKE ?))`);
    bind.push(`%${q}%`, `%${q}%`, `${q}%`);
  }
  bind.push(limit);
  return all(
    `SELECT ${PRODUCT_COLUMNS} FROM products p LEFT JOIN stock_summary s ON s.product_id = p.id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY p.name COLLATE NOCASE LIMIT ?`,
    bind,
  );
}

export async function getProduct(id, x = getDb()) {
  const p = await one(`SELECT ${PRODUCT_COLUMNS} FROM products p LEFT JOIN stock_summary s ON s.product_id = p.id WHERE p.id = ?`, [id], x);
  if (!p) return null;
  p.barcodes = (await all('SELECT barcode FROM product_barcodes WHERE product_id = ? ORDER BY created_at', [id], x)).map((r) => r.barcode);
  return p;
}

export async function getProductsByIds(ids) {
  if (!ids.length) return [];
  return all(
    `SELECT ${PRODUCT_COLUMNS} FROM products p LEFT JOIN stock_summary s ON s.product_id = p.id WHERE p.id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );
}

/** Barcode first, then an exact SKU, so a typed SKU works like a scan. */
export async function findByCode(code) {
  const c = String(code).trim();
  if (!c) return null;
  const bc = await one('SELECT product_id FROM product_barcodes WHERE barcode = ?', [c]);
  if (bc) {
    const p = await getProduct(bc.product_id);
    if (p) return p;
  }
  const bySku = await one('SELECT id FROM products WHERE sku = ? COLLATE NOCASE AND is_active = 1', [normalizeSku(c)]);
  return bySku ? getProduct(bySku.id) : null;
}

export async function listCategories({ includeInactive = false } = {}) {
  return all(`SELECT * FROM categories ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY sort_order, name COLLATE NOCASE`);
}

/** Returns the category id for a name, creating (or reactivating) it with a derived ID. */
export async function ensureCategory(name, x = getDb()) {
  const clean = String(name ?? '').trim();
  if (!clean) return null;
  const existing = await one('SELECT id, is_active FROM categories WHERE lower(trim(name)) = lower(?)', [clean], x);
  const now = Date.now();
  if (existing) {
    if (!existing.is_active) await run('UPDATE categories SET is_active = 1, updated_at = ? WHERE id = ?', [now, existing.id], x);
    return existing.id;
  }
  const id = categoryIdForName(clean);
  const clash = await one('SELECT id FROM categories WHERE id = ?', [id], x);
  const finalId = clash ? newId() : id;
  await run('INSERT INTO categories (id, name, sort_order, is_active, created_at, updated_at) VALUES (?, ?, 0, 1, ?, ?)', [finalId, clean, now, now], x);
  return finalId;
}

export async function archiveCategory(id) {
  await run('UPDATE categories SET is_active = 0, updated_at = ? WHERE id = ?', [Date.now(), id]);
  bump();
}

export async function skuOwner(sku, x = getDb()) {
  return one('SELECT id, sku, name FROM products WHERE sku = ? COLLATE NOCASE AND is_active = 1', [normalizeSku(sku)], x);
}

export async function barcodeOwner(barcode, x = getDb()) {
  return one(
    'SELECT b.product_id, p.sku, p.name FROM product_barcodes b LEFT JOIN products p ON p.id = b.product_id WHERE b.barcode = ?',
    [barcode], x,
  );
}

/** The derived ID, unless it already belongs to a different SKU (DATABASE.md §1, IDs). */
export async function idForNewProduct(sku, x = getDb()) {
  const id = productIdForSku(sku);
  const clash = await one('SELECT sku FROM products WHERE id = ?', [id], x);
  if (clash && normalizeSku(clash.sku) !== normalizeSku(sku)) return newId();
  return id;
}

export function validateProduct(p) {
  const errors = {};
  if (!normalizeSku(p.sku)) errors.sku = 'SKU is required';
  if (!String(p.name ?? '').trim()) errors.name = 'Name is required';
  if (!Number.isInteger(p.price) || p.price < 0) errors.price = 'Selling price must be a whole rupiah amount';
  if (!Number.isInteger(p.cost_price) || p.cost_price < 0) errors.cost_price = 'Cost price must be a whole rupiah amount';
  if (!Number.isInteger(p.min_stock_milli) || p.min_stock_milli < 0) errors.min_stock_milli = 'Minimum stock can’t be negative';
  else if (!p.decimal_qty && !isWholeMilli(p.min_stock_milli)) errors.min_stock_milli = 'Use whole units, or turn on decimal quantities';
  return errors;
}

/**
 * Creates or updates a product with its barcodes. `p.id` empty = new product.
 * Throws an Error whose `fields` maps field names to messages.
 */
export async function saveProduct(p) {
  const fail = (fields) => Object.assign(new Error(Object.values(fields)[0]), { fields });
  const errors = validateProduct(p);
  if (Object.keys(errors).length) throw fail(errors);

  const sku = normalizeSku(p.sku);
  const owner = await skuOwner(sku);
  if (owner && owner.id !== p.id) throw fail({ sku: `SKU ${sku} already belongs to ${owner.name}` });

  const barcodes = [...new Set((p.barcodes || []).map((b) => String(b).trim()).filter(Boolean))];
  for (const b of barcodes) {
    const o = await barcodeOwner(b);
    if (o && o.product_id !== p.id) throw fail({ barcodes: `Barcode ${b} already belongs to ${o.sku || 'another product'}` });
  }

  if (p.id) {
    const current = await getProduct(p.id);
    if (current.decimal_qty && !p.decimal_qty && !isWholeMilli(current.on_hand_milli)) {
      throw fail({ decimal_qty: 'On-hand stock has a fractional part. Adjust it to whole units first.' });
    }
  }

  const now = Date.now();
  let id = p.id;
  await tx(async (t) => {
    const categoryId = p.category_name !== undefined ? await ensureCategory(p.category_name, t) : p.category_id || null;
    if (!id) {
      id = await idForNewProduct(sku, t);
      await run(
        `INSERT INTO products (id, sku, name, category_id, unit, decimal_qty, price, cost_price, min_stock_milli, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET sku = excluded.sku, name = excluded.name, category_id = excluded.category_id,
           unit = excluded.unit, decimal_qty = excluded.decimal_qty, price = excluded.price, cost_price = excluded.cost_price,
           min_stock_milli = excluded.min_stock_milli, is_active = 1, updated_at = excluded.updated_at`,
        [id, sku, p.name.trim(), categoryId, p.unit?.trim() || 'pcs', p.decimal_qty ? 1 : 0, p.price, p.cost_price, p.min_stock_milli, now, now],
        t,
      );
    } else {
      await updateChangedColumns(id, {
        sku, name: p.name.trim(), category_id: categoryId, unit: p.unit?.trim() || 'pcs', decimal_qty: p.decimal_qty ? 1 : 0,
        price: p.price, cost_price: p.cost_price, min_stock_milli: p.min_stock_milli, is_active: p.is_active ? 1 : 0,
      }, t);
    }
    await replaceBarcodes(id, barcodes, t);
    await rebuildSummary([id], t);
  });
  bump();
  return id;
}

// Writing only the columns that changed keeps another device's edit to a different
// field from being overwritten when the two merge (last write wins per column).
export async function updateChangedColumns(id, values, x) {
  const current = await one('SELECT * FROM products WHERE id = ?', [id], x);
  const changed = Object.entries(values).filter(([k, v]) => current[k] !== v);
  if (!changed.length) return false;
  const sets = changed.map(([k]) => `${k} = ?`).join(', ');
  await run(`UPDATE products SET ${sets}, updated_at = ? WHERE id = ?`, [...changed.map(([, v]) => v), Date.now(), id], x);
  return true;
}

export async function replaceBarcodes(productId, barcodes, x) {
  const existing = (await all('SELECT barcode FROM product_barcodes WHERE product_id = ?', [productId], x)).map((r) => r.barcode);
  const now = Date.now();
  for (const b of existing) if (!barcodes.includes(b)) await run('DELETE FROM product_barcodes WHERE barcode = ?', [b], x);
  for (const b of barcodes) {
    if (!existing.includes(b)) {
      await run(
        'INSERT INTO product_barcodes (barcode, product_id, created_at) VALUES (?, ?, ?) ON CONFLICT(barcode) DO UPDATE SET product_id = excluded.product_id',
        [b, productId, now], x,
      );
    }
  }
}

export async function setProductActive(id, active) {
  await run('UPDATE products SET is_active = ?, updated_at = ? WHERE id = ?', [active ? 1 : 0, Date.now(), id]);
  bump();
}

/** SKUs held by more than one active product, which can only happen after a merge. */
export async function duplicateSkus() {
  const rows = await all('SELECT upper(sku) AS sku FROM products WHERE is_active = 1 GROUP BY upper(sku) HAVING count(*) > 1');
  return new Set(rows.map((r) => r.sku));
}

export async function stockCounts() {
  return one(
    `SELECT count(*) AS all_count,
       SUM(COALESCE(s.on_hand_milli, 0) <= p.min_stock_milli) AS low_count,
       SUM(COALESCE(s.on_hand_milli, 0) < 0) AS neg_count
     FROM products p LEFT JOIN stock_summary s ON s.product_id = p.id WHERE p.is_active = 1`,
  );
}
