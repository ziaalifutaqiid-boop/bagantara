// ==========================================================================
// FILE: api/bgn-gateway.js (VERCEL SERVERLESS UNIFIED BFF GATEWAY - BAGANTARA PUBLIK V12.5)
// FUNGSI: 1. Enkripsi & Dekripsi Simetris RC4 + XOR (X-BGN-Nonce & X-BGN-Client-Token)
//         2. SCAN_CATALOG: Hidrasi Katalog Driver dari RTDB Node #1 & Node #6 +
//            Dokumen Profil Cloud Firestore (bagantara-core) + Filter Tier-1 & Tier-2 WA
//         3. CHAT_OP: Orkestrasi Bidding & Ruang Komunikasi Langsung (CREATE_TICKET, POLL_STATE,
//            SEND_MSG, UPDATE_STATUS, CLEANUP) lintas RTDB Node #2, Node #3, & Failover Node #6
//            + Pemicu Push Notification FCM HTTP v1 ke Google Apps Script (Code-GAS-Unified-V8)
//         4. UPLOAD_MEDIA & GET ?action=media: Penyimpanan Media Terkompresi URL Pendek (<80 char)
//            agar 100% Lolos Validasi Rules Node #3 (konten.length <= 5000)
//         5. GET ?action=tile: Proxy Tile Peta Resmi MapTiler (streets-v2 & basic-v2, 0% OSM/CartoDB)
//         6. GEOCODE & REVERSE_GEOCODE: Pencarian Alamat & Koordinat 100% MapTiler Geocoding API (0% Photon/OSM)
// ==========================================================================

const XOR_MASK_SALT = 'BGN12_GW_XOR_MASK_7731';
const EARTH_RADIUS_KM = 6371;

// API Key Resmi MapTiler (Bisa di-override via Vercel Environment Variable BGN_MAPTILER_API_KEY)
const MAPTILER_API_KEY = (
    process.env.BGN_MAPTILER_API_KEY ||
    'GHEMVdokax4heMQCeIxM'
).trim();

// Konfigurasi Cluster Firebase Multi-Node & GAS Micro-Backend (Bisa Di-override via Vercel Env)
const NODE1_RTDB_URL = (
    process.env.BGN_FIREBASE_CORE_URL ||
    process.env.BGT_NODE1_RTDB_URL ||
    'https://bagantara-core-default-rtdb.asia-southeast1.firebasedatabase.app'
).trim().replace(/\/+$/, '');

const NODE1_FIRESTORE_PROJECT = (
    process.env.BGN_FIRESTORE_PROJECT_ID ||
    process.env.BGT_NODE1_PROJECT_ID ||
    'bagantara-core'
).trim();

const NODE2_RADAR_URL = (
    process.env.BGN_FIREBASE_RADAR_URL ||
    process.env.BGT_NODE3_RTDB_URL ||
    'https://chatting-88040-default-rtdb.asia-southeast1.firebasedatabase.app'
).trim().replace(/\/+$/, '');

const NODE3_CHAT_URL = (
    process.env.BGN_FIREBASE_CHAT_URL ||
    process.env.BGT_NODE3_RTDB_URL ||
    'https://chatting-88040-default-rtdb.asia-southeast1.firebasedatabase.app'
).trim().replace(/\/+$/, '');

const NODE6_OVERFLOW_URL = (
    process.env.BGN_FIREBASE_OVERFLOW_URL ||
    process.env.BGT_NODE6_RTDB_URL ||
    'https://futaqi-ali-default-rtdb.asia-southeast1.firebasedatabase.app'
).trim().replace(/\/+$/, '');

const GAS_FCM_URL = (
    process.env.BGN_GAS_FCM_URL ||
    process.env.BGT_GAS_BACKEND_URL ||
    'https://script.google.com/macros/s/AKfycbxkSFTmerLbUa5iEWEqyjUz9OVBo8xTznm90HJMKDRBQ9t-x8UxjUHas_K1JqqMgHzneg/exec'
).trim();

// Cache Memori Server (Menghemat Kuota Read Firestore & RTDB)
let _firestoreCollectionCache = {
    timestamp: 0,
    profilesByUid: new Map()
};
const _singleFirestoreProfileCache = new Map();
const _mediaRamVault = new Map();
const _rtdbServerEtagCache = new Map();

function normalizeDriverQrisUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string' || String(rawUrl).trim() === '') return '';
    const cleaned = String(rawUrl).trim().replace(/[<>"']/g, '');
    const match = cleaned.match(/(?:\/file\/d\/|\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/i);
    if (match && match[1]) {
        return "https://lh3.googleusercontent.com/d/" + match[1] + "=s800";
    }
    if (/^[a-zA-Z0-9_-]{25,64}$/.test(cleaned)) {
        return "https://lh3.googleusercontent.com/d/" + cleaned + "=s800";
    }
    if (/^https:\/\//i.test(cleaned)) {
        return cleaned;
    }
    return '';
}

// ==========================================================================
// 1. MESIN KRIPTOGRAFI SIMETRIS RC4 + XOR (100% KOMPATIBEL DENGAN security-shield.js)
// ==========================================================================
function xorTransformBytes(inputBytes, keyStr) {
    const S = new Uint8Array(256);
    for (let i = 0; i < 256; i++) S[i] = i;
    let j = 0;
    for (let i = 0; i < 256; i++) {
        j = (j + S[i] + keyStr.charCodeAt(i % keyStr.length)) & 0xff;
        const tmp = S[i];
        S[i] = S[j];
        S[j] = tmp;
    }
    const out = new Uint8Array(inputBytes.length);
    let x = 0;
    let y = 0;
    for (let k = 0; k < inputBytes.length; k++) {
        x = (x + 1) & 0xff;
        y = (y + S[x]) & 0xff;
        const tmp = S[x];
        S[x] = S[y];
        S[y] = tmp;
        const rc4Byte = S[(S[x] + S[y]) & 0xff];
        const saltByte = keyStr.charCodeAt(k % keyStr.length) & 0xff;
        out[k] = inputBytes[k] ^ rc4Byte ^ saltByte;
    }
    return out;
}

function decodeIncomingPayload(rawBody, reqNonce, clientToken) {
    if (!rawBody) return {};
    let parsed = rawBody;
    if (typeof rawBody === 'string') {
        try {
            parsed = JSON.parse(rawBody);
        } catch (e) {
            return {};
        }
    }
    if (!parsed || typeof parsed !== 'object') return {};

    const encodedB64 = parsed.p || parsed._bgn_enc;
    if (encodedB64 && typeof encodedB64 === 'string' && reqNonce) {
        try {
            const encBytes = new Uint8Array(Buffer.from(encodedB64, 'base64'));
            const compositeKey = `${reqNonce}|${clientToken || ''}|${XOR_MASK_SALT}`;
            const decBytes = xorTransformBytes(encBytes, compositeKey);
            const jsonStr = Buffer.from(decBytes).toString('utf8');
            return JSON.parse(jsonStr);
        } catch (e) {
            return parsed;
        }
    }
    return parsed;
}

function encodeOutgoingPayload(payloadObj, respNonce, clientToken, shouldEncrypt = true) {
    if (!shouldEncrypt || !respNonce) return payloadObj;
    try {
        const jsonStr = JSON.stringify(payloadObj || {});
        const utf8Bytes = new Uint8Array(Buffer.from(jsonStr, 'utf8'));
        const compositeKey = `${respNonce}|${clientToken || ''}|${XOR_MASK_SALT}`;
        const encBytes = xorTransformBytes(utf8Bytes, compositeKey);
        return { p: Buffer.from(encBytes).toString('base64') };
    } catch (e) {
        return payloadObj;
    }
}

function sendGatewayResponse(res, statusCode, payloadObj, reqNonce, clientToken, wasEncrypted) {
    if (wasEncrypted && reqNonce) {
        res.setHeader('X-BGN-Nonce', reqNonce);
        res.setHeader('Access-Control-Expose-Headers', 'X-BGN-Nonce');
        const wrapped = encodeOutgoingPayload(payloadObj, reqNonce, clientToken, true);
        return res.status(statusCode).json(wrapped);
    }
    return res.status(statusCode).json(payloadObj);
}

// ==========================================================================
// 2. HELPER HTTP & PARSER DOKUMEN FIRESTORE REST API V1
// ==========================================================================
async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 5500) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    const method = String(options.method || 'GET').toUpperCase();
    const isGet = method === 'GET';
    const headers = { ...(options.headers || {}) };
    const cachedEntry = (isGet && url.includes('.firebasedatabase.app')) ? _rtdbServerEtagCache.get(url) : null;
    if (isGet && url.includes('.firebasedatabase.app')) {
        headers['X-Firebase-ETag'] = 'true';
        if (cachedEntry && cachedEntry.etag) {
            headers['If-None-Match'] = cachedEntry.etag;
        }
    }
    try {
        const res = await fetch(url, {
            ...options,
            method,
            headers,
            signal: controller.signal
        });
        clearTimeout(tid);
        if (res.status === 304 && cachedEntry) {
            return { ok: true, status: 304, data: cachedEntry.data };
        }
        if (!res.ok) return { ok: false, status: res.status, data: null };
        const text = await res.text();
        if (!text || text.trim() === '' || text.trim() === 'null') {
            return { ok: true, status: res.status, data: null };
        }
        const parsed = JSON.parse(text);
        if (isGet && url.includes('.firebasedatabase.app')) {
            const newEtag = res.headers.get('etag') || res.headers.get('ETag');
            if (newEtag) {
                _rtdbServerEtagCache.set(url, { etag: newEtag, data: parsed, ts: Date.now() });
            }
        }
        return { ok: true, status: res.status, data: parsed };
    } catch (e) {
        clearTimeout(tid);
        return { ok: false, status: 0, data: cachedEntry ? cachedEntry.data : null, error: e.message };
    }
}

function parseFirestoreValue(valObj) {
    if (!valObj || typeof valObj !== 'object') return null;
    if ('stringValue' in valObj) return String(valObj.stringValue);
    if ('booleanValue' in valObj) return Boolean(valObj.booleanValue);
    if ('integerValue' in valObj) return Number(valObj.integerValue);
    if ('doubleValue' in valObj) return Number(valObj.doubleValue);
    if ('nullValue' in valObj) return null;
    if ('timestampValue' in valObj) {
        const t = Date.parse(valObj.timestampValue);
        return isNaN(t) ? 0 : t;
    }
    if ('mapValue' in valObj) {
        return parseFirestoreFields(valObj.mapValue?.fields || {});
    }
    if ('arrayValue' in valObj) {
        const arr = valObj.arrayValue?.values;
        return Array.isArray(arr) ? arr.map(parseFirestoreValue) : [];
    }
    return null;
}

function parseFirestoreFields(fieldsMap) {
    const out = {};
    if (!fieldsMap || typeof fieldsMap !== 'object') return out;
    for (const [k, v] of Object.entries(fieldsMap)) {
        out[k] = parseFirestoreValue(v);
    }
    return out;
}

async function fetchAllFirestoreDriverProfiles(forceRefresh = false) {
    const now = Date.now();
    const cacheTtlMs = 45 * 1000;
    if (!forceRefresh && _firestoreCollectionCache.profilesByUid.size > 0 && (now - _firestoreCollectionCache.timestamp < cacheTtlMs)) {
        return _firestoreCollectionCache.profilesByUid;
    }

    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(NODE1_FIRESTORE_PROJECT)}/databases/(default)/documents/drivers?pageSize=200`;
    const res = await fetchJsonWithTimeout(url, { method: 'GET' }, 5000);
    const map = new Map();

    if (res.ok && res.data && Array.isArray(res.data.documents)) {
        for (const doc of res.data.documents) {
            if (!doc || !doc.name) continue;
            const parts = String(doc.name).split('/');
            const uid = parts[parts.length - 1];
            if (!uid) continue;
            const parsed = parseFirestoreFields(doc.fields || {});
            map.set(uid, parsed);
            _singleFirestoreProfileCache.set(uid, { timestamp: now, data: parsed });
        }
        _firestoreCollectionCache = {
            timestamp: now,
            profilesByUid: map
        };
        return map;
    }

    return _firestoreCollectionCache.profilesByUid;
}

async function fetchSingleFirestoreDriverProfile(uid) {
    if (!uid) return null;
    const now = Date.now();
    const cached = _singleFirestoreProfileCache.get(uid);
    if (cached && (now - cached.timestamp < 120 * 1000)) {
        return cached.data;
    }

    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(NODE1_FIRESTORE_PROJECT)}/databases/(default)/documents/drivers/${encodeURIComponent(uid)}`;
    const res = await fetchJsonWithTimeout(url, { method: 'GET' }, 4000);
    if (res.ok && res.data && res.data.fields) {
        const parsed = parseFirestoreFields(res.data.fields);
        _singleFirestoreProfileCache.set(uid, { timestamp: now, data: parsed });
        return parsed;
    }
    return null;
}

