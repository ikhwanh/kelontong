<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import Icon from '../components/Icon.vue';
import { listProducts, duplicateSkus, stockCounts } from '../services/products.js';
import { dataVersion } from '../db/index.js';
import { formatRp } from '../lib/money.js';
import { formatQty } from '../lib/qty.js';

const search = ref('');
const filter = ref('all');
const showArchived = ref(false);
const products = ref([]);
const dupes = ref(new Set());
const counts = ref({ all_count: 0, low_count: 0, neg_count: 0 });

async function load() {
  const [p, d, c] = await Promise.all([listProducts({ search: search.value, includeInactive: showArchived.value }), duplicateSkus(), stockCounts()]);
  products.value = p;
  dupes.value = d;
  counts.value = c;
}
let t;
watch(search, () => {
  clearTimeout(t);
  t = setTimeout(load, 120);
});
watch([dataVersion, showArchived], load);
onMounted(load);

const rows = computed(() =>
  products.value
    .map((p) => {
      const neg = p.on_hand_milli < 0;
      const low = !neg && p.on_hand_milli <= p.min_stock_milli;
      return { ...p, neg, low, dup: p.is_active && dupes.value.has(p.sku.toUpperCase()) };
    })
    .filter((r) => filter.value === 'all' || (filter.value === 'low' ? r.neg || r.low : r.neg))
    .sort((a, b) => (filter.value === 'all' ? 0 : a.on_hand_milli - b.on_hand_milli)),
);

const filters = computed(() => [
  { id: 'all', label: 'All', count: counts.value.all_count },
  { id: 'low', label: 'Low stock', count: counts.value.low_count },
  { id: 'neg', label: 'Negative', count: counts.value.neg_count },
]);

const unit = (p) => (p.decimal_qty ? ' ' + p.unit : '');
</script>

<template>
  <div class="screen">
    <header class="topbar">
      <div class="topbar-row" style="gap: 8px">
        <h1 class="title">Stock</h1>
        <RouterLink to="/import" class="pill"><Icon name="upload" :size="18" />Import</RouterLink>
        <RouterLink to="/products/new" class="icon-btn add-btn" aria-label="Add product"><Icon name="plus" :stroke="2.2" /></RouterLink>
      </div>
      <label class="search" style="height: 46px">
        <Icon name="search" />
        <span class="sr-only">Search stock</span>
        <input v-model="search" type="search" placeholder="Search name, SKU or barcode" />
      </label>
      <div class="chips" role="group" aria-label="Filter">
        <button v-for="f in filters" :key="f.id" type="button" class="chip" style="font-size: 13px; font-weight: 700" :aria-pressed="filter === f.id" @click="filter = f.id">
          {{ f.label }}<span class="count">{{ f.count }}</span>
        </button>
      </div>
    </header>

    <main class="scroll">
      <div class="page num" style="padding-bottom: 88px">
        <div v-if="rows.length" class="list">
          <RouterLink v-for="r in rows" :key="r.id" :to="'/stock/move/' + r.id" class="list-row" style="min-height: 66px" :style="{ opacity: r.is_active ? 1 : 0.6 }">
            <div class="main">
              <div class="t">{{ r.name }}</div>
              <div class="s">{{ r.sku }} · min {{ formatQty(r.min_stock_milli) }}{{ unit(r) }} · avg cost {{ formatRp(Math.round(r.avg_cost)) }}</div>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 3px">
              <span :style="{ fontSize: '17px', fontWeight: 800, color: r.neg ? 'var(--danger)' : 'var(--text)' }">{{ formatQty(r.on_hand_milli) }}{{ unit(r) }}</span>
              <span v-if="!r.is_active" class="badge">Archived</span>
              <span v-else-if="r.dup" class="badge danger"><Icon name="warn" :size="12" />Duplicate SKU</span>
              <span v-else-if="r.neg" class="badge danger"><Icon name="warn" :size="12" />Negative</span>
              <span v-else-if="r.low" class="badge warn"><Icon name="warn" :size="12" />Low stock</span>
            </div>
          </RouterLink>
        </div>
        <div v-else class="empty">
          {{ search ? 'No product matches “' + search + '”.' : filter === 'all' ? 'No products yet. Add one or import a file.' : 'Nothing here. Stock levels look fine.' }}
        </div>
        <label class="check-row" style="font-weight: 500; color: var(--muted)">
          Show archived products
          <input v-model="showArchived" type="checkbox" />
        </label>
      </div>
    </main>

    <RouterLink to="/stock/move" class="fab"><Icon name="arrowIn" :stroke="2.2" />Stock in</RouterLink>
  </div>
</template>

<style scoped>
.add-btn { width: 40px; height: 40px; border-radius: 999px; background: var(--text); color: var(--bg); }
.fab { position: absolute; right: 16px; bottom: 16px; display: flex; align-items: center; gap: 8px; min-height: 52px; padding: 0 18px; border-radius: 999px; background: var(--accent); color: var(--on-accent); text-decoration: none; font-size: 15px; font-weight: 800; box-shadow: var(--shadow); }
</style>
