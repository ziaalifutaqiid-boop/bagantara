// ==========================================================================
// FILE: js/core/rtdb-etag-client.js (BAGANTARA RENTAL PUBLIK)
// FUNGSI:
//   1. Dekripsi RC4 + XOR Byte Array Vault (window.__BGN_CONFIG_VAULT__)
//   2. Gerbang Izin Lokasi Perangkat (#gps-mandatory-lock-overlay)
//   3. Dekompresi Presisi 21-Field & Fallback Hibrida "||BGT2|" (5 Saklar Paket
//      Waktu Sewa: 6 Jam, 12 Jam, Harian 24 Jam, Mingguan, Bulanan; Saklar Luar Kota;
//      serta Kuota Media Hemat Maks 2 Foto + 1 Video Opsional, Privasi Plat Nomor)
//   4. Panel Media Dinamis Mengambang (#bgn-floating-media-viewer) dengan Mesin
//      Gestur Cubitan Jari (Pinch-to-Zoom 0.75x - 3.5x, Drag/Pan, Double-Tap Reset)
//      + Tombol Tutup & Aturan Memori "Single-Active-Iframe"
//   5. Penyimpanan Cache IndexedDB Skala 100.000+ Unit (bgn_rental_idb_v5 -> catalog_cache)
//      dengan Fallback localStorage & Smart ETag Cooldown 60 Detik
// ==========================================================================

const ETAG_CACHE_STORAGE_KEY = 'bgn_rental_publik_etag_cache_v5';
const SETTINGS_STORAGE_KEY = 'bgn_rental_publik_settings_v5';
const OJOL_SETTINGS_KEY = 'bgn_user_device_settings_v13';
const LEGACY_OJOL_SETTINGS_KEY = 'bgn_user_settings_v1';
const SHARED_GPS_STORAGE_KEY = 'bgn_superapp_shared_gps';
const SHARED_GPS_MAX_AGE_MS = 15 * 60 * 1000; // 15 Menit Single GPS Lock Authority
const IDB_DB_NAME = 'bgn_rental_idb_v5';
const IDB_STORE_NAME = 'catalog_cache';
const IDB_CACHE_RECORD_KEY = 'main_catalog_snapshot';
const ETAG_COOLDOWN_MS = 60 * 1000; // 60 Detik Cooldown Hemat Kuota RTDB
const MAX_NEARBY_DISTANCE_KM = 30.0;
const ROAD_CORRECTION_FACTOR = 1.2;

let currentUserGps = null; // { lat: number, lng: number, ts: number }
let inMemoryCatalogCache = null; // { etag: string, rawCatalog: object, ts: number }
let lastSuccessfulSyncTs = 0;

const buttonMorphTimers = new WeakMap();
const oembedMemoryCache = new Map();

// State Panel Media Mengambang (#bgn-floating-media-viewer)
let floatingMediaState = {
    unit: null,
    mediaItems: [],
    activeSlotIdx: 0,
    scale: 1,
    translateX: 0,
    translateY: 0,
    isGestureBound: false,
    resetTransformFn: null
};

export const DEFAULT_CAR_PHOTO_SVG =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 380" width="640" height="380">
            <defs>
                <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#0d1630"/>
                    <stop offset="100%" stop-color="#070d1f"/>
                </linearGradient>
                <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stop-color="#c5a880"/>
                    <stop offset="50%" stop-color="#f3e5ab"/>
                    <stop offset="100%" stop-color="#c5a880"/>
                </linearGradient>
            </defs>
            <rect width="640" height="380" fill="url(#bg)"/>
            <rect x="18" y="18" width="604" height="344" rx="24" fill="none" stroke="url(#gold)" stroke-width="2" stroke-opacity="0.32"/>
            <path d="M155 228 L205 154 C216 138 234 128 256 128 L378 128 C400 128 418 138 430 154 L468 202 C484 208 495 220 495 238 L495 256 C495 266 485 272 472 272 L448 272 A30 30 0 0 1 388 272 L252 272 A30 30 0 0 1 192 272 L168 272 C154 272 145 266 145 254 L145 240 C145 232 150 228 155 228 Z" fill="none" stroke="url(#gold)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M220 148 L384 148 L416 196 L190 196 Z" fill="#c5a880" fill-opacity="0.18" stroke="#c5a880" stroke-width="3" stroke-linejoin="round"/>
            <circle cx="222" cy="272" r="24" fill="#070d1f" stroke="#c5a880" stroke-width="7"/>
            <circle cx="418" cy="272" r="24" fill="#070d1f" stroke="#c5a880" stroke-width="7"/>
            <text x="320" y="330" text-anchor="middle" fill="#c5a880" font-family="sans-serif" font-size="15" font-weight="bold" letter-spacing="3">ARMADA SIAP SEWA • BAGANTARA</text>
        </svg>`
    );

export const DEFAULT_VIDEO_COVER_SVG =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 380" width="640" height="380">
            <defs>
                <linearGradient id="vbg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#111c3a"/>
                    <stop offset="100%" stop-color="#050914"/>
                </linearGradient>
            </defs>
            <rect width="640" height="380" fill="url(#vbg)"/>
            <rect x="18" y="18" width="604" height="344" rx="24" fill="none" stroke="#c5a880" stroke-width="2" stroke-opacity="0.38"/>
            <circle cx="320" cy="168" r="44" fill="#c5a880" fill-opacity="0.16" stroke="#c5a880" stroke-width="2.5"/>
            <polygon points="308,146 308,190 346,168" fill="#c5a880"/>
            <text x="320" y="262" text-anchor="middle" fill="#f8fafc" font-family="sans-serif" font-size="15" font-weight="bold" letter-spacing="2.5">VIDEO REVIEW ARMADA</text>
            <text x="320" y="288" text-anchor="middle" fill="#c5a880" font-family="sans-serif" font-size="11" font-weight="bold" letter-spacing="1.5">KETUK TOMBOL PUTAR UNTUK MENONTON</text>
        </svg>`
    );

export function bukaBrankasKonfigurasiPublik() {
    if (window.BGN_RENTAL_VAULT) {
        return window.BGN_RENTAL_VAULT;
    }
    const rawVault = window.__BGN_CONFIG_VAULT__;
    if (!rawVault || !Array.isArray(rawVault.bytes) || !rawVault.key) {
        return null;
    }

    const keyStr = String(rawVault.key);
    const xorSeed = Number(rawVault.seed || 0);
    const encBytes = rawVault.bytes;
    const len = encBytes.length;

    const S = new Uint8Array(256);
    for (let i = 0; i < 256; i++) S[i] = i;
    let j = 0;
    for (let i = 0; i < 256; i++) {
        j = (j + S[i] + keyStr.charCodeAt(i % keyStr.length)) & 0xff;
        const tmp = S[i];
        S[i] = S[j];
        S[j] = tmp;
    }

    const outBytes = new Uint8Array(len);
    let x = 0;
    let y = 0;
    for (let k = 0; k < len; k++) {
        x = (x + 1) & 0xff;
        y = (y + S[x]) & 0xff;
        const tmp = S[x];
        S[x] = S[y];
        S[y] = tmp;
        const rc4Byte = S[(S[x] + S[y]) & 0xff];
        const xorSalt = (keyStr.charCodeAt(k % keyStr.length) ^ ((xorSeed + ((k * 31) & 0xff)) & 0xff)) & 0xff;
        outBytes[k] = (encBytes[k] ^ rc4Byte ^ xorSalt) & 0xff;
        encBytes[k] = 0;
    }

    const jsonText = new TextDecoder('utf-8').decode(outBytes);
    outBytes.fill(0);
    const parsed = JSON.parse(jsonText);
    window.BGN_RENTAL_VAULT = parsed;
    return parsed;
}

export function ambilKamusKendaraanLokal() {
    const vault = bukaBrankasKonfigurasiPublik();
    if (vault && vault.carDictionary) {
        return vault.carDictionary;
    }
    return {
        models: {},
        transmissions: { A: 'Matic', M: 'Manual' },
        fuels: { B: 'Bensin', D: 'Solar / Diesel', E: 'Listrik / Hybrid' },
        service_modes: { '1': 'Lepas Kunci', '2': 'Dengan Sopir', '3': 'Lepas Kunci / Dengan Sopir' },
        inclusions: { U: 'Unit Mobil Saja', S: 'Unit + Sopir (Belum BBM)', A: 'All-In Dalam Kota (Unit + Sopir + BBM)' },
        dp_types: { '0': 'Tanpa DP (Bayar Saat Serah Terima)', P: 'Persentase dari Total Sewa (%)', F: 'Nominal Tetap (Rp)' },
        requirements: {}
    };
}

export function labelKategoriPublikRamah(cat) {
    const map = {
        'MPV': 'Mobil Keluarga',
        'City Car': 'City Car & Sedan',
        'SUV': 'SUV',
        'Minibus': 'Hiace & Elf',
        'Bus': 'Bus Pariwisata',
        'Luxury': 'Kelas VIP',
        'EV': 'Listrik & Niaga',
        'Custom': 'Armada Khusus'
    };
    return map[cat] || cat || 'Mobil Keluarga';
}

export function bacaSetelanPerangkatPublik() {
    try {
        const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
            || localStorage.getItem(OJOL_SETTINGS_KEY)
            || localStorage.getItem(LEGACY_OJOL_SETTINGS_KEY);
        if (!raw) return { themeMode: 'auto', haptic: true, liteMode: false };
        const parsed = JSON.parse(raw);
        const mode = parsed.themeMode || parsed.theme || 'auto';
        return {
            themeMode: ['auto', 'dark', 'light'].includes(mode) ? mode : 'auto',
            haptic: parsed.haptic !== false,
            liteMode: Boolean(parsed.liteMode)
        };
    } catch (e) {
        return { themeMode: 'auto', haptic: true, liteMode: false };
    }
}

