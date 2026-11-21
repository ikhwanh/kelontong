<script>
// Survives the trip to the camera scanner and back, which unmounts this screen.
let draft = null;
</script>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import { getProduct, saveProduct, listCategories, setProductActive, barcodeOwner } from '../services/products.js';
import { groupThousands, formatRp } from '../lib/money.js';
import { formatQty, parseQty } from '../lib/qty.js';
import { takeCapturedCode } from '../services/scanBus.js';
import { toast, errorToast } from '../services/ui.js';

const route = useRoute();
const router = useRouter();
const isNew = computed(() => !route.params.id);
const categories = ref([]);
const errors = ref({});
const busy = ref(false);
const newBarcode = ref('');
const loaded = ref(false);

const form = reactive({
  id: '', sku: '', name: '', category_id: '', new_category: '', unit: 'pcs', decimal_qty: 0,
  price: '', cost_price: '', min_stock: '', barcodes: [], is_active: 1, on_hand_milli: 0,
});

onMounted(async () => {
  categories.value = await listCategories();
  if (draft && draft.path === route.fullPath) {
    Object.assign(form, draft.form);
    draft = null;
  } else if (route.params.id) {
    const p = await getProduct(route.params.id);
    if (!p) return router.replace('/stock');
    Object.assign(form, {
      id: p.id, sku: p.sku, name: p.name, category_id: p.category_id || '', unit: p.unit, decimal_qty: p.decimal_qty,
      price: String(p.price), cost_price: String(p.cost_price), min_stock: formatQty(p.min_stock_milli).replace(/\./g, ''),
      barcodes: p.barcodes, is_active: p.is_active, on_hand_milli: p.on_hand_milli,
    });
  } else if (route.query.barcode) {
    form.barcodes = [String(route.query.barcode)];
  }
  const code = takeCapturedCode();
  if (code) await addBarcode(code);
  loaded.value = true;
});

async function addBarcode(code) {
  const b = String(code ?? newBarcode.value).trim();
  if (!b) return;
  if (form.barcodes.includes(b)) return toast(`${b} is already listed.`);
  const owner = await barcodeOwner(b);
  if (owner && owner.product_id !== form.id) return toast(`Barcode ${b} already belongs to ${owner.sku || 'another product'}.`, { type: 'error' });
  form.barcodes.push(b);
  newBarcode.value = '';
}

function scanBarcode() {
  draft = { path: route.fullPath, form: JSON.parse(JSON.stringify(form)) };
  router.push({ path: '/scan', query: { mode: 'capture' } });
}

const money = (key) => ({
  value: form[key] === '' ? '' : groupThousands(Number(form[key])),
  onInput: (e) => {
    form[key] = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
    e.target.value = form[key] === '' ? '' : groupThousands(Number(form[key]));
  },
});
const priceField = computed(() => money('price'));
const costField = computed(() => money('cost_price'));
const margin = computed(() => {
  const p = Number(form.price), c = Number(form.cost_price);
  if (!p || form.cost_price === '') return '';
  return 'Margin ' + formatRp(p - c) + ' (' + (((p - c) / p) * 100).toFixed(1).replace('.', ',') + '%)';
});

async function save() {
  errors.value = {};
  const minStock = form.min_stock === '' ? 0 : parseQty(form.min_stock);
  if (minStock === null) return (errors.value = { min_stock_milli: 'Enter a number, up to 3 decimals' });
  busy.value = true;
  try {
    const payload = {
      id: form.id || '', sku: form.sku, name: form.name, unit: form.unit, decimal_qty: form.decimal_qty ? 1 : 0,
      price: form.price === '' ? NaN : Number(form.price), cost_price: form.cost_price === '' ? 0 : Number(form.cost_price),
      min_stock_milli: minStock, barcodes: form.barcodes, is_active: form.is_active,
    };
    if (form.category_id === '__new') payload.category_name = form.new_category;
    else payload.category_id = form.category_id || null;
    const id = await saveProduct(payload);
    toast(isNew.value ? 'Product added.' : 'Product saved.');
    if (isNew.value && !route.query.barcode) router.replace('/stock/move/' + id);
    else router.back();
  } catch (e) {
    if (e.fields) errors.value = e.fields;
    else errorToast(e);
  } finally {
    busy.value = false;
  }
}

async function toggleActive() {
  await setProductActive(form.id, !form.is_active);
  form.is_active = form.is_active ? 0 : 1;
  toast(form.is_active ? 'Product restored.' : 'Product archived. Past sales keep it.');
}
</script>

