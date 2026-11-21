<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import ProductPicker from '../components/ProductPicker.vue';
import { getProduct, findByCode } from '../services/products.js';
import { stockIn, stockOut, opname, recentMovements, KIND_LABEL, REASON_LABEL } from '../services/stock.js';
import { formatRp, groupThousands } from '../lib/money.js';
import { formatQty, parseQty, formatSignedQty, isWholeMilli } from '../lib/qty.js';
import { dayMonth, hhmm } from '../lib/time.js';
import { takeCapturedCode } from '../services/scanBus.js';
import { toast, errorToast } from '../services/ui.js';
import { dataVersion } from '../db/index.js';

const route = useRoute();
const router = useRouter();
const mode = ref(['in', 'out', 'opname'].includes(route.query.mode) ? route.query.mode : 'in');
const product = ref(null);
const picking = ref(false);
const ledger = ref([]);
const busy = ref(false);

const qtyText = ref('');
const costDigits = ref('');
const note = ref('');
const reason = ref('damaged');
const countText = ref('');

async function loadProduct(id) {
  product.value = id ? await getProduct(id) : null;
  ledger.value = id ? await recentMovements(id, 15) : [];
  if (product.value && !costDigits.value) costDigits.value = String(Math.round(product.value.avg_cost || product.value.cost_price || 0) || '');
}

onMounted(async () => {
  const code = takeCapturedCode();
  if (code) {
    const p = await findByCode(code);
    if (p) return router.replace({ path: '/stock/move/' + p.id, query: route.query });
    toast(`${code} not found.`, { type: 'error' });
  }
  await loadProduct(route.params.id);
  if (!product.value) picking.value = true;
});
watch(dataVersion, () => product.value && loadProduct(product.value.id));

function pick(p) {
  picking.value = false;
  costDigits.value = '';
  router.replace({ path: '/stock/move/' + p.id, query: { mode: mode.value } });
}

const p = computed(() => product.value);
const dec = computed(() => !!p.value?.decimal_qty);
const u = computed(() => (dec.value ? ' ' + p.value.unit : ''));
const qty = computed(() => parseQty(qtyText.value));
const counted = computed(() => parseQty(countText.value));
const cost = computed(() => (costDigits.value === '' ? null : parseInt(costDigits.value, 10)));
const qtyError = computed(() => {
  const v = mode.value === 'opname' ? counted.value : qty.value;
  const text = mode.value === 'opname' ? countText.value : qtyText.value;
  if (!text) return '';
  if (v === null) return 'Enter a number, up to 3 decimals.';
  if (v < 0) return 'Can’t be negative.';
  if (!dec.value && !isWholeMilli(v)) return 'This product is counted in whole units.';
  return '';
});

const preview = computed(() => {
  if (!p.value) return null;
  const onHand = p.value.on_hand_milli;
  if (mode.value === 'in' && qty.value > 0 && cost.value !== null) {
    const newAvg = onHand <= 0 ? cost.value : (onHand * p.value.avg_cost + qty.value * cost.value) / (onHand + qty.value);
    return { onHand: formatQty(onHand) + ' → ' + formatQty(onHand + qty.value) + u.value, avg: formatRp(Math.round(newAvg)) };
  }
  if (mode.value === 'out' && qty.value > 0) {
    return { onHand: 'On hand ' + formatQty(onHand) + ' → ' + formatQty(onHand - qty.value) + u.value, value: 'value − ' + formatRp(Math.round((qty.value * p.value.avg_cost) / 1000)) };
  }
  if (mode.value === 'opname' && counted.value !== null && counted.value >= 0) {
    const d = counted.value - onHand;
    return { adjust: (d > 0 ? '+ ' : d < 0 ? '− ' : '') + formatQty(Math.abs(d)) + (dec.value ? ' ' + p.value.unit : d === 0 ? '' : Math.abs(d) === 1000 ? ' unit' : ' units') };
  }
  return null;
});

const canSave = computed(() => {
  if (!p.value || qtyError.value || busy.value) return false;
  if (mode.value === 'in') return qty.value > 0 && cost.value !== null;
  if (mode.value === 'out') return qty.value > 0;
  return counted.value !== null && counted.value >= 0;
});

function onCost(e) {
  costDigits.value = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  e.target.value = costDigits.value ? groupThousands(Number(costDigits.value)) : '';
}

