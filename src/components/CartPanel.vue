<script setup>
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import Icon from './Icon.vue';
import DiscountSheet from './DiscountSheet.vue';
import QuantitySheet from './QuantitySheet.vue';
import TextSheet from './TextSheet.vue';
import { cart, cartCalc, setLineQty, removeLine, setLineNote, setLineDiscount, setBillDiscount, clearCart, parkCart, addToCart } from '../services/cart.js';
import { formatRp, formatMinusRp } from '../lib/money.js';
import { formatQty } from '../lib/qty.js';
import { lineGross } from '../lib/checkout.js';
import { toast } from '../services/ui.js';

const props = defineProps({ variant: { type: String, default: 'page' } });
const router = useRouter();

const sheet = ref(null); // { kind: 'qty'|'disc'|'note'|'bill'|'park'|'clear', key }

const rows = computed(() =>
  cart.lines.map((l, i) => {
    const p = cart.products[l.product_id] || { name: '…', price: 0, unit: 'pcs', decimal_qty: 0 };
    const c = cartCalc.value.lines[i] || { gross: 0, itemDiscount: 0, base: 0 };
    const d = l.discount;
    return {
      ...l, p, c,
      qtyLabel: p.decimal_qty ? formatQty(l.qty_milli) + ' ' + p.unit : formatQty(l.qty_milli),
      unitLabel: p.decimal_qty ? formatRp(p.price) + ' / ' + p.unit : formatRp(p.price) + ' each',
      discLabel: d ? (d.type === 'percent' ? '−' + String(d.value / 100).replace('.', ',') + '%' : '− ' + formatRp(d.value)) : 'Discount',
    };
  }),
);

const pieceCount = computed(() => cartCalc.value.itemCount);
const activeRow = computed(() => rows.value.find((r) => r.key === sheet.value?.key));

function open(kind, key) {
  sheet.value = { kind, key };
}
const close = () => (sheet.value = null);

async function inc(r) {
  await setLineQty(r.key, r.qty_milli + 1000);
}
async function dec(r) {
  await setLineQty(r.key, r.qty_milli - 1000);
}

async function onRemove(r) {
  const snapshot = { ...r };
  await removeLine(r.key);
  toast(`Removed ${r.p.name}`, {
    action: {
      label: 'Undo',
      run: async () => {
        const key = await addToCart(r.p, snapshot.qty_milli);
        if (snapshot.note) await setLineNote(key, snapshot.note);
        if (snapshot.discount) await setLineDiscount(key, snapshot.discount);
      },
    },
  });
}

async function onQty(milli) {
  await setLineQty(sheet.value.key, milli);
  close();
}
async function onQtyRemove() {
  await removeLine(sheet.value.key);
  close();
}
async function onDisc(discount) {
  await setLineDiscount(sheet.value.key, discount);
  close();
}
async function onNote(note) {
  await setLineNote(sheet.value.key, note);
  close();
}
async function onBill(discount) {
  await setBillDiscount(discount);
  close();
}
async function onPark(note) {
  await parkCart(note);
  close();
  toast('Sale parked. Resume it from Sales.');
  if (props.variant === 'page') router.push('/');
}
async function onClear() {
  await clearCart();
  close();
}

const billDiscount = computed(() => (cart.bill_discount_type ? { type: cart.bill_discount_type, value: cart.bill_discount_value } : null));
</script>

