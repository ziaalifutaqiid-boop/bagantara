// ==========================================
// FILE: /js/utils/chat-trigger.js
// FUNGSI: Pemicu Penyerahan Bidding ke Modul Chat Handshake ATAU Template WhatsApp Langsung
//         (V12.0: Proteksi Anti-Tampering Harga via window.__BGN_SEAL__ & Server HMAC Signature,
//          Sinkronisasi ID Tiket Tunggal antara Node #5 Audit, Node #2 Radar, Node #3 Chat, & GAS FCM,
//          Template Rute Terpadu 1-Link Navigasi Multi-Stop Google Maps, Driver Tier-2 Siaga WA, Diskon, & Tip 100%)
// ==========================================

function bangunPesanTemplateWhatsAppDriver(driverObj, payloadTiket) {
    const wTemplates = window.BGN_CONFIG?.wording?.templates || {};
    const currencyCode = window.BGN_CONFIG?.tariffs?.currency || 'IDR';
    const fmtRp = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: currencyCode, minimumFractionDigits: 0 }).format(Number(val) || 0);

    const header = wTemplates.wa_fallback_order_header || "*✨ PESANAN PERJALANAN BAGANTARA*";
    const idSingkat = `WA_${Date.now().toString().slice(-6)}`;
    const layanan = String(payloadTiket.layanan || "RIDE").toUpperCase();
    const isJastip = (layanan === "JASTIP");

    let lines = [];
    lines.push(header);
    lines.push(`ID Order: *#${idSingkat}*`);
    lines.push(`Layanan: *${layanan}* (${Number(payloadTiket.jarak_km || 0).toFixed(1)} KM)`);
    lines.push(`Penumpang: *${payloadTiket.nama_klien || "Penumpang"}*`);
    if (payloadTiket.wa_klien) {
        lines.push(`No. WA Penumpang: ${payloadTiket.wa_klien}`);
    }
    lines.push("");

    // Rute Perjalanan Terpadu & 1 Link Navigasi Multi-Stop Google Maps (Tanpa Pemisahan Link Ganda)
    const pickupLabel = payloadTiket.pickup_alamat || "Titik Koordinat Peta";
    const pickupNote = (payloadTiket.pickup_patokan && payloadTiket.pickup_patokan !== "-") ? ` (${payloadTiket.pickup_patokan})` : "";
    const dropoffLabel = payloadTiket.dropoff_alamat || "Titik Koordinat Peta";
    const dropoffNote = (payloadTiket.dropoff_patokan && payloadTiket.dropoff_patokan !== "-") ? ` (${payloadTiket.dropoff_patokan})` : "";

    lines.push(`🛣️ *RUTE PERJALANAN:*`);
    lines.push(`• Jemput: ${pickupLabel}${pickupNote}`);

    const multiStops = Array.isArray(payloadTiket.multi_dropoffs) ? payloadTiket.multi_dropoffs.filter(Boolean) : [];
    if (multiStops.length > 1) {
        multiStops.slice(0, -1).forEach((stop, sIdx) => {
            const sNote = (stop.notes && stop.notes !== "-") ? ` (${stop.notes})` : "";
            lines.push(`• Singgah ${sIdx + 1}: ${stop.name || "Titik Singgah"}${sNote}`);
        });
        const lastStop = multiStops[multiStops.length - 1];
        const lastNote = (lastStop?.notes && lastStop.notes !== "-") ? ` (${lastStop.notes})` : dropoffNote;
        lines.push(`• Tujuan Akhir: ${lastStop?.name || dropoffLabel}${lastNote}`);
    } else {
        lines.push(`• Tujuan: ${dropoffLabel}${dropoffNote}`);
    }

    const originParam = payloadTiket.pickup_coord ? payloadTiket.pickup_coord : pickupLabel;
    const destParam = payloadTiket.dropoff_coord ? payloadTiket.dropoff_coord : dropoffLabel;
    let multiStopDirUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originParam)}&destination=${encodeURIComponent(destParam)}`;
    if (multiStops.length > 1) {
        const wps = multiStops.slice(0, -1).map(p => `${parseFloat(p.lat).toFixed(6)},${parseFloat(p.lng).toFixed(6)}`).join('|');
        if (wps) multiStopDirUrl += `&waypoints=${encodeURIComponent(wps)}`;
    }
    multiStopDirUrl += `&travelmode=driving`;

    lines.push(`🗺️ *Link Navigasi Multi-Stop:*`);
    lines.push(multiStopDirUrl);
    lines.push("");

    // Detail Belanja Jastip jika layanan JASTIP
    if (isJastip && Array.isArray(payloadTiket.belanjaan) && payloadTiket.belanjaan.length > 0) {
        lines.push(`🛒 *DAFTAR BELANJA JASTIP:*`);
        payloadTiket.belanjaan.forEach((item, idx) => {
            lines.push(`${idx + 1}. *${item.qty}x* ${item.name} (@ ${fmtRp(item.price)})`);
        });
        lines.push(`Estimasi Belanja: *${fmtRp(payloadTiket.estimasi_belanja || 0)}*`);
        lines.push("");
    }

    if (payloadTiket.catatan_tambahan && String(payloadTiket.catatan_tambahan).trim() !== "") {
        lines.push(`💬 *CATATAN TAMBAHAN:*`);
        lines.push(`"${payloadTiket.catatan_tambahan}"`);
        lines.push("");
    }

    // Rincian Biaya & Diskon
    lines.push(`💰 *RINCIAN ESTIMASI TARIF:*`);
    const diskonPct = Number(payloadTiket.diskon_persen || 0);
    const hargaNormal = Number(payloadTiket.harga_normal || payloadTiket.harga_dasar || 0);
    const hargaDasar = Number(payloadTiket.harga_dasar || 0);
    const tipNom = Number(payloadTiket.tip_nominal || 0);

    if (diskonPct > 0 && hargaNormal > hargaDasar) {
        const labelDiskon = payloadTiket.diskon_source === 'DRIVER' ? `Diskon Driver ${diskonPct}%` : `Diskon Promo ${diskonPct}%`;
        lines.push(`• Tarif Normal: ~${fmtRp(hargaNormal)}~`);
        lines.push(`• Tarif Setelah ${labelDiskon}: *${fmtRp(hargaDasar)}*`);
        if (payloadTiket.promo_teks) {
            lines.push(`• Promo: _"${payloadTiket.promo_teks}"_`);
        }
    } else {
        lines.push(`• Tarif Ongkir/Jasa: *${fmtRp(hargaDasar)}*`);
    }

    if (tipNom > 0) {
        lines.push(`• Tip Prioritas Penumpang: *+${fmtRp(tipNom)}*`);
    }

    if (isJastip) {
        lines.push(`• *TOTAL ONGKIR + BELANJA: ${fmtRp(payloadTiket.total_bayar_jastip || (payloadTiket.harga_tawaran + payloadTiket.estimasi_belanja))}*`);
    } else {
        lines.push(`• *TOTAL BAYAR: ${fmtRp(payloadTiket.harga_tawaran)}*`);
    }

    lines.push("");
    lines.push(`Halo Kak *${driverObj.nama || "Driver"}*, apakah siap mengambil pesanan ini? 🙏`);
    return lines.join("\n");
}

window.bangunPesanTemplateWhatsAppDriver = bangunPesanTemplateWhatsAppDriver;

document.addEventListener('DOMContentLoaded', () => {
    const btnSubmitClient = document.getElementById('btnSubmitClient');
    const btnCancelClient = document.getElementById('btnCancelClient');
    const clientFormOverlay = document.getElementById('client-form-overlay');

    if (btnCancelClient) {
        btnCancelClient.addEventListener('click', () => {
            if (clientFormOverlay) clientFormOverlay.classList.add('hidden');
        });
    }

    // --- SMART TIP ENGINE: LOGIKA INTERAKSI ---
    let nominalTipTerpilih = 0;
    const tipChips = document.querySelectorAll('.btn-tip-chip');
    const inputTipCustom = document.getElementById('inputTipCustom');

    function resetTipChips() {
        tipChips.forEach(chip => {
            chip.style.background = 'var(--card-bg-2)';
            chip.style.borderColor = 'var(--border-cyber)';
            chip.style.color = 'var(--text-main)';
        });
    }

    tipChips.forEach(chip => {
        chip.addEventListener('click', function() {
            if (this.style.color === 'var(--neon-gold)') {
                resetTipChips();
                nominalTipTerpilih = 0;
            } else {
                resetTipChips();
                this.style.background = 'rgba(212, 175, 55, 0.15)';
                this.style.borderColor = 'var(--neon-gold)';
                this.style.color = 'var(--neon-gold)';
                const parsedTip = parseInt(this.getAttribute('data-tip'), 10);
                nominalTipTerpilih = !isNaN(parsedTip) ? parsedTip : 0;
                if (inputTipCustom) inputTipCustom.value = ''; 
            }
        });
    });

    if (inputTipCustom) {
        inputTipCustom.addEventListener('input', function() {
            resetTipChips();
            const parsedCustom = parseInt(this.value, 10);
            nominalTipTerpilih = Math.max(0, !isNaN(parsedCustom) ? parsedCustom : 0);
        });
    }

    if (btnSubmitClient) {
        btnSubmitClient.addEventListener('click', () => {
            const cName = document.getElementById('inputClientName').value.trim();
            const cWA = document.getElementById('inputClientWA').value.trim();
            const wAlerts = window.BGN_CONFIG.wording.alerts;
            const wPopup = window.BGN_CONFIG.wording.mitra_popup;
            const formVal = window.BGN_CONFIG.rules_app.form_validation;
            
            const checkResult = window.OrderWAValidator
                ? window.OrderWAValidator.validateSubmission(cName, cWA, window.BAGANTARA_SERVICE)
                : { valid: (cName.length >= formVal.min_name_length && (window.BAGANTARA_SERVICE !== 'JASTIP' || cWA.length >= formVal.min_wa_length)), cleanWA: cWA, message: wAlerts.form_incomplete };

            if (!checkResult.valid) {
                if (window.UIManager && typeof window.UIManager.alert === 'function') {
                    window.UIManager.alert(checkResult.message);
                } else {
                    alert(checkResult.message);
                }
                return;
            }
            const validatedWA = checkResult.cleanWA;

            if (clientFormOverlay) clientFormOverlay.classList.add('hidden');
            
            const activeService = window.BAGANTARA_SERVICE ? window.BAGANTARA_SERVICE : wPopup.default_service;
            const isJastip = activeService === 'JASTIP';

            let estimasiBelanjaJastip = 0;
            if (isJastip) {
                if (Array.isArray(window.BAGANTARA_JASTIP_ITEMS) && window.BAGANTARA_JASTIP_ITEMS.length > 0) {
                    estimasiBelanjaJastip = window.BAGANTARA_JASTIP_ITEMS.reduce((sum, item) => {
                        const qty = Math.max(1, parseInt(item?.qty, 10) || 1);
                        const price = Math.max(0, parseInt(item?.price, 10) || 0);
                        return sum + (qty * price);
                    }, 0);
                    window.BAGANTARA_JASTIP_VALUE = estimasiBelanjaJastip;
                } else {
                    const parsedJastipVal = parseInt(window.BAGANTARA_JASTIP_VALUE, 10);
                    estimasiBelanjaJastip = !isNaN(parsedJastipVal) ? Math.max(0, parsedJastipVal) : 0;
                }
            }
            
            const catatanInput = document.getElementById('inputCatatanDriver');
            const teksCatatan = catatanInput ? catatanInput.value.trim() : "";

            // VERIFIKASI HARGA & SIGNATURE SERVER OTORITATIF MELALUI CLOSURE __BGN_SEAL__
            let hargaOngkirAsli = window.BAGANTARA_FINAL_PRICE ? window.BAGANTARA_FINAL_PRICE : 0;
            let hargaNormalSah = window.BAGANTARA_ORIGINAL_PRICE ? window.BAGANTARA_ORIGINAL_PRICE : hargaOngkirAsli;
            let diskonPersenSah = window.BAGANTARA_DISCOUNT_PERCENT ? window.BAGANTARA_DISCOUNT_PERCENT : 0;
            let diskonSourceSah = window.BAGANTARA_DISCOUNT_SOURCE ? window.BAGANTARA_DISCOUNT_SOURCE : null;
            let promoTeksSah = window.BAGANTARA_PROMO_TEKS ? window.BAGANTARA_PROMO_TEKS : '';
            let jarakKmSah = window.BAGANTARA_DISTANCE_KM ? window.BAGANTARA_DISTANCE_KM : 0;
            let signatureSah = window.BAGANTARA_FARE_SIGNATURE ? window.BAGANTARA_FARE_SIGNATURE : '';
            let extraSecurityMeta = { signature: signatureSah };

            if (window.__BGN_SEAL__ && typeof window.__BGN_SEAL__.verifyAndResolve === 'function') {
                const verified = window.__BGN_SEAL__.verifyAndResolve();
                if (verified && verified.finalPrice > 0) {
                    hargaOngkirAsli = verified.finalPrice;
                    hargaNormalSah = verified.originalPrice || verified.finalPrice;
                    diskonPersenSah = verified.discountPercent || 0;
                    diskonSourceSah = verified.discountSource || null;
                    promoTeksSah = verified.promoTeks || '';
                    jarakKmSah = verified.distanceKm || jarakKmSah;
                    signatureSah = verified.signature || signatureSah;
                    extraSecurityMeta = {
                        signature: signatureSah,
                        activeZoneId: verified.activeZoneId,
                        extraStops: verified.extraStops
                    };
                }
            }

            // KUNCI MUTLAK NILAI TIP SEBELUM UI DIRESET
            const tipTerkunci = Math.max(0, parseInt(nominalTipTerpilih, 10) || 0);
            const hargaTawaranAkhir = hargaOngkirAsli + tipTerkunci;

            const multiList = Array.isArray(window.BAGANTARA_MULTI_DROPOFFS) ? window.BAGANTARA_MULTI_DROPOFFS : [];
            const validMultiStops = multiList.filter(m => m && !isNaN(parseFloat(m.lat)) && !isNaN(parseFloat(m.lng)));

            const pickupKec = window.BAGANTARA_PICKUP_DETAIL?.kec ? window.BAGANTARA_PICKUP_DETAIL.kec : '';
            const pickupPatokan = window.BAGANTARA_PICKUP_DETAIL?.patokan ? window.BAGANTARA_PICKUP_DETAIL.patokan : '';

            // Pastikan dropoff_coord & dropoff_alamat merujuk ke titik tujuan akhir apabila Multi-Stop (>1 tujuan)
            const finalStop = validMultiStops.length > 0 ? validMultiStops[validMultiStops.length - 1] : null;
            const finalDropoffCoord = (validMultiStops.length > 1 && finalStop)
                ? `${parseFloat(finalStop.lat).toFixed(6)},${parseFloat(finalStop.lng).toFixed(6)}`
                : (window.BAGANTARA_DROPOFF_COORD ? window.BAGANTARA_DROPOFF_COORD : (finalStop ? `${parseFloat(finalStop.lat).toFixed(6)},${parseFloat(finalStop.lng).toFixed(6)}` : ''));

            const dropoffKec = (validMultiStops.length > 1)
                ? validMultiStops.map((s, idx) => `${idx + 1}. ${s.name}`).join(' → ')
                : (window.BAGANTARA_DROPOFF_DETAIL?.kec
                    ? window.BAGANTARA_DROPOFF_DETAIL.kec
                    : (validMultiStops[0]?.name ? validMultiStops[0].name : ''));
            const dropoffPatokan = window.BAGANTARA_DROPOFF_DETAIL?.patokan ? window.BAGANTARA_DROPOFF_DETAIL.patokan : '';

            // Buat ID Tiket Tunggal yang Sinkron di Seluruh Cluster (Node #2, #3, #5, #6, & GAS)
            const sharedTicketId = `TKT_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

            // KONTRAK DATA IDENTIK 100% DENGAN APLIKASI DRIVER BAGANTARA (ZERO-REGRESSION CONTRACT)
            const payloadTiket = {
                nama_klien: cName,
                wa_klien: validatedWA,
                catatan_tambahan: teksCatatan,
                tip_nominal: tipTerkunci,
                layanan: activeService,
                jarak_km: jarakKmSah,
                harga_tawaran: hargaTawaranAkhir,
                harga_dasar: hargaOngkirAsli,
                harga_normal: hargaNormalSah,
                diskon_persen: diskonPersenSah,
                diskon_source: diskonSourceSah,
                promo_teks: promoTeksSah,
                estimasi_belanja: estimasiBelanjaJastip,
                total_bayar_jastip: isJastip ? (hargaTawaranAkhir + estimasiBelanjaJastip) : hargaTawaranAkhir,
                pickup_coord: window.BAGANTARA_PICKUP_COORD ? window.BAGANTARA_PICKUP_COORD : '',
                pickup_alamat: pickupKec,
                pickup_patokan: pickupPatokan,
                dropoff_coord: finalDropoffCoord,
                dropoff_alamat: dropoffKec,
                dropoff_patokan: dropoffPatokan,
                multi_dropoffs: validMultiStops.length > 0 ? validMultiStops : null,
                toko_jastip: isJastip ? (window.BAGANTARA_JASTIP_STORE ? window.BAGANTARA_JASTIP_STORE : null) : null,
                belanjaan: isJastip ? (Array.isArray(window.BAGANTARA_JASTIP_ITEMS) ? window.BAGANTARA_JASTIP_ITEMS : []) : null
            };

            window.BAGANTARA_LAST_ORDER_PAYLOAD = payloadTiket;
            if (window.OrderWAValidator) {
                window.OrderWAValidator.catatAuditKeamananNode5(sharedTicketId, payloadTiket, extraSecurityMeta);
            }

            // Reset state UI tip setelah payloadTiket dikunci secara imutabel
            resetTipChips();
            nominalTipTerpilih = 0;
            if (inputTipCustom) inputTipCustom.value = '';

            const targetDriver = window.BAGANTARA_DRIVER || window.BAGANTARA_PRELOCKED_DRIVER;
            const isWaFallbackMode = Boolean(
                (window.BAGANTARA_DRIVER && window.BAGANTARA_DRIVER.isWaFallbackOnly) ||
                (window.BAGANTARA_PRELOCKED_DRIVER && window.BAGANTARA_PRELOCKED_DRIVER.isWaFallbackOnly)
            );

            // JALUR KHUSUS TIER 2 (DRIVER SIAGA WHATSAPP - APLIKASI TERBUNUH SISTEM ANDROID):
            if (isWaFallbackMode && targetDriver && targetDriver.wa) {
                const mapCfg = window.BGN_CONFIG.settings.map_config;
                const cleanWaDriver = String(targetDriver.wa).replace(/[^0-9]/g, '').replace(/^0/, '62');
                const teksTemplateWA = bangunPesanTemplateWhatsAppDriver(targetDriver, payloadTiket);
                const urlWA = `${mapCfg.whatsapp_base_url}${cleanWaDriver}?text=${encodeURIComponent(teksTemplateWA)}`;

                window.open(urlWA, '_blank');

                if (window.SystemReset) window.SystemReset();
                if (window.UIManager && window.UIManager.alertConfig) {
                    window.UIManager.alertConfig('wa_fallback_dispatched', wAlerts.wa_fallback_dispatched || 'Template pesanan telah diarahkan ke WhatsApp Driver.');
                }
                return;
            }

            if (window.BAGANTARA_DRIVER && window.BAGANTARA_DRIVER.uid) {
                const uidDriver = window.BAGANTARA_DRIVER.uid;
                // TUGAS 3.2: Pembersihan State, Timer Polling Sesi Lama, & Cache ETag Sebelum Order Baru
                if (window.ChatHandshake && typeof window.ChatHandshake.resetSebelumOrderBaru === 'function') {
                    window.ChatHandshake.resetSebelumOrderBaru();
                } else {
                    try { localStorage.removeItem('bgt_active_chat'); localStorage.removeItem('bgn_active_chat_session'); } catch (e) {}
                    try { sessionStorage.removeItem('bgt_active_chat'); } catch (e) {}
                }
                if (window.BGNSecurityShield && typeof window.BGNSecurityShield.resetEtagCache === 'function') {
                    window.BGNSecurityShield.resetEtagCache();
                }

                if (window.BAGANTARA_DRIVER_CACHE && window.BAGANTARA_DRIVER_CACHE[uidDriver]) {
                    window.BAGANTARA_DRIVER_CACHE[uidDriver].isBusy = true;
                    window.BAGANTARA_DRIVER_CACHE[uidDriver].busyUntil = Date.now() + 1800000;
                    window.BAGANTARA_DRIVER_CACHE[uidDriver].activeTicketId = sharedTicketId;
                }
                if (window.AegisEngine && window.AegisEngine._rtdbScanCache && Array.isArray(window.AegisEngine._rtdbScanCache.data)) {
                    window.AegisEngine._rtdbScanCache.data.forEach(drv => {
                        if (drv && drv.uid === uidDriver) {
                            drv.isBusy = true;
                            drv.busyUntil = Date.now() + 1800000;
                            drv.activeTicketId = sharedTicketId;
                        }
                    });
                }
                if (window.UIManager && typeof window.UIManager.loadMitraCatalog === 'function') {
                    window.UIManager.loadMitraCatalog(false, true);
                }
                if (window.ChatHandshake && typeof window.ChatHandshake.ajukanTawaran === 'function') {
                    window.ChatHandshake.ajukanTawaran(uidDriver, payloadTiket, sharedTicketId);
                }
            } else {
                const txtNoUid = wAlerts.uid_not_found;
                if (window.UIManager && window.UIManager.alertConfig) {
                    window.UIManager.alertConfig('uid_not_found', txtNoUid);
                } else {
                    alert(txtNoUid);
                }
            }
        });
    }
});
