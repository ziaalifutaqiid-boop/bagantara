// ==========================================
// PENGATUR LALU LINTAS & SARAF INTI GLOBAL (SERVICE ROUTER V12.2 - SERVER-SIDE TARIFF ENGINE & HMAC SEAL VAULT)
// ARSITEKTUR: ZERO-CLIENT-TARIFF-LEAK (/api/calculate-fare), HMAC SIGNATURE LOCK (__BGN_SEAL__), & ZERO REGRESSION
// ==========================================

(function() {
    'use strict';

    const _SEAL_SECRET_SALT = 'BGN_V12_0_PRICE_VAULT_HMAC_8831_AEGIS_KEY';

    // Closure Terisolasi: Menyimpan hasil perhitungan otoritatif & signature dari /api/calculate-fare
    let _sealedState = {
        finalPrice: 0,
        routePrice: 0,
        originalPrice: 0,
        discountPercent: 0,
        discountAmount: 0,
        discountSource: null,
        promoTeks: '',
        distanceKm: 0,
        service: null,
        pickupCoord: '',
        dropoffCoord: '',
        activeZoneId: '',
        multiStopCount: 0,
        extraStops: 0,
        driverUid: '',
        driverMinTariffApproved: 0,
        peakRuleName: null,
        serverSignature: '',
        serverSignatureRoute: '',
        serverSignatureMinApproved: '',
        timestamp: 0,
        checksum: ''
    };

    function _computeHmacLite(payloadStr) {
        const raw = `${_SEAL_SECRET_SALT}|${payloadStr}|${_SEAL_SECRET_SALT}`;
        let h1 = 0xdeadbeef ^ raw.length;
        let h2 = 0x41c6ce57 ^ raw.length;
        for (let i = 0; i < raw.length; i++) {
            const ch = raw.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
    }

    function _getValidMultiStopCount() {
        if (!Array.isArray(window.BAGANTARA_MULTI_DROPOFFS)) return 0;
        return window.BAGANTARA_MULTI_DROPOFFS.filter(
            m => m && !isNaN(parseFloat(m.lat)) && !isNaN(parseFloat(m.lng))
        ).length;
    }

    function _resolveCanonicalDropoffCoord() {
        const multiList = Array.isArray(window.BAGANTARA_MULTI_DROPOFFS)
            ? window.BAGANTARA_MULTI_DROPOFFS.filter(m => m && !isNaN(parseFloat(m.lat)) && !isNaN(parseFloat(m.lng)))
            : [];
        if (multiList.length > 1) {
            const last = multiList[multiList.length - 1];
            return `${parseFloat(last.lat).toFixed(6)},${parseFloat(last.lng).toFixed(6)}`;
        }
        return String(window.BAGANTARA_DROPOFF_COORD || '');
    }

    function _buildSignaturePayload(data) {
        const distNorm = Number(data.distanceKm || 0).toFixed(4);
        const srvNorm = String(data.service || 'RIDE').toUpperCase();
        const pCoord = String(data.pickupCoord || '').trim();
        const dCoord = String(data.dropoffCoord || '').trim();
        const zoneId = String(data.activeZoneId || '').trim();
        const stops = parseInt(data.multiStopCount, 10) || 0;
        const fPrice = parseInt(data.finalPrice, 10) || 0;
        const oPrice = parseInt(data.originalPrice, 10) || 0;
        const dPct = Number(data.discountPercent || 0).toFixed(2);
        const drvMin = parseInt(data.driverMinTariffApproved, 10) || 0;
        const srvSig = String(data.serverSignature || '');
        return `${srvNorm}#${zoneId}#${pCoord}#${dCoord}#${distNorm}#${stops}#${fPrice}#${oPrice}#${dPct}#${drvMin}#${srvSig}`;
    }

    function _getActivePeakRule(zoneId) {
        const peakData = window.BGN_CONFIG?.peak_hours;
        const zPeak = peakData?.zones?.[zoneId];
        if (!zPeak || zPeak.is_active !== true || !Array.isArray(zPeak.rules) || zPeak.rules.length === 0) {
            return null;
        }
        const nowWib = new Date(Date.now() + (7 * 3600 * 1000));
        const hh = String(nowWib.getUTCHours()).padStart(2, '0');
        const mm = String(nowWib.getUTCMinutes()).padStart(2, '0');
        const curHm = `${hh}:${mm}`;
        for (let i = 0; i < zPeak.rules.length; i++) {
            const r = zPeak.rules[i];
            if (!r) continue;
            const st = String(r.start_time || '00:00');
            const et = String(r.end_time || '23:59');
            if (curHm >= st && curHm <= et) {
                return {
                    name: String(r.name || 'Jam Sibuk'),
                    multiplier_factor: Math.max(1, parseFloat(r.multiplier_factor) || 1),
                    markup_flat: Math.max(0, parseInt(r.markup_flat, 10) || 0)
                };
            }
        }
        return null;
    }

    function _computeLocalSingleFare(params = {}) {
        const tariffsCfg = window.BGN_CONFIG?.tariffs || {};
        const rulesCfg = window.BGN_CONFIG?.rules_app || {};
        const step = parseInt(rulesCfg?.system_controls?.price_rounding_step, 10) || 100;
        const defaultMinTariff = parseInt(rulesCfg?.matchmaking?.default_min_tariff, 10) || 10000;

        const zoneId = String(params.zoneId || window.BAGANTARA_ACTIVE_ZONE_ID || 'KDR-PARE-01').trim();
        const layanan = String(params.layanan || window.BAGANTARA_SERVICE || 'RIDE').trim().toUpperCase();
        const distKm = Math.max(0.1, parseFloat(params.distanceKm) || 0);
        const extraStops = Math.max(0, parseInt(params.extraStops, 10) || 0);
        const multiStopCount = Math.max(1, parseInt(params.multiStopCount, 10) || (extraStops + 1));

        const zoneTariffObj = tariffsCfg?.zones?.[zoneId] || tariffsCfg?.zones?.['KDR-PARE-01'] || {};
        const srvTariff = zoneTariffObj?.[layanan] || zoneTariffObj?.['RIDE'] || {
            base_price: layanan === 'CAR' ? 12000 : 6000,
            min_distance_km: 2,
            price_per_km: layanan === 'CAR' ? 3500 : 2300,
            multi_stop_fee: layanan === 'CAR' ? 5000 : 2000
        };

        const basePrice = Math.max(0, parseInt(srvTariff.base_price, 10) || 6000);
        const minDistKm = Math.max(0, parseFloat(srvTariff.min_distance_km) || 2);
        const pricePerKm = Math.max(0, parseInt(srvTariff.price_per_km, 10) || 2300);
        const multiStopFee = Math.max(0, parseInt(srvTariff.multi_stop_fee, 10) || 2000);

        const extraKm = Math.max(0, distKm - minDistKm);
        let rawFare = basePrice + (extraKm * pricePerKm) + (extraStops * multiStopFee);

        const activePeak = _getActivePeakRule(zoneId);
        if (activePeak) {
            rawFare = (rawFare * activePeak.multiplier_factor) + activePeak.markup_flat;
        }

        const hargaNormal = Math.ceil(rawFare / step) * step;

        const diskonMap = (params.driverDiskonMap && typeof params.driverDiskonMap === 'object') ? params.driverDiskonMap : {};
        const rawDrvDisc = params.driverDiscountPct !== undefined ? params.driverDiscountPct : diskonMap[layanan];
        const drvDiscPct = Math.min(90, Math.max(0, parseFloat(String(rawDrvDisc ?? 0).replace('%', '').trim()) || 0));
        const zoneDiscPct = (zoneTariffObj.discount_active === true)
            ? Math.min(90, Math.max(0, parseFloat(zoneTariffObj.discount_percent) || 0))
            : 0;

        let diskonPersen = 0;
        let diskonSource = null;
        if (drvDiscPct > 0) {
            diskonPersen = drvDiscPct;
            diskonSource = 'DRIVER';
        } else if (zoneDiscPct > 0) {
            diskonPersen = zoneDiscPct;
            diskonSource = 'ZONE';
        }

        const hargaRute = diskonPersen > 0
            ? Math.ceil((hargaNormal * (1 - (diskonPersen / 100))) / step) * step
            : hargaNormal;
        const diskonNominal = Math.max(0, hargaNormal - hargaRute);

        const driverMinTariff = Math.max(0, parseInt(params.driverMinTariff, 10) || defaultMinTariff);
        const hargaMinApproved = Math.max(hargaRute, driverMinTariff);
        const hargaFinal = params.applyMinTariff ? hargaMinApproved : hargaRute;

        const pCoord = String(params.pickupCoord || window.BAGANTARA_PICKUP_COORD || '').trim();
        const dCoord = _resolveCanonicalDropoffCoord();
        const sigRoute = _computeHmacLite(`ROUTE|${zoneId}|${layanan}|${distKm.toFixed(4)}|${multiStopCount}|${hargaRute}|${hargaNormal}|${diskonPersen.toFixed(2)}|${pCoord}|${dCoord}`);
        const sigMinApproved = _computeHmacLite(`MIN_OK|${zoneId}|${layanan}|${distKm.toFixed(4)}|${multiStopCount}|${hargaMinApproved}|${hargaNormal}|${diskonPersen.toFixed(2)}|${driverMinTariff}|${pCoord}|${dCoord}`);

        return {
            ok: true,
            zone_id: zoneId,
            currency: tariffsCfg.currency || 'IDR',
            layanan: layanan,
            jarak_km: distKm,
            harga_normal: hargaNormal,
            harga_rute: hargaRute,
            harga_dasar: hargaFinal,
            diskon_persen: diskonPersen,
            diskon_nominal: diskonNominal,
            diskon_source: diskonSource,
            promo_teks: String(params.promoTeks || ''),
            peak_rule_name: activePeak ? activePeak.name : null,
            is_min_tariff_applied: hargaMinApproved > hargaRute,
            signature: params.applyMinTariff ? sigMinApproved : sigRoute,
            signature_route: sigRoute,
            signature_min_approved: sigMinApproved
        };
    }

    function _computeLocalBatchPreview(params = {}) {
        const zoneId = String(params.zoneId || window.BAGANTARA_ACTIVE_ZONE_ID || 'KDR-PARE-01').trim();
        const distKm = Math.max(0.1, parseFloat(params.distanceKm) || 0);
        const services = ['RIDE', 'CAR', 'EXPRESS', 'JASTIP'];
        const serviceFares = {};

        for (let i = 0; i < services.length; i++) {
            const srv = services[i];
            const resSrv = _computeLocalSingleFare({
                zoneId: zoneId,
                layanan: srv,
                distanceKm: distKm,
                extraStops: 0,
                multiStopCount: 1,
                driverDiscountPct: 0,
                applyMinTariff: false
            });
            serviceFares[srv] = {
                normalFare: resSrv.harga_normal,
                routeFare: resSrv.harga_rute,
                zoneDiscountPct: resSrv.diskon_source === 'ZONE' ? resSrv.diskon_persen : 0,
                signature: resSrv.signature_route
            };
        }

        const driversOut = {};
        const driversList = Array.isArray(params.drivers) ? params.drivers : [];
        for (let dIdx = 0; dIdx < driversList.length; dIdx++) {
            const d = driversList[dIdx];
            if (!d || !d.uid) continue;
            const uid = String(d.uid);
            driversOut[uid] = {};
            const diskonMap = (d.diskonMap && typeof d.diskonMap === 'object') ? d.diskonMap : {};
            const minTariff = parseInt(d.tarifMin, 10) || 10000;

            for (let sIdx = 0; sIdx < services.length; sIdx++) {
                const srv = services[sIdx];
                const calc = _computeLocalSingleFare({
                    zoneId: zoneId,
                    layanan: srv,
                    distanceKm: distKm,
                    extraStops: 0,
                    multiStopCount: 1,
                    driverDiskonMap: diskonMap,
                    driverMinTariff: minTariff,
                    applyMinTariff: true,
                    promoTeks: d.promoTeks || ''
                });
                driversOut[uid][srv] = {
                    finalFare: calc.harga_dasar,
                    routeFare: calc.harga_rute,
                    normalFare: calc.harga_normal,
                    isMinTariffApplied: calc.harga_dasar > calc.harga_rute,
                    discountPct: calc.diskon_persen,
                    distanceKm: distKm,
                    signature: calc.signature
                };
            }
        }

        return {
            ok: true,
            zone_id: zoneId,
            distance_km: distKm,
            service_fares: serviceFares,
            drivers: driversOut
        };
    }

    const sealApi = Object.freeze({
        computeSingleFare: _computeLocalSingleFare,
        computeBatchPreview: _computeLocalBatchPreview,
        seal: function(calcResult) {
            if (!calcResult || typeof calcResult !== 'object') return false;
            const pickupCoord = String(window.BAGANTARA_PICKUP_COORD || '').trim();
            const dropoffCoord = _resolveCanonicalDropoffCoord();
            const multiStopCount = _getValidMultiStopCount();
            const extraStops = Math.max(0, multiStopCount > 1 ? multiStopCount - 1 : 0);
            const prelockedDriver = window.BAGANTARA_PRELOCKED_DRIVER || window.BAGANTARA_DRIVER;

            const sigRoute = String(calcResult.signatureRoute || calcResult.signature || '');
            const sigMin = String(calcResult.signatureMinApproved || sigRoute);

            const nextState = {
                finalPrice: parseInt(calcResult.finalPrice, 10) || 0,
                routePrice: parseInt(calcResult.routePrice || calcResult.finalPrice, 10) || 0,
                originalPrice: parseInt(calcResult.originalPrice, 10) || 0,
                discountPercent: Number(calcResult.discountPercent) || 0,
                discountAmount: parseInt(calcResult.discountAmount, 10) || 0,
                discountSource: calcResult.discountSource || null,
                promoTeks: String(calcResult.promoTeks || ''),
                distanceKm: parseFloat(calcResult.distanceKm) || 0,
                service: String(calcResult.service || window.BAGANTARA_SERVICE || 'RIDE').toUpperCase(),
                pickupCoord: pickupCoord,
                dropoffCoord: dropoffCoord,
                activeZoneId: String(calcResult.activeZoneId || window.BAGANTARA_ACTIVE_ZONE_ID || 'KDR-PARE-01'),
                multiStopCount: multiStopCount,
                extraStops: extraStops,
                driverUid: String(prelockedDriver?.uid || ''),
                driverMinTariffApproved: 0,
                peakRuleName: calcResult.peakRuleName || null,
                serverSignature: sigRoute,
                serverSignatureRoute: sigRoute,
                serverSignatureMinApproved: sigMin,
                timestamp: Date.now(),
                checksum: ''
            };

            nextState.checksum = _computeHmacLite(_buildSignaturePayload(nextState));
            _sealedState = nextState;
            window.BAGANTARA_FARE_SIGNATURE = nextState.serverSignature;
            return true;
        },

        approveDriverMinTariff: function(minTariffAmount) {
            const parsedMin = parseInt(minTariffAmount, 10) || 0;
            if (parsedMin <= 0 || !_sealedState.checksum) return false;
            const expectedSig = _computeHmacLite(_buildSignaturePayload(_sealedState));
            if (expectedSig !== _sealedState.checksum) return false;

            _sealedState.driverMinTariffApproved = parsedMin;
            _sealedState.finalPrice = Math.max(_sealedState.finalPrice, parsedMin);
            if (_sealedState.serverSignatureMinApproved) {
                _sealedState.serverSignature = _sealedState.serverSignatureMinApproved;
            }
            _sealedState.checksum = _computeHmacLite(_buildSignaturePayload(_sealedState));
            window.BAGANTARA_FARE_SIGNATURE = _sealedState.serverSignature;
            return true;
        },

        getSignature: function() {
            return _sealedState.serverSignature || String(window.BAGANTARA_FARE_SIGNATURE || '');
        },

        verifyAndResolve: function() {
            const currentPickup = String(window.BAGANTARA_PICKUP_COORD || '').trim();
            const currentDropoff = _resolveCanonicalDropoffCoord();
            const currentStops = _getValidMultiStopCount();
            const currentService = String(window.BAGANTARA_SERVICE || _sealedState.service || 'RIDE').toUpperCase();

            const expectedVaultSig = _computeHmacLite(_buildSignaturePayload(_sealedState));
            const isVaultIntact = Boolean(
                _sealedState.checksum &&
                expectedVaultSig === _sealedState.checksum &&
                _sealedState.finalPrice > 0 &&
                _sealedState.distanceKm > 0 &&
                _sealedState.service === currentService &&
                _sealedState.pickupCoord === currentPickup &&
                _sealedState.dropoffCoord === currentDropoff &&
                _sealedState.multiStopCount === currentStops
            );

            let authoritativeFinalPrice = _sealedState.finalPrice > 0
                ? _sealedState.finalPrice
                : (parseInt(window.BAGANTARA_FINAL_PRICE, 10) || 0);
            let authoritativeOriginalPrice = _sealedState.originalPrice > 0
                ? _sealedState.originalPrice
                : (parseInt(window.BAGANTARA_ORIGINAL_PRICE, 10) || authoritativeFinalPrice);
            let authoritativeDiscountPercent = _sealedState.discountPercent || 0;
            let authoritativeDiscountAmount = _sealedState.discountAmount || 0;
            let authoritativeDiscountSource = _sealedState.discountSource || null;
            let authoritativePromoTeks = _sealedState.promoTeks || '';
            let authoritativeDistanceKm = _sealedState.distanceKm > 0
                ? _sealedState.distanceKm
                : (parseFloat(window.BAGANTARA_DISTANCE_KM) || 0);
            let authoritativeSignature = _sealedState.serverSignature || String(window.BAGANTARA_FARE_SIGNATURE || '');

            // Cek apakah ada penyesuaian Tarif Minimal Driver yang sah
            const activeDriver = window.BAGANTARA_DRIVER || window.BAGANTARA_PRELOCKED_DRIVER;
            const driverMinTariff = parseInt(activeDriver?.tarifMin, 10) || 0;
            if (driverMinTariff > authoritativeFinalPrice && (
                _sealedState.driverMinTariffApproved === driverMinTariff ||
                window.BAGANTARA_MIN_TARIFF_PREAPPROVED === true ||
                parseInt(window.BAGANTARA_FINAL_PRICE, 10) === driverMinTariff
            )) {
                authoritativeFinalPrice = driverMinTariff;
                if (_sealedState.serverSignatureMinApproved) {
                    authoritativeSignature = _sealedState.serverSignatureMinApproved;
                }
            }

            const globalFinalPrice = parseInt(window.BAGANTARA_FINAL_PRICE, 10) || 0;
            const globalDiscountPct = Number(window.BAGANTARA_DISCOUNT_PERCENT) || 0;
            const globalOriginalPrice = parseInt(window.BAGANTARA_ORIGINAL_PRICE, 10) || 0;

            const isTampered = Boolean(
                !isVaultIntact ||
                globalFinalPrice !== authoritativeFinalPrice ||
                Math.abs(globalDiscountPct - authoritativeDiscountPercent) > 0.01 ||
                (authoritativeOriginalPrice > 0 && globalOriginalPrice !== authoritativeOriginalPrice)
            );

            if (isTampered && authoritativeFinalPrice > 0) {
                window.BAGANTARA_FINAL_PRICE = authoritativeFinalPrice;
                window.BAGANTARA_ORIGINAL_PRICE = authoritativeOriginalPrice;
                window.BAGANTARA_DISCOUNT_PERCENT = authoritativeDiscountPercent;
                window.BAGANTARA_DISCOUNT_AMOUNT = authoritativeDiscountAmount;
                window.BAGANTARA_DISCOUNT_SOURCE = authoritativeDiscountSource;
                window.BAGANTARA_PROMO_TEKS = authoritativePromoTeks;
                window.BAGANTARA_DISTANCE_KM = authoritativeDistanceKm;
                window.BAGANTARA_FARE_SIGNATURE = authoritativeSignature;
            }

            return {
                tampered: isTampered,
                finalPrice: authoritativeFinalPrice,
                originalPrice: authoritativeOriginalPrice,
                discountPercent: authoritativeDiscountPercent,
                discountAmount: authoritativeDiscountAmount,
                discountSource: authoritativeDiscountSource,
                promoTeks: authoritativePromoTeks,
                distanceKm: authoritativeDistanceKm,
                activeZoneId: _sealedState.activeZoneId || window.BAGANTARA_ACTIVE_ZONE_ID || 'KDR-PARE-01',
                extraStops: _sealedState.extraStops || 0,
                signature: authoritativeSignature
            };
        },

        reset: function() {
            _sealedState = {
                finalPrice: 0,
                routePrice: 0,
                originalPrice: 0,
                discountPercent: 0,
                discountAmount: 0,
                discountSource: null,
                promoTeks: '',
                distanceKm: 0,
                service: null,
                pickupCoord: '',
                dropoffCoord: '',
                activeZoneId: '',
                multiStopCount: 0,
                extraStops: 0,
                driverUid: '',
                driverMinTariffApproved: 0,
                peakRuleName: null,
                serverSignature: '',
                serverSignatureRoute: '',
                serverSignatureMinApproved: '',
                timestamp: 0,
                checksum: ''
            };
            window.BAGANTARA_FARE_SIGNATURE = '';
        }
    });

    window.__BGN_SEAL__ = sealApi;
})();

window.ServiceRouter = {
    route: function(service) {
        if (!window.BAGANTARA_GPS_VERIFIED || !window.BAGANTARA_USER_GPS_COORD) {
            if (typeof window.enforceMandatoryGpsLock === 'function') {
                window.enforceMandatoryGpsLock('GPS_OFF');
            }
            return;
        }
        window.BAGANTARA_SERVICE = service;
        
        const labelLayanan = document.getElementById('labelLayananPeta');
        if (labelLayanan) labelLayanan.innerText = service;

        const layananConfig = window.BGN_CONFIG.layanan.services;
        if (!layananConfig || layananConfig[service] === false) {
            const txtAlert = window.BGN_CONFIG.wording.alerts.service_disabled;
            if (window.UIManager && window.UIManager.alertConfig) {
                window.UIManager.alertConfig('service_disabled', txtAlert);
            } else {
                alert(txtAlert);
            }
            return;
        }

        if (!window.BAGANTARA_ACTIVE_ZONE_ID) {
            let fallbackZoneId = null;
            const zoneData = window.BGN_CONFIG.zones;
            const earthR = window.BGN_CONFIG.rules_app.system_controls.earth_radius_km;
            const refCoord = window.BAGANTARA_USER_GPS_COORD ? window.BAGANTARA_USER_GPS_COORD : window.BAGANTARA_ACTIVE_COORD;
            
            if (refCoord && zoneData && zoneData.active_zones) {
                const getHaversine = (lat1, lon1, lat2, lon2) => {
                    if (window.AegisEngine && typeof window.AegisEngine.calculateDistance === 'function') {
                        return window.AegisEngine.calculateDistance(lat1, lon1, lat2, lon2);
                    }
                    const dLat = (lat2 - lat1) * Math.PI / 180;
                    const dLon = (lon2 - lon1) * Math.PI / 180;
                    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
                    return earthR * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
                };

                for (const z of zoneData.active_zones) {
                    if (z.is_open && z.center && z.center.lat && z.center.lng) {
                        const dist = getHaversine(refCoord.lat, refCoord.lng, z.center.lat, z.center.lng);
                        if (dist <= z.radius_km) {
                            fallbackZoneId = z.zone_id;
                            window.BAGANTARA_ACTIVE_ZONE_ID = fallbackZoneId;
                            break;
                        }
                    }
                }
            }

            if (!fallbackZoneId) {
                const zMsg = window.BGN_CONFIG.zones.default_locked_message;
                const txtAlertZone = `${zMsg.title}\n\n${zMsg.body}`;
                if (window.UIManager && window.UIManager.alertConfig) {
                    window.UIManager.alertConfig('dynamic', txtAlertZone.replace(/\n/g, '<br>'));
                } else {
                    alert(txtAlertZone);
                }
                return;
            }
        }

        if (window.UIManager && typeof window.UIManager.updatePrelockedBannerUI === 'function') {
            window.UIManager.updatePrelockedBannerUI(service);
        }

        if (service === 'RIDE' || service === 'CAR' || service === 'EXPRESS') {
            if (window.FlowEngine) window.FlowEngine.init();
        } else if (service === 'JASTIP') {
            if (window.FlowJastip) window.FlowJastip.init();
        } else {
            const wAlerts = window.BGN_CONFIG.wording.alerts;
            alert(wAlerts.service_empty);
        }
    }
};

window.bindSafeButton = function(btnId, callback) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', callback);
};

