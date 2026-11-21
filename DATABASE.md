# POS database design (draft)

Status: draft for review. Source documents: [SPECS.md](SPECS.md) and the "POS App Design" canvas (checkout, cart, discount, payment, receipt, sales, cancel sale, stock list, stock movement, import, reports, sync & settings, install gate).

## 1. Ground rules

The database is SQLite running in the browser (WebAssembly), with cr-sqlite turning the shared tables into CRRs (conflict-free replicated relations). Every rule below exists because of how cr-sqlite merges.

| Rule | Why |
|---|---|
| Every replicated table has a non-integer primary key (UUID text). No `AUTOINCREMENT`. | Two offline devices would both create row `42`. |
| No `UNIQUE` constraints or unique indexes other than the primary key. | cr-sqlite refuses to make such a table a CRR, and a merge could not honour them anyway. Uniqueness is either enforced in the app or by making the natural key the primary key (see barcodes). |
| No declared `FOREIGN KEY` constraints. References are logical only. | Changes from another device can arrive in any order, so a child row may land before its parent. |
| Every non-PK `NOT NULL` column has a `DEFAULT`. | A merge can create a row from a single column's change. |
| `CHECK` constraints only test one column. | A merge combines columns from different writers; a cross-column check could fail and abort the whole import. |
| Every `CHECK` accepts its column's `DEFAULT` (`qty_milli >= 0`, `kind IN ('', …)`). | A merge first creates the row from defaults and then applies the incoming columns. A default the check rejects aborts the import with "constraint failed" (found in the spike). |
| Rows that record history are insert-only: sales, sale lines, stock movements. The only later write is a sale's cancel fields. | cr-sqlite merges with last-write-wins per column. Anything two devices could both update (such as a stock quantity) loses one device's write. |
| No hard deletes, except `product_barcodes`. Products and categories are archived with `is_active = 0`. | Sale lines and movements keep pointing at them. |
| Money is `INTEGER` rupiah. Quantities are `INTEGER` thousandths of a unit (`*_milli`: 1 pcs = 1000, 0,75 kg = 750). Percentages are `INTEGER` hundredths of a percent (`*_bp`, basis points: 2,5% = 250). Time is `INTEGER` milliseconds since the Unix epoch, UTC. | Spec §2. Integers merge and sum exactly, where `REAL` would drift (0.1 + 0.2 ≠ 0.3). |

### IDs

- Default: UUIDv7 as lowercase text. It sorts by time, which keeps indexes compact.
- Deterministic IDs (UUIDv5 over a fixed app namespace) where two devices must produce **the same row** for the same real-world fact, so the merge collapses them into one row instead of duplicating it:

| Row | ID derived from | Prevents |
|---|---|---|
| Product created by import or by hand | `'product:' + normalized SKU` | Importing the same product file on two devices creating every product twice |
| Category | `'category:' + lower(trim(name))` | Same, for category names in the import file |
| Opening-stock movement | `'opening:' + sha256(import file) + ':' + product_id` | Opening stock counted twice when the same file is imported again, on the same device or another one |
| Cancel-reversal movement | `'cancel:' + sale_line_id` | Two devices cancelling the same sale while offline and returning the stock twice |

The ID is derived once, at creation. Renaming a SKU or category later keeps its ID. If the derived ID already exists locally for a different SKU (the old SKU was renamed and a new product now reuses it), the app falls back to a random UUIDv7.

## 2. Table overview

```
Replicated (CRR, exported in sync files)        Local only (never exported)
─────────────────────────────────────────       ───────────────────────────────
devices            one row per device            local_meta      key/value device state
settings           shop-wide key/value           carts           active + parked carts
categories                                       stock_summary   on-hand + avg-cost cache
products                                         sync_imports    import history
product_barcodes   PK = barcode
sales              insert-only, cancel fields
sale_lines         insert-only
stock_movements    insert-only ledger
```

Relationships (logical, not enforced):

```
categories 1─* products 1─* product_barcodes
                   │
                   ├─* stock_movements *─0..1 sale_lines
                   │
                   └─* sale_lines *─1 sales *─1 devices
```

## 3. Replicated tables

### devices

Each device writes only its own row, on first run and when its code or app version changes.

