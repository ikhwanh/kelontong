<script setup>
import { ref, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Sheet from './Sheet.vue';
import Icon from './Icon.vue';
import { listProducts, findByCode } from '../services/products.js';
import { formatQty } from '../lib/qty.js';

const emit = defineEmits(['pick', 'close']);
const router = useRouter();
const search = ref('');
const results = ref([]);

async function load() {
  results.value = await listProducts({ search: search.value, limit: 60 });
}
watch(search, load);
onMounted(load);

async function onEnter() {
  const p = await findByCode(search.value);
  if (p) emit('pick', p);
}
</script>

<template>
  <Sheet title="Choose product" @close="emit('close')">
    <div style="display: flex; gap: 8px">
      <label class="search">
        <Icon name="search" />
        <span class="sr-only">Search products</span>
        <input v-model="search" type="search" placeholder="Name, SKU or barcode" autofocus @keydown.enter="onEnter" />
      </label>
      <button type="button" class="icon-btn filled" style="width: 48px; height: 48px" aria-label="Scan with camera" @click="router.push({ path: '/scan', query: { mode: 'capture' } })"><Icon name="scan" :size="22" /></button>
    </div>
    <div class="list" style="max-height: 50vh; overflow-y: auto">
      <button v-for="p in results" :key="p.id" type="button" class="list-row" style="min-height: 56px" @click="emit('pick', p)">
        <div class="main">
          <div class="t">{{ p.name }}</div>
          <div class="s num">{{ p.sku }} · on hand {{ formatQty(p.on_hand_milli) }}{{ p.decimal_qty ? ' ' + p.unit : '' }}</div>
        </div>
        <Icon name="chevron" :size="18" />
      </button>
      <div v-if="!results.length" class="empty">No products found.</div>
    </div>
  </Sheet>
</template>
