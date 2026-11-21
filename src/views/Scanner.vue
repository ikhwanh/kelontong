<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '../components/Icon.vue';
import TextSheet from '../components/TextSheet.vue';
import QuantitySheet from '../components/QuantitySheet.vue';
import { findByCode } from '../services/products.js';
import { addToCart, setLineQty, findLine, cartCalc, cartQtyByProduct } from '../services/cart.js';
import { formatQty } from '../lib/qty.js';
import { isWide } from '../lib/media.js';
import { beep } from '../services/ui.js';
import { setCapturedCode } from '../services/scanBus.js';

const route = useRoute();
const router = useRouter();
const capture = route.query.mode === 'capture';

const video = ref(null);
const cameraError = ref('');
const torch = ref(false);
const torchSupported = ref(false);
const keepScanning = ref(true);
const last = ref(null); // { product, key, qty, code }
const notFound = ref(null);
const typing = ref(false);
const qtyFor = ref(null);
let camera = null;
let lastCode = '';
let lastAt = 0;

const paused = computed(() => typing.value || !!qtyFor.value);
const itemCount = computed(() => cartCalc.value.itemCount);

async function onCode(code) {
  const now = Date.now();
  if (paused.value || (code === lastCode && now - lastAt < 1500)) return;
  lastCode = code;
  lastAt = now;
  if (capture) {
    beep(true);
    setCapturedCode(code);
    router.back();
    return;
  }
  const product = await findByCode(code);
  if (!product) {
    beep(false);
    notFound.value = code;
    return;
  }
  beep(true);
  notFound.value = null;
  if (product.decimal_qty) {
    qtyFor.value = { product, code };
    return;
  }
  const key = await addToCart(product, 1000);
  last.value = { product, key, qty: 1000, code };
  if (!keepScanning.value) done();
}

async function onQtySet(milli) {
  const { product, code } = qtyFor.value;
  const key = await addToCart(product, milli);
  last.value = { product, key, qty: milli, code };
  qtyFor.value = null;
  if (!keepScanning.value) done();
}

async function undo() {
  const l = last.value;
  const line = l && findLine(l.key);
  if (line) await setLineQty(l.key, line.qty_milli - l.qty);
  last.value = null;
}

function onTyped(code) {
  typing.value = false;
  if (code.trim()) {
    lastCode = '';
    onCode(code.trim());
  }
}

function done() {
  router.replace(isWide.value ? '/' : '/cart');
}

function close() {
  if (capture) router.back();
  else router.replace('/');
}

async function toggleTorch() {
  torch.value = !torch.value;
  await camera?.setTorch(torch.value).catch(() => (torch.value = false));
}

onMounted(async () => {
  try {
    const { startCamera } = await import('../lib/camera.js');
    camera = await startCamera(video.value, onCode);
    torchSupported.value = camera.torchSupported;
  } catch (e) {
    cameraError.value = e?.name === 'NotAllowedError'
      ? 'Camera permission was refused. Allow the camera for this app in the browser or system settings.'
      : e?.name === 'NotFoundError' ? 'No camera found on this device.' : 'The camera couldn’t start: ' + (e?.message || e);
  }
});
onBeforeUnmount(() => camera?.stop());

const lastInCart = computed(() => (last.value ? cartQtyByProduct.value[last.value.product.id] || 0 : 0));
</script>