```sql
CREATE TABLE devices (
  id            TEXT PRIMARY KEY NOT NULL,         -- hex(crsql_site_id())
  code          TEXT NOT NULL DEFAULT '',          -- short code, e.g. 'A7'; prefix of receipt numbers
  name          TEXT NOT NULL DEFAULT '',          -- optional label, e.g. 'Front counter tablet'
  app_version   TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL DEFAULT 0,
  updated_at    INTEGER NOT NULL DEFAULT 0
);
SELECT crsql_as_crr('devices');
```

Device codes must differ between devices, but a `UNIQUE` constraint isn't allowed. The app:
1. picks a random code (letter + digit) on first run, avoiding codes already in `devices`;
2. after every import, checks for another `devices` row with the same `code` and, if it finds one, asks the user to change this device's code. Receipts already issued keep their number. Sale IDs are UUIDs, so a collision only affects the receipt numbers people read, never the data.

### settings

Shop-wide settings that every device should share.

```sql
CREATE TABLE settings (
  key         TEXT PRIMARY KEY NOT NULL,
  value       TEXT NOT NULL DEFAULT '',
  updated_at  INTEGER NOT NULL DEFAULT 0
);
SELECT crsql_as_crr('settings');
```

Keys: `shop_name`, `receipt_header`, `receipt_footer`. Last write wins per key, which is the right behaviour here.

### categories

```sql
CREATE TABLE categories (
  id          TEXT PRIMARY KEY NOT NULL,           -- uuidv5('category:' + lower(trim(name)))
  name        TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at  INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL DEFAULT 0
);
SELECT crsql_as_crr('categories');
```

### products

Variants are separate products (spec §3), so there is no variant table.

```sql
CREATE TABLE products (
  id           TEXT PRIMARY KEY NOT NULL,          -- uuidv5('product:' + normalized sku) at creation
  sku          TEXT NOT NULL DEFAULT '',
  name         TEXT NOT NULL DEFAULT '',
  category_id  TEXT,                               -- → categories.id, NULL = uncategorised
  unit         TEXT NOT NULL DEFAULT 'pcs',        -- display only; one unit per product
  decimal_qty  INTEGER NOT NULL DEFAULT 0 CHECK (decimal_qty IN (0, 1)),  -- 1 = sold in fractions (kg, litre, metre)
  price        INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),        -- selling price per whole unit, rupiah
  cost_price   INTEGER NOT NULL DEFAULT 0 CHECK (cost_price >= 0),   -- per whole unit; see note
  min_stock_milli INTEGER NOT NULL DEFAULT 0,
  is_active    INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at   INTEGER NOT NULL DEFAULT 0,
  updated_at   INTEGER NOT NULL DEFAULT 0
);
SELECT crsql_as_crr('products');
CREATE INDEX products_sku      ON products (sku);
CREATE INDEX products_category ON products (category_id, is_active);
CREATE INDEX products_name     ON products (name COLLATE NOCASE);
```

- `cost_price` is the cost entered on the product form or in the import file. It pre-fills the stock-in form, prices the opening-stock movement, and is the fallback average cost for a product with no stock-in yet. The real average cost comes from the ledger (§5).
- SKU uniqueness is checked by the app on save and on import. If a merge still produces two active products with the same SKU (two devices created them by hand with different IDs), the stock list flags both, and the import reports that SKU as an error row until one is archived.
- Concurrent edits to different fields merge cleanly: device A changes the price, device B the name, and both edits survive.
- **Decimal quantities.** Every quantity in the schema is stored in thousandths, so up to three decimals (0,125 kg). `decimal_qty` only controls the UI:
  - `0` (pcs, pack, box): the cart's − / + buttons step by 1, and the app refuses fractions.
  - `1` (kg, litre, metre): the cart opens a keypad for the quantity, and stock-in, stock-out, opname and minimum stock accept decimals.
  - Quantities are shown with a decimal comma and without trailing zeros: "1,5 kg", "0,75 kg", "3 pcs".
  - Import: the template gets a `decimal_qty` column (yes/no). A decimal in opening stock or minimum stock on a whole-unit product is an error row.
  - Switching an existing product from decimal to whole units is refused while its on-hand stock has a fractional part.