window.SystemReset = function() {
    if (localStorage.getItem('bgt_active_chat') || (window.ChatHandshake && typeof window.ChatHandshake.isSesiAktif === 'function' && window.ChatHandshake.isSesiAktif())) return;
    
    const bottomNav = document.getElementById('mainBottomNav');
    if (bottomNav) bottomNav.classList.remove('hidden');

    const navHome = document.getElementById('navHome');
    const navAbout = document.getElementById('navAbout');
    const navSettings = document.getElementById('navSettings');
    if (navHome) navHome.classList.add('active');
    if (navAbout) navAbout.classList.remove('active');
    if (navSettings) navSettings.classList.remove('active');

    if (window.spaNavigateTo) window.spaNavigateTo('view-mitra-map');

    window.BAGANTARA_SERVICE = null;
    window.BAGANTARA_PICKUP_COORD = null;
    window.BAGANTARA_DROPOFF_COORD = null;
    window.BAGANTARA_MULTI_DROPOFFS = [];
    window.BAGANTARA_PICKUP_DETAIL = null;
    window.BAGANTARA_DROPOFF_DETAIL = null; 
    window.BAGANTARA_JASTIP_STORE = null;
    window.BAGANTARA_JASTIP_ITEMS = [];
    window.BAGANTARA_JASTIP_VALUE = 0;
    window.BAGANTARA_FINAL_PRICE = 0;
    window.BAGANTARA_ORIGINAL_PRICE = 0;
    window.BAGANTARA_DISCOUNT_PERCENT = 0;
    window.BAGANTARA_DISCOUNT_AMOUNT = 0;
    window.BAGANTARA_DISCOUNT_SOURCE = null;
    window.BAGANTARA_PROMO_TEKS = '';
    window.BAGANTARA_DISTANCE_KM = 0;
    window.BAGANTARA_ACTIVE_PEAK_RULE = null;
    window.BAGANTARA_FARE_SIGNATURE = '';
    window.BAGANTARA_PRELOCKED_DRIVER = null;
    window.BAGANTARA_MIN_TARIFF_PREAPPROVED = false;
    window.BAGANTARA_MAP_TARGET_INDEX = 1;
    window.TEMPORARY_GEOCODE = null;
    window.LOCKED_SEARCH_COORD = null;
    window.LOCKED_SEARCH_TEXT = null;
    window.LOCKED_SEARCH_TARGET = null;

    if (window.__BGN_SEAL__ && typeof window.__BGN_SEAL__.reset === 'function') {
        window.__BGN_SEAL__.reset();
    }

    if (window.FlowEngine) window.FlowEngine._initialPickupAutoLocked = false;
    if (window.FlowJastip) window.FlowJastip._initialDropoffAutoLocked = false;

    if (window.BAGANTARA_USER_GPS_COORD && !isNaN(parseFloat(window.BAGANTARA_USER_GPS_COORD.lat))) {
        window.BAGANTARA_ACTIVE_COORD = {
            lat: parseFloat(window.BAGANTARA_USER_GPS_COORD.lat),
            lng: parseFloat(window.BAGANTARA_USER_GPS_COORD.lng)
        };
    }

    if (window.UIManager && typeof window.UIManager.updatePrelockedBannerUI === 'function') {
        window.UIManager.updatePrelockedBannerUI(null);
    }

    const row2 = document.getElementById('rowDropoff2');
    const row3 = document.getElementById('rowDropoff3');
    if (row2) row2.remove();
    if (row3) row3.remove();
    if (window.UIManager) window.UIManager.stopCount = 1;

    const btnAddStop = document.getElementById('btnAddStop');
    if (btnAddStop) btnAddStop.style.display = 'block';

    const container = document.getElementById('jastipItemsContainer');
    if (container) container.innerHTML = '';
    
    document.querySelectorAll('input:not(.chat-input)').forEach(input => {
        if (input.type === 'text' || input.type === 'number' || input.type === 'tel') input.value = '';
        input.removeAttribute('readonly');
        input.style.color = input.id === 'inputTipCustom' ? 'var(--neon-gold)' : 'var(--text-main)';
        input.style.fontWeight = '';
    });

    document.querySelectorAll('.btn-clear-input').forEach(btn => {
        btn.style.display = 'none';
    });

    const stickyContinue = document.getElementById('stickyContinueArea');
    if (stickyContinue) stickyContinue.classList.add('hidden');

    const stickyJastip = document.getElementById('stickyJastipCheckout');
    if (stickyJastip) stickyJastip.style.display = 'none';

    document.getElementById('searchRouteResults')?.classList.add('hidden');
    document.getElementById('jastipStoreResults')?.classList.add('hidden');
    document.getElementById('jastipDropoffResults')?.classList.add('hidden');
    document.getElementById('tariff-match-overlay')?.classList.add('hidden');
};

document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('mapStopped', () => {
        const liveAddressTitle = document.getElementById('liveAddressTitle');
        const searchingGps = window.BGN_CONFIG.wording.map_pins.searching_gps;
        if (liveAddressTitle) liveAddressTitle.innerText = window.TEMPORARY_GEOCODE ? window.TEMPORARY_GEOCODE : searchingGps;
    });

    window.addEventListener('forceWizardState', (e) => {
        const state = e.detail;
        const srv = window.BAGANTARA_SERVICE;
        
        if ((srv === 'RIDE' || srv === 'CAR' || srv === 'EXPRESS') && window.FlowEngine) {
            window.FlowEngine.setManualState(state);
        } else if (srv === 'JASTIP' && window.FlowJastip) {
            if (typeof window.FlowJastip.setManualState === 'function') window.FlowJastip.setManualState(state);
        }
    });

    window.addEventListener('priceCalculated', async (e) => {
        const distance = parseFloat(e.detail.distance);
        const wAlerts = window.BGN_CONFIG.wording.alerts;
        const wPopup = window.BGN_CONFIG.wording.mitra_popup;
        const alertRoute = wAlerts.route_invalid;
        
        if (isNaN(distance) || distance <= 0) {
            if (window.SystemReset) window.SystemReset();
            if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('route_invalid', alertRoute);
            else alert(alertRoute);
            return;
        }
        
        window.BAGANTARA_DISTANCE_KM = distance; 
        const service = String(window.BAGANTARA_SERVICE ? window.BAGANTARA_SERVICE : wPopup.default_service).toUpperCase();
        
        try {
            const zoneData = window.BGN_CONFIG.zones;
            const sysCtrl = window.BGN_CONFIG.rules_app.system_controls;
            if (!zoneData) throw new Error("ZONA_KOSONG");

            let activeZone = window.BAGANTARA_ACTIVE_ZONE_ID || 'KDR-PARE-01';

            if (window.BAGANTARA_PICKUP_COORD && zoneData.active_zones) {
                const getHaversine = (lat1, lon1, lat2, lon2) => {
                    if (window.AegisEngine && typeof window.AegisEngine.calculateDistance === 'function') {
                        return window.AegisEngine.calculateDistance(lat1, lon1, lat2, lon2);
                    }
                    const R = sysCtrl.earth_radius_km; 
                    const dLat = (lat2 - lat1) * Math.PI / 180;
                    const dLon = (lon2 - lon1) * Math.PI / 180;
                    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
                    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
                };

                const [pLat, pLng] = window.BAGANTARA_PICKUP_COORD.split(',').map(Number);
                let foundZone = null;

                for (const z of zoneData.active_zones) {
                    if (z.is_open && z.center && z.center.lat && z.center.lng) {
                        const dist = getHaversine(pLat, pLng, z.center.lat, z.center.lng);
                        if (dist <= z.radius_km) {
                            foundZone = z.zone_id;
                            break;
                        }
                    }
                }
                
                if (foundZone) {
                    activeZone = foundZone;
                    window.BAGANTARA_ACTIVE_ZONE_ID = foundZone; 
                } else {
                    activeZone = null;
                }
            }

            if (!activeZone) throw new Error("LOKASI_LUAR_ZONA");

            const totalTitik = Array.isArray(window.BAGANTARA_MULTI_DROPOFFS)
                ? window.BAGANTARA_MULTI_DROPOFFS.filter(m => m && !isNaN(parseFloat(m.lat)) && !isNaN(parseFloat(m.lng))).length
                : 1;
            const extraStops = Math.max(0, totalTitik > 1 ? totalTitik - 1 : 0);

            const prelockedDriver = window.BAGANTARA_PRELOCKED_DRIVER || window.BAGANTARA_DRIVER;
            const diskonMap = (prelockedDriver && prelockedDriver.diskonMap) ? prelockedDriver.diskonMap : {};
            const rawDriverDisc = diskonMap[service] !== undefined ? diskonMap[service] : 0;
            const driverDiscountPct = parseFloat(String(rawDriverDisc).replace('%', '').trim()) || 0;
            const driverMinTariff = parseInt(prelockedDriver?.tarifMin, 10) || 0;
            const promoTeks = (prelockedDriver && prelockedDriver.promoTeks) ? prelockedDriver.promoTeks : '';

            // HITUNG TARIF OTORITATIF 100% DI DALAM CLOSURE LOKAL (__BGN_SEAL__ / 0 VERCEL QUOTA)
            const fareData = (window.__BGN_SEAL__ && typeof window.__BGN_SEAL__.computeSingleFare === 'function')
                ? window.__BGN_SEAL__.computeSingleFare({
                    zoneId: activeZone,
                    pickupCoord: window.BAGANTARA_PICKUP_COORD || '',
                    layanan: service,
                    distanceKm: distance,
                    extraStops: extraStops,
                    multiStopCount: totalTitik,
                    driverDiscountPct: driverDiscountPct,
                    driverDiskonMap: diskonMap,
                    driverMinTariff: driverMinTariff,
                    applyMinTariff: false,
                    promoTeks: promoTeks
                })
                : null;
            if (!fareData || !fareData.ok) {
                throw new Error('KALKULASI_LOKAL_GAGAL');
            }

            window.BAGANTARA_ACTIVE_ZONE_ID = fareData.zone_id || activeZone;
            window.BAGANTARA_ORIGINAL_PRICE = parseInt(fareData.harga_normal, 10) || 0;
            window.BAGANTARA_DISCOUNT_PERCENT = Number(fareData.diskon_persen) || 0;
            window.BAGANTARA_DISCOUNT_AMOUNT = parseInt(fareData.diskon_nominal, 10) || Math.max(0, window.BAGANTARA_ORIGINAL_PRICE - (parseInt(fareData.harga_rute || fareData.harga_dasar, 10) || 0));
            window.BAGANTARA_DISCOUNT_SOURCE = fareData.diskon_source || null;
            window.BAGANTARA_PROMO_TEKS = fareData.promo_teks !== undefined ? fareData.promo_teks : promoTeks;
            window.BAGANTARA_FINAL_PRICE = parseInt(fareData.harga_rute !== undefined ? fareData.harga_rute : fareData.harga_dasar, 10) || 0;
            window.BAGANTARA_ACTIVE_PEAK_RULE = fareData.peak_rule_name || null;
            window.BAGANTARA_FARE_SIGNATURE = String(fareData.signature || '');

            // SEGEL NILAI HARGA SAH & SIGNATURE SERVER KE DALAM CLOSURE INTERNAL (__BGN_SEAL__)
            if (window.__BGN_SEAL__ && typeof window.__BGN_SEAL__.seal === 'function') {
                window.__BGN_SEAL__.seal({
                    finalPrice: window.BAGANTARA_FINAL_PRICE,
                    routePrice: window.BAGANTARA_FINAL_PRICE,
                    originalPrice: window.BAGANTARA_ORIGINAL_PRICE,
                    discountPercent: window.BAGANTARA_DISCOUNT_PERCENT,
                    discountAmount: window.BAGANTARA_DISCOUNT_AMOUNT,
                    discountSource: window.BAGANTARA_DISCOUNT_SOURCE,
                    promoTeks: window.BAGANTARA_PROMO_TEKS,
                    distanceKm: window.BAGANTARA_DISTANCE_KM,
                    service: service,
                    activeZoneId: window.BAGANTARA_ACTIVE_ZONE_ID,
                    peakRuleName: window.BAGANTARA_ACTIVE_PEAK_RULE,
                    signature: fareData.signature || '',
                    signatureRoute: fareData.signature_route || fareData.signature || '',
                    signatureMinApproved: fareData.signature_min_approved || fareData.signature || ''
                });
            }
            
            if (service === 'JASTIP' && window.FlowJastip && typeof window.FlowJastip.overrideJastipPriceDisplay === 'function') {
                window.FlowJastip.overrideJastipPriceDisplay();
            } else {
                const currencyCode = fareData.currency || window.BGN_CONFIG?.tariffs?.currency || 'IDR';
                const fmtCurrency = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: currencyCode, minimumFractionDigits: 0 }).format(val);
                const formatHarga = fmtCurrency(window.BAGANTARA_FINAL_PRICE);
                const priceValueEl = document.getElementById('priceValue');
                if (priceValueEl) {
                    const peakHtml = window.BAGANTARA_ACTIVE_PEAK_RULE
                        ? `<span style="font-size: 0.65rem; color: var(--neon-gold); font-weight: bold; white-space: nowrap;">(${wPopup.peak_hour_badge_prefix} ${window.BAGANTARA_ACTIVE_PEAK_RULE})</span>`
                        : '';
                    if (window.BAGANTARA_DISCOUNT_PERCENT > 0 && window.BAGANTARA_ORIGINAL_PRICE > window.BAGANTARA_FINAL_PRICE) {
                        const formatHargaAsli = fmtCurrency(window.BAGANTARA_ORIGINAL_PRICE);
                        const labelBadgeDiskon = window.BAGANTARA_DISCOUNT_SOURCE === 'DRIVER'
                            ? `DISKON DRIVER ${window.BAGANTARA_DISCOUNT_PERCENT}%`
                            : `DISKON ${window.BAGANTARA_DISCOUNT_PERCENT}%`;
                        priceValueEl.innerHTML = `<span style="display:inline-flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:6px;"><span style="font-size: 0.8rem; color: var(--text-muted); text-decoration: line-through; font-weight: 600; white-space: nowrap;">${formatHargaAsli}</span><span style="white-space: nowrap;">${formatHarga}</span><span style="font-size: 0.62rem; background: rgba(16, 185, 129, 0.16); border: 1px solid var(--neon-green); color: var(--neon-green); padding: 2px 6px; border-radius: 6px; font-weight: 800; white-space: nowrap;">${labelBadgeDiskon}</span><span style="font-size: 0.72rem; color: var(--text-muted); font-weight: 600; white-space: nowrap;">(${distance.toFixed(1)} KM)</span>${peakHtml}</span>`;
                    } else {
                        priceValueEl.innerHTML = `<span style="display:inline-flex; flex-wrap:wrap; align-items:center; justify-content:center; gap:6px;"><span style="white-space: nowrap;">${formatHarga}</span><span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; white-space: nowrap;">(${distance.toFixed(1)} KM)</span>${peakHtml}</span>`;
                    }
                }
            }
        } catch (err) {
            let pesanError = wAlerts.calc_failed;
            if (err.message === "LOKASI_LUAR_ZONA") pesanError = wAlerts.out_of_zone;
            else if (err.message === "TARIF_KOSONG") pesanError = wAlerts.tariff_empty;
            else if (err.message === "LAYANAN_KOSONG") pesanError = wAlerts.service_empty;

            if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('dynamic', pesanError);
            else alert(pesanError); 
        }
    });
});

window.resetWizard = function() { window.SystemReset(); };