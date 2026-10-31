// ==========================================================================
// FILE: services-worker.js (BAGANTARA SUPER-APP MASTER SERVICE WORKER V14.0)
// FUNGSI:
//   1. SATU-SATUNYA Master Service Worker Terpadu untuk seluruh ekosistem publik:
//      - Menyimpan aset statis Wadah Induk, modules/transport-driver/, dan
//        modules/rental-mobil/ di dalam CACHE_STATIC = 'bgn-superapp-static-v14.0'.
//      - Menyimpan cache tile peta MapTiler (api.maptiler.com/maps/) & fallback
//        di CACHE_TILES = 'bgn-superapp-tiles-v14.0' (maks 160 tile).
//      - Menyimpan cache gambar thumbnail (lh3.googleusercontent.com, i.ytimg.com,
//        wsrv.nl) di CACHE_IMAGES = 'bgn-superapp-img-v14.0'.
//   2. BYPASS MUTLAK (return;) untuk seluruh lalu lintas real-time ke 5 proyek
//      Firebase (bagantara-core, futaqi-ali, chatting-88040, bagantara-history,
//      bagantara-overflow / *.firebasedatabase.app, *.firebaseio.com, *.googleapis.com),
//      script.google.com (GAS), project-osrm.org, cloudinary.com,
//      api.maptiler.com/geocoding/, tiktok.com/oembed, dan noembed.com!
// ==========================================================================

const CACHE_STATIC = 'bgn-superapp-static-v14.0';
const CACHE_TILES = 'bgn-superapp-tiles-v14.0';
const CACHE_IMAGES = 'bgn-superapp-img-v14.0';
const MAX_CACHED_TILES = 160;
const MAX_CACHED_IMAGES = 120;

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './css/superapp-shell.css?v=14.0',
    './js/superapp-shell.min.js?v=14.0',
    './assets/icon-192.png',
    './assets/icon-512.png',
    './assets/logo.png',
    './modules/transport-driver/index.html',
    './modules/transport-driver/manifest.json',
    './modules/transport-driver/css/theme.css?v=13.2',
    './modules/transport-driver/css/map.css?v=13.2',
    './modules/transport-driver/css/theme-chat-publik.css?v=13.2',
    './modules/transport-driver/js/bgn-core.min.js?v=13.2',
    './modules/transport-driver/assets/icon-192.png',
    './modules/transport-driver/assets/icon-512.png',
    './modules/rental-mobil/index.html',
    './modules/rental-mobil/manifest.json',
    './modules/rental-mobil/data/car-dictionary.json',
    './modules/rental-mobil/css/theme-rental-publik.css?v=2.3',
    './modules/rental-mobil/js/bgn-rental-publik.min.js?v=2.3',
    './modules/rental-mobil/assets/icon-192.png',
    './modules/rental-mobil/assets/icon-512.png',
    './modules/rental-mobil/assets/logo.png'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_STATIC).then((cache) => {
            return Promise.allSettled(
                ASSETS_TO_CACHE.map((url) =>
                    fetch(url, { cache: 'reload' }).then((res) => {
                        if (res && res.ok) return cache.put(url, res);
                    })
                )
            );
        })
    );
});

