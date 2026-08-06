self.addEventListener('install', event => {
    event.waitUntil(
        caches.open('v1').then(cache => {
            return cache.addAll([
                '/pwa',
                '/manifest.json',
                '/webapp/categories.js',
                '/fonts/Roboto-Regular.woff2',
                '/fonts/Roboto-Bold.woff2',
                '/picture/LOGO.jpg',
                '/webapp/index.html',
                '/webapp/max.html'
            ]);
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