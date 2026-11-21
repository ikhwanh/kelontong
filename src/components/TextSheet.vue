<script setup>
import { ref } from 'vue';
import Sheet from './Sheet.vue';

const props = defineProps({
  title: String, subtitle: String, label: String, placeholder: String,
  initial: { type: String, default: '' }, confirmLabel: { type: String, default: 'Save' },
  inputmode: { type: String, default: 'text' }, maxlength: { type: Number, default: 120 },
});
const emit = defineEmits(['save', 'close']);
const value = ref(props.initial);
</script>

<template>
  <Sheet :title="title" :subtitle="subtitle" @close="emit('close')">
    <label class="field">
      <span>{{ label }}</span>
      <input v-model="value" class="input" :placeholder="placeholder" :inputmode="inputmode" :maxlength="maxlength" autofocus @keydown.enter="emit('save', value)" />
    </label>
    <slot />
    <button type="button" class="btn btn-primary btn-block" @click="emit('save', value)">{{ confirmLabel }}</button>
  </Sheet>
</template>
