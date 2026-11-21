<script setup>
import { ref, computed } from 'vue';
import Sheet from './Sheet.vue';
import Icon from './Icon.vue';
import { formatRp, groupThousands } from '../lib/money.js';
import { rawDiscountAmount } from '../lib/checkout.js';

const props = defineProps({
  title: String,
  subtitle: String,
  base: Number, // the amount the discount applies to
  baseLabel: { type: String, default: 'Line amount' },
  resultLabel: { type: String, default: 'New line total' },
  scope: { type: String, default: 'line' },
  current: Object, // { type, value } | null
});
const emit = defineEmits(['apply', 'close']);

const bpToText = (bp) => String(bp / 100).replace('.', ',');
const mode = ref(props.current?.type || 'percent');
const text = ref(props.current ? (props.current.type === 'percent' ? bpToText(props.current.value) : String(props.current.value)) : '');

function cleanPercent(s) {
  const [whole, ...rest] = String(s).replace(/\./g, ',').replace(/[^\d,]/g, '').split(',');
  const out = rest.length ? whole + ',' + rest.join('').slice(0, 2) : whole;
  return (parseFloat(out.replace(',', '.')) || 0) > 100 ? '100' : out;
}

const value = computed(() => {
  if (mode.value === 'percent') return Math.round((parseFloat(text.value.replace(',', '.')) || 0) * 100);
  return parseInt(text.value.replace(/\D/g, ''), 10) || 0;
});
const raw = computed(() => rawDiscountAmount(props.base, { type: mode.value, value: value.value }));
const amount = computed(() => Math.min(raw.value, props.base));
const capped = computed(() => raw.value > props.base);
const display = computed(() => (mode.value === 'percent' ? text.value : value.value ? groupThousands(value.value) : ''));

function onInput(e) {
  const v = String(e.target.value);
  text.value = mode.value === 'percent' ? cleanPercent(v) : String(parseInt(v.replace(/\D/g, ''), 10) || '');
  e.target.value = display.value;
}

function setMode(m) {
  if (mode.value === m) return;
  mode.value = m;
  text.value = '';
}

const quick = computed(() =>
  mode.value === 'percent'
    ? ['2,5', '5', '10', '15'].map((v) => ({ label: v + '%', text: v }))
    : [1000, 2000, 5000, 10000].map((v) => ({ label: formatRp(v), text: String(v) })),
);

function apply() {
  emit('apply', value.value > 0 ? { type: mode.value, value: value.value } : null);
}
</script>

<template>
  <Sheet :title="title" :subtitle="subtitle" @close="emit('close')">
    <div class="seg" role="group" aria-label="Discount type">
      <button type="button" :aria-pressed="mode === 'percent'" @click="setMode('percent')">Percent %</button>
      <button type="button" :aria-pressed="mode === 'fixed'" @click="setMode('fixed')">Amount Rp</button>
    </div>

    <label class="field">
      <span>{{ mode === 'percent' ? (scope === 'bill' ? 'Percent off the bill' : 'Percent off this line') : (scope === 'bill' ? 'Rupiah off the bill' : 'Rupiah off this line') }}</span>
      <span class="disc-input">
        <span v-if="mode === 'fixed'" class="unit">Rp</span>
        <input :inputmode="mode === 'percent' ? 'decimal' : 'numeric'" :value="display" placeholder="0" autofocus @input="onInput" @keydown.enter="apply" />
        <span v-if="mode === 'percent'" class="unit">%</span>
      </span>
    </label>

    <div style="display: flex; gap: 8px; flex-wrap: wrap">
      <button v-for="q in quick" :key="q.label" type="button" class="quick-btn num" @click="text = q.text">{{ q.label }}</button>
    </div>

    <div class="sum num">
      <div class="kv"><span>{{ baseLabel }}</span><span>{{ formatRp(base) }}</span></div>
      <div class="kv"><span>Discount</span><span>− {{ formatRp(amount) }}</span></div>
      <div class="kv strong"><span>{{ resultLabel }}</span><span>{{ formatRp(base - amount) }}</span></div>
    </div>

    <div v-if="capped" class="notice warn" style="font-weight: 600">
      <Icon name="warn" :size="18" />
      Capped at the {{ scope === 'bill' ? 'bill' : 'line' }} amount. {{ scope === 'bill' ? 'The bill' : 'A line' }} can never go below Rp 0.
    </div>
    <p class="hint">
      <template v-if="scope === 'bill'">Applied to the subtotal after item discounts, and spread over the lines by amount so profit per product stays correct.</template>
      <template v-else>One discount per line. Applying replaces the current one.</template>
      Percent can have up to two decimals (2,5%) and rounds to the nearest rupiah.
    </p>

    <div style="display: flex; gap: 10px">
      <button v-if="current" type="button" class="btn btn-text danger-text" @click="emit('apply', null)">Remove</button>
      <button type="button" class="btn btn-primary grow" @click="apply">Apply discount</button>
    </div>
  </Sheet>
</template>

<style scoped>
.disc-input { display: flex; align-items: center; gap: 8px; height: 60px; padding: 0 16px; border-radius: 14px; border: 2px solid var(--accent); background: var(--surface); }
.disc-input input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; font-size: 26px; font-weight: 800; font-variant-numeric: tabular-nums; }
.disc-input .unit { font-size: 20px; font-weight: 700; color: var(--muted); }
.quick-btn { flex: 1; min-width: 70px; min-height: 44px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); font-size: 14px; font-weight: 700; }
.sum { display: flex; flex-direction: column; gap: 6px; padding: 12px 14px; border-radius: 12px; background: var(--surface-2); }
.sum .strong { font-size: 16px; font-weight: 800; }
.sum .strong > span:first-child { color: var(--text); }
</style>
