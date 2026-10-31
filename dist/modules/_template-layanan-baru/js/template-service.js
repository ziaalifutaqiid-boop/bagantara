// ==========================================================================
// FILE: modules/_template-layanan-baru/js/template-service.js
// FUNGSI: Starter Kit Integrasi BagantaraHostBridge untuk Layanan Baru
//         1. Tanpa registrasi Service Worker mandiri (menggunakan Master SW Induk)
//         2. Single GPS Lock Authority via sessionStorage('bgn_superapp_shared_gps')
//         3. Sinkronisasi Tema Dua Arah (bgn_user_device_settings_v13 & bgn_rental_publik_settings_v5)
//         4. Handler BGN_BRIDGE_HIBERNATE untuk penghematan RAM
// ==========================================================================
(function() {
    'use strict';

    const SHARED_GPS_KEY = 'bgn_superapp_shared_gps';
    const SHARED_GPS_MAX_AGE_MS = 15 * 60 * 1000;
    const OJOL_SETTINGS_KEY = 'bgn_user_device_settings_v13';
    const RENTAL_SETTINGS_KEY = 'bgn_rental_publik_settings_v5';

    const gpsStatusEl = document.getElementById('tplGpsStatusText');
    const themeStatusEl = document.getElementById('tplThemeStatusText');
    const btnReqGps = document.getElementById('btnTplRequestGps');
    const btnToggleTheme = document.getElementById('btnTplToggleTheme');

    function bacaPengaturanTema() {
        try {
            const raw = localStorage.getItem(OJOL_SETTINGS_KEY) || localStorage.getItem(RENTAL_SETTINGS_KEY);
            if (!raw) return { themeMode: 'auto', haptic: true, liteMode: false };
            const parsed = JSON.parse(raw);
            return {
                themeMode: parsed.themeMode || parsed.theme || 'auto',
                haptic: parsed.haptic !== false,
                liteMode: Boolean(parsed.liteMode)
            };
        } catch (e) {
            return { themeMode: 'auto', haptic: true, liteMode: false };
        }
    }

    function terapkanTemaVisual(mode) {
        let isLight = false;
        if (mode === 'light') isLight = true;
        else if (mode === 'dark') isLight = false;
        else {
            const hr = new Date().getHours();
            isLight = (hr >= 6 && hr < 18);
        }
        document.body.classList.toggle('light-mode', isLight);
        if (themeStatusEl) {
            themeStatusEl.textContent = mode.toUpperCase() + (isLight ? ' (SIANG)' : ' (MALAM)');
        }
    }

    function bacaGpsBersama() {
        try {
            const raw = sessionStorage.getItem(SHARED_GPS_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            const lat = Number(parsed?.lat);
            const lng = Number(parsed?.lng);
            const ts = Number(parsed?.ts || 0);
            if (Number.isFinite(lat) && Number.isFinite(lng) && (Date.now() - ts < SHARED_GPS_MAX_AGE_MS)) {
                return { lat, lng, ts };
            }
        } catch (e) {}
        return null;
    }

    function tampilkanKoordinatGps(coord) {
        if (!gpsStatusEl) return;
        if (coord && Number.isFinite(coord.lat) && Number.isFinite(coord.lng)) {
            gpsStatusEl.textContent = coord.lat.toFixed(5) + ', ' + coord.lng.toFixed(5);
        } else {
            gpsStatusEl.textContent = 'Belum Terkunci';
        }
    }

    window.addEventListener('message', (event) => {
        const msg = event && event.data;
        if (!msg || typeof msg !== 'object') return;

        if (msg.type === 'BGN_BRIDGE_GPS_SYNC') {
            const lat = Number(msg.lat);
            const lng = Number(msg.lng);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                tampilkanKoordinatGps({ lat, lng, ts: msg.ts || Date.now() });
            }
        } else if (msg.type === 'BGN_BRIDGE_THEME_SYNC') {
            terapkanTemaVisual(msg.themeMode || msg.theme || 'auto');
        } else if (msg.type === 'BGN_BRIDGE_HIBERNATE') {
            // Hentikan media/timer berat saat pengguna berpindah tab
        }
    });

    if (btnReqGps) {
        btnReqGps.addEventListener('click', () => {
            const cached = bacaGpsBersama();
            if (cached) {
                tampilkanKoordinatGps(cached);
                return;
            }
            if (!navigator.geolocation) return;
            navigator.geolocation.getCurrentPosition((pos) => {
                const payload = {
                    lat: Number(pos.coords.latitude.toFixed(6)),
                    lng: Number(pos.coords.longitude.toFixed(6)),
                    ts: Date.now()
                };
                try { sessionStorage.setItem(SHARED_GPS_KEY, JSON.stringify(payload)); } catch (e) {}
                tampilkanKoordinatGps(payload);
                if (window.parent && window.parent !== window) {
                    window.parent.postMessage({
                        type: 'BGN_BRIDGE_GPS_SYNC',
                        sourceModule: 'template-layanan-baru',
                        lat: payload.lat,
                        lng: payload.lng,
                        ts: payload.ts
                    }, '*');
                }
            });
        });
    }

    if (btnToggleTheme) {
        btnToggleTheme.addEventListener('click', () => {
            const st = bacaPengaturanTema();
            const nextMode = document.body.classList.contains('light-mode') ? 'dark' : 'light';
            terapkanTemaVisual(nextMode);
            if (window.parent && window.parent !== window) {
                window.parent.postMessage({
                    type: 'BGN_BRIDGE_THEME_SYNC',
                    sourceModule: 'template-layanan-baru',
                    themeMode: nextMode,
                    haptic: st.haptic,
                    liteMode: st.liteMode
                }, '*');
            }
        });
    }

    const initSt = bacaPengaturanTema();
    terapkanTemaVisual(initSt.themeMode);
    tampilkanKoordinatGps(bacaGpsBersama());
})();
