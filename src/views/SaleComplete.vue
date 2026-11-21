<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import Icon from '../components/Icon.vue';
import WhatsAppReceipt from '../components/WhatsAppReceipt.vue';
import { getSale } from '../services/sales.js';
import { formatRp } from '../lib/money.js';
import { longDateTime } from '../lib/time.js';

const route = useRoute();
const sale = ref(null);
onMounted(async () => (sale.value = await getSale(route.params.id)));
</script>

<template>
  <div class="screen">
    <main class="scroll">
      <div v-if="sale" class="page num" style="max-width: 560px; padding-top: max(24px, env(safe-area-inset-top))">
        <div style="display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center">
          <span class="done-icon"><Icon name="check" :size="34" :stroke="2.4" /></span>
          <h1 style="margin: 0; font-size: 22px; font-weight: 800">Sale complete</h1>
          <div class="muted" style="font-size: 13px">{{ sale.receipt_no }} · {{ longDateTime(sale.sold_at) }}</div>
        </div>
        <div class="stats">
          <div class="stat"><div class="l">Total</div><div class="v">{{ formatRp(sale.total) }}</div></div>
          <div class="stat"><div class="l">Cash</div><div class="v">{{ formatRp(sale.cash_tendered) }}</div></div>
          <div class="stat accent"><div class="l">Change</div><div class="v">{{ formatRp(sale.change_due) }}</div></div>
        </div>
        <WhatsAppReceipt :sale="sale" />
      </div>
    </main>
    <footer style="padding: 12px 16px max(16px, env(safe-area-inset-bottom)); border-top: 1px solid var(--border)">
      <div style="max-width: 560px; margin: 0 auto">
        <RouterLink to="/" replace class="btn btn-block" style="min-height: 56px; font-size: 16px; font-weight: 800"><Icon name="plus" :size="22" :stroke="2.2" />New sale</RouterLink>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.done-icon { display: flex; align-items: center; justify-content: center; width: 64px; height: 64px; border-radius: 50%; background: var(--accent-soft); color: var(--accent-text); }
.stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.stat { padding: 10px 12px; border-radius: 12px; background: var(--surface); border: 1px solid var(--border); }
.stat .l { font-size: 12px; color: var(--muted); }
.stat .v { font-size: 15px; font-weight: 800; }
.stat.accent { background: var(--accent-soft); color: var(--accent-text); border-color: transparent; }
.stat.accent .l { color: inherit; font-weight: 600; }
</style>
