import { all, one, run, tx, bump } from '../db/index.js';
import { newId, cancelMovementId } from '../lib/ids.js';
import { computeCart } from '../lib/checkout.js';
import { tzOffsetMin } from '../lib/time.js';
import { device } from './device.js';
import { getProductsByIds } from './products.js';
import { insertMovement, rebuildSummary } from './stock.js';

/**
 * Writes the sale, its lines and one `sale` movement per line, and deletes the active
 * cart, all in one transaction (DATABASE.md §6.7). Returns the new sale id.
 */
export async function completeSale(cart, cashTendered) {
  if (!cart.lines.length) throw new Error('The cart is empty.');
  const products = new Map((await getProductsByIds([...new Set(cart.lines.map((l) => l.product_id))])).map((p) => [p.id, p]));
  const missing = cart.lines.find((l) => !products.has(l.product_id));
  if (missing) throw new Error('A product in the cart no longer exists.');

  const input = cart.lines.map((l) => {
    const p = products.get(l.product_id);
    return { qty_milli: l.qty_milli, unit_price: p.price, discount: l.discount, decimal_qty: p.decimal_qty };
  });
  const billDiscount = cart.bill_discount_type ? { type: cart.bill_discount_type, value: cart.bill_discount_value } : null;
  const calc = computeCart(input, billDiscount);
  if (cashTendered < calc.total) throw new Error('Cash received is less than the total.');

  const saleId = newId();
  const now = Date.now();
  let receiptNo;
  await tx(async (t) => {
    const seqRow = await one('SELECT COALESCE(MAX(device_seq), 0) + 1 AS seq FROM sales WHERE device_code = ?', [device.code], t);
    const seq = Number(seqRow.seq);
    receiptNo = device.code + '-' + String(seq).padStart(6, '0');
    let costTotal = 0;
    const lines = cart.lines.map((l, i) => {
      const p = products.get(l.product_id);
      const c = calc.lines[i];
      const unitCost = Math.round(p.avg_cost);
      const costAmount = Math.round((l.qty_milli * unitCost) / 1000);
      costTotal += costAmount;
      return {
        id: newId(), line_no: i + 1, product: p, qty_milli: l.qty_milli, note: l.note || '',
        discount: l.discount, c, unitCost, costAmount,
      };
    });
    await run(
      `INSERT INTO sales (id, device_id, device_code, device_seq, receipt_no, status, sold_at, tz_offset_min, line_count, item_count,
         subtotal, item_discount_total, bill_discount_type, bill_discount_value, bill_discount_amount, total, cost_total,
         cash_tendered, change_due, created_at)
       VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [saleId, device.id, device.code, seq, receiptNo, now, tzOffsetMin(), lines.length, calc.itemCount, calc.subtotal,
        calc.itemDiscountTotal, billDiscount ? billDiscount.type : null, billDiscount ? billDiscount.value : 0,
        calc.billDiscountAmount, calc.total, costTotal, cashTendered, cashTendered - calc.total, now],
      t,
    );
    for (const l of lines) {
      await run(
        `INSERT INTO sale_lines (id, sale_id, line_no, product_id, category_id, sku, name, unit, qty_milli, unit_price, gross_amount,
           item_discount_type, item_discount_value, item_discount_amount, bill_discount_share, net_amount, unit_cost, cost_amount, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [l.id, saleId, l.line_no, l.product.id, l.product.category_id, l.product.sku, l.product.name, l.product.unit, l.qty_milli,
          l.product.price, l.c.gross, l.discount?.type ?? null, l.discount?.value ?? 0, l.c.itemDiscount, l.c.billShare, l.c.net,
          l.unitCost, l.costAmount, l.note],
        t,
      );
      await insertMovement({
        id: newId(), product_id: l.product.id, kind: 'sale', qty_milli: -l.qty_milli, unit_cost: l.unitCost,
        sale_id: saleId, sale_line_id: l.id, device_id: device.id, occurred_at: now, created_at: now,
      }, t);
    }
    if (cart.id) await run('DELETE FROM carts WHERE id = ?', [cart.id], t);
    await rebuildSummary([...products.keys()], t);
  });
  bump();
  return { saleId, receiptNo };
}

/**
 * Marks the sale cancelled and returns its stock with reversal movements whose IDs are
 * derived from the sale line, so two devices cancelling the same sale merge into one set.
 */
export async function cancelSale(saleId) {
  const sale = await one('SELECT * FROM sales WHERE id = ?', [saleId]);
  if (!sale) throw new Error('Sale not found.');
  if (sale.status === 'cancelled') throw new Error('This sale is already cancelled.');
  const lines = await all('SELECT * FROM sale_lines WHERE sale_id = ?', [saleId]);
  const now = Date.now();
  await tx(async (t) => {
    await run(`UPDATE sales SET status = 'cancelled', cancelled_at = ?, cancelled_by = ? WHERE id = ?`, [now, device.id, saleId], t);
    for (const l of lines) {
      await run(
        `INSERT INTO stock_movements (id, product_id, kind, qty_milli, unit_cost, note, sale_id, sale_line_id, is_opening, device_id, occurred_at, created_at)
         VALUES (?, ?, 'sale_cancel', ?, ?, '', ?, ?, 0, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
        [cancelMovementId(l.id), l.product_id, l.qty_milli, l.unit_cost, saleId, l.id, device.id, now, now],
        t,
      );
    }
    await rebuildSummary([...new Set(lines.map((l) => l.product_id))], t);
  });
  bump();
}

export async function listSales({ from, to, limit = 500 }) {
  return all('SELECT * FROM sales WHERE sold_at >= ? AND sold_at < ? ORDER BY sold_at DESC, receipt_no DESC LIMIT ?', [from, to, limit]);
}

export async function getSale(id) {
  const sale = await one('SELECT * FROM sales WHERE id = ?', [id]);
  if (!sale) return null;
  sale.lines = await all('SELECT * FROM sale_lines WHERE sale_id = ? ORDER BY line_no', [id]);
  return sale;
}
