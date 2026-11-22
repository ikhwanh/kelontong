import { describe, it, expect } from 'vitest';
import { formatRp, parseRupiah, groupThousands } from '../src/lib/money.js';
import { formatQty, parseQty } from '../src/lib/qty.js';
import { computeCart, spreadProportionally, lineGross, discountAmount, quickTenders } from '../src/lib/checkout.js';
import { replayCost } from '../src/lib/costing.js';
import { buildReceiptText, normalizePhone } from '../src/lib/receipt.js';
import { parseCsv } from '../src/lib/csv.js';
import { productIdForSku, categoryIdForName, cancelMovementId } from '../src/lib/ids.js';
import { cropForRegion, centeredCrop } from '../src/lib/scanRegion.js';

describe('money', () => {
  it('formats rupiah with dot separators', () => {
    expect(formatRp(12500)).toBe('Rp 12.500');
    expect(formatRp(1284000)).toBe('Rp 1.284.000');
    expect(formatRp(0)).toBe('Rp 0');
    expect(groupThousands(-3200)).toBe('-3.200');
  });
  it('parses whole rupiah only', () => {
    expect(parseRupiah('12.500')).toBe(12500);
    expect(parseRupiah('Rp 21.500')).toBe(21500);
    expect(parseRupiah('4000')).toBe(4000);
    expect(parseRupiah('12,5k')).toBeNull();
    expect(parseRupiah('12,5')).toBeNull();
  });
});

describe('quantities', () => {
  it('formats thousandths with a decimal comma and no trailing zeros', () => {
    expect(formatQty(1500)).toBe('1,5');
    expect(formatQty(750)).toBe('0,75');
    expect(formatQty(3000)).toBe('3');
    expect(formatQty(125)).toBe('0,125');
    expect(formatQty(-1000)).toBe('−1');
  });
  it('parses up to three decimals', () => {
    expect(parseQty('0,75')).toBe(750);
    expect(parseQty('1.5')).toBe(1500);
    expect(parseQty('12')).toBe(12000);
    expect(parseQty('0,1255')).toBeNull();
    expect(parseQty('abc')).toBeNull();
  });
});

