// ==========================================================================
// FILE: js/modules/booking-calculator.js (BAGANTARA RENTAL PUBLIK)
// FUNGSI:
//   1. Pengendali Lembar Pemesanan 2 Langkah Halus ("#booking-sheet-overlay"):
//      - LANGKAH 1: Panggung Galeri Maks 2 Foto + 1 Video Opsional, Sinkronisasi 5 Paket Waktu Sewa
//        Dinamis (6 Jam, 12 Jam, Harian 24 Jam, Mingguan, Bulanan — menyembunyikan
//        paket yang OFF), Saklar Luar Kota ("Khusus Dalam Kota" jika OFF),
//        Kunci Tanggal & Jam Serah Terima Real-Time Anti-Mundur Sesuai Jam Perangkat
//        (dapatkanDaftarSlotJamValid, Auto-Lock Hari Ini jika lewat jam, Auto-Select
//        slot jam valid pertama), serta Form Penyewa.
//      - LANGKAH 2: Ringkasan Tiket Pesanan Resmi (#RNT-XXXXX) & Tampilan QRIS Resmi
//        Garasi tepat sebelum membuka WhatsApp.
// ==========================================================================

import {
    formatRupiahPublik,
    pasangPerisaiGambar,
    renderPanggungMediaShowroom,
    hancurkanIframeDiKontainer,
    hancurkanSemuaIframeVideoAktif,
    picuGetarPublik,
    tampilkanToastPublik
} from '../core/rtdb-etag-client.js';

const HARI_INDO_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BULAN_INDO_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BULAN_INDO_FULL = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

let selectedUnit = null;
let generatedTicketCode = '#RNT-00000';
let dateOptions30Days = [];

let calcState = {
    serviceMode: 'LEPAS_KUNCI',
    packageType: '24H',
    durationQty: 1,
    usageZone: 'IN_TOWN',
    pickupMethod: 'GARAGE',
    selectedDateIso: '',
    selectedDateFormatted: '',
    selectedTimeWib: '08:00',
    computed: {
        baseCost: 0,
        driverCost: 0,
        outTownCost: 0,
        deliveryCost: 0,
        totalCost: 0,
        dpAmount: 0,
        dpRuleText: '',
        packageLabelText: ''
    }
};