self.addEventListener('activate', (event) => {
    const allowedCaches = new Set([CACHE_STATIC, CACHE_TILES, CACHE_IMAGES]);
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(
                keyList.map((key) => {
                    if (!allowedCaches.has(key)) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'BGN_SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data.type === 'BGN_CLEAR_IMAGE_CACHE') {
        event.waitUntil(caches.delete(CACHE_IMAGES));
    }
});

async function trimBoundedCache(cacheName, maxItems) {
    try {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        if (keys.length > maxItems) {
            const deleteCount = keys.length - maxItems;
            for (let i = 0; i < deleteCount; i++) {
                await cache.delete(keys[i]);
            }
        }
    } catch (e) {}
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = req.url;
    let urlObj = null;
    try {
        urlObj = new URL(url);
    } catch (e) {
        return;
    }

    // 1. BYPASS MUTLAK UNTUK SELURUH LALU LINTAS REAL-TIME 5 PROYEK FIREBASE,
    //    GAS MICRO-BACKEND, OSRM, CLOUDINARY, MAPTILER GEOCODING, & OEMBED
    if (
        url.includes('bagantara-core') ||
        url.includes('futaqi-ali') ||
        url.includes('chatting-88040') ||
        url.includes('bagantara-history') ||
        url.includes('bagantara-overflow') ||
        url.includes('firebasedatabase.app') ||
        url.includes('firebaseio.com') ||
        url.includes('firestore.googleapis.com') ||
        url.includes('googleapis.com') ||
        url.includes('script.google.com') ||
        url.includes('project-osrm.org') ||
        url.includes('cloudinary.com') ||
        url.includes('api.maptiler.com/geocoding/') ||
        url.includes('tiktok.com/oembed') ||
        url.includes('noembed.com') ||
        urlObj.pathname.startsWith('/api/')
    ) {
        return;
    }

    // 2. CACHE-FIRST KHUSUS TILE PETA MAPTILER & FALLBACK OSM (MAKS 160 TILE)
    if (
        url.includes('api.maptiler.com/maps/') ||
        url.includes('tile.openstreetmap.org')
    ) {
        event.respondWith(
            caches.open(CACHE_TILES).then(async (cache) => {
                const cachedTile = await cache.match(req);
                if (cachedTile) return cachedTile;
                try {
                    const netRes = await fetch(req);
                    if (netRes && (netRes.status === 200 || netRes.type === 'opaque')) {
                        cache.put(req, netRes.clone());
                        trimBoundedCache(CACHE_TILES, MAX_CACHED_TILES);
                    }
                    return netRes;
                } catch (err) {
                    return cachedTile || Response.error();
                }
            })
        );
        return;
    }

    // 3. STALE-WHILE-REVALIDATE UNTUK GAMBAR THUMBNAIL EKSTERNAL (DRIVE, YOUTUBE, WSRV)
    if (
        url.includes('lh3.googleusercontent.com') ||
        url.includes('i.ytimg.com') ||
        url.includes('wsrv.nl')
    ) {
        event.respondWith(
            caches.open(CACHE_IMAGES).then(async (cache) => {
                const cachedImg = await cache.match(req);
                const netFetch = fetch(req).then((res) => {
                    if (res && (res.status === 200 || res.type === 'opaque')) {
                        cache.put(req, res.clone());
                        trimBoundedCache(CACHE_IMAGES, MAX_CACHED_IMAGES);
                    }
                    return res;
                }).catch(() => cachedImg);
                return cachedImg || netFetch;
            })
        );
        return;
    }

    // 4. CACHE-FIRST + STALE-WHILE-REVALIDATE UNTUK ASET STATIS LOKAL (INDUK & SUB-MODUL)
    const isStaticAsset = /\.(?:js|css|json|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(urlObj.pathname);
    if (isStaticAsset && urlObj.origin === self.location.origin) {
        event.respondWith(
            caches.open(CACHE_STATIC).then(async (cache) => {
                const cachedAsset = await cache.match(req);
                if (cachedAsset) {
                    if (
                        urlObj.search.includes('v=14.0') ||
                        urlObj.search.includes('v=13.2') ||
                        urlObj.search.includes('v=2.3')
                    ) {
                        return cachedAsset;
                    }
                    event.waitUntil(
                        fetch(req).then((freshRes) => {
                            if (freshRes && freshRes.status === 200) {
                                cache.put(req, freshRes.clone());
                            }
                        }).catch(() => {})
                    );
                    return cachedAsset;
                }

                try {
                    const netRes = await fetch(req);
                    if (netRes && netRes.status === 200) {
                        cache.put(req, netRes.clone());
                    }
                    return netRes;
                } catch (err) {
                    const fallback = await cache.match(req, { ignoreSearch: true });
                    return fallback || Response.error();
                }
            })
        );
        return;
    }

    // 5. STALE-WHILE-REVALIDATE UNTUK DOKUMEN NAVIGASI HTML (INDUK & FRAME SUB-MODUL)
    event.respondWith(
        caches.open(CACHE_STATIC).then(async (cache) => {
            const cachedDoc =
                await cache.match(req) ||
                (req.mode === 'navigate' ? await cache.match('./index.html') : null);
            const networkFetch = fetch(req).then((networkRes) => {
                if (networkRes && networkRes.status === 200) {
                    cache.put(req, networkRes.clone());
                }
                return networkRes;
            }).catch(() => cachedDoc);

            return cachedDoc || networkFetch;
        })
    );
});