export function simpanSetelanPerangkatPublik(newSettings, silentBridge = false) {
    const mode = ['auto', 'dark', 'light'].includes(newSettings?.themeMode || newSettings?.theme)
        ? (newSettings.themeMode || newSettings.theme)
        : 'auto';
    const cleanPayload = {
        themeMode: mode,
        theme: mode,
        haptic: newSettings?.haptic !== false,
        liteMode: Boolean(newSettings?.liteMode)
    };
    try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(cleanPayload));
        let prevOjol = {};
        try {
            const rawOjol = localStorage.getItem(OJOL_SETTINGS_KEY) || localStorage.getItem(LEGACY_OJOL_SETTINGS_KEY);
            if (rawOjol) prevOjol = JSON.parse(rawOjol) || {};
        } catch (e) {}
        const syncedOjol = {
            theme: cleanPayload.themeMode,
            themeMode: cleanPayload.themeMode,
            haptic: cleanPayload.haptic,
            sound: typeof prevOjol.sound === 'boolean' ? prevOjol.sound : true,
            wakeLock: typeof prevOjol.wakeLock === 'boolean' ? prevOjol.wakeLock : true,
            liteMode: cleanPayload.liteMode
        };
        localStorage.setItem(OJOL_SETTINGS_KEY, JSON.stringify(syncedOjol));
        localStorage.setItem(LEGACY_OJOL_SETTINGS_KEY, JSON.stringify(syncedOjol));
    } catch (e) {}
    if (!silentBridge) {
        try {
            const realTop = (typeof globalThis !== 'undefined' && globalThis.parent) ? globalThis.parent : null;
            if (realTop && realTop !== globalThis && typeof realTop.postMessage === 'function') {
                realTop.postMessage({
                    type: 'BGN_BRIDGE_THEME_SYNC',
                    sourceModule: 'rental-mobil',
                    themeMode: cleanPayload.themeMode,
                    haptic: cleanPayload.haptic,
                    liteMode: cleanPayload.liteMode
                }, '*');
            }
        } catch (e) {}
    }
}

export function picuGetarPublik(ms = 12) {
    const st = bacaSetelanPerangkatPublik();
    if (!st.haptic) return;
    try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            navigator.vibrate(ms);
        }
    } catch (e) {}
}

export function morphButtonPublik(btnEl, labelText = '✓ BERHASIL', durationMs = 1500) {
    if (!btnEl) return;
    picuGetarPublik(14);
    const existing = buttonMorphTimers.get(btnEl);
    if (existing) {
        clearTimeout(existing.timer);
    } else {
        buttonMorphTimers.set(btnEl, {
            origHtml: btnEl.innerHTML,
            timer: null
        });
    }
    const rec = buttonMorphTimers.get(btnEl);
    btnEl.classList.add('btn-morph-emerald');
    btnEl.innerHTML = `<span>${labelText}</span>`;
    rec.timer = setTimeout(() => {
        btnEl.classList.remove('btn-morph-emerald');
        btnEl.innerHTML = rec.origHtml;
        buttonMorphTimers.delete(btnEl);
    }, durationMs);
}

export function tampilkanToastPublik(pesan, targetBtn = null) {
    const btn = targetBtn || (typeof document !== 'undefined' && document.activeElement && document.activeElement.tagName === 'BUTTON' ? document.activeElement : null);
    if (btn) {
        morphButtonPublik(btn, pesan, 1500);
    }
}

export function formatRupiahPublik(nominal) {
    const num = Math.round(Number(nominal || 0));
    if (!Number.isFinite(num) || num <= 0) return 'Rp 0';
    return 'Rp ' + num.toLocaleString('id-ID');
}

// ==========================================================================
// 2. DETEKTOR MULTI-MEDIA (MAKS 2 FOTO + 1 VIDEO), ANTI-BLOCK IMAGE FALLBACK
// ==========================================================================
export function ekspansiTokenMediaPendekPublik(tokenStr) {
    const raw = String(tokenStr || '').trim();
    if (!raw) return { url: '', typeHint: null };

    if (raw.startsWith('gd:')) return { url: raw.slice(3), typeHint: null };
    if (raw.startsWith('yt:')) return { url: `https://www.youtube.com/watch?v=${raw.slice(3)}`, typeHint: 'V' };
    if (raw.startsWith('ys:')) return { url: `https://www.youtube.com/shorts/${raw.slice(3)}`, typeHint: 'V' };
    if (raw.startsWith('tk:')) return { url: `https://www.tiktok.com/@bagantara/video/${raw.slice(3)}`, typeHint: 'V' };
    if (raw.startsWith('vt:')) return { url: `https://vt.tiktok.com/${raw.slice(3)}/`, typeHint: 'V' };
    if (raw.startsWith('vm:')) return { url: `https://vm.tiktok.com/${raw.slice(3)}/`, typeHint: 'V' };
    if (raw.startsWith('igr:')) return { url: `https://www.instagram.com/reel/${raw.slice(4)}/`, typeHint: 'V' };
    if (raw.startsWith('igp:')) return { url: `https://www.instagram.com/p/${raw.slice(4)}/`, typeHint: null };
    if (/^[a-zA-Z0-9_-]{18,65}$/.test(raw) || /^https?:\/\//i.test(raw)) {
        return { url: raw, typeHint: null };
    }
    return { url: `https://${raw}`, typeHint: null };
}

export function deteksiTipeDanPlatformMediaPublik(rawInput, explicitType = null, index = 0) {
    const cleanRaw = String(rawInput || '').split('||BGT2|')[0].trim().replace(/[<>"']/g, '');
    if (!cleanRaw) {
        return {
            index,
            type: explicitType === 'V' ? 'V' : 'I',
            url: '',
            platform: 'web',
            platformLabel: 'Foto Armada',
            thumbUrl: DEFAULT_CAR_PHOTO_SVG,
            embedUrl: '',
            videoId: ''
        };
    }

    const exp = ekspansiTokenMediaPendekPublik(cleanRaw);
    const url = exp.url;
    const typeHint = explicitType || exp.typeHint;

    // 1. TikTok
    if (/(?:tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/i.test(url)) {
        const vidMatch = url.match(/\/video\/(\d{10,25})/i) || url.match(/\/v\/(\d{10,25})/i);
        const videoId = vidMatch ? vidMatch[1] : '';
        const finalType = explicitType === 'I' ? 'I' : 'V';
        return {
            index,
            type: finalType,
            url,
            platform: 'tiktok',
            platformLabel: 'TikTok Review',
            thumbUrl: DEFAULT_VIDEO_COVER_SVG,
            embedUrl: videoId
                ? `https://www.tiktok.com/player/v1/${videoId}?music_info=0&description=0&rel=0&native_context_menu=0&autoplay=1`
                : url,
            videoId
        };
    }

    // 2. YouTube / Shorts
    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
    if (ytMatch && ytMatch[1]) {
        const videoId = ytMatch[1];
        const finalType = explicitType === 'I' ? 'I' : 'V';
        return {
            index,
            type: finalType,
            url,
            platform: 'youtube',
            platformLabel: 'YouTube Review',
            thumbUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
            embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&rel=0&modestbranding=1&fs=0&autoplay=1`,
            videoId
        };
    }

    // 3. Instagram Reel / TV / Post
    const igMatch = url.match(/instagram\.com\/(reel|reels|tv|p)\/([a-zA-Z0-9_-]+)/i);
    if (igMatch && igMatch[2]) {
        const code = igMatch[2];
        const finalType = explicitType === 'I' ? 'I' : 'V';
        return {
            index,
            type: finalType,
            url: `https://www.instagram.com/p/${code}/`,
            platform: 'instagram',
            platformLabel: 'Instagram Reels',
            thumbUrl: DEFAULT_VIDEO_COVER_SVG,
            embedUrl: `https://www.instagram.com/p/${code}/embed/captioned/`,
            videoId: code
        };
    }

    // 4. Facebook Reel / Watch / Video
    if (/(?:facebook\.com\/(?:reel|watch|.*\/videos)|fb\.watch)/i.test(url)) {
        const finalType = explicitType === 'I' ? 'I' : 'V';
        return {
            index,
            type: finalType,
            url,
            platform: 'facebook',
            platformLabel: 'Facebook Video',
            thumbUrl: DEFAULT_VIDEO_COVER_SVG,
            embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=true&width=500&autoplay=true`,
            videoId: ''
        };
    }

    // 5. File Video Langsung (.mp4, .webm, .mov)
    if (/\.(?:mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(url)) {
        const finalType = explicitType === 'I' ? 'I' : 'V';
        return {
            index,
            type: finalType,
            url,
            platform: 'web',
            platformLabel: 'Video Garasi',
            thumbUrl: DEFAULT_VIDEO_COVER_SVG,
            embedUrl: url,
            videoId: ''
        };
    }

    // 6. Google Drive (Foto atau Video)
    const driveMatch =
        url.match(/(?:\/file\/d\/|\/d\/|[?&]id=)([a-zA-Z0-9_-]{15,})/i) ||
        url.match(/^https:\/\/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]{15,})/i);
    const driveId = (driveMatch && driveMatch[1])
        ? driveMatch[1]
        : (/^[a-zA-Z0-9_-]{18,65}$/.test(url) ? url : '');

    if (driveId) {
        const isPreviewLink = /\/preview(?:\?.*)?$/i.test(url);
        const finalType = (typeHint === 'V' || isPreviewLink) ? 'V' : 'I';
        const thumb = `https://lh3.googleusercontent.com/d/${driveId}=w800`;
        return {
            index,
            type: finalType,
            url: `https://drive.google.com/file/d/${driveId}/view`,
            platform: 'gdrive',
            platformLabel: finalType === 'V' ? 'Video Garasi' : 'Foto Garasi',
            thumbUrl: thumb,
            embedUrl: finalType === 'V' ? `https://drive.google.com/file/d/${driveId}/preview` : thumb,
            videoId: driveId
        };
    }

    // 7. Gambar Web / CDN
    const finalType = typeHint === 'V' ? 'V' : 'I';
    return {
        index,
        type: finalType,
        url,
        platform: 'web',
        platformLabel: finalType === 'V' ? 'Video Garasi' : 'Foto Armada',
        thumbUrl: finalType === 'V' ? DEFAULT_VIDEO_COVER_SVG : url,
        embedUrl: url,
        videoId: ''
    };
}

export function konversiDriveThumbnailPublik(rawInput, width = 800) {
    if (!rawInput || String(rawInput).trim() === '') return '';
    const primaryRaw = String(rawInput).split('||BGT2|')[0].trim().replace(/[<>"']/g, '');
    if (!primaryRaw) return '';

    const exp = ekspansiTokenMediaPendekPublik(primaryRaw);
    const primary = exp.url || primaryRaw;

    const driveMatch = primary.match(/(?:\/file\/d\/|\/d\/|[?&]id=)([a-zA-Z0-9_-]{15,})/i);
    if (driveMatch && driveMatch[1]) {
        return `https://lh3.googleusercontent.com/d/${driveMatch[1]}=w${width}`;
    }

    const lh3Match = primary.match(/^https:\/\/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]{15,})/i);
    if (lh3Match && lh3Match[1]) {
        return `https://lh3.googleusercontent.com/d/${lh3Match[1]}=w${width}`;
    }

    if (/^[a-zA-Z0-9_-]{18,65}$/.test(primary)) {
        return `https://lh3.googleusercontent.com/d/${primary}=w${width}`;
    }

    const det = deteksiTipeDanPlatformMediaPublik(primary);
    if (det.thumbUrl && det.thumbUrl !== DEFAULT_VIDEO_COVER_SVG) {
        return det.thumbUrl;
    }

    if (/^https?:\/\//i.test(primary)) {
        return primary;
    }

    return '';
}

// Pasang perisai gambar dengan Anti-Block Proxy Fallback (wsrv.nl) sebelum SVG
export function pasangPerisaiGambar(imgEl, rawPhotoUrl, fallbackUrl = DEFAULT_CAR_PHOTO_SVG) {
    if (!imgEl) return;
    const resolvedUrl = konversiDriveThumbnailPublik(rawPhotoUrl, 800) || fallbackUrl;
    imgEl.setAttribute('referrerpolicy', 'no-referrer');
    imgEl.setAttribute('draggable', 'false');
    imgEl.setAttribute('loading', 'lazy');
    imgEl.setAttribute('decoding', 'async');
    imgEl.oncontextmenu = () => false;
    imgEl.ondragstart = () => false;

    let triedProxy = false;
    imgEl.onerror = () => {
        if (
            !triedProxy &&
            /^https?:\/\//i.test(resolvedUrl) &&
            !resolvedUrl.includes('wsrv.nl') &&
            !resolvedUrl.startsWith('data:')
        ) {
            triedProxy = true;
            imgEl.src = `https://wsrv.nl/?url=${encodeURIComponent(resolvedUrl)}&w=800&output=webp`;
            return;
        }
        imgEl.onerror = null;
        imgEl.src = fallbackUrl;
    };
    imgEl.src = resolvedUrl;
}

// ATURAN MEMORI "SINGLE-ACTIVE-IFRAME" (Hancurkan semua iframe/video aktif di kontainer)
export function hancurkanIframeDiKontainer(containerEl) {
    if (!containerEl || typeof containerEl.querySelectorAll !== 'function') return;
    containerEl.querySelectorAll('iframe').forEach((ifr) => {
        try {
            ifr.src = 'about:blank';
            ifr.remove();
        } catch (e) {}
    });
    containerEl.querySelectorAll('video').forEach((vid) => {
        try {
            vid.pause();
            vid.removeAttribute('src');
            vid.load();
            vid.remove();
        } catch (e) {}
    });
    containerEl.querySelectorAll('.bgn-active-iframe-wrap').forEach((wrap) => {
        try {
            wrap.remove();
        } catch (e) {}
    });
    containerEl.querySelectorAll('.bgn-video-cover-layer').forEach((cov) => {
        cov.classList.remove('hidden');
    });
}

export function hancurkanSemuaIframeVideoAktif(exceptStageEl = null) {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.bgn-media-stage-box').forEach((stage) => {
        if (exceptStageEl && stage === exceptStageEl) return;
        hancurkanIframeDiKontainer(stage);
    });
    const floatingPanel = document.getElementById('bgn-floating-pinch-panel');
    if (floatingPanel && floatingPanel !== exceptStageEl) {
        hancurkanIframeDiKontainer(floatingPanel);
    }
}
window.hancurkanSemuaIframeVideoAktif = hancurkanSemuaIframeVideoAktif;

// Resolver oEmbed TikTok / YouTube / Sosial Media (dengan Cache Memori)
export async function tarikOembedSosmedPublik(rawUrl) {
    const cleanUrl = String(rawUrl || '').trim();
    if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) {
        return { ok: false, videoId: '', title: '', thumbnailUrl: '' };
    }
    if (oembedMemoryCache.has(cleanUrl)) {
        return oembedMemoryCache.get(cleanUrl);
    }

    const endpoints = [];
    if (/tiktok\.com/i.test(cleanUrl)) {
        endpoints.push(`https://www.tiktok.com/oembed?url=${encodeURIComponent(cleanUrl)}`);
    }
    endpoints.push(`https://noembed.com/embed?url=${encodeURIComponent(cleanUrl)}`);

    for (const ep of endpoints) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(ep, { signal: controller.signal });
            clearTimeout(timer);
            if (res && res.ok) {
                const data = await res.json();
                const htmlStr = String(data.html || '');
                const citeMatch = htmlStr.match(/\/video\/(\d{10,25})/i) || htmlStr.match(/data-video-id="(\d{10,25})"/i);
                const videoId = String(data.embed_product_id || (citeMatch ? citeMatch[1] : '') || '').trim();
                const title = String(data.title || '').replace(/\s+/g, ' ').trim();
                const thumbnailUrl = String(data.thumbnail_url || '').trim();
                const result = {
                    ok: Boolean(videoId || title || thumbnailUrl),
                    videoId,
                    title,
                    thumbnailUrl
                };
                if (result.ok) {
                    oembedMemoryCache.set(cleanUrl, result);
                    return result;
                }
            }
        } catch (e) {}
    }

    return { ok: false, videoId: '', title: '', thumbnailUrl: '' };
}

