// ==========================================================================
// FILE: js/modules/catalog-view.js (BAGANTARA RENTAL PUBLIK)
// FUNGSI:
//   1. Render Katalog Unit Mobil Skala 100.000+ Unit dengan Virtualized Chunk DOM
//      Rendering (BATCH_SIZE = 24 kartu per gelombang via DocumentFragment +
//      IntersectionObserver pada #catalogScrollSentinel)
//   2. Kartu Buka-Tutup Kompak ("#tpl-rental-unit-card") dengan Hidrasi Malas
//      (Lazy Drawer Hydration) Panggung Galeri Maks 2 Foto + 1 Video Opsional
//      & Panel Media Mengambang (#bgn-floating-media-viewer)
//   3. Grid Paket Waktu Sewa Dinamis (.tpl-dynamic-packages-grid) yang hanya
//      menampilkan paket berstatus ON (6 Jam, 12 Jam, Harian 24 Jam, Mingguan, Bulanan)
//   4. Sistem Filter Multi-Kriteria Mudah, Lebarkan Batch Aktif (Anti-Crash RAM),
//      & Tombol Segarkan Anti-Spam 10 Detik
// ==========================================================================

import {
    tarikKatalogPublikETag,
    kunciLokasiGpsWajib,
    formatRupiahPublik,
    pasangPerisaiGambar,
    renderPanggungMediaShowroom,
    hancurkanIframeDiKontainer,
    hancurkanSemuaIframeVideoAktif,
    tutupPanelMediaMengambang,
    picuGetarPublik,
    morphButtonPublik
} from '../core/rtdb-etag-client.js';
import { bukaLembarDetailDanKalkulator } from './booking-calculator.js';

const REFRESH_COOLDOWN_SECONDS = 10;
const BATCH_SIZE = 24;
const MAX_EXPAND_BATCH_CARDS = 48;

let allAvailableUnits = [];
let currentFilteredUnits = [];
let renderedCardCount = 0;
let catalogSentinelObserver = null;

const expandedCompositeIds = new Set();
let isAllPublicExpanded = false;

let activeCategoryTab = 'ALL';
let activeServiceFilter = 'ALL';
let activeTransFilter = 'ALL';
let activeSortOrder = 'NEAREST';
let activeSearchQuery = '';

let refreshCooldownRemaining = 0;
let refreshCooldownInterval = null;

function cocokDenganTabKategori(unit, catTab) {
    if (!catTab || catTab === 'ALL') return true;
    if (catTab === 'EV') {
        return unit.category === 'EV' || unit.category === 'Custom' || unit.fuelCode === 'E';
    }
    return unit.category === catTab;
}

function cocokDenganFilterKombinasi(unit) {
    if (activeServiceFilter === 'LEPAS_KUNCI') {
        if (unit.srvCode !== 1 && unit.srvCode !== 3) return false;
    } else if (activeServiceFilter === 'DENGAN_SOPIR') {
        if (unit.srvCode !== 2 && unit.srvCode !== 3) return false;
    }

    if (activeTransFilter === 'A' && unit.transCode !== 'A') return false;
    if (activeTransFilter === 'M' && unit.transCode !== 'M') return false;

    return true;
}

function cocokDenganPencarianTeks(unit, queryStr) {
    if (!queryStr) return true;
    const q = queryStr.toLowerCase().trim();
    const haystack = [
        unit.brandName,
        unit.carName,
        unit.fullDisplayName,
        unit.category,
        unit.friendlyCategory,
        unit.garageName,
        unit.garageArea,
        unit.transLabel,
        unit.fuelLabel,
        unit.srvLabel,
        unit.unitNote || '',
        String(unit.year),
        `${unit.seats} kursi`
    ].join(' ').toLowerCase();

    return haystack.includes(q);
}

