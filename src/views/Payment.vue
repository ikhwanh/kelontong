<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import { cart, cartCalc, clearCart } from '../services/cart.js';
import { completeSale } from '../services/sales.js';
import { formatRp, shortRp } from '../lib/money.js';
import { quickTenders } from '../lib/checkout.js';
import { errorToast } from '../services/ui.js';

const router = useRouter();
const tendered = ref(0);
const busy = ref(false);
const total = computed(() => cartCalc.value.total);
const enough = computed(() => tendered.value >= total.value);
const set = (v) => (tendered.value = Math.min(Math.max(v, 0), 999_999_999));
const quick = computed(() => quickTenders(total.value).map((v, i) => ({ v, label: i === 0 ? 'Exact' : shortRp(v) })));
const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', 'back'];

function press(k) {
  if (k === 'back') set(Math.floor(tendered.value / 10));
  else if (k === '000') set(tendered.value * 1000);
  else set(tendered.value * 10 + Number(k));
}

async function complete() {
  if (!enough.value || busy.value) return;
  busy.value = true;
  try {
    const { saleId } = await completeSale(cart, tendered.value);
    await clearCart();
    router.replace('/done/' + saleId);
  } catch (e) {
    errorToast(e);
  } finally {
    busy.value = false;
  }
}

function onKey(e) {
  if (/^[0-9]$/.test(e.key)) press(e.key);
  else if (e.key === 'Backspace') press('back');
  else if (e.key === 'Enter') complete();
  else return;
  e.preventDefault();
}

onMounted(() => {
  if (!cart.lines.length) router.replace('/');
  window.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="screen">
    <header class="subbar">
      <button type="button" class="icon-btn" aria-label="Back to cart" @click="router.back()"><Icon name="back" :size="24" /></button>
      <h1 class="spacer">Cash payment</h1>
    </header>

    <main class="scroll">
      <div class="page num" style="max-width: 520px; min-height: 100%">
        <div class="kv" style="align-items: baseline">
          <span style="font-size: 14px; font-weight: 600">Total due</span>
          <span style="font-size: 24px; font-weight: 800">{{ formatRp(total) }}</span>
        </div>

        <div class="big-display">
          <span class="label">Cash received</span>
          <output aria-live="polite">{{ formatRp(tendered) }}</output>
        </div>

        <div class="quick">
          <button v-for="q in quick" :key="q.v" type="button" @click="set(q.v)">{{ q.label }}</button>
        </div>

        <div class="change" :class="enough ? 'ok' : 'short'">
          <span style="font-size: 15px; font-weight: 700">{{ enough ? 'Change due' : 'Still short' }}</span>
          <span style="font-size: 26px; font-weight: 800">{{ formatRp(Math.abs(tendered - total)) }}</span>
        </div>

        <div class="keypad" style="margin-top: auto">
          <button v-for="k in keys" :key="k" type="button" :aria-label="k === 'back' ? 'Delete last digit' : k" @click="press(k)">
            <Icon v-if="k === 'back'" name="close" :size="24" />
            <template v-else>{{ k }}</template>
          </button>
        </div>
      </div>
    </main>

    <footer style="padding: 12px 16px max(16px, env(safe-area-inset-bottom)); max-width: 520px; width: 100%; margin: 0 auto">
      <button type="button" class="btn btn-primary btn-lg btn-block" :disabled="!enough || busy" @click="complete">
        <template v-if="enough"><Icon name="check" :size="22" :stroke="2.4" />Complete sale</template>
        <template v-else>Enter at least the total</template>
      </button>
    </footer>
  </div>
</template>

<style scoped>
.change { display: flex; justify-content: space-between; align-items: center; min-height: 60px; padding: 0 16px; border-radius: 14px; }
.change.ok { background: var(--accent-soft); color: var(--accent-text); }
.change.short { background: var(--danger-soft); color: var(--danger); }
</style>
