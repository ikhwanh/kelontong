<script setup>
import { ref, computed } from 'vue';
import Icon from './Icon.vue';
import { buildReceiptText, normalizePhone, whatsappLink } from '../lib/receipt.js';
import { settings } from '../services/settings.js';

const props = defineProps({ sale: Object });
const phone = ref('');
const text = computed(() => buildReceiptText(props.sale, props.sale.lines, settings));
const normalized = computed(() => normalizePhone(phone.value));
const link = computed(() => (normalized.value ? whatsappLink(normalized.value, text.value) : null));
const noHeader = computed(() => !settings.shop_name && !settings.receipt_header && !settings.receipt_footer);
</script>

<template>
  <section aria-labelledby="wa-title" class="card" style="display: flex; flex-direction: column; gap: 12px; border-radius: 16px">
    <h2 id="wa-title" style="margin: 0; font-size: 16px; font-weight: 800">Send receipt on WhatsApp</h2>
    <label class="field">
      <span>Customer phone number</span>
      <span class="phone">
        <span class="cc">+62</span>
        <input v-model="phone" type="tel" inputmode="tel" placeholder="8xx xxxx xxxx" autocomplete="off" />
      </span>
    </label>
    <details style="border-radius: 12px; background: var(--surface-2)">
      <summary class="summary">Message preview</summary>
      <pre class="preview">{{ text }}</pre>
    </details>
    <a v-if="link" :href="link" target="_blank" rel="noopener" class="btn btn-primary"><Icon name="whatsapp" :size="22" />Open in WhatsApp</a>
    <button v-else type="button" class="btn btn-primary" disabled><Icon name="whatsapp" :size="22" />Enter a phone number</button>
    <p class="hint">WhatsApp opens with the receipt filled in. Press send there to deliver it. The number isn’t saved.</p>
    <p v-if="noHeader" class="hint">Add a shop name, header and footer under <RouterLink to="/sync">Sync &amp; settings</RouterLink>.</p>
  </section>
</template>

<style scoped>
.phone { display: flex; align-items: center; height: 52px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface-2); overflow: hidden; }
.phone .cc { display: flex; align-items: center; height: 100%; padding: 0 12px; border-right: 1px solid var(--border); font-size: 15px; font-weight: 700; color: var(--muted); }
.phone input { flex: 1; min-width: 0; height: 100%; padding: 0 12px; border: 0; outline: none; background: transparent; font-size: 16px; font-weight: 600; }
.summary { min-height: 44px; display: flex; align-items: center; padding: 0 12px; font-size: 13px; font-weight: 700; color: var(--muted); cursor: pointer; }
.preview { margin: 0 12px 12px; padding: 12px; border-radius: 10px; background: var(--surface); border: 1px solid var(--border); font-family: var(--mono); font-size: 12px; line-height: 1.5; white-space: pre-wrap; overflow-x: auto; }
</style>
