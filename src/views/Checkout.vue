<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import ProductTile from '../components/ProductTile.vue';
import CartPanel from '../components/CartPanel.vue';
import QuantitySheet from '../components/QuantitySheet.vue';
import { listProducts, listCategories, findByCode } from '../services/products.js';
import { cart, cartCalc, cartQtyByProduct, addToCart, parkedCount, refreshCartProducts } from '../services/cart.js';
import { device } from '../services/device.js';
import { dataVersion } from '../db/index.js';
import { formatRp } from '../lib/money.js';
import { useHandScanner } from '../lib/handScanner.js';
import { isWide } from '../lib/media.js';
import { toast, beep } from '../services/ui.js';

const router = useRouter();
const search = ref('');
const category = ref('all');
const products = ref([]);
const categories = ref([]);
const parked = ref(0);
const qtyFor = ref(null);

async function load() {
  const [p, c, n] = await Promise.all([
    listProducts({ search: search.value, categoryId: category.value === 'all' ? null : category.value }),
    listCategories(),
    parkedCount(),
  ]);
  products.value = p;
  categories.value = c;
  parked.value = n;
}

let t;
watch(search, () => {
  clearTimeout(t);
  t = setTimeout(load, 120);
});
watch([category, dataVersion], load);
onMounted(() => {
  load();
  refreshCartProducts();
});

async function add(product) {
  if (product.decimal_qty) {
    qtyFor.value = product;
    return;
  }
  await addToCart(product, 1000);
}

async function onQtySet(milli) {
  await addToCart(qtyFor.value, milli);
  qtyFor.value = null;
}

async function handleCode(code) {
  const product = await findByCode(code);
  if (!product) {
    beep(false);
    toast(`${code} not found.`, {
      type: 'error', timeout: 6000,
      action: { label: 'Add product', run: () => router.push({ path: '/products/new', query: { barcode: code } }) },
    });
    return false;
  }
  beep(true);
  if (!product.is_active) toast(`${product.name} is archived, added anyway.`);
  await add(product);
  return true;
}

useHandScanner(handleCode);

async function onSearchEnter() {
  const q = search.value.trim();
  if (!q) return;
  const exact = await findByCode(q);
  if (exact) {
    search.value = '';
    beep(true);
    await add(exact);
  } else if (products.value.length === 1) {
    search.value = '';
    await add(products.value[0]);
  }
}

const chips = computed(() => [{ id: 'all', name: 'All' }, ...categories.value]);
const count = computed(() => cartCalc.value.itemCount);
</script>

<template>
  <div class="screen checkout" :class="{ wide: isWide }">
    <section class="products" aria-label="Products">
      <header class="topbar">
        <div class="topbar-row">
          <h1 class="title">Checkout</h1>
          <RouterLink v-if="parked > 0" to="/sales" class="pill soft"><Icon name="park" :size="18" />{{ parked }} parked</RouterLink>
          <span v-if="!isWide" class="device-pill" title="Device code">{{ device.code }}</span>
        </div>
        <div class="topbar-row">
          <label class="search">
            <Icon name="search" />
            <span class="sr-only">Search products</span>
            <input v-model="search" type="search" :placeholder="isWide ? 'Name, SKU or barcode — or just scan' : 'Name, SKU or barcode'" data-scan-target enterkeyhint="search" @keydown.enter.prevent="onSearchEnter" />
          </label>
          <RouterLink to="/scan" class="scan-btn" aria-label="Scan with camera">
            <Icon name="scan" :size="24" />
            <span v-if="isWide">Camera</span>
          </RouterLink>
        </div>
        <div class="scanner-hint">
          <span class="dot"></span>
          Hand scanner ready — scan any time, no need to tap the search box
        </div>
        <div class="chips" role="group" aria-label="Category">
          <button v-for="c in chips" :key="c.id" type="button" class="chip" :aria-pressed="category === c.id" @click="category = c.id">{{ c.name }}</button>
        </div>
      </header>

      <main class="scroll">
        <div v-if="products.length" class="grid">
          <ProductTile v-for="p in products" :key="p.id" :product="p" :in-cart-milli="cartQtyByProduct[p.id] || 0" @add="add" />
        </div>
        <div v-else class="empty">
          <template v-if="search">No product matches “{{ search }}”.</template>
          <template v-else>
            No products yet.
            <div style="display: flex; gap: 8px; justify-content: center; margin-top: 12px">
              <RouterLink to="/products/new" class="btn btn-sm">Add product</RouterLink>
              <RouterLink to="/import" class="btn btn-sm">Import file</RouterLink>
            </div>
          </template>
        </div>
      </main>

      <template v-if="!isWide">
        <div v-if="cart.lines.length" class="cart-bar">
          <RouterLink to="/cart" class="cart-link">
            <span class="cnt num">{{ count }}</span>
            <span class="spacer" style="font-weight: 700; font-size: 15px">View cart</span>
            <span class="num" style="font-weight: 800; font-size: 17px">{{ formatRp(cartCalc.total) }}</span>
            <Icon name="chevron" :stroke="2.2" />
          </RouterLink>
        </div>
        <div v-else class="cart-empty">Scan a barcode or tap a product to start a sale</div>
      </template>
    </section>

    <aside v-if="isWide" class="side-cart" aria-label="Cart">
      <CartPanel variant="side" />
    </aside>

    <QuantitySheet v-if="qtyFor" :product="qtyFor" :initial-milli="0" @set="onQtySet" @close="qtyFor = null" />
  </div>
</template>

<style scoped>
.checkout { flex-direction: row; }
.products { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.scan-btn { display: flex; align-items: center; justify-content: center; gap: 8px; min-width: 48px; height: 48px; padding: 0 12px; flex: none; border-radius: 12px; background: var(--accent); color: var(--on-accent); text-decoration: none; font-weight: 700; font-size: 14px; }
.scanner-hint { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
.scanner-hint .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex: none; }
.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 12px 16px 16px; }
@media (min-width: 560px) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (min-width: 1100px) { .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@media (min-width: 1500px) { .grid { grid-template-columns: repeat(5, minmax(0, 1fr)); } }
.cart-bar { padding: 10px 12px; background: var(--bg); border-top: 1px solid var(--border); }
.cart-link { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 0 14px 0 10px; border-radius: 14px; background: var(--accent); color: var(--on-accent); text-decoration: none; box-shadow: var(--shadow); }
.cart-link .cnt { min-width: 36px; height: 36px; padding: 0 8px; display: flex; align-items: center; justify-content: center; border-radius: 10px; background: rgba(255,255,255,.18); font-weight: 800; font-size: 15px; }
.cart-empty { padding: 14px 16px; text-align: center; font-size: 13px; color: var(--muted); border-top: 1px solid var(--border); }
.side-cart { width: 400px; flex: none; display: flex; flex-direction: column; border-left: 1px solid var(--border); background: var(--surface); }
@media (min-width: 1300px) { .side-cart { width: 440px; } }
</style>
