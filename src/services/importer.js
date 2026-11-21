import { all, one, run, tx, bump } from '../db/index.js';
import { parseCsv, toCsv } from '../lib/csv.js';
import { normalizeSku, openingMovementId, sha256Hex } from '../lib/ids.js';
import { parseRupiah } from '../lib/money.js';
import { parseQty, isWholeMilli, formatQty } from '../lib/qty.js';
import { device } from './device.js';
import { ensureCategory, idForNewProduct, updateChangedColumns } from './products.js';
import { insertMovement, rebuildSummary } from './stock.js';

export const TEMPLATE_COLUMNS = ['sku', 'name', 'barcodes', 'category', 'unit', 'decimal_qty', 'price', 'cost_price', 'min_stock', 'opening_stock'];

const ALIASES = {
  sku: ['sku', 'kode', 'code'],
  name: ['name', 'nama', 'product', 'product name'],
  barcodes: ['barcodes', 'barcode'],
  category: ['category', 'kategori'],
  unit: ['unit', 'satuan', 'uom'],
  decimal_qty: ['decimal_qty', 'decimal', 'decimal qty'],
  price: ['price', 'selling price', 'selling_price', 'harga', 'harga jual'],
  cost_price: ['cost_price', 'cost', 'cost price', 'harga beli', 'harga modal'],
  min_stock: ['min_stock', 'minimum stock', 'min stock', 'stok minimum'],
  opening_stock: ['opening_stock', 'opening stock', 'opening', 'stok awal'],
};

const EXAMPLE_ROWS = [
  ['DRK-001', 'Mineral Water 600 ml', '8991002101234', 'Drinks', 'pcs', 'no', '4000', '2900', '12', '48'],
  ['GRC-030', 'Sugar (loose)', '', 'Groceries', 'kg', 'yes', '16000', '13800', '2,5', '10,5'],
];

export function templateCsv() {
  return new Blob([toCsv([TEMPLATE_COLUMNS, ...EXAMPLE_ROWS])], { type: 'text/csv' });
}