// ==========================================================================
// 3. PANEL MEDIA DINAMIS MENGAMBANG (#bgn-floating-media-viewer) & MESIN
//    CUBITAN JARI (PINCH-TO-ZOOM 0.75x - 3.5x + DRAG/PAN + TOMBOL TUTUP)
// ==========================================================================
export function pasangGesturCubitanJariMedia(panelEl, stageWrapperEl) {
    if (!panelEl || !stageWrapperEl) return;

    let currentScale = 1;
    let translateX = 0;
    let translateY = 0;
    let startScale = 1;
    let initialPinchDistance = 0;
    let initialMidX = 0;
    let initialMidY = 0;
    let startPanX = 0;
    let startPanY = 0;
    let isPinching = false;
    let isPanning = false;
    let rafId = null;
    let lastTapTs = 0;

    const btnResetZoom = document.getElementById('btnResetFloatingZoom');
    const pinchShield = document.getElementById('bgn-floating-pinch-shield');

    function clampScale(s) {
        return Math.min(3.5, Math.max(0.75, s));
    }

    function applyTransformNow() {
        rafId = null;
        if (Math.abs(currentScale - 1) < 0.03) {
            translateX *= 0.5;
            translateY *= 0.5;
            if (Math.abs(translateX) < 2) translateX = 0;
            if (Math.abs(translateY) < 2) translateY = 0;
        }
        panelEl.style.transform = `translate3d(${translateX.toFixed(1)}px, ${translateY.toFixed(1)}px, 0) scale(${currentScale.toFixed(3)})`;
        floatingMediaState.scale = currentScale;
        floatingMediaState.translateX = translateX;
        floatingMediaState.translateY = translateY;

        if (btnResetZoom) {
            const pct = Math.round(currentScale * 100);
            btnResetZoom.textContent = `${pct}%`;
            btnResetZoom.classList.toggle('is-zoomed', pct !== 100);
        }
    }

    function scheduleTransform() {
        if (rafId === null) {
            rafId = requestAnimationFrame(applyTransformNow);
        }
    }

    function resetTransformToDefault() {
        currentScale = 1;
        translateX = 0;
        translateY = 0;
        isPinching = false;
        isPanning = false;
        if (pinchShield) pinchShield.classList.add('hidden');
        scheduleTransform();
    }

    floatingMediaState.resetTransformFn = resetTransformToDefault;

    if (floatingMediaState.isGestureBound) {
        resetTransformToDefault();
        return;
    }
    floatingMediaState.isGestureBound = true;

    if (btnResetZoom) {
        btnResetZoom.addEventListener('click', (e) => {
            e.stopPropagation();
            picuGetarPublik(10);
            resetTransformToDefault();
        });
    }

    stageWrapperEl.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            // Cubitan 2 Jari: Aktifkan pelindung sentuh di atas iframe agar event cubit 100% tertangkap
            isPinching = true;
            isPanning = false;
            if (pinchShield) pinchShield.classList.remove('hidden');

            const t1 = e.touches[0];
            const t2 = e.touches[1];
            initialPinchDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY) || 1;
            initialMidX = (t1.clientX + t2.clientX) / 2;
            initialMidY = (t1.clientY + t2.clientY) / 2;
            startScale = currentScale;
            startPanX = translateX;
            startPanY = translateY;
            if (e.cancelable) e.preventDefault();
        } else if (e.touches.length === 1) {
            const now = Date.now();
            const isFrameBorder = e.target === stageWrapperEl || e.target === panelEl || e.target.classList.contains('floating-pinch-grip');
            if (now - lastTapTs < 280 && isFrameBorder) {
                // Double-tap pada bingkai mereset ukuran ke 1.0x
                resetTransformToDefault();
                lastTapTs = 0;
                return;
            }
            lastTapTs = now;

            if (currentScale > 1.05 || isFrameBorder) {
                isPanning = true;
                const t1 = e.touches[0];
                initialMidX = t1.clientX;
                initialMidY = t1.clientY;
                startPanX = translateX;
                startPanY = translateY;
            }
        }
    }, { passive: false });

    stageWrapperEl.addEventListener('touchmove', (e) => {
        if (isPinching && e.touches.length === 2) {
            if (e.cancelable) e.preventDefault();
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY) || 1;
            const midX = (t1.clientX + t2.clientX) / 2;
            const midY = (t1.clientY + t2.clientY) / 2;

            const ratio = dist / initialPinchDistance;
            currentScale = clampScale(startScale * ratio);
            translateX = startPanX + (midX - initialMidX);
            translateY = startPanY + (midY - initialMidY);
            scheduleTransform();
        } else if (isPanning && e.touches.length === 1 && currentScale > 1.05) {
            if (e.cancelable) e.preventDefault();
            const t1 = e.touches[0];
            translateX = startPanX + (t1.clientX - initialMidX);
            translateY = startPanY + (t1.clientY - initialMidY);
            scheduleTransform();
        }
    }, { passive: false });

    const endTouchHandler = (e) => {
        if (e.touches.length < 2) {
            isPinching = false;
            // Lepaskan pelindung tengah agar tombol Play/Pause/Suara video bisa disentuh 1 jari
            if (pinchShield) pinchShield.classList.add('hidden');
        }
        if (e.touches.length === 0) {
            isPanning = false;
            if (currentScale < 0.92) {
                currentScale = 1;
                translateX = 0;
                translateY = 0;
                scheduleTransform();
            }
        }
    };

    stageWrapperEl.addEventListener('touchend', endTouchHandler, { passive: true });
    stageWrapperEl.addEventListener('touchcancel', endTouchHandler, { passive: true });

    // Dukungan Wheel Zoom di Desktop/Trackpad
    stageWrapperEl.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.14 : -0.14;
        currentScale = clampScale(currentScale + delta);
        if (Math.abs(currentScale - 1) < 0.05) {
            currentScale = 1;
            translateX = 0;
            translateY = 0;
        }
        scheduleTransform();
    }, { passive: false });
}