// ==========================================================================
// 1. MESIN KUNCI JAM & TANGGAL BOOKING REAL-TIME ANTI-MUNDUR SESUAI JAM PERANGKAT
// ==========================================================================
export function dapatkanIsoHariIniPerangkat(nowDate = new Date()) {
    const yyyy = nowDate.getFullYear();
    const mm = String(nowDate.getMonth() + 1).padStart(2, '0');
    const dd = String(nowDate.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

export function ekstrakJamBukaTutupGarasi(garageHoursStr) {
    const raw = String(garageHoursStr || '07:00 - 22:00').trim();
    if (/24\s*jam/i.test(raw)) {
        return { openHour: 0, closeHour: 23, is24Hours: true };
    }
    const matches = raw.match(/(\d{1,2})[:.](\d{2})\s*(?:-|s\/d|sampai|–)\s*(\d{1,2})[:.](\d{2})/i);
    if (matches) {
        const openH = Math.min(23, Math.max(0, parseInt(matches[1], 10)));
        const closeH = Math.min(23, Math.max(openH, parseInt(matches[3], 10)));
        return { openHour: openH, closeHour: closeH, is24Hours: (openH === 0 && closeH === 23) };
    }
    return { openHour: 6, closeHour: 22, is24Hours: false };
}

export function dapatkanDaftarSlotJamValid(unit, targetDateIso, nowRef = null) {
    const now = (nowRef instanceof Date) ? nowRef : new Date();
    const todayIso = dapatkanIsoHariIniPerangkat(now);
    const currentTotalMinutes = now.getHours() * 60 + now.getMinutes();

    const hrsInfo = ekstrakJamBukaTutupGarasi(unit ? unit.garageHours : '07:00 - 22:00');
    const startLoopHour = hrsInfo.is24Hours ? 0 : Math.min(6, hrsInfo.openHour);
    const endLoopHour = hrsInfo.is24Hours ? 23 : Math.max(22, hrsInfo.closeHour);

    const targetIsoClean = String(targetDateIso || todayIso).trim();
    const isPastDate = targetIsoClean < todayIso;
    const isTodayDate = targetIsoClean === todayIso;

    const slots = [];
    for (let h = startLoopHour; h <= endLoopHour; h++) {
        const hh = String(h).padStart(2, '0');
        const timeStr = `${hh}:00`;
        const slotMinutes = h * 60;
        const isOutsideOperatingHours = (h < hrsInfo.openHour || h > hrsInfo.closeHour);

        // Aturan Anti-Mundur Mutlak:
        // a) Di luar jam operasional garasi, ATAU
        // b) Tanggal masa lalu (targetDateIso < todayIso), ATAU
        // c) Tanggal HARI INI (targetDateIso === todayIso) DAN slotMinutes <= (currentTotalMinutes + 15)
        const isPastTimeToday = isTodayDate && (slotMinutes <= (currentTotalMinutes + 15));
        const isPastOrClosed = Boolean(isOutsideOperatingHours || isPastDate || isPastTimeToday);

        slots.push({
            time: timeStr,
            hour: h,
            slotMinutes,
            isOutsideOperatingHours,
            isPastTimeToday,
            isPastOrClosed
        });
    }

    return slots;
}
window.dapatkanDaftarSlotJamValid = dapatkanDaftarSlotJamValid;

export function apakahHariIniMasihBisaDipesan(unit, nowRef = null) {
    const now = (nowRef instanceof Date) ? nowRef : new Date();
    const todayIso = dapatkanIsoHariIniPerangkat(now);
    const todaySlots = dapatkanDaftarSlotJamValid(unit, todayIso, now);
    return todaySlots.some((s) => !s.isPastOrClosed);
}

function bangunDaftar30HariKeDepan(unit = selectedUnit) {
    dateOptions30Days = [];
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayHasValidSlot = apakahHariIniMasihBisaDipesan(unit, now);

    for (let i = 0; i < 30; i++) {
        const d = new Date(base);
        d.setDate(base.getDate() + i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const iso = `${yyyy}-${mm}-${dd}`;
        const dayName = HARI_INDO_SHORT[d.getDay()];
        const dayNum = d.getDate();
        const monthShort = BULAN_INDO_SHORT[d.getMonth()];
        const fullLabel = `${dayName}, ${dayNum} ${BULAN_INDO_FULL[d.getMonth()]} ${yyyy}`;
        const isExpiredToday = (i === 0 && !todayHasValidSlot);

        dateOptions30Days.push({
            iso,
            dayName,
            dayNum,
            monthShort,
            fullLabel,
            offsetDays: i,
            isExpiredToday
        });
    }
}

function pilihJamSerahTerimaWib(timeStr) {
    const slots = dapatkanDaftarSlotJamValid(selectedUnit, calcState.selectedDateIso);
    const firstValidSlot = slots.find((s) => !s.isPastOrClosed);
    const requestedSlot = slots.find((s) => s.time === timeStr);

    // Jika jam yang dipilih berstatus isPastOrClosed === true, otomatis geser ke slot jam valid pertama!
    let finalTime = '08:00';
    if (requestedSlot && !requestedSlot.isPastOrClosed) {
        finalTime = requestedSlot.time;
    } else if (firstValidSlot) {
        finalTime = firstValidSlot.time;
    } else if (slots.length > 0) {
        finalTime = slots[0].time;
    }

    calcState.selectedTimeWib = finalTime;

    const inpTime = document.getElementById('calcStartTime');
    if (inpTime) inpTime.value = finalTime;

    const lblTime = document.getElementById('customSelectedTimeLabel');
    if (lblTime) lblTime.textContent = `${finalTime} WIB`;

    const grid = document.getElementById('customTimePillsGrid');
    if (grid) {
        grid.querySelectorAll('.time-slot-pill').forEach((pill) => {
            const slotVal = pill.getAttribute('data-time-slot');
            const isDisabled = pill.disabled || pill.classList.contains('time-slot-disabled');
            pill.classList.toggle('active', !isDisabled && slotVal === finalTime);
        });
    }
}

export function renderCustomTimePillsGrid() {
    const grid = document.getElementById('customTimePillsGrid');
    if (!grid) return;

    const targetIso = calcState.selectedDateIso || dapatkanIsoHariIniPerangkat();
    const slots = dapatkanDaftarSlotJamValid(selectedUnit, targetIso);

    grid.innerHTML = '';
    slots.forEach((slotObj) => {
        // Sembunyikan jam di luar jam operasional garasi jika bukan 24 jam agar grid tetap ringkas & rapi
        if (slotObj.isOutsideOperatingHours && (slotObj.hour < 6 || slotObj.hour > 22)) {
            return;
        }
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `time-slot-pill ${slotObj.isPastOrClosed ? 'time-slot-disabled' : ''}`;
        btn.setAttribute('data-time-slot', slotObj.time);
        btn.disabled = Boolean(slotObj.isPastOrClosed);
        btn.textContent = slotObj.time;

        if (slotObj.isPastOrClosed) {
            btn.title = slotObj.isOutsideOperatingHours
                ? 'Di luar jam operasional garasi'
                : 'Jam ini sudah terlewat untuk hari ini';
        } else {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                picuGetarPublik(10);
                pilihJamSerahTerimaWib(slotObj.time);
            });
        }
        grid.appendChild(btn);
    });

    // Pastikan jam yang terpilih valid untuk tanggal aktif; jika sudah lewat, otomatis pindah ke jam valid pertama
    pilihJamSerahTerimaWib(calcState.selectedTimeWib || '08:00');
}

function perbaruiStatusTombolPintasanHariIni() {
    const todayOpt = dateOptions30Days[0];
    const isTodayExpired = Boolean(todayOpt && todayOpt.isExpiredToday);
    const btnTodayShortcut = document.querySelector('[data-date-shortcut="0"]');
    if (btnTodayShortcut) {
        btnTodayShortcut.disabled = isTodayExpired;
        btnTodayShortcut.classList.toggle('date-card-expired', isTodayExpired);
        btnTodayShortcut.textContent = isTodayExpired ? 'Hari Ini (Lewat Jam)' : 'Hari Ini';
    }
}

function pilihTanggalKustomByIso(isoStr) {
    bangunDaftar30HariKeDepan(selectedUnit);
    perbaruiStatusTombolPintasanHariIni();

    let found = dateOptions30Days.find((d) => d.iso === isoStr);
    // Jika pengguna memilih tanggal masa lalu atau Hari Ini sudah habis jam layanannya, kunci otomatis ke "Besok" (offsetDays = 1)
    if (!found || found.isExpiredToday) {
        found = dateOptions30Days[1] || dateOptions30Days[0];
    }
    if (!found) return;

    calcState.selectedDateIso = found.iso;
    calcState.selectedDateFormatted = found.fullLabel;

    const inpHidden = document.getElementById('calcStartDate');
    if (inpHidden) inpHidden.value = found.iso;

    const lblSelected = document.getElementById('customSelectedDateLabel');
    if (lblSelected) lblSelected.textContent = found.fullLabel;

    const strip = document.getElementById('customDateStrip30Days');
    if (strip) {
        strip.querySelectorAll('.date-day-card').forEach((card) => {
            const cardIso = card.getAttribute('data-date-iso');
            const isTodayCard = cardIso === (dateOptions30Days[0] && dateOptions30Days[0].iso);
            const isExpired = isTodayCard && Boolean(dateOptions30Days[0]?.isExpiredToday);
            card.disabled = isExpired;
            card.classList.toggle('date-card-expired', isExpired);
            card.classList.toggle('active', !isExpired && cardIso === found.iso);
        });
    }

    document.querySelectorAll('[data-date-shortcut]').forEach((btn) => {
        const offset = parseInt(btn.getAttribute('data-date-shortcut') || '-1', 10);
        btn.classList.toggle('active', !btn.disabled && offset === found.offsetDays);
    });

    // WAJIB: Setiap kali tanggal berganti, render ulang pil jam serah terima agar jam yang sudah lewat hari ini terkunci!
    renderCustomTimePillsGrid();
}

function renderCustomDateStrip30Hari() {
    bangunDaftar30HariKeDepan(selectedUnit);
    perbaruiStatusTombolPintasanHariIni();

    const strip = document.getElementById('customDateStrip30Days');
    if (!strip) return;

    strip.innerHTML = '';
    dateOptions30Days.forEach((item) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `date-day-card ${item.isExpiredToday ? 'date-card-expired' : ''}`;
        btn.setAttribute('data-date-iso', item.iso);
        btn.disabled = Boolean(item.isExpiredToday);
        btn.innerHTML = `
            <span class="text-[0.52rem] font-extrabold uppercase tracking-wider text-[#c5a880]">${item.dayName}</span>
            <span class="font-mono-num text-xs font-black">${item.dayNum}</span>
            <span class="text-[0.48rem] font-semibold opacity-80">${item.isExpiredToday ? 'Lewat Jam' : item.monthShort}</span>
        `;
        if (!item.isExpiredToday) {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                picuGetarPublik(10);
                pilihTanggalKustomByIso(item.iso);
            });
        }
        strip.appendChild(btn);
    });

    // Jika Hari Ini masih memiliki slot jam valid, izinkan default Hari Ini atau Besok; jika Hari Ini habis, wajib Besok
    const todayOpt = dateOptions30Days[0];
    const tomorrowOpt = dateOptions30Days[1] || todayOpt;
    let defaultTarget = calcState.selectedDateIso;
    if (!defaultTarget || (todayOpt && todayOpt.isExpiredToday && defaultTarget === todayOpt.iso)) {
        defaultTarget = (todayOpt && !todayOpt.isExpiredToday) ? todayOpt.iso : tomorrowOpt.iso;
    }
    pilihTanggalKustomByIso(defaultTarget);
}