### product_barcodes

```sql
CREATE TABLE product_barcodes (
  barcode     TEXT PRIMARY KEY NOT NULL,           -- trimmed, as scanned
  product_id  TEXT NOT NULL DEFAULT '',            -- → products.id
  created_at  INTEGER NOT NULL DEFAULT 0
);
SELECT crsql_as_crr('product_barcodes');
CREATE INDEX product_barcodes_product ON product_barcodes (product_id);
```

Making the barcode itself the primary key is the only way to keep it unique across devices. If two offline devices assign the same barcode to different products, the merge keeps one assignment (last write wins) instead of leaving a barcode that matches two products. On a single device the app refuses a barcode that already belongs to another product (the import shows "Barcode … already belongs to DRK-001"). This is the one replicated table where rows are deleted: removing a barcode deletes its row.

### sales

One row per completed sale. Written once at checkout. Afterwards only `status`, `cancelled_at` and `cancelled_by` change, once, when the sale is cancelled.

```sql
CREATE TABLE sales (
  id                   TEXT PRIMARY KEY NOT NULL,  -- uuidv7
  device_id            TEXT NOT NULL DEFAULT '',   -- → devices.id
  device_code          TEXT NOT NULL DEFAULT '',   -- copied at sale time
  device_seq           INTEGER NOT NULL DEFAULT 0, -- per-device running number
  receipt_no           TEXT NOT NULL DEFAULT '',   -- device_code || '-' || printf('%06d', device_seq)
  status               TEXT NOT NULL DEFAULT 'completed'
                         CHECK (status IN ('completed', 'cancelled')),
  sold_at              INTEGER NOT NULL DEFAULT 0, -- UTC ms
  tz_offset_min        INTEGER NOT NULL DEFAULT 0, -- device offset at sale time, e.g. 420 for WIB
  line_count           INTEGER NOT NULL DEFAULT 0,
  item_count           INTEGER NOT NULL DEFAULT 0, -- pieces: whole-unit lines add their qty, decimal lines add 1
  subtotal             INTEGER NOT NULL DEFAULT 0, -- Σ line gross_amount
  item_discount_total  INTEGER NOT NULL DEFAULT 0, -- Σ line item discounts
  bill_discount_type   TEXT CHECK (bill_discount_type IN ('percent', 'fixed')),  -- NULL = none
  bill_discount_value  INTEGER NOT NULL DEFAULT 0, -- as typed: basis points for percent (250 = 2,5%), rupiah for fixed
  bill_discount_amount INTEGER NOT NULL DEFAULT 0, -- resulting rupiah
  total                INTEGER NOT NULL DEFAULT 0, -- subtotal − item_discount_total − bill_discount_amount
  cost_total           INTEGER NOT NULL DEFAULT 0, -- Σ line cost_amount (COGS)
  cash_tendered        INTEGER NOT NULL DEFAULT 0,
  change_due           INTEGER NOT NULL DEFAULT 0,
  cancelled_at         INTEGER,                    -- UTC ms
  cancelled_by         TEXT,                       -- → devices.id
  created_at           INTEGER NOT NULL DEFAULT 0
);
SELECT crsql_as_crr('sales');
CREATE INDEX sales_sold_at ON sales (sold_at);
CREATE INDEX sales_device  ON sales (device_code, device_seq);
```

- **Receipt number.** `device_seq = 1 + MAX(device_seq) WHERE device_code = <this device's code>`. Only one device sells under a code, so the number never collides. Keying on the code instead of the site ID means a device rebuilt from a backup under its old code continues its old sequence.
- **Totals are stored on the sale** so the sales list and the reports don't have to aggregate lines. This is safe because the values never change after checkout.
- **Cancelling** (one transaction): set `status = 'cancelled'`, `cancelled_at`, `cancelled_by`, and insert one reversal movement per line with the deterministic ID `'cancel:' + sale_line_id`. If two devices cancel the same sale while offline, their reversal rows have the same IDs and merge into one set, and the cancel fields merge to whichever write is later. The app never writes `status = 'completed'` on an existing sale, so a cancelled sale can't be restored.
- **Local time.** Reports group by local day and hour with `(sold_at / 1000) + tz_offset_min * 60` as the `unixepoch` input. The browser's SQLite has no reliable `localtime`, so the offset is stored with the sale.