export function tutupPanelMediaMengambang() {
    if (typeof document === 'undefined') return;
    const viewerEl = document.getElementById('bgn-floating-media-viewer');
    const panelEl = document.getElementById('bgn-floating-pinch-panel');
    const contentEl = document.getElementById('bgn-floating-media-content');
    const pinchShield = document.getElementById('bgn-floating-pinch-shield');

    if (panelEl) {
        hancurkanIframeDiKontainer(panelEl);
    }
    if (contentEl) {
        contentEl.innerHTML = '';
    }
    if (pinchShield) {
        pinchShield.classList.add('hidden');
    }
    if (typeof floatingMediaState.resetTransformFn === 'function') {
        floatingMediaState.resetTransformFn();
    }
    if (viewerEl) {
        viewerEl.classList.add('hidden');
    }
    floatingMediaState.unit = null;
    floatingMediaState.mediaItems = [];
}
window.tutupPanelMediaMengambang = tutupPanelMediaMengambang;

async function renderSlotDiPanelMengambang(slotIdx) {
    const viewerEl = document.getElementById('bgn-floating-media-viewer');
    const panelEl = document.getElementById('bgn-floating-pinch-panel');
    const contentEl = document.getElementById('bgn-floating-media-content');
    const switcherEl = document.getElementById('floatingMediaSlotSwitcher');
    if (!viewerEl || !panelEl || !contentEl) return;

    const items = floatingMediaState.mediaItems;
    const item = items[slotIdx] || items[0];
    if (!item) return;

    floatingMediaState.activeSlotIdx = slotIdx;

    // Bersihkan semua iframe video lain di seluruh aplikasi (Single-Active-Iframe)
    hancurkanSemuaIframeVideoAktif();
    contentEl.innerHTML = '';

    if (typeof floatingMediaState.resetTransformFn === 'function') {
        floatingMediaState.resetTransformFn();
    }

    if ( switcherEl ) {
        switcherEl.querySelectorAll('[data-floating-slot-idx]').forEach((btn) => {
            const idx = parseInt(btn.getAttribute('data-floating-slot-idx') || '0', 10);
            btn.classList.toggle('active', idx === slotIdx);
        });
    }

    if (item.type === 'V') {
        panelEl.classList.add('is-video-mode');
        panelEl.classList.remove('is-photo-mode');

        const loadingBox = document.createElement('div');
        loadingBox.className = 'w-full h-full flex flex-col items-center justify-center gap-2 text-[#c5a880] text-xs font-bold bg-black';
        loadingBox.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-lg"></i><span>Memuat Video...</span>';
        contentEl.appendChild(loadingBox);

        let targetEmbedUrl = item.embedUrl;
        if (item.platform === 'tiktok' && !item.videoId) {
            const oem = await tarikOembedSosmedPublik(item.url);
            if (oem && oem.videoId) {
                item.videoId = oem.videoId;
                targetEmbedUrl = `https://www.tiktok.com/player/v1/${oem.videoId}?music_info=0&description=0&rel=0&native_context_menu=0&autoplay=1`;
                item.embedUrl = targetEmbedUrl;
            }
        }

        // Pastikan viewer masih terbuka
        if (viewerEl.classList.contains('hidden') || floatingMediaState.activeSlotIdx !== slotIdx) {
            return;
        }

        contentEl.innerHTML = '';

        const iframeWrap = document.createElement('div');
        iframeWrap.className = 'bgn-active-iframe-wrap relative w-full h-full bg-black overflow-hidden';
        iframeWrap.oncontextmenu = () => false;
        iframeWrap.ondragstart = () => false;

        if (/\.(?:mp4|webm|mov|m4v)(?:[?#].*)?$/i.test(targetEmbedUrl)) {
            const vidEl = document.createElement('video');
            vidEl.src = targetEmbedUrl;
            vidEl.controls = true;
            vidEl.autoplay = true;
            vidEl.playsInline = true;
            vidEl.setAttribute('controlsList', 'nodownload');
            vidEl.className = 'w-full h-full object-contain bg-black';
            vidEl.oncontextmenu = () => false;
            iframeWrap.appendChild(vidEl);
        } else {
            const ifr = document.createElement('iframe');
            ifr.src = targetEmbedUrl;
            ifr.className = 'w-full h-full border-0 bg-black';
            ifr.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture');
            ifr.setAttribute('referrerpolicy', 'no-referrer');
            if (item.platform === 'youtube' || item.platform === 'gdrive') {
                ifr.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
            }
            iframeWrap.appendChild(ifr);
        }

        // Perisai Anti-Download & Anti-Keluar Aplikasi (.inapp-video-shield)
        const topShield = document.createElement('div');
        topShield.className = 'inapp-video-shield inapp-shield-top';
        topShield.oncontextmenu = () => false;
        topShield.addEventListener('click', (e) => e.stopPropagation());

        const cornerShield = document.createElement('div');
        cornerShield.className = 'inapp-video-shield inapp-shield-corner';
        cornerShield.oncontextmenu = () => false;
        cornerShield.addEventListener('click', (e) => e.stopPropagation());

        iframeWrap.appendChild(topShield);
        iframeWrap.appendChild(cornerShield);
        contentEl.appendChild(iframeWrap);
    } else {
        panelEl.classList.add('is-photo-mode');
        panelEl.classList.remove('is-video-mode');

        const photoWrap = document.createElement('div');
        photoWrap.className = 'protected-photo-container relative w-full h-full flex items-center justify-center bg-black';
        photoWrap.oncontextmenu = () => false;

        const imgEl = document.createElement('img');
        imgEl.className = 'protected-photo-img w-full h-full object-contain';
        imgEl.alt = (floatingMediaState.unit && floatingMediaState.unit.fullDisplayName) || 'Foto Armada';
        pasangPerisaiGambar(imgEl, item.thumbUrl || item.url, DEFAULT_CAR_PHOTO_SVG);

        const armor = document.createElement('div');
        armor.className = 'photo-armor-shield';
        armor.oncontextmenu = () => false;

        photoWrap.appendChild(imgEl);
        photoWrap.appendChild(armor);
        contentEl.appendChild(photoWrap);
    }
}

export function bukaPanelMediaMengambang(unit, initialSlotIdx = 0) {
    if (typeof document === 'undefined' || !unit) return;

    const viewerEl = document.getElementById('bgn-floating-media-viewer');
    const stageWrapperEl = document.getElementById('bgn-floating-stage-wrapper');
    const panelEl = document.getElementById('bgn-floating-pinch-panel');
    const switcherEl = document.getElementById('floatingMediaSlotSwitcher');
    const btnClose = document.getElementById('btnCloseFloatingMedia');

    if (!viewerEl || !stageWrapperEl || !panelEl) return;

    const mediaItems = Array.isArray(unit.mediaItems) && unit.mediaItems.length > 0
        ? unit.mediaItems.slice(0, 3)
        : [{
            index: 0,
            type: 'I',
            url: unit.photoUrl || DEFAULT_CAR_PHOTO_SVG,
            platform: 'web',
            platformLabel: 'Foto Armada',
            thumbUrl: unit.photoUrl || DEFAULT_CAR_PHOTO_SVG,
            embedUrl: '',
            videoId: ''
        }];

    floatingMediaState.unit = unit;
    floatingMediaState.mediaItems = mediaItems;
    floatingMediaState.activeSlotIdx = Math.min(Math.max(0, initialSlotIdx), mediaItems.length - 1);

    // Pasang mesin gestur cubitan jari (Pinch-to-Zoom & Pan)
    pasangGesturCubitanJariMedia(panelEl, stageWrapperEl);

    if (btnClose && !btnClose.dataset.boundClose) {
        btnClose.dataset.boundClose = '1';
        btnClose.addEventListener('click', (e) => {
            e.stopPropagation();
            picuGetarPublik(12);
            tutupPanelMediaMengambang();
        });
    }

    if (!viewerEl.dataset.boundBackdrop) {
        viewerEl.dataset.boundBackdrop = '1';
        viewerEl.addEventListener('click', (e) => {
            if (e.target === viewerEl || e.target === stageWrapperEl) {
                picuGetarPublik(10);
                tutupPanelMediaMengambang();
            }
        });
    }

    // Render pil pindah cepat Foto 1 | Foto 2 | Video jika unit memiliki > 1 media
    if (switcherEl) {
        switcherEl.innerHTML = '';
        if (mediaItems.length > 1) {
            switcherEl.classList.remove('hidden');
            let pCount = 0;
            mediaItems.forEach((m, idx) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `floating-media-pill ${idx === floatingMediaState.activeSlotIdx ? 'active' : ''}`;
                btn.setAttribute('data-floating-slot-idx', String(idx));
                if (m.type === 'V') {
                    btn.innerHTML = `<span>🎬 Video</span>`;
                } else {
                    pCount++;
                    btn.innerHTML = `<span>📷 Foto ${pCount}</span>`;
                }
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    picuGetarPublik(10);
                    renderSlotDiPanelMengambang(idx);
                });
                switcherEl.appendChild(btn);
            });
        } else {
            switcherEl.classList.add('hidden');
        }
    }

    viewerEl.classList.remove('hidden');
    renderSlotDiPanelMengambang(floatingMediaState.activeSlotIdx);
}
window.bukaPanelMediaMengambang = bukaPanelMediaMengambang;

// Render Panggung Galeri Showroom (.bgn-media-stage-box + .bgn-media-slot-switcher)
// Maksimal 2 Foto + 1 Video Opsional; mengetuk Putar Video atau Perbesar Foto membuka #bgn-floating-media-viewer!
export function renderPanggungMediaShowroom(stageBoxEl, switcherEl, unit, noteBoxEl = null, noteTextEl = null) {
    if (!stageBoxEl || !unit) return;

    const mediaItems = Array.isArray(unit.mediaItems) && unit.mediaItems.length > 0
        ? unit.mediaItems.slice(0, 3)
        : [{
            index: 0,
            type: 'I',
            url: unit.photoUrl || DEFAULT_CAR_PHOTO_SVG,
            platform: 'web',
            platformLabel: 'Foto Armada',
            thumbUrl: unit.photoUrl || DEFAULT_CAR_PHOTO_SVG,
            embedUrl: '',
            videoId: ''
        }];

    let activeSlotIdx = 0;

    function renderActiveSlot(slotIndex) {
        activeSlotIdx = slotIndex;
        const item = mediaItems[slotIndex] || mediaItems[0];

        hancurkanIframeDiKontainer(stageBoxEl);

        let mediaContentLayer = stageBoxEl.querySelector('.bgn-stage-media-layer');
        if (!mediaContentLayer) {
            mediaContentLayer = document.createElement('div');
            mediaContentLayer.className = 'bgn-stage-media-layer absolute inset-0 w-full h-full';
            stageBoxEl.insertBefore(mediaContentLayer, stageBoxEl.firstChild);
        }
        mediaContentLayer.innerHTML = '';

        if (item.type === 'V') {
            // Tampilkan Pratinjau Sampul Video yang bersih & ringan; klik membuka Panel Media Mengambang (#bgn-floating-media-viewer)
            const coverLayer = document.createElement('div');
            coverLayer.className = 'bgn-video-cover-layer relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none cursor-pointer';
            coverLayer.oncontextmenu = () => false;

            const bgImg = document.createElement('img');
            bgImg.className = 'protected-photo-img absolute inset-0 w-full h-full object-cover opacity-60';
            pasangPerisaiGambar(
                bgImg,
                item.thumbUrl && item.thumbUrl !== DEFAULT_VIDEO_COVER_SVG ? item.thumbUrl : (unit.photoRaw || DEFAULT_VIDEO_COVER_SVG),
                DEFAULT_VIDEO_COVER_SVG
            );

            const shade = document.createElement('div');
            shade.className = 'absolute inset-0 bg-gradient-to-t from-[#050914]/90 via-[#070d1f]/50 to-[#050914]/70';

            const centerWrap = document.createElement('div');
            centerWrap.className = 'relative z-20 flex flex-col items-center text-center px-3';
            centerWrap.innerHTML = `
                <span class="text-[0.55rem] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-black/80 text-[#c5a880] border border-[#c5a880]/50 mb-2">
                    🎬 ${item.platformLabel}
                </span>
                <button type="button" class="btn-play-inapp-video px-4 py-2 rounded-full font-display font-extrabold text-xs text-[#030712] shadow-xl flex items-center gap-2 cursor-pointer transition-transform active:scale-95" style="background: linear-gradient(135deg, #f3e5ab 0%, #c5a880 55%, #a37c40 100%);">
                    <i class="fa-solid fa-play text-[0.68rem]"></i>
                    <span>▶ Putar Video Review</span>
                </button>
                <span class="text-[0.54rem] text-slate-200 font-semibold mt-1.5 drop-shadow">Buka di panel mengambang • Bisa cubit 2 jari (Zoom)</span>
            `;

            coverLayer.appendChild(bgImg);
            coverLayer.appendChild(shade);
            coverLayer.appendChild(centerWrap);
            mediaContentLayer.appendChild(coverLayer);

            // Jika TikTok/Sosmed, tarik thumbnail & caption via oEmbed secara asinkron ringan
            if (['tiktok', 'youtube', 'instagram'].includes(item.platform) && item.url) {
                tarikOembedSosmedPublik(item.url).then((oem) => {
                    if (oem && oem.ok) {
                        if (oem.thumbnailUrl) {
                            item.thumbUrl = oem.thumbnailUrl;
                            if (bgImg && bgImg.isConnected) {
                                pasangPerisaiGambar(bgImg, oem.thumbnailUrl, DEFAULT_VIDEO_COVER_SVG);
                            }
                        }
                        if (oem.videoId && item.platform === 'tiktok') {
                            item.videoId = oem.videoId;
                            item.embedUrl = `https://www.tiktok.com/player/v1/${oem.videoId}?music_info=0&description=0&rel=0&native_context_menu=0&autoplay=1`;
                        }
                        if (oem.title && noteBoxEl && noteTextEl) {
                            const existingNote = String(unit.unitNote || '').trim();
                            if (!existingNote) {
                                unit.unitNote = oem.title.substring(0, 480);
                                noteTextEl.textContent = unit.unitNote;
                                noteBoxEl.classList.remove('hidden');
                            }
                        }
                    }
                }).catch(() => {});
            }

            const openFloatingVideo = (ev) => {
                ev.stopPropagation();
                picuGetarPublik(14);
                bukaPanelMediaMengambang(unit, activeSlotIdx);
            };

            coverLayer.addEventListener('click', openFloatingVideo);
            const btnPlay = centerWrap.querySelector('.btn-play-inapp-video');
            if (btnPlay) {
                btnPlay.addEventListener('click', openFloatingVideo);
            }
        } else {
            // Slot bertipe Foto ('I') + tombol mengambang "🔍 Perbesar Foto / Video"
            const photoStageWrap = document.createElement('div');
            photoStageWrap.className = 'relative w-full h-full cursor-pointer select-none';
            photoStageWrap.oncontextmenu = () => false;

            const imgEl = document.createElement('img');
            imgEl.className = 'protected-photo-img w-full h-full object-cover';
            imgEl.alt = unit.fullDisplayName || 'Foto Armada';
            pasangPerisaiGambar(imgEl, item.thumbUrl || item.url, DEFAULT_CAR_PHOTO_SVG);

            const armor = document.createElement('div');
            armor.className = 'photo-armor-shield';
            armor.oncontextmenu = () => false;

            const btnZoomPhoto = document.createElement('button');
            btnZoomPhoto.type = 'button';
            btnZoomPhoto.className = 'btn-open-floating-zoom absolute bottom-2 right-2 z-20 px-2.5 py-1 rounded-lg bg-black/80 border border-[#c5a880]/55 text-[#c5a880] text-[0.56rem] font-extrabold uppercase tracking-wider flex items-center gap-1 cursor-pointer shadow-lg';
            btnZoomPhoto.innerHTML = '<i class="fa-solid fa-magnifying-glass-plus"></i><span>🔍 Perbesar Foto / Video</span>';

            const openFloatingPhoto = (ev) => {
                ev.stopPropagation();
                picuGetarPublik(12);
                bukaPanelMediaMengambang(unit, activeSlotIdx);
            };

            photoStageWrap.addEventListener('click', openFloatingPhoto);
            btnZoomPhoto.addEventListener('click', openFloatingPhoto);

            photoStageWrap.appendChild(imgEl);
            photoStageWrap.appendChild(armor);
            photoStageWrap.appendChild(btnZoomPhoto);
            mediaContentLayer.appendChild(photoStageWrap);
        }

        if (switcherEl) {
            switcherEl.querySelectorAll('[data-media-slot-idx]').forEach((btn) => {
                const idx = parseInt(btn.getAttribute('data-media-slot-idx'), 10);
                btn.classList.toggle('active', idx === activeSlotIdx);
            });
        }
    }

    // Render Baris Pil Pemilih Media (Maksimal 2 Foto + 1 Video Opsional)
    if (switcherEl) {
        switcherEl.innerHTML = '';
        if (mediaItems.length > 1) {
            switcherEl.classList.remove('hidden');
            let photoCounter = 0;
            let videoCounter = 0;
            mediaItems.forEach((m, idx) => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = `bgn-media-slot-pill ${idx === 0 ? 'active' : ''}`;
                btn.setAttribute('data-media-slot-idx', String(idx));

                if (m.type === 'V') {
                    videoCounter++;
                    const shortPlat = m.platform === 'tiktok'
                        ? 'TikTok'
                        : (m.platform === 'instagram'
                            ? 'IG'
                            : (m.platform === 'youtube'
                                ? 'YouTube'
                                : (m.platform === 'facebook' ? 'FB' : `Video ${videoCounter}`)));
                    btn.innerHTML = `<span>🎬 Video ${shortPlat}</span>`;
                } else {
                    photoCounter++;
                    btn.innerHTML = `<span>📷 Foto ${photoCounter}</span>`;
                }

                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    picuGetarPublik(10);
                    renderActiveSlot(idx);
                    if (m.type === 'V') {
                        bukaPanelMediaMengambang(unit, idx);
                    }
                });
                switcherEl.appendChild(btn);
            });
        } else {
            switcherEl.classList.add('hidden');
        }
    }

    renderActiveSlot(0);
}

// ==========================================================================
// 4. KALKULASI JARAK LOKAL & EKSTRAKTOR KOORDINAT PETA
// ==========================================================================
export function hitungJarakJalanKm(lat1, lon1, lat2, lon2) {
    const nLat1 = Number(lat1);
    const nLon1 = Number(lon1);
    const nLat2 = Number(lat2);
    const nLon2 = Number(lon2);

    if (
        !Number.isFinite(nLat1) ||
        !Number.isFinite(nLon1) ||
        !Number.isFinite(nLat2) ||
        !Number.isFinite(nLon2)
    ) {
        return NaN;
    }

    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(nLat2 - nLat1);
    const dLon = toRad(nLon2 - nLon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(nLat1)) * Math.cos(toRad(nLat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const straightKm = R * c;
    const roadKm = straightKm * ROAD_CORRECTION_FACTOR;
    return Number(roadKm.toFixed(1));
}

function ekstrakKoordinatDariUrlGmaps(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    const text = decodeURIComponent(rawUrl.trim());
    const valid = (lt, ln) => Number.isFinite(lt) && Number.isFinite(ln) && lt >= -11 && lt <= 6 && ln >= 95 && ln <= 141;

    const m1 = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i);
    if (m1) {
        const lt = parseFloat(m1[1]);
        const ln = parseFloat(m1[2]);
        if (valid(lt, ln)) return { lt, ln };
    }
    const m2 = text.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i);
    if (m2) {
        const lt = parseFloat(m2[1]);
        const ln = parseFloat(m2[2]);
        if (valid(lt, ln)) return { lt, ln };
    }
    const m3 = text.match(/(?:[?&](?:q|ll|query|center|destination)=)(-?\d+(?:\.\d+)?)[,\s+]+(-?\d+(?:\.\d+)?)/i);
    if (m3) {
        const lt = parseFloat(m3[1]);
        const ln = parseFloat(m3[2]);
        if (valid(lt, ln)) return { lt, ln };
    }
    const m4 = text.match(/(-?\d{1,2}\.\d{3,})\s*[,;/\s]\s*(\d{2,3}\.\d{3,})/);
    if (m4) {
        const lt = parseFloat(m4[1]);
        const ln = parseFloat(m4[2]);
        if (valid(lt, ln)) return { lt, ln };
    }
    return null;
}

// ==========================================================================
// 5. GERBANG IZIN LOKASI PERANGKAT (#gps-mandatory-lock-overlay)
// ==========================================================================
export function bacaSharedGpsSuperApp() {
    const stores = [];
    try { if (typeof globalThis !== 'undefined' && globalThis.sessionStorage) stores.push(globalThis.sessionStorage); } catch (e) {}
    try { if (typeof sessionStorage !== 'undefined') stores.push(sessionStorage); } catch (e) {}
    try { if (typeof localStorage !== 'undefined') stores.push(localStorage); } catch (e) {}

    for (let i = 0; i < stores.length; i++) {
        try {
            const raw = stores[i].getItem(SHARED_GPS_STORAGE_KEY);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            const lat = Number(parsed?.lat);
            const lng = Number(parsed?.lng);
            const ts = Number(parsed?.ts || 0);
            if (Number.isFinite(lat) && Number.isFinite(lng) && (Date.now() - ts < SHARED_GPS_MAX_AGE_MS)) {
                return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), ts };
            }
        } catch (e) {}
    }
    return null;
}

export function simpanSharedGpsSuperApp(lat, lng, silentBridge = false) {
    const nLat = Number(Number(lat).toFixed(6));
    const nLng = Number(Number(lng).toFixed(6));
    if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return null;
    const nowTs = Date.now();
    const coordObj = { lat: nLat, lng: nLng, ts: nowTs };
    currentUserGps = coordObj;
    const payload = JSON.stringify(coordObj);
    try { if (typeof globalThis !== 'undefined' && globalThis.sessionStorage) globalThis.sessionStorage.setItem(SHARED_GPS_STORAGE_KEY, payload); } catch (e) {}
    try { sessionStorage.setItem(SHARED_GPS_STORAGE_KEY, payload); } catch (e) {}
    try { localStorage.setItem('bgt_last_gps_coord_v11', payload); } catch (e) {}

    const overlay = typeof document !== 'undefined' ? document.getElementById('gps-mandatory-lock-overlay') : null;
    const headerBadge = typeof document !== 'undefined' ? document.getElementById('headerGpsCoordBadge') : null;
    if (overlay) overlay.classList.add('hidden');
    if (headerBadge) {
        headerBadge.innerHTML = '<span class="live-pulse-dot"></span><span>Lokasi Aktif</span>';
    }

    if (!silentBridge) {
        try {
            const realTop = (typeof globalThis !== 'undefined' && globalThis.parent) ? globalThis.parent : null;
            if (realTop && realTop !== globalThis && typeof realTop.postMessage === 'function') {
                realTop.postMessage({
                    type: 'BGN_BRIDGE_GPS_SYNC',
                    sourceModule: 'rental-mobil',
                    lat: nLat,
                    lng: nLng,
                    ts: nowTs
                }, '*');
            }
        } catch (e) {}
    }
    return coordObj;
}

export function dapatkanTitikGpsPenggunaAktif() {
    if (!currentUserGps) {
        const shared = bacaSharedGpsSuperApp();
        if (shared) currentUserGps = shared;
    }
    return currentUserGps;
}

export function kunciLokasiGpsWajib(forceHardwareRefresh = false) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('gps-mandatory-lock-overlay');
        const statusBox = document.getElementById('gpsLockStatusBox');
        const statusText = document.getElementById('gpsLockStatusText');
        const btnRetry = document.getElementById('btnRetryGpsLock');
        const headerBadge = document.getElementById('headerGpsCoordBadge');

        if (!forceHardwareRefresh) {
            const shared = bacaSharedGpsSuperApp();
            if (shared) {
                currentUserGps = shared;
                if (headerBadge) {
                    headerBadge.innerHTML = '<span class="live-pulse-dot"></span><span>Lokasi Aktif</span>';
                }
                if (overlay) {
                    overlay.classList.add('hidden');
                }
                resolve(currentUserGps);
                return;
            }
        }

        if (overlay) overlay.classList.remove('hidden');

        if (!navigator.geolocation) {
            if (statusBox) {
                statusBox.className = 'w-full rounded-xl px-3 py-2 mb-3.5 bg-red-500/15 border border-red-500/45 text-red-400 text-[0.68rem] font-bold flex items-center justify-center gap-2';
            }
            if (statusText) {
                statusText.textContent = 'Browser perangkat ini tidak mendukung layanan lokasi.';
            }
            resolve(null);
            return;
        }

        if (statusBox) {
            statusBox.className = 'w-full rounded-xl px-3 py-2 mb-3.5 bg-amber-500/15 border border-amber-500/40 text-amber-400 text-[0.68rem] font-bold flex items-center justify-center gap-2';
        }
        if (statusText) {
            statusText.textContent = 'Mendeteksi lokasi perangkat Anda...';
        }
        if (btnRetry) {
            btnRetry.disabled = true;
            btnRetry.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i><span>Mendeteksi Lokasi...</span>';
        }

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const userLat = Number(pos.coords.latitude.toFixed(6));
                const userLng = Number(pos.coords.longitude.toFixed(6));
                simpanSharedGpsSuperApp(userLat, userLng, false);

                if (btnRetry) {
                    btnRetry.disabled = false;
                    btnRetry.innerHTML = '<i class="fa-solid fa-location-dot"></i><span>Periksa Ulang Lokasi</span>';
                }
                resolve(currentUserGps);
            },
            (err) => {
                currentUserGps = null;
                if (overlay) {
                    overlay.classList.remove('hidden');
                }
                if (statusBox) {
                    statusBox.className = 'w-full rounded-xl px-3 py-2 mb-3.5 bg-red-500/15 border border-red-500/45 text-red-400 text-[0.68rem] font-bold flex items-center justify-center gap-2';
                }
                if (statusText) {
                    if (err && err.code === 1) {
                        statusText.textContent = 'Izin akses lokasi belum diberikan. Izinkan lokasi di browser lalu ketuk tombol di bawah.';
                    } else if (err && err.code === 2) {
                        statusText.textContent = 'Fitur lokasi perangkat belum aktif. Nyalakan lokasi di pengaturan perangkat Anda.';
                    } else {
                        statusText.textContent = 'Waktu deteksi lokasi habis. Pastikan lokasi aktif lalu periksa ulang.';
                    }
                }
                if (btnRetry) {
                    btnRetry.disabled = false;
                    btnRetry.innerHTML = '<i class="fa-solid fa-location-dot"></i><span>Periksa Ulang Lokasi</span>';
                }
                resolve(null);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 30000
            }
        );
    });
}

// ==========================================================================
// 6. PENYIMPANAN CACHE INDEXEDDB SKALA 100.000+ UNIT (bgn_rental_idb_v5)
//    + FALLBACK LOCALSTORAGE + COOLDOWN ETAG 60 DETIK
// ==========================================================================
function bukaDatabaseIndexedDBPublik() {
    return new Promise((resolve) => {
        try {
            if (typeof indexedDB === 'undefined' || !indexedDB) {
                resolve(null);
                return;
            }
            const req = indexedDB.open(IDB_DB_NAME, 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
                    db.createObjectStore(IDB_STORE_NAME);
                }
            };
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = () => resolve(null);
        } catch (err) {
            resolve(null);
        }
    });
}

async function bacaCacheEtagKatalog() {
    if (inMemoryCatalogCache && inMemoryCatalogCache.rawCatalog) {
        return inMemoryCatalogCache;
    }

    try {
        const db = await bukaDatabaseIndexedDBPublik();
        if (db) {
            const record = await new Promise((resolve) => {
                try {
                    const tx = db.transaction(IDB_STORE_NAME, 'readonly');
                    const store = tx.objectStore(IDB_STORE_NAME);
                    const getReq = store.get(IDB_CACHE_RECORD_KEY);
                    getReq.onsuccess = () => resolve(getReq.result || null);
                    getReq.onerror = () => resolve(null);
                } catch (e) {
                    resolve(null);
                }
            });
            if (record && record.rawCatalog && typeof record.rawCatalog === 'object') {
                inMemoryCatalogCache = record;
                return record;
            }
        }
    } catch (e) {}

    try {
        const raw = localStorage.getItem(ETAG_CACHE_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.rawCatalog && typeof parsed.rawCatalog === 'object') {
                inMemoryCatalogCache = parsed;
                return parsed;
            }
        }
    } catch (e) {}

    return null;
}

async function simpanCacheEtagKatalog(etag, rawCatalog) {
    const payload = {
        etag: String(etag || ''),
        rawCatalog: rawCatalog || {},
        ts: Date.now()
    };
    inMemoryCatalogCache = payload;

    try {
        const db = await bukaDatabaseIndexedDBPublik();
        if (db) {
            await new Promise((resolve) => {
                try {
                    const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
                    const store = tx.objectStore(IDB_STORE_NAME);
                    store.put(payload, IDB_CACHE_RECORD_KEY);
                    tx.oncomplete = () => resolve(true);
                    tx.onerror = () => resolve(false);
                } catch (e) {
                    resolve(false);
                }
            });
        }
    } catch (e) {}

    try {
        localStorage.setItem(ETAG_CACHE_STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
        // Jika katalog sangat besar (>5MB), IndexedDB sudah menyimpannya dengan aman tanpa QuotaExceededError
    }
}

export function bersihkanCacheEtagKatalogLokal() {
    inMemoryCatalogCache = null;
    lastSuccessfulSyncTs = 0;
    try {
        localStorage.removeItem(ETAG_CACHE_STORAGE_KEY);
    } catch (e) {}
    try {
        bukaDatabaseIndexedDBPublik().then((db) => {
            if (!db) return;
            const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
            tx.objectStore(IDB_STORE_NAME).delete(IDB_CACHE_RECORD_KEY);
        }).catch(() => {});
    } catch (e) {}
}

async function fetchJsonWithTimeout(url, headers = {}, timeoutMs = 6500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            method: 'GET',
            headers,
            signal: controller.signal,
            cache: 'no-store'
        });
        return res;
    } finally {
        clearTimeout(timer);
    }
}

