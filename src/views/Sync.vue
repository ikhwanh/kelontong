<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import TextSheet from '../components/TextSheet.vue';
import { shareSyncFile, importSyncFile, importHistory } from '../services/syncFiles.js';
import { device, APP_VERSION, setDeviceCode, listDevices } from '../services/device.js';
import { settings, saveSetting, prefs, setTheme, requestPersistence } from '../services/settings.js';
import { dataVersion } from '../db/index.js';
import { relativeDays, hhmm, dayMonth, startOfLocalDay } from '../lib/time.js';
import { toast, errorToast } from '../services/ui.js';

const route = useRoute();
const router = useRouter();
const fileInput = ref(null);
const history = ref([]);
const devices = ref([]);
const busy = ref('');
const editCode = ref(false);
const codeError = ref('');
const receipt = ref({ shop_name: settings.shop_name, receipt_header: settings.receipt_header, receipt_footer: settings.receipt_footer });

// An import can bring new receipt settings from another device.
watch(
  () => [settings.shop_name, settings.receipt_header, settings.receipt_footer],
  ([shop_name, receipt_header, receipt_footer]) => (receipt.value = { shop_name, receipt_header, receipt_footer }),
);

async function load() {
  [history.value, devices.value] = await Promise.all([importHistory(6), listDevices()]);
}
watch(dataVersion, load);

onMounted(async () => {
  await load();
  if (route.query.shared) {
    router.replace('/sync');
    await importShared();
  }
});

async function importShared() {
  const cache = await caches.open('pos-share-target');
  const res = await cache.match('/shared-file');
  if (!res) return;
  await cache.delete('/shared-file');
  const name = decodeURIComponent(res.headers.get('X-File-Name') || 'sync.txt');
  await runImport(new File([await res.blob()], name, { type: 'text/plain' }));
}

async function onExport() {
  busy.value = 'export';
  try {
    const r = await shareSyncFile();
    if (r === 'downloaded') toast('Sync file downloaded. Attach it in WhatsApp.');
    else if (r === 'shared') toast('Sync file shared.');
  } catch (e) {
    errorToast(e);
  } finally {
    busy.value = '';
  }
}

async function runImport(file) {
  busy.value = 'import';
  try {
    const r = await importSyncFile(file);
    if (r.status === 'merged') {
      toast(r.message || `${r.applied} changes merged.`);
      if (r.collision) toast(`Another device also uses code ${device.code}. Change this device’s code.`, { type: 'error', timeout: 8000 });
    } else {
      toast(r.message, { type: 'error', timeout: 8000 });
    }
    await load();
  } finally {
    busy.value = '';
  }
}

async function onFile(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (file) await runImport(file);
}

async function saveCode(code) {
  try {
    await setDeviceCode(code);
    editCode.value = false;
    codeError.value = '';
    toast(`Device code is now ${device.code}. New receipts use it.`);
  } catch (e) {
    codeError.value = e.message;
  }
}

async function saveReceipt(key) {
  await saveSetting(key, receipt.value[key].trim());
}

const exportStatus = computed(() => {
  if (!prefs.lastExportAt) return { cls: 'warn', text: 'Not exported yet.' };
  const days = Math.round((startOfLocalDay() - startOfLocalDay(new Date(prefs.lastExportAt))) / 86400000);
  const when = relativeDays(prefs.lastExportAt);
  return { cls: days >= 1 ? 'warn' : 'accent', text: 'Last export ' + when + '.' };
});

function historyLine(h) {
  const when = (startOfLocalDay() === startOfLocalDay(new Date(h.imported_at)) ? 'Today ' : dayMonth(h.imported_at) + ' ') + hhmm(h.imported_at);
  if (h.status === 'merged') return { ok: true, title: 'Imported from ' + (h.file_device_code || '?'), sub: when + ' · ' + h.applied_count + ' of ' + h.change_count + ' changes merged' + (h.message ? ' · ' + h.message : '') };
  if (h.status === 'version_mismatch') return { ok: false, title: 'Import stopped — nothing changed', sub: when + ' · ' + h.message };
  return { ok: false, title: h.status === 'invalid_file' ? 'Not a sync file' : 'Import failed', sub: when + ' · ' + h.message };
}

const short = (id) => (id ? id.slice(0, 4) + '…' + id.slice(-4) : '');
const lastSeen = (d) => history.value.find((h) => h.file_device_id === d.id && h.status === 'merged');
</script>