### sale_lines

Snapshot of everything needed to show the receipt and compute profit, even after the product is edited or archived.

```sql
CREATE TABLE sale_lines (
  id                  TEXT PRIMARY KEY NOT NULL,   -- uuidv7
  sale_id             TEXT NOT NULL DEFAULT '',    -- → sales.id
  line_no             INTEGER NOT NULL DEFAULT 0,  -- order on the receipt
  product_id          TEXT NOT NULL DEFAULT '',    -- → products.id
  category_id         TEXT,                        -- snapshot, for sales by category
  sku                 TEXT NOT NULL DEFAULT '',    -- snapshot
  name                TEXT NOT NULL DEFAULT '',    -- snapshot
  unit                TEXT NOT NULL DEFAULT '',    -- snapshot, for the receipt ("0,75 kg")
  qty_milli           INTEGER NOT NULL DEFAULT 0 CHECK (qty_milli >= 0), -- 1 pcs = 1000, 0,75 kg = 750; the app never writes 0
  unit_price          INTEGER NOT NULL DEFAULT 0,  -- snapshot of products.price, per whole unit
  gross_amount        INTEGER NOT NULL DEFAULT 0,  -- round(qty_milli × unit_price / 1000)
  item_discount_type  TEXT CHECK (item_discount_type IN ('percent', 'fixed')),
  item_discount_value INTEGER NOT NULL DEFAULT 0,  -- as typed: basis points or rupiah
  item_discount_amount INTEGER NOT NULL DEFAULT 0, -- rupiah, ≤ gross_amount
  bill_discount_share INTEGER NOT NULL DEFAULT 0,  -- this line's part of sales.bill_discount_amount
  net_amount          INTEGER NOT NULL DEFAULT 0,  -- gross − item discount − bill share
  unit_cost           INTEGER NOT NULL DEFAULT 0,  -- moving average cost at time of sale, rounded
  cost_amount         INTEGER NOT NULL DEFAULT 0,  -- round(qty_milli × unit_cost / 1000)
  note                TEXT NOT NULL DEFAULT ''
);
SELECT crsql_as_crr('sale_lines');
CREATE INDEX sale_lines_sale    ON sale_lines (sale_id, line_no);
CREATE INDEX sale_lines_product ON sale_lines (product_id);
```

Gross profit per line is `net_amount − cost_amount`. It never changes later, because both values are frozen at checkout (spec §3, costing).

### stock_movements

The stock ledger. On-hand stock is `SUM(qty_milli)` per product. There is deliberately no stock-quantity column anywhere in the replicated schema.

```sql
CREATE TABLE stock_movements (
  id            TEXT PRIMARY KEY NOT NULL,         -- uuidv7, or deterministic (§1)
  product_id    TEXT NOT NULL DEFAULT '',          -- → products.id
  kind          TEXT NOT NULL DEFAULT ''
                  CHECK (kind IN ('', 'sale', 'sale_cancel', 'stock_in', 'stock_out', 'opname')),
  qty_milli     INTEGER NOT NULL DEFAULT 0,        -- signed thousandths: + into stock, − out of stock
  unit_cost     INTEGER NOT NULL DEFAULT 0,        -- stock_in: purchase cost; sale/sale_cancel: line unit_cost
  reason        TEXT CHECK (reason IN ('damaged', 'lost', 'own_use')),  -- stock_out only
  note          TEXT NOT NULL DEFAULT '',          -- supplier note (stock_in) or free note
  counted_milli INTEGER,                           -- opname: count on the shelf
  system_milli  INTEGER,                           -- opname: on-hand shown when counting
  sale_id       TEXT,                              -- sale / sale_cancel → sales.id
  sale_line_id  TEXT,                              -- sale / sale_cancel → sale_lines.id
  is_opening    INTEGER NOT NULL DEFAULT 0 CHECK (is_opening IN (0, 1)),  -- stock_in from import
  device_id     TEXT NOT NULL DEFAULT '',          -- → devices.id
  occurred_at   INTEGER NOT NULL DEFAULT 0,        -- UTC ms
  created_at    INTEGER NOT NULL DEFAULT 0
);
SELECT crsql_as_crr('stock_movements');
CREATE INDEX stock_movements_product ON stock_movements (product_id, occurred_at, id);
CREATE INDEX stock_movements_sale    ON stock_movements (sale_id);
```

