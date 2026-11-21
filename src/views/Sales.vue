<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import { listSales } from '../services/sales.js';
import { listParked, resumeCart, deleteParked } from '../services/cart.js';
import { device } from '../services/device.js';
import { dataVersion } from '../db/index.js';
import { formatRp } from '../lib/money.js';
import { hhmm, startOfLocalDay, addDays, isoDate, parseIsoDate, shortDate } from '../lib/time.js';
import { toast } from '../services/ui.js';

const router = useRouter();
const day = ref(isoDate(Date.now()));
const sales = ref([]);
const parked = ref([]);
const isToday = computed(() => day.value === isoDate(Date.now()));

async function load() {
  const from = parseIsoDate(day.value);
  const [s, p] = await Promise.all([listSales({ from, to: addDays(from, 1) }), listParked()]);
  sales.value = s;
  parked.value = p;
}
watch([day, dataVersion], load);
onMounted(load);

const completed = computed(() => sales.value.filter((s) => s.status === 'completed'));
const total = computed(() => completed.value.reduce((a, s) => a + s.total, 0));

async function resume(id) {
  const parkedCurrent = await resumeCart(id);
  if (parkedCurrent) toast('The sale you had open was parked.');
  router.push('/cart');
}

async function discard(c) {
  await deleteParked(c.id);
  toast('Parked sale discarded.');
}

function shiftDay(n) {
  day.value = isoDate(addDays(parseIsoDate(day.value), n));
}
</script>

<template>
  <div class="screen">
    <header class="topbar">
      <div class="topbar-row">
        <h1 class="title">Sales</h1>
        <button type="button" class="icon-btn" aria-label="Previous day" @click="shiftDay(-1)"><Icon name="back" /></button>
        <label class="pill" style="position: relative">
          <Icon name="calendar" :size="18" />
          {{ isToday ? 'Today' : shortDate(parseIsoDate(day)) }}
          <input v-model="day" type="date" class="date-overlay" aria-label="Choose day" :max="isoDate(Date.now())" />
        </label>
        <button type="button" class="icon-btn" aria-label="Next day" :disabled="isToday" @click="shiftDay(1)"><Icon name="chevron" /></button>
      </div>
    </header>

    <main class="scroll">
      <div class="page num">
        <section v-if="parked.length" class="section" aria-labelledby="parked-h">
          <h2 id="parked-h" class="section-h">Parked · {{ parked.length }}</h2>
          <div v-for="c in parked" :key="c.id" class="parked">
            <span class="parked-icon"><Icon name="park" /></span>
            <div class="spacer" style="min-width: 0">
              <div style="font-size: 15px; font-weight: 700">{{ formatRp(c.total) }}</div>
              <div class="ellipsis muted" style="font-size: 12px">
                Parked {{ hhmm(c.parked_at) }} · {{ c.itemCount }} {{ c.itemCount === 1 ? 'item' : 'items' }}<template v-if="c.note"> · “{{ c.note }}”</template>
              </div>
            </div>
            <button type="button" class="icon-btn danger-text" :aria-label="'Discard parked sale of ' + formatRp(c.total)" @click="discard(c)"><Icon name="trash" :stroke="1.8" /></button>
            <button type="button" class="resume" @click="resume(c.id)">Resume</button>
          </div>
        </section>

        <section class="section" aria-labelledby="day-h">
          <div class="kv" style="align-items: baseline">
            <h2 id="day-h" class="section-h">{{ isToday ? 'Today' : shortDate(parseIsoDate(day)) }} · {{ completed.length }} {{ completed.length === 1 ? 'sale' : 'sales' }}</h2>
            <span style="font-size: 13px; font-weight: 700; color: var(--text)">{{ formatRp(total) }}</span>
          </div>
          <div v-if="sales.length" class="list">
            <RouterLink v-for="s in sales" :key="s.id" :to="'/sales/' + s.id" class="list-row">
              <div class="main">
                <div class="t" style="display: flex; align-items: center; gap: 6px">
                  {{ s.receipt_no }}
                  <span v-if="s.device_id !== device.id" class="badge outline" title="Synced from another device">from {{ s.device_code }}</span>
                </div>
                <div class="s">{{ hhmm(s.sold_at) }} · {{ s.line_count }} {{ s.line_count === 1 ? 'line' : 'lines' }}</div>
              </div>
              <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 2px">
                <span :style="{ fontSize: '15px', fontWeight: 800, textDecoration: s.status === 'cancelled' ? 'line-through' : 'none', color: s.status === 'cancelled' ? 'var(--muted)' : 'var(--text)' }">{{ formatRp(s.total) }}</span>
                <span v-if="s.status === 'cancelled'" class="badge danger">Cancelled</span>
              </div>
              <Icon name="chevron" :size="18" style="color: var(--muted)" />
            </RouterLink>
          </div>
          <div v-else class="empty">No sales on this day.</div>
          <p class="hint">Cancelled sales stay in the list and are left out of totals and profit.</p>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.parked { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 14px; background: var(--surface); border: 1px dashed var(--border); }
.parked-icon { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 10px; background: var(--warn-soft); color: var(--warn); flex: none; }
.resume { display: flex; align-items: center; min-height: 44px; padding: 0 14px; border-radius: 10px; border: 0; background: var(--text); color: var(--bg); font-size: 14px; font-weight: 700; }
.ellipsis { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.date-overlay { position: absolute; inset: 0; opacity: 0; width: 100%; cursor: pointer; }
</style>