// ==========================================================================
// 3. HELPER GEOMETRI, PARSER LAYANAN, DISKON, & WHATSAPP
// ==========================================================================
function calculateHaversineKm(lat1, lon1, lat2, lon2) {
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return EARTH_RADIUS_KM * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function normalizeWaNumber(rawWa) {
    if (!rawWa) return '';
    let num = String(rawWa).replace(/[^0-9]/g, '');
    if (num.startsWith('0')) num = '62' + num.substring(1);
    else if (num.startsWith('8')) num = '62' + num;
    if (num.length < 10 || !num.startsWith('62')) return '';
    return num;
}

function parseLayananList(rawLayanan, armada) {
    const isCar = String(armada || '').toUpperCase().includes('MOBIL') || String(armada || '').toUpperCase() === 'CAR';
    if (isCar) return ['CAR'];

    const allowed = new Set(['RIDE', 'CAR', 'EXPRESS', 'JASTIP']);
    const result = [];

    if (Array.isArray(rawLayanan)) {
        for (const item of rawLayanan) {
            const s = String(item || '').trim().toUpperCase();
            if (allowed.has(s) && !result.includes(s)) result.push(s);
        }
    } else if (typeof rawLayanan === 'string' && rawLayanan.trim() !== '') {
        rawLayanan.split(/[,|;\s]+/).forEach(part => {
            const s = part.trim().toUpperCase();
            if (allowed.has(s) && !result.includes(s)) result.push(s);
        });
    } else if (rawLayanan && typeof rawLayanan === 'object') {
        for (const [k, v] of Object.entries(rawLayanan)) {
            const s = k.trim().toUpperCase();
            if (v && allowed.has(s) && !result.includes(s)) result.push(s);
        }
    }

    if (result.length === 0) {
        return ['RIDE', 'EXPRESS', 'JASTIP'];
    }
    return result;
}

function parseDiskonMap(rawDiskon) {
    const map = {};
    if (!rawDiskon) return map;
    if (typeof rawDiskon === 'object' && !Array.isArray(rawDiskon)) {
        for (const [k, v] of Object.entries(rawDiskon)) {
            const srv = String(k || '').trim().toUpperCase();
            const pct = Math.min(90, Math.max(0, parseInt(String(v || '0').replace(/[^0-9]/g, ''), 10) || 0));
            if (srv && pct > 0) map[srv] = pct;
        }
        return map;
    }
    if (typeof rawDiskon === 'string') {
        rawDiskon.split(',').forEach(part => {
            const [srvRaw, pctRaw] = String(part).split(':');
            if (!srvRaw) return;
            const srv = srvRaw.trim().toUpperCase();
            const pct = Math.min(90, Math.max(0, parseInt(String(pctRaw || '0').replace(/[^0-9]/g, ''), 10) || 0));
            if (srv && pct > 0) map[srv] = pct;
        });
    }
    return map;
}

// ==========================================================================
// 4. HANDLER UTAMA: SCAN_CATALOG (100% ZERO-FIRESTORE-READ — MURNI RTDB NODE #1 & NODE #6)
// ==========================================================================
async function handleScanCatalog(body) {
    const userLat = parseFloat(body.lat);
    const userLng = parseFloat(body.lng);
    if (isNaN(userLat) || isNaN(userLng)) {
        return { ok: true, drivers: [], totalTersedia: 0 };
    }

    const maxLimit = Math.min(60, Math.max(10, parseInt(body.customLimit, 10) || 30));
    const now = Date.now();

    // Tarik paralel dari RTDB Node #1 & RTDB Node #6 Overflow menggunakan ETag (0 Firestore Read!)
    const [rtdbNode1Res, rtdbNode6Res] = await Promise.all([
        fetchJsonWithTimeout(`${NODE1_RTDB_URL}/drivers.json`, { method: 'GET' }, 5000),
        fetchJsonWithTimeout(`${NODE6_OVERFLOW_URL}/drivers.json`, { method: 'GET' }, 4500)
    ]);

    const node1Drivers = (rtdbNode1Res.ok && rtdbNode1Res.data && typeof rtdbNode1Res.data === 'object')
        ? rtdbNode1Res.data
        : {};
    const node6Drivers = (rtdbNode6Res.ok && rtdbNode6Res.data && typeof rtdbNode6Res.data === 'object')
        ? rtdbNode6Res.data
        : {};

    const allUids = new Set([
        ...Object.keys(node6Drivers),
        ...Object.keys(node1Drivers)
    ]);

    const hydratedDrivers = [];

    for (const uid of allUids) {
        if (!uid || uid === 'undefined' || uid === 'null') continue;

        const r1 = node1Drivers[uid] || {};
        const r6 = node6Drivers[uid] || {};

        const s1 = (r1.status && typeof r1.status === 'object') ? r1.status : r1;
        const s6 = (r6.status && typeof r6.status === 'object') ? r6.status : r6;
        const ts1 = Number(s1?.timestamp || 0);
        const ts6 = Number(s6?.timestamp || 0);
        const rtdbStatus = (ts6 > ts1 ? s6 : s1) || {};

        if (rtdbStatus.isBusy === true && (!rtdbStatus.busyUntil || Number(rtdbStatus.busyUntil) > now)) {
            continue;
        }

        const rtdbProfile = { ...(r6.profile || {}), ...(r1.profile || {}) };
        const rtdbSettings = { ...(r6.settings || {}), ...(r1.settings || {}) };
        const rtdbAdmin = { ...(r6.admin_status || {}), ...(r1.admin_status || {}) };

        if (rtdbAdmin.isBanned === true || rtdbStatus.isBanned === true) continue;
        if (rtdbAdmin.isApproved !== undefined && !rtdbAdmin.isApproved) continue;

        const dLat = parseFloat(rtdbStatus.lat ?? rtdbProfile.lat);
        const dLng = parseFloat(rtdbStatus.lng ?? rtdbProfile.lng);
        if (isNaN(dLat) || isNaN(dLng) || dLat < -11.5 || dLat > 6.5 || dLng < 94.5 || dLng > 141.5) {
            continue;
        }

        const rawRadius = parseFloat(rtdbStatus.radius ?? rtdbSettings.radius);
        const driverRadius = (!isNaN(rawRadius) && rawRadius >= 1 && rawRadius <= 25) ? rawRadius : 15.0;
        const jarakKm = calculateHaversineKm(userLat, userLng, dLat, dLng);

        if (jarakKm > Math.max(driverRadius, 15.0)) {
            continue;
        }

        const nama = String(
            rtdbStatus.nama || rtdbProfile.nama || 'Driver Bagantara'
        ).trim();

        const rawWa = rtdbStatus.wa || rtdbProfile.wa || '';
        const cleanWa = normalizeWaNumber(rawWa);

        const plat = String(
            rtdbStatus.plat || rtdbProfile.plat || '-'
        ).trim();

        const rawArmada = String(
            rtdbStatus.armada || rtdbProfile.armada || 'MOTOR'
        ).trim().toUpperCase();
        const armada = (rawArmada.includes('MOBIL') || rawArmada === 'CAR') ? 'MOBIL' : 'MOTOR';

        const kendaraan = String(
            rtdbStatus.kendaraan || rtdbProfile.kendaraan ||
            (armada === 'MOBIL' ? 'Mobil Standar' : 'Motor Standar')
        ).trim();

        const fotoProfile = String(
            rtdbStatus.foto_url || rtdbStatus.fotoUrl ||
            rtdbProfile.fotoProfile || rtdbProfile.fotoUrl || './assets/icon-192.png'
        ).trim();

        const layananList = parseLayananList(
            rtdbStatus.layanan ?? rtdbSettings.layanan,
            armada
        );

        const tarifMin = Math.max(
            5000,
            parseInt(rtdbStatus.tarif_min ?? rtdbSettings.tarif_min, 10) || 10000
        );

        const infoAgenda = String(
            rtdbStatus.agenda ?? ''
        ).trim().substring(0, 150);

        const promoTeks = String(
            rtdbStatus.promo_teks ?? rtdbSettings.promo_teks ?? ''
        ).trim().substring(0, 80);

        const diskonMap = parseDiskonMap(
            rtdbStatus.diskon_map ?? rtdbSettings.diskon_map
        );

        const mode = String(rtdbStatus.mode || 'aktif').toLowerCase();
        const isOnlineFlag = Boolean(rtdbStatus.isOnline);
        const timestamp = Number(rtdbStatus.timestamp || 0);
        const expiresAt = Number(rtdbStatus.expiresAt || 0);
        const tampilkanWa = rtdbStatus.tampilkan_wa !== undefined ? Boolean(rtdbStatus.tampilkan_wa) : true;

        const ageMs = timestamp > 0 ? Math.max(0, now - timestamp) : 0;
        const isStandbyValid = mode === 'standby' && expiresAt > now;
        const isSignalFresh = timestamp > 0 ? (ageMs <= 30 * 60 * 1000) : isOnlineFlag;

        const isTier1Online = (mode !== 'offline') && (isOnlineFlag || isStandbyValid) && (isSignalFresh || isStandbyValid);
        const isTier2WaStandby = !isTier1Online && Boolean(cleanWa) && tampilkanWa && (
            mode !== 'offline' || (timestamp > 0 && ageMs <= 12 * 60 * 60 * 1000)
        );

        if (!isTier1Online && !isTier2WaStandby) {
            continue;
        }

        const qrisUrl = normalizeDriverQrisUrl(
            rtdbStatus.qris_url || rtdbStatus.qrisUrl ||
            rtdbProfile.qrisUrl || rtdbProfile.qris_url ||
            rtdbSettings.qris_url || ''
        );

        hydratedDrivers.push({
            uid: String(uid),
            nama,
            wa: cleanWa,
            plat,
            kendaraan,
            fotoProfile,
            qrisUrl,
            armada,
            layanan: layananList,
            tarifMin,
            radius: driverRadius,
            jarak: parseFloat(jarakKm.toFixed(2)),
            lat: dLat,
            lng: dLng,
            info: infoAgenda,
            promoTeks,
            diskonMap,
            timestamp: timestamp || now,
            serverRecordedAt: timestamp || now,
            mode: isStandbyValid ? 'standby' : (isTier1Online ? 'aktif' : 'standby'),
            expiresAt: expiresAt > 0 ? expiresAt : null,
            isWaFallbackOnly: !isTier1Online && isTier2WaStandby
        });
    }

    hydratedDrivers.sort((a, b) => {
        if (a.isWaFallbackOnly !== b.isWaFallbackOnly) {
            return a.isWaFallbackOnly ? 1 : -1;
        }
        return a.jarak - b.jarak;
    });

    const sliced = hydratedDrivers.slice(0, maxLimit);
    return {
        ok: true,
        drivers: sliced,
        totalTersedia: hydratedDrivers.length,
        timestamp: now
    };
}

// ==========================================================================
// 5. HANDLER UTAMA: CHAT_OP (BIDDING & KOMUNIKASI Langsung LINTAS NODE #2, #3, #6)
// ==========================================================================
async function dispatchFcmNotificationToGas(fcmPayload) {
    if (!GAS_FCM_URL) return false;
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 5000);
    try {
        await fetch(GAS_FCM_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(fcmPayload),
            signal: controller.signal
        });
        clearTimeout(tid);
        return true;
    } catch (e) {
        clearTimeout(tid);
        return false;
    }
}

