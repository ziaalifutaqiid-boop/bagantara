// ==========================================================================
// FILE: js/superapp-shell.js (BAGANTARA SUPER-APP HOST BRIDGE V14.0)
// FUNGSI:
//   1. Mesin Orkestrator Wadah Induk (BagantaraHostBridge)
//   2. Keep-Alive Sesi Obrolan Driver Ojol (#frame-service-transport-driver tidak
//      pernah dihancurkan/di-reload saat pindah tab) + Pita Lintas-Layanan
//      (#superapp-cross-chat-pill: "💬 Sesi Obrolan Driver Aktif — Ketuk untuk Kembali ke Obrolan")
//   3. Auto-Hibernate Video Rental: Mengirim postMessage({ type: 'BGN_BRIDGE_HIBERNATE' })
//      ke #frame-service-rental-mobil saat pengguna berpindah ke tab Ojol
//   4. Single GPS Lock Authority via sessionStorage('bgn_superapp_shared_gps') &
//      postMessage({ type: 'BGN_BRIDGE_GPS_SYNC', lat, lng, ts })
//   5. Sinkronisasi Tema Siang/Malam & Preferensi Dua Arah antara
//      bgn_user_device_settings_v13 (Ojol) dan bgn_rental_publik_settings_v5 (Rental)
//   6. Registrasi Tunggal Master Service Worker (/services-worker.js) & Anti-Inspect Guard
// ==========================================================================