| Kind | Written when | qty_milli | unit_cost |
|---|---|---|---|
| `sale` | checkout, one per sale line | `−line.qty_milli` | `line.unit_cost` |
| `sale_cancel` | cancel, one per sale line, ID `'cancel:' + sale_line_id` | `+line.qty_milli` | `line.unit_cost` |
| `stock_in` | stock-in form, or import opening stock (`is_opening = 1`, ID `'opening:' + sha256(file) + ':' + product_id`) | `+n` | cost entered, or the row's cost price on import |
| `stock_out` | stock-out form, with `reason` | `−n` | 0 (valued at average) |
| `opname` | stock count | `counted_milli − system_milli` (may be 0) | 0 |

Notes:
- **Opening stock on import** creates a stock-in for every row with a value, whether the row creates a product or updates one. The value is added to the current stock; it doesn't replace it. Because the movement ID includes the file's hash, re-importing the same file adds nothing. The preview looks up each row's movement ID first. Update rows show the value as "+24 stock in", and rows whose movement already exists show "already imported".
- **Opname is a delta.** It records the difference between the shelf count and what this device knew at the time. Sales from another device that happened before the count but arrive afterwards still apply on top of the count. The stock count screen should tell the user to import every device's latest sync file before counting.
- **Negative stock is allowed** (spec §3). Nothing in the schema prevents it.

## 4. Local-only tables

These are plain SQLite tables, **not** CRRs, so they never appear in `crsql_changes` or in sync files.

```sql
-- Device-local key/value state.
CREATE TABLE local_meta (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
-- keys: last_export_at, persist_granted, theme ('system'|'light'|'dark'),
--       export_reminder_snoozed_until

-- The cart being rung up, plus parked carts. Kept in the database so a reload
-- or crash doesn't lose a sale in progress. Lines are JSON because a cart is
-- short-lived and becomes sale_lines at checkout.
CREATE TABLE carts (
  id                   TEXT PRIMARY KEY,           -- uuidv7
  status               TEXT NOT NULL CHECK (status IN ('active', 'parked')),
  note                 TEXT NOT NULL DEFAULT '',   -- e.g. "Customer fetching wallet"
  lines_json           TEXT NOT NULL DEFAULT '[]', -- [{product_id, qty_milli, note, discount:{type,value}|null}]
  bill_discount_type   TEXT CHECK (bill_discount_type IN ('percent', 'fixed')),
  bill_discount_value  INTEGER NOT NULL DEFAULT 0,
  created_at           INTEGER NOT NULL,
  parked_at            INTEGER
);
CREATE UNIQUE INDEX carts_one_active ON carts (status) WHERE status = 'active';

-- Cache, rebuilt from stock_movements (§5). Safe to drop at any time.
CREATE TABLE stock_summary (
  product_id   TEXT PRIMARY KEY,
  on_hand_milli INTEGER NOT NULL,
  avg_cost     REAL NOT NULL,                      -- per whole unit, full precision; rounded only when copied to a sale line
  updated_at   INTEGER NOT NULL
);
CREATE INDEX stock_summary_on_hand ON stock_summary (on_hand_milli);

-- One row per import attempt, including rejected ones.
CREATE TABLE sync_imports (
  id               TEXT PRIMARY KEY,
  imported_at      INTEGER NOT NULL,
  file_device_code TEXT NOT NULL,
  file_device_id   TEXT NOT NULL,
  file_app_version TEXT NOT NULL,
  file_exported_at INTEGER NOT NULL,
  change_count     INTEGER NOT NULL,               -- rows in the file
  applied_count    INTEGER NOT NULL DEFAULT 0,     -- rows that changed something
  status           TEXT NOT NULL CHECK (status IN ('merged', 'version_mismatch', 'invalid_file', 'error')),
  message          TEXT NOT NULL DEFAULT ''
);
CREATE INDEX sync_imports_device ON sync_imports (file_device_id, imported_at);
```

