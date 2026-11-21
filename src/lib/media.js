import { ref } from 'vue';

const query = window.matchMedia('(min-width: 900px)');
export const isWide = ref(query.matches);
query.addEventListener('change', (e) => (isWide.value = e.matches));