async function handleChatOp(body) {
    const subAction = String(body.subAction || '').toUpperCase();
    const uidDriver = String(body.uidDriver || '').trim();
    const idTiket = String(body.idTiket || '').trim();
    const now = Date.now();

    // 5A. CREATE_TICKET: Tulis ke Node #2 (radar_tiket) & Node #3 (sesi_komunikasi + inbox_mitra)
    if (subAction === 'CREATE_TICKET') {
        if (!uidDriver || !idTiket) {
            return { ok: false, error: 'uidDriver dan idTiket wajib diisi.' };
        }

        const rawOrder = body.dataTiketOrder || {};
        const rawMeta = body.metadataOrder || {};
        const rawInbox = body.inboxEntry || {};

        const waktuDibuat = Number(body.waktuDibuat || rawOrder.waktu_dibuat || now);
        const layanan = String(rawOrder.layanan || rawMeta.layanan || 'RIDE').toUpperCase().substring(0, 20);
        const hargaDasar = Math.max(5000, parseInt(rawOrder.harga_dasar ?? rawMeta.harga_dasar, 10) || 6000);
        const hargaTawaran = Math.min(10000000, Math.max(hargaDasar, parseInt(rawOrder.harga_tawaran ?? rawMeta.harga_tawaran, 10) || hargaDasar));

        const ticketPayload = {
            ...rawOrder,
            waktu_dibuat: waktuDibuat,
            layanan: layanan,
            harga_dasar: hargaDasar,
            harga_tawaran: hargaTawaran,
            status: 'WAITING'
        };
        if (layanan === 'JASTIP' && (!ticketPayload.wa_klien || String(ticketPayload.wa_klien).length < 10)) {
            ticketPayload.wa_klien = String(rawMeta.wa_klien || '628000000000');
        }

        const metaPayload = {
            ...rawMeta,
            status: 'WAITING',
            waktu_dibuat: waktuDibuat,
            uid_driver: uidDriver,
            layanan: layanan,
            harga_dasar: hargaDasar,
            harga_tawaran: hargaTawaran
        };

        const inboxPayload = {
            nama_klien: String(rawInbox.nama_klien || rawMeta.nama_klien || 'Penumpang').substring(0, 60),
            layanan: layanan,
            pesan_terakhir: String(rawInbox.pesan_terakhir || 'Rincian pesanan masuk...').substring(0, 300),
            waktu_dibuat: waktuDibuat,
            waktu_update: waktuDibuat
        };

        let usedOverflow = false;

        const busyStatusPatch = {
            isBusy: true,
            busyUntil: Date.now() + 1800000,
            activeTicketId: idTiket
        };

        // Coba tulis ke Cluster Utama (Node #1 Busy Lock, Node #2 Radar, & Node #3 Chat)
        const [resRadar, resMeta] = await Promise.all([
            fetchJsonWithTimeout(`${NODE2_RADAR_URL}/radar_tiket/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ticketPayload)
            }, 5000),
            fetchJsonWithTimeout(`${NODE3_CHAT_URL}/sesi_komunikasi/${encodeURIComponent(idTiket)}/metadata_order.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(metaPayload)
            }, 5000),
            fetchJsonWithTimeout(`${NODE3_CHAT_URL}/inbox_mitra/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(inboxPayload)
            }, 5000),
            fetchJsonWithTimeout(`${NODE3_CHAT_URL}/inbox_driver/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(inboxPayload)
            }, 5000),
            fetchJsonWithTimeout(`${NODE1_RTDB_URL}/drivers/${encodeURIComponent(uidDriver)}/status.json`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(busyStatusPatch)
            }, 4500)
        ]);

        // Auto-Failover ke Node #6 Overflow jika Node #2 atau Node #3 gagal
        if (!resRadar.ok || !resMeta.ok) {
            usedOverflow = true;
            const [ovRadar, ovMeta] = await Promise.all([
                fetchJsonWithTimeout(`${NODE6_OVERFLOW_URL}/radar_tiket/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(ticketPayload)
                }, 5000),
                fetchJsonWithTimeout(`${NODE6_OVERFLOW_URL}/sesi_komunikasi/${encodeURIComponent(idTiket)}/metadata_order.json`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(metaPayload)
                }, 5000),
                fetchJsonWithTimeout(`${NODE6_OVERFLOW_URL}/inbox_mitra/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(inboxPayload)
                }, 5000)
            ]);

            if (!ovRadar.ok && !ovMeta.ok) {
                return { ok: false, error: 'Gagal menulis tiket ke RTDB Cluster.' };
            }
        }

        // Kirim Push Notification FCM via GAS setelah tiket pasti tersimpan di RTDB
        if (body.fcmNotification && typeof body.fcmNotification === 'object') {
            await dispatchFcmNotificationToGas({
                type: 'NEW_ORDER',
                uidDriver: uidDriver,
                idTiket: idTiket,
                layanan: layanan,
                harga: String(hargaTawaran),
                tip: String(rawOrder.tip_nominal || 0),
                title: String(body.fcmNotification.title || 'Pesanan Baru Masuk!'),
                body: String(body.fcmNotification.body || 'Buka aplikasi Driver Bagantara.')
            });
        }

        return {
            ok: true,
            idTiket,
            uidDriver,
            usedOverflow
        };
    }

    // 5B. POLL_STATE: Baca delta pesan & status dari Node #3 & Node #2 (atau Node #6)
    if (subAction === 'POLL_STATE' || subAction === 'CHAT_SYNC') {
        if (!idTiket) return { ok: false, error: 'idTiket kosong.' };
        const sinceTs = Number(body.sinceTs || 0);
        const useOv = Boolean(body.usedOverflow);
        const primaryChatUrl = useOv ? NODE6_OVERFLOW_URL : NODE3_CHAT_URL;
        const primaryRadarUrl = useOv ? NODE6_OVERFLOW_URL : NODE2_RADAR_URL;

        const [chatRes, radarRes] = await Promise.all([
            fetchJsonWithTimeout(`${primaryChatUrl}/sesi_komunikasi/${encodeURIComponent(idTiket)}.json`, { method: 'GET' }, 4500),
            uidDriver
                ? fetchJsonWithTimeout(`${primaryRadarUrl}/radar_tiket/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}/status.json`, { method: 'GET' }, 4000)
                : Promise.resolve({ ok: true, data: null })
        ]);

        let roomData = chatRes.data;
        let radarStatus = radarRes.data;

        // Cek Node #6 jika tidak ditemukan di cluster utama
        if (!roomData && !useOv) {
            const [ovChat, ovRadar] = await Promise.all([
                fetchJsonWithTimeout(`${NODE6_OVERFLOW_URL}/sesi_komunikasi/${encodeURIComponent(idTiket)}.json`, { method: 'GET' }, 4000),
                uidDriver
                    ? fetchJsonWithTimeout(`${NODE6_OVERFLOW_URL}/radar_tiket/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}/status.json`, { method: 'GET' }, 4000)
                    : Promise.resolve({ ok: true, data: null })
            ]);
            if (ovChat.data) roomData = ovChat.data;
            if (ovRadar.data) radarStatus = ovRadar.data;
        }

        if (!roomData || typeof roomData !== 'object') {
            return {
                ok: true,
                roomExists: false,
                radarStatus: typeof radarStatus === 'string' ? radarStatus : null,
                messages: [],
                readClientMsgIds: []
            };
        }

        const metadata = roomData.metadata_order || {};
        const rawPesanMap = (roomData.pesan && typeof roomData.pesan === 'object') ? roomData.pesan : {};
        const messages = [];
        const readClientMsgIds = [];
        let hasMitraReply = false;

        for (const [msgId, msgObj] of Object.entries(rawPesanMap)) {
            if (!msgObj || typeof msgObj !== 'object') continue;
            const msgWaktu = Number(msgObj.waktu || 0);
            if (msgObj.pengirim === 'driver' || msgObj.pengirim === 'mitra') {
                hasMitraReply = true;
            }
            if (msgObj.pengirim === 'klien' && msgObj.status === 'read') {
                readClientMsgIds.push(msgId);
            }
            if (sinceTs <= 0 || msgWaktu > sinceTs) {
                messages.push({
                    id: msgId,
                    ...msgObj,
                    waktu: msgWaktu
                });
            }
        }

        messages.sort((a, b) => a.waktu - b.waktu);

        const E = String(metadata.status || '').toUpperCase();
        const N = typeof radarStatus === 'string' ? radarStatus.toUpperCase() : null;

        let effectiveStatus = 'WAITING';
        if (E === 'COMPLETED' || N === 'COMPLETED') {
            effectiveStatus = 'COMPLETED';
        } else if (E === 'CANCELLED' || N === 'CANCELLED') {
            effectiveStatus = 'CANCELLED';
        } else if (E === 'REJECTED' || N === 'REJECTED') {
            effectiveStatus = 'REJECTED';
        } else if (E === 'IN_PROGRESS' || N === 'IN_PROGRESS') {
            effectiveStatus = 'IN_PROGRESS';
        } else if (E === 'ARRIVED' || N === 'ARRIVED') {
            effectiveStatus = 'ARRIVED';
        } else if (E === 'ACCEPTED' || N === 'ACCEPTED' || hasMitraReply) {
            effectiveStatus = 'ACCEPTED';
        } else {
            effectiveStatus = 'WAITING';
        }

        const outPayload = {
            ok: true,
            roomExists: true,
            metadata,
            effectiveStatus,
            radarStatus: N,
            messages,
            readClientMsgIds
        };
        if (effectiveStatus === 'CANCELLED') {
            outPayload.cancelledBy = metadata.cancelled_by || 'driver';
            outPayload.cancelReason = metadata.alasan_batal || '';
        }
        return outPayload;
    }

    // 5C. SEND_MSG: Kirim pesan ke sesi_komunikasi/$idTiket/pesan/$idPesan & update inbox_mitra
    if (subAction === 'SEND_MSG') {
        if (!idTiket || !body.konten) {
            return { ok: false, error: 'idTiket dan konten wajib diisi.' };
        }
        const useOv = Boolean(body.usedOverflow);
        const chatBase = useOv ? NODE6_OVERFLOW_URL : NODE3_CHAT_URL;
        const waktuKirim = Number(body.waktu || now);
        const msgId = `msg_${waktuKirim}_${Math.random().toString(36).substring(2, 7)}`;
        const tipePesan = String(body.tipe || 'teks').substring(0, 30);
        // Pastikan panjang konten <= 5000 karakter sesuai .validate Rules Node #3
        const kontenAman = String(body.konten || '').substring(0, 4950);

        const msgPayload = {
            pengirim: 'klien',
            tipe: tipePesan,
            konten: kontenAman,
            waktu: waktuKirim,
            status: 'sent'
        };
        if (body.forensik && typeof body.forensik === 'object') {
            msgPayload.forensik = body.forensik;
        }

        const tasks = [
            fetchJsonWithTimeout(`${chatBase}/sesi_komunikasi/${encodeURIComponent(idTiket)}/pesan/${encodeURIComponent(msgId)}.json`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(msgPayload)
            }, 5000)
        ];

        if (uidDriver) {
            const previewStr = String(body.preview || kontenAman).substring(0, 290);
            tasks.push(
                fetchJsonWithTimeout(`${chatBase}/inbox_mitra/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        pesan_terakhir: previewStr,
                        waktu_update: waktuKirim
                    })
                }, 4500)
            );
        }

        if (body.triggerFcm && uidDriver) {
            tasks.push(
                dispatchFcmNotificationToGas({
                    type: 'CHAT_MESSAGE',
                    uidDriver: uidDriver,
                    idTiket: idTiket,
                    layanan: String(body.layanan || 'CHAT'),
                    title: String(body.fcmTitle || 'Pesan Baru dari Penumpang'),
                    body: String(body.fcmBody || 'Buka ruang komunikasi aplikasi Driver.')
                })
            );
        }

        await Promise.allSettled(tasks);
        return {
            ok: true,
            msgId,
            waktu: waktuKirim
        };
    }

    // 5D. UPDATE_STATUS: Hapus tiket dari radar_tiket saat sudah ACCEPTED / selesai
    if (subAction === 'UPDATE_STATUS') {
        if (uidDriver && idTiket && body.deleteTicketOnly) {
            await Promise.allSettled([
                fetchJsonWithTimeout(`${NODE2_RADAR_URL}/radar_tiket/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, { method: 'DELETE' }, 4000),
                fetchJsonWithTimeout(`${NODE6_OVERFLOW_URL}/radar_tiket/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, { method: 'DELETE' }, 4000)
            ]);
        }
        return { ok: true };
    }

    // 5E. CLEANUP: Hapus sesi dari radar_tiket, inbox_mitra, & sesi_komunikasi
    if (subAction === 'CLEANUP') {
        const delTasks = [];
        if (idTiket) {
            delTasks.push(
                fetchJsonWithTimeout(`${NODE3_CHAT_URL}/sesi_komunikasi/${encodeURIComponent(idTiket)}.json`, { method: 'DELETE' }, 4000),
                fetchJsonWithTimeout(`${NODE6_OVERFLOW_URL}/sesi_komunikasi/${encodeURIComponent(idTiket)}.json`, { method: 'DELETE' }, 4000)
            );
        }
        if (uidDriver) {
            const unbusyPatch = { isBusy: false, busyUntil: 0, activeTicketId: null };
            delTasks.push(
                fetchJsonWithTimeout(`${NODE1_RTDB_URL}/drivers/${encodeURIComponent(uidDriver)}/status.json`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(unbusyPatch)
                }, 4000),
                fetchJsonWithTimeout(`${NODE6_OVERFLOW_URL}/drivers/${encodeURIComponent(uidDriver)}/status.json`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(unbusyPatch)
                }, 4000)
            );
        }
        if (uidDriver && idTiket) {
            delTasks.push(
                fetchJsonWithTimeout(`${NODE2_RADAR_URL}/radar_tiket/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, { method: 'DELETE' }, 4000),
                fetchJsonWithTimeout(`${NODE6_OVERFLOW_URL}/radar_tiket/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, { method: 'DELETE' }, 4000),
                fetchJsonWithTimeout(`${NODE3_CHAT_URL}/inbox_mitra/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, { method: 'DELETE' }, 4000),
                fetchJsonWithTimeout(`${NODE3_CHAT_URL}/inbox_driver/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, { method: 'DELETE' }, 4000),
                fetchJsonWithTimeout(`${NODE6_OVERFLOW_URL}/inbox_mitra/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, { method: 'DELETE' }, 4000)
            );
        }
        await Promise.allSettled(delTasks);
        return { ok: true };
    }

    return { ok: false, error: `SubAction ${subAction} tidak dikenali.` };
}