- Parked carts are local, so a sale parked on one device can only be resumed there. Syncing carts would mean merging two cashiers' edits to the same cart, which last-write-wins does badly.
- The update prompt (spec §6) checks `SELECT 1 FROM carts WHERE status = 'active' AND lines_json <> '[]'` before it allows a reload.
- The Sync screen's "Imported from B3 · today 12:40 · 214 changes merged" and the Reports note "B3 last imported today 12:40" both come from `sync_imports`.

## 5. Stock and costing

### On hand

```sql
SELECT product_id, SUM(qty_milli) AS on_hand_milli
FROM stock_movements
GROUP BY product_id;
```

### Moving weighted average cost

The average depends on the order of movements, so it is replayed per product in `(occurred_at, id)` order:

```
on_hand = 0, avg = product.cost_price                         # on_hand in thousandths, avg per whole unit
for m in movements(product) ordered by occurred_at, id:
    if m.kind == 'stock_in':
        if on_hand <= 0: avg = m.unit_cost                      # nothing (or a deficit) to average against
        else:            avg = (on_hand*avg + m.qty_milli*m.unit_cost) / (on_hand + m.qty_milli)
    on_hand += m.qty_milli                                      # other kinds leave avg unchanged
```

- The result goes into `stock_summary`. Rebuild it for the affected products after a local write, and for every product touched by an import (`SELECT DISTINCT product_id` from imported `stock_movements` changes). Rebuilding everything on startup is also cheap at a single shop's scale.
- When a stock-in from another device arrives late, the replay places it at its real `occurred_at`, so the current average becomes correct. Past sale lines keep the cost they were sold at, as the spec requires.
- Checkout copies `ROUND(avg_cost)` into `sale_lines.unit_cost`.

### Stock value and low stock

```sql
-- Stock value (Reports → Stock). Negative on-hand counts as zero value.
SELECT ROUND(SUM(MAX(s.on_hand_milli, 0) * s.avg_cost) / 1000)
FROM stock_summary s JOIN products p ON p.id = s.product_id
WHERE p.is_active = 1;

-- Low-stock list, negative stock included (spec §3).
SELECT p.*, s.on_hand_milli
FROM products p JOIN stock_summary s ON s.product_id = p.id
WHERE p.is_active = 1 AND s.on_hand_milli <= p.min_stock_milli
ORDER BY s.on_hand_milli;
```

Products with no movements need a `stock_summary` row with `on_hand_milli = 0`, or the queries above need a `LEFT JOIN` with `COALESCE`.

## 6. Checkout calculation

All arithmetic is integer rupiah. Percent results round half up to the nearest rupiah (`Math.round`).

1. Per line: `gross = round(qty_milli × unit_price / 1000)`. For whole-unit products this is exact. For decimal products it rounds to the nearest rupiah (0,333 kg × Rp 16.000 = Rp 5.328).
2. Item discount: percent → `round(gross × bp / 10000)` (`bp` = basis points, so 2,5% = 250); fixed → the value. Then `min(…, gross)` so a line never goes below zero.
3. `after_items = Σ (gross − item_discount)`.
4. Bill discount: percent → `round(after_items × bp / 10000)`; fixed → the value. Then `min(…, after_items)`.
5. Share the bill discount across lines **in proportion to `gross − item_discount`**, by largest remainder so the shares add up to exactly the bill discount:
   ```
   base_i  = gross_i − item_discount_i
   exact_i = bill × base_i / after_items
   share_i = floor(exact_i)
   give the remaining (bill − Σ share_i) rupiah, one each, to the lines with the
   largest fractional part of exact_i (ties → lower line_no)
   ```
6. `net_i = base_i − share_i`. `total = Σ net_i`.
7. Write in **one transaction**: the `sales` row, its `sale_lines`, one `sale` movement per line, and delete the active cart.

Check against the design's cart: lines after item discounts are 67.000 + 38.700 + 17.500 + 12.000 = 135.200. A bill discount of Rp 3.200 is split 1.586 / 916 / 414 / 284, so the total is Rp 132.000.

## 7. Sync file

### Export

