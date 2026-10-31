// ==========================================================================
// FILE: api/calculate-fare.js (VERCEL SERVERLESS FUNCTION - BAGANTARA PUBLIK V12.0)
// FUNGSI: Mesin Tarif Server Otoritatif (Zero-Client-Leak untuk tariffs.json,
//         peak-hours.json, & zones.json) + Batch Preview + Single Route Lock HMAC-SHA256
// ==========================================================================

import crypto from 'crypto';

const HMAC_SECRET = process.env.BGN_HMAC_SECRET || 'BGN_SERVER_DEFAULT_HMAC_VAULT_KEY_V12';
const PRICE_ROUNDING_STEP = 100;
const EARTH_RADIUS_KM = 6371;

// Data Otoritatif Server: Dipindahkan 100% dari data/tariffs.json
const TARIFFS_DATA = {
    version: 5,
    currency: 'IDR',
    zones: {
        'KDR-PARE-01': {
            RIDE: {
                base_price: 6000,
                min_distance_km: 2.0,
                price_per_km: 2000,
                multi_stop_fee: 0,
                discount: '0%'
            },
            CAR: {
                base_price: 15000,
                min_distance_km: 2.0,
                price_per_km: 4500,
                multi_stop_fee: 0,
                discount: '0%'
            },
            EXPRESS: {
                base_price: 6000,
                min_distance_km: 2.0,
                price_per_km: 2000,
                multi_stop_fee: 0,
                discount: '0%'
            },
            JASTIP: {
                base_price: 8000,
                min_distance_km: 2.0,
                price_per_km: 2000,
                multi_stop_fee: 2000,
                discount: '0%'
            }
        }
    }
};

// Data Otoritatif Server: Dipindahkan 100% dari data/peak-hours.json
const PEAK_HOURS_DATA = {
    version: 2,
    zones: {
        'KDR-PARE-01': {
            is_active: false,
            rules: [
                { name: 'Sore Sibuk', start_time: '16:00', end_time: '19:00', multiplier_factor: 1.25, markup_flat: 2000 },
                { name: 'Hujan / Ekstrem', start_time: '00:00', end_time: '23:59', multiplier_factor: 1.50, markup_flat: 0 }
            ]
        },
        'MLG-01': {
            is_active: false,
            rules: [
                { name: 'Macet Malang', start_time: '15:00', end_time: '20:00', multiplier_factor: 1.30, markup_flat: 3000 }
            ]
        },
        'SBY-01': { is_active: false, rules: [] },
        'SDA-01': { is_active: false, rules: [] },
        'GSK-01': { is_active: false, rules: [] },
        'MJK-01': { is_active: false, rules: [] },
        'PSR-01': { is_active: false, rules: [] },
        'BTU-01': { is_active: false, rules: [] },
        'BLT-01': { is_active: false, rules: [] },
        'MDN-01': { is_active: false, rules: [] }
    }
};

// Data Otoritatif Server: Dipindahkan dari data/zones.json
const ZONES_DATA = {
    version: 4,
    active_zones: [
        { zone_id: 'KDR-PARE-01', city_name: 'Kediri', center: { lat: -7.768049, lng: 112.196514 }, radius_km: 25.0, is_open: true },
        { zone_id: 'MLG-01', city_name: 'Malang Kota', center: { lat: -7.979700, lng: 112.630400 }, radius_km: 15.0, is_open: false },
        { zone_id: 'SBY-01', city_name: 'Surabaya', center: { lat: -7.250445, lng: 112.768845 }, radius_km: 20.0, is_open: false },
        { zone_id: 'SDA-01', city_name: 'Sidoarjo', center: { lat: -7.447800, lng: 112.718300 }, radius_km: 15.0, is_open: false },
        { zone_id: 'GSK-01', city_name: 'Gresik', center: { lat: -7.166200, lng: 112.654300 }, radius_km: 15.0, is_open: false },
        { zone_id: 'MJK-01', city_name: 'Mojokerto', center: { lat: -7.472600, lng: 112.433800 }, radius_km: 12.0, is_open: false },
        { zone_id: 'PSR-01', city_name: 'Pasuruan', center: { lat: -7.645300, lng: 112.907500 }, radius_km: 15.0, is_open: false },
        { zone_id: 'BTU-01', city_name: 'Batu', center: { lat: -7.867100, lng: 112.523900 }, radius_km: 10.0, is_open: false },
        { zone_id: 'BLT-01', city_name: 'Blitar', center: { lat: -8.098300, lng: 112.168100 }, radius_km: 15.0, is_open: false },
        { zone_id: 'MDN-01', city_name: 'Madiun', center: { lat: -7.629800, lng: 111.523900 }, radius_km: 15.0, is_open: false }
    ]
};