<template>
  <div class="scanner">
    <video ref="video" class="video" playsinline muted></video>
    <div class="overlay">
      <div class="top">
        <button type="button" class="round" aria-label="Close scanner" @click="close"><Icon name="close" :size="22" /></button>
        <h1>{{ capture ? 'Scan product barcode' : 'Scan barcode' }}</h1>
        <button type="button" class="round" :class="{ on: torch }" aria-label="Flashlight" :aria-pressed="torch" :disabled="!torchSupported" @click="toggleTorch"><Icon name="flash" :size="22" /></button>
      </div>
      <div class="middle">
        <div class="frame">
          <span class="c tl"></span><span class="c tr"></span><span class="c bl"></span><span class="c br"></span>
          <span class="laser"></span>
        </div>
        <p v-if="cameraError" class="msg error">{{ cameraError }}</p>
        <p v-else class="msg">Hold the barcode inside the frame. {{ capture ? 'The code is filled in for you.' : 'Each scan adds one item and beeps.' }}</p>
      </div>
    </div>

    <section aria-label="Scanned items" class="panel">
      <span class="grabber" aria-hidden="true"></span>
      <div v-if="last" class="hit">
        <span class="ok"><Icon name="check" :stroke="2.4" /></span>
        <div class="spacer" style="min-width: 0">
          <div style="font-size: 15px; font-weight: 700">{{ last.product.name }}</div>
          <div class="muted num" style="font-size: 12px">{{ last.code }} · now {{ formatQty(lastInCart) }}{{ last.product.decimal_qty ? ' ' + last.product.unit : '' }} in cart</div>
        </div>
        <button type="button" class="btn btn-sm" @click="undo">Undo</button>
      </div>
      <div v-if="notFound" class="notice danger" role="alert">
        <Icon name="warn" :size="22" />
        <div class="spacer"><strong>{{ notFound }} not found.</strong> Add it as a new product or attach it to an existing one.</div>
        <RouterLink :to="{ path: '/products/new', query: { barcode: notFound } }" class="btn btn-sm">Add</RouterLink>
      </div>
      <label v-if="!capture" class="check-row">
        Keep scanning after each item
        <input v-model="keepScanning" type="checkbox" />
      </label>
      <div style="display: flex; gap: 10px">
        <button type="button" class="btn grow" @click="typing = true"><Icon name="keyboard" :stroke="1.8" />Type code</button>
        <button v-if="!capture" type="button" class="btn btn-primary num" style="flex: 1.4" @click="done">Done · {{ itemCount }} {{ itemCount === 1 ? 'item' : 'items' }}</button>
      </div>
    </section>

    <TextSheet v-if="typing" title="Type code" label="Barcode or SKU" placeholder="e.g. 8991002101234" inputmode="text" confirm-label="Add" @save="onTyped" @close="typing = false" />
    <QuantitySheet v-if="qtyFor" :product="qtyFor.product" @set="onQtySet" @close="qtyFor = null" />
  </div>
</template>

<style scoped>
.scanner { position: fixed; inset: 0; z-index: 30; display: flex; flex-direction: column; background: #0A0C0B; color: #FFFFFF; }
.video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.overlay { position: relative; flex: 1; min-height: 0; display: flex; flex-direction: column; background: linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,0) 30%); }
.top { display: flex; align-items: center; gap: 8px; padding: 12px; padding-top: max(12px, env(safe-area-inset-top)); }
.top h1 { margin: 0; flex: 1; text-align: center; font-size: 17px; font-weight: 700; }
.round { display: flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 999px; border: 0; background: rgba(255,255,255,.14); color: #FFFFFF; }
.round.on { background: #FFFFFF; color: #0A0C0B; }
.round:disabled { opacity: .4; }
.middle { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; padding: 0 16px; }
.frame { position: relative; width: min(290px, 80vw); height: 180px; border-radius: 18px; box-shadow: 0 0 0 100vmax rgba(0,0,0,.35); }
.c { position: absolute; width: 36px; height: 36px; border: 0 solid #FFFFFF; }
.tl { left: 0; top: 0; border-left-width: 4px; border-top-width: 4px; border-top-left-radius: 18px; }
.tr { right: 0; top: 0; border-right-width: 4px; border-top-width: 4px; border-top-right-radius: 18px; }
.bl { left: 0; bottom: 0; border-left-width: 4px; border-bottom-width: 4px; border-bottom-left-radius: 18px; }
.br { right: 0; bottom: 0; border-right-width: 4px; border-bottom-width: 4px; border-bottom-right-radius: 18px; }
.laser { position: absolute; left: 20px; right: 20px; top: 88px; height: 2px; border-radius: 2px; background: #3CCFB8; }
.msg { position: relative; margin: 0; font-size: 14px; color: rgba(255,255,255,.85); text-align: center; max-width: 280px; line-height: 1.5; }
.msg.error { color: #FFB4A8; font-weight: 600; }
.panel { position: relative; display: flex; flex-direction: column; gap: 12px; padding: 14px 16px; padding-bottom: max(16px, env(safe-area-inset-bottom)); background: var(--surface); color: var(--text); border-top-left-radius: 22px; border-top-right-radius: 22px; width: 100%; max-width: 560px; margin: 0 auto; }
.grabber { align-self: center; width: 40px; height: 4px; border-radius: 4px; background: var(--border); }
.hit { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 14px; background: var(--accent-soft); }
.ok { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%; background: var(--accent); color: var(--on-accent); flex: none; }
</style>