function dapatkanJumlahHariEfektif() {
    const qty = Math.max(1, parseInt(calcState.durationQty, 10) || 1);
    if (calcState.packageType === 'WEEKLY') {
        return qty * 7;
    }
    if (calcState.packageType === 'MONTHLY') {
        return qty * 30;
    }
    return qty;
}

export function hitungUlangEstimasiBiayaDanDP() {
    if (!selectedUnit) return;

    const qty = Math.max(1, parseInt(calcState.durationQty, 10) || 1);
    const effectiveDays = dapatkanJumlahHariEfektif();

    let baseCost = 0;
    let packageBadgeLabel = `${qty} Hari (24 Jam)`;

    if (calcState.packageType === '6H' && selectedUnit.has6h) {
        baseCost = selectedUnit.price6h * qty;
        packageBadgeLabel = `${qty}x Paket 6 Jam`;
    } else if (calcState.packageType === '12H' && selectedUnit.has12h) {
        baseCost = selectedUnit.price12h * qty;
        packageBadgeLabel = `${qty}x Paket 12 Jam`;
    } else if (calcState.packageType === 'WEEKLY' && selectedUnit.hasWeekly) {
        baseCost = selectedUnit.priceWeekly * qty;
        packageBadgeLabel = `${qty} Minggu (${qty * 7} Hari)`;
    } else if (calcState.packageType === 'MONTHLY' && selectedUnit.hasMonthly) {
        baseCost = selectedUnit.priceMonthly * qty;
        packageBadgeLabel = `${qty} Bulan (${qty * 30} Hari)`;
    } else {
        const rate24 = selectedUnit.has24h ? selectedUnit.price24h : selectedUnit.displayMainPrice;
        baseCost = rate24 * qty;
        packageBadgeLabel = `${qty} Hari (24 Jam)`;
    }

    let driverCost = 0;
    if (calcState.serviceMode === 'DENGAN_SOPIR') {
        driverCost = selectedUnit.priceDriverPerDay * effectiveDays;
    }

    let outTownCost = 0;
    if (calcState.usageZone === 'OUT_TOWN' && selectedUnit.outOfTownAllowed && selectedUnit.priceOutTownPerDay > 0) {
        outTownCost = selectedUnit.priceOutTownPerDay * effectiveDays;
    }

    let deliveryCost = 0;
    if (calcState.pickupMethod === 'DELIVERY' && selectedUnit.deliveryAllowed) {
        deliveryCost = selectedUnit.deliveryFeeRupiah;
    }

    const totalCost = baseCost + driverCost + outTownCost + deliveryCost;

    let dpAmount = 0;
    let dpRuleText = 'Tanpa DP (Bayar Saat Serah Terima Unit)';
    if (selectedUnit.dpType === 'P' && selectedUnit.dpPercent > 0) {
        dpAmount = Math.round((selectedUnit.dpPercent / 100) * totalCost);
        dpRuleText = `Wajib DP ${selectedUnit.dpPercent}% dari Total Estimasi Sewa`;
    } else if (selectedUnit.dpType === 'F' && selectedUnit.dpNominalRupiah > 0) {
        dpAmount = selectedUnit.dpNominalRupiah;
        dpRuleText = 'Nominal Tetap Tanda Jadi';
    }

    calcState.computed = {
        baseCost,
        driverCost,
        outTownCost,
        deliveryCost,
        totalCost,
        dpAmount,
        dpRuleText,
        packageLabelText: packageBadgeLabel
    };

    const elPkgBadge = document.getElementById('summaryPackageBadge');
    if (elPkgBadge) elPkgBadge.textContent = packageBadgeLabel.toUpperCase();

    const elBase = document.getElementById('summaryBaseCost');
    if (elBase) elBase.textContent = formatRupiahPublik(baseCost);

    const elDriver = document.getElementById('summaryDriverCost');
    if (elDriver) {
        if (calcState.serviceMode === 'DENGAN_SOPIR') {
            elDriver.textContent = driverCost > 0
                ? `${formatRupiahPublik(driverCost)} (${effectiveDays} hr)`
                : 'Termasuk di Harga Unit';
        } else {
            elDriver.textContent = 'Rp 0 (Lepas Kunci)';
        }
    }

    const elOutTown = document.getElementById('summaryOutOfTownCost');
    if (elOutTown) {
        if (!selectedUnit.outOfTownAllowed) {
            elOutTown.textContent = 'Khusus Dalam Kota';
        } else {
            elOutTown.textContent = calcState.usageZone === 'OUT_TOWN'
                ? (outTownCost > 0 ? `${formatRupiahPublik(outTownCost)} (${effectiveDays} hr)` : 'Gratis (Rp 0)')
                : 'Rp 0 (Dalam Kota)';
        }
    }

    const elDelivery = document.getElementById('summaryDeliveryCost');
    if (elDelivery) {
        elDelivery.textContent = calcState.pickupMethod === 'DELIVERY'
            ? (deliveryCost > 0 ? formatRupiahPublik(deliveryCost) : 'Gratis')
            : 'Rp 0 (Ambil di Garasi)';
    }

    const elTotal = document.getElementById('summaryTotalCost');
    if (elTotal) elTotal.textContent = formatRupiahPublik(totalCost);

    const elDpRule = document.getElementById('summaryDpRuleLabel');
    if (elDpRule) elDpRule.textContent = dpRuleText;

    const elDpAmt = document.getElementById('summaryDpAmount');
    if (elDpAmt) {
        elDpAmt.textContent = dpAmount > 0 ? formatRupiahPublik(dpAmount) : 'Tanpa DP (Rp 0)';
    }
}