function calculateHaversineKm(lat1, lon1, lat2, lon2) {
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return EARTH_RADIUS_KM * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function resolveActiveZoneId(requestedZoneId, pickupCoordStr = '') {
    if (pickupCoordStr && typeof pickupCoordStr === 'string' && pickupCoordStr.includes(',')) {
        const [pLat, pLng] = pickupCoordStr.split(',').map(Number);
        if (!isNaN(pLat) && !isNaN(pLng)) {
            for (const z of ZONES_DATA.active_zones) {
                if (z.is_open && z.center) {
                    const dist = calculateHaversineKm(pLat, pLng, z.center.lat, z.center.lng);
                    if (dist <= z.radius_km) {
                        return { zoneId: z.zone_id, outOfZone: false };
                    }
                }
            }
            return { zoneId: null, outOfZone: true };
        }
    }
    const cleanZone = String(requestedZoneId || 'KDR-PARE-01').trim() || 'KDR-PARE-01';
    const resolved = TARIFFS_DATA.zones[cleanZone] ? cleanZone : 'KDR-PARE-01';
    return { zoneId: resolved, outOfZone: false };
}

function parseDiscountPercent(rawVal) {
    if (rawVal === undefined || rawVal === null || rawVal === '') return 0;
    const cleaned = String(rawVal).replace('%', '').replace(',', '.').trim();
    const num = parseFloat(cleaned);
    if (isNaN(num) || num <= 0) return 0;
    return Math.min(99, Math.max(0, num));
}

function getWibCurrentMinutes() {
    try {
        const fmt = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Jakarta',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit'
        });
        const parts = fmt.formatToParts(new Date());
        const hourPart = parts.find(p => p.type === 'hour');
        const minPart = parts.find(p => p.type === 'minute');
        const h = parseInt(hourPart ? hourPart.value : '0', 10) % 24;
        const m = parseInt(minPart ? minPart.value : '0', 10) || 0;
        return (h * 60) + m;
    } catch (e) {
        const now = new Date();
        const utcMinutes = (now.getUTCHours() * 60) + now.getUTCMinutes();
        return (utcMinutes + (7 * 60)) % (24 * 60);
    }
}

function parseTimeToMinutes(timeStr) {
    if (!timeStr) return -1;
    const parts = String(timeStr).split(':');
    if (parts.length < 2) return -1;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return -1;
    return (h * 60) + m;
}

function evaluatePeakHours(zoneId, rawFareInput) {
    let adjustedFare = rawFareInput;
    let peakRuleName = null;

    const zonePeak = PEAK_HOURS_DATA.zones?.[zoneId];
    if (zonePeak && zonePeak.is_active === true && Array.isArray(zonePeak.rules)) {
        const nowMinutes = getWibCurrentMinutes();
        for (let i = 0; i < zonePeak.rules.length; i++) {
            const pRule = zonePeak.rules[i];
            const startMin = parseTimeToMinutes(pRule.start_time);
            const endMin = parseTimeToMinutes(pRule.end_time);
            if (startMin >= 0 && endMin >= 0) {
                const isInWindow = startMin <= endMin
                    ? (nowMinutes >= startMin && nowMinutes <= endMin)
                    : (nowMinutes >= startMin || nowMinutes <= endMin);
                if (isInWindow) {
                    const mult = parseFloat(pRule.multiplier_factor);
                    const flat = parseFloat(pRule.markup_flat);
                    if (!isNaN(mult) && mult > 0) adjustedFare = adjustedFare * mult;
                    if (!isNaN(flat) && flat > 0) adjustedFare = adjustedFare + flat;
                    peakRuleName = pRule.name || null;
                    break;
                }
            }
        }
    }

    return { adjustedFare, peakRuleName };
}

export function createFareHmacSignature(payloadObj) {
    const srv = String(payloadObj.layanan || 'RIDE').toUpperCase();
    const zoneId = String(payloadObj.zoneId || 'KDR-PARE-01').trim();
    const distNorm = Number(payloadObj.distanceKm || 0).toFixed(2);
    const stops = parseInt(payloadObj.extraStops, 10) || 0;
    const hargaDasar = parseInt(payloadObj.harga_dasar, 10) || 0;
    const hargaNormal = parseInt(payloadObj.harga_normal, 10) || 0;
    const diskonPct = Number(payloadObj.diskon_persen || 0).toFixed(2);
    const canonical = `${srv}|${zoneId}|${distNorm}|${stops}|${hargaDasar}|${hargaNormal}|${diskonPct}`;
    return crypto.createHmac('sha256', HMAC_SECRET).update(canonical).digest('hex');
}