```sql
SELECT "table", pk, cid, val, col_version, db_version,
       COALESCE(site_id, crsql_site_id()) AS site_id, cl, seq
FROM crsql_changes;
```

Export **all** changes, including those received from other devices. The file is then a complete backup (spec §7), and devices can relay each other's data (A → B → C).

File layout before compression:

```json
{
  "format": 1,
  "app_version": "1.3.2",
  "schema_version": 1,
  "device_id": "3f9c…e21a",
  "device_code": "A7",
  "exported_at": 1795229136000,
  "db_version": 18342,
  "changes": [["sales", "<pk b64>", "total", 132000, 1, 18001, "<site b64>", 1, 0], …]
}
```

- Blobs (`pk`, `site_id`, and any blob `val`) are base64 strings. `val` keeps its SQLite type: integer, real, text, null, or a tagged blob `{"b": "<b64>"}`.
- Compress with `CompressionStream('gzip')`.
- **Check before building:** Chrome's Web Share API only shares an allow-list of file types (PDF, plain text, CSV, images, audio, video). `.gz`, `.zip` and `.json` are not on it. The likely answer is to base64 the gzip bytes and share them as `pos-sync-A7-20261121-1432.txt` (`text/plain`), which also works as a Web Share Target type on Android. Verify on the three target platforms before fixing the format.
- After a successful share or download, set `local_meta.last_export_at`. It drives the "Last export 3 days ago" reminder.

### Import

1. Decode the file. If it isn't valid, log `invalid_file` and stop.
2. If `app_version` differs from this app's version, log `version_mismatch` and stop without touching the replicated tables (spec §7).
3. In one transaction:
   ```sql
   INSERT INTO crsql_changes ("table", pk, cid, val, col_version, db_version, site_id, cl, seq)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);   -- once per change
   ```
   cr-sqlite ignores changes it already has, so importing the same file twice changes nothing.
4. Rebuild `stock_summary` for the affected products, run the device-code collision check (§3 `devices`), and log `merged` with the counts. `applied_count` comes from comparing `crsql_db_version()` before and after, or from counting changed rows per table.

A file from the importing device itself (for example a restored backup) is harmless: those changes are already present.

## 8. Reports

Every sales report filters `status = 'completed'` and a `sold_at` range. The app turns the local date range into UTC milliseconds.

```sql
-- local day / hour expressions used below
-- day:  date(s.sold_at/1000 + s.tz_offset_min*60, 'unixepoch')
-- hour: CAST(strftime('%H', s.sold_at/1000 + s.tz_offset_min*60, 'unixepoch') AS INTEGER)

-- Headline: sales, COGS, gross profit, transactions
SELECT SUM(total) AS sales, SUM(cost_total) AS cogs,
       SUM(total) - SUM(cost_total) AS gross_profit, COUNT(*) AS transactions
FROM sales s
WHERE status = 'completed' AND sold_at >= :from AND sold_at < :to;

-- Sales by day (same shape for hour)
SELECT date(sold_at/1000 + tz_offset_min*60, 'unixepoch') AS day,
       SUM(total) AS sales, COUNT(*) AS transactions
FROM sales
WHERE status = 'completed' AND sold_at >= :from AND sold_at < :to
GROUP BY day ORDER BY day;

-- Sales and profit by product (by category: group on l.category_id)
SELECT l.product_id, MAX(l.name) AS name, SUM(l.qty_milli) AS qty_milli,
       SUM(l.net_amount) AS sales, SUM(l.net_amount - l.cost_amount) AS profit
FROM sale_lines l JOIN sales s ON s.id = l.sale_id
WHERE s.status = 'completed' AND s.sold_at >= :from AND s.sold_at < :to
GROUP BY l.product_id ORDER BY sales DESC;

-- End of day (today's local range)
SELECT
  SUM(status = 'completed')                                            AS transactions,
  SUM(status = 'cancelled')                                            AS cancelled_sales,
  SUM(CASE WHEN status = 'completed' THEN total END)                   AS total_sales,
  SUM(CASE WHEN status = 'completed'
           THEN item_discount_total + bill_discount_amount END)        AS total_discounts,
  SUM(CASE WHEN status = 'completed' THEN total END)                   AS expected_cash
FROM sales
WHERE sold_at >= :day_start AND sold_at < :day_end;
```