function sinkronkanTombolPilihanKalkulatorUI() {
    if (!selectedUnit) return;

    // 1. Mode Layanan Sewa
    const btnLepasKunci = document.getElementById('btnModeLepasKunci');
    const btnDenganSopir = document.getElementById('btnModeDenganSopir');
    const hintDriver = document.getElementById('hintDriverFeeInfo');

    if (btnLepasKunci && btnDenganSopir) {
        btnLepasKunci.disabled = (selectedUnit.srvCode === 2);
        btnDenganSopir.disabled = (selectedUnit.srvCode === 1);
        btnLepasKunci.classList.toggle('active', calcState.serviceMode === 'LEPAS_KUNCI');
        btnDenganSopir.classList.toggle('active', calcState.serviceMode === 'DENGAN_SOPIR');
    }

    if (hintDriver) {
        if (calcState.serviceMode === 'DENGAN_SOPIR') {
            hintDriver.textContent = selectedUnit.priceDriverPerDay > 0
                ? `Biaya jasa sopir: +${formatRupiahPublik(selectedUnit.priceDriverPerDay)} / hari (${selectedUnit.incLabel}).`
                : `Jasa sopir sudah termasuk sesuai cakupan: ${selectedUnit.incLabel}.`;
        } else {
            hintDriver.textContent = 'Mode Lepas Kunci: Penyewa mengemudikan sendiri sesuai persyaratan garasi.';
        }
    }

    // 2. Sembunyikan (hidden) semua tombol paket waktu yang berstatus OFF pada unit tersebut!
    const pkgButtons = [
        { id: 'btnPkg6h', code: '6H', isOn: Boolean(selectedUnit.has6h) },
        { id: 'btnPkg12h', code: '12H', isOn: Boolean(selectedUnit.has12h) },
        { id: 'btnPkg24h', code: '24H', isOn: Boolean(selectedUnit.has24h) },
        { id: 'btnPkgWeekly', code: 'WEEKLY', isOn: Boolean(selectedUnit.hasWeekly) },
        { id: 'btnPkgMonthly', code: 'MONTHLY', isOn: Boolean(selectedUnit.hasMonthly) }
    ];

    pkgButtons.forEach((p) => {
        const btn = document.getElementById(p.id);
        if (!btn) return;
        btn.classList.toggle('hidden', !p.isOn);
        btn.disabled = !p.isOn;
        btn.classList.toggle('active', p.isOn && calcState.packageType === p.code);
    });

    const lblDurUnit = document.getElementById('calcDurationUnitLabel');
    if (lblDurUnit) {
        if (calcState.packageType === '6H') {
            lblDurUnit.textContent = 'Jumlah Paket 6 Jam:';
        } else if (calcState.packageType === '12H') {
            lblDurUnit.textContent = 'Jumlah Paket 12 Jam:';
        } else if (calcState.packageType === 'WEEKLY') {
            lblDurUnit.textContent = 'Jumlah Minggu (x 7 Hari):';
        } else if (calcState.packageType === 'MONTHLY') {
            lblDurUnit.textContent = 'Jumlah Bulan (x 30 Hari):';
        } else {
            lblDurUnit.textContent = 'Jumlah Hari Sewa (x 24 Jam):';
        }
    }

    const qtyEl = document.getElementById('calcDurationQty');
    if (qtyEl) qtyEl.textContent = String(calcState.durationQty);

    // 3. Wilayah Pemakaian (Kunci Luar Kota jika selectedUnit.outOfTownAllowed === false)
    const btnInTown = document.getElementById('btnZoneInTown');
    const btnOutTown = document.getElementById('btnZoneOutTown');
    const hintOutTown = document.getElementById('hintOutTownFeeInfo');

    if (!selectedUnit.outOfTownAllowed) {
        calcState.usageZone = 'IN_TOWN';
    }
    if (btnOutTown) {
        btnOutTown.disabled = !selectedUnit.outOfTownAllowed;
        btnOutTown.classList.toggle('active', selectedUnit.outOfTownAllowed && calcState.usageZone === 'OUT_TOWN');
    }
    if (btnInTown) {
        btnInTown.classList.toggle('active', calcState.usageZone === 'IN_TOWN');
    }
    if (hintOutTown) {
        if (!selectedUnit.outOfTownAllowed) {
            hintOutTown.textContent = 'Unit ini khusus pemakaian di Dalam Kota.';
        } else if (calcState.usageZone === 'OUT_TOWN') {
            hintOutTown.textContent = selectedUnit.priceOutTownPerDay > 0
                ? `Tambahan pemakaian luar kota: +${formatRupiahPublik(selectedUnit.priceOutTownPerDay)} / hari.`
                : 'Gratis biaya tambahan luar kota.';
        } else {
            hintOutTown.textContent = 'Pemakaian di dalam wilayah kota garasi.';
        }
    }

    // 4. Metode Serah Terima Unit
    const btnPickupGarage = document.getElementById('btnPickupGarage');
    const btnPickupDelivery = document.getElementById('btnPickupDelivery');
    const boxGarageInfo = document.getElementById('boxPickupGarageInfo');
    const boxDeliveryInput = document.getElementById('boxPickupDeliveryInput');
    const hintDelivery = document.getElementById('hintDeliveryFeeInfo');

    if (btnPickupDelivery) {
        btnPickupDelivery.disabled = !selectedUnit.deliveryAllowed;
    }
    if (btnPickupGarage) btnPickupGarage.classList.toggle('active', calcState.pickupMethod === 'GARAGE');
    if (btnPickupDelivery) btnPickupDelivery.classList.toggle('active', calcState.pickupMethod === 'DELIVERY');

    if (boxGarageInfo) boxGarageInfo.classList.toggle('hidden', calcState.pickupMethod !== 'GARAGE');
    if (boxDeliveryInput) boxDeliveryInput.classList.toggle('hidden', calcState.pickupMethod !== 'DELIVERY');
    if (hintDelivery) {
        hintDelivery.textContent = selectedUnit.deliveryFeeRupiah > 0
            ? `Biaya layanan antar-jemput mobil ke lokasi Anda: +${formatRupiahPublik(selectedUnit.deliveryFeeRupiah)}`
            : 'Layanan pengantaran unit gratis sesuai ketentuan garasi.';
    }

    hitungUlangEstimasiBiayaDanDP();
}