function computeSingleServiceFare({
    zoneId = 'KDR-PARE-01',
    layanan = 'RIDE',
    distanceKm = 0,
    extraStops = 0,
    tipNominal = 0,
    driverDiscountPct = 0,
    zoneDiscountPctOverride = null,
    driverMinTariff = 0,
    applyMinTariff = false,
    promoTeks = ''
}) {
    const srv = String(layanan || 'RIDE').toUpperCase();
    const dist = Math.max(0, parseFloat(distanceKm) || 0);
    const stops = Math.max(0, parseInt(extraStops, 10) || 0);
    const tip = Math.max(0, parseInt(tipNominal, 10) || 0);
    const minDriver = Math.max(0, parseInt(driverMinTariff, 10) || 0);

    const zoneRulesMap = TARIFFS_DATA.zones[zoneId] || TARIFFS_DATA.zones['KDR-PARE-01'];
    const cfg = zoneRulesMap[srv] || zoneRulesMap.RIDE;

    const minDist = parseFloat(cfg.min_distance_km) || 2.0;
    const basePrice = parseFloat(cfg.base_price) || 6000;
    const perKm = parseFloat(cfg.price_per_km) || 2000;
    const stopFee = parseFloat(cfg.multi_stop_fee) || 0;

    let rawFare = dist <= minDist
        ? basePrice
        : basePrice + ((dist - minDist) * perKm);

    if (stops > 0 && stopFee > 0) {
        rawFare += (stops * stopFee);
    }

    const peakResult = evaluatePeakHours(zoneId, rawFare);
    rawFare = peakResult.adjustedFare;

    const normalRounded = Math.ceil(rawFare / PRICE_ROUNDING_STEP) * PRICE_ROUNDING_STEP;

    const drvDisc = parseDiscountPercent(driverDiscountPct);
    const znDisc = zoneDiscountPctOverride !== null && zoneDiscountPctOverride !== undefined
        ? parseDiscountPercent(zoneDiscountPctOverride)
        : parseDiscountPercent(cfg.discount);

    // Prioritas 1: Diskon Spesifik Driver, Prioritas 2: Diskon Zona
    const discPct = drvDisc > 0 ? drvDisc : znDisc;
    const discountSource = drvDisc > 0 ? 'DRIVER' : (znDisc > 0 ? 'ZONA' : null);

    const discountedRaw = discPct > 0 ? rawFare * (1 - (discPct / 100)) : rawFare;
    const routeRounded = Math.ceil(discountedRaw / PRICE_ROUNDING_STEP) * PRICE_ROUNDING_STEP;
    const discountAmount = Math.max(0, normalRounded - routeRounded);

    const finalWithMin = minDriver > 0 ? Math.max(routeRounded, minDriver) : routeRounded;
    const isMinTariffApplied = finalWithMin > routeRounded;
    const effectiveBase = applyMinTariff ? finalWithMin : routeRounded;

    const signatureRoute = createFareHmacSignature({
        layanan: srv,
        zoneId,
        distanceKm: dist,
        extraStops: stops,
        harga_dasar: routeRounded,
        harga_normal: normalRounded,
        diskon_persen: discPct
    });

    const signatureMinApproved = createFareHmacSignature({
        layanan: srv,
        zoneId,
        distanceKm: dist,
        extraStops: stops,
        harga_dasar: finalWithMin,
        harga_normal: normalRounded,
        diskon_persen: discPct
    });

    return {
        ok: true,
        zone_id: zoneId,
        currency: TARIFFS_DATA.currency,
        layanan: srv,
        jarak_km: parseFloat(dist.toFixed(2)),
        extra_stops: stops,
        harga_normal: normalRounded,
        diskon_persen: discPct,
        diskon_nominal: discountAmount,
        diskon_source: discountSource,
        promo_teks: String(promoTeks || ''),
        harga_rute: routeRounded,
        harga_dasar: effectiveBase,
        final_fare_with_min: finalWithMin,
        driver_min_tariff: minDriver,
        is_min_tariff_applied: isMinTariffApplied,
        tip_nominal: tip,
        harga_tawaran: effectiveBase + tip,
        peak_rule_name: peakResult.peakRuleName,
        signature: applyMinTariff ? signatureMinApproved : signatureRoute,
        signature_route: signatureRoute,
        signature_min_approved: signatureMinApproved
    };
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-BGN-Client-Token');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const mode = String(body.mode || 'SINGLE_LOCK').toUpperCase();

        const zoneCheck = resolveActiveZoneId(body.zoneId || body.activeZoneId, body.pickupCoord || '');
        if (body.validateZone === true && zoneCheck.outOfZone) {
            return res.status(400).json({
                ok: false,
                errorCode: 'LOKASI_LUAR_ZONA',
                error: 'Titik penjemputan berada di luar wilayah operasional yang aktif.'
            });
        }
        const activeZoneId = zoneCheck.zoneId || 'KDR-PARE-01';

        const distKm = Math.max(0, parseFloat(body.distanceKm) || 0);
        const extraStops = body.extraStops !== undefined
            ? Math.max(0, parseInt(body.extraStops, 10) || 0)
            : Math.max(0, (parseInt(body.multiStopCount, 10) || 1) - 1);

        // MODE 1: BATCH PREVIEW (Estimasi Cepat Katalog Driver - 1 Request untuk Seluruh Katalog)
        if (mode === 'BATCH_PREVIEW' || Array.isArray(body.drivers)) {
            const servicesList = ['RIDE', 'CAR', 'EXPRESS', 'JASTIP'];
            const serviceFares = {};

            for (const srv of servicesList) {
                const calc = computeSingleServiceFare({
                    zoneId: activeZoneId,
                    layanan: srv,
                    distanceKm: distKm,
                    extraStops: 0,
                    tipNominal: 0,
                    driverDiscountPct: 0,
                    driverMinTariff: 0,
                    applyMinTariff: false
                });
                serviceFares[srv] = {
                    routeFare: calc.harga_rute,
                    normalFare: calc.harga_normal,
                    zoneDiscountPct: calc.diskon_persen,
                    peakRuleName: calc.peak_rule_name,
                    signature: calc.signature
                };
            }

            const driverResults = {};
            const inputDrivers = Array.isArray(body.drivers) ? body.drivers.slice(0, 60) : [];

            for (const d of inputDrivers) {
                if (!d || !d.uid) continue;
                const uid = String(d.uid);
                const dMin = Math.max(0, parseInt(d.tarifMin, 10) || 10000);
                const diskonMap = (d.diskonMap && typeof d.diskonMap === 'object') ? d.diskonMap : {};
                driverResults[uid] = {};

                for (const srv of servicesList) {
                    const drvDisc = parseDiscountPercent(diskonMap[srv]);
                    const dCalc = computeSingleServiceFare({
                        zoneId: activeZoneId,
                        layanan: srv,
                        distanceKm: distKm,
                        extraStops: 0,
                        tipNominal: 0,
                        driverDiscountPct: drvDisc,
                        driverMinTariff: dMin,
                        applyMinTariff: true,
                        promoTeks: d.promoTeks || ''
                    });

                    driverResults[uid][srv] = {
                        finalFare: dCalc.final_fare_with_min,
                        routeFare: dCalc.harga_rute,
                        normalFare: dCalc.harga_normal,
                        isMinTariffApplied: dCalc.is_min_tariff_applied,
                        discountPct: dCalc.diskon_persen,
                        discountSource: dCalc.diskon_source,
                        distanceKm: dCalc.jarak_km,
                        peakRuleName: dCalc.peak_rule_name,
                        signature: dCalc.signature
                    };
                }
            }

            return res.status(200).json({
                ok: true,
                mode: 'BATCH_PREVIEW',
                zone_id: activeZoneId,
                currency: TARIFFS_DATA.currency,
                distanceKm: parseFloat(distKm.toFixed(2)),
                service_fares: serviceFares,
                drivers: driverResults
            });
        }

        // MODE 2: SINGLE ROUTE LOCK (Perhitungan Rute Tunggal + Tanda Tangan HMAC-SHA256 Server)
        const srv = String(body.layanan || body.service || 'RIDE').toUpperCase();
        const diskonMap = (body.driverDiskonMap && typeof body.driverDiskonMap === 'object') ? body.driverDiskonMap : {};
        const explicitDrvDisc = body.driverDiscountPct !== undefined ? body.driverDiscountPct : diskonMap[srv];

        const singleResult = computeSingleServiceFare({
            zoneId: activeZoneId,
            layanan: srv,
            distanceKm: distKm,
            extraStops: extraStops,
            tipNominal: body.tipNominal || 0,
            driverDiscountPct: explicitDrvDisc,
            zoneDiscountPctOverride: body.zoneDiscountPct,
            driverMinTariff: body.driverMinTariff || 0,
            applyMinTariff: Boolean(body.applyMinTariff),
            promoTeks: body.promoTeks || ''
        });

        return res.status(200).json(singleResult);
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
}
