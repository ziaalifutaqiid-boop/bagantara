// ==========================================================================
// FILE: services-worker.js (BAGANTARA RENTAL PUBLIK)
// FUNGSI:
//   1. Cache-First / Stale-While-Revalidate untuk Aset Statis Produksi
//      dengan nama cache unik "bgn-rental-publik-v2.3.0".
//   2. Cache gambar thumbnail armada (lh3.googleusercontent.com, i.ytimg.com, wsrv.nl)
//      agar hemat kuota data perangkat penyewa.
//   3. Bypass Mutlak untuk endpoint Firebase RTDB (.firebasedatabase.app) & oEmbed
//      agar sinkronisasi katalog dan video bekerja secara langsung dan akurat.
// ==========================================================================

const CACHE_STATIC = 'bgn-rental-publik-v2.3.0';
const CACHE_THUMBNAILS = 'bgn-rental-publik-img-v2.3.0';

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './data/car-dictionary.json',
    './css/theme-rental-publik.css?v=2.3',
    './js/bgn-rental-publik.min.js?v=2.3',
    './assets/icon-192.png',
    './assets/icon-512.png',
    './assets/logo.png'
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
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_STATIC && key !== CACHE_THUMBNAILS) {
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
        event.waitUntil(caches.delete(CACHE_THUMBNAILS));
    }
});

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

    // 1. BYPASS MUTLAK UNTUK FIREBASE RTDB & OEMBED AGAR DATA SELALU SEGAR
    if (
        url.includes('firebasedatabase.app') ||
        url.includes('firebaseio.com') ||
        url.includes('googleapis.com') ||
        url.includes('tiktok.com/oembed') ||
        url.includes('noembed.com')
    ) {
        return;
    }

    // 2. CACHE THUMBNAIL GAMBAR EKSTERNAL DENGAN STALE-WHILE-REVALIDATE
    if (
        url.includes('lh3.googleusercontent.com') ||
        url.includes('i.ytimg.com') ||
        url.includes('wsrv.nl')
    ) {
        event.respondWith(
            caches.open(CACHE_THUMBNAILS).then(async (cache) => {
                const cachedImg = await cache.match(req);
                const netFetch = fetch(req).then((res) => {
                    if (res && (res.status === 200 || res.type === 'opaque')) {
                        cache.put(req, res.clone());
                    }
                    return res;
                }).catch(() => cachedImg);
                return cachedImg || netFetch;
            })
        );
        return;
    }

    // 3. CACHE-FIRST UNTUK ASET STATIS LOKAL (.js, .css, .json, .png, .svg, .webp, .woff2)
    const isStaticAsset = /\.(?:js|css|json|png|jpg|jpeg|webp|svg|ico|woff2?)$/i.test(urlObj.pathname);
    if (isStaticAsset && urlObj.origin === self.location.origin) {
        event.respondWith(
            caches.open(CACHE_STATIC).then(async (cache) => {
                const cachedAsset = await cache.match(req);
                if (cachedAsset) {
                    if (urlObj.search.includes('v=2.3')) {
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

    // 4. STALE-WHILE-REVALIDATE UNTUK DOKUMEN NAVIGASI UTAMA (index.html)
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
