import { watch } from 'vue';
import { createRouter, createWebHistory } from 'vue-router';
import Checkout from './views/Checkout.vue';
import Install from './views/Install.vue';
import { mustInstall } from './services/pwa.js';

const nav = { nav: true };

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/install', name: 'install', component: Install, meta: { standalonePage: true } },
    { path: '/', name: 'checkout', component: Checkout, meta: { ...nav, wideCart: true } },
    { path: '/cart', name: 'cart', component: () => import('./views/CartPage.vue') },
    { path: '/scan', name: 'scan', component: () => import('./views/Scanner.vue'), meta: { fullscreen: true } },
    { path: '/pay', name: 'pay', component: () => import('./views/Payment.vue') },
    { path: '/done/:id', name: 'done', component: () => import('./views/SaleComplete.vue') },
    { path: '/sales', name: 'sales', component: () => import('./views/Sales.vue'), meta: nav },
    { path: '/sales/:id', name: 'sale', component: () => import('./views/SaleDetail.vue') },
    { path: '/stock', name: 'stock', component: () => import('./views/Stock.vue'), meta: nav },
    { path: '/stock/move/:id?', name: 'move', component: () => import('./views/StockMove.vue') },
    { path: '/products/new', name: 'product-new', component: () => import('./views/ProductForm.vue') },
    { path: '/products/:id', name: 'product', component: () => import('./views/ProductForm.vue') },
    { path: '/import', name: 'import', component: () => import('./views/Import.vue') },
    { path: '/reports', name: 'reports', component: () => import('./views/Reports.vue'), meta: nav },
    { path: '/sync', name: 'sync', component: () => import('./views/Sync.vue'), meta: nav },
    { path: '/:rest(.*)*', redirect: '/' },
  ],
});

function afterInstall(route) {
  const next = typeof route.query.next === 'string' && route.query.next.startsWith('/') ? route.query.next : '/';
  return next.startsWith('/install') ? '/' : next;
}

router.beforeEach((to) => {
  if (mustInstall.value && to.name !== 'install') return { name: 'install', query: to.fullPath === '/' ? {} : { next: to.fullPath } };
  if (!mustInstall.value && to.name === 'install') return afterInstall(to);
});

// Leaves the install page as soon as the app runs installed (or the dev bypass is used).
watch(mustInstall, (must) => {
  const current = router.currentRoute.value;
  if (!must && current.name === 'install') router.replace(afterInstall(current));
});
