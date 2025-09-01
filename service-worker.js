const APP_VERSION = "1.5.0";
const CACHE_NAME = `EternalFlow-v${APP_VERSION}`;
const PRECACHE_URLS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json',
    './icon-32.png',
    './icon-192.png',
    './icon-512.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    
    // Не кэшируем запросы к IndexedDB
    if (event.request.url.includes('/EternalFlowDB')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                // Возвращаем кэшированный response если найдено
                if (cachedResponse) {
                    return cachedResponse;
                }

                // Иначе делаем запрос к сети
                return fetch(event.request).then(response => {
                    // Проверяем валидный ли response
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => cache.put(event.request, responseToCache));

                    return response;
                });
            }).catch(() => {
                // Fallback для SPA - возвращаем index.html для всех navigation запросов
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            })
    );
});

self.addEventListener('message', event => {
    if (event.data?.action === 'skipWaiting') {
        self.skipWaiting();
    }
});