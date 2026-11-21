<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import { previewImport, commitImport, templateXlsx, templateCsv } from '../services/importer.js';
import { formatRp } from '../lib/money.js';
import { toast, errorToast } from '../services/ui.js';

const router = useRouter();
const fileInput = ref(null);
const preview = ref(null);
const busy = ref(false);
const showAll = ref(false);

async function onFile(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  busy.value = true;
  try {
    preview.value = await previewImport(file);
  } catch (err) {
    errorToast(new Error('Couldn’t read the file: ' + (err?.message || err)));
  } finally {
    busy.value = false;
  }
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function getTemplate(kind) {
  if (kind === 'xlsx') download(await templateXlsx(), 'products-template.xlsx');
  else download(templateCsv(), 'products-template.csv');
}

const errorRows = computed(() => preview.value?.rows.filter((r) => r.status === 'error') ?? []);
const validCount = computed(() => (preview.value ? preview.value.counts.new + preview.value.counts.update : 0));
const shownRows = computed(() => (showAll.value ? preview.value.rows : preview.value.rows.slice(0, 50)));

async function confirm() {
  busy.value = true;
  try {
    const n = await commitImport(preview.value);
    toast(`${n} products imported.`);
    router.replace('/stock');
  } catch (e) {
    errorToast(e);
  } finally {
    busy.value = false;
  }
}

const statusLabel = { new: 'New', update: 'Update', error: 'Error' };
const statusCls = { new: 'accent', update: '', error: 'danger' };
</script>

<template>
  <div class="screen">
    <header class="subbar">
      <RouterLink to="/stock" class="icon-btn" aria-label="Back to stock"><Icon name="back" :size="24" /></RouterLink>
      <h1 class="spacer">Import products</h1>
      <details class="tpl">
        <summary class="pill"><Icon name="download" :size="18" />Template</summary>
        <div class="tpl-menu">
          <button type="button" class="btn btn-sm" @click="getTemplate('xlsx')">Excel (.xlsx)</button>
          <button type="button" class="btn btn-sm" @click="getTemplate('csv')">CSV</button>
        </div>
      </details>
    </header>
    <input ref="fileInput" type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" class="sr-only" @change="onFile" />

    <main class="scroll">
      <div class="page num">
        <template v-if="!preview">
          <div class="card" style="display: flex; flex-direction: column; gap: 12px; align-items: flex-start">
            <h2 style="margin: 0; font-size: 16px; font-weight: 800">Import from CSV or Excel</h2>
            <p class="hint" style="font-size: 14px">Rows are matched by SKU: an existing SKU is updated, a new SKU is created. An optional opening stock column adds a stock-in movement. You see a preview with any row errors before anything is saved.</p>
            <p class="hint">Columns: <code>sku, name, barcodes, category, unit, decimal_qty, price, cost_price, min_stock, opening_stock</code>. Separate several barcodes with a comma or space. Use yes/no for decimal_qty.</p>
            <button type="button" class="btn btn-primary" :disabled="busy" @click="fileInput.click()"><Icon name="file" />{{ busy ? 'Reading…' : 'Choose file' }}</button>
          </div>
        </template>

        <template v-else>
          <div class="file-card">
            <span class="file-icon"><Icon name="file" /></span>
            <div class="spacer" style="min-width: 0">
              <div style="font-size: 15px; font-weight: 700; overflow-wrap: anywhere">{{ preview.fileName }}</div>
              <div class="muted" style="font-size: 12px">{{ preview.rows.length }} rows · matched by SKU</div>
            </div>
            <button type="button" class="btn btn-sm" @click="fileInput.click()">Change</button>
          </div>

          <div v-if="preview.missingColumns.length" class="notice danger">
            <Icon name="warn" />Missing column{{ preview.missingColumns.length > 1 ? 's' : '' }}: {{ preview.missingColumns.join(', ') }}. Download the template to see the expected columns.
          </div>

          <div class="counts">
            <div class="cnt accent"><div class="n">{{ preview.counts.new }}</div><div class="l">New</div></div>
            <div class="cnt"><div class="n">{{ preview.counts.update }}</div><div class="l">Updates</div></div>
            <div class="cnt" :class="{ danger: preview.counts.error }"><div class="n">{{ preview.counts.error }}</div><div class="l">Errors</div></div>
          </div>

          <section v-if="errorRows.length" class="section" aria-labelledby="err-h">
            <h2 id="err-h" class="section-h">Rows with errors</h2>
            <div class="list">
              <div v-for="r in errorRows" :key="r.rowNo" class="list-row" style="min-height: 48px; align-items: flex-start; font-size: 13px">
                <span class="badge danger" style="margin-top: 2px">Row {{ r.rowNo }}</span>
                <span class="main">{{ r.errors.join(' · ') }}</span>
              </div>
            </div>
          </section>

          <section class="section" aria-labelledby="prev-h">
            <h2 id="prev-h" class="section-h">Preview</h2>
            <div class="table-box">
              <table class="data">
                <thead><tr><th scope="col">SKU</th><th scope="col">Name</th><th scope="col" class="r">Price</th><th scope="col" class="r">Opening</th><th scope="col">Status</th></tr></thead>
                <tbody>
                  <tr v-for="r in shownRows" :key="r.rowNo">
                    <td style="font-weight: 700; white-space: nowrap">{{ r.sku || '—' }}</td>
                    <td>{{ r.name || '—' }}</td>
                    <td class="r" style="white-space: nowrap">{{ r.price !== null ? formatRp(r.price) : r.existing ? formatRp(r.existing.price) : '—' }}</td>
                    <td class="r" style="white-space: nowrap" :class="{ muted: r.openingStatus === 'already' }">{{ r.openingLabel }}</td>
                    <td><span class="badge" :class="statusCls[r.status]">{{ statusLabel[r.status] }}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <button v-if="preview.rows.length > 50 && !showAll" type="button" class="btn btn-sm" @click="showAll = true">Show all {{ preview.rows.length }} rows</button>
            <p class="hint">Nothing is saved until you confirm. An opening stock value creates a stock-in movement and adds to the current stock. Importing the same file again doesn’t add it twice.</p>
          </section>
        </template>
      </div>
    </main>

    <footer v-if="preview" class="footer-bar" style="flex-direction: column; gap: 8px">
      <button type="button" class="btn btn-primary btn-block" style="min-height: 56px" :disabled="!validCount || busy" @click="confirm">
        Import {{ validCount }} valid {{ validCount === 1 ? 'row' : 'rows' }}
      </button>
      <span v-if="preview.counts.error" class="hint" style="text-align: center">The {{ preview.counts.error }} {{ preview.counts.error === 1 ? 'row' : 'rows' }} with errors {{ preview.counts.error === 1 ? 'is' : 'are' }} skipped. Fix them in the file and import again.</span>
    </footer>
  </div>
</template>

<style scoped>
.tpl { position: relative; }
.tpl summary { list-style: none; cursor: pointer; }
.tpl summary::-webkit-details-marker { display: none; }
.tpl-menu { position: absolute; right: 0; top: 46px; z-index: 5; display: flex; flex-direction: column; gap: 6px; padding: 8px; border-radius: 12px; background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow); white-space: nowrap; }
.file-card { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 14px; background: var(--surface); border: 1px solid var(--border); }
.file-icon { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 10px; background: var(--accent-soft); color: var(--accent-text); flex: none; }
.counts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.cnt { padding: 10px 12px; border-radius: 12px; background: var(--surface); border: 1px solid var(--border); }
.cnt .n { font-size: 22px; font-weight: 800; }
.cnt .l { font-size: 12px; font-weight: 600; color: var(--muted); }
.cnt.accent { background: var(--accent-soft); color: var(--accent-text); border-color: transparent; }
.cnt.accent .l, .cnt.danger .l { color: inherit; }
.cnt.danger { background: var(--danger-soft); color: var(--danger); border-color: transparent; }
code { font-family: var(--mono); font-size: 12px; }
</style>
