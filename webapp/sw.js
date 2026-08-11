const CACHE_VERSION = 'v11'; // Автоматически обновляется скриптом rest

// Список файлов для кеширования (статичные ресурсы)
const STATIC_FILES = [
    '/pwa',
    '/manifest.json',
    '/webapp/categories.js',
    '/webapp/max-web-app.js',
    '/picture/LOGO.jpg',
    '/picture/1.png',
    '/picture/02.jpg',
    '/picture/03.jpg',
    '/picture/04.jpg',
    '/picture/05.jpg',
    '/webapp/index.html',
    '/webapp/max.html',
    '/webapp/pwa.html',
    '/webapp/landing.html',
    '/webapp/support.html',
    '/webapp/privacy.html',
    '/webapp/offer.html',
    '/webapp/consent.html',
    '/webapp/error/400.html',
    '/webapp/error/403.html',
    '/webapp/error/404.html',
    '/webapp/error/405.html',
    '/webapp/error/500.html',
    '/webapp/error/502.html',
    '/webapp/error/503.html',
    '/webapp/error/504.html',
    '/icons/favicon.ico',
    '/icons/apple-icon-180x180.png',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/apple-icon-152x152.png',
    '/icons/apple-icon-144x144.png',
    '/icons/apple-icon-120x120.png',
    '/icons/apple-icon-114x114.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_VERSION).then(cache => {
            return cache.addAll(STATIC_FILES);
        })
    );
    // Немедленно активируем новый SW
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))
            );
        }).then(() => {
            // Берём контроль над всеми вкладками
            return clients.claim();
        })
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);

    // 1. API-запросы – сначала сеть, при ошибке – кеш
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    // Кешируем успешный ответ для будущих офлайн-запросов
                    const clone = response.clone();
                    caches.open(CACHE_VERSION).then(cache => {
                        cache.put(request, clone);
                    });
                    return response;
                })
                .catch(() => {
                    return caches.match(request);
                })
        );
        return;
    }

    // 2. HTML-страницы (навигация) – сначала сеть, при ошибке – кеш
    if (request.mode === 'navigate' || request.destination === 'document') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_VERSION).then(cache => {
                        cache.put(request, clone);
                    });
                    return response;
                })
                .catch(() => {
                    return caches.match(request);
                })
        );
        return;
    }

    // 3. Статика – кеш, потом сеть (быстро)
    event.respondWith(
        caches.match(request).then(response => {
            return response || fetch(request);
        })
    );
});