- Expected cash equals total sales because payment is cash only. Change is already netted out (`cash_tendered − change_due = total`). If cash in/out of the drawer is added later, it needs its own table.
- A cancelled sale counts in the day it was sold, not the day it was cancelled. If it should be counted on the cancel day instead, filter on `cancelled_at`.
- Reports show data from every device whose changes have been imported. The header lists `devices` and each device's latest `sync_imports.imported_at`.

## 9. Schema changes

- `PRAGMA user_version` holds the local schema version. Migrations run at startup, in order, before the app opens.
- Changing a CRR uses `SELECT crsql_begin_alter('t'); ALTER TABLE t …; SELECT crsql_commit_alter('t');`.
- Add columns only, each with a `DEFAULT`. Never rename or drop a replicated column. Mark it unused instead, because older sync files and backups still contain it.
- Sync files are refused across app versions (spec §7), so a schema change ships together with an app version bump and every device has to update before syncing again.
- Call `SELECT crsql_finalize();` before closing the database.

## 10. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | Opening stock on an existing SKU | Applied to every row, new or updated, and added to current stock. Re-importing the same file is a no-op (§3 `stock_movements`). |
| 2 | Deterministic product IDs from SKU | Accepted, including the edge case where a renamed SKU's old value is reused. |
| 3 | Percent discounts | Decimals allowed, up to two places (2,5%, 12,75%). Stored as basis points in `*_discount_value`. |
| 4 | Quantities | Decimals allowed, up to three places, stored in thousandths (`*_milli`). Per product, `decimal_qty` controls whether the UI accepts fractions (§3 `products`). |
| 5 | Customer phone numbers | Not stored. The cashier types the number for each WhatsApp receipt. |
| 6 | Parked carts | Local to the device that parked them (§4). |
| 7 | cr-sqlite | Kept. We build the WASM from source and commit it (§12). |

## 11. Food and beverage (not planned)

The schema targets retail: one stock item per product, and a sale that is paid as soon as it is rung up. Packaged drinks and snacks, and loose goods sold by weight, already work. A café or restaurant would also need recipes (one latte uses beans and milk from stock), modifiers with their own prices (less sugar, large size), open orders paid at the end, and kitchen tickets. The spec rules out recipes and printing. None of these would change the existing tables; each would be a new table.

## 12. cr-sqlite safeguards

cr-sqlite's last tagged release is v0.16.3 (January 2024), and the npm WASM package is older than that. The library is small and stable, but don't expect fixes from upstream.

1. **Build it ourselves (decided).** Build the WASM from the v0.16.3 tag (it fixes a WASM out-of-memory bug), commit the build output, and don't depend on npm for it. Write the build steps down in the repo so the build can be reproduced.
2. **Spike before building screens.** On an installed PWA on an Android tablet, a Windows PC and an iPad:
   - the database survives closing the app, rebooting and a week of disuse;
   - `navigator.storage.persist()` is granted;
   - export and import of about 100k changes (roughly a year of sales) finish in acceptable time and memory;
   - the share sheet accepts the sync file (§7).
3. **Wrap sync in one module.** The only public functions are `exportChanges(): Uint8Array` and `importChanges(bytes)`. Nothing else in the app calls `crsql_*`; it all uses plain SQL. The `crsql_as_crr` calls live in migrations.
4. **Keep a fallback possible.** Most of the schema is insert-only (sales, sale lines, movements), so a hand-written replacement is realistic if cr-sqlite fails the spike. Insert-only tables would merge with `INSERT OR IGNORE`. The few mutable tables (products, categories, barcodes, settings, devices, and the sale cancel fields) would merge last-write-wins per column, using a hybrid logical clock stored per column. The ground rules in §1 already fit that design, so switching wouldn't change the schema.
5. **Alternative checked: SQLite Sync (sqliteai).** It has a WASM build and several CRDT types, but it is built around SQLite Cloud, PostgreSQL and Supabase as the sync server. Its licence is Elastic 2.0, and its README asks production users to contact the vendor for a commercial licence. It fits a no-server, file-based design less well than cr-sqlite.
