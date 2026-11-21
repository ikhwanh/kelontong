<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import Icon from '../components/Icon.vue';
import * as R from '../services/reports.js';
import { listDevices, device } from '../services/device.js';
import { lastImportPerDevice } from '../services/syncFiles.js';
import { dataVersion } from '../db/index.js';
import { formatRp, groupThousands, compactRp } from '../lib/money.js';
import { formatQty } from '../lib/qty.js';
import { startOfLocalDay, addDays, isoDate, parseIsoDate, dayMonth, relativeDays, dowShort, shortDate } from '../lib/time.js';

const range = ref('7d');
const customFrom = ref(isoDate(addDays(startOfLocalDay(), -6)));
const customTo = ref(isoDate(Date.now()));
const data = ref(null);

const bounds = computed(() => {
  const today = startOfLocalDay();
  if (range.value === 'today') return { from: today, to: addDays(today, 1) };
  if (range.value === '7d') return { from: addDays(today, -6), to: addDays(today, 1) };
  if (range.value === '30d') return { from: addDays(today, -29), to: addDays(today, 1) };
  const a = parseIsoDate(customFrom.value), b = parseIsoDate(customTo.value);
  return { from: Math.min(a, b), to: addDays(Math.max(a, b), 1) };
});

const rangeLabel = computed(() => {
  const { from, to } = bounds.value;
  const last = addDays(to, -1);
  return from === last ? shortDate(from) : dayMonth(from) + ' – ' + dayMonth(last) + ' ' + new Date(last).getFullYear();
});

async function load() {
  const { from, to } = bounds.value;
  const today = startOfLocalDay();
  const [head, days, hours, cats, top, eod, stock, low, devices, imports] = await Promise.all([
    R.headline(from, to), R.salesByDay(from, to), R.salesByHour(from, to), R.salesByCategory(from, to),
    R.salesByProduct(from, to, 10), R.endOfDay(today, addDays(today, 1)), R.stockOverview(), R.lowStockList(),
    listDevices(), lastImportPerDevice(),
  ]);
  data.value = { head, days, hours, cats, top, eod, stock, low, devices, imports };
}
watch([bounds, dataVersion], load, { deep: true });
onMounted(load);

const kpi = computed(() => {
  const h = data.value?.head;
  if (!h) return null;
  const profit = h.sales - h.cogs;
  return {
    sales: formatRp(h.sales), profit: formatRp(profit), cogs: formatRp(h.cogs), tx: groupThousands(h.transactions),
    margin: h.sales ? ((profit / h.sales) * 100).toFixed(1).replace('.', ',') + '% margin' : '—',
    avg: h.transactions ? 'avg ' + formatRp(Math.round(h.sales / h.transactions)) : '',
    discounts: formatRp(h.discounts),
  };
});

const dayBars = computed(() => {
  if (!data.value) return [];
  const map = new Map(data.value.days.map((d) => [d.day, d.sales]));
  const out = [];
  for (let t = bounds.value.from; t < bounds.value.to && out.length < 62; t = addDays(t, 1)) {
    const k = isoDate(t);
    out.push({ day: k, v: map.get(k) || 0 });
  }
  const max = Math.max(1, ...out.map((d) => d.v));
  return out.map((d) => ({
    ...d, h: Math.max(d.v ? 3 : 0, Math.round((d.v / max) * 120)) + 'px', top: d.v === max && d.v > 0,
    dow: dowShort(d.day), date: String(Number(d.day.slice(8))), tip: dowShort(d.day) + ' ' + dayMonth(parseIsoDate(d.day)) + ' · ' + formatRp(d.v),
  }));
});
const dayPeak = computed(() => dayBars.value.reduce((a, d) => (d.v > (a?.v ?? -1) ? d : a), null));
const showDayLabels = computed(() => dayBars.value.length <= 14);