export async function templateXlsx() {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_COLUMNS, ...EXAMPLE_ROWS]);
  ws['!cols'] = TEMPLATE_COLUMNS.map((c) => ({ wch: c === 'name' ? 28 : 14 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Products');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

async function readRows(file, bytes) {
  if (/\.xlsx$/i.test(file.name)) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(bytes, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
      .map((r) => r.map((c) => String(c ?? '')))
      .filter((r) => r.some((c) => c.trim() !== ''));
  }
  return parseCsv(new TextDecoder().decode(bytes));
}

function mapHeader(header) {
  const idx = {};
  header.forEach((h, i) => {
    const key = String(h).trim().toLowerCase();
    for (const [col, names] of Object.entries(ALIASES)) if (names.includes(key) && idx[col] === undefined) idx[col] = i;
  });
  return idx;
}

function parseBool(s) {
  const v = String(s).trim().toLowerCase();
  if (v === '') return null;
  if (['yes', 'y', '1', 'true', 'ya'].includes(v)) return 1;
  if (['no', 'n', '0', 'false', 'tidak'].includes(v)) return 0;
  return undefined;
}

const splitBarcodes = (s) => [...new Set(String(s || '').split(/[\s,;|]+/).map((b) => b.trim()).filter(Boolean))];

/**
 * Reads the file and checks every row without saving anything.
 * Returns { fileName, fileHash, rows, counts, missingColumns }.
 */
export async function previewImport(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileHash = await sha256Hex(bytes);
  const table = await readRows(file, bytes);
  if (!table.length) return { fileName: file.name, fileHash, rows: [], counts: { new: 0, update: 0, error: 0 }, missingColumns: ['sku', 'name'] };
  const idx = mapHeader(table[0]);
  const missingColumns = ['sku', 'name', 'price'].filter((c) => idx[c] === undefined);

  const products = await all('SELECT * FROM products');
  const bySku = new Map();
  for (const p of products) {
    const k = normalizeSku(p.sku);
    if (!bySku.has(k)) bySku.set(k, []);
    bySku.get(k).push(p);
  }
  const barcodeOwners = new Map((await all('SELECT b.barcode, b.product_id, p.sku FROM product_barcodes b LEFT JOIN products p ON p.id = b.product_id')).map((r) => [r.barcode, r]));
  const existingOpenings = new Set((await all('SELECT id FROM stock_movements WHERE is_opening = 1')).map((r) => r.id));

  const seenSku = new Map();
  const seenBarcode = new Map();
  const rows = [];
  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    const get = (col) => (idx[col] === undefined ? '' : String(cells[idx[col]] ?? '').trim());
    const rowNo = i + 1;
    const errors = [];
    const sku = normalizeSku(get('sku'));
    const matches = (bySku.get(sku) || []);
    const active = matches.filter((p) => p.is_active);
    const existing = active[0] || matches[0] || null;

    if (!sku) errors.push('SKU is empty');
    else if (seenSku.has(sku)) errors.push(`SKU ${sku} is also on row ${seenSku.get(sku)}`);
    else if (active.length > 1) errors.push(`SKU ${sku} belongs to ${active.length} products. Archive one of them first.`);
    if (sku) seenSku.set(sku, seenSku.get(sku) ?? rowNo);

    const name = get('name');
    if (!name && !existing) errors.push('Name is empty');

    const decimalRaw = parseBool(get('decimal_qty'));
    if (decimalRaw === undefined) errors.push(`Decimal qty “${get('decimal_qty')}” must be yes or no`);
    const decimal = decimalRaw ?? existing?.decimal_qty ?? 0;

    const money = (col, label, required) => {
      const raw = get(col);
      if (raw === '') {
        if (required) errors.push(`${label} is empty`);
        return null;
      }
      const v = parseRupiah(raw);
      if (v === null) errors.push(`${label} “${raw}” is not a whole number`);
      else if (v < 0) errors.push(`${label} can’t be negative`);
      return v;
    };
    const price = money('price', 'Selling price', !existing);
    const cost = money('cost_price', 'Cost price', false);

    const qtyField = (col, label) => {
      const raw = get(col);
      if (raw === '') return null;
      const v = parseQty(raw);
      if (v === null) { errors.push(`${label} “${raw}” is not a number`); return null; }
      if (v < 0) { errors.push(`${label} can’t be negative`); return null; }
      if (!decimal && !isWholeMilli(v)) { errors.push(`${label} ${raw} has decimals, but the product is sold in whole units`); return null; }
      return v;
    };
    const minStock = qtyField('min_stock', 'Minimum stock');
    const opening = qtyField('opening_stock', 'Opening stock');

    if (existing && decimalRaw === 0 && existing.decimal_qty) {
      const s = await one('SELECT on_hand_milli FROM stock_summary WHERE product_id = ?', [existing.id]);
      if (s && !isWholeMilli(s.on_hand_milli)) errors.push('Can’t switch to whole units while on-hand stock has a fractional part');
    }

    const barcodes = splitBarcodes(get('barcodes'));
    for (const b of barcodes) {
      const owner = barcodeOwners.get(b);
      if (owner && owner.product_id !== existing?.id) errors.push(`Barcode ${b} already belongs to ${owner.sku || 'another product'}`);
      else if (seenBarcode.has(b)) errors.push(`Barcode ${b} is also on row ${seenBarcode.get(b)}`);
      seenBarcode.set(b, seenBarcode.get(b) ?? rowNo);
    }

    const productId = existing ? existing.id : sku ? await idForNewProduct(sku) : null;
    let openingStatus = 'none';
    let movementId = null;
    if (opening && productId) {
      movementId = openingMovementId(fileHash, productId);
      openingStatus = existingOpenings.has(movementId) ? 'already' : 'add';
    }

    rows.push({
      rowNo,
      status: errors.length ? 'error' : existing ? 'update' : 'new',
      errors,
      existing,
      productId,
      sku,
      name: name || existing?.name || '',
      category: get('category'),
      unit: get('unit'),
      decimal,
      decimalGiven: decimalRaw !== null && decimalRaw !== undefined,
      price,
      cost,
      minStock,
      opening,
      openingStatus,
      movementId,
      barcodes,
      openingLabel: opening ? (openingStatus === 'already' ? 'already imported' : (existing ? '+' : '') + formatQty(opening) + (existing ? ' stock in' : '')) : '—',
    });
  }
  const counts = { new: 0, update: 0, error: 0 };
  rows.forEach((r) => counts[r.status]++);
  return { fileName: file.name, fileHash, rows, counts, missingColumns };
}

/** Saves the valid rows of a preview in one transaction. Returns the number of rows saved. */
export async function commitImport(preview) {
  const valid = preview.rows.filter((r) => r.status !== 'error');
  const now = Date.now();
  const touched = [];
  await tx(async (t) => {
    for (const r of valid) {
      const categoryId = r.category ? await ensureCategory(r.category, t) : r.existing?.category_id ?? null;
      if (r.existing) {
        await updateChangedColumns(r.existing.id, {
          sku: r.sku,
          name: r.name,
          category_id: categoryId,
          unit: r.unit || r.existing.unit,
          decimal_qty: r.decimal,
          price: r.price ?? r.existing.price,
          cost_price: r.cost ?? r.existing.cost_price,
          min_stock_milli: r.minStock ?? r.existing.min_stock_milli,
          is_active: 1,
        }, t);
      } else {
        await run(
          `INSERT INTO products (id, sku, name, category_id, unit, decimal_qty, price, cost_price, min_stock_milli, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
           ON CONFLICT(id) DO UPDATE SET sku = excluded.sku, name = excluded.name, category_id = excluded.category_id, unit = excluded.unit,
             decimal_qty = excluded.decimal_qty, price = excluded.price, cost_price = excluded.cost_price,
             min_stock_milli = excluded.min_stock_milli, is_active = 1, updated_at = excluded.updated_at`,
          [r.productId, r.sku, r.name, categoryId, r.unit || 'pcs', r.decimal, r.price ?? 0, r.cost ?? 0, r.minStock ?? 0, now, now],
          t,
        );
      }
      for (const b of r.barcodes) {
        await run(
          'INSERT INTO product_barcodes (barcode, product_id, created_at) VALUES (?, ?, ?) ON CONFLICT(barcode) DO UPDATE SET product_id = excluded.product_id',
          [b, r.productId, now], t,
        );
      }
      if (r.opening && r.openingStatus === 'add') {
        const exists = await one('SELECT 1 AS x FROM stock_movements WHERE id = ?', [r.movementId], t);
        if (!exists) {
          await insertMovement({
            id: r.movementId, product_id: r.productId, kind: 'stock_in', qty_milli: r.opening,
            unit_cost: r.cost ?? r.existing?.cost_price ?? 0, note: 'Opening stock · ' + preview.fileName,
            is_opening: 1, device_id: device.id, occurred_at: now, created_at: now,
          }, t);
        }
      }
      touched.push(r.productId);
    }
    await rebuildSummary(touched, t);
  });
  bump();
  return valid.length;
}
