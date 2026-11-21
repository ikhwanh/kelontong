POS functional specs

Target: a single retail shop running the app on one or more devices. No backend server. Cash payment only.

1. Core sales / checkout

Product lookup by barcode scan (camera or hand scanner), search or category grid
Cart handling: add or remove items, change quantity, item notes
Discounts (manual, entered by the cashier):
- Per item: percent or fixed amount, at most one discount per cart line
- Per bill: percent or fixed amount, applied to the subtotal after item discounts
- A discount can never make a line or the bill go below zero
- Percent discounts round to the nearest rupiah
- The bill discount is spread over the lines in proportion to their amount, so gross profit per product stays correct
- Automatic promos (buy-X-get-Y, time-based) are out of scope for now
Hold or park a transaction
Cash payment: enter amount tendered, show change due
Cancel sale: cancel a completed sale
- Adds reversing stock movements; the original movements are never deleted
- The sale is marked cancelled, kept in the sales list and excluded from sales totals and profit
- A cancelled sale cannot be restored
Receipts: sent through WhatsApp, with a custom header and footer added as text at the top and bottom of the message
- Uses a click-to-chat link (wa.me) with the receipt as text. The cashier enters the customer's phone number, WhatsApp opens with the message filled in, and the cashier presses send.

2. Money

All amounts are in rupiah, stored as whole numbers (no decimals)
Displayed as "Rp 12.500" (dot as the thousands separator)

3. Inventory

Product master data: name, SKU, one or more barcodes, category, selling price, cost price, minimum stock
- Variants (size, color) are stored as separate products, each with its own SKU and barcode
- One unit of measure per product
Product import from CSV and Excel (.xlsx)
- A downloadable template file with the expected columns
- Rows are matched by SKU: an existing SKU is updated, a new SKU is created
- An optional opening-stock column creates a stock-in movement
- The import shows a preview with row errors before anything is saved
Stock in (with cost and an optional supplier note), stock out with a reason (damaged, lost, own use), stock opname (count and adjust)
Low-stock alert when on-hand stock is at or below the product's minimum stock
Stock is a ledger of movements (sale, cancelled sale, stock in, stock out, opname adjustment); on-hand stock is the sum of movements
- Never store a quantity column that devices overwrite. cr-sqlite merges with last-write-wins per column, so two devices updating the same quantity would lose one device's sales.
Stock is allowed to go negative, because two offline devices can both sell the last unit. Negative stock shows in the low-stock list.
Costing: moving weighted average, calculated from stock-in movements. Each sale line stores the cost at the time of sale, so gross profit does not change later.
Out of scope: purchase orders, recipes / bill of materials, batches, expiry dates, serial numbers, unit conversion, price levels

4. Reporting

One report page, filtered by date range, showing data from all devices merged into this device:
Sales by day, hour, product and category
Gross profit and COGS
End-of-day summary: number of transactions, number of cancelled sales, total sales, total discounts, expected cash
Stock on hand, stock value (on-hand × average cost) and the low-stock list

5. Hardware and platform

Camera barcode scanning through a WebAssembly decoder (e.g. zxing-wasm) on all platforms, since the browser BarcodeDetector API is missing on iOS Safari and Firefox
USB and Bluetooth hand scanners in keyboard mode, paired through the operating system
- On the checkout screen the app treats fast keystrokes ending in Enter as a barcode scan, even when no input field has focus
No receipt printer support for now
Platforms: Android tablet (Chrome), Windows PC (Chrome or Edge), iPad (Safari)

6. Installation, updates and storage

The app only runs as an installed PWA. Until it is installed, a sticky full-screen prompt blocks use of the app.
- Android and Windows: an install button using the beforeinstallprompt event
- iPad: step-by-step instructions (Share → Add to Home Screen), since iOS has no install prompt API
- Use is blocked, not just discouraged, because on iOS the home-screen app has storage separate from Safari. Data entered in a Safari tab would not appear in the installed app.
Request persistent storage (navigator.storage.persist()) on first run
App updates follow the usual PWA pattern: when the service worker finds a new version, the app shows an "Update available, tap to reload" prompt
- The prompt never reloads the app while a cart has items; it waits until the sale is finished or parked

7. Sync between devices

Sync uses cr-sqlite change files sent through WhatsApp
Export: the device writes all its changes (crsql_changes) to a compressed file and opens the share sheet (Web Share API) so the user can send it through WhatsApp. If sharing files is not supported, the file is downloaded and the user attaches it in WhatsApp.
Import: the user saves the file from WhatsApp and opens it in the app with a file picker. On Android the installed app also appears in the share sheet (Web Share Target API), so the file can be shared straight from WhatsApp into the app.
Import merges the changes into the existing database. It never replaces the database. Importing the same file twice is harmless.
The sync file records the app version. If it differs from the importing device's app version, the import stops, nothing is changed, and the app tells the user to update both devices to the same version.
Each device has its own cr-sqlite site ID and a short device code. Receipt numbers include the device code, so devices that are offline at the same time never produce the same number.
The sync file also serves as a backup. The app reminds the user to export it regularly.

8. Tech stack requirements

- Vue
- Vite
- PWA
- SQLite + cr_sqlite (via webassembly)
- Sync to other devices by sending a cr-sqlite change file through WhatsApp
- Camera barcode scanning through a WebAssembly decoder
