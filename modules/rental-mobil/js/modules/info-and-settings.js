// ==========================================================================
// FILE: js/modules/info-and-settings.js
// FUNGSI:
//   1. Pengendali Navigasi Bawah 3-Tab ("#mainBottomNav")
//   2. Hidrasi Halaman Pusat Informasi dari Brankas Terenkripsi (window.__BGN_CONFIG_VAULT__)
//   3. Pengaturan Perangkat (Tema Otomatis/Malam/Siang, Getar Sentuh,
//      Mode Hemat Baterai, & Segarkan Katalog Armada)
// ==========================================================================

import {
    bukaBrankasKonfigurasiPublik,
    bacaSetelanPerangkatPublik,
    simpanSetelanPerangkatPublik,
    simpanSharedGpsSuperApp,
    tutupPanelMediaMengambang,
    hancurkanSemuaIframeVideoAktif,
    bersihkanCacheEtagKatalogLokal,
    picuGetarPublik,
    tampilkanToastPublik
} from '../core/rtdb-etag-client.js';
import {
    pasangEventKatalogDanFilter,
    muatKatalogArmadaPublik
} from './catalog-view.js';
import { pasangEventKalkulatorBooking } from './booking-calculator.js';

export function terapkanSetelanPerangkatKeDOM() {
    const st = bacaSetelanPerangkatPublik();

    // Evaluasi Tema: auto (06:00-17:59 terang, 18:00-05:59 gelap), dark, atau light
    let useLight = false;
    if (st.themeMode === 'light') {
        useLight = true;
    } else if (st.themeMode === 'dark') {
        useLight = false;
    } else {
        const hour = new Date().getHours();
        useLight = (hour >= 6 && hour < 18);
    }

    document.body.classList.toggle('light-mode', useLight);
    document.body.classList.toggle('lite-performance-mode', Boolean(st.liteMode));

    document.querySelectorAll('.btn-theme-mode').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-theme-mode') === st.themeMode);
    });

    const chkHaptic = document.getElementById('toggleSettingHaptic');
    if (chkHaptic) chkHaptic.checked = Boolean(st.haptic);

    const chkLite = document.getElementById('toggleSettingLiteMode');
    if (chkLite) chkLite.checked = Boolean(st.liteMode);
}

export function renderPusatInformasiDariVault() {
    const container = document.getElementById('infoCenterVaultContainer');
    if (!container) return;

    const vault = bukaBrankasKonfigurasiPublik() || {};
    const infoSections = Array.isArray(vault.infoSections) ? vault.infoSections : [];

    container.innerHTML = '';
    infoSections.forEach((sec) => {
        const card = document.createElement('article');
        card.className = 'rounded-2xl p-4 sm:p-5 border space-y-2.5';
        card.style.background = 'var(--card-bg-1)';
        card.style.borderColor = 'var(--border-subtle)';
        card.innerHTML = `
            <div class="flex items-center gap-2.5 border-b pb-2.5" style="border-color: var(--border-subtle);">
                <i class="${sec.icon || 'fa-solid fa-circle-info'} text-[#c5a880] text-base"></i>
                <h3 class="font-display font-bold text-sm sm:text-base text-[#c5a880]">${sec.title || ''}</h3>
            </div>
            <div class="text-xs sm:text-sm leading-relaxed space-y-2" style="color: var(--text-sub);">${sec.html || ''}</div>
        `;
        container.appendChild(card);
    });
}