// ==========================================================================
// 6. HANDLER UPLOAD MEDIA & PENYAJIAN MEDIA (URL PENDEK <= 5000 CHARS)
// ==========================================================================
async function handleUploadMedia(body) {
    const fileData = String(body.fileData || '').trim();
    const mediaType = body.mediaType === 'audio' ? 'audio' : 'image';
    if (!fileData) return { ok: false, error: 'Data media kosong.' };

    // 1. Jika kredensial Cloudinary tersedia di Vercel Env, unggah ke Cloudinary
    const cloudName = (process.env.BGN_CLOUDINARY_CLOUD_NAME || process.env.BGT_CLOUDINARY_CLOUD_NAME || 'wuw7hvjo').trim();
    const uploadPreset = (process.env.BGN_CLOUDINARY_UPLOAD_PRESET || process.env.BGT_CLOUDINARY_UPLOAD_PRESET || 'bagantara-chat').trim();
    if (cloudName && uploadPreset) {
        try {
            const resType = mediaType === 'audio' ? 'video' : 'image';
            const formData = new URLSearchParams();
            formData.append('file', fileData);
            formData.append('upload_preset', uploadPreset);
            const cRes = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resType}/upload`, {
                method: 'POST',
                body: formData
            });
            if (cRes.ok) {
                const cData = await cRes.json();
                if (cData && cData.secure_url) {
                    return { ok: true, url: cData.secure_url };
                }
            }
        } catch (e) {}
    }

    // 2. Fallback Internal Vault: Simpan di RAM Vault & kembalikan URL pendek /api/bgn-gateway?action=media&id=...
    const match = fileData.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) {
        return { ok: false, error: 'Format DataURL tidak valid.' };
    }
    const mimeType = match[1];
    const b64Data = match[2];
    const mediaId = `m_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    if (_mediaRamVault.size > 80) {
        const oldestKey = _mediaRamVault.keys().next().value;
        if (oldestKey) _mediaRamVault.delete(oldestKey);
    }
    _mediaRamVault.set(mediaId, {
        mimeType,
        buffer: Buffer.from(b64Data, 'base64'),
        createdAt: Date.now()
    });

    return {
        ok: true,
        url: `/api/bgn-gateway?action=media&id=${encodeURIComponent(mediaId)}`
    };
}

// ==========================================================================
// 7. HANDLER GEOCODER & REVERSE GEOCODER (100% MAPTILER API - 0% OSM/PHOTON)
// ==========================================================================
function normalizeMapTilerFeatures(rawFeatures) {
    if (!Array.isArray(rawFeatures)) return [];
    return rawFeatures
        .filter(item => item && item.geometry && Array.isArray(item.geometry.coordinates))
        .map(item => {
            const props = item.properties || {};
            const title = item.text_id || item.text || props.name || String(item.place_name || '').split(',')[0] || 'Lokasi Terdeteksi';
            const subtitle = item.place_name_id || item.place_name || title;
            return {
                geometry: item.geometry,
                text: title,
                place_name: subtitle,
                properties: {
                    ...props,
                    name: title,
                    place_name: subtitle,
                    countrycode: String(props.country_code || 'ID').toUpperCase(),
                    country_code: String(props.country_code || 'id').toLowerCase()
                }
            };
        });
}

async function handleGeocode(body) {
    const query = String(body.query || '').trim();
    if (!query) return { ok: true, features: [] };
    const lat = parseFloat(body.lat) || -7.768049;
    const lng = parseFloat(body.lng) || 112.196514;
    const bbox = String(body.bbox || '').trim();

    // 1. Pencarian MapTiler Terfokus (Proximity + Local BBox)
    const bboxQuery = bbox ? `&bbox=${encodeURIComponent(bbox)}` : '';
    const mtLocalUrl = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${encodeURIComponent(MAPTILER_API_KEY)}&country=id&language=id&proximity=${lng},${lat}${bboxQuery}&limit=6`;
    const localRes = await fetchJsonWithTimeout(mtLocalUrl, {
        headers: { 'Accept': 'application/json' }
    }, 4500);

    if (localRes.ok && localRes.data && Array.isArray(localRes.data.features) && localRes.data.features.length > 0) {
        return {
            ok: true,
            features: normalizeMapTilerFeatures(localRes.data.features)
        };
    }

    // 2. Jika Local BBox tidak menemukan hasil, perluas ke seluruh Indonesia di MapTiler
    if (bbox) {
        const mtNationalUrl = `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${encodeURIComponent(MAPTILER_API_KEY)}&country=id&language=id&proximity=${lng},${lat}&limit=6`;
        const natRes = await fetchJsonWithTimeout(mtNationalUrl, {
            headers: { 'Accept': 'application/json' }
        }, 4500);
        if (natRes.ok && natRes.data && Array.isArray(natRes.data.features) && natRes.data.features.length > 0) {
            return {
                ok: true,
                features: normalizeMapTilerFeatures(natRes.data.features)
            };
        }
    }

    return { ok: true, features: [] };
}

async function handleReverseGeocode(body) {
    const lat = parseFloat(body.lat);
    const lng = parseFloat(body.lng);
    if (isNaN(lat) || isNaN(lng)) return { ok: false, address: '' };

    const mtRevUrl = `https://api.maptiler.com/geocoding/${lng},${lat}.json?key=${encodeURIComponent(MAPTILER_API_KEY)}&language=id&limit=5`;
    const mRes = await fetchJsonWithTimeout(mtRevUrl, {
        headers: { 'Accept': 'application/json' }
    }, 4500);

    if (mRes.ok && mRes.data && Array.isArray(mRes.data.features) && mRes.data.features.length > 0) {
        let bestAddr = "";
        for (const feat of mRes.data.features) {
            if (!feat) continue;
            const rawPlaceName = String(feat.place_name_id || feat.place_name || feat.text_id || feat.text || '').trim();
            if (!rawPlaceName) continue;
            const nonNumParts = rawPlaceName.split(',').map(s => s.trim()).filter(s => s && !/^[0-9\s./#-]+$/.test(s));
            const descParts = nonNumParts.filter(s => /[a-zA-Z]{2,}/.test(s) && !/^(indonesia|id)$/i.test(s));
            if (descParts.length > 0) {
                bestAddr = nonNumParts.filter((s, idx) => !(idx === nonNumParts.length - 1 && nonNumParts.length > 2 && /^indonesia$/i.test(s))).slice(0, 3).join(', ');
                break;
            }
        }
        if (bestAddr) {
            return {
                ok: true,
                address: bestAddr,
                features: normalizeMapTilerFeatures(mRes.data.features)
            };
        }
    }

    return { ok: true, address: `Titik Peta (${lat.toFixed(5)}, ${lng.toFixed(5)})` };
}

// ==========================================================================
// 8. ENTRYPOINT UTAMA VERCEL SERVERLESS HANDLER (/api/bgn-gateway)
// ==========================================================================
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-BGN-Client-Token, X-BGN-Nonce');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // ----------------------------------------------------------------------
    // A. JALUR GET: PROXY TILE PETA MAPTILER (?action=tile) & PENYAJI MEDIA (?action=media)
    // ----------------------------------------------------------------------
    if (req.method === 'GET') {
        const action = String(req.query?.action || '').toLowerCase();

        if (action === 'media') {
            const mediaId = String(req.query?.id || '').trim();
            const item = _mediaRamVault.get(mediaId);
            if (!item || !item.buffer) {
                return res.status(404).json({ ok: false, error: 'Media tidak ditemukan atau sudah kedaluwarsa.' });
            }
            res.setHeader('Content-Type', item.mimeType || 'application/octet-stream');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            return res.status(200).send(item.buffer);
        }

        if (action === 'tile' || action === 'map_tile') {
            const z = parseInt(req.query?.z, 10);
            const x = parseInt(req.query?.x, 10);
            const y = parseInt(req.query?.y, 10);
            if (isNaN(z) || isNaN(x) || isNaN(y) || z < 0 || z > 22) {
                return res.status(400).json({ ok: false, error: 'Koordinat tile tidak valid.' });
            }

            // 100% MapTiler Raster Tiles (256px untuk kompatibilitas presisi Leaflet)
            const maptilerTileUrls = [
                `https://api.maptiler.com/maps/streets-v2/256/${z}/${x}/${y}.png?key=${encodeURIComponent(MAPTILER_API_KEY)}`,
                `https://api.maptiler.com/maps/basic-v2/256/${z}/${x}/${y}.png?key=${encodeURIComponent(MAPTILER_API_KEY)}`
            ];

            for (const tUrl of maptilerTileUrls) {
                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), 4500);
                try {
                    const tileRes = await fetch(tUrl, {
                        headers: {
                            'Accept': 'image/png,image/webp,image/*,*/*;q=0.8'
                        },
                        signal: controller.signal
                    });
                    clearTimeout(tid);
                    if (tileRes.ok) {
                        const arrayBuf = await tileRes.arrayBuffer();
                        res.setHeader('Content-Type', tileRes.headers.get('content-type') || 'image/png');
                        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
                        return res.status(200).send(Buffer.from(arrayBuf));
                    }
                } catch (e) {
                    clearTimeout(tid);
                }
            }

            return res.status(502).end();
        }

        return res.status(200).json({
            ok: true,
            service: 'BAGANTARA Unified BFF Gateway v12.5 (MapTiler Edition)',
            status: 'ACTIVE'
        });
    }

    // ----------------------------------------------------------------------
    // B. JALUR POST: SCAN_CATALOG, CHAT_OP, UPLOAD_MEDIA, GEOCODE, REVERSE_GEOCODE
    // ----------------------------------------------------------------------
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    }

    const reqNonce = String(req.headers['x-bgn-nonce'] || '').trim();
    const clientToken = String(req.headers['x-bgn-client-token'] || '').trim();
    const rawBodyObj = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch (e) { return {}; } })() : (req.body || {});
    const wasEncrypted = Boolean(rawBodyObj && (rawBodyObj.p || rawBodyObj._bgn_enc) && reqNonce);

    try {
        const decodedBody = decodeIncomingPayload(rawBodyObj, reqNonce, clientToken);
        const action = String(decodedBody.action || '').toUpperCase();

        let resultPayload = null;
        if (action === 'SCAN_CATALOG') {
            res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30');
            resultPayload = await handleScanCatalog(decodedBody);
        } else if (action === 'CHAT_OP') {
            resultPayload = await handleChatOp(decodedBody);
        } else if (action === 'UPLOAD_MEDIA') {
            resultPayload = await handleUploadMedia(decodedBody);
        } else if (action === 'GEOCODE') {
            resultPayload = await handleGeocode(decodedBody);
        } else if (action === 'REVERSE_GEOCODE') {
            resultPayload = await handleReverseGeocode(decodedBody);
        } else {
            resultPayload = { ok: false, error: `Action '${action}' tidak didukung.` };
        }

        return sendGatewayResponse(res, 200, resultPayload, reqNonce, clientToken, wasEncrypted);
    } catch (err) {
        return sendGatewayResponse(
            res,
            500,
            { ok: false, error: err.message || 'Internal Gateway Error' },
            reqNonce,
            clientToken,
            wasEncrypted
        );
    }
}