<template>
  <div class="screen">
    <header class="topbar"><h1 class="title">Sync &amp; settings</h1></header>
    <input ref="fileInput" type="file" accept=".txt,text/plain" class="sr-only" @change="onFile" />

    <main class="scroll">
      <div class="page">
        <section class="section" aria-labelledby="sync-h">
          <h2 id="sync-h" class="section-h">Sync between devices</h2>
          <div role="status" class="notice" :class="exportStatus.cls">
            <Icon name="info" />
            <span><strong>{{ exportStatus.text }}</strong> The sync file is also your backup — export it at least once a day.</span>
          </div>
          <button type="button" class="btn btn-primary" :disabled="!!busy" @click="onExport"><Icon name="share" />{{ busy === 'export' ? 'Preparing…' : 'Export & share changes' }}</button>
          <p class="hint">Opens the share sheet — pick WhatsApp and send the file to the other device. If sharing isn’t supported, the file downloads instead.</p>
          <button type="button" class="btn" :disabled="!!busy" @click="fileInput.click()"><Icon name="download" />{{ busy === 'import' ? 'Importing…' : 'Import sync file' }}</button>
          <p class="hint">Save the file from WhatsApp, then pick it here. On Android you can also share it from WhatsApp straight to Kelontong. Importing merges changes and never replaces your data; the same file twice is harmless.</p>
          <div v-if="history.length" class="list">
            <div v-for="h in history" :key="h.id" class="list-row" style="align-items: flex-start; padding: 12px 14px">
              <span class="hist-icon" :class="historyLine(h).ok ? 'ok' : 'bad'"><Icon :name="historyLine(h).ok ? 'check' : 'warn'" :size="18" /></span>
              <div class="main" style="font-size: 13px; line-height: 1.45"><strong>{{ historyLine(h).title }}</strong><div class="muted">{{ historyLine(h).sub }}</div></div>
            </div>
          </div>
        </section>

        <section class="section" aria-labelledby="dev-h">
          <h2 id="dev-h" class="section-h">This device</h2>
          <div class="list">
            <div class="list-row" style="min-height: 52px">
              <span class="main muted" style="font-size: 14px">Device code</span>
              <strong style="font-size: 15px">{{ device.code }}</strong>
              <button type="button" class="btn btn-sm" @click="editCode = true">Change</button>
            </div>
            <div class="list-row" style="min-height: 52px"><span class="main muted" style="font-size: 14px">Site ID</span><span class="num" style="font-family: var(--mono); font-size: 13px">{{ short(device.id) }}</span></div>
            <div class="list-row" style="min-height: 52px"><span class="main muted" style="font-size: 14px">App version</span><span class="num" style="font-weight: 700">{{ APP_VERSION }}</span></div>
            <div class="list-row" style="min-height: 52px">
              <span class="main muted" style="font-size: 14px">Storage</span>
              <span v-if="prefs.persistGranted" class="accent-text" style="display: flex; align-items: center; gap: 6px; font-weight: 700"><Icon name="shield" :size="18" />Persistent</span>
              <button v-else type="button" class="btn btn-sm" @click="requestPersistence">Not persistent · Ask again</button>
            </div>
          </div>
          <div v-if="device.codeCollision" class="notice warn"><Icon name="warn" />Another device also uses {{ device.code }}. Pick a new code. Receipts already issued keep their number.</div>
          <p class="hint">Receipt numbers start with the device code, so devices that are offline at the same time never issue the same number.</p>
        </section>

        <section v-if="devices.length > 1" class="section" aria-labelledby="devs-h">
          <h2 id="devs-h" class="section-h">Devices in this shop</h2>
          <div class="list">
            <div v-for="d in devices" :key="d.id" class="list-row" style="min-height: 52px">
              <span class="badge outline" style="font-size: 13px">{{ d.code }}</span>
              <span class="main" style="font-size: 13px">{{ d.id === device.id ? 'This device' : d.name || short(d.id) }}<span class="muted"> · app {{ d.app_version || '?' }}</span></span>
              <span class="muted" style="font-size: 12px">{{ d.id === device.id ? '' : lastSeen(d) ? 'imported ' + relativeDays(lastSeen(d).imported_at) : '' }}</span>
            </div>
          </div>
        </section>

        <section class="section" aria-labelledby="rcpt-h">
          <h2 id="rcpt-h" class="section-h">WhatsApp receipt</h2>
          <label class="field"><span>Shop name (bold, first line)</span>
            <input v-model="receipt.shop_name" class="input" style="font-size: 15px" placeholder="Your shop name" @change="saveReceipt('shop_name')" /></label>
          <label class="field"><span>Header (top of message)</span>
            <textarea v-model="receipt.receipt_header" class="input" rows="2" placeholder="Address, phone" @change="saveReceipt('receipt_header')"></textarea></label>
          <label class="field"><span>Footer (bottom of message)</span>
            <textarea v-model="receipt.receipt_footer" class="input" rows="2" placeholder="Thank-you note, return policy" @change="saveReceipt('receipt_footer')"></textarea></label>
          <p class="hint">Shared with every device through sync.</p>
        </section>

        <section class="section" aria-labelledby="look-h">
          <h2 id="look-h" class="section-h">Appearance</h2>
          <div class="seg" role="radiogroup" aria-label="Theme">
            <button v-for="t in [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]" :key="t[0]" type="button" role="radio" :aria-checked="prefs.theme === t[0]" @click="setTheme(t[0])">{{ t[1] }}</button>
          </div>
          <p class="hint">System follows the device’s light or dark setting.</p>
        </section>

        <section class="section" aria-labelledby="about-h">
          <h2 id="about-h" class="section-h">About</h2>
          <div class="list">
            <RouterLink to="/about" class="list-row">
              <div class="main">
                <div class="t">About this app</div>
                <div class="s">Author, contact and source code</div>
              </div>
              <Icon name="chevron" />
            </RouterLink>
          </div>
        </section>
      </div>
    </main>

    <TextSheet v-if="editCode" title="Device code" subtitle="2–4 letters or digits, starting with a letter" label="New code" :initial="device.code" :maxlength="4" confirm-label="Save code" @save="saveCode" @close="editCode = false; codeError = ''">
      <span v-if="codeError" class="field-error">{{ codeError }}</span>
    </TextSheet>
  </div>
</template>

<style scoped>
.hist-icon { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; flex: none; }
.hist-icon.ok { background: var(--accent-soft); color: var(--accent-text); }
.hist-icon.bad { background: var(--danger-soft); color: var(--danger); }
</style>
