// Integer-rupiah checkout arithmetic, DATABASE.md §6.

export function lineGross(qtyMilli, unitPrice) {
  return Math.round((qtyMilli * unitPrice) / 1000);
}

export function discountAmount(base, discount) {
  if (!discount || !discount.type) return 0;
  const raw = discount.type === 'percent'
    ? Math.round((base * discount.value) / 10000)
    : Math.round(discount.value);
  return Math.max(0, Math.min(raw, base));
}

export function rawDiscountAmount(base, discount) {
  if (!discount || !discount.type) return 0;
  return discount.type === 'percent' ? Math.round((base * discount.value) / 10000) : Math.round(discount.value);
}

// Largest-remainder split so the shares add up to exactly `total`.
// Ties on the fractional part go to the lower index (lower line_no).
export function spreadProportionally(total, bases) {
  const sum = bases.reduce((a, b) => a + b, 0);
  if (total <= 0 || sum <= 0) return bases.map(() => 0);
  const shares = bases.map((b) => Math.floor((total * b) / sum));
  const remainders = bases.map((b, i) => ({ i, r: (total * b) % sum }));
  let left = total - shares.reduce((a, b) => a + b, 0);
  remainders.sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0 && k < remainders.length; k++, left--) shares[remainders[k].i] += 1;
  return shares;
}

/**
 * lines: [{ qty_milli, unit_price, discount: {type, value}|null, decimal_qty }]
 * billDiscount: {type, value}|null
 */
export function computeCart(lines, billDiscount) {
  const computed = lines.map((l) => {
    const gross = lineGross(l.qty_milli, l.unit_price);
    const itemDiscount = discountAmount(gross, l.discount);
    return { gross, itemDiscount, base: gross - itemDiscount };
  });
  const subtotal = computed.reduce((a, c) => a + c.gross, 0);
  const itemDiscountTotal = computed.reduce((a, c) => a + c.itemDiscount, 0);
  const afterItems = subtotal - itemDiscountTotal;
  const billDiscountAmount = discountAmount(afterItems, billDiscount);
  const shares = spreadProportionally(billDiscountAmount, computed.map((c) => c.base));
  computed.forEach((c, i) => {
    c.billShare = shares[i];
    c.net = c.base - shares[i];
  });
  const itemCount = lines.reduce((a, l) => a + (l.decimal_qty ? 1 : Math.round(l.qty_milli / 1000)), 0);
  return {
    lines: computed,
    subtotal,
    itemDiscountTotal,
    afterItems,
    billDiscountAmount,
    total: computed.reduce((a, c) => a + c.net, 0),
    itemCount,
  };
}

export function quickTenders(total) {
  const up = (step) => Math.ceil(total / step) * step;
  const out = [total];
  for (const step of [5000, 10000, 20000, 50000, 100000]) {
    const v = up(step) === total ? total + step : up(step);
    if (!out.includes(v)) out.push(v);
    if (out.length === 4) break;
  }
  return out;
}