<template>
  <div class="screen">
    <header class="subbar">
      <button type="button" class="icon-btn" aria-label="Back" @click="router.back()"><Icon name="back" :size="24" /></button>
      <h1 class="spacer">{{ isNew ? 'New product' : 'Edit product' }}</h1>
    </header>

    <main v-if="loaded" class="scroll">
      <form class="page num" @submit.prevent="save">
        <label class="field"><span>Name</span>
          <input v-model="form.name" class="input" :class="{ invalid: errors.name }" placeholder="e.g. Mineral Water 600 ml" autocomplete="off" />
          <span v-if="errors.name" class="field-error">{{ errors.name }}</span></label>

        <div class="grid-2">
          <label class="field"><span>SKU</span>
            <input v-model="form.sku" class="input" :class="{ invalid: errors.sku }" placeholder="DRK-001" autocomplete="off" style="text-transform: uppercase" />
            <span v-if="errors.sku" class="field-error">{{ errors.sku }}</span></label>
          <label class="field"><span>Category</span>
            <select v-model="form.category_id" class="input">
              <option value="">Uncategorised</option>
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
              <option value="__new">New category…</option>
            </select></label>
        </div>
        <label v-if="form.category_id === '__new'" class="field"><span>New category name</span>
          <input v-model="form.new_category" class="input" placeholder="e.g. Snacks" /></label>

        <div class="field">
          <span class="field-label">Barcodes</span>
          <div v-if="form.barcodes.length" style="display: flex; flex-wrap: wrap; gap: 8px">
            <span v-for="b in form.barcodes" :key="b" class="pill soft">{{ b }}
              <button type="button" class="icon-btn" style="width: 28px; height: 28px" :aria-label="'Remove barcode ' + b" @click="form.barcodes = form.barcodes.filter((x) => x !== b)"><Icon name="close" :size="16" /></button>
            </span>
          </div>
          <div style="display: flex; gap: 8px">
            <input v-model="newBarcode" class="input" placeholder="Type or scan a barcode" inputmode="numeric" @keydown.enter.prevent="addBarcode()" />
            <button type="button" class="btn btn-sm" style="min-height: 52px" @click="addBarcode()">Add</button>
            <button type="button" class="icon-btn filled" style="width: 52px; height: 52px" aria-label="Scan barcode with camera" @click="scanBarcode"><Icon name="scan" :size="22" /></button>
          </div>
          <span v-if="errors.barcodes" class="field-error">{{ errors.barcodes }}</span>
          <p class="hint">A hand scanner types into the box above. Each barcode can belong to one product only.</p>
        </div>

        <div class="grid-2">
          <label class="field"><span>Selling price (Rp{{ form.decimal_qty ? ' per ' + (form.unit || 'unit') : '' }})</span>
            <input class="input big" :class="{ invalid: errors.price }" inputmode="numeric" :value="priceField.value" placeholder="0" @input="priceField.onInput" />
            <span v-if="errors.price" class="field-error">{{ errors.price }}</span></label>
          <label class="field"><span>Cost price (Rp)</span>
            <input class="input big" inputmode="numeric" :value="costField.value" placeholder="0" @input="costField.onInput" />
            <span v-if="errors.cost_price" class="field-error">{{ errors.cost_price }}</span></label>
        </div>
        <p v-if="margin" class="hint" style="margin-top: -6px">{{ margin }}. Cost price pre-fills stock in; the average cost comes from stock-in movements.</p>

        <div class="grid-2">
          <label class="field"><span>Unit</span>
            <input v-model="form.unit" class="input" placeholder="pcs" list="units" />
            <datalist id="units"><option value="pcs"></option><option value="pack"></option><option value="box"></option><option value="kg"></option><option value="litre"></option><option value="metre"></option></datalist></label>
          <label class="field"><span>Minimum stock</span>
            <input v-model="form.min_stock" class="input" :class="{ invalid: errors.min_stock_milli }" :inputmode="form.decimal_qty ? 'decimal' : 'numeric'" placeholder="0" />
            <span v-if="errors.min_stock_milli" class="field-error">{{ errors.min_stock_milli }}</span></label>
        </div>

        <label class="check-row card" style="padding: 10px 14px">
          <span>Sold in fractions (kg, litre, metre)<br /><span class="hint">The cart opens a keypad for the quantity, up to 3 decimals.</span></span>
          <input :checked="!!form.decimal_qty" type="checkbox" @change="form.decimal_qty = $event.target.checked ? 1 : 0" />
        </label>
        <span v-if="errors.decimal_qty" class="field-error">{{ errors.decimal_qty }}</span>

        <button v-if="!isNew" type="button" class="btn" :class="form.is_active ? 'btn-danger-outline' : ''" @click="toggleActive">
          {{ form.is_active ? 'Archive product' : 'Restore product' }}
        </button>
        <p v-if="!isNew" class="hint">Archived products are hidden from checkout and the stock list. Sales and movements keep pointing at them.</p>
        <button type="submit" class="sr-only">Save</button>
      </form>
    </main>

    <footer class="footer-bar">
      <button type="button" class="btn btn-primary btn-block" style="min-height: 56px" :disabled="busy" @click="save">{{ isNew ? 'Add product' : 'Save product' }}</button>
    </footer>
  </div>
</template>