<template>
  <div class="cart-panel" :class="'v-' + variant">
    <header v-if="variant === 'page'" class="subbar">
      <RouterLink to="/" class="icon-btn" aria-label="Back to products"><Icon name="back" :size="24" /></RouterLink>
      <div class="spacer">
        <h1>Cart</h1>
        <div class="sub num">{{ cart.lines.length }} lines · {{ pieceCount }} items</div>
      </div>
      <button v-if="cart.lines.length" type="button" class="btn btn-sm btn-text danger-text" @click="open('clear')">Clear</button>
    </header>
    <div v-else class="side-head">
      <h2>Cart <span class="muted num">· {{ cart.lines.length }} lines · {{ pieceCount }} items</span></h2>
      <button v-if="cart.lines.length" type="button" class="btn btn-sm btn-text danger-text" @click="open('clear')">Clear</button>
    </div>

    <div class="scroll">
      <div class="lines">
        <div v-if="!cart.lines.length" class="empty">Scan a barcode or tap a product to start a sale</div>
        <article v-for="r in rows" :key="r.key" class="line">
          <div class="line-top">
            <div class="spacer" style="min-width: 0">
              <div class="line-name">{{ r.p.name }}</div>
              <div class="line-unit num">{{ r.unitLabel }}</div>
            </div>
            <div class="num" style="text-align: right">
              <div class="line-net">{{ formatRp(r.c.base) }}</div>
              <div v-if="r.c.itemDiscount > 0" class="line-gross">{{ formatRp(r.c.gross) }}</div>
            </div>
          </div>
          <div v-if="r.note" class="line-note"><Icon name="pencil" :size="16" :stroke="1.8" />{{ r.note }}</div>
          <div class="line-actions">
            <div v-if="!r.p.decimal_qty" class="stepper">
              <button type="button" :aria-label="'Decrease ' + r.p.name" @click="dec(r)"><Icon name="minus" :stroke="2.2" /></button>
              <span class="num">{{ r.qtyLabel }}</span>
              <button type="button" :aria-label="'Increase ' + r.p.name" @click="inc(r)"><Icon name="plus" :stroke="2.2" /></button>
            </div>
            <button v-else type="button" class="qty-btn num" :aria-label="'Change quantity of ' + r.p.name + ', now ' + r.qtyLabel" @click="open('qty', r.key)">
              <Icon name="scale" :size="18" :stroke="1.8" />{{ r.qtyLabel }}
            </button>
            <button type="button" class="disc-btn" :class="{ on: r.discount }" @click="open('disc', r.key)">
              <Icon name="tag" :size="16" />{{ r.discLabel }}
            </button>
            <button type="button" class="icon-btn outlined" :aria-label="'Add note to ' + r.p.name" @click="open('note', r.key)">
              <Icon name="pencil" :size="18" :stroke="1.8" />
            </button>
            <button type="button" class="icon-btn danger-text" style="margin-left: auto" :aria-label="'Remove ' + r.p.name" @click="onRemove(r)">
              <Icon name="trash" :stroke="1.8" />
            </button>
          </div>
        </article>

        <section v-if="cart.lines.length" aria-label="Totals" class="totals num">
          <div class="kv"><span>Subtotal</span><span>{{ formatRp(cartCalc.subtotal) }}</span></div>
          <div class="kv"><span>Item discounts</span><span>{{ formatMinusRp(cartCalc.itemDiscountTotal) }}</span></div>
          <div class="kv" style="align-items: center">
            <span>Bill discount</span>
            <button type="button" class="bill-btn" @click="open('bill')">
              {{ cartCalc.billDiscountAmount > 0 ? '− ' + formatRp(cartCalc.billDiscountAmount) : 'Add' }}
              <Icon name="pencil" :size="14" />
            </button>
          </div>
          <div class="divider"></div>
          <div class="kv" style="align-items: baseline"><span style="font-size: 15px; font-weight: 700; color: var(--text)">Total</span><span style="font-size: 22px; font-weight: 800">{{ formatRp(cartCalc.total) }}</span></div>
          <p class="hint">The bill discount is spread over the lines by amount, so profit per product stays correct.</p>
        </section>
      </div>
    </div>

    <footer class="footer-bar">
      <button type="button" class="btn" :disabled="!cart.lines.length" @click="open('park')"><Icon name="park" />Park</button>
      <RouterLink v-if="cart.lines.length" to="/pay" class="btn btn-primary grow num">Pay {{ formatRp(cartCalc.total) }}</RouterLink>
      <button v-else type="button" class="btn btn-primary grow" disabled>Pay</button>
    </footer>

    <QuantitySheet v-if="sheet?.kind === 'qty' && activeRow" :product="activeRow.p" :initial-milli="activeRow.qty_milli" removable @set="onQty" @remove="onQtyRemove" @close="close" />
    <DiscountSheet
      v-if="sheet?.kind === 'disc' && activeRow"
      title="Item discount"
      :subtitle="activeRow.p.name + ' · ' + activeRow.qtyLabel + ' × ' + formatRp(activeRow.p.price) + ' = ' + formatRp(activeRow.c.gross)"
      :base="activeRow.c.gross" :current="activeRow.discount" @apply="onDisc" @close="close"
    />
    <TextSheet v-if="sheet?.kind === 'note' && activeRow" title="Item note" :subtitle="activeRow.p.name" label="Note (shown on the receipt)" placeholder="e.g. 3 original, 2 spicy" :initial="activeRow.note" @save="onNote" @close="close" />
    <DiscountSheet
      v-if="sheet?.kind === 'bill'" title="Bill discount" scope="bill" base-label="After item discounts" result-label="New total"
      :subtitle="'Subtotal after item discounts ' + formatRp(cartCalc.afterItems)" :base="cartCalc.afterItems" :current="billDiscount" @apply="onBill" @close="close"
    />
    <TextSheet v-if="sheet?.kind === 'park'" title="Park sale" :subtitle="formatRp(cartCalc.total) + ' · ' + pieceCount + ' items'" label="Note (optional)" placeholder="e.g. Customer fetching wallet" confirm-label="Park sale" @save="onPark" @close="close">
      <p class="hint">Parked sales stay on this device. Resume them from the Sales screen.</p>
    </TextSheet>
    <Teleport to="body">
      <div v-if="sheet?.kind === 'clear'" class="sheet-wrap" @click.self="close">
        <section class="sheet" role="alertdialog" aria-labelledby="clear-t">
          <h2 id="clear-t" style="margin: 0; font-size: 19px; font-weight: 800">Clear the cart?</h2>
          <p class="hint" style="font-size: 14px">All {{ cart.lines.length }} lines are removed. Nothing is saved.</p>
          <div style="display: flex; gap: 10px">
            <button type="button" class="btn grow" @click="close">Keep</button>
            <button type="button" class="btn btn-danger grow" @click="onClear">Clear cart</button>
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.cart-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--bg); }
.cart-panel.v-side { background: var(--surface); }
.side-head { display: flex; align-items: center; gap: 8px; padding: 14px 16px 8px; }
.side-head h2 { flex: 1; margin: 0; font-size: 18px; font-weight: 800; }
.side-head h2 .muted { font-size: 13px; font-weight: 600; }
.lines { display: flex; flex-direction: column; gap: 10px; padding: 12px 12px 16px; }
.v-side .lines { padding-top: 4px; }
.line { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 14px; background: var(--surface); border: 1px solid var(--border); }
.v-side .line { background: var(--bg); }
.line-top { display: flex; gap: 10px; align-items: flex-start; }
.line-name { font-size: 15px; font-weight: 700; }
.line-unit { font-size: 12px; color: var(--muted); }
.line-net { font-size: 15px; font-weight: 800; }
.line-gross { font-size: 12px; color: var(--muted); text-decoration: line-through; }
.line-note { display: flex; gap: 6px; align-items: center; font-size: 13px; color: var(--muted); }
.line-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.stepper { display: flex; align-items: center; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-2); }
.stepper button { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border: 0; background: transparent; }
.stepper span { min-width: 32px; text-align: center; font-size: 16px; font-weight: 800; }
.qty-btn { display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px 0 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-2); font-size: 16px; font-weight: 800; }
.disc-btn { display: flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 12px; border-radius: 12px; border: 0; background: var(--surface); font-size: 13px; font-weight: 700; }
.v-side .disc-btn { background: var(--surface-2); }
.disc-btn.on { background: var(--accent-soft); color: var(--accent-text); }
.totals { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--border); }
.bill-btn { display: flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 10px; border-radius: 10px; border: 1px dashed var(--border); background: transparent; font-size: 14px; font-weight: 600; }
</style>
