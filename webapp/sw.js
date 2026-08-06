const CACHE_VERSION = 'v2';  // Увеличивайте при каждом изменении кешируемых файлов

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_VERSION).then(cache => {
            return cache.addAll([
                '/pwa',
                '/manifest.json',
                '/webapp/categories.js',
                '/picture/LOGO.jpg',
                '/webapp/index.html',
                '/webapp/max.html',
                '/webapp/pwa.html',
                '/icons/apple-icon-180x180.png',
                '/icons/icon-192.png',
                '/icons/icon-512.png'
            ]);
        })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))
            );
        })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});