function tampilkanLangkahSheet(stepNumber) {
    const step1 = document.getElementById('booking-step-1');
    const step2 = document.getElementById('booking-step-2');
    const badgeTxt = document.getElementById('sheetStepBadgeText');
    const headerIcon = document.getElementById('sheetStepHeaderIcon');
    const scrollBody = document.getElementById('bookingSheetScrollBody');

    if (stepNumber === 2) {
        const stage1 = document.getElementById('sheetMediaStageBox');
        if (stage1) hancurkanIframeDiKontainer(stage1);

        if (step1) step1.classList.add('hidden');
        if (step2) step2.classList.remove('hidden');
        if (badgeTxt) badgeTxt.textContent = 'LANGKAH 2 DARI 2 • TIKET PESANAN & PEMBAYARAN';
        if (headerIcon) headerIcon.className = 'fa-solid fa-ticket text-xs';
    } else {
        if (step2) step2.classList.add('hidden');
        if (step1) step1.classList.remove('hidden');
        if (badgeTxt) badgeTxt.textContent = 'LANGKAH 1 DARI 2 • ATUR JADWAL SEWA';
        if (headerIcon) headerIcon.className = 'fa-solid fa-calculator text-xs';
    }

    if (scrollBody) {
        scrollBody.scrollTop = 0;
    }
}

function bersihkanSorotErrorInput(inputId, errId) {
    const inp = document.getElementById(inputId);
    const err = document.getElementById(errId);
    if (inp) inp.classList.remove('input-error-highlight');
    if (err) err.classList.add('hidden');
}

function sorotKolomWajibInline(inputId, errId, customMsg = '') {
    const inp = document.getElementById(inputId);
    const err = document.getElementById(errId);
    picuGetarPublik([20, 40, 20]);

    if (err) {
        if (customMsg) {
            err.innerHTML = `<i class="fa-solid fa-circle-exclamation mr-1"></i>${customMsg}`;
        }
        err.classList.remove('hidden');
    }
    if (inp) {
        inp.classList.remove('input-error-highlight');
        void inp.offsetWidth;
        inp.classList.add('input-error-highlight');
        inp.scrollIntoView({ behavior: 'smooth', block: 'center' });
        inp.focus();
    }
}

export function bukaLembarDetailDanKalkulator(unit) {
    if (!unit) return;
    selectedUnit = unit;

    hancurkanSemuaIframeVideoAktif();

    let initialPkg = '24H';
    if (unit.has24h) initialPkg = '24H';
    else if (unit.has12h) initialPkg = '12H';
    else if (unit.has6h) initialPkg = '6H';
    else if (unit.hasWeekly) initialPkg = 'WEEKLY';
    else if (unit.hasMonthly) initialPkg = 'MONTHLY';

    calcState.serviceMode = (unit.srvCode === 2) ? 'DENGAN_SOPIR' : 'LEPAS_KUNCI';
    calcState.packageType = initialPkg;
    calcState.durationQty = 1;
    calcState.usageZone = 'IN_TOWN';
    calcState.pickupMethod = 'GARAGE';
    calcState.selectedDateIso = '';

    bersihkanSorotErrorInput('calcRenterName', 'errRenterName');
    bersihkanSorotErrorInput('calcRenterCity', 'errRenterCity');
    bersihkanSorotErrorInput('calcDeliveryAddress', 'errDeliveryAddress');

    // Render strip 30 hari & pil jam dengan pengecekan jam perangkat real-time
    renderCustomDateStrip30Hari();
    tampilkanLangkahSheet(1);

    const titleEl = document.getElementById('sheetHeaderCarTitle');
    if (titleEl) titleEl.textContent = `${unit.fullDisplayName} (${unit.year})`;

    const stageEl = document.getElementById('sheetMediaStageBox');
    const switcherEl = document.getElementById('sheetMediaSlotSwitcher');
    const noteBoxEl = document.getElementById('sheetUnitNoteBox');
    const noteTxtEl = document.getElementById('sheetUnitNoteText');

    if (noteBoxEl && noteTxtEl) {
        if (unit.unitNote) {
            noteTxtEl.textContent = unit.unitNote;
            noteBoxEl.classList.remove('hidden');
        } else {
            noteBoxEl.classList.add('hidden');
        }
    }
    if (stageEl) {
        renderPanggungMediaShowroom(stageEl, switcherEl, unit, noteBoxEl, noteTxtEl);
    }

    const distBadge = document.getElementById('sheetDistanceBadge');
    if (distBadge) {
        distBadge.textContent = Number.isFinite(unit.distanceKm)
            ? `📍 Sekitar ${unit.distanceKm.toFixed(1)} km`
            : `📍 Area ${unit.garageArea}`;
    }

    const specsBadge = document.getElementById('sheetUnitSpecsBadge');
    if (specsBadge) {
        specsBadge.textContent = `${unit.year} • ${unit.transLabel} • ${unit.fuelLabel} • ${unit.incLabel}`;
    }

    const seatsBadge = document.getElementById('sheetUnitSeatsBadge');
    if (seatsBadge) {
        seatsBadge.textContent = `${unit.friendlyCategory} • ${unit.seats} Kursi`;
    }

    const gNameEl = document.getElementById('sheetGarageName');
    if (gNameEl) gNameEl.textContent = `${unit.garageName} (${unit.garageArea})`;

    const linkCalcGmaps = document.getElementById('linkCalcGarageGmaps');
    if (linkCalcGmaps) linkCalcGmaps.href = unit.garageGmaps;

    const infoHours = document.getElementById('sheetInfoHours');
    if (infoHours) infoHours.textContent = unit.garageHours || '07:00 - 22:00';

    const infoOt = document.getElementById('sheetInfoOvertime');
    if (infoOt) infoOt.textContent = `${unit.overtimePct}% / Jam`;

    const infoDp = document.getElementById('sheetInfoDpRule');
    if (infoDp) {
        if (unit.dpType === 'P') infoDp.textContent = `Wajib DP ${unit.dpPercent}%`;
        else if (unit.dpType === 'F') infoDp.textContent = `DP ${formatRupiahPublik(unit.dpNominalRupiah)}`;
        else infoDp.textContent = 'Tanpa DP';
    }

    const reqListEl = document.getElementById('sheetRequirementsList');
    if (reqListEl) {
        reqListEl.innerHTML = '';
        if (unit.requirementsList && unit.requirementsList.length > 0) {
            unit.requirementsList.forEach((reqItem) => {
                const li = document.createElement('li');
                li.className = 'flex items-start gap-2 rounded-xl px-2.5 py-1.5 border';
                li.style.background = 'var(--bg-subtle)';
                li.style.borderColor = 'var(--border-subtle)';
                li.innerHTML = `
                    <i class="fa-solid fa-circle-check text-emerald-400 mt-0.5 shrink-0"></i>
                    <span>${reqItem.text}</span>
                `;
                reqListEl.appendChild(li);
            });
        } else {
            reqListEl.innerHTML = '<li>Konfirmasi persyaratan langsung kepada pihak garasi saat pemesanan.</li>';
        }
    }

    sinkronkanTombolPilihanKalkulatorUI();

    const overlay = document.getElementById('booking-sheet-overlay');
    if (overlay) overlay.classList.remove('hidden');
}

