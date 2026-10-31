// ==========================================================================
// FILE: services-worker.js (BAGANTARA PUBLIC PWA - V13.2 ZERO-CDN-SPIKE EDITION)
// FUNGSI: 1. Cache-First / Stale-While-Revalidate untuk Aset Statis (.js, .css, .png, .webp)
//            agar pembukaan ulang aplikasi TIDAK mengunduh ulang dari Vercel CDN
//         2. Cache-First khusus Tile Peta langsung dari api.maptiler.com/maps/ & tile.openstreetmap.org
//         3. Bypass Mutlak untuk Firebase RTDB, Firestore, OSRM, & GAS Micro-Backend
// ==========================================================================

const CACHE_STATIC = 'bgn-core-v13.2.0';
const CACHE_TILES = 'bgn-maptiler-tiles-v13.2';
const MAX_CACHED_TILES = 160;

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './css/theme.css?v=13.2',
    './css/map.css?v=13.2',
    './css/theme-chat-publik.css?v=13.2',
    './js/bgn-core.min.js?v=13.2',
    './assets/icon-192.png',
    './assets/icon-512.png'
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
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(
                keyList.map((key) => {
                    if (key !== CACHE_STATIC && key !== CACHE_TILES) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

async function trimTileCache(cacheName, maxItems) {
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

    // 1. BYPASS MUTLAK UNTUK API REALTIME EKSTERNAL (FIREBASE RTDB, FIRESTORE, OSRM, CLOUDINARY, GAS, & MAPTILER GEOCODING)
    if (
        url.includes('firebasedatabase.app') ||
        url.includes('firebaseio.com') ||
        url.includes('firestore.googleapis.com') ||
        url.includes('googleapis.com') ||
        url.includes('project-osrm.org') ||
        url.includes('cloudinary.com') ||
        url.includes('script.google.com') ||
        url.includes('api.maptiler.com/geocoding/') ||
        urlObj.pathname.startsWith('/api/')
    ) {
        return;
    }

    // 2. CACHE-FIRST KHUSUS TILE PETA LANGSUNG DARI CDN MAPTILER & FALLBACK OSM (0 VERCEL FUNCTION INVOCATIONS)
    const isMapTile = (
        url.includes('api.maptiler.com/maps/') ||
        url.includes('tile.openstreetmap.org')
    );

    if (isMapTile) {
        event.respondWith(
            caches.open(CACHE_TILES).then(async (cache) => {
                const cachedTile = await cache.match(req);
                if (cachedTile) return cachedTile;
                try {
                    const netRes = await fetch(req);
                    if (netRes && (netRes.status === 200 || netRes.type === 'opaque')) {
                        cache.put(req, netRes.clone());
                        trimTileCache(CACHE_TILES, MAX_CACHED_TILES);
                    }
                    return netRes;
                } catch (err) {
                    return cachedTile || Response.error();
                }
            })
        );
        return;
    }

    // 3. CACHE-FIRST + STALE-WHILE-REVALIDATE UNTUK ASET STATIS (.js, .css, .png, .jpg, .webp, .woff2)
    //    Mencegah unduhan ulang dari Vercel CDN saat aplikasi dibuka kembali
    const isStaticAsset = /\.(?:js|css|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(urlObj.pathname);
    if (isStaticAsset && urlObj.origin === self.location.origin) {
        event.respondWith(
            caches.open(CACHE_STATIC).then(async (cache) => {
                const cachedAsset = await cache.match(req);
                if (cachedAsset) {
                    // Jika URL sudah memiliki query versi (?v=13.2), langsung kembalikan dari cache (0 CDN Request!)
                    if (urlObj.search.includes('v=13.2')) {
                        return cachedAsset;
                    }
                    // Stale-While-Revalidate di latar belakang untuk aset tanpa query versi
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
                    const fallbackIgnoreQuery = await cache.match(req, { ignoreSearch: true });
                    return fallbackIgnoreQuery || Response.error();
                }
            })
        );
        return;
    }

    // 4. STALE-WHILE-REVALIDATE UNTUK DOKUMEN NAVIGASI UTAMA (index.html & manifest.json)
    event.respondWith(
        caches.open(CACHE_STATIC).then(async (cache) => {
            const cachedDoc = await cache.match(req) || (req.mode === 'navigate' ? await cache.match('./index.html') : null);
            const networkFetch = fetch(req).then((networkRes) => {
                if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
                    cache.put(req, networkRes.clone());
                }
                return networkRes;
            }).catch(() => cachedDoc);

            return cachedDoc || networkFetch;
        })
    );
});
