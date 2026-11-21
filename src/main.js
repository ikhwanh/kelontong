import '@fontsource/plus-jakarta-sans/latin-400.css';
import '@fontsource/plus-jakarta-sans/latin-500.css';
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import './styles.css';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router.js';
import { initPwa } from './services/pwa.js';

initPwa();
createApp(App).use(router).mount('#app');