export function tutupLembarDetailDanKalkulator() {
    const stageEl = document.getElementById('sheetMediaStageBox');
    if (stageEl) hancurkanIframeDiKontainer(stageEl);

    const overlay = document.getElementById('booking-sheet-overlay');
    if (overlay) overlay.classList.add('hidden');
}

function buatKodeBookingUnik() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let suffix = '';
    for (let i = 0; i < 5; i++) {
        suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `#RNT-${suffix}`;
}

function deskripsiPaketLengkapTiket() {
    const qty = calcState.durationQty;
    if (calcState.packageType === '6H') {
        return `Paket 6 Jam (${qty}x 6 Jam)`;
    }
    if (calcState.packageType === '12H') {
        return `Paket 12 Jam (${qty}x 12 Jam)`;
    }
    if (calcState.packageType === 'WEEKLY') {
        return `Paket Mingguan (${qty} Minggu / ${qty * 7} Hari)`;
    }
    if (calcState.packageType === 'MONTHLY') {
        return `Paket Bulanan (${qty} Bulan / ${qty * 30} Hari)`;
    }
    return `Paket Harian 24 Jam (${qty} Hari)`;
}

function lanjutkanKeLangkah2RingkasanDanQris() {
    if (!selectedUnit) return;

    bersihkanSorotErrorInput('calcRenterName', 'errRenterName');
    bersihkanSorotErrorInput('calcRenterCity', 'errRenterCity');
    bersihkanSorotErrorInput('calcDeliveryAddress', 'errDeliveryAddress');

    // Validasi Ganda Terhadap Jam Perangkat Real-Time (new Date()) Saat Tombol Ditekan!
    const now = new Date();
    const todayIso = dapatkanIsoHariIniPerangkat(now);
    const currentSlots = dapatkanDaftarSlotJamValid(selectedUnit, calcState.selectedDateIso, now);
    const chosenSlotObj = currentSlots.find((s) => s.time === calcState.selectedTimeWib);

    if (!chosenSlotObj || chosenSlotObj.isPastOrClosed || calcState.selectedDateIso < todayIso) {
        // Jika waktu yang dipilih sudah lewat karena layar dibiarkan terbuka lama, perbarui otomatis ke jam/tanggal valid berikutnya
        renderCustomDateStrip30Hari();
        const btnProceed = document.getElementById('btnProceedToStep2');
        tampilkanToastPublik(`✓ Jam disesuaikan ke ${calcState.selectedTimeWib} WIB`, btnProceed);
    }

    const renterName = String(document.getElementById('calcRenterName')?.value || '').trim();
    const renterCity = String(document.getElementById('calcRenterCity')?.value || '').trim();
    const deliveryAddr = String(document.getElementById('calcDeliveryAddress')?.value || '').trim();

    if (calcState.pickupMethod === 'DELIVERY' && !deliveryAddr) {
        sorotKolomWajibInline(
            'calcDeliveryAddress',
            'errDeliveryAddress',
            'Mohon isi alamat lengkap pengantaran atau tempel tautan peta lokasi Anda.'
        );
        return;
    }

    if (!renterName) {
        sorotKolomWajibInline(
            'calcRenterName',
            'errRenterName',
            'Mohon isi Nama Lengkap Penyewa sesuai E-KTP.'
        );
        return;
    }

    if (!renterCity) {
        sorotKolomWajibInline(
            'calcRenterCity',
            'errRenterCity',
            'Mohon isi Kota Domisili Anda saat ini.'
        );
        return;
    }

    picuGetarPublik(15);
    generatedTicketCode = buatKodeBookingUnik();

    const pkgText = deskripsiPaketLengkapTiket();
    const modeText = calcState.serviceMode === 'DENGAN_SOPIR' ? 'Dengan Sopir' : 'Lepas Kunci';
    const zoneText = calcState.usageZone === 'OUT_TOWN' ? 'Luar Kota' : 'Dalam Kota';
    const pickupText = calcState.pickupMethod === 'DELIVERY'
        ? `Diantar ke Lokasi (${deliveryAddr})`
        : 'Ambil Sendiri di Garasi';

    const c = calcState.computed;

    const elTicketCode = document.getElementById('step2TicketCode');
    if (elTicketCode) elTicketCode.textContent = generatedTicketCode;

    const elDist = document.getElementById('step2DistanceBadge');
    if (elDist) {
        elDist.textContent = Number.isFinite(selectedUnit.distanceKm)
            ? `📍 Sekitar ${selectedUnit.distanceKm.toFixed(1)} km`
            : `📍 Area ${selectedUnit.garageArea}`;
    }

    const elGarage = document.getElementById('step2GarageName');
    if (elGarage) elGarage.textContent = `${selectedUnit.garageName} (${selectedUnit.garageArea})`;

    const elUnit = document.getElementById('step2UnitName');
    if (elUnit) elUnit.textContent = `${selectedUnit.fullDisplayName} (${selectedUnit.year})`;

    const elPkgMode = document.getElementById('step2PkgAndMode');
    if (elPkgMode) elPkgMode.textContent = `${pkgText} • ${modeText} (${zoneText})`;

    const elSched = document.getElementById('step2ScheduleText');
    if (elSched) elSched.textContent = `${calcState.selectedDateFormatted} • ${calcState.selectedTimeWib} WIB`;

    const elPickup = document.getElementById('step2PickupText');
    if (elPickup) elPickup.textContent = pickupText;

    const elRenter = document.getElementById('step2RenterIdentity');
    if (elRenter) elRenter.textContent = `${renterName} (${renterCity})`;

    const elTotal = document.getElementById('step2TotalCost');
    if (elTotal) elTotal.textContent = formatRupiahPublik(c.totalCost);

    const elDp = document.getElementById('step2DpAmount');
    if (elDp) {
        elDp.textContent = c.dpAmount > 0 ? formatRupiahPublik(c.dpAmount) : 'Tanpa DP (Rp 0)';
    }

    const qrisBox = document.getElementById('step2QrisContainer');
    const noQrisBox = document.getElementById('step2NoQrisNotice');
    const qrisImg = document.getElementById('step2QrisImage');
    const qrisGarageLbl = document.getElementById('step2QrisGarageLabel');

    if (selectedUnit.garageQrisUrl) {
        if (qrisGarageLbl) qrisGarageLbl.textContent = selectedUnit.garageName;
        if (qrisImg) pasangPerisaiGambar(qrisImg, selectedUnit.garageQrisUrl);
        if (qrisBox) qrisBox.classList.remove('hidden');
        if (noQrisBox) noQrisBox.classList.add('hidden');
    } else {
        if (qrisBox) qrisBox.classList.add('hidden');
        if (noQrisBox) noQrisBox.classList.remove('hidden');
    }

    tampilkanLangkahSheet(2);
}

function kirimPesananKeWhatsAppPengusaha() {
    if (!selectedUnit) return;
    picuGetarPublik(18);

    const renterName = String(document.getElementById('calcRenterName')?.value || '').trim();
    const renterCity = String(document.getElementById('calcRenterCity')?.value || '').trim();
    const renterNotes = String(document.getElementById('calcRenterNotes')?.value || '').trim();
    const deliveryAddr = String(document.getElementById('calcDeliveryAddress')?.value || '').trim();

    const pkgText = deskripsiPaketLengkapTiket();
    const modeText = calcState.serviceMode === 'DENGAN_SOPIR' ? 'Dengan Sopir' : 'Lepas Kunci';
    const zoneText = calcState.usageZone === 'OUT_TOWN' ? 'Luar Kota' : 'Dalam Kota';
    const pickupText = calcState.pickupMethod === 'DELIVERY'
        ? `Diantar ke Lokasi Penyewa (${deliveryAddr})`
        : 'Ambil Sendiri di Garasi';

    const c = calcState.computed;
    const dpText = c.dpAmount > 0
        ? `${formatRupiahPublik(c.dpAmount)} (${c.dpRuleText})`
        : 'Tanpa DP (Bayar Saat Serah Terima Unit)';

    const distLine = Number.isFinite(selectedUnit.distanceKm)
        ? `Estimasi Jarak: *Sekitar ${selectedUnit.distanceKm.toFixed(1)} km*`
        : `Wilayah Garasi: *${selectedUnit.garageArea}*`;

    const lines = [
        `*TIKET PEMESANAN RENTAL MOBIL — BAGANTARA*`,
        `Kode Booking: *${generatedTicketCode}*`,
        distLine,
        `----------------------------------------`,
        `*1. PROFIL GARASI & UNIT ARMADA*`,
        `• Nama Rental: *${selectedUnit.garageName}* (${selectedUnit.garageArea})`,
        `• Unit Mobil: *${selectedUnit.fullDisplayName}*`,
        `• Spesifikasi: Tahun ${selectedUnit.year} | ${selectedUnit.transLabel} | ${selectedUnit.fuelLabel} | ${selectedUnit.seats} Kursi`,
        `• Cakupan Dasar: ${selectedUnit.incLabel}`,
        ``,
        `*2. JADWAL & RINCIAN LAYANAN SEWA*`,
        `• Paket & Durasi: *${pkgText}*`,
        `• Waktu Mulai Sewa: *${calcState.selectedDateFormatted} Pukul ${calcState.selectedTimeWib} WIB*`,
        `• Mode Layanan: *${modeText}*`,
        `• Wilayah Pemakaian: *${zoneText}*`,
        `• Metode Serah Terima: *${pickupText}*`,
        ``,
        `*3. RINCIAN ESTIMASI BIAYA & WAJIB DP*`,
        `• Sewa Unit Pokok: ${formatRupiahPublik(c.baseCost)}`,
        `• Biaya Jasa Sopir: ${formatRupiahPublik(c.driverCost)}`,
        `• Biaya Luar Kota: ${formatRupiahPublik(c.outTownCost)}`,
        `• Biaya Antar-Jemput: ${formatRupiahPublik(c.deliveryCost)}`,
        `• *TOTAL ESTIMASI SEWA: ${formatRupiahPublik(c.totalCost)}*`,
        `• *NOMINAL WAJIB DP: ${dpText}*`,
        ``,
        `*4. IDENTITAS PENYEWA*`,
        `• Nama Lengkap: *${renterName}*`,
        `• Kota Domisili: *${renterCity || '-'}*`,
        `• Catatan Penyewa: ${renterNotes || '-'}`,
        `----------------------------------------`,
        `Halo Admin *${selectedUnit.garageName}*, saya ingin memesan dan mengatur jadwal sewa unit di atas. Mohon konfirmasi ketersediaannya. Terima kasih.`
    ];

    const cleanWa = String(selectedUnit.garageWa || '').replace(/[^0-9]/g, '');
    if (!cleanWa) return;

    const waUrl = `https://wa.me/${cleanWa}?text=${encodeURIComponent(lines.join('\n'))}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
}

export function pasangEventKalkulatorBooking() {
    const btnCloseSheet = document.getElementById('btnCloseBookingSheet');
    const overlaySheet = document.getElementById('booking-sheet-overlay');

    if (btnCloseSheet) {
        btnCloseSheet.addEventListener('click', () => {
            picuGetarPublik(10);
            tutupLembarDetailDanKalkulator();
        });
    }
    if (overlaySheet) {
        overlaySheet.addEventListener('click', (e) => {
            if (e.target === overlaySheet) tutupLembarDetailDanKalkulator();
        });
    }

    document.querySelectorAll('[data-date-shortcut]').forEach((btn) => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            picuGetarPublik(10);
            const offset = parseInt(btn.getAttribute('data-date-shortcut') || '1', 10);
            bangunDaftar30HariKeDepan(selectedUnit);
            const target = dateOptions30Days[offset] || dateOptions30Days[1] || dateOptions30Days[0];
            if (target && !target.isExpiredToday) {
                pilihTanggalKustomByIso(target.iso);
                const strip = document.getElementById('customDateStrip30Days');
                const activeCard = strip ? strip.querySelector(`[data-date-iso="${target.iso}"]`) : null;
                if (activeCard) {
                    activeCard.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }
            }
        });
    });

    document.getElementById('calcRenterName')?.addEventListener('input', () => {
        bersihkanSorotErrorInput('calcRenterName', 'errRenterName');
    });
    document.getElementById('calcRenterCity')?.addEventListener('input', () => {
        bersihkanSorotErrorInput('calcRenterCity', 'errRenterCity');
    });
    document.getElementById('calcDeliveryAddress')?.addEventListener('input', () => {
        bersihkanSorotErrorInput('calcDeliveryAddress', 'errDeliveryAddress');
    });

    document.getElementById('btnModeLepasKunci')?.addEventListener('click', () => {
        if (!selectedUnit || selectedUnit.srvCode === 2) return;
        picuGetarPublik(10);
        calcState.serviceMode = 'LEPAS_KUNCI';
        sinkronkanTombolPilihanKalkulatorUI();
    });
    document.getElementById('btnModeDenganSopir')?.addEventListener('click', () => {
        if (!selectedUnit || selectedUnit.srvCode === 1) return;
        picuGetarPublik(10);
        calcState.serviceMode = 'DENGAN_SOPIR';
        sinkronkanTombolPilihanKalkulatorUI();
    });

    // Event 5 Tombol Pil Paket Durasi Sewa
    document.getElementById('btnPkg6h')?.addEventListener('click', () => {
        if (!selectedUnit || !selectedUnit.has6h) return;
        picuGetarPublik(10);
        calcState.packageType = '6H';
        sinkronkanTombolPilihanKalkulatorUI();
    });
    document.getElementById('btnPkg12h')?.addEventListener('click', () => {
        if (!selectedUnit || !selectedUnit.has12h) return;
        picuGetarPublik(10);
        calcState.packageType = '12H';
        sinkronkanTombolPilihanKalkulatorUI();
    });
    document.getElementById('btnPkg24h')?.addEventListener('click', () => {
        if (!selectedUnit || !selectedUnit.has24h) return;
        picuGetarPublik(10);
        calcState.packageType = '24H';
        sinkronkanTombolPilihanKalkulatorUI();
    });
    document.getElementById('btnPkgWeekly')?.addEventListener('click', () => {
        if (!selectedUnit || !selectedUnit.hasWeekly) return;
        picuGetarPublik(10);
        calcState.packageType = 'WEEKLY';
        sinkronkanTombolPilihanKalkulatorUI();
    });
    document.getElementById('btnPkgMonthly')?.addEventListener('click', () => {
        if (!selectedUnit || !selectedUnit.hasMonthly) return;
        picuGetarPublik(10);
        calcState.packageType = 'MONTHLY';
        sinkronkanTombolPilihanKalkulatorUI();
    });

    document.getElementById('btnDurMinus')?.addEventListener('click', () => {
        picuGetarPublik(10);
        calcState.durationQty = Math.max(1, calcState.durationQty - 1);
        sinkronkanTombolPilihanKalkulatorUI();
    });
    document.getElementById('btnDurPlus')?.addEventListener('click', () => {
        picuGetarPublik(10);
        calcState.durationQty = Math.min(30, calcState.durationQty + 1);
        sinkronkanTombolPilihanKalkulatorUI();
    });

    document.getElementById('btnZoneInTown')?.addEventListener('click', () => {
        picuGetarPublik(10);
        calcState.usageZone = 'IN_TOWN';
        sinkronkanTombolPilihanKalkulatorUI();
    });
    document.getElementById('btnZoneOutTown')?.addEventListener('click', () => {
        if (!selectedUnit || !selectedUnit.outOfTownAllowed) return;
        picuGetarPublik(10);
        calcState.usageZone = 'OUT_TOWN';
        sinkronkanTombolPilihanKalkulatorUI();
    });

    document.getElementById('btnPickupGarage')?.addEventListener('click', () => {
        picuGetarPublik(10);
        calcState.pickupMethod = 'GARAGE';
        sinkronkanTombolPilihanKalkulatorUI();
    });
    document.getElementById('btnPickupDelivery')?.addEventListener('click', () => {
        if (!selectedUnit || !selectedUnit.deliveryAllowed) return;
        picuGetarPublik(10);
        calcState.pickupMethod = 'DELIVERY';
        sinkronkanTombolPilihanKalkulatorUI();
    });

    document.getElementById('btnProceedToStep2')?.addEventListener('click', lanjutkanKeLangkah2RingkasanDanQris);
    document.getElementById('btnBackToStep1')?.addEventListener('click', () => {
        picuGetarPublik(10);
        renderCustomDateStrip30Hari();
        tampilkanLangkahSheet(1);
    });

    document.getElementById('btnSubmitBookingWa')?.addEventListener('click', kirimPesananKeWhatsAppPengusaha);
}