// ==========================================================================
// 7. DEKOMPRESI MAKS 2 FOTO + 1 VIDEO OPSIONAL (`ekstrakDataUnitHibridaPublik`)
//    & PRIVASI PLAT NOMOR INTERNAL (`pl` TIDAK DITAMPILKAN KE PUBLIK)
// ==========================================================================
export function ekstrakDataUnitHibridaPublik(rawUnit) {
    const u = (rawUnit && typeof rawUnit === 'object') ? rawUnit : {};

    let parsedP6 = u.p6 !== undefined ? Number(u.p6) : undefined;
    let parsedPm = u.pm !== undefined ? Number(u.pm) : undefined;
    let parsedH24 = u.h24 !== undefined ? Number(u.h24) : undefined;
    let parsedLka = u.lka !== undefined ? Number(u.lka) : undefined;
    const bgtPhotos = [];
    let bgtVideo = '';
    let extraNoteTail = '';

    const rawImgStr = String(u.img || '').trim();
    const primaryCoverRaw = rawImgStr.split('||BGT2|')[0].trim();

    if (rawImgStr.includes('||BGT2|')) {
        const afterMarker = rawImgStr.split('||BGT2|')[1] || '';
        const parts = afterMarker.split('|');
        const metaPart = parts[0] || '';
        const slotsPart = parts[1] || '';
        extraNoteTail = parts.slice(2).join('|');

        const metaTokens = metaPart.split(',');
        const mP6 = Number(metaTokens[0]);
        const mPm = Number(metaTokens[1]);
        const mH24 = Number(metaTokens[2]);
        const mLka = Number(metaTokens[3]);

        if (parsedP6 === undefined && Number.isFinite(mP6)) parsedP6 = mP6;
        if (parsedPm === undefined && Number.isFinite(mPm)) parsedPm = mPm;
        if (parsedH24 === undefined && (mH24 === 0 || mH24 === 1)) parsedH24 = mH24;
        if (parsedLka === undefined && (mLka === 0 || mLka === 1)) parsedLka = mLka;

        if (slotsPart) {
            slotsPart.split('^').forEach((itemStr) => {
                const [tCode, tok] = itemStr.split('~');
                if (tok) {
                    const exp = ekspansiTokenMediaPendekPublik(tok);
                    const finalType = tCode === 'V' ? 'V' : (tCode === 'I' ? 'I' : (exp.typeHint || 'I'));
                    if (finalType === 'V') {
                        if (!bgtVideo) bgtVideo = exp.url;
                    } else if (bgtPhotos.length < 2) {
                        bgtPhotos.push(exp.url);
                    }
                }
            });
        }
    }

    // Kompatibilitas mundur penuh untuk format md lama
    if (typeof u.md === 'string' && u.md.trim() !== '') {
        try {
            const mdArr = JSON.parse(u.md);
            if (Array.isArray(mdArr)) {
                mdArr.forEach((m) => {
                    if (!m || typeof m.u !== 'string' || !m.u.trim()) return;
                    const exp = ekspansiTokenMediaPendekPublik(m.u.trim());
                    if (m.t === 'V') {
                        if (!bgtVideo) bgtVideo = exp.url;
                    } else if (bgtPhotos.length < 2) {
                        bgtPhotos.push(exp.url);
                    }
                });
            }
        } catch (e) {}
    }

    // Baca field langsung img (Foto 1), i2 (Foto 2), dan vd (Video Opsional)
    const directImg1 = primaryCoverRaw ? ekspansiTokenMediaPendekPublik(primaryCoverRaw).url : '';
    const directImg2 = u.i2 ? ekspansiTokenMediaPendekPublik(u.i2).url : '';
    const directVd = u.vd ? ekspansiTokenMediaPendekPublik(u.vd).url : '';

    const finalPhotos = [];
    if (directImg1) finalPhotos.push(directImg1);
    if (directImg2 && !finalPhotos.includes(directImg2) && finalPhotos.length < 2) {
        finalPhotos.push(directImg2);
    }
    bgtPhotos.forEach((pUrl) => {
        if (pUrl && !finalPhotos.includes(pUrl) && finalPhotos.length < 2) {
            finalPhotos.push(pUrl);
        }
    });

    const finalVideoUrl = directVd || bgtVideo || '';

    // Batasi ketat: maksimal 2 item Foto ('I') + 1 item Video ('V') = maks 3 slot media
    const rawMediaSlots = [];
    finalPhotos.slice(0, 2).forEach((pUrl) => {
        rawMediaSlots.push({ t: 'I', u: pUrl });
    });
    if (finalVideoUrl) {
        rawMediaSlots.push({ t: 'V', u: finalVideoUrl });
    }

    const mediaItems = rawMediaSlots
        .map((m, idx) => deteksiTipeDanPlatformMediaPublik(m.u, m.t, idx))
        .filter((item) => item.url !== '');

    let fullNote = String(u.nt || '').trim();
    if (extraNoteTail && fullNote.length <= 60 && !fullNote.endsWith(extraNoteTail)) {
        fullNote = (fullNote + extraNoteTail).trim();
    }

    return {
        rawP6: Math.max(0, Number(parsedP6 || 0)),
        rawP12: Math.max(0, Number(u.p12 || 0)),
        rawP24: Math.max(0, Number(u.p24 || 0)),
        rawPw: Math.max(0, Number(u.pw || 0)),
        rawPm: Math.max(0, Number(parsedPm || 0)),
        h24: parsedH24 === 0 ? 0 : 1,
        lka: parsedLka === 0 ? 0 : 1,
        rawDrv: Math.max(0, Number(u.drv || 0)),
        rawLk: Math.max(0, Number(u.lk || 0)),
        primaryCoverRaw,
        mediaItems,
        fullNote: fullNote.substring(0, 600)
    };
}

export function dekompresiDanSaringKatalog(rawCatalogObj, userCoords = currentUserGps) {
    const dict = ambilKamusKendaraanLokal();
    const modelsMap = dict.models || {};
    const fuelsMap = dict.fuels || {};
    const serviceMap = dict.service_modes || {};
    const incMap = dict.inclusions || {};
    const reqMap = dict.requirements || {};

    const catalogRoot = (rawCatalogObj && typeof rawCatalogObj === 'object') ? rawCatalogObj : {};
    const nearbyUnits = [];
    const uncoordinatedUnits = [];
    const farawayUnits = [];

    const hasUserCoords = Boolean(userCoords && Number.isFinite(userCoords.lat) && Number.isFinite(userCoords.lng));

    Object.entries(catalogRoot).forEach(([partnerUid, garage]) => {
        if (!garage || typeof garage !== 'object') return;

        if (Number(garage.o) === 0) {
            return;
        }

        const unitsObj = (garage.u && typeof garage.u === 'object') ? garage.u : {};
        if (Object.keys(unitsObj).length === 0) {
            return;
        }

        const hasRawLat = garage.lt !== undefined && garage.lt !== null && String(garage.lt).trim() !== '';
        const hasRawLng = garage.ln !== undefined && garage.ln !== null && String(garage.ln).trim() !== '';
        let gLat = hasRawLat ? Number(garage.lt) : NaN;
        let gLng = hasRawLng ? Number(garage.ln) : NaN;
        if (!Number.isFinite(gLat) || !Number.isFinite(gLng)) {
            const fallbackCoord = ekstrakKoordinatDariUrlGmaps(garage.gm);
            if (fallbackCoord) {
                gLat = fallbackCoord.lt;
                gLng = fallbackCoord.ln;
            }
        }

        const hasValidGarageCoords = (
            Number.isFinite(gLat) &&
            Number.isFinite(gLng) &&
            gLat >= -11 &&
            gLat <= 6 &&
            gLng >= 95 &&
            gLng <= 141
        );

        let distanceKm = NaN;
        if (hasValidGarageCoords && hasUserCoords) {
            distanceKm = hitungJarakJalanKm(userCoords.lat, userCoords.lng, gLat, gLng);
        }

        const garageName = String(garage.n || 'Garasi Mitra Bagantara').trim();
        const garageArea = String(garage.a || 'Area Layanan').trim();
        const garageWa = String(garage.w || '').replace(/[^0-9]/g, '');
        const garageGmaps = String(
            garage.gm ||
            (hasValidGarageCoords
                ? `https://www.google.com/maps?q=${gLat},${gLng}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(garageName + ' ' + garageArea)}`)
        ).trim();
        const garageHours = String(garage.hrs || '07:00 - 22:00').trim();
        const garageQrisRaw = String(garage.qr || '').trim();
        const garageQrisUrl = konversiDriveThumbnailPublik(garageQrisRaw, 800);
        const dpType = ['0', 'P', 'F'].includes(String(garage.dpt)) ? String(garage.dpt) : '0';
        const dpValRaw = Number(garage.dpv || 0);
        const overtimePct = Number(garage.ot !== undefined ? garage.ot : 10);
        const deliveryAllowed = Number(garage.dlv !== undefined ? garage.dlv : 1) === 1;
        const deliveryFeeRupiah = Math.round(Number(garage.dlf || 0) * 1000);
        const promoText = String(garage.pr || '').trim();
        const updatedTs = Number(garage.ts || 0);

        const reqCodes = String(garage.req || 'AB').toUpperCase().split('').filter(Boolean);
        const translatedRequirements = reqCodes
            .map((code) => reqMap[code] ? { code, text: reqMap[code] } : null)
            .filter(Boolean);

        Object.entries(unitsObj).forEach(([unitId, unit]) => {
            if (!unit || typeof unit !== 'object') return;
            if (Number(unit.st) === 0) {
                return;
            }

            const hyb = ekstrakDataUnitHibridaPublik(unit);

            // Konversi 5 Paket Waktu Sewa ke Rupiah
            const price6h = hyb.rawP6 >= 20000 ? Math.round(hyb.rawP6) : Math.round(hyb.rawP6 * 1000);
            const price12h = hyb.rawP12 >= 30000 ? Math.round(hyb.rawP12) : Math.round(hyb.rawP12 * 1000);
            const raw24Rupiah = hyb.rawP24 >= 50000 ? Math.round(hyb.rawP24) : Math.round(hyb.rawP24 * 1000);
            const price24h = hyb.h24 === 0 ? 0 : raw24Rupiah;
            const priceWeekly = hyb.rawPw >= 100000 ? Math.round(hyb.rawPw) : Math.round(hyb.rawPw * 1000);
            const priceMonthly = hyb.rawPm >= 300000 ? Math.round(hyb.rawPm) : Math.round(hyb.rawPm * 1000);

            const has6h = price6h >= 20000;
            const has12h = price12h >= 30000;
            const has24h = (hyb.h24 !== 0 && price24h >= 50000);
            const hasWeekly = priceWeekly >= 100000;
            const hasMonthly = priceMonthly >= 300000;

            if (!has6h && !has12h && !has24h && !hasWeekly && !hasMonthly) {
                return;
            }

            const activePackagesList = [];
            if (has6h) {
                activePackagesList.push({ code: '6H', label: 'Paket 6 Jam', shortUnit: '/ 6 jam', price: price6h, isHighlight: false });
            }
            if (has12h) {
                activePackagesList.push({ code: '12H', label: 'Paket 12 Jam', shortUnit: '/ 12 jam', price: price12h, isHighlight: false });
            }
            if (has24h) {
                activePackagesList.push({ code: '24H', label: 'Harian (24 Jam)', shortUnit: '/ 24 jam', price: price24h, isHighlight: true });
            }
            if (hasWeekly) {
                activePackagesList.push({ code: 'WEEKLY', label: 'Mingguan (7 Hr)', shortUnit: '/ minggu', price: priceWeekly, isHighlight: false });
            }
            if (hasMonthly) {
                activePackagesList.push({ code: 'MONTHLY', label: 'Bulanan (30 Hr)', shortUnit: '/ bulan', price: priceMonthly, isHighlight: false });
            }

            let displayMainPrice = 0;
            let displayMainUnit = '/ 24 jam';
            let defaultPackageCode = '24H';
            if (has24h) {
                displayMainPrice = price24h;
                displayMainUnit = '/ 24 jam';
                defaultPackageCode = '24H';
            } else if (has12h) {
                displayMainPrice = price12h;
                displayMainUnit = '/ 12 jam';
                defaultPackageCode = '12H';
            } else if (has6h) {
                displayMainPrice = price6h;
                displayMainUnit = '/ 6 jam';
                defaultPackageCode = '6H';
            } else if (hasWeekly) {
                displayMainPrice = priceWeekly;
                displayMainUnit = '/ minggu';
                defaultPackageCode = 'WEEKLY';
            } else if (hasMonthly) {
                displayMainPrice = priceMonthly;
                displayMainUnit = '/ bulan';
                defaultPackageCode = 'MONTHLY';
            }

            const sortBasePrice = has24h
                ? price24h
                : (has12h ? price12h : (has6h ? price6h : (hasWeekly ? Math.round(priceWeekly / 7) : Math.round(priceMonthly / 30))));

            const outOfTownAllowed = (hyb.lka !== 0 && hyb.rawLk >= 0);
            const priceDriverPerDay = hyb.rawDrv >= 50000 ? Math.round(hyb.rawDrv) : Math.round(hyb.rawDrv * 1000);
            const priceOutTownPerDay = outOfTownAllowed
                ? (hyb.rawLk >= 50000 ? Math.round(hyb.rawLk) : Math.round(hyb.rawLk * 1000))
                : 0;

            const modelCode = String(unit.c || unit.m || 'T1').toUpperCase();
            const dictModel = modelsMap[modelCode] || {
                brand: 'Kendaraan',
                name: 'Armada Rental',
                cat: 'MPV',
                seats: 7
            };

            const isCustom = modelCode === 'Z9' && unit.cn && String(unit.cn).trim() !== '';
            const brandName = isCustom ? '' : (dictModel.brand || 'Kendaraan');
            const carName = isCustom ? String(unit.cn).trim() : (dictModel.name || 'Unit Rental');
            const fullDisplayName = (!brandName || brandName === 'Lainnya' || carName.toLowerCase().startsWith(brandName.toLowerCase()))
                ? carName
                : `${brandName} ${carName}`;
            const category = dictModel.cat || 'MPV';
            const friendlyCategory = labelKategoriPublikRamah(category);
            const seats = Number(dictModel.seats || 7);

            const rawYear = Number(unit.y || 23);
            const fullYear = rawYear < 100 ? (2000 + rawYear) : rawYear;

            const transCode = unit.t === 'M' ? 'M' : 'A';
            const transLabel = transCode === 'M' ? 'Manual' : 'Matic';

            const fuelCode = ['B', 'D', 'E'].includes(unit.f) ? unit.f : 'B';
            const fuelLabel = fuelsMap[fuelCode] || 'Bensin';

            const srvCode = [1, 2, 3].includes(Number(unit.s)) ? Number(unit.s) : 3;
            const srvLabel = serviceMap[String(srvCode)] || 'Lepas Kunci / Dengan Sopir';

            const incCode = ['U', 'S', 'A'].includes(unit.inc) ? unit.inc : 'U';
            const incLabel = incMap[incCode] || 'Unit Mobil Saja';

            const mediaItems = hyb.mediaItems.length > 0
                ? hyb.mediaItems.slice(0, 3)
                : [{
                    index: 0,
                    type: 'I',
                    url: DEFAULT_CAR_PHOTO_SVG,
                    platform: 'web',
                    platformLabel: 'Foto Armada',
                    thumbUrl: DEFAULT_CAR_PHOTO_SVG,
                    embedUrl: '',
                    videoId: ''
                }];

            const photoCount = mediaItems.filter((m) => m.type === 'I').length;
            const videoCount = mediaItems.filter((m) => m.type === 'V').length;
            let mediaBadgeText = '';
            if (videoCount > 0 && photoCount > 0) {
                mediaBadgeText = `🎬 Video & ${photoCount} Foto`;
            } else if (videoCount > 0) {
                mediaBadgeText = `🎬 Video Review`;
            } else if (photoCount > 1) {
                mediaBadgeText = `📷 ${photoCount} Foto`;
            }

            const firstPhotoItem = mediaItems.find((m) => m.type === 'I' && m.thumbUrl) || mediaItems[0];
            const primaryThumbUrl = (firstPhotoItem && firstPhotoItem.thumbUrl && firstPhotoItem.thumbUrl !== DEFAULT_VIDEO_COVER_SVG)
                ? firstPhotoItem.thumbUrl
                : (konversiDriveThumbnailPublik(hyb.primaryCoverRaw, 800) || DEFAULT_CAR_PHOTO_SVG);

            // Nomor plat internal mitra (pl) sengaja tidak disertakan ke unitRecord publik demi privasi
            const unitRecord = {
                compositeId: `${partnerUid}_${unitId}`,
                partnerUid,
                unitId,
                modelCode,
                brandName,
                carName,
                fullDisplayName,
                category,
                friendlyCategory,
                seats,
                year: fullYear,
                transCode,
                transLabel,
                fuelCode,
                fuelLabel,
                srvCode,
                srvLabel,
                incCode,
                incLabel,
                price6h,
                price12h,
                price24h,
                priceWeekly,
                priceMonthly,
                has6h,
                has12h,
                has24h,
                hasWeekly,
                hasMonthly,
                activePackagesList,
                displayMainPrice,
                displayMainUnit,
                defaultPackageCode,
                sortBasePrice,
                outOfTownAllowed,
                priceDriverPerDay,
                priceOutTownPerDay,
                photoRaw: hyb.primaryCoverRaw || primaryThumbUrl,
                photoUrl: primaryThumbUrl,
                mediaItems,
                photoCount,
                videoCount,
                mediaBadgeText,
                unitNote: hyb.fullNote,
                garageName,
                garageArea,
                garageWa,
                garageGmaps,
                garageLat: hasValidGarageCoords ? gLat : null,
                garageLng: hasValidGarageCoords ? gLng : null,
                distanceKm,
                isNearestGarage: false,
                garageHours,
                garageQrisUrl,
                dpType,
                dpValRaw,
                dpNominalRupiah: dpType === 'F' ? (dpValRaw >= 50000 ? Math.round(dpValRaw) : Math.round(dpValRaw * 1000)) : 0,
                dpPercent: dpType === 'P' ? Math.min(100, Math.max(0, Math.round(dpValRaw))) : 0,
                overtimePct,
                deliveryAllowed,
                deliveryFeeRupiah,
                promoText,
                requirementsList: translatedRequirements,
                updatedTs
            };

            if (Number.isFinite(distanceKm)) {
                if (distanceKm <= MAX_NEARBY_DISTANCE_KM) {
                    nearbyUnits.push(unitRecord);
                } else {
                    farawayUnits.push(unitRecord);
                }
            } else {
                uncoordinatedUnits.push(unitRecord);
            }
        });
    });

    nearbyUnits.sort((a, b) => {
        if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
        return a.sortBasePrice - b.sortBasePrice;
    });

    uncoordinatedUnits.sort((a, b) => {
        if (b.updatedTs !== a.updatedTs) return b.updatedTs - a.updatedTs;
        return a.sortBasePrice - b.sortBasePrice;
    });

    farawayUnits.sort((a, b) => {
        if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
        return a.sortBasePrice - b.sortBasePrice;
    });

    let finalUnits = [];
    if (nearbyUnits.length > 0) {
        finalUnits = [...nearbyUnits, ...uncoordinatedUnits];
    } else {
        finalUnits = [...uncoordinatedUnits, ...farawayUnits];
    }

    const firstWithCoord = finalUnits.find((u) => Number.isFinite(u.distanceKm));
    if (firstWithCoord) {
        const minDist = firstWithCoord.distanceKm;
        finalUnits.forEach((u) => {
            if (Number.isFinite(u.distanceKm) && Math.abs(u.distanceKm - minDist) <= 0.05) {
                u.isNearestGarage = true;
            }
        });
    }

    return finalUnits;
}