(function() {
    'use strict';

    const SHARED_GPS_KEY = 'bgn_superapp_shared_gps';
    const SHARED_GPS_MAX_AGE_MS = 15 * 60 * 1000; // 15 Menit
    const OJOL_SETTINGS_KEY = 'bgn_user_device_settings_v13';
    const LEGACY_OJOL_SETTINGS_KEY = 'bgn_user_settings_v1';
    const RENTAL_SETTINGS_KEY = 'bgn_rental_publik_settings_v5';
    const ACTIVE_SERVICE_TAB_KEY = 'bgn_superapp_active_tab_v14';
    const CHAT_SESSION_KEYS = ['bgt_active_chat', 'bgn_active_chat_session'];

    let activeServiceTab = 'transport-driver'; // 'transport-driver' | 'rental-mobil'
    let hasActiveDriverChat = false;
    let activeDriverChatMeta = null;

    // ----------------------------------------------------------------------
    // 1. ANTI-INSPECTION GUARD (KEYBOARD SHORTCUTS & CONTEXTMENU)
    // ----------------------------------------------------------------------
    function pasangPerisaiAntiInspeksiInduk() {
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            return false;
        }, { capture: true });

        document.addEventListener('keydown', (e) => {
            const key = String(e.key || '').toUpperCase();
            const isF12 = key === 'F12' || e.keyCode === 123;
            const isCtrlShiftInspect = (e.ctrlKey || e.metaKey) && e.shiftKey && ['I', 'J', 'C', 'K'].includes(key);
            const isCtrlViewSource = (e.ctrlKey || e.metaKey) && key === 'U';
            if (isF12 || isCtrlShiftInspect || isCtrlViewSource) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }, { capture: true });
    }

    // ----------------------------------------------------------------------
    // 2. PEMBACA & PENYIMPAN SETELAN PERANGKAT DUA ARAH (TEMA, HAPTIC, LITE)
    // ----------------------------------------------------------------------
    function bacaSetelanTerpadu() {
        let parsedOjol = null;
        let parsedRental = null;
        try {
            const rawO = localStorage.getItem(OJOL_SETTINGS_KEY) || localStorage.getItem(LEGACY_OJOL_SETTINGS_KEY);
            if (rawO) parsedOjol = JSON.parse(rawO);
        } catch (e) {}
        try {
            const rawR = localStorage.getItem(RENTAL_SETTINGS_KEY);
            if (rawR) parsedRental = JSON.parse(rawR);
        } catch (e) {}

        const src = parsedOjol || parsedRental || {};
        const rawMode = src.themeMode || src.theme || 'auto';
        const themeMode = ['auto', 'dark', 'light'].includes(rawMode) ? rawMode : 'auto';
        const haptic = typeof src.haptic === 'boolean' ? src.haptic : true;
        const liteMode = Boolean(src.liteMode);
        const sound = typeof src.sound === 'boolean' ? src.sound : true;
        const wakeLock = typeof src.wakeLock === 'boolean' ? src.wakeLock : true;

        return { themeMode, haptic, liteMode, sound, wakeLock };
    }

    function apakahModeSiangAktif(themeMode) {
        if (themeMode === 'light') return true;
        if (themeMode === 'dark') return false;
        const hour = new Date().getHours();
        return (hour >= 6 && hour < 18);
    }

    function terapkanTemaKeWadahInduk(settingsObj) {
        const st = settingsObj || bacaSetelanTerpadu();
        const isLight = apakahModeSiangAktif(st.themeMode);

        document.body.classList.toggle('light-mode', isLight);
        document.body.classList.toggle('lite-performance-mode', Boolean(st.liteMode));

        const iconEl = document.getElementById('iconSuperAppTheme');
        if (iconEl) {
            iconEl.className = isLight ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
            iconEl.style.color = isLight ? '#d97706' : '#60a5fa';
        }

        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) {
            metaTheme.setAttribute('content', isLight ? '#f1f5f9' : '#070d1f');
        }
    }

    function simpanDanPancarkanSetelanDuaArah(newPartial, originModule = 'host-shell') {
        const curr = bacaSetelanTerpadu();
        const rawMode = newPartial.themeMode || newPartial.theme || curr.themeMode;
        const themeMode = ['auto', 'dark', 'light'].includes(rawMode) ? rawMode : curr.themeMode;
        const haptic = typeof newPartial.haptic === 'boolean' ? newPartial.haptic : curr.haptic;
        const liteMode = typeof newPartial.liteMode === 'boolean' ? newPartial.liteMode : curr.liteMode;
        const sound = typeof newPartial.sound === 'boolean' ? newPartial.sound : curr.sound;
        const wakeLock = typeof newPartial.wakeLock === 'boolean' ? newPartial.wakeLock : curr.wakeLock;

        const ojolPayload = {
            theme: themeMode,
            themeMode: themeMode,
            haptic: haptic,
            sound: sound,
            wakeLock: wakeLock,
            liteMode: liteMode
        };

        const rentalPayload = {
            themeMode: themeMode,
            theme: themeMode,
            haptic: haptic,
            liteMode: liteMode
        };

        try {
            localStorage.setItem(OJOL_SETTINGS_KEY, JSON.stringify(ojolPayload));
            localStorage.setItem(LEGACY_OJOL_SETTINGS_KEY, JSON.stringify(ojolPayload));
            localStorage.setItem(RENTAL_SETTINGS_KEY, JSON.stringify(rentalPayload));
        } catch (e) {}

        terapkanTemaKeWadahInduk(ojolPayload);

        const syncMsg = {
            type: 'BGN_BRIDGE_THEME_SYNC',
            sourceModule: originModule,
            themeMode: themeMode,
            theme: themeMode,
            haptic: haptic,
            liteMode: liteMode,
            sound: sound,
            wakeLock: wakeLock
        };

        kirimPesanKeFrame('transport-driver', syncMsg);
        kirimPesanKeFrame('rental-mobil', syncMsg);
    }

    // ----------------------------------------------------------------------
    // 3. SINGLE GPS LOCK AUTHORITY (bgn_superapp_shared_gps)
    // ----------------------------------------------------------------------
    function bacaSharedGpsValid() {
        try {
            const raw = sessionStorage.getItem(SHARED_GPS_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            const lat = Number(parsed?.lat);
            const lng = Number(parsed?.lng);
            const ts = Number(parsed?.ts || 0);
            if (Number.isFinite(lat) && Number.isFinite(lng) && (Date.now() - ts < SHARED_GPS_MAX_AGE_MS)) {
                return { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), ts };
            }
        } catch (e) {}
        return null;
    }

    function perbaruiBadgeGpsInduk(coord) {
        const lbl = document.getElementById('superappGpsStatusLabel');
        if (!lbl) return;
        if (coord && Number.isFinite(coord.lat) && Number.isFinite(coord.lng)) {
            lbl.textContent = 'Lokasi Aktif';
        } else {
            lbl.textContent = 'GPS Terpadu';
        }
    }

    function simpanDanPancarkanGpsTunggal(lat, lng, ts = Date.now(), originModule = 'host-shell') {
        const nLat = Number(Number(lat).toFixed(6));
        const nLng = Number(Number(lng).toFixed(6));
        if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return null;

        const payloadObj = { lat: nLat, lng: nLng, ts: Number(ts) || Date.now() };
        const serialized = JSON.stringify(payloadObj);

        try { sessionStorage.setItem(SHARED_GPS_KEY, serialized); } catch (e) {}
        try { localStorage.setItem('bgt_last_gps_coord_v11', serialized); } catch (e) {}

        perbaruiBadgeGpsInduk(payloadObj);

        const syncMsg = {
            type: 'BGN_BRIDGE_GPS_SYNC',
            sourceModule: originModule,
            lat: nLat,
            lng: nLng,
            ts: payloadObj.ts
        };

        if (originModule !== 'transport-driver') {
            kirimPesanKeFrame('transport-driver', syncMsg);
        }
        if (originModule !== 'rental-mobil') {
            kirimPesanKeFrame('rental-mobil', syncMsg);
        }
        return payloadObj;
    }

    // ----------------------------------------------------------------------
    // 4. KEEP-ALIVE SESI OBROLAN DRIVER & AUTO-HIBERNATE VIDEO RENTAL
    // ----------------------------------------------------------------------
    function dapatkanElemenFrame(serviceKey) {
        if (serviceKey === 'rental-mobil') {
            return document.getElementById('frame-service-rental-mobil');
        }
        return document.getElementById('frame-service-transport-driver');
    }

    function kirimPesanKeFrame(serviceKey, messageObj) {
        const frameEl = dapatkanElemenFrame(serviceKey);
        if (!frameEl || !frameEl.contentWindow) return;
        try {
            frameEl.contentWindow.postMessage(messageObj, '*');
        } catch (e) {}
    }

    function deteksiSesiChatDriverDariStorage() {
        for (let i = 0; i < CHAT_SESSION_KEYS.length; i++) {
            try {
                const raw = localStorage.getItem(CHAT_SESSION_KEYS[i]);
                if (!raw) continue;
                const parsed = JSON.parse(raw);
                if (parsed && parsed.idTiket && parsed.uidDriver) {
                    return parsed;
                }
            } catch (e) {}
        }
        return null;
    }

    function sinkronkanPitaCrossServiceChat() {
        const storedSession = deteksiSesiChatDriverDariStorage();
        const isChatActive = Boolean(hasActiveDriverChat || storedSession);
        const sessionMeta = activeDriverChatMeta || storedSession;

        const pillContainer = document.getElementById('superapp-cross-chat-pill');
        const pillText = document.getElementById('crossChatPillText');
        const tabDot = document.getElementById('badgeChatTabIndicator');

        if (tabDot) {
            tabDot.classList.toggle('hidden', !isChatActive);
        }

        if (!pillContainer) return;

        // Tampilkan pita mengambang apabila sesi obrolan driver aktif DAN pengguna sedang berada di tab Rental Mobil
        if (isChatActive && activeServiceTab === 'rental-mobil') {
            const driverName = sessionMeta && sessionMeta.namaDriver
                ? String(sessionMeta.namaDriver).trim()
                : '';
            if (pillText) {
                pillText.textContent = driverName
                    ? `💬 Sesi Obrolan Driver Aktif (${driverName}) — Ketuk untuk Kembali ke Obrolan`
                    : '💬 Sesi Obrolan Driver Aktif — Ketuk untuk Kembali ke Obrolan';
            }
            pillContainer.classList.remove('hidden');
        } else {
            pillContainer.classList.add('hidden');
        }
    }

    function pindahLayananSuperApp(targetService, openChatRoomImmediately = false) {
        const normalizedTarget = targetService === 'rental-mobil' ? 'rental-mobil' : 'transport-driver';
        const frameOjol = document.getElementById('frame-service-transport-driver');
        const frameRental = document.getElementById('frame-service-rental-mobil');
        const btnOjol = document.getElementById('btnSwitchTransportDriver');
        const btnRental = document.getElementById('btnSwitchRentalMobil');

        const st = bacaSetelanTerpadu();
        if (st.haptic && typeof navigator.vibrate === 'function') {
            try { navigator.vibrate(12); } catch (e) {}
        }

        // Jika berpindah DARI Rental Mobil KE Ojek/Taksi/Jastip -> Kirim BGN_BRIDGE_HIBERNATE
        if (normalizedTarget === 'transport-driver') {
            kirimPesanKeFrame('rental-mobil', {
                type: 'BGN_BRIDGE_HIBERNATE',
                reason: 'tab_switch_to_transport_driver',
                ts: Date.now()
            });
        }

        activeServiceTab = normalizedTarget;
        try { sessionStorage.setItem(ACTIVE_SERVICE_TAB_KEY, activeServiceTab); } catch (e) {}

        // Pertahankan kedua frame di DOM (JANGAN DI-RELOAD / DIHANCURKAN!)
        if (frameOjol) {
            const isOjol = normalizedTarget === 'transport-driver';
            frameOjol.classList.toggle('active-frame', isOjol);
            frameOjol.classList.toggle('hidden-frame', !isOjol);
        }

        if (frameRental) {
            const isRental = normalizedTarget === 'rental-mobil';
            frameRental.classList.toggle('active-frame', isRental);
            frameRental.classList.toggle('hidden-frame', !isRental);
        }

        if (btnOjol) {
            const isOjol = normalizedTarget === 'transport-driver';
            btnOjol.classList.toggle('active', isOjol);
            btnOjol.setAttribute('aria-selected', isOjol ? 'true' : 'false');
        }

        if (btnRental) {
            const isRental = normalizedTarget === 'rental-mobil';
            btnRental.classList.toggle('active', isRental);
            btnRental.setAttribute('aria-selected', isRental ? 'true' : 'false');
        }

        // Pancarkan GPS & Tema terkini ke modul yang baru dibuka
        const sharedGps = bacaSharedGpsValid();
        if (sharedGps) {
            kirimPesanKeFrame(normalizedTarget, {
                type: 'BGN_BRIDGE_GPS_SYNC',
                sourceModule: 'host-shell',
                lat: sharedGps.lat,
                lng: sharedGps.lng,
                ts: sharedGps.ts
            });
        }

        kirimPesanKeFrame(normalizedTarget, {
            type: 'BGN_BRIDGE_THEME_SYNC',
            sourceModule: 'host-shell',
            themeMode: st.themeMode,
            theme: st.themeMode,
            haptic: st.haptic,
            liteMode: st.liteMode,
            sound: st.sound,
            wakeLock: st.wakeLock
        });

        if (openChatRoomImmediately && normalizedTarget === 'transport-driver') {
            kirimPesanKeFrame('transport-driver', {
                type: 'BGN_BRIDGE_OPEN_CHAT_ROOM',
                ts: Date.now()
            });
        }

        sinkronkanPitaCrossServiceChat();
    }

    // ----------------------------------------------------------------------
    // 5. LISTENER KOMUNIKASI LINTAS-FRAME (postMessage & storage)
    // ----------------------------------------------------------------------
    function pasangListenerBridgeInduk() {
        window.addEventListener('message', (event) => {
            const msg = event && event.data;
            if (!msg || typeof msg !== 'object' || !msg.type) return;

            if (msg.type === 'BGN_BRIDGE_GPS_SYNC') {
                const lat = Number(msg.lat);
                const lng = Number(msg.lng);
                if (Number.isFinite(lat) && Number.isFinite(lng)) {
                    simpanDanPancarkanGpsTunggal(
                        lat,
                        lng,
                        msg.ts || Date.now(),
                        msg.sourceModule || 'child-module'
                    );
                }
            } else if (msg.type === 'BGN_BRIDGE_THEME_SYNC') {
                simpanDanPancarkanSetelanDuaArah(
                    {
                        themeMode: msg.themeMode || msg.theme,
                        haptic: msg.haptic,
                        liteMode: msg.liteMode,
                        sound: msg.sound,
                        wakeLock: msg.wakeLock
                    },
                    msg.sourceModule || 'child-module'
                );
            } else if (msg.type === 'BGN_BRIDGE_CHAT_STATE') {
                hasActiveDriverChat = Boolean(msg.active);
                activeDriverChatMeta = msg.session || deteksiSesiChatDriverDariStorage();
                sinkronkanPitaCrossServiceChat();
            } else if (msg.type === 'BGN_BRIDGE_SWITCH_SERVICE') {
                if (msg.targetService) {
                    pindahLayananSuperApp(msg.targetService, Boolean(msg.openChat));
                }
            }
        });

        window.addEventListener('storage', (event) => {
            if (!event || !event.key) return;
            if (CHAT_SESSION_KEYS.includes(event.key)) {
                const sess = deteksiSesiChatDriverDariStorage();
                hasActiveDriverChat = Boolean(sess);
                activeDriverChatMeta = sess;
                sinkronkanPitaCrossServiceChat();
            } else if ([OJOL_SETTINGS_KEY, LEGACY_OJOL_SETTINGS_KEY, RENTAL_SETTINGS_KEY].includes(event.key)) {
                terapkanTemaKeWadahInduk(bacaSetelanTerpadu());
            }
        });
    }

    // ----------------------------------------------------------------------
    // 6. REGISTRASI MASTER SERVICE WORKER TERPADU (/services-worker.js)
    // ----------------------------------------------------------------------
    function daftarkanMasterServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./services-worker.js?v=14.0', { updateViaCache: 'none' })
                .then((reg) => {
                    try { reg.update(); } catch (e) {}
                })
                .catch(() => {});
        });
    }

    // ----------------------------------------------------------------------
    // 7. INISIALISASI UTAMA WADAH INDUK
    // ----------------------------------------------------------------------
    function inisialisasiSuperAppShell() {
        pasangPerisaiAntiInspeksiInduk();
        terapkanTemaKeWadahInduk(bacaSetelanTerpadu());
        perbaruiBadgeGpsInduk(bacaSharedGpsValid());
        pasangListenerBridgeInduk();
        daftarkanMasterServiceWorker();

        const btnOjol = document.getElementById('btnSwitchTransportDriver');
        const btnRental = document.getElementById('btnSwitchRentalMobil');
        const btnTheme = document.getElementById('btnSuperAppThemeToggle');
        const btnReturnChat = document.getElementById('btnReturnToDriverChat');
        const frameOjol = document.getElementById('frame-service-transport-driver');
        const frameRental = document.getElementById('frame-service-rental-mobil');

        if (btnOjol) {
            btnOjol.addEventListener('click', () => {
                pindahLayananSuperApp('transport-driver', false);
            });
        }

        if (btnRental) {
            btnRental.addEventListener('click', () => {
                pindahLayananSuperApp('rental-mobil', false);
            });
        }

        if (btnReturnChat) {
            btnReturnChat.addEventListener('click', () => {
                pindahLayananSuperApp('transport-driver', true);
            });
        }

        if (btnTheme) {
            btnTheme.addEventListener('click', () => {
                const isCurrentlyLight = document.body.classList.contains('light-mode');
                const nextTheme = isCurrentlyLight ? 'dark' : 'light';
                simpanDanPancarkanSetelanDuaArah({ themeMode: nextTheme }, 'host-shell');
            });
        }

        const sinkronkanFrameSaatMuat = (serviceKey) => {
            const st = bacaSetelanTerpadu();
            kirimPesanKeFrame(serviceKey, {
                type: 'BGN_BRIDGE_THEME_SYNC',
                sourceModule: 'host-shell',
                themeMode: st.themeMode,
                theme: st.themeMode,
                haptic: st.haptic,
                liteMode: st.liteMode,
                sound: st.sound,
                wakeLock: st.wakeLock
            });
            const gps = bacaSharedGpsValid();
            if (gps) {
                kirimPesanKeFrame(serviceKey, {
                    type: 'BGN_BRIDGE_GPS_SYNC',
                    sourceModule: 'host-shell',
                    lat: gps.lat,
                    lng: gps.lng,
                    ts: gps.ts
                });
            }
        };

        if (frameOjol) {
            frameOjol.addEventListener('load', () => sinkronkanFrameSaatMuat('transport-driver'));
        }
        if (frameRental) {
            frameRental.addEventListener('load', () => sinkronkanFrameSaatMuat('rental-mobil'));
        }

        // Pemantau berkala ringan untuk memastikan pita obrolan selalu sinkron
        setInterval(() => {
            const sess = deteksiSesiChatDriverDariStorage();
            hasActiveDriverChat = Boolean(sess);
            activeDriverChatMeta = sess;
            sinkronkanPitaCrossServiceChat();
        }, 1800);

        const initialSess = deteksiSesiChatDriverDariStorage();
        hasActiveDriverChat = Boolean(initialSess);
        activeDriverChatMeta = initialSess;
        sinkronkanPitaCrossServiceChat();
    }

    window.BagantaraHostBridge = {
        switchService: pindahLayananSuperApp,
        syncGps: simpanDanPancarkanGpsTunggal,
        syncTheme: simpanDanPancarkanSetelanDuaArah,
        getSharedGps: bacaSharedGpsValid,
        getSettings: bacaSetelanTerpadu
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inisialisasiSuperAppShell);
    } else {
        inisialisasiSuperAppShell();
    }
})();
