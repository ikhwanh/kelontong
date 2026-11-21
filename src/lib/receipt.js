import { groupThousands, formatRp } from './money.js';
import { formatQty } from './qty.js';
import { numericDateTime } from './time.js';

const WIDTH = 30;
const RULE = '-'.repeat(WIDTH);

function row(left, right) {
  const space = Math.max(1, WIDTH - left.length - right.length);
  return left + ' '.repeat(space) + right;
}

function percentLabel(bp) {
  return String(bp / 100).replace('.', ',') + '%';
}

/**
 * sale: a `sales` row; lines: its `sale_lines` rows ordered by line_no;
 * settings: { shop_name, receipt_header, receipt_footer }
 */
export function buildReceiptText(sale, lines, settings = {}) {
  const out = [];
  if (settings.shop_name?.trim()) out.push('*' + settings.shop_name.trim() + '*');
  if (settings.receipt_header?.trim()) out.push(settings.receipt_header.trim());
  if (out.length) out.push(RULE);
  out.push(sale.receipt_no + '  ' + numericDateTime(sale.sold_at));
  if (sale.status === 'cancelled') out.push('*CANCELLED*');
  for (const l of lines) {
    out.push(l.name);
    const qty = l.qty_milli % 1000 === 0 && l.unit === 'pcs'
      ? formatQty(l.qty_milli)
      : formatQty(l.qty_milli) + ' ' + l.unit;
    out.push(row('  ' + qty + ' x ' + groupThousands(l.unit_price), groupThousands(l.gross_amount)));
    if (l.item_discount_amount > 0) {
      const label = l.item_discount_type === 'percent' ? 'Discount ' + percentLabel(l.item_discount_value) : 'Discount';
      out.push(row('  ' + label, '-' + groupThousands(l.item_discount_amount)));
    }
    if (l.note) out.push('  (' + l.note + ')');
  }
  out.push(RULE);
  if (sale.bill_discount_amount > 0) {
    const label = sale.bill_discount_type === 'percent'
      ? 'Bill discount ' + percentLabel(sale.bill_discount_value)
      : 'Bill discount';
    out.push(row(label, '-' + groupThousands(sale.bill_discount_amount)));
  }
  // The asterisks make the line bold in WhatsApp; leave room for them so the
  // amount stays right-aligned with the rows around it.
  const totalRp = formatRp(sale.total);
  out.push('*TOTAL' + ' '.repeat(Math.max(1, WIDTH - 2 - 5 - totalRp.length)) + totalRp + '*');
  out.push(row('Cash', groupThousands(sale.cash_tendered)));
  out.push(row('Change', groupThousands(sale.change_due)));
  if (settings.receipt_footer?.trim()) {
    out.push(RULE);
    out.push(settings.receipt_footer.trim());
  }
  return out.join('\n');
}

// Indonesian numbers: "0812…", "812…", "+62 812…", "62812…" → "62812…"
export function normalizePhone(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.startsWith('62')) d = d.slice(2);
  d = d.replace(/^0+/, '');
  return d.length >= 8 ? '62' + d : null;
}

export function whatsappLink(phone, text) {
  return 'https://wa.me/' + phone + '?text=' + encodeURIComponent(text);
}
