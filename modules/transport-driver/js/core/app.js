// ==========================================
// MESIN UTAMA: NAVIGASI SPA 5-TAB, BGNSETTINGS ENGINE, INTERCEPTOR HAPTIC/SOUND/LITE-MODE,
//              SINKRONISASI LOKASI GPS ANTI-MACET (FAST-LOCK + WATCHDOG),
//              BANNER & TOMBOL PEMULIHAN OBROLAN AKTIF, HISTORY BACK-GUARD, & PHOTO SHIELD (V12.2)
// ==========================================

window.BAGANTARA_GPS_VERIFIED = false;

(function() {
    const GPS_STORAGE_KEY = 'bgt_last_gps_coord_v11';
    const SHARED_GPS_STORAGE_KEY = 'bgn_superapp_shared_gps';
    const SHARED_GPS_MAX_AGE_MS = 15 * 60 * 1000; // 15 menit (Single GPS Lock Authority)
    const GPS_CACHE_MAX_AGE_MS = 30 * 60 * 1000; // 30 menit
    const SETTINGS_STORAGE_KEY = 'bgn_user_device_settings_v13';
    const LEGACY_SETTINGS_KEY = 'bgn_user_settings_v1';
    const RENTAL_SETTINGS_KEY = 'bgn_rental_publik_settings_v5';

    const DEFAULT_USER_SETTINGS = {
        theme: 'auto',
        haptic: true,
        sound: true,
        wakeLock: true,
        liteMode: false
    };

    const rawNativeVibrate = (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function')
        ? navigator.vibrate.bind(navigator)
        : null;

    const loadSavedSettings = () => {
        try {
            const raw = localStorage.getItem(SETTINGS_STORAGE_KEY)
                || localStorage.getItem(LEGACY_SETTINGS_KEY)
                || localStorage.getItem(RENTAL_SETTINGS_KEY);
            if (!raw) return { ...DEFAULT_USER_SETTINGS };
            const parsed = JSON.parse(raw) || {};
            const resolvedTheme = parsed.theme || parsed.themeMode || 'auto';
            return {
                theme: ['auto', 'dark', 'light'].includes(resolvedTheme) ? resolvedTheme : 'auto',
                haptic: typeof parsed.haptic === 'boolean' ? parsed.haptic : true,
                sound: typeof parsed.sound === 'boolean' ? parsed.sound : true,
                wakeLock: typeof parsed.wakeLock === 'boolean' ? parsed.wakeLock : true,
                liteMode: typeof parsed.liteMode === 'boolean' ? parsed.liteMode : false
            };
        } catch (e) {
            return { ...DEFAULT_USER_SETTINGS };
        }
    };

    const initialSettings = loadSavedSettings();

    window.BGNSettings = {
        _storageKey: SETTINGS_STORAGE_KEY,
        theme: initialSettings.theme,
        haptic: initialSettings.haptic,
        sound: initialSettings.sound,
        wakeLock: initialSettings.wakeLock,
        liteMode: initialSettings.liteMode,

        load: function() {
            const s = loadSavedSettings();
            this.theme = s.theme;
            this.haptic = s.haptic;
            this.sound = s.sound;
            this.wakeLock = s.wakeLock;
            this.liteMode = s.liteMode;
            return s;
        },

        save: function(silentBridge = false) {
            const payload = {
                theme: ['auto', 'dark', 'light'].includes(this.theme) ? this.theme : 'auto',
                themeMode: ['auto', 'dark', 'light'].includes(this.theme) ? this.theme : 'auto',
                haptic: Boolean(this.haptic),
                sound: Boolean(this.sound),
                wakeLock: Boolean(this.wakeLock),
                liteMode: Boolean(this.liteMode)
            };
            try {
                localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
                localStorage.setItem(LEGACY_SETTINGS_KEY, JSON.stringify(payload));
                localStorage.setItem(RENTAL_SETTINGS_KEY, JSON.stringify({
                    themeMode: payload.theme,
                    haptic: payload.haptic,
                    liteMode: payload.liteMode
                }));
            } catch (e) {}
            if (!silentBridge) {
                try {
                    const realTop = (typeof globalThis !== 'undefined' && globalThis.parent) ? globalThis.parent : null;
                    if (realTop && realTop !== globalThis && typeof realTop.postMessage === 'function') {
                        realTop.postMessage({
                            type: 'BGN_BRIDGE_THEME_SYNC',
                            sourceModule: 'transport-driver',
                            themeMode: payload.theme,
                            haptic: payload.haptic,
                            liteMode: payload.liteMode,
                            sound: payload.sound,
                            wakeLock: payload.wakeLock
                        }, '*');
                    }
                } catch (e) {}
            }
            return payload;
        },

        set: function(key, val, silentBridge = false) {
            if (!(key in DEFAULT_USER_SETTINGS)) return;
            if (key === 'theme') {
                this.theme = ['auto', 'dark', 'light'].includes(val) ? val : 'auto';
            } else {
                this[key] = Boolean(val);
            }
            this.save(silentBridge);
            if (typeof window.applyBgnSettingsToRuntime === 'function') {
                window.applyBgnSettingsToRuntime();
            }
        }
    };

    const safeVibrateInterceptor = function(pattern = 18) {
        if (!window.BGNSettings || window.BGNSettings.haptic === false) {
            return false;
        }
        if (rawNativeVibrate) {
            try { return rawNativeVibrate(pattern); } catch (e) { return false; }
        }
        return false;
    };

    try {
        navigator.vibrate = safeVibrateInterceptor;
    } catch (e) {
        try {
            Object.defineProperty(navigator, 'vibrate', {
                value: safeVibrateInterceptor,
                configurable: true,
                writable: true
            });
        } catch (err) {}
    }

    window.triggerHaptic = function(ms = 18) {
        return safeVibrateInterceptor(ms);
    };

    window.saveLastValidGpsCoord = function(lat, lng, silentBridge = false) {
        const nLat = parseFloat(lat);
        const nLng = parseFloat(lng);
        if (isNaN(nLat) || isNaN(nLng)) return;
        const nowTs = Date.now();
        const payload = JSON.stringify({ lat: nLat, lng: nLng, ts: nowTs });
        try { globalThis.sessionStorage.setItem(SHARED_GPS_STORAGE_KEY, payload); } catch (e) {}
        try { sessionStorage.setItem(SHARED_GPS_STORAGE_KEY, payload); } catch (e) {}
        try { sessionStorage.setItem(GPS_STORAGE_KEY, payload); } catch (e) {}
        try { localStorage.setItem(GPS_STORAGE_KEY, payload); } catch (e) {}
        if (!silentBridge) {
            try {
                const realTop = (typeof globalThis !== 'undefined' && globalThis.parent) ? globalThis.parent : null;
                if (realTop && realTop !== globalThis && typeof realTop.postMessage === 'function') {
                    realTop.postMessage({
                        type: 'BGN_BRIDGE_GPS_SYNC',
                        sourceModule: 'transport-driver',
                        lat: nLat,
                        lng: nLng,
                        ts: nowTs
                    }, '*');
                }
            } catch (e) {}
        }
    };

    window.getLastValidGpsCoord = function() {
        const readSharedGps = () => {
            const stores = [];
            try { if (globalThis.sessionStorage) stores.push(globalThis.sessionStorage); } catch (e) {}
            try { if (sessionStorage) stores.push(sessionStorage); } catch (e) {}
            try { if (localStorage) stores.push(localStorage); } catch (e) {}
            for (let i = 0; i < stores.length; i++) {
                try {
                    const rawShared = stores[i].getItem(SHARED_GPS_STORAGE_KEY);
                    if (!rawShared) continue;
                    const parsed = JSON.parse(rawShared);
                    const lat = parseFloat(parsed?.lat);
                    const lng = parseFloat(parsed?.lng);
                    const ts = Number(parsed?.ts || 0);
                    if (!isNaN(lat) && !isNaN(lng) && (Date.now() - ts < SHARED_GPS_MAX_AGE_MS)) {
                        return { lat, lng, ts };
                    }
                } catch (e) {}
            }
            return null;
        };
        const sharedCoord = readSharedGps();
        if (sharedCoord) return sharedCoord;

        const readStore = (store) => {
            try {
                const raw = store.getItem(GPS_STORAGE_KEY);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                const lat = parseFloat(parsed?.lat);
                const lng = parseFloat(parsed?.lng);
                const ts = Number(parsed?.ts || 0);
                if (!isNaN(lat) && !isNaN(lng) && (Date.now() - ts <= GPS_CACHE_MAX_AGE_MS)) {
                    return { lat, lng, ts };
                }
            } catch (e) {}
            return null;
        };
        const storedCoord = readStore(sessionStorage) || readStore(localStorage);
        if (storedCoord) return storedCoord;

        try {
            const rawChat = localStorage.getItem('bgt_active_chat') || localStorage.getItem('bgn_active_chat_session');
            if (rawChat) {
                const parsedChat = JSON.parse(rawChat);
                const pCoord = parsedChat?.payloadTiket?.pickup_coord;
                if (pCoord) {
                    const [pLat, pLng] = String(pCoord).split(',').map(Number);
                    if (!isNaN(pLat) && !isNaN(pLng)) {
                        return { lat: pLat, lng: pLng, ts: Date.now() };
                    }
                }
            }
        } catch (e) {}
        return null;
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    // 0. PERISAI GLOBAL ANTI-UNDUH / ANTI-KLIK-KANAN / ANTI-DRAG FOTO DRIVER (CAPTURE PHASE)
    const isProtectedPhotoNode = (target) => {
        if (!target || typeof target.closest !== 'function') return false;
        return Boolean(
            target.closest('.tpl-avatar-ring') ||
            target.closest('.prelock-avatar-wrap') ||
            target.closest('.photo-armor-shield') ||
            target.closest('.tpl-foto') ||
            target.closest('.prelock-avatar') ||
            target.closest('.image-wrapper')
        );
    };

    ['contextmenu', 'dragstart', 'selectstart'].forEach(evtName => {
        document.addEventListener(evtName, (e) => {
            if (isProtectedPhotoNode(e.target)) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }, { capture: true, passive: false });
    });

    // 0A. GLOBAL TACTILE HAPTIC FEEDBACK (15ms) UNTUK ELEMEN INTERAKTIF UTAMA
    document.addEventListener('click', (e) => {
        if (!window.BGNSettings || window.BGNSettings.haptic !== true) return;
        const t = e.target;
        if (!t || typeof t.closest !== 'function') return;
        const interactiveEl = t.closest('button, .nav-item, .catalog-chip, .driver-card-summary, .settings-toggle-switch');
        if (interactiveEl) {
            window.triggerHaptic(15);
        }
    }, { capture: true, passive: true });

    // 0B. SINKRONISASI MUTLAK RUANG CHAT VS BILAH NAVIGASI BAWAH 5-TAB & BANNER OBROLAN AKTIF
    const btnPulihkanChat = document.getElementById('btnPulihkanChat');
    const activeChatBanner = document.getElementById('active-chat-session-banner');

    window.syncChatAndBottomNavState = function() {
        const panel = document.getElementById('panel-komunikasi-utama');
        const bottomNav = document.getElementById('mainBottomNav');
        const orderPanel = document.getElementById('dynamicOrderPanel');
        const isChatOpen = Boolean(panel && panel.style.display !== 'none');

        if (isChatOpen) {
            document.body.classList.add('chat-room-open');
            if (bottomNav) bottomNav.classList.add('hidden');
            if (btnPulihkanChat) btnPulihkanChat.classList.add('hidden');
            if (activeChatBanner) activeChatBanner.classList.add('hidden');
            if (orderPanel) orderPanel.style.display = 'none';
            if (typeof window.hideMandatoryGpsOverlay === 'function') {
                window.hideMandatoryGpsOverlay();
            }
            return true;
        }

        document.body.classList.remove('chat-room-open');
        const activeView = document.querySelector('.spa-view.active-view');
        const activeId = activeView ? activeView.id : 'view-mitra-map';

        if (bottomNav) {
            if (
                activeId === 'view-mitra-map' ||
                activeId === 'view-about'
            ) {
                bottomNav.classList.remove('hidden');
            } else {
                bottomNav.classList.add('hidden');
            }
        }
        return false;
    };

    // 0C. PROTEKSI TOMBOL KEMBALI (HARDWARE BACK-BUTTON HISTORY GUARD)
    window.hasActiveOverlayOrSubView = function() {
        const panel = document.getElementById('panel-komunikasi-utama');
        if (panel && panel.style.display !== 'none') return true;

        const fullscreenImg = document.getElementById('modal-fullscreen-img');
        if (fullscreenImg && !fullscreenImg.classList.contains('hidden-state')) return true;

        const overlayIds = ['order-rejected-overlay', 'cyber-alert', 'driver-last-loc-modal', 'driver-qris-modal', 'gmaps-bridge-overlay', 'client-form-overlay', 'tariff-match-overlay', 'settings-overlay'];
        for (const id of overlayIds) {
            const el = document.getElementById(id);
            if (el && !el.classList.contains('hidden')) return true;
        }

        const activeView = document.querySelector('.spa-view.active-view');
        if (activeView && activeView.id !== 'view-mitra-map') return true;

        return false;
    };

    window.armBgtHistoryGuard = function(contextLabel = 'spa') {
        try {
            if (!window.history.state || !window.history.state.bgtSpaGuard) {
                window.history.pushState({ bgtSpaGuard: true, ctx: contextLabel, ts: Date.now() }, '');
            }
        } catch (e) {}
    };

    window.addEventListener('popstate', () => {
        const fullscreenImg = document.getElementById('modal-fullscreen-img');
        if (fullscreenImg && !fullscreenImg.classList.contains('hidden-state')) {
            if (window.ChatHandshake && typeof window.ChatHandshake.tutupLayarPenuhGambar === 'function') {
                window.ChatHandshake.tutupLayarPenuhGambar();
            } else {
                fullscreenImg.classList.add('hidden-state');
            }
            if (window.hasActiveOverlayOrSubView()) window.armBgtHistoryGuard('after-img');
            return;
        }

        const rejectedOverlay = document.getElementById('order-rejected-overlay');
        if (rejectedOverlay && !rejectedOverlay.classList.contains('hidden')) {
            rejectedOverlay.classList.add('hidden');
            if (window.UIManager && window.UIManager._rejectedBannerTimer) {
                clearInterval(window.UIManager._rejectedBannerTimer);
                window.UIManager._rejectedBannerTimer = null;
            }
            if (window.hasActiveOverlayOrSubView()) window.armBgtHistoryGuard('after-rejected');
            return;
        }

        const alertOverlay = document.getElementById('cyber-alert');
        if (alertOverlay && !alertOverlay.classList.contains('hidden')) {
            alertOverlay.classList.add('hidden');
            if (window.hasActiveOverlayOrSubView()) window.armBgtHistoryGuard('after-alert');
            return;
        }

        const driverQrisOverlay = document.getElementById('driver-qris-modal');
        if (driverQrisOverlay && !driverQrisOverlay.classList.contains('hidden')) {
            driverQrisOverlay.classList.add('hidden');
            if (window.hasActiveOverlayOrSubView()) window.armBgtHistoryGuard('after-driver-qris');
            return;
        }

        const driverLocOverlay = document.getElementById('driver-last-loc-modal');
        if (driverLocOverlay && !driverLocOverlay.classList.contains('hidden')) {
            driverLocOverlay.classList.add('hidden');
            if (window.hasActiveOverlayOrSubView()) window.armBgtHistoryGuard('after-driver-loc');
            return;
        }

        const gmapsOverlay = document.getElementById('gmaps-bridge-overlay');
        if (gmapsOverlay && !gmapsOverlay.classList.contains('hidden')) {
            gmapsOverlay.classList.add('hidden');
            if (window.hasActiveOverlayOrSubView()) window.armBgtHistoryGuard('after-gmaps');
            return;
        }

        const clientOverlay = document.getElementById('client-form-overlay');
        if (clientOverlay && !clientOverlay.classList.contains('hidden')) {
            clientOverlay.classList.add('hidden');
            if (window.hasActiveOverlayOrSubView()) window.armBgtHistoryGuard('after-client');
            return;
        }

        const tmOverlay = document.getElementById('tariff-match-overlay');
        if (tmOverlay && !tmOverlay.classList.contains('hidden')) {
            tmOverlay.classList.add('hidden');
            if (window.hasActiveOverlayOrSubView()) window.armBgtHistoryGuard('after-tm');
            return;
        }

        const settingsOverlay = document.getElementById('settings-overlay');
        if (settingsOverlay && !settingsOverlay.classList.contains('hidden')) {
            document.getElementById('btnCloseSettings')?.click();
            if (window.hasActiveOverlayOrSubView()) window.armBgtHistoryGuard('after-settings');
            return;
        }

        const panelChat = document.getElementById('panel-komunikasi-utama');
        if (panelChat && panelChat.style.display !== 'none') {
            if (window.ChatHandshake && typeof window.ChatHandshake.minimalkanRuangKomunikasi === 'function') {
                window.ChatHandshake.minimalkanRuangKomunikasi();
            } else {
                const btnBackChat = panelChat.querySelector('.tpl-btn-back');
                if (btnBackChat) btnBackChat.click();
            }
            return;
        }

        const activeView = document.querySelector('.spa-view.active-view');
        const activeId = activeView ? activeView.id : 'view-mitra-map';

        if (activeId === 'view-map') {
            if (window.BAGANTARA_QUICK_FARE_MAP_MODE === true) {
                if (window.UIManager && typeof window.UIManager._cancelQuickFarePinVerificationMap === 'function') {
                    window.UIManager._cancelQuickFarePinVerificationMap();
                } else {
                    window.BAGANTARA_QUICK_FARE_MAP_MODE = false;
                    window.spaNavigateTo('view-mitra-map');
                }
                return;
            }
            document.getElementById('btnBackMap')?.click();
            if (window.hasActiveOverlayOrSubView()) window.armBgtHistoryGuard('after-map');
            return;
        }
        if (activeId === 'view-express-details') {
            if (window.FlowEngine && typeof window.FlowEngine.showSearchRoute === 'function') {
                window.FlowEngine.showSearchRoute();
            } else if (window.SystemReset) {
                window.SystemReset();
            }
            if (window.hasActiveOverlayOrSubView()) window.armBgtHistoryGuard('after-express');
            return;
        }
        if (activeId === 'view-jastip-items') {
            document.getElementById('btnBackJastipItems')?.click();
            if (window.hasActiveOverlayOrSubView()) window.armBgtHistoryGuard('after-jastip-items');
            return;
        }
        if (activeId === 'view-search-route' || activeId === 'view-jastip-search') {
            if (window.SystemReset) window.SystemReset();
            return;
        }
        if (activeId === 'view-about') {
            document.getElementById('btnBackFromAbout')?.click();
            return;
        }
    });

    window.periksaSesiChatAktif = function() {
        const isChatCurrentlyOpen = window.syncChatAndBottomNavState();
        const rawSesi = localStorage.getItem('bgt_active_chat');
        const sesiMemoriAktif = Boolean(window.ChatHandshake && typeof window.ChatHandshake.isSesiAktif === 'function' && window.ChatHandshake.isSesiAktif());

        let parsedSesi = null;
        if (rawSesi) {
            try { parsedSesi = JSON.parse(rawSesi); } catch (e) {}
        }

        const hasActiveSession = Boolean(rawSesi || sesiMemoriAktif);
        const btnFloatEl = document.getElementById('btnPulihkanChat');
        const btnFloatLabel = document.getElementById('btnPulihkanChatLabel');
        const bannerEl = document.getElementById('active-chat-session-banner');
        const bannerStatusEl = document.getElementById('activeChatBannerStatus');
        const bannerTitleEl = document.getElementById('activeChatBannerTitle');
        const btnBannerCancel = document.getElementById('btnBannerCancelChat');

        if (hasActiveSession && !isChatCurrentlyOpen) {
            const namaDriver = String(
                parsedSesi?.namaDriver ||
                window.BAGANTARA_DRIVER?.nama ||
                window.BAGANTARA_PRELOCKED_DRIVER?.nama ||
                'Pengemudi'
            ).trim();
            const idTiketShort = parsedSesi?.idTiket ? String(parsedSesi.idTiket).substring(0, 8) : '';
            const statusSesi = String(parsedSesi?.status || 'WAITING').toUpperCase();
            const isAcceptedStage = ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(statusSesi);
            const bannerIconEl = document.getElementById('activeChatBannerIcon');

            if (btnFloatEl) {
                btnFloatEl.classList.remove('hidden');
            }
            if (btnFloatLabel) {
                btnFloatLabel.textContent = isAcceptedStage ? 'KEMBALI KE OBROLAN' : 'BUKA RUANG OBROLAN';
            }

            if (bannerEl) {
                bannerEl.classList.remove('hidden', 'is-waiting', 'is-accepted', 'is-arrived', 'is-in-progress');
                if (statusSesi === 'ACCEPTED') {
                    bannerEl.classList.add('is-accepted');
                } else if (statusSesi === 'ARRIVED') {
                    bannerEl.classList.add('is-arrived');
                } else if (statusSesi === 'IN_PROGRESS') {
                    bannerEl.classList.add('is-in-progress');
                } else {
                    bannerEl.classList.add('is-waiting');
                }
            }
            if (bannerStatusEl) {
                if (statusSesi === 'ACCEPTED') {
                    bannerStatusEl.textContent = 'PENGEMUDI MENUJU TITIK JEMPUT';
                    bannerStatusEl.style.color = '#38bdf8';
                } else if (statusSesi === 'ARRIVED') {
                    bannerStatusEl.textContent = 'PENGEMUDI SUDAH SAMPAI DI LOKASI JEMPUT';
                    bannerStatusEl.style.color = '#ceab6b';
                } else if (statusSesi === 'IN_PROGRESS') {
                    bannerStatusEl.textContent = 'DALAM PERJALANAN MENUJU TUJUAN';
                    bannerStatusEl.style.color = '#10b981';
                } else {
                    bannerStatusEl.textContent = '⏳ MENUNGGU KONFIRMASI DRIVER';
                    bannerStatusEl.style.color = 'var(--neon-gold)';
                }
            }
            if (bannerIconEl && bannerIconEl.parentElement) {
                const iconWrap = bannerIconEl.parentElement;
                if (statusSesi === 'ACCEPTED') {
                    bannerIconEl.className = 'fa-solid fa-motorcycle';
                    iconWrap.style.background = 'rgba(56, 189, 248, 0.18)';
                    iconWrap.style.borderColor = '#38bdf8';
                    iconWrap.style.color = '#38bdf8';
                } else if (statusSesi === 'ARRIVED') {
                    bannerIconEl.className = 'fa-solid fa-location-dot';
                    iconWrap.style.background = 'rgba(206, 171, 107, 0.2)';
                    iconWrap.style.borderColor = '#ceab6b';
                    iconWrap.style.color = '#ceab6b';
                } else if (statusSesi === 'IN_PROGRESS') {
                    bannerIconEl.className = 'fa-solid fa-route';
                    iconWrap.style.background = 'rgba(16, 185, 129, 0.18)';
                    iconWrap.style.borderColor = '#10b981';
                    iconWrap.style.color = '#10b981';
                } else {
                    bannerIconEl.className = 'fa-solid fa-comments';
                    iconWrap.style.background = 'rgba(212, 175, 55, 0.16)';
                    iconWrap.style.borderColor = 'var(--neon-gold)';
                    iconWrap.style.color = 'var(--neon-gold)';
                }
            }
            if (bannerTitleEl) {
                const stageSub = statusSesi === 'ACCEPTED'
                    ? 'Menuju Titik Jemput'
                    : (statusSesi === 'ARRIVED'
                        ? 'Sudah di Lokasi Jemput'
                        : (statusSesi === 'IN_PROGRESS' ? 'Menuju Lokasi Tujuan' : 'Menunggu Konfirmasi'));
                bannerTitleEl.textContent = idTiketShort
                    ? `${namaDriver} • ${stageSub} (#${idTiketShort})`
                    : `${namaDriver} • ${stageSub}`;
            }
            if (btnBannerCancel) {
                btnBannerCancel.style.display = isAcceptedStage ? 'none' : 'inline-flex';
            }
        } else {
            if (btnFloatEl) btnFloatEl.classList.add('hidden');
            if (bannerEl) bannerEl.classList.add('hidden');
        }

        try {
            const realTop = (typeof globalThis !== 'undefined' && globalThis.parent) ? globalThis.parent : null;
            if (realTop && realTop !== globalThis && typeof realTop.postMessage === 'function') {
                realTop.postMessage({
                    type: 'BGN_BRIDGE_CHAT_STATE',
                    sourceModule: 'transport-driver',
                    active: hasActiveSession,
                    isChatOpen: isChatCurrentlyOpen,
                    session: parsedSesi || null
                }, '*');
            }
        } catch (e) {}
    };
    window.periksaSesiChatAktif();

    const triggerRestoreChatRoom = () => {
        if (window.ChatHandshake && typeof window.ChatHandshake.tampilkanKembaliRuangKomunikasi === 'function') {
            window.ChatHandshake.tampilkanKembaliRuangKomunikasi();
            return;
        }
        const panel = document.getElementById('panel-komunikasi-utama');
        if (panel) {
            if (window.ChatHandshake && typeof window.ChatHandshake.aktifkanKoneksiChat === 'function') {
                window.ChatHandshake.aktifkanKoneksiChat();
            }
            panel.style.display = 'flex';
            panel.style.animation = 'none';
            void panel.offsetWidth;
            panel.style.animation = 'slideUp 0.28s cubic-bezier(0.4, 0, 0.2, 1)';
            window.syncChatAndBottomNavState();
            window.armBgtHistoryGuard('chat');

            const dotNotif = document.getElementById('chat-notif-dot-global');
            if (dotNotif) dotNotif.classList.add('hidden-state');
        } else if (window.ChatHandshake && typeof window.ChatHandshake.pulihkanSesiAktif === 'function') {
            window.ChatHandshake.pulihkanSesiAktif(true);
            const dotNotif = document.getElementById('chat-notif-dot-global');
            if (dotNotif) dotNotif.classList.add('hidden-state');
        }
    };

    if (btnPulihkanChat) {
        btnPulihkanChat.addEventListener('click', triggerRestoreChatRoom);
    }

    document.getElementById('btnBannerOpenChat')?.addEventListener('click', triggerRestoreChatRoom);

    document.getElementById('btnBannerCancelChat')?.addEventListener('click', () => {
        if (window.ChatHandshake && typeof window.ChatHandshake.batalkanSesi === 'function') {
            const wAlerts = window.BGN_CONFIG?.wording?.alerts || {};
            window.ChatHandshake.batalkanSesi(wAlerts.chat_cancel_manual || "Pesanan dibatalkan.");
        }
    });

    // 1. MESIN TEMA & PENGATURAN TERPUSAT (window.BGNSettings)
    const btnThemeToggle = document.getElementById('btnThemeToggleSettings');
    let wakeLockInstance = null;

    const requestWakeLock = async () => {
        if (!window.BGNSettings || window.BGNSettings.wakeLock === false) {
            if (wakeLockInstance) {
                try { await wakeLockInstance.release(); } catch (e) {}
                wakeLockInstance = null;
            }
            return;
        }
        if ('wakeLock' in navigator) {
            try { wakeLockInstance = await navigator.wakeLock.request('screen'); } catch (err) {}
        }
    };

    function applyThemeIcon() {
        if (!btnThemeToggle) return;
        let iconEl = btnThemeToggle.querySelector('i');
        if (!iconEl) {
            iconEl = document.createElement('i');
            btnThemeToggle.appendChild(iconEl);
        }
        
        const isLight = document.body.classList.contains('light-mode');
        iconEl.className = ''; 
        
        if (isLight) {
            iconEl.classList.add('fa-solid', 'fa-sun');
            iconEl.style.color = '#f59e0b';
            iconEl.style.textShadow = '0 0 10px rgba(245, 158, 11, 0.5)';
        } else {
            iconEl.classList.add('fa-solid', 'fa-moon');
            iconEl.style.color = '#60a5fa';
            iconEl.style.textShadow = '0 0 10px rgba(96, 165, 250, 0.5)';
        }
    }

    function updateTheme() {
        const mode = window.BGNSettings ? window.BGNSettings.theme : 'auto';
        if (mode === 'light') {
            document.body.classList.add('light-mode');
        } else if (mode === 'dark') {
            document.body.classList.remove('light-mode');
        } else {
            const sysCtrl = window.BGN_CONFIG?.rules_app?.system_controls;
            const startHour = sysCtrl ? sysCtrl.night_mode_start_hour : 18;
            const endHour = sysCtrl ? sysCtrl.night_mode_end_hour : 6;
            const hour = new Date().getHours();
            const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
            if (hour >= startHour || hour < endHour || prefersDark) document.body.classList.remove('light-mode');
            else document.body.classList.add('light-mode');
        }
        applyThemeIcon();
    }

    function refreshSavedVaultCountUI() {
        const countBadge = document.getElementById('settingsVaultCountBadge');
        if (!countBadge) return;
        let totalSaved = 0;
        if (window.GeocoderAPI && typeof window.GeocoderAPI.getRecentPlaces === 'function') {
            totalSaved = window.GeocoderAPI.getRecentPlaces().length;
        }
        countBadge.textContent = `${totalSaved} Lokasi Tersimpan`;
    }

    function syncSettingsControlsUI() {
        if (!window.BGNSettings) return;
        const s = window.BGNSettings;

        document.querySelectorAll('.theme-mode-pill').forEach(pill => {
            const pillTheme = pill.getAttribute('data-theme-mode');
            if (pillTheme === s.theme) pill.classList.add('active');
            else pill.classList.remove('active');
        });

        const mapToggle = [
            ['toggleSettingHaptic', s.haptic],
            ['toggleSettingSound', s.sound],
            ['toggleSettingWakeLock', s.wakeLock],
            ['toggleSettingLiteMode', s.liteMode]
        ];
        mapToggle.forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.checked = Boolean(val);
        });

        refreshSavedVaultCountUI();
    }

    window.applyBgnSettingsToRuntime = function() {
        if (!window.BGNSettings) return;
        updateTheme();
        document.body.classList.toggle('lite-performance-mode', Boolean(window.BGNSettings.liteMode));
        requestWakeLock();
        syncSettingsControlsUI();
    };

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { 
        if (!window.BGNSettings || window.BGNSettings.theme === 'auto') updateTheme(); 
    });

    if (btnThemeToggle) {
        btnThemeToggle.addEventListener('click', () => {
            const isCurrentlyLight = document.body.classList.contains('light-mode');
            window.BGNSettings.set('theme', isCurrentlyLight ? 'dark' : 'light');
        });
    }

    document.querySelectorAll('.theme-mode-pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const mode = pill.getAttribute('data-theme-mode') || 'auto';
            window.BGNSettings.set('theme', mode);
        });
    });

    document.getElementById('toggleSettingHaptic')?.addEventListener('change', (e) => {
        window.BGNSettings.set('haptic', e.target.checked);
        if (e.target.checked) window.triggerHaptic(20);
    });

    document.getElementById('toggleSettingSound')?.addEventListener('change', (e) => {
        window.BGNSettings.set('sound', e.target.checked);
    });

    document.getElementById('toggleSettingWakeLock')?.addEventListener('change', (e) => {
        window.BGNSettings.set('wakeLock', e.target.checked);
    });

    document.getElementById('toggleSettingLiteMode')?.addEventListener('change', (e) => {
        window.BGNSettings.set('liteMode', e.target.checked);
    });

    document.getElementById('btnClearLocalVaultSettings')?.addEventListener('click', () => {
        if (window.GeocoderAPI && typeof window.GeocoderAPI.clearAllSavedPlaces === 'function') {
            window.GeocoderAPI.clearAllSavedPlaces();
        }
        if (window.UIManager && typeof window.UIManager._renderQuickFareVaultChips === 'function') {
            window.UIManager._renderQuickFareVaultChips();
        }
        refreshSavedVaultCountUI();
        if (window.UIManager && typeof window.UIManager.alert === 'function') {
            window.UIManager.alert('Seluruh riwayat pencarian rute dan brankas lokasi tersimpan di perangkat ini telah berhasil dibersihkan.', 'MEMORI LOKAL DIBERSIHKAN');
        }
    });

    window.applyBgnSettingsToRuntime();

    // 2. SISTEM NAVIGASI SPA (NON-BLOCKING & ANTI-DEADLOCK)
    window.spaNavigateTo = function(viewId) {
        const resolvedId = (viewId === 'view-dashboard') ? 'view-mitra-map' : viewId;
        const views = document.querySelectorAll('.spa-view');
        views.forEach(view => {
            if (view.id === resolvedId) {
                view.classList.remove('hidden-view');
                view.classList.add('active-view');
            } else {
                view.classList.remove('active-view');
                view.classList.add('hidden-view');
            }
        });

        const orderPanel = document.getElementById('dynamicOrderPanel');
        if (orderPanel) {
            orderPanel.style.display = (resolvedId === 'view-map') ? 'block' : 'none';
        }

        if (resolvedId !== 'view-mitra-map') {
            window.armBgtHistoryGuard(resolvedId);
        }

        window.syncChatAndBottomNavState();
        if (window.periksaSesiChatAktif) window.periksaSesiChatAktif();
    };

    // 3. LOGIKA NAVIGASI BAWAH 3-TAB SIMETRIS
    const navHome = document.getElementById('navHome');
    const navAbout = document.getElementById('navAbout');
    const navSettings = document.getElementById('navSettings');
    const settingsOverlay = document.getElementById('settings-overlay');

    function resetNavs() {
        if (navHome) navHome.classList.remove('active');
        if (navAbout) navAbout.classList.remove('active');
        if (navSettings) navSettings.classList.remove('active');
    }

    if (navHome) {
        navHome.addEventListener('click', (e) => {
            e.preventDefault();
            resetNavs();
            navHome.classList.add('active');
            window.spaNavigateTo('view-mitra-map');

            const adaSesiChat = localStorage.getItem('bgt_active_chat') || (window.ChatHandshake && typeof window.ChatHandshake.isSesiAktif === 'function' && window.ChatHandshake.isSesiAktif());
            if (!adaSesiChat && window.SystemReset) {
                window.SystemReset();
            } else if (window.UIManager && typeof window.UIManager.initMitraCatalog === 'function') {
                window.UIManager.loadMitraCatalog(false, true);
            }

            if (window.periksaSesiChatAktif) window.periksaSesiChatAktif();
        });
    }

    if (navAbout) {
        navAbout.addEventListener('click', (e) => {
            e.preventDefault();
            resetNavs();
            navAbout.classList.add('active');
            window.spaNavigateTo('view-about');
        });
    }

    if (navSettings) {
        navSettings.addEventListener('click', (e) => {
            e.preventDefault();
            resetNavs();
            navSettings.classList.add('active');
            syncSettingsControlsUI();
            if (settingsOverlay) {
                settingsOverlay.classList.remove('hidden');
                window.armBgtHistoryGuard('settings');
            }
        });
    }

    document.getElementById('btnBackFromAbout')?.addEventListener('click', () => {
        resetNavs();
        if (navHome) navHome.classList.add('active');
        window.spaNavigateTo('view-mitra-map');
    });

    document.getElementById('btnCloseSettings')?.addEventListener('click', () => {
        if (settingsOverlay) settingsOverlay.classList.add('hidden');
        resetNavs();
        const activeView = document.querySelector('.spa-view.active-view');
        const activeId = activeView ? activeView.id : 'view-mitra-map';
        if (activeId === 'view-about' && navAbout) navAbout.classList.add('active');
        else if (navHome) navHome.classList.add('active');
    });

    // 4. GERBANG LOKASI GPS PINTAR ANTI-MACET
    function initServiceFlagsOnCatalog() {
        try {
            const services = window.BGN_CONFIG?.layanan?.services;
            const defaultFilter = window.BGN_CONFIG?.rules_app?.radar_mitra?.default_filter || 'ALL';
            if (!services) return;
            document.querySelectorAll('#catalogFilterContainer .catalog-chip, #radarFilterContainer .radar-chip').forEach(chip => {
                const flt = chip.getAttribute('data-filter');
                if (flt && flt !== defaultFilter && services[flt] === false) {
                    chip.style.display = 'none';
                }
            });
        } catch (err) {}
    }

    let isCheckingGpsNow = false;
    let gpsHardWatchdogTimer = null;
    let bootSelfHealTimer = null;

    window.hideMandatoryGpsOverlay = function() {
        const appContainer = document.getElementById('app-container');
        const overlay = document.getElementById('gps-mandatory-lock-overlay');
        document.body.classList.remove('gps-frozen-lock');
        if (appContainer) {
            appContainer.removeAttribute('inert');
            appContainer.removeAttribute('aria-hidden');
        }
        if (overlay) {
            overlay.classList.add('hidden');
        }
    };

    window.enforceMandatoryGpsLock = function(reasonCode = 'GPS_OFF') {
        if (reasonCode === 'VERIFYING') {
            window.hideMandatoryGpsOverlay();
            return;
        }

        const hasActiveChat = Boolean(
            localStorage.getItem('bgt_active_chat') ||
            (window.ChatHandshake && typeof window.ChatHandshake.isSesiAktif === 'function' && window.ChatHandshake.isSesiAktif()) ||
            document.getElementById('panel-komunikasi-utama')
        );
        if (hasActiveChat) {
            window.unlockWithActiveZoneFallback();
            return;
        }

        if (reasonCode !== 'PERMISSION_DENIED' && window.BAGANTARA_USER_GPS_COORD && !isNaN(parseFloat(window.BAGANTARA_USER_GPS_COORD.lat))) {
            window.hideMandatoryGpsOverlay();
            return;
        }

        const overlay = document.getElementById('gps-mandatory-lock-overlay');
        const cardBox = document.getElementById('gpsLockCardBox');
        const iconEl = document.getElementById('gpsLockIcon');
        const badgeEl = document.getElementById('gpsLockBadge');
        const titleEl = document.getElementById('gpsLockTitle');
        const descEl = document.getElementById('gpsLockDesc');
        const stepsBox = document.getElementById('gpsLockStepsBox');
        const stepsContent = document.getElementById('gpsLockStepsContent');
        const btnRetry = document.getElementById('btnRetryMandatoryGps');
        const btnBypass = document.getElementById('btnBypassGpsUseZoneCenter');

        if (overlay) {
            overlay.classList.remove('hidden');
        }
        if (iconEl) {
            iconEl.className = 'fa-solid fa-location-dot gps-icon-pulse';
        }
        if (cardBox) {
            cardBox.classList.remove('is-verifying');
            cardBox.classList.add('is-locked');
        }
        if (badgeEl) {
            badgeEl.textContent = '📍 LOKASI GPS DIPERLUKAN';
            badgeEl.style.background = 'var(--danger-bg-soft)';
            badgeEl.style.color = 'var(--danger-accent)';
            badgeEl.style.borderColor = 'rgba(239, 68, 68, 0.45)';
        }

        if (reasonCode === 'PERMISSION_DENIED') {
            if (titleEl) titleEl.textContent = 'IZIN LOKASI (GPS) BELUM DIAKTIFKAN';
            if (descEl) {
                descEl.innerHTML = 'Untuk menampilkan pengemudi terdekat dan menghitung rute perjalanan secara presisi, mohon izinkan akses lokasi (GPS) pada browser Anda.';
            }
            if (stepsContent) {
                stepsContent.innerHTML = `
                    1. Pastikan <b>Lokasi / GPS</b> di bar status atas HP Anda sudah menyala.<br>
                    2. Ketuk ikon <b>Pengaturan Situs</b> di sebelah kiri alamat web di atas, lalu pastikan izin <b>Lokasi</b> berstatus <b>Izinkan (Allow)</b>.<br>
                    3. Tekan tombol di bawah untuk memuat katalog.
                `;
            }
        } else {
            if (titleEl) titleEl.textContent = 'SINKRONKAN LOKASI PERANGKAT';
            if (descEl) {
                descEl.innerHTML = 'Sinyal lokasi GPS perangkat sedang membutuhkan penyegaran atau berada di dalam ruangan. Pastikan GPS menyala lalu tekan tombol di bawah.';
            }
            if (stepsContent) {
                stepsContent.innerHTML = `
                    1. Pastikan tombol <b>Lokasi / GPS</b> pada HP Anda aktif.<br>
                    2. Tekan <b>Periksa Ulang Lokasi GPS</b> di bawah, atau gunakan <b>Mode Cepat Pusat Wilayah</b> jika Anda sedang berada di dalam ruangan.
                `;
            }
        }

        if (stepsBox) stepsBox.classList.remove('hidden');
        if (btnRetry) {
            btnRetry.classList.remove('hidden');
            btnRetry.disabled = false;
            btnRetry.innerHTML = `<i class="fa-solid fa-location-dot"></i> PERIKSA ULANG LOKASI GPS`;
        }
        if (btnBypass) {
            btnBypass.classList.remove('hidden');
        }
    };

    const evaluateZoneAndUnlock = (userLat, userLng, isFallbackCenter = false) => {
        const nLat = parseFloat(userLat);
        const nLng = parseFloat(userLng);
        if (isNaN(nLat) || isNaN(nLng)) {
            const zc = (window.ConfigManager && typeof window.ConfigManager.getActiveZoneCenter === 'function')
                ? window.ConfigManager.getActiveZoneCenter()
                : { lat: -7.768049, lng: 112.196514 };
            return evaluateZoneAndUnlock(zc.lat, zc.lng, true);
        }

        const zoneData = window.BGN_CONFIG?.zones;
        const earthR = window.BGN_CONFIG?.rules_app?.system_controls?.earth_radius_km || 6371;

        const getHaversine = (lat1, lon1, lat2, lon2) => {
            if (window.AegisEngine && typeof window.AegisEngine.calculateDistance === 'function') {
                return window.AegisEngine.calculateDistance(lat1, lon1, lat2, lon2);
            }
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            return earthR * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
        };

        const wasVerifiedBefore = window.BAGANTARA_GPS_VERIFIED === true;
        window.BAGANTARA_GPS_VERIFIED = true;
        window.BAGANTARA_USER_GPS_COORD = { lat: nLat, lng: nLng, ts: Date.now(), isFallback: Boolean(isFallbackCenter) };
        if (!window.BAGANTARA_ACTIVE_COORD || window.BAGANTARA_ACTIVE_COORD.isFallback) {
            window.BAGANTARA_ACTIVE_COORD = { lat: nLat, lng: nLng, isFallback: Boolean(isFallbackCenter) };
        }

        if (!isFallbackCenter && typeof window.saveLastValidGpsCoord === 'function') {
            window.saveLastValidGpsCoord(nLat, nLng);
        }

        let isInsideZone = false;
        if (zoneData && Array.isArray(zoneData.active_zones)) {
            for (const zone of zoneData.active_zones) {
                if (zone.is_open) {
                    const dist = getHaversine(nLat, nLng, zone.center.lat, zone.center.lng);
                    if (dist <= zone.radius_km) {
                        isInsideZone = true;
                        window.BAGANTARA_ACTIVE_ZONE_ID = zone.zone_id;
                        if (window.BGN_CONFIG?.settings?.map_config) {
                            window.BGN_CONFIG.settings.map_config.default_center = {
                                lat: parseFloat(zone.center.lat),
                                lng: parseFloat(zone.center.lng)
                            };
                        }
                        break;
                    }
                }
            }
        }
        window.BAGANTARA_ZONE_LOCKED = !isInsideZone;

        window.hideMandatoryGpsOverlay();

        const catalogContainer = document.getElementById('mitraCatalogContainer');
        const statusText = document.getElementById('mitraMapStatusText');
        const addrEl = document.getElementById('catalogUserAddress') || document.getElementById('radarUserAddress');
        const isCatalogEmptyOrStuck = Boolean(
            !catalogContainer ||
            catalogContainer.children.length === 0 ||
            (statusText && statusText.innerText.toUpperCase().includes('MEMUAT')) ||
            (addrEl && addrEl.textContent.toLowerCase().includes('mencari lokasi'))
        );

        if (!wasVerifiedBefore || isCatalogEmptyOrStuck) {
            if (window.UIManager && typeof window.UIManager.initMitraCatalog === 'function') {
                window.UIManager.initMitraCatalog();
            }
        }
        if (window.periksaSesiChatAktif) window.periksaSesiChatAktif();
    };

    window.unlockWithActiveZoneFallback = function() {
        const saved = typeof window.getLastValidGpsCoord === 'function' ? window.getLastValidGpsCoord() : null;
        if (saved && !isNaN(saved.lat) && !isNaN(saved.lng)) {
            evaluateZoneAndUnlock(saved.lat, saved.lng, false);
            return;
        }
        const zc = (window.ConfigManager && typeof window.ConfigManager.getActiveZoneCenter === 'function')
            ? window.ConfigManager.getActiveZoneCenter()
            : { lat: -7.768049, lng: 112.196514 };
        evaluateZoneAndUnlock(zc.lat, zc.lng, true);
    };

    const runSilentPrecisionGpsUpgrade = () => {
        if (!navigator.geolocation) return;
        try {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const pLat = pos.coords.latitude;
                    const pLng = pos.coords.longitude;
                    if (isNaN(pLat) || isNaN(pLng)) return;
                    const prev = window.BAGANTARA_USER_GPS_COORD;
                    window.BAGANTARA_USER_GPS_COORD = { lat: pLat, lng: pLng, ts: Date.now(), isFallback: false };
                    if (typeof window.saveLastValidGpsCoord === 'function') {
                        window.saveLastValidGpsCoord(pLat, pLng);
                    }
                    const addrEl = document.getElementById('catalogUserAddress') || document.getElementById('radarUserAddress');
                    if (addrEl) {
                        const zoneName = window.BAGANTARA_ACTIVE_ZONE_ID ? `${window.BAGANTARA_ACTIVE_ZONE_ID} • ` : '';
                        addrEl.textContent = `${zoneName}${pLat.toFixed(5)}, ${pLng.toFixed(5)}`;
                        if (window.GeocoderAPI && typeof window.GeocoderAPI.reverseGeocode === 'function') {
                            window.GeocoderAPI.reverseGeocode(pLat, pLng, false).then((resolvedAddr) => {
                                if (resolvedAddr && !resolvedAddr.startsWith('Titik Peta') && addrEl) {
                                    addrEl.textContent = `${zoneName}${resolvedAddr}`;
                                }
                            }).catch(() => {});
                        }
                    }
                    if (!prev || prev.isFallback) {
                        evaluateZoneAndUnlock(pLat, pLng, false);
                    }
                },
                () => {},
                {
                    enableHighAccuracy: true,
                    timeout: 7000,
                    maximumAge: 30000
                }
            );
        } catch (e) {}
    };

    window.verifyMandatoryHardwareGps = function(isManualRetry = false) {
        if (!navigator.geolocation) {
            window.unlockWithActiveZoneFallback();
            return;
        }

        if (isCheckingGpsNow && !isManualRetry) return;
        isCheckingGpsNow = true;
        if (gpsHardWatchdogTimer) {
            clearTimeout(gpsHardWatchdogTimer);
            gpsHardWatchdogTimer = null;
        }

        const btnRetry = document.getElementById('btnRetryMandatoryGps');
        if (isManualRetry && btnRetry) {
            btnRetry.disabled = true;
            btnRetry.innerHTML = `<i class="fa-solid fa-location-dot gps-icon-pulse"></i> MENYINKRONKAN GPS...`;
        }

        let isSettled = false;

        const handleGpsSuccess = (lat, lng) => {
            if (isSettled) return;
            isSettled = true;
            isCheckingGpsNow = false;
            if (gpsHardWatchdogTimer) {
                clearTimeout(gpsHardWatchdogTimer);
                gpsHardWatchdogTimer = null;
            }
            evaluateZoneAndUnlock(lat, lng, false);
            setTimeout(runSilentPrecisionGpsUpgrade, 600);
        };

        const handleGpsFailure = async (err) => {
            if (isSettled) return;
            isSettled = true;
            isCheckingGpsNow = false;
            if (gpsHardWatchdogTimer) {
                clearTimeout(gpsHardWatchdogTimer);
                gpsHardWatchdogTimer = null;
            }

            const saved = typeof window.getLastValidGpsCoord === 'function' ? window.getLastValidGpsCoord() : null;
            if (window.BAGANTARA_USER_GPS_COORD && !isNaN(parseFloat(window.BAGANTARA_USER_GPS_COORD.lat))) {
                evaluateZoneAndUnlock(window.BAGANTARA_USER_GPS_COORD.lat, window.BAGANTARA_USER_GPS_COORD.lng, Boolean(window.BAGANTARA_USER_GPS_COORD.isFallback));
                return;
            }
            if (saved && !isNaN(saved.lat) && !isNaN(saved.lng)) {
                evaluateZoneAndUnlock(saved.lat, saved.lng, false);
                return;
            }

            let permState = 'prompt';
            if (navigator.permissions && typeof navigator.permissions.query === 'function') {
                try {
                    const p = await navigator.permissions.query({ name: 'geolocation' });
                    permState = p.state;
                } catch (e) {}
            }

            if (permState === 'granted' && (!err || err.code !== 1)) {
                window.unlockWithActiveZoneFallback();
                setTimeout(runSilentPrecisionGpsUpgrade, 1200);
                return;
            }

            const reason = (err && err.code === 1) || permState === 'denied' ? 'PERMISSION_DENIED' : 'GPS_OFF';
            window.enforceMandatoryGpsLock(reason);
        };

        gpsHardWatchdogTimer = setTimeout(() => {
            handleGpsFailure({ code: 3, message: 'HARD_WATCHDOG_TIMEOUT' });
        }, 4500);

        try {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    handleGpsSuccess(pos.coords.latitude, pos.coords.longitude);
                },
                (err) => {
                    handleGpsFailure(err);
                },
                {
                    enableHighAccuracy: false,
                    timeout: 4000,
                    maximumAge: 180000
                }
            );
        } catch (err) {
            handleGpsFailure(err);
        }
    };

    function initGeoGatekeeper() {
        const btnRetry = document.getElementById('btnRetryMandatoryGps');
        if (btnRetry && !btnRetry.dataset.boundGpsRetry) {
            btnRetry.dataset.boundGpsRetry = 'true';
            btnRetry.addEventListener('click', () => {
                window.verifyMandatoryHardwareGps(true);
            });
        }

        const btnBypass = document.getElementById('btnBypassGpsUseZoneCenter');
        if (btnBypass && !btnBypass.dataset.boundGpsBypass) {
            btnBypass.dataset.boundGpsBypass = 'true';
            btnBypass.addEventListener('click', () => {
                window.unlockWithActiveZoneFallback();
                setTimeout(runSilentPrecisionGpsUpgrade, 500);
            });
        }

        const cachedCoord = typeof window.getLastValidGpsCoord === 'function' ? window.getLastValidGpsCoord() : null;
        if (cachedCoord && !isNaN(cachedCoord.lat) && !isNaN(cachedCoord.lng)) {
            evaluateZoneAndUnlock(cachedCoord.lat, cachedCoord.lng, false);
        }

        if (navigator.permissions && typeof navigator.permissions.query === 'function') {
            navigator.permissions.query({ name: 'geolocation' }).then((permStatus) => {
                permStatus.onchange = () => {
                    if (permStatus.state === 'granted') {
                        window.verifyMandatoryHardwareGps(true);
                    } else if (permStatus.state === 'denied') {
                        window.enforceMandatoryGpsLock('PERMISSION_DENIED');
                    }
                };
            }).catch(() => {});
        }

        window.verifyMandatoryHardwareGps(false);

        if (bootSelfHealTimer) clearTimeout(bootSelfHealTimer);
        bootSelfHealTimer = setTimeout(() => {
            const overlay = document.getElementById('gps-mandatory-lock-overlay');
            const isOverlayVisible = overlay && !overlay.classList.contains('hidden');
            const catalogContainer = document.getElementById('mitraCatalogContainer');
            const statusText = document.getElementById('mitraMapStatusText');
            const isStuckLoading = !catalogContainer || catalogContainer.children.length === 0 || (statusText && statusText.innerText.toUpperCase().includes('MEMUAT'));

            if (!isOverlayVisible && isStuckLoading) {
                window.unlockWithActiveZoneFallback();
            }
        }, 3500);
    }

    // 5. MITIGASI WAKE LOCK & SINKRONISASI LAYOUT SAAT KEMBALI KE BROWSER
    requestWakeLock();
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            if (!window.BGNSettings || window.BGNSettings.wakeLock !== false) {
                await requestWakeLock();
            }
            window.syncChatAndBottomNavState();
            if (window.periksaSesiChatAktif) window.periksaSesiChatAktif();
            if (!window.BAGANTARA_GPS_VERIFIED) {
                window.verifyMandatoryHardwareGps(false);
            } else {
                runSilentPrecisionGpsUpgrade();
            }
        }
    });

    window.addEventListener('pageshow', () => {
        window.syncChatAndBottomNavState();
        if (window.periksaSesiChatAktif) window.periksaSesiChatAktif();
        if (!window.BAGANTARA_GPS_VERIFIED) {
            window.verifyMandatoryHardwareGps(false);
        }
    });

    // 6. JEMBATAN SINKRONISASI LINTAS-MODUL (BagantaraHostBridge - transport-driver)
    window.addEventListener('message', (event) => {
        const msg = event && event.data;
        if (!msg || typeof msg !== 'object' || !msg.type) return;

        if (msg.type === 'BGN_BRIDGE_GPS_SYNC') {
            const lat = parseFloat(msg.lat);
            const lng = parseFloat(msg.lng);
            if (!isNaN(lat) && !isNaN(lng)) {
                window.saveLastValidGpsCoord(lat, lng, true);
                evaluateZoneAndUnlock(lat, lng, false);
            }
        } else if (msg.type === 'BGN_BRIDGE_THEME_SYNC') {
            if (window.BGNSettings) {
                const nextTheme = msg.themeMode || msg.theme || window.BGNSettings.theme;
                if (['auto', 'dark', 'light'].includes(nextTheme)) {
                    window.BGNSettings.theme = nextTheme;
                }
                if (typeof msg.haptic === 'boolean') window.BGNSettings.haptic = msg.haptic;
                if (typeof msg.liteMode === 'boolean') window.BGNSettings.liteMode = msg.liteMode;
                if (typeof msg.sound === 'boolean') window.BGNSettings.sound = msg.sound;
                if (typeof msg.wakeLock === 'boolean') window.BGNSettings.wakeLock = msg.wakeLock;
                window.BGNSettings.save(true);
                window.applyBgnSettingsToRuntime();
            }
        } else if (msg.type === 'BGN_BRIDGE_OPEN_CHAT_ROOM') {
            triggerRestoreChatRoom();
        }
    });

    const bootApplication = () => {
        window.applyBgnSettingsToRuntime();
        initServiceFlagsOnCatalog();
        initGeoGatekeeper();
        window.syncChatAndBottomNavState();
        if (window.periksaSesiChatAktif) window.periksaSesiChatAktif();
        window.dispatchEvent(new Event('app_ready'));
    };

    if (window.ConfigManager && window.ConfigManager.isLoaded) {
        bootApplication();
    } else {
        window.addEventListener('bgn_config_loaded', bootApplication, { once: true });
    }
});
