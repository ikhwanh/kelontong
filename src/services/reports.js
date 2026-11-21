import { all, one } from '../db/index.js';

const LOCAL = `(sold_at / 1000 + tz_offset_min * 60)`;

export async function headline(from, to) {
  return one(
    `SELECT COALESCE(SUM(total), 0) AS sales, COALESCE(SUM(cost_total), 0) AS cogs, COUNT(*) AS transactions,
            COALESCE(SUM(item_discount_total + bill_discount_amount), 0) AS discounts
     FROM sales WHERE status = 'completed' AND sold_at >= ? AND sold_at < ?`,
    [from, to],
  );
}

export async function salesByDay(from, to) {
  return all(
    `SELECT date(${LOCAL}, 'unixepoch') AS day, SUM(total) AS sales, COUNT(*) AS transactions
     FROM sales WHERE status = 'completed' AND sold_at >= ? AND sold_at < ?
     GROUP BY day ORDER BY day`,
    [from, to],
  );
}

export async function salesByHour(from, to) {
  return all(
    `SELECT CAST(strftime('%H', ${LOCAL}, 'unixepoch') AS INTEGER) AS hour, SUM(total) AS sales, COUNT(*) AS transactions
     FROM sales WHERE status = 'completed' AND sold_at >= ? AND sold_at < ?
     GROUP BY hour ORDER BY hour`,
    [from, to],
  );
}

export async function salesByProduct(from, to, limit = 50) {
  return all(
    `SELECT l.product_id, MAX(l.name) AS name, MAX(l.unit) AS unit, SUM(l.qty_milli) AS qty_milli,
            SUM(l.net_amount) AS sales, SUM(l.cost_amount) AS cogs, SUM(l.net_amount - l.cost_amount) AS profit
     FROM sale_lines l JOIN sales s ON s.id = l.sale_id
     WHERE s.status = 'completed' AND s.sold_at >= ? AND s.sold_at < ?
     GROUP BY l.product_id ORDER BY sales DESC LIMIT ?`,
    [from, to, limit],
  );
}

export async function salesByCategory(from, to) {
  return all(
    `SELECT l.category_id, COALESCE(c.name, 'Uncategorised') AS name,
            SUM(l.net_amount) AS sales, SUM(l.net_amount - l.cost_amount) AS profit
     FROM sale_lines l JOIN sales s ON s.id = l.sale_id LEFT JOIN categories c ON c.id = l.category_id
     WHERE s.status = 'completed' AND s.sold_at >= ? AND s.sold_at < ?
     GROUP BY l.category_id ORDER BY sales DESC`,
    [from, to],
  );
}

export async function endOfDay(dayStart, dayEnd) {
  return one(
    `SELECT
       COALESCE(SUM(status = 'completed'), 0) AS transactions,
       COALESCE(SUM(status = 'cancelled'), 0) AS cancelled_sales,
       COALESCE(SUM(CASE WHEN status = 'completed' THEN total END), 0) AS total_sales,
       COALESCE(SUM(CASE WHEN status = 'completed' THEN item_discount_total + bill_discount_amount END), 0) AS total_discounts,
       COALESCE(SUM(CASE WHEN status = 'completed' THEN total END), 0) AS expected_cash
     FROM sales WHERE sold_at >= ? AND sold_at < ?`,
    [dayStart, dayEnd],
  );
}

export async function stockOverview() {
  return one(
    `SELECT
       COALESCE(ROUND(SUM(MAX(COALESCE(s.on_hand_milli, 0), 0) * COALESCE(s.avg_cost, p.cost_price)) / 1000), 0) AS stock_value,
       COALESCE(SUM(MAX(COALESCE(s.on_hand_milli, 0), 0)), 0) AS units_milli,
       COALESCE(SUM(COALESCE(s.on_hand_milli, 0) <= p.min_stock_milli AND COALESCE(s.on_hand_milli, 0) >= 0), 0) AS low_count,
       COALESCE(SUM(COALESCE(s.on_hand_milli, 0) < 0), 0) AS neg_count
     FROM products p LEFT JOIN stock_summary s ON s.product_id = p.id
     WHERE p.is_active = 1`,
  );
}

export async function lowStockList() {
  return all(
    `SELECT p.*, COALESCE(s.on_hand_milli, 0) AS on_hand_milli
     FROM products p LEFT JOIN stock_summary s ON s.product_id = p.id
     WHERE p.is_active = 1 AND COALESCE(s.on_hand_milli, 0) <= p.min_stock_milli
     ORDER BY on_hand_milli`,
  );
}
