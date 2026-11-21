# POS

A point of sale for a small shop that works with no internet, no server and no account. Scan or tap products into the cart, take cash, send the receipt over WhatsApp, and keep track of stock. It runs on the Android tablet, Windows PC or iPad you already have. If the shop has more than one device, they keep each other up to date when you send a sync file over WhatsApp.

## Try it

**[Open the app → ikhwanh.github.io/kelontong](https://ikhwanh.github.io/kelontong/)**

It takes about a minute:

1. Open the link in **Chrome** on Android, **Chrome or Edge** on Windows, or **Safari** on iPad.
2. Install it when the page asks. On Android and Windows, use the **Install** button. On iPad, tap **Share**, then **Add to Home Screen**.
3. Open POS from your home screen or Start menu. Add a few products, or import a CSV or Excel list, and make your first sale.

Once it's installed, the app works offline, even in airplane mode. Everything you enter stays on that device and is never uploaded. Have a second device? Install it there too and send a sync file from one to the other over WhatsApp to see them catch up.

The app is still an early preview (see [Not done yet](#not-done-yet)). Try it freely, but keep your real records somewhere else for now. Found a bug or have an idea? [Open an issue](https://github.com/ikhwanh/kelontong/issues).

## How it's built

An installed PWA on Vue and cr-sqlite. Each device has its own database, and devices sync by exchanging cr-sqlite change files.

- Functional spec: [SPECS.md](SPECS.md)
- Database design: [DATABASE.md](DATABASE.md)

## Run it locally

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