async function save() {
  if (!canSave.value) return;
  busy.value = true;
  try {
    const base = { productId: p.value.id, note: note.value };
    if (mode.value === 'in') await stockIn({ ...base, qtyMilli: qty.value, unitCost: cost.value });
    else if (mode.value === 'out') await stockOut({ ...base, qtyMilli: qty.value, reason: reason.value });
    else await opname({ ...base, countedMilli: counted.value, systemMilli: p.value.on_hand_milli });
    toast(mode.value === 'in' ? 'Stock in saved.' : mode.value === 'out' ? 'Stock out saved.' : 'Count saved.');
    qtyText.value = '';
    countText.value = '';
    note.value = '';
    await loadProduct(p.value.id);
  } catch (e) {
    errorToast(e);
  } finally {
    busy.value = false;
  }
}

function ledgerRef(m) {
  if (m.kind === 'sale' || m.kind === 'sale_cancel') return (m.receipt_no || 'sale') + ' · ' + dayMonth(m.occurred_at) + ' ' + hhmm(m.occurred_at);
  if (m.kind === 'stock_in') return dayMonth(m.occurred_at) + ' · ' + formatRp(m.unit_cost) + (dec.value ? '/' + p.value.unit : '/unit') + (m.note ? ' · ' + m.note : '');
  if (m.kind === 'stock_out') return dayMonth(m.occurred_at) + ' · ' + REASON_LABEL[m.reason] + (m.note ? ' · ' + m.note : '');
  return dayMonth(m.occurred_at) + ' · counted ' + formatQty(m.counted_milli ?? 0);
}

const saveLabel = computed(() => (mode.value === 'in' ? 'Save stock in' : mode.value === 'out' ? 'Save stock out' : 'Save count'));
</script>

