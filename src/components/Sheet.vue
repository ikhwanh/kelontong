<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import Icon from './Icon.vue';

const props = defineProps({ title: String, subtitle: String, role: { type: String, default: 'dialog' }, closable: { type: Boolean, default: true } });
const emit = defineEmits(['close']);
const el = ref(null);
const titleId = 'sheet-' + Math.random().toString(36).slice(2);
let previousFocus = null;

function onKey(e) {
  if (e.key === 'Escape' && props.closable) emit('close');
}

onMounted(() => {
  previousFocus = document.activeElement;
  window.addEventListener('keydown', onKey);
  const first = el.value?.querySelector('[autofocus], input, textarea');
  (first || el.value)?.focus?.({ preventScroll: true });
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  previousFocus?.focus?.({ preventScroll: true });
});
</script>

<template>
  <Teleport to="body">
    <div class="sheet-wrap" @click.self="closable && emit('close')">
      <section ref="el" class="sheet" :role="role" aria-modal="true" :aria-labelledby="titleId" tabindex="-1">
        <span class="grabber" aria-hidden="true"></span>
        <div class="sheet-head">
          <div class="spacer">
            <h2 :id="titleId">{{ title }}</h2>
            <div v-if="subtitle" class="sub num">{{ subtitle }}</div>
          </div>
          <button v-if="closable" type="button" class="icon-btn filled" aria-label="Close" @click="emit('close')"><Icon name="close" /></button>
        </div>
        <slot />
      </section>
    </div>
  </Teleport>
</template>
