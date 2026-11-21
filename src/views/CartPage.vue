<script setup>
import { watch } from 'vue';
import { useRouter } from 'vue-router';
import CartPanel from '../components/CartPanel.vue';
import { isWide } from '../lib/media.js';

const router = useRouter();
// On a tablet the cart is always beside the products, so this page isn't needed.
watch(isWide, (w) => w && router.replace('/'), { immediate: true });
</script>

<template>
  <div class="screen"><CartPanel variant="page" /></div>
</template>