<template>
  <div class="screen">
    <header class="subbar">
      <button type="button" class="icon-btn" aria-label="Back to stock" @click="router.push('/stock')"><Icon name="back" :size="24" /></button>
      <h1 class="spacer">Stock movement</h1>
      <RouterLink v-if="p" :to="'/products/' + p.id" class="btn btn-sm"><Icon name="pencil" :size="16" />Edit product</RouterLink>
    </header>

    <main class="scroll">
      <div class="page num">
        <div class="seg" role="group" aria-label="Movement type">
          <button type="button" :aria-pressed="mode === 'in'" @click="mode = 'in'">Stock in</button>
          <button type="button" :aria-pressed="mode === 'out'" @click="mode = 'out'">Stock out</button>
          <button type="button" :aria-pressed="mode === 'opname'" @click="mode = 'opname'">Opname</button>
        </div>

        <button type="button" class="product-card" @click="picking = true">
          <span class="spacer" style="min-width: 0; display: flex; flex-direction: column; gap: 2px">
            <span class="muted" style="font-size: 12px; font-weight: 600">Product</span>
            <template v-if="p">
              <span style="font-size: 16px; font-weight: 700">{{ p.name }}</span>
              <span class="muted" style="font-size: 12px">{{ p.sku }} · on hand {{ formatQty(p.on_hand_milli) }}{{ u }} · avg cost {{ formatRp(Math.round(p.avg_cost)) }}{{ dec ? ' / ' + p.unit : '' }}</span>
            </template>
            <span v-else style="font-size: 16px; font-weight: 700">Choose a product</span>
          </span>
          <Icon name="down" />
        </button>
        <div v-if="dec" class="muted" style="display: flex; gap: 8px; align-items: center; margin-top: -6px; font-size: 12px">
          <Icon name="scale" :size="16" :stroke="1.8" />Sold by {{ p.unit }}. Quantities take up to 3 decimals, e.g. 0,125 {{ p.unit }}.
        </div>

        <template v-if="p && mode === 'in'">
          <div class="grid-2">
            <label class="field"><span>Quantity in{{ dec ? ' (' + p.unit + ')' : '' }}</span>
              <input v-model="qtyText" class="input big" :class="{ invalid: qtyError }" :inputmode="dec ? 'decimal' : 'numeric'" placeholder="0" /></label>
            <label class="field"><span>Cost per {{ dec ? p.unit : 'unit' }} (Rp)</span>
              <input class="input big" inputmode="numeric" :value="costDigits ? groupThousands(Number(costDigits)) : ''" placeholder="0" @input="onCost" /></label>
          </div>
          <div v-if="qtyError" class="field-error">{{ qtyError }}</div>
          <label class="field"><span>Supplier note (optional)</span>
            <input v-model="note" class="input" style="font-size: 15px; font-weight: 500" placeholder="Supplier, invoice number…" /></label>
          <div v-if="preview" class="grid-2 preview accent">
            <div><div class="pl">New on hand</div><div class="pv">{{ preview.onHand }}</div></div>
            <div><div class="pl">New avg cost</div><div class="pv">{{ preview.avg }}</div></div>
          </div>
        </template>

        <template v-if="p && mode === 'out'">
          <label class="field"><span>Quantity out{{ dec ? ' (' + p.unit + ')' : '' }}</span>
            <input v-model="qtyText" class="input big" :class="{ invalid: qtyError }" :inputmode="dec ? 'decimal' : 'numeric'" placeholder="0" /></label>
          <div v-if="qtyError" class="field-error">{{ qtyError }}</div>
          <div class="field" role="radiogroup" aria-label="Reason">
            <span class="field-label">Reason</span>
            <div style="display: flex; gap: 8px">
              <button v-for="(label, id) in REASON_LABEL" :key="id" type="button" role="radio" class="chip" style="flex: 1; justify-content: center; font-weight: 700; border-radius: 10px; min-height: 44px" :aria-checked="reason === id" @click="reason = id">{{ label }}</button>
            </div>
          </div>
          <label class="field"><span>Note (optional)</span>
            <input v-model="note" class="input" style="font-size: 15px; font-weight: 500" placeholder="e.g. packaging torn" /></label>
          <div v-if="preview" class="preview" style="font-size: 14px"><strong>{{ preview.onHand }}</strong> · {{ preview.value }}</div>
        </template>

        <template v-if="p && mode === 'opname'">
          <div class="notice warn"><Icon name="info" />Import every device’s latest sync file before counting, so their sales are already included.</div>
          <div class="grid-2">
            <div class="field"><span class="field-label">System count</span>
              <span class="input big" style="display: flex; align-items: center; background: var(--surface-2); border-color: transparent">{{ formatQty(p.on_hand_milli) }}{{ u }}</span></div>
            <label class="field"><span>Counted on shelf{{ dec ? ' (' + p.unit + ')' : '' }}</span>
              <input v-model="countText" class="input big" :class="{ invalid: qtyError }" style="border: 2px solid var(--accent)" :inputmode="dec ? 'decimal' : 'numeric'" placeholder="0" /></label>
          </div>
          <div v-if="qtyError" class="field-error">{{ qtyError }}</div>
          <div v-if="preview" class="kv preview warnbox" style="align-items: center">
            <span style="font-size: 14px; font-weight: 700; color: inherit">Adjustment</span><span style="font-size: 18px; font-weight: 800">{{ preview.adjust }}</span>
          </div>
          <label class="field"><span>Note (optional)</span>
            <input v-model="note" class="input" style="font-size: 15px; font-weight: 500" placeholder="e.g. monthly count" /></label>
        </template>

        <section v-if="p" class="section" aria-labelledby="ledger-h">
          <h2 id="ledger-h" class="section-h">Recent movements</h2>
          <div v-if="ledger.length" class="list">
            <div v-for="m in ledger" :key="m.id" class="list-row" style="min-height: 48px; font-size: 13px">
              <span class="main"><strong style="font-weight: 700">{{ KIND_LABEL[m.kind] }}{{ m.is_opening ? ' (opening)' : '' }}</strong> <span class="muted">· {{ ledgerRef(m) }}</span></span>
              <span :style="{ fontWeight: 800, color: m.qty_milli > 0 ? 'var(--accent-text)' : 'var(--text)' }">{{ formatSignedQty(m.qty_milli) }}</span>
            </div>
          </div>
          <div v-else class="empty" style="padding: 16px">No movements yet.</div>
        </section>
      </div>
    </main>

    <footer class="footer-bar">
      <button type="button" class="btn btn-primary btn-block" style="min-height: 56px" :disabled="!canSave" @click="save">{{ saveLabel }}</button>
    </footer>

    <ProductPicker v-if="picking" @pick="pick" @close="picking = false" />
  </div>
</template>

<style scoped>
.product-card { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--border); background: var(--surface); text-align: left; width: 100%; }
.preview { padding: 12px 14px; border-radius: 12px; background: var(--surface-2); }
.preview.accent { background: var(--accent-soft); color: var(--accent-text); }
.preview.warnbox { background: var(--warn-soft); color: var(--warn); }
.pl { font-size: 12px; font-weight: 600; }
.pv { font-size: 18px; font-weight: 800; }
</style>
