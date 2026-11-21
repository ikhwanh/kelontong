import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';

const SHARE_CACHE = 'pos-share-target';

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// Android Web Share Target: WhatsApp → share → POS. The file is parked in a cache and
// the app picks it up on the Sync screen.
registerRoute(
  ({ url }) => url.pathname === '/share-target',
  async ({ request }) => {
    const form = await request.formData();
    const file = form.get('file');
    if (file && typeof file !== 'string') {
      const cache = await caches.open(SHARE_CACHE);
      await cache.put('/shared-file', new Response(file, { headers: { 'X-File-Name': encodeURIComponent(file.name || 'sync.txt') } }));
    }
    return Response.redirect('/sync?shared=1', 303);
  },
  'POST',
);