// Tarik katalog publik dari RTDB dengan IndexedDB Cache + Cooldown 60 Detik
export async function tarikKatalogPublikETag(forceBypassEtag = false) {
    if (!currentUserGps) {
        const locked = await kunciLokasiGpsWajib();
        if (!locked) {
            return {
                ok: false,
                fromCache304: false,
                units: []
            };
        }
    }

    const cached = await bacaCacheEtagKatalog();
    const cachedUnits = (cached && cached.rawCatalog)
        ? dekompresiDanSaringKatalog(cached.rawCatalog, currentUserGps)
        : [];

    // Smart ETag Cooldown 60 Detik: gunakan memori/IndexedDB langsung bila baru saja disinkronkan
    const nowMs = Date.now();
    const cacheTimestamp = Math.max(lastSuccessfulSyncTs, Number(cached?.ts || 0));
    if (!forceBypassEtag && cachedUnits.length > 0 && (nowMs - cacheTimestamp) < ETAG_COOLDOWN_MS) {
        return {
            ok: true,
            fromCache304: true,
            units: cachedUnits
        };
    }

    const vault = bukaBrankasKonfigurasiPublik() || {};
    const node1Url = String(vault.rtdbNode1Url || 'https://bagantara-history-default-rtdb.asia-southeast1.firebasedatabase.app/rental_catalog.json');
    const node2Url = String(vault.rtdbNode2Url || 'https://bagantara-overflow-default-rtdb.asia-southeast1.firebasedatabase.app/rental_catalog.json');

    const shouldBypassEtag = Boolean(forceBypassEtag || !cached || !cached.etag || cachedUnits.length === 0);

    const headers = {
        'Accept': 'application/json',
        'X-Firebase-ETag': 'true'
    };

    if (!shouldBypassEtag && cached && cached.etag) {
        headers['If-None-Match'] = cached.etag;
    }

    const endpoints = [node1Url, node2Url];

    for (const url of endpoints) {
        try {
            const res = await fetchJsonWithTimeout(url, headers, 6500);

            if (res.status === 304 && cached && cached.rawCatalog) {
                if (cachedUnits.length > 0) {
                    lastSuccessfulSyncTs = Date.now();
                    await simpanCacheEtagKatalog(cached.etag, cached.rawCatalog);
                    return {
                        ok: true,
                        fromCache304: true,
                        units: cachedUnits
                    };
                }
                const freshRes = await fetchJsonWithTimeout(url, { 'Accept': 'application/json', 'X-Firebase-ETag': 'true' }, 6500);
                if (freshRes && freshRes.ok) {
                    const freshEtag = freshRes.headers.get('ETag') || freshRes.headers.get('etag') || '';
                    const freshRaw = await freshRes.json();
                    const safeFresh = (freshRaw && typeof freshRaw === 'object') ? freshRaw : {};
                    lastSuccessfulSyncTs = Date.now();
                    await simpanCacheEtagKatalog(freshEtag || ('local_' + Date.now()), safeFresh);
                    return {
                        ok: true,
                        fromCache304: false,
                        units: dekompresiDanSaringKatalog(safeFresh, currentUserGps)
                    };
                }
            }

            if (res.ok) {
                const newEtag = res.headers.get('ETag') || res.headers.get('etag') || '';
                const rawData = await res.json();
                const safeCatalog = (rawData && typeof rawData === 'object') ? rawData : {};
                lastSuccessfulSyncTs = Date.now();
                await simpanCacheEtagKatalog(newEtag || ('local_' + Date.now()), safeCatalog);
                return {
                    ok: true,
                    fromCache304: false,
                    units: dekompresiDanSaringKatalog(safeCatalog, currentUserGps)
                };
            }
        } catch (err) {
            // Lanjut ke endpoint cadangan
        }
    }

    if (cached && cached.rawCatalog) {
        return {
            ok: true,
            fromCache304: true,
            units: cachedUnits
        };
    }

    return {
        ok: false,
        fromCache304: false,
        units: []
    };
}
