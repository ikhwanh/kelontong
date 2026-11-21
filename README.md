# POS

Offline point of sale for one retail shop, cash only, running as an installed PWA on Android tablets, Windows PCs and iPads. Devices sync by sending cr-sqlite change files to each other through WhatsApp. There is no server.

- Functional spec: [SPECS.md](SPECS.md)
- Database design: [DATABASE.md](DATABASE.md)

## Run it

```sh
npm install
npm run dev        # http://localhost:5180
npm test           # unit tests for money, checkout, costing, receipt, CSV, IDs
npm run build      # production build in dist/, with the service worker
npm run preview    # serve dist/ on http://localhost:4180
```

The app refuses to run in a plain browser tab (spec §6): it shows the install screen until it runs as an installed app. Development builds (`npm run dev`) show a "Continue in this browser" link on that screen. To get the link in a production build, for testing only, build with `VITE_ALLOW_BROWSER=1 npm run build`.

Installing needs HTTPS, or `localhost`.

## Layout

```
src/
  db/
    schema.js        migrations: replicated tables (CRRs) and local-only tables
    index.js         opens cr-sqlite (wasm + IndexedDB), runs migrations, query helpers
    sync.js          the only module that calls crsql_*: exportChanges / importChanges
  lib/               pure logic, unit-tested: money, qty, checkout, costing, receipt, csv, ids, time
                     plus camera.js (zxing-wasm) and handScanner.js (keyboard-mode scanners)
  services/          app logic on top of the database
    cart.js          active and parked carts (local `carts` table)
    sales.js         checkout transaction, cancel sale
    stock.js         ledger movements, stock_summary rebuild (moving average)
    products.js      products, categories, barcodes
    importer.js      CSV / .xlsx product import with preview
    syncFiles.js     sync file export (Web Share / download) and import log
    reports.js       report queries
    device.js, settings.js, pwa.js, ui.js
  views/             one file per screen
  components/        cart panel, sheets (discount, quantity, text), icons
  sw.js              service worker: precache, offline navigation, Web Share Target
```

## Behaviour worth knowing

- **Hand scanners.** On the checkout screen, a burst of keystrokes (under 40 ms apart, at least 4 characters) ending in Enter counts as a scan, even with no field focused. The search box also accepts a typed or scanned barcode or SKU followed by Enter.
- **Sync files** are `pos-sync-<code>-<date>-<time>.txt`: a `POSSYNC1` line, then base64 of the gzipped JSON from DATABASE.md §7. They are text files because Chrome's Web Share only accepts certain file types and `.gz` isn't one of them. On Android the installed app is a share target for these files.
- **Updates** follow the prompt pattern. The "Update available" banner won't reload while the cart has items.
- **Device codes** are a random letter and digit on first run. If an import brings in another device with the same code, a banner asks you to change this one under Sync.

## Not done yet

- **cr-sqlite is the npm build** (`@vlcn.io/crsqlite-wasm` 0.16.0), not a WASM built from the v0.16.3 tag as DATABASE.md §12.1 decides. Building it needs the Rust nightly and Emscripten toolchain. Swap in the self-built `crsqlite.wasm` and its JS glue when that build exists. The rest of the app only goes through `src/db/index.js` and `src/db/sync.js`.
- **The device spike (§12.2) hasn't been run.** Before relying on the app, check on a real Android tablet, Windows PC and iPad, each installed: the data survives a reboot and a week of disuse, persistent storage is granted, the share sheet accepts the `.txt` sync file, and export and import of about 100k changes run in acceptable time.
- Camera scanning has been built but not tried on real cameras.