const hourBars = computed(() => {
  if (!data.value) return [];
  const map = new Map(data.value.hours.map((h) => [h.hour, h.transactions]));
  const used = data.value.hours.map((h) => h.hour);
  const lo = Math.min(7, ...used), hi = Math.max(21, ...used);
  const max = Math.max(1, ...map.values());
  const out = [];
  for (let h = lo; h <= hi; h++) {
    const v = map.get(h) || 0;
    out.push({ h, v, height: Math.max(2, Math.round((v / max) * 84)) + 'px', tip: String(h).padStart(2, '0') + ':00 · ' + v + ' transactions' });
  }
  return out;
});
const busiest = computed(() => hourBars.value.reduce((a, b) => (b.v > (a?.v ?? 0) ? b : a), null));
const hourStep = computed(() => Math.max(1, Math.ceil(hourBars.value.length / 6)));

const catBars = computed(() => {
  const cats = data.value?.cats ?? [];
  const max = Math.max(1, ...cats.map((c) => c.sales));
  return cats.map((c) => ({ ...c, w: Math.round((c.sales / max) * 100) + '%' }));
});

const sourceLine = computed(() => {
  if (!data.value) return '';
  const others = data.value.devices.filter((d) => d.id !== device.id);
  const codes = [device.code + ' (this one)', ...others.map((d) => d.code)];
  const list = codes.length > 1 ? codes.slice(0, -1).join(', ') + ' and ' + codes[codes.length - 1] : codes[0];
  const imports = others
    .map((d) => {
      const imp = data.value.imports.find((i) => i.file_device_id === d.id);
      return imp ? `${d.code} last imported ${relativeDays(imp.imported_at)}` : null;
    })
    .filter(Boolean);
  return `Data from ${codes.length > 1 ? 'devices' : 'device'} ${list}` + (imports.length ? ' · ' + imports.join(' · ') : '');
});

const stockLine = computed(() => {
  const s = data.value?.stock;
  if (!s) return '';
  const parts = [];
  if (s.low_count) parts.push(s.low_count + ' low');
  if (s.neg_count) parts.push(s.neg_count + ' negative');
  return parts.length ? parts.join(', ') : 'No low stock';
});
</script>

