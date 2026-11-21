<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import Sheet from './Sheet.vue';
import Icon from './Icon.vue';
import { formatRp } from '../lib/money.js';
import { formatQty, parseQty } from '../lib/qty.js';
import { lineGross } from '../lib/checkout.js';

const props = defineProps({ product: Object, initialMilli: { type: Number, default: 0 }, removable: Boolean });
const emit = defineEmits(['set', 'remove', 'close']);

const text = ref(props.initialMilli ? formatQty(props.initialMilli).replace(/\./g, '') : '');
const milli = computed(() => parseQty(text.value || '0') ?? 0);
const unit = computed(() => props.product.unit);

function press(k) {
  const cur = text.value;
  const [whole, frac] = cur.split(',');
  if (k === 'back') return (text.value = cur.slice(0, -1));
  if (k === ',') {
    if (!cur.includes(',')) text.value = (cur || '0') + ',';
    return;
  }
  if (frac !== undefined && frac.length >= 3) return;
  if (frac === undefined && whole.length >= 5) return;
  text.value = cur === '0' ? k : cur + k;
}

const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'back'];
const quick = [250, 500, 1000, 2000];

function onKey(e) {
  if (/^[0-9]$/.test(e.key)) press(e.key);
  else if (e.key === ',' || e.key === '.') press(',');
  else if (e.key === 'Backspace') press('back');
  else if (e.key === 'Enter' && milli.value > 0) emit('set', milli.value);
  else return;
  e.preventDefault();
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <Sheet title="Quantity" :subtitle="product.name + ' · ' + formatRp(product.price) + ' / ' + unit" @close="emit('close')">
    <div class="big-display">
      <span class="label">Quantity in {{ unit }}</span>
      <span style="display: flex; align-items: baseline; gap: 8px">
        <output aria-live="polite">{{ text || '0' }}</output>
        <span style="font-size: 20px; font-weight: 700; color: var(--muted)">{{ unit }}</span>
      </span>
    </div>

    <div class="quick">
      <button v-for="m in quick" :key="m" type="button" @click="text = formatQty(m)">{{ formatQty(m) }} {{ unit }}</button>
    </div>

    <div class="kv num" style="align-items: center; padding: 12px 14px; border-radius: 12px; background: var(--surface-2)">
      <span style="display: flex; flex-direction: column; gap: 2px">
        <span style="font-size: 14px; font-weight: 700; color: var(--text)">Line total</span>
        <span style="font-size: 12px">{{ formatQty(milli) }} {{ unit }} × {{ formatRp(product.price) }}</span>
      </span>
      <span style="font-size: 20px; font-weight: 800">{{ formatRp(lineGross(milli, product.price)) }}</span>
    </div>
    <p class="hint">Up to 3 decimals. The line total rounds to the nearest rupiah.</p>

    <div class="keypad flat">
      <button v-for="k in keys" :key="k" type="button" :aria-label="k === 'back' ? 'Delete last digit' : k === ',' ? 'Decimal comma' : k" @click="press(k)">
        <Icon v-if="k === 'back'" name="close" :size="22" />
        <template v-else>{{ k }}</template>
      </button>
    </div>

    <div style="display: flex; gap: 10px">
      <button v-if="removable" type="button" class="btn btn-text danger-text" @click="emit('remove')">Remove</button>
      <button type="button" class="btn btn-primary grow" :disabled="milli <= 0" @click="emit('set', milli)">
        {{ milli > 0 ? 'Set ' + formatQty(milli) + ' ' + unit : 'Enter a quantity' }}
      </button>
    </div>
  </Sheet>
</template>