export function pasangEventNavigasiDanSetelan() {
    // Navigasi Bawah 3-Tab (#mainBottomNav)
    document.querySelectorAll('#mainBottomNav .bottom-nav-item').forEach((btn) => {
        btn.addEventListener('click', () => {
            picuGetarPublik(10);
            const targetId = btn.getAttribute('data-tab-target');
            if (!targetId) return;

            document.querySelectorAll('#mainBottomNav .bottom-nav-item').forEach((b) => {
                b.classList.remove('active');
            });
            btn.classList.add('active');

            document.querySelectorAll('.spa-tab-view').forEach((view) => {
                view.classList.toggle('hidden', view.id !== targetId);
            });
        });
    });

    // Pilihan Tema Otomatis / Malam / Siang
    document.querySelectorAll('.btn-theme-mode').forEach((btn) => {
        btn.addEventListener('click', () => {
            const mode = btn.getAttribute('data-theme-mode') || 'auto';
            const st = bacaSetelanPerangkatPublik();
            st.themeMode = mode;
            simpanSetelanPerangkatPublik(st);
            terapkanSetelanPerangkatKeDOM();
            picuGetarPublik(12);
            const labelMap = { auto: 'Otomatis', dark: 'Malam (Gelap)', light: 'Siang (Terang)' };
            tampilkanToastPublik(`Tema diubah ke mode ${labelMap[mode] || 'Otomatis'}.`);
        });
    });

    // Saklar Getar Sentuh
    const chkHaptic = document.getElementById('toggleSettingHaptic');
    if (chkHaptic) {
        chkHaptic.addEventListener('change', () => {
            const st = bacaSetelanPerangkatPublik();
            st.haptic = chkHaptic.checked;
            simpanSetelanPerangkatPublik(st);
            if (st.haptic) picuGetarPublik(15);
            tampilkanToastPublik(st.haptic ? 'Getar sentuh diaktifkan.' : 'Getar sentuh dimatikan.');
        });
    }

    // Saklar Mode Hemat Baterai
    const chkLite = document.getElementById('toggleSettingLiteMode');
    if (chkLite) {
        chkLite.addEventListener('change', () => {
            const st = bacaSetelanPerangkatPublik();
            st.liteMode = chkLite.checked;
            simpanSetelanPerangkatPublik(st);
            terapkanSetelanPerangkatKeDOM();
            picuGetarPublik(12);
            tampilkanToastPublik(st.liteMode ? 'Mode Hemat Baterai diaktifkan.' : 'Mode Visual Penuh diaktifkan.');
        });
    }

    // Tombol Segarkan Data Katalog
    const btnClearCache = document.getElementById('btnClearCatalogCache');
    if (btnClearCache) {
        btnClearCache.addEventListener('click', async () => {
            picuGetarPublik(18);
            const origHtml = btnClearCache.innerHTML;
            btnClearCache.disabled = true;
            btnClearCache.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-[#c5a880]"></i><span>Memuat Ulang Data...</span>';

            try {
                bersihkanCacheEtagKatalogLokal();
                if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                    navigator.serviceWorker.controller.postMessage({ type: 'BGN_CLEAR_IMAGE_CACHE' });
                }
                await muatKatalogArmadaPublik(false, true);
                btnClearCache.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-400"></i><span>Data Katalog Diperbarui</span>';
                tampilkanToastPublik('Data katalog terbaru berhasil dimuat.');
            } finally {
                setTimeout(() => {
                    btnClearCache.disabled = false;
                    btnClearCache.innerHTML = origHtml;
                }, 1400);
            }
        });
    }
}

function pasangJembatanSuperAppRental() {
    window.addEventListener('message', (event) => {
        const msg = event && event.data;
        if (!msg || typeof msg !== 'object' || !msg.type) return;

        if (msg.type === 'BGN_BRIDGE_HIBERNATE') {
            if (typeof window.tutupPanelMediaMengambang === 'function') {
                window.tutupPanelMediaMengambang();
            } else {
                tutupPanelMediaMengambang();
            }
            hancurkanSemuaIframeVideoAktif();
        } else if (msg.type === 'BGN_BRIDGE_GPS_SYNC') {
            const lat = Number(msg.lat);
            const lng = Number(msg.lng);
            if (Number.isFinite(lat) && Number.isFinite(lng)) {
                simpanSharedGpsSuperApp(lat, lng, true);
                muatKatalogArmadaPublik(false, false);
            }
        } else if (msg.type === 'BGN_BRIDGE_THEME_SYNC') {
            const currentSt = bacaSetelanPerangkatPublik();
            const nextTheme = msg.themeMode || msg.theme || currentSt.themeMode;
            const updatedSt = {
                themeMode: ['auto', 'dark', 'light'].includes(nextTheme) ? nextTheme : currentSt.themeMode,
                haptic: typeof msg.haptic === 'boolean' ? msg.haptic : currentSt.haptic,
                liteMode: typeof msg.liteMode === 'boolean' ? msg.liteMode : currentSt.liteMode
            };
            simpanSetelanPerangkatPublik(updatedSt, true);
            terapkanSetelanPerangkatKeDOM();
        }
    });
}

function inisialisasiAplikasiRentalPublik() {
    terapkanSetelanPerangkatKeDOM();
    renderPusatInformasiDariVault();
    pasangEventKatalogDanFilter();
    pasangEventKalkulatorBooking();
    pasangEventNavigasiDanSetelan();
    pasangJembatanSuperAppRental();
    muatKatalogArmadaPublik(false, false);
    // Master Service Worker dikelola penuh oleh Wadah Induk (Super-App Host Shell)
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inisialisasiAplikasiRentalPublik);
} else {
    inisialisasiAplikasiRentalPublik();
}
