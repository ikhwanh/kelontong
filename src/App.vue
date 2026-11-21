<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import Icon from './components/Icon.vue';
import { pwa, applyUpdate, mustInstall } from './services/pwa.js';
import { initDb, dataVersion, one } from './db/index.js';
import { ensureDevice, device } from './services/device.js';
import { loadSettings, loadPrefs, prefs, requestPersistence } from './services/settings.js';
import { rebuildSummary } from './services/stock.js';
import { loadActiveCart, activeCartHasItems } from './services/cart.js';
import { toasts, toast, dismissToast } from './services/ui.js';

const route = useRoute();
const phase = ref('idle');
const bootError = ref('');
const exportDue = ref(false);

const installPage = computed(() => route.name === 'install');
const showNav = computed(() => !!route.meta.nav);
const fullscreen = computed(() => !!route.meta.fullscreen);

const tabs = [
  { to: '/', label: 'Checkout', icon: 'checkout' },
  { to: '/sales', label: 'Sales', icon: 'sales' },
  { to: '/stock', label: 'Stock', icon: 'stock' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
  { to: '/sync', label: 'Sync', icon: 'sync' },
];

function isActive(tab) {
  if (tab.to === '/') return route.path === '/' || route.path === '/cart';
  return route.path.startsWith(tab.to);
}

async function boot() {
  if (phase.value !== 'idle') return;
  phase.value = 'loading';
  try {
    await initDb('pos.db');
    await ensureDevice();
    await Promise.all([loadSettings(), loadPrefs()]);
    await rebuildSummary();
    await loadActiveCart();
    phase.value = 'ready';
    requestPersistence().catch(() => {});
    refreshExportDue();
  } catch (e) {
    console.error(e);
    bootError.value = e?.message || String(e);
    phase.value = 'error';
  }
}

async function refreshExportDue() {
  if (phase.value !== 'ready') return;
  const anySale = await one('SELECT 1 AS x FROM sales LIMIT 1');
  exportDue.value = !!anySale && (!prefs.lastExportAt || Date.now() - prefs.lastExportAt > 24 * 3600 * 1000);
}

watch(dataVersion, refreshExportDue);
watch(() => prefs.lastExportAt, refreshExportDue);
// The database only opens in the installed app, so a browser tab never collects data
// that the installed app (with its own storage on iOS) wouldn't see.
watch(mustInstall, (must) => !must && boot(), { immediate: true });

const reload = () => window.location.reload();

async function onUpdateTap() {
  if (await activeCartHasItems()) {
    toast('Finish or park the current sale first, then tap reload.');
    return;
  }
  applyUpdate();
}

onMounted(() => {
  document.documentElement.dataset.platform = pwa.platform;
});
</script>

<template>
  <RouterView v-if="installPage || mustInstall" />

  <div v-else-if="phase === 'error'" class="shell">
    <div class="page" style="justify-content: center; flex: 1">
      <div class="notice danger"><Icon name="warn" /><span><strong>The database couldn’t open.</strong> {{ bootError }}</span></div>
      <button class="btn btn-primary" type="button" @click="reload">Try again</button>
    </div>
  </div>

  <div v-else-if="phase !== 'ready'" class="shell" aria-busy="true">
    <div class="empty" style="margin: auto">Opening database…</div>
  </div>

  <div v-else class="shell">
    <div class="shell-body">
      <nav v-if="!fullscreen" class="rail" aria-label="Main">
        <span class="device-pill" title="Device code">{{ device.code }}</span>
        <RouterLink v-for="t in tabs" :key="t.to" :to="t.to" :class="{ active: isActive(t) }" :aria-current="isActive(t) ? 'page' : undefined">
          <Icon :name="t.icon" :size="24" :stroke="isActive(t) ? 2 : 1.8" />
          {{ t.label }}
          <span v-if="t.to === '/sync' && (exportDue || device.codeCollision)" class="nav-dot" aria-label="Needs attention"></span>
        </RouterLink>
      </nav>
      <div class="shell-main">
        <div v-if="showNav && (pwa.needRefresh || device.codeCollision)" style="padding: 10px 16px 0; display: flex; flex-direction: column; gap: 8px; background: var(--surface)">
          <div v-if="pwa.needRefresh" role="status" class="notice accent">
            <Icon name="refresh" />
            <span class="spacer" style="font-weight: 700">Update available</span>
            <button type="button" class="btn btn-primary" @click="onUpdateTap">Tap to reload</button>
          </div>
          <div v-if="device.codeCollision" role="alert" class="notice warn">
            <Icon name="warn" />
            <span class="spacer">Another device also uses code <strong>{{ device.code }}</strong>. Change this device’s code so receipt numbers stay distinct.</span>
            <RouterLink to="/sync" class="btn">Change</RouterLink>
          </div>
        </div>
        <RouterView v-slot="{ Component }">
          <component :is="Component" :key="route.name === 'product' || route.name === 'sale' || route.name === 'move' ? route.fullPath : route.name" />
        </RouterView>
        <nav v-if="showNav" class="bottom-nav" aria-label="Main">
          <RouterLink v-for="t in tabs" :key="t.to" :to="t.to" :class="{ active: isActive(t) }" :aria-current="isActive(t) ? 'page' : undefined">
            <Icon :name="t.icon" :size="24" :stroke="isActive(t) ? 2 : 1.8" />
            {{ t.label }}
            <span v-if="t.to === '/sync' && (exportDue || device.codeCollision)" class="nav-dot" aria-label="Needs attention"></span>
          </RouterLink>
        </nav>
      </div>
    </div>
  </div>

  <div class="toasts" aria-live="polite">
    <div v-for="t in toasts" :key="t.id" class="toast" :class="t.type">
      <span>{{ t.message }}</span>
      <button v-if="t.action" type="button" @click="t.action.run(); dismissToast(t.id)">{{ t.action.label }}</button>
    </div>
  </div>
</template>