describe('checkout calculation (DATABASE.md §6)', () => {
  it('matches the design cart: bill discount 3.200 split 1.586 / 916 / 414 / 284', () => {
    const lines = [
      { qty_milli: 1000, unit_price: 72000, discount: { type: 'fixed', value: 5000 } },
      { qty_milli: 2000, unit_price: 21500, discount: { type: 'percent', value: 1000 } },
      { qty_milli: 5000, unit_price: 3500, discount: null },
      { qty_milli: 750, unit_price: 16000, discount: null, decimal_qty: 1 },
    ];
    const r = computeCart(lines, { type: 'fixed', value: 3200 });
    expect(r.lines.map((l) => l.base)).toEqual([67000, 38700, 17500, 12000]);
    expect(r.afterItems).toBe(135200);
    expect(r.lines.map((l) => l.billShare)).toEqual([1586, 916, 414, 284]);
    expect(r.total).toBe(132000);
    expect(r.itemCount).toBe(1 + 2 + 5 + 1);
  });
  it('rounds decimal-quantity lines to the nearest rupiah', () => {
    expect(lineGross(333, 16000)).toBe(5328);
  });
  it('never lets a discount push a line or the bill below zero', () => {
    expect(discountAmount(4000, { type: 'fixed', value: 10000 })).toBe(4000);
    expect(discountAmount(4000, { type: 'percent', value: 15000 })).toBe(4000);
    const r = computeCart([{ qty_milli: 1000, unit_price: 5000, discount: null }], { type: 'fixed', value: 9999 });
    expect(r.total).toBe(0);
  });
  it('rounds percent discounts half up', () => {
    expect(discountAmount(43000, { type: 'percent', value: 250 })).toBe(1075);
    expect(discountAmount(1001, { type: 'percent', value: 5000 })).toBe(501);
  });
  it('shares always add up to the bill discount, ties to the lower line', () => {
    expect(spreadProportionally(10, [1, 1, 1])).toEqual([4, 3, 3]);
    for (const total of [1, 7, 999, 3200]) {
      const s = spreadProportionally(total, [12345, 6789, 3, 0, 4444]);
      expect(s.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
  it('offers sensible quick tender amounts', () => {
    expect(quickTenders(132000)).toEqual([132000, 135000, 140000, 150000]);
  });
});

describe('moving weighted average', () => {
  it('averages stock-ins and ignores other kinds', () => {
    const r = replayCost([
      { kind: 'stock_in', qty_milli: 10000, unit_cost: 13600 },
      { kind: 'sale', qty_milli: -6750, unit_cost: 13600 },
      { kind: 'stock_in', qty_milli: 12500, unit_cost: 14200 },
    ], 0);
    expect(r.onHand).toBe(15750);
    expect(Math.round(r.avg)).toBe(Math.round((3250 * 13600 + 12500 * 14200) / 15750));
  });
  it('resets to the stock-in cost when on hand is zero or negative', () => {
    const r = replayCost([
      { kind: 'sale', qty_milli: -2000, unit_cost: 0 },
      { kind: 'stock_in', qty_milli: 5000, unit_cost: 9000 },
    ], 7000);
    expect(r.avg).toBe(9000);
    expect(r.onHand).toBe(3000);
  });
  it('falls back to the product cost price with no stock-in', () => {
    expect(replayCost([], 4100).avg).toBe(4100);
  });
});

describe('receipt', () => {
  const sale = {
    receipt_no: 'A7-000142', sold_at: new Date(2026, 10, 21, 14, 32).getTime(), status: 'completed',
    bill_discount_type: 'fixed', bill_discount_value: 3200, bill_discount_amount: 3200, total: 132000, cash_tendered: 150000, change_due: 18000,
  };
  const lines = [
    { name: 'Rice 5 kg', qty_milli: 1000, unit: 'pcs', unit_price: 72000, gross_amount: 72000, item_discount_type: 'fixed', item_discount_value: 5000, item_discount_amount: 5000, note: '' },
    { name: 'Cooking Oil 1 L', qty_milli: 2000, unit: 'pcs', unit_price: 21500, gross_amount: 43000, item_discount_type: 'percent', item_discount_value: 1000, item_discount_amount: 4300, note: '' },
    { name: 'Sugar (loose)', qty_milli: 750, unit: 'kg', unit_price: 16000, gross_amount: 12000, item_discount_type: null, item_discount_value: 0, item_discount_amount: 0, note: '' },
  ];
  it('puts the header at the top and the footer at the bottom', () => {
    const t = buildReceiptText(sale, lines, { shop_name: 'Toko Maju', receipt_header: 'Jl. Merdeka 1', receipt_footer: 'Thank you!' });
    const rows = t.split('\n');
    expect(rows[0]).toBe('*Toko Maju*');
    expect(rows[1]).toBe('Jl. Merdeka 1');
    expect(rows.at(-1)).toBe('Thank you!');
    expect(t).toContain('A7-000142  21/11/2026 14:32');
    expect(t).toContain('  Discount 10%');
    expect(t).toContain('  0,75 kg x 16.000');
    expect(t).toMatch(/\*TOTAL\s+Rp 132\.000\*/);
  });
  it('normalizes Indonesian phone numbers for wa.me', () => {
    expect(normalizePhone('0812-3456-7890')).toBe('6281234567890');
    expect(normalizePhone('+62 812 3456 7890')).toBe('6281234567890');
    expect(normalizePhone('812 3456 7890')).toBe('6281234567890');
    expect(normalizePhone('123')).toBeNull();
  });
});

describe('csv', () => {
  it('handles quotes and semicolon exports', () => {
    expect(parseCsv('sku,name\r\nA-1,"Water, 600 ml"\r\n')).toEqual([['sku', 'name'], ['A-1', 'Water, 600 ml']]);
    expect(parseCsv('sku;price\nA;4.000\n')).toEqual([['sku', 'price'], ['A', '4.000']]);
  });
});

describe('deterministic ids', () => {
  it('derives the same id on every device', () => {
    expect(productIdForSku(' drk-001 ')).toBe(productIdForSku('DRK-001'));
    expect(categoryIdForName('Drinks ')).toBe(categoryIdForName('drinks'));
    expect(cancelMovementId('x')).toBe(cancelMovementId('x'));
    expect(productIdForSku('A')).not.toBe(productIdForSku('B'));
  });
});

describe('scan region', () => {
  const rect = (left, top, width, height) => ({ left, top, width, height });

  it('maps the on-screen frame onto a portrait stream shown with object-fit: cover', () => {
    // 390x844 phone screen, 720x1280 stream: scaled by 844/1280, sides trimmed.
    const c = cropForRegion(rect(0, 0, 390, 844), rect(50, 256, 290, 180), 720, 1280);
    expect(c.x + c.w / 2).toBeCloseTo(360, 0);
    expect(c.y + c.h / 2).toBeCloseTo(525, 0);
    expect(c.w).toBe(528);
    expect(c.h).toBe(300);
  });

  it('decodes a wider area when the frame covers few camera pixels', () => {
    const c = cropForRegion(rect(0, 0, 1280, 800), rect(495, 310, 290, 180), 1280, 720);
    expect(c.w).toBe(768);
    expect(c.x + c.w / 2).toBeCloseTo(640, 0);
  });

  it('keeps the crop inside the stream', () => {
    const c = cropForRegion(rect(0, 0, 390, 844), rect(-100, -50, 290, 180), 720, 1280);
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
    expect(c.x + c.w).toBeLessThanOrEqual(720);
  });

  it('falls back to the middle of the stream before layout', () => {
    expect(cropForRegion(rect(0, 0, 0, 0), rect(0, 0, 0, 0), 1280, 720)).toEqual(centeredCrop(1280, 720));
  });
});
