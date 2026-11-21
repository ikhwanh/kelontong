<script setup>
import { computed } from 'vue';
import { formatRp } from '../lib/money.js';
import { formatQty } from '../lib/qty.js';

const props = defineProps({ product: Object, inCartMilli: { type: Number, default: 0 } });
defineEmits(['add']);

const stock = computed(() => {
  const p = props.product;
  const q = p.on_hand_milli;
  if (q < 0) return { label: 'Stock ' + formatQty(q), cls: 'danger' };
  if (q <= p.min_stock_milli) return { label: 'Low · ' + formatQty(q), cls: 'warn' };
  return { label: formatQty(q), cls: '' };
});
const qtyLabel = computed(() => (props.product.decimal_qty ? formatQty(props.inCartMilli) : formatQty(props.inCartMilli)));
</script>

<template>
  <button type="button" class="tile" :class="{ on: inCartMilli > 0 }" :aria-label="'Add ' + product.name" @click="$emit('add', product)">
    <span class="sku">{{ product.sku }}</span>
    <span class="name">{{ product.name }}</span>
    <span class="foot">
      <span class="price num">{{ formatRp(product.price) }}<span v-if="product.decimal_qty" class="per"> / {{ product.unit }}</span></span>
      <span class="badge num" :class="stock.cls">{{ stock.label }}</span>
    </span>
    <span v-if="inCartMilli > 0" class="qty num">{{ qtyLabel }}</span>
  </button>
</template>

<style scoped>
.tile { position: relative; display: flex; flex-direction: column; align-items: stretch; gap: 6px; min-height: 118px; padding: 12px; border-radius: 14px; border: 1px solid var(--border); background: var(--surface); text-align: left; box-shadow: var(--shadow); }
.tile.on { border-color: var(--accent); }
.sku { font-size: 11px; font-weight: 600; letter-spacing: 0.04em; color: var(--muted); }
.name { font-size: 14px; font-weight: 600; line-height: 1.3; min-height: 36px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.foot { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-top: auto; flex-wrap: wrap; }
.price { font-size: 15px; font-weight: 800; }
.per { font-size: 12px; font-weight: 600; color: var(--muted); }
.qty { position: absolute; top: -6px; right: -6px; min-width: 26px; height: 26px; padding: 0 6px; display: flex; align-items: center; justify-content: center; border-radius: 999px; background: var(--accent); color: var(--on-accent); font-size: 13px; font-weight: 800; border: 2px solid var(--bg); }
</style>
