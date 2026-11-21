import { createRouter, createWebHistory } from 'vue-router';
import Checkout from './views/Checkout.vue';

const nav = { nav: true };

export const router = createRouter({
  history: createWebHistory(),
  routes: [
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