<template>
  <div class="screen">
    <header class="topbar">
      <div class="topbar-row">
        <h1 class="title">Reports</h1>
        <span class="pill"><Icon name="calendar" :size="18" />{{ rangeLabel }}</span>
      </div>
      <div class="chips" role="group" aria-label="Date range">
        <button v-for="r in [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['custom', 'Custom']]" :key="r[0]" type="button" class="chip" :aria-pressed="range === r[0]" @click="range = r[0]">{{ r[1] }}</button>
      </div>
      <div v-if="range === 'custom'" class="grid-2">
        <label class="field"><span>From</span><input v-model="customFrom" type="date" class="input" /></label>
        <label class="field"><span>To</span><input v-model="customTo" type="date" class="input" /></label>
      </div>
      <div class="muted" style="font-size: 12px">{{ sourceLine }}</div>
    </header>

    <main class="scroll">
      <div v-if="data" class="page num reports">
        <div class="kpis">
          <div class="kpi"><div class="l">Sales</div><div class="v">{{ kpi.sales }}</div><div class="s">discounts {{ kpi.discounts }}</div></div>
          <div class="kpi accent"><div class="l">Gross profit</div><div class="v">{{ kpi.profit }}</div><div class="s">{{ kpi.margin }}</div></div>
          <div class="kpi"><div class="l">COGS</div><div class="v">{{ kpi.cogs }}</div></div>
          <div class="kpi"><div class="l">Transactions</div><div class="v">{{ kpi.tx }}</div><div class="s">{{ kpi.avg }}</div></div>
        </div>

        <section v-if="dayBars.length > 1" class="card section" aria-labelledby="day-h">
          <h2 id="day-h" class="card-h">Sales by day</h2>
          <div role="img" :aria-label="dayPeak && dayPeak.v ? 'Sales by day, highest ' + dayPeak.tip : 'No sales in this range'" class="bars" :style="{ gridTemplateColumns: `repeat(${dayBars.length}, minmax(0, 1fr))`, gap: dayBars.length > 14 ? '2px' : '8px' }">
            <div v-for="d in dayBars" :key="d.day" class="bar-col" :title="d.tip">
              <span class="bar-label" :style="{ visibility: d.top && showDayLabels ? 'visible' : 'hidden' }">{{ compactRp(d.v) }}</span>
              <span class="bar" :style="{ height: d.h, maxWidth: dayBars.length > 14 ? 'none' : '28px' }"></span>
            </div>
          </div>
          <div v-if="showDayLabels" class="ticks" :style="{ gridTemplateColumns: `repeat(${dayBars.length}, minmax(0, 1fr))` }">
            <span v-for="d in dayBars" :key="d.day">{{ d.dow }}<br />{{ d.date }}</span>
          </div>
          <div v-else class="kv muted" style="font-size: 11px"><span>{{ dayMonth(bounds.from) }}</span><span>{{ dayMonth(addDays(bounds.to, -1)) }}</span></div>
        </section>

        <section class="card section" aria-labelledby="hour-h">
          <div class="kv" style="align-items: baseline">
            <h2 id="hour-h" class="card-h">Transactions by hour</h2>
            <span v-if="busiest && busiest.v" class="muted" style="font-size: 12px; font-weight: 700">Busiest {{ String(busiest.h).padStart(2, '0') }}:00</span>
          </div>
          <div role="img" :aria-label="busiest && busiest.v ? 'Transactions by hour, busiest at ' + busiest.h + ':00 with ' + busiest.v : 'No transactions in this range'" class="bars" :style="{ gridTemplateColumns: `repeat(${hourBars.length}, minmax(0, 1fr))`, gap: '2px', height: '90px' }">
            <span v-for="h in hourBars" :key="h.h" class="bar" :title="h.tip" :style="{ height: h.height, maxWidth: 'none', opacity: h.v ? 1 : 0.25 }"></span>
          </div>
          <div class="muted" :style="{ display: 'grid', gridTemplateColumns: `repeat(${hourBars.length}, minmax(0, 1fr))`, gap: '2px', fontSize: '11px' }">
            <span v-for="(h, i) in hourBars" :key="h.h" style="overflow: visible; white-space: nowrap">{{ i % hourStep === 0 ? String(h.h).padStart(2, '0') : '' }}</span>
          </div>
        </section>

        <section class="card section" aria-labelledby="cat-h">
          <h2 id="cat-h" class="card-h">Sales by category</h2>
          <div v-for="c in catBars" :key="c.category_id || 'none'" :title="c.name + ' · ' + formatRp(c.sales)" style="display: flex; flex-direction: column; gap: 4px">
            <div class="kv" style="font-size: 13px"><span style="color: var(--text); font-weight: 600">{{ c.name }}</span><span style="font-weight: 700; color: var(--text)">{{ formatRp(c.sales) }}</span></div>
            <div class="track"><div class="fill" :style="{ width: c.w }"></div></div>
          </div>
          <div v-if="!catBars.length" class="muted" style="font-size: 13px">No sales in this range.</div>
        </section>

        <section class="card section" aria-labelledby="top-h" style="padding: 14px 4px">
          <h2 id="top-h" class="card-h" style="padding: 0 10px">Products</h2>
          <div style="overflow-x: auto">
            <table class="data">
              <thead><tr><th scope="col">Product</th><th scope="col" class="r">Qty</th><th scope="col" class="r">Sales</th><th scope="col" class="r">Profit</th></tr></thead>
              <tbody>
                <tr v-for="t in data.top" :key="t.product_id">
                  <td>{{ t.name }}</td>
                  <td class="r">{{ formatQty(t.qty_milli) }}{{ t.unit && t.unit !== 'pcs' && t.qty_milli % 1000 ? ' ' + t.unit : '' }}</td>
                  <td class="r">{{ groupThousands(t.sales) }}</td>
                  <td class="r" :class="{ 'danger-text': t.profit < 0 }">{{ groupThousands(t.profit) }}</td>
                </tr>
                <tr v-if="!data.top.length"><td colspan="4" class="muted">No sales in this range.</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="card section" aria-labelledby="eod-h">
          <div class="kv" style="align-items: baseline">
            <h2 id="eod-h" class="card-h">End of day · today</h2>
            <span class="muted" style="font-size: 12px; font-weight: 700">{{ shortDate(Date.now()) }}</span>
          </div>
          <div class="kv"><span>Transactions</span><span>{{ data.eod.transactions }}</span></div>
          <div class="kv"><span>Cancelled sales</span><span>{{ data.eod.cancelled_sales }}</span></div>
          <div class="kv"><span>Total sales</span><span>{{ formatRp(data.eod.total_sales) }}</span></div>
          <div class="kv"><span>Total discounts</span><span>{{ formatRp(data.eod.total_discounts) }}</span></div>
          <div class="divider"></div>
          <div class="kv" style="font-size: 16px; font-weight: 800"><span style="color: var(--text)">Expected cash in drawer</span><span>{{ formatRp(data.eod.expected_cash) }}</span></div>
        </section>

        <section class="card section" aria-labelledby="stk-h">
          <h2 id="stk-h" class="card-h">Stock</h2>
          <div class="grid-2">
            <div class="mini"><div class="l">Stock value</div><div class="v">{{ formatRp(data.stock.stock_value) }}</div></div>
            <div class="mini"><div class="l">Units on hand</div><div class="v">{{ formatQty(data.stock.units_milli) }}</div></div>
          </div>
          <div v-if="data.low.length" class="list" style="background: var(--bg)">
            <RouterLink v-for="p in data.low.slice(0, 8)" :key="p.id" :to="'/stock/move/' + p.id" class="list-row" style="min-height: 48px">
              <span class="main"><span class="t" style="font-weight: 600">{{ p.name }}</span><span class="s"> · min {{ formatQty(p.min_stock_milli) }}</span></span>
              <span class="badge" :class="p.on_hand_milli < 0 ? 'danger' : 'warn'">{{ formatQty(p.on_hand_milli) }}{{ p.decimal_qty ? ' ' + p.unit : '' }}</span>
            </RouterLink>
          </div>
          <RouterLink to="/stock" class="stock-link" :class="{ ok: !data.low.length }">
            <Icon name="warn" :size="18" />
            <span class="spacer">{{ stockLine }}</span>
            <span style="font-weight: 800">View list</span>
          </RouterLink>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.reports { max-width: 900px; }
.kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
@media (min-width: 700px) { .kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.kpi { padding: 12px; border-radius: 14px; background: var(--surface); border: 1px solid var(--border); }
.kpi .l { font-size: 12px; font-weight: 600; color: var(--muted); }
.kpi .v { font-size: 18px; font-weight: 800; margin-top: 2px; }
.kpi .s { font-size: 12px; color: var(--muted); }
.kpi.accent { background: var(--accent-soft); color: var(--accent-text); border-color: transparent; }
.kpi.accent .l, .kpi.accent .s { color: inherit; }
.card-h { margin: 0; font-size: 15px; font-weight: 800; }
.bars { display: grid; align-items: end; height: 150px; border-bottom: 1px solid var(--border); }
.bar-col { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 4px; height: 100%; }
.bar-label { font-size: 10px; font-weight: 700; color: var(--muted); white-space: nowrap; }
.bar { display: block; width: 100%; border-radius: 4px 4px 0 0; background: var(--accent); }
.ticks { display: grid; gap: 8px; text-align: center; font-size: 11px; color: var(--muted); line-height: 1.3; }
.track { height: 10px; border-radius: 4px; background: var(--surface-2); }
.fill { height: 100%; border-radius: 4px; background: var(--accent); }
.mini { padding: 10px 12px; border-radius: 12px; background: var(--surface-2); }
.mini .l { font-size: 12px; color: var(--muted); }
.mini .v { font-size: 16px; font-weight: 800; }
.stock-link { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 0 14px; border-radius: 12px; background: var(--warn-soft); color: var(--warn); text-decoration: none; font-size: 14px; font-weight: 600; }
.stock-link.ok { background: var(--surface-2); color: var(--text); }
</style>
