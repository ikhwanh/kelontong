// Migrations run in order at startup; PRAGMA user_version records the last applied one.
// Replicated tables follow DATABASE.md §1: UUID text PKs, no UNIQUE, no FOREIGN KEY,
// a DEFAULT on every NOT NULL column, single-column CHECKs only, and every CHECK must
// accept its column's DEFAULT: a merge first creates the row from defaults, then
// applies the incoming columns, so a default the CHECK rejects aborts the import.
export const migrations = [
  [
    `CREATE TABLE devices (
      id            TEXT PRIMARY KEY NOT NULL,
      code          TEXT NOT NULL DEFAULT '',
      name          TEXT NOT NULL DEFAULT '',
      app_version   TEXT NOT NULL DEFAULT '',
      created_at    INTEGER NOT NULL DEFAULT 0,
      updated_at    INTEGER NOT NULL DEFAULT 0
    )`,
    `SELECT crsql_as_crr('devices')`,

    `CREATE TABLE settings (
      key         TEXT PRIMARY KEY NOT NULL,
      value       TEXT NOT NULL DEFAULT '',
      updated_at  INTEGER NOT NULL DEFAULT 0
    )`,
    `SELECT crsql_as_crr('settings')`,

    `CREATE TABLE categories (
      id          TEXT PRIMARY KEY NOT NULL,
      name        TEXT NOT NULL DEFAULT '',
      sort_order  INTEGER NOT NULL DEFAULT 0,
      is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at  INTEGER NOT NULL DEFAULT 0,
      updated_at  INTEGER NOT NULL DEFAULT 0
    )`,
    `SELECT crsql_as_crr('categories')`,

    `CREATE TABLE products (
      id              TEXT PRIMARY KEY NOT NULL,
      sku             TEXT NOT NULL DEFAULT '',
      name            TEXT NOT NULL DEFAULT '',
      category_id     TEXT,
      unit            TEXT NOT NULL DEFAULT 'pcs',
      decimal_qty     INTEGER NOT NULL DEFAULT 0 CHECK (decimal_qty IN (0, 1)),
      price           INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
      cost_price      INTEGER NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
      min_stock_milli INTEGER NOT NULL DEFAULT 0,
      is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at      INTEGER NOT NULL DEFAULT 0,
      updated_at      INTEGER NOT NULL DEFAULT 0
    )`,
    `SELECT crsql_as_crr('products')`,
    `CREATE INDEX products_sku      ON products (sku)`,
    `CREATE INDEX products_category ON products (category_id, is_active)`,
    `CREATE INDEX products_name     ON products (name COLLATE NOCASE)`,

    `CREATE TABLE product_barcodes (
      barcode     TEXT PRIMARY KEY NOT NULL,
      product_id  TEXT NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL DEFAULT 0
    )`,
    `SELECT crsql_as_crr('product_barcodes')`,
    `CREATE INDEX product_barcodes_product ON product_barcodes (product_id)`,

    `CREATE TABLE sales (
      id                   TEXT PRIMARY KEY NOT NULL,
      device_id            TEXT NOT NULL DEFAULT '',
      device_code          TEXT NOT NULL DEFAULT '',
      device_seq           INTEGER NOT NULL DEFAULT 0,
      receipt_no           TEXT NOT NULL DEFAULT '',
      status               TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
      sold_at              INTEGER NOT NULL DEFAULT 0,
      tz_offset_min        INTEGER NOT NULL DEFAULT 0,
      line_count           INTEGER NOT NULL DEFAULT 0,
      item_count           INTEGER NOT NULL DEFAULT 0,
      subtotal             INTEGER NOT NULL DEFAULT 0,
      item_discount_total  INTEGER NOT NULL DEFAULT 0,
      bill_discount_type   TEXT CHECK (bill_discount_type IN ('percent', 'fixed')),
      bill_discount_value  INTEGER NOT NULL DEFAULT 0,
      bill_discount_amount INTEGER NOT NULL DEFAULT 0,
      total                INTEGER NOT NULL DEFAULT 0,
      cost_total           INTEGER NOT NULL DEFAULT 0,
      cash_tendered        INTEGER NOT NULL DEFAULT 0,
      change_due           INTEGER NOT NULL DEFAULT 0,
      cancelled_at         INTEGER,
      cancelled_by         TEXT,
      created_at           INTEGER NOT NULL DEFAULT 0
    )`,
    `SELECT crsql_as_crr('sales')`,
    `CREATE INDEX sales_sold_at ON sales (sold_at)`,
    `CREATE INDEX sales_device  ON sales (device_code, device_seq)`,

    `CREATE TABLE sale_lines (
      id                   TEXT PRIMARY KEY NOT NULL,
      sale_id              TEXT NOT NULL DEFAULT '',
      line_no              INTEGER NOT NULL DEFAULT 0,
      product_id           TEXT NOT NULL DEFAULT '',
      category_id          TEXT,
      sku                  TEXT NOT NULL DEFAULT '',
      name                 TEXT NOT NULL DEFAULT '',
      unit                 TEXT NOT NULL DEFAULT '',
      qty_milli            INTEGER NOT NULL DEFAULT 0 CHECK (qty_milli >= 0),
      unit_price           INTEGER NOT NULL DEFAULT 0,
      gross_amount         INTEGER NOT NULL DEFAULT 0,
      item_discount_type   TEXT CHECK (item_discount_type IN ('percent', 'fixed')),
      item_discount_value  INTEGER NOT NULL DEFAULT 0,
      item_discount_amount INTEGER NOT NULL DEFAULT 0,
      bill_discount_share  INTEGER NOT NULL DEFAULT 0,
      net_amount           INTEGER NOT NULL DEFAULT 0,
      unit_cost            INTEGER NOT NULL DEFAULT 0,
      cost_amount          INTEGER NOT NULL DEFAULT 0,
      note                 TEXT NOT NULL DEFAULT ''
    )`,
    `SELECT crsql_as_crr('sale_lines')`,
    `CREATE INDEX sale_lines_sale    ON sale_lines (sale_id, line_no)`,
    `CREATE INDEX sale_lines_product ON sale_lines (product_id)`,

    `CREATE TABLE stock_movements (
      id            TEXT PRIMARY KEY NOT NULL,
      product_id    TEXT NOT NULL DEFAULT '',
      kind          TEXT NOT NULL DEFAULT '' CHECK (kind IN ('', 'sale', 'sale_cancel', 'stock_in', 'stock_out', 'opname')),
      qty_milli     INTEGER NOT NULL DEFAULT 0,
      unit_cost     INTEGER NOT NULL DEFAULT 0,
      reason        TEXT CHECK (reason IN ('damaged', 'lost', 'own_use')),
      note          TEXT NOT NULL DEFAULT '',
      counted_milli INTEGER,
      system_milli  INTEGER,
      sale_id       TEXT,
      sale_line_id  TEXT,
      is_opening    INTEGER NOT NULL DEFAULT 0 CHECK (is_opening IN (0, 1)),
      device_id     TEXT NOT NULL DEFAULT '',
      occurred_at   INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL DEFAULT 0
    )`,
    `SELECT crsql_as_crr('stock_movements')`,
    `CREATE INDEX stock_movements_product ON stock_movements (product_id, occurred_at, id)`,
    `CREATE INDEX stock_movements_sale    ON stock_movements (sale_id)`,

    `CREATE TABLE local_meta (
      key    TEXT PRIMARY KEY,
      value  TEXT NOT NULL
    )`,

    `CREATE TABLE carts (
      id                   TEXT PRIMARY KEY,
      status               TEXT NOT NULL CHECK (status IN ('active', 'parked')),
      note                 TEXT NOT NULL DEFAULT '',
      lines_json           TEXT NOT NULL DEFAULT '[]',
      bill_discount_type   TEXT CHECK (bill_discount_type IN ('percent', 'fixed')),
      bill_discount_value  INTEGER NOT NULL DEFAULT 0,
      created_at           INTEGER NOT NULL,
      parked_at            INTEGER
    )`,
    `CREATE UNIQUE INDEX carts_one_active ON carts (status) WHERE status = 'active'`,

    `CREATE TABLE stock_summary (
      product_id    TEXT PRIMARY KEY,
      on_hand_milli INTEGER NOT NULL,
      avg_cost      REAL NOT NULL,
      updated_at    INTEGER NOT NULL
    )`,
    `CREATE INDEX stock_summary_on_hand ON stock_summary (on_hand_milli)`,

    `CREATE TABLE sync_imports (
      id               TEXT PRIMARY KEY,
      imported_at      INTEGER NOT NULL,
      file_device_code TEXT NOT NULL,
      file_device_id   TEXT NOT NULL,
      file_app_version TEXT NOT NULL,
      file_exported_at INTEGER NOT NULL,
      change_count     INTEGER NOT NULL,
      applied_count    INTEGER NOT NULL DEFAULT 0,
      status           TEXT NOT NULL CHECK (status IN ('merged', 'version_mismatch', 'invalid_file', 'error')),
      message          TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE INDEX sync_imports_device ON sync_imports (file_device_id, imported_at)`,
  ],
];

export const SCHEMA_VERSION = migrations.length;