function bandingkanJarakUnit(a, b) {
    const aHas = Number.isFinite(a.distanceKm);
    const bHas = Number.isFinite(b.distanceKm);
    if (aHas && bHas) {
        if (a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm;
        return a.sortBasePrice - b.sortBasePrice;
    }
    if (aHas && !bHas) return -1;
    if (!aHas && bHas) return 1;
    return a.sortBasePrice - b.sortBasePrice;
}

function urutkanDaftarUnitFilter(unitsArr) {
    const cloned = [...unitsArr];
    if (activeSortOrder === 'CHEAPEST') {
        cloned.sort((a, b) => {
            if (a.sortBasePrice !== b.sortBasePrice) return a.sortBasePrice - b.sortBasePrice;
            return bandingkanJarakUnit(a, b);
        });
    } else if (activeSortOrder === 'NEWEST') {
        cloned.sort((a, b) => {
            if (b.year !== a.year) return b.year - a.year;
            return bandingkanJarakUnit(a, b);
        });
    } else {
        cloned.sort(bandingkanJarakUnit);
    }
    return cloned;
}

function perbaruiBadgeJumlahFilterAktifUI() {
    let activeCount = 0;
    if (activeCategoryTab !== 'ALL') activeCount++;
    if (activeServiceFilter !== 'ALL') activeCount++;
    if (activeTransFilter !== 'ALL') activeCount++;
    if (activeSortOrder !== 'NEAREST') activeCount++;

    const badge = document.getElementById('badgeActiveFilterCount');
    if (badge) {
        badge.textContent = String(activeCount);
    }

    const summaryEl = document.getElementById('filterSummaryActiveText');
    if (summaryEl) {
        const sortTextMap = {
            NEAREST: 'Urutan Terdekat',
            CHEAPEST: 'Urutan Termurah',
            NEWEST: 'Urutan Tahun Terbaru'
        };
        const srvTextMap = {
            ALL: 'Semua Layanan',
            LEPAS_KUNCI: 'Lepas Kunci',
            DENGAN_SOPIR: 'Dengan Sopir'
        };
        const transTextMap = {
            ALL: 'Semua Transmisi',
            A: 'Matic',
            M: 'Manual'
        };
        summaryEl.textContent = `${srvTextMap[activeServiceFilter]} • ${transTextMap[activeTransFilter]} • ${sortTextMap[activeSortOrder]}`;
    }
}

function dapatkanDaftarUnitBatchAktif() {
    const limit = Math.min(
        currentFilteredUnits.length,
        Math.max(renderedCardCount || BATCH_SIZE, BATCH_SIZE),
        MAX_EXPAND_BATCH_CARDS
    );
    return currentFilteredUnits.slice(0, limit);
}

function perbaruiTombolLebarkanSemuaPublikUI() {
    const iconEl = document.getElementById('iconExpandAllPublic');
    const labelEl = document.getElementById('labelExpandAllPublic');
    if (!iconEl || !labelEl) return;

    const activeBatch = dapatkanDaftarUnitBatchAktif();
    isAllPublicExpanded = activeBatch.length > 0 && activeBatch.every((u) => expandedCompositeIds.has(u.compositeId));

    if (isAllPublicExpanded) {
        iconEl.className = 'fa-solid fa-angles-up text-[0.58rem]';
        labelEl.textContent = 'Ringkas Semua';
    } else {
        iconEl.className = 'fa-solid fa-angles-down text-[0.58rem]';
        labelEl.textContent = 'Lebarkan Semua';
    }
}

function bangunElemenKartuUnit(unit, tpl) {
    const clone = tpl.content.cloneNode(true);
    const cardEl = clone.querySelector('.rental-unit-card');
    const compactRow = clone.querySelector('.unit-card-compact-row');
    const drawerEl = clone.querySelector('.unit-card-drawer');
    const isExpanded = expandedCompositeIds.has(unit.compositeId);

    if (cardEl) {
        cardEl.setAttribute('data-composite-id', unit.compositeId);
        if (isExpanded) {
            cardEl.classList.add('is-expanded');
        }
    }
    if (drawerEl) {
        drawerEl.classList.toggle('hidden', !isExpanded);
    }

    // 1. Tampilan Ringkas (Default Tertutup)
    const thumbImg = clone.querySelector('.tpl-unit-thumb');
    pasangPerisaiGambar(thumbImg, unit.photoUrl || unit.photoRaw);

    const yearEl = clone.querySelector('.tpl-badge-year');
    if (yearEl) yearEl.textContent = String(unit.year);

    const nearestBadge = clone.querySelector('.tpl-nearest-badge');
    if (nearestBadge) {
        nearestBadge.classList.toggle('hidden', !unit.isNearestGarage);
    }

    const fullNameEl = clone.querySelector('.tpl-car-fullname');
    if (fullNameEl) fullNameEl.textContent = unit.fullDisplayName;

    const shortSrv = unit.srvCode === 1 ? 'Lepas Kunci' : (unit.srvCode === 2 ? 'Dengan Sopir' : 'Lepas Kunci / Sopir');
    const specsCompactEl = clone.querySelector('.tpl-compact-specs');
    if (specsCompactEl) {
        specsCompactEl.textContent = `${unit.transLabel} • ${unit.seats} Kursi • ${shortSrv}`;
    }

    const mediaBadgeEl = clone.querySelector('.tpl-media-badge');
    if (mediaBadgeEl) {
        if (unit.mediaBadgeText) {
            mediaBadgeEl.textContent = unit.mediaBadgeText;
            mediaBadgeEl.classList.remove('hidden');
        } else {
            mediaBadgeEl.classList.add('hidden');
        }
    }

    const price24Compact = clone.querySelector('.tpl-price-24h-compact');
    if (price24Compact) {
        price24Compact.innerHTML = `${formatRupiahPublik(unit.displayMainPrice)} <span class="text-[0.56rem] font-normal" style="color: var(--text-muted);">${unit.displayMainUnit}</span>`;
    }

    const distBadge = clone.querySelector('.tpl-distance-badge');
    if (distBadge) {
        if (Number.isFinite(unit.distanceKm)) {
            distBadge.textContent = `📍 Sekitar ${unit.distanceKm.toFixed(1)} km`;
        } else {
            distBadge.textContent = `📍 Area ${unit.garageArea}`;
        }
    }

    // 2. Hidrasi Laci Ekspansi (Hanya dihidrasi saat dibuka agar hemat memori untuk skala 100.000+ unit)
    let isDrawerHydrated = false;
    function hidrasiLaciKartuJikaPerlu() {
        if (isDrawerHydrated || !drawerEl) return;
        isDrawerHydrated = true;

        const stageBox = drawerEl.querySelector('.bgn-media-stage-box');
        const switcherBox = drawerEl.querySelector('.bgn-media-slot-switcher');
        const noteBoxEl = drawerEl.querySelector('.tpl-drawer-note-box');
        const noteEl = drawerEl.querySelector('.tpl-drawer-note');

        if (noteBoxEl && noteEl) {
            if (unit.unitNote) {
                noteEl.textContent = unit.unitNote;
                noteBoxEl.classList.remove('hidden');
            } else {
                noteBoxEl.classList.add('hidden');
            }
        }

        if (stageBox) {
            renderPanggungMediaShowroom(stageBox, switcherBox, unit, noteBoxEl, noteEl);
        }

        const drawerCat = drawerEl.querySelector('.tpl-drawer-cat');
        if (drawerCat) drawerCat.textContent = `${unit.friendlyCategory} • ${unit.seats} Kursi`;

        const drawerFuel = drawerEl.querySelector('.tpl-drawer-fuel');
        if (drawerFuel) drawerFuel.textContent = unit.fuelLabel;

        const drawerInc = drawerEl.querySelector('.tpl-drawer-inc');
        if (drawerInc) drawerInc.textContent = unit.incLabel;

        const promoRibbon = drawerEl.querySelector('.tpl-promo-ribbon');
        const promoTextEl = drawerEl.querySelector('.tpl-promo-text');
        if (unit.promoText && promoRibbon && promoTextEl) {
            promoTextEl.textContent = unit.promoText;
            promoRibbon.classList.remove('hidden');
        }

        const dynPkgGrid = drawerEl.querySelector('.tpl-dynamic-packages-grid');
        if (dynPkgGrid) {
            dynPkgGrid.innerHTML = '';
            const pkgList = Array.isArray(unit.activePackagesList) ? unit.activePackagesList : [];
            pkgList.forEach((pkg) => {
                const cell = document.createElement('div');
                cell.className = `pkg-dynamic-cell ${pkg.isHighlight ? 'pkg-cell-highlight' : ''}`;
                cell.innerHTML = `
                    <span class="text-[0.5rem] font-extrabold uppercase ${pkg.isHighlight ? 'text-[#c5a880]' : ''}" style="${pkg.isHighlight ? '' : 'color: var(--text-muted);'}">${pkg.label}</span>
                    <span class="font-mono-num text-[0.72rem] font-black ${pkg.isHighlight ? 'text-emerald-400' : ''} mt-0.5 whitespace-nowrap" style="${pkg.isHighlight ? '' : 'color: var(--text-main);'}">${formatRupiahPublik(pkg.price)}</span>
                `;
                dynPkgGrid.appendChild(cell);
            });
        }

        const drvEl = drawerEl.querySelector('.tpl-drawer-driver');
        if (drvEl) {
            if (unit.srvCode === 1) {
                drvEl.textContent = 'Khusus Lepas Kunci';
            } else if (unit.priceDriverPerDay > 0) {
                drvEl.textContent = `+${formatRupiahPublik(unit.priceDriverPerDay)}/hr`;
            } else {
                drvEl.textContent = 'Termasuk';
            }
        }

        const outTownEl = drawerEl.querySelector('.tpl-drawer-outtown');
        if (outTownEl) {
            if (!unit.outOfTownAllowed) {
                outTownEl.textContent = 'Khusus Dalam Kota';
                outTownEl.className = 'tpl-drawer-outtown font-bold text-amber-400';
            } else if (unit.priceOutTownPerDay > 0) {
                outTownEl.textContent = `+${formatRupiahPublik(unit.priceOutTownPerDay)}/hr`;
            } else {
                outTownEl.textContent = 'Gratis';
                outTownEl.className = 'tpl-drawer-outtown font-bold text-emerald-400';
            }
        }

        const gNameEl = drawerEl.querySelector('.tpl-garage-name');
        if (gNameEl) gNameEl.textContent = unit.garageName;

        const gAreaEl = drawerEl.querySelector('.tpl-garage-area');
        if (gAreaEl) {
            gAreaEl.textContent = Number.isFinite(unit.distanceKm)
                ? `📍 Sekitar ${unit.distanceKm.toFixed(1)} km • ${unit.garageArea}`
                : `📍 Area ${unit.garageArea}`;
        }

        const gHoursEl = drawerEl.querySelector('.tpl-garage-hours');
        if (gHoursEl) {
            gHoursEl.innerHTML = `<i class="fa-regular fa-clock text-emerald-400 mr-1"></i>Jam Layanan: ${unit.garageHours}`;
        }

        const btnGmaps = drawerEl.querySelector('.tpl-btn-gmaps');
        if (btnGmaps) {
            btnGmaps.href = unit.garageGmaps;
            btnGmaps.addEventListener('click', (e) => {
                e.stopPropagation();
                picuGetarPublik(10);
            });
        }

        const btnOpenSheet = drawerEl.querySelector('.tpl-btn-open-sheet');
        if (btnOpenSheet) {
            btnOpenSheet.addEventListener('click', (e) => {
                e.stopPropagation();
                picuGetarPublik(15);
                bukaLembarDetailDanKalkulator(unit);
            });
        }
    }

    if (isExpanded) {
        hidrasiLaciKartuJikaPerlu();
    }

    if (compactRow && cardEl && drawerEl) {
        compactRow.addEventListener('click', () => {
            picuGetarPublik(8);
            if (expandedCompositeIds.has(unit.compositeId)) {
                expandedCompositeIds.delete(unit.compositeId);
                cardEl.classList.remove('is-expanded');
                drawerEl.classList.add('hidden');
                hancurkanIframeDiKontainer(drawerEl);
            } else {
                expandedCompositeIds.add(unit.compositeId);
                hidrasiLaciKartuJikaPerlu();
                cardEl.classList.add('is-expanded');
                drawerEl.classList.remove('hidden');
            }
            perbaruiTombolLebarkanSemuaPublikUI();
        });
    }

    return clone;
}

export function renderBatchKartuBerikutnya() {
    const gridEl = document.getElementById('rentalCatalogGrid');
    const tpl = document.getElementById('tpl-rental-unit-card');
    const sentinelEl = document.getElementById('catalogScrollSentinel');
    if (!gridEl || !tpl) return;

    if (renderedCardCount >= currentFilteredUnits.length) {
        if (sentinelEl) sentinelEl.classList.add('hidden');
        return;
    }

    const nextSlice = currentFilteredUnits.slice(renderedCardCount, renderedCardCount + BATCH_SIZE);
    const frag = document.createDocumentFragment();

    nextSlice.forEach((unit) => {
        frag.appendChild(bangunElemenKartuUnit(unit, tpl));
    });

    gridEl.appendChild(frag);
    renderedCardCount += nextSlice.length;

    if (sentinelEl) {
        if (renderedCardCount < currentFilteredUnits.length) {
            sentinelEl.classList.remove('hidden');
            const remaining = currentFilteredUnits.length - renderedCardCount;
            sentinelEl.innerHTML = `<span class="text-[0.6rem] font-bold text-[#c5a880]"><i class="fa-solid fa-circle-notch fa-spin mr-1.5"></i>Memuat armada berikutnya (${remaining.toLocaleString('id-ID')} unit lagi)...</span>`;
        } else {
            sentinelEl.classList.add('hidden');
        }
    }

    perbaruiTombolLebarkanSemuaPublikUI();
}

function pasangObserverSentinelGulir() {
    const sentinelEl = document.getElementById('catalogScrollSentinel');
    if (!sentinelEl || typeof IntersectionObserver === 'undefined') return;

    if (catalogSentinelObserver) {
        catalogSentinelObserver.disconnect();
    }

    const scrollRoot = document.getElementById('view-catalog') || null;
    catalogSentinelObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting && renderedCardCount < currentFilteredUnits.length) {
                    renderBatchKartuBerikutnya();
                }
            });
        },
        {
            root: scrollRoot,
            rootMargin: '260px 0px',
            threshold: 0.01
        }
    );

    catalogSentinelObserver.observe(sentinelEl);
}

export function renderGridKatalogLokal() {
    const gridEl = document.getElementById('rentalCatalogGrid');
    const emptyEl = document.getElementById('catalogEmptyState');
    const emptyTitle = document.getElementById('catalogEmptyTitle');
    const emptyDesc = document.getElementById('catalogEmptyDesc');
    const countHeaderEl = document.getElementById('headerAvailableUnitsCount');
    const sentinelEl = document.getElementById('catalogScrollSentinel');
    const tpl = document.getElementById('tpl-rental-unit-card');

    if (!gridEl || !tpl) return;

    hancurkanSemuaIframeVideoAktif();
    perbaruiBadgeJumlahFilterAktifUI();

    const filteredRaw = allAvailableUnits.filter((unit) => {
        return (
            cocokDenganTabKategori(unit, activeCategoryTab) &&
            cocokDenganFilterKombinasi(unit) &&
            cocokDenganPencarianTeks(unit, activeSearchQuery)
        );
    });

    currentFilteredUnits = urutkanDaftarUnitFilter(filteredRaw);
    renderedCardCount = 0;

    if (countHeaderEl) {
        countHeaderEl.textContent = `${currentFilteredUnits.length.toLocaleString('id-ID')} Armada Tersedia`;
    }

    gridEl.innerHTML = '';

    if (currentFilteredUnits.length === 0) {
        if (sentinelEl) sentinelEl.classList.add('hidden');
        if (emptyEl) emptyEl.classList.remove('hidden');
        if (allAvailableUnits.length === 0) {
            if (emptyTitle) emptyTitle.textContent = 'Belum Ada Armada Tersedia Saat Ini';
            if (emptyDesc) {
                emptyDesc.textContent = 'Saat ini belum ada garasi rental yang membuka unit armada. Silakan tekan tombol Segarkan beberapa saat lagi.';
            }
        } else {
            if (emptyTitle) emptyTitle.textContent = 'Armada Tidak Ditemukan';
            if (emptyDesc) {
                emptyDesc.textContent = 'Tidak ada unit kendaraan yang cocok dengan kata kunci pencarian atau filter yang Anda pilih.';
            }
        }
        perbaruiTombolLebarkanSemuaPublikUI();
        return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');

    // Render gelombang pertama (BATCH_SIZE = 24 kartu) secara instan via DocumentFragment
    renderBatchKartuBerikutnya();
    pasangObserverSentinelGulir();
}

function mulaiJedaAntiSpamRefresh() {
    refreshCooldownRemaining = REFRESH_COOLDOWN_SECONDS;
    const btnRefresh = document.getElementById('btnRefreshCatalog');
    const badgeCooldown = document.getElementById('refreshCooldownBadge');

    if (btnRefresh) btnRefresh.disabled = true;
    if (badgeCooldown) badgeCooldown.textContent = `${refreshCooldownRemaining}d`;

    clearInterval(refreshCooldownInterval);
    refreshCooldownInterval = setInterval(() => {
        refreshCooldownRemaining -= 1;
        if (refreshCooldownRemaining <= 0) {
            clearInterval(refreshCooldownInterval);
            refreshCooldownInterval = null;
            if (btnRefresh) btnRefresh.disabled = false;
            if (badgeCooldown) badgeCooldown.textContent = 'Segarkan';
        } else if (badgeCooldown) {
            badgeCooldown.textContent = `${refreshCooldownRemaining}d`;
        }
    }, 1000);
}

export async function muatKatalogArmadaPublik(isManualRefresh = false, forceBypassEtag = false) {
    if (isManualRefresh && refreshCooldownRemaining > 0) {
        return;
    }

    const iconRefresh = document.getElementById('iconRefreshCatalog');

    if (iconRefresh) iconRefresh.classList.add('fa-spin');
    if (isManualRefresh) {
        mulaiJedaAntiSpamRefresh();
        await kunciLokasiGpsWajib();
    }

    try {
        const bypassNow = Boolean(forceBypassEtag || (isManualRefresh && allAvailableUnits.length === 0));
        const res = await tarikKatalogPublikETag(bypassNow);
        allAvailableUnits = Array.isArray(res.units) ? res.units : [];
        renderGridKatalogLokal();
    } finally {
        if (iconRefresh) iconRefresh.classList.remove('fa-spin');
    }
}

function resetSemuaFilterKatalog() {
    activeCategoryTab = 'ALL';
    activeServiceFilter = 'ALL';
    activeTransFilter = 'ALL';
    activeSortOrder = 'NEAREST';
    activeSearchQuery = '';

    const inpSearch = document.getElementById('inputSearchCatalog');
    const btnClearSearch = document.getElementById('btnClearSearchCatalog');
    if (inpSearch) inpSearch.value = '';
    if (btnClearSearch) btnClearSearch.classList.add('hidden');

    document.querySelectorAll('#catalogCategoryTabs [data-cat-tab]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-cat-tab') === 'ALL');
    });
    document.querySelectorAll('#filterGroupService [data-flt-srv]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-flt-srv') === 'ALL');
    });
    document.querySelectorAll('#filterGroupTrans [data-flt-trans]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-flt-trans') === 'ALL');
    });
    document.querySelectorAll('#filterGroupSort [data-flt-sort]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-flt-sort') === 'NEAREST');
    });

    renderGridKatalogLokal();
}

export function pasangEventKatalogDanFilter() {
    const inpSearch = document.getElementById('inputSearchCatalog');
    const btnClearSearch = document.getElementById('btnClearSearchCatalog');
    const btnRefresh = document.getElementById('btnRefreshCatalog');
    const btnResetEmpty = document.getElementById('btnResetFilterEmpty');
    const btnResetCombo = document.getElementById('btnResetComboFilters');
    const btnToggleCombo = document.getElementById('btnToggleComboFilter');
    const panelCombo = document.getElementById('collapsibleFilterPanel');
    const btnExpandAll = document.getElementById('btnToggleExpandAllPublic');
    const btnRetryGps = document.getElementById('btnRetryGpsLock');

    if (btnRetryGps) {
        btnRetryGps.addEventListener('click', async () => {
            picuGetarPublik(15);
            const coords = await kunciLokasiGpsWajib(true);
            if (coords) {
                await muatKatalogArmadaPublik(false, true);
            }
        });
    }

    if (inpSearch) {
        inpSearch.addEventListener('input', () => {
            activeSearchQuery = inpSearch.value || '';
            if (btnClearSearch) {
                btnClearSearch.classList.toggle('hidden', !activeSearchQuery);
            }
            renderGridKatalogLokal();
        });
    }

    if (btnClearSearch && inpSearch) {
        btnClearSearch.addEventListener('click', () => {
            picuGetarPublik(10);
            inpSearch.value = '';
            activeSearchQuery = '';
            btnClearSearch.classList.add('hidden');
            renderGridKatalogLokal();
        });
    }

    if (btnToggleCombo && panelCombo) {
        btnToggleCombo.addEventListener('click', () => {
            picuGetarPublik(10);
            const isHidden = panelCombo.classList.toggle('hidden');
            btnToggleCombo.classList.toggle('active', !isHidden);
        });
    }

    document.querySelectorAll('#catalogCategoryTabs [data-cat-tab]').forEach((tab) => {
        tab.addEventListener('click', () => {
            picuGetarPublik(10);
            activeCategoryTab = tab.getAttribute('data-cat-tab') || 'ALL';
            document.querySelectorAll('#catalogCategoryTabs [data-cat-tab]').forEach((t) => {
                t.classList.toggle('active', t === tab);
            });
            renderGridKatalogLokal();
        });
    });

    document.querySelectorAll('#filterGroupService [data-flt-srv]').forEach((btn) => {
        btn.addEventListener('click', () => {
            picuGetarPublik(10);
            activeServiceFilter = btn.getAttribute('data-flt-srv') || 'ALL';
            document.querySelectorAll('#filterGroupService [data-flt-srv]').forEach((b) => {
                b.classList.toggle('active', b === btn);
            });
            renderGridKatalogLokal();
        });
    });

    document.querySelectorAll('#filterGroupTrans [data-flt-trans]').forEach((btn) => {
        btn.addEventListener('click', () => {
            picuGetarPublik(10);
            activeTransFilter = btn.getAttribute('data-flt-trans') || 'ALL';
            document.querySelectorAll('#filterGroupTrans [data-flt-trans]').forEach((b) => {
                b.classList.toggle('active', b === btn);
            });
            renderGridKatalogLokal();
        });
    });

    document.querySelectorAll('#filterGroupSort [data-flt-sort]').forEach((btn) => {
        btn.addEventListener('click', () => {
            picuGetarPublik(10);
            activeSortOrder = btn.getAttribute('data-flt-sort') || 'NEAREST';
            document.querySelectorAll('#filterGroupSort [data-flt-sort]').forEach((b) => {
                b.classList.toggle('active', b === btn);
            });
            renderGridKatalogLokal();
        });
    });

    if (btnResetEmpty) {
        btnResetEmpty.addEventListener('click', () => {
            picuGetarPublik(12);
            resetSemuaFilterKatalog();
        });
    }
    if (btnResetCombo) {
        btnResetCombo.addEventListener('click', () => {
            picuGetarPublik(12);
            resetSemuaFilterKatalog();
            morphButtonPublik(btnResetCombo, '✓ Direset', 1200);
        });
    }

    if (btnExpandAll) {
        btnExpandAll.addEventListener('click', () => {
            picuGetarPublik(12);
            if (currentFilteredUnits.length === 0) return;

            // Batasi melebarkan hanya pada batch aktif saat ini (maks 24-48 kartu) agar RAM HP selalu ringan
            const activeBatch = dapatkanDaftarUnitBatchAktif();
            if (isAllPublicExpanded) {
                tutupPanelMediaMengambang();
                hancurkanSemuaIframeVideoAktif();
                expandedCompositeIds.clear();
            } else {
                activeBatch.forEach((u) => expandedCompositeIds.add(u.compositeId));
            }

            const targetRenderCount = Math.max(renderedCardCount, BATCH_SIZE);
            renderedCardCount = 0;
            const gridEl = document.getElementById('rentalCatalogGrid');
            if (gridEl) gridEl.innerHTML = '';

            while (renderedCardCount < Math.min(targetRenderCount, currentFilteredUnits.length)) {
                renderBatchKartuBerikutnya();
            }
        });
    }

    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            picuGetarPublik(15);
            muatKatalogArmadaPublik(true, true);
        });
    }
}
