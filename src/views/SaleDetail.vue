<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import WhatsAppReceipt from '../components/WhatsAppReceipt.vue';
import { getSale, cancelSale } from '../services/sales.js';
import { formatRp } from '../lib/money.js';
import { formatQty } from '../lib/qty.js';
import { longDateTime, dayMonth, hhmm } from '../lib/time.js';
import { errorToast, toast } from '../services/ui.js';

const route = useRoute();
const router = useRouter();
const sale = ref(null);
const confirm = ref(false);
const showReceipt = ref(false);
const busy = ref(false);

async function load() {
  sale.value = await getSale(route.params.id);
}
onMounted(load);

const cancelled = computed(() => sale.value?.status === 'cancelled');
const itemsLabel = computed(() => {
  const n = sale.value?.item_count ?? 0;
  return n + (n === 1 ? ' item' : ' items');
});

function qtyLabel(l) {
  return l.unit && l.unit !== 'pcs' ? formatQty(l.qty_milli) + ' ' + l.unit : formatQty(l.qty_milli);
}

async function doCancel() {
  busy.value = true;
  try {
    await cancelSale(sale.value.id);
    confirm.value = false;
    await load();
    toast(`Sale ${sale.value.receipt_no} cancelled. Stock returned.`);
  } catch (e) {
    errorToast(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="screen">
    <header class="subbar">
      <button type="button" class="icon-btn" aria-label="Back to sales" @click="router.back()"><Icon name="back" :size="24" /></button>
      <div class="spacer" v-if="sale">
        <h1>{{ sale.receipt_no }}</h1>
        <div class="sub">{{ longDateTime(sale.sold_at) }} · Device {{ sale.device_code }}</div>
      </div>
      <span v-if="sale" class="badge" :class="cancelled ? 'danger' : 'accent'" style="padding: 4px 10px; border-radius: 999px; font-size: 12px">{{ cancelled ? 'Cancelled' : 'Completed' }}</span>
    </header>

    <main class="scroll">
      <div v-if="sale" class="page num">
        <div class="list">
          <div v-for="l in sale.lines" :key="l.id" class="list-row" style="min-height: 52px">
            <div class="main">
              <div style="font-size: 14px; font-weight: 600">{{ l.name }}</div>
              <div class="s">
                {{ qtyLabel(l) }} × {{ formatRp(l.unit_price) }}
                <template v-if="l.item_discount_amount"> · discount − {{ formatRp(l.item_discount_amount) }}</template>
                <template v-if="l.note"> · {{ l.note }}</template>
              </div>
            </div>
            <span style="font-size: 14px; font-weight: 700">{{ formatRp(l.gross_amount - l.item_discount_amount) }}</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px; padding: 12px 14px">
            <div v-if="sale.bill_discount_amount" class="kv" style="font-size: 13px"><span>Bill discount</span><span>− {{ formatRp(sale.bill_discount_amount) }}</span></div>
            <div class="kv" style="font-size: 16px; font-weight: 800"><span style="color: var(--text)">Total</span><span :style="{ textDecoration: cancelled ? 'line-through' : 'none' }">{{ formatRp(sale.total) }}</span></div>
            <div class="kv" style="font-size: 13px"><span>Cash</span><span class="muted">{{ formatRp(sale.cash_tendered) }}</span></div>
            <div class="kv" style="font-size: 13px"><span>Change</span><span class="muted">{{ formatRp(sale.change_due) }}</span></div>
          </div>
        </div>
        <div v-if="cancelled" class="notice danger" style="align-items: flex-start">
          <Icon name="warn" />
          <span>Cancelled {{ dayMonth(sale.cancelled_at) }}, {{ hhmm(sale.cancelled_at) }}. {{ itemsLabel }} returned to stock as reversing movements. Not counted in totals or profit.</span>
        </div>
        <WhatsAppReceipt v-if="showReceipt" :sale="sale" />
      </div>
    </main>

    <footer v-if="sale" class="footer-bar">
      <button type="button" class="btn grow" @click="showReceipt = !showReceipt"><Icon name="whatsapp" />{{ showReceipt ? 'Hide receipt' : 'Resend receipt' }}</button>
      <button v-if="!cancelled" type="button" class="btn btn-danger-outline grow" @click="confirm = true">Cancel sale</button>
    </footer>

    <Teleport to="body">
      <div v-if="confirm" class="sheet-wrap" @click.self="confirm = false">
        <section class="sheet" role="alertdialog" aria-labelledby="cx-title" aria-describedby="cx-body" style="padding-top: 20px">
          <span class="cx-icon"><Icon name="warn" :size="24" /></span>
          <h2 id="cx-title" style="margin: 0; font-size: 20px; font-weight: 800">Cancel sale {{ sale.receipt_no }}?</h2>
          <ul id="cx-body" class="cx-list">
            <li>All {{ itemsLabel }} go back into stock.</li>
            <li>The sale stays in the list, marked cancelled, and leaves sales totals and profit.</li>
            <li><strong style="color: var(--text)">This can’t be undone.</strong> To redo it, ring up a new sale.</li>
          </ul>
          <div style="display: flex; gap: 10px">
            <button type="button" class="btn grow" @click="confirm = false">Keep sale</button>
            <button type="button" class="btn btn-danger grow" :disabled="busy" @click="doCancel">Cancel sale</button>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.cx-icon { display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 50%; background: var(--danger-soft); color: var(--danger); }
.cx-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 14px; line-height: 1.45; color: var(--muted); }
</style>
