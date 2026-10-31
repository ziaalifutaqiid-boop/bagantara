// ==========================================================================
// FILE: api/bgn-merchant-public-gateway.js (VERCEL SERVERLESS GATEWAY - KATALOG UMKM PUBLIK)
// FUNGSI:
//   1. Enkripsi & Dekripsi Simetris RC4 + XOR (X-BGN-Nonce & X-BGN-Client-Token)
//      100% Kompatibel dengan BGNSecurityShield (security-shield.js)
//   2. SCAN_MERCHANTS_INDEX: Pemindaian Katalog Wilayah dari RTDB Node #7
//      (/merchants_index/{zoneId}.json) dengan SWR RAM Cache 20 Detik (0 WebSocket!)
//   3. GET_MERCHANT_MENU: Pembacaan 1 Dokumen Tunggal Firestore Node #7
//      (/merchants/{uidMerchant}) hanya ketika versi `v` di pelanggan lebih lama
//      dari versi `v` di RTDB (Delta-Version Caching = 0 Firestore Read Harian)
// ==========================================================================

const XOR_MASK_SALT = 'BGN12_GW_XOR_MASK_7731';
const EARTH_RADIUS_KM = 6371;

const NODE7_RTDB_URL = (
    process.env.BGT_NODE7_RTDB_URL ||
    process.env.BGT_MERCHANT_RTDB_URL ||
    'https://merchant-store-bgt-default-rtdb.asia-southeast1.firebasedatabase.app'
).trim().replace(/\/+$/, '');

const NODE7_FIRESTORE_PROJECT = (
    process.env.BGT_NODE7_PROJECT_ID ||
    process.env.BGT_MERCHANT_PROJECT_ID ||
    'merchant-store-bgt'
).trim();

// Cache Memori Server (SWR) untuk Menghemat Kuota Read RTDB & Firestore pada Ribuan Pelanggan
const _zoneIndexCache = new Map(); // zoneId -> { timestamp, merchants: [] }
const _merchantDocCache = new Map(); // uid -> { timestamp, v, data }

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
    if (!rawBody) return { payload: {}, wasEncrypted: false };
    let parsed = rawBody;
    if (typeof rawBody === 'string') {
        try {
            parsed = JSON.parse(rawBody);
        } catch (e) {
            return { payload: {}, wasEncrypted: false };
        }
    }
    if (!parsed || typeof parsed !== 'object') return { payload: {}, wasEncrypted: false };

    const encodedB64 = parsed.p || parsed._bgn_enc;
    if (encodedB64 && typeof encodedB64 === 'string' && reqNonce) {
        try {
            const encBytes = new Uint8Array(Buffer.from(encodedB64, 'base64'));
            const compositeKey = `${reqNonce}|${clientToken || ''}|${XOR_MASK_SALT}`;
            const decBytes = xorTransformBytes(encBytes, compositeKey);
            const jsonStr = Buffer.from(decBytes).toString('utf8');
            return { payload: JSON.parse(jsonStr), wasEncrypted: true };
        } catch (e) {
            return { payload: parsed, wasEncrypted: false };
        }
    }
    return { payload: parsed, wasEncrypted: false };
}

function sendGatewayResponse(res, statusCode, payloadObj, reqNonce, clientToken, wasEncrypted) {
    if (wasEncrypted && reqNonce) {
        res.setHeader('X-BGN-Nonce', reqNonce);
        res.setHeader('Access-Control-Expose-Headers', 'X-BGN-Nonce');
        try {
            const jsonStr = JSON.stringify(payloadObj || {});
            const utf8Bytes = new Uint8Array(Buffer.from(jsonStr, 'utf8'));
            const compositeKey = `${reqNonce}|${clientToken || ''}|${XOR_MASK_SALT}`;
            const encBytes = xorTransformBytes(utf8Bytes, compositeKey);
            return res.status(statusCode).json({ p: Buffer.from(encBytes).toString('base64') });
        } catch (e) {
            return res.status(statusCode).json(payloadObj);
        }
    }
    return res.status(statusCode).json(payloadObj);
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 5500) {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(tid);
        if (!res.ok) return { ok: false, status: res.status, data: null };
        const text = await res.text();
        if (!text || text.trim() === '' || text.trim() === 'null') {
            return { ok: true, status: res.status, data: null };
        }
        return { ok: true, status: res.status, data: JSON.parse(text) };
    } catch (e) {
        clearTimeout(tid);
        return { ok: false, status: 0, data: null, error: e.message };
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

function calculateHaversineKm(lat1, lon1, lat2, lon2) {
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return EARTH_RADIUS_KM * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const reqNonce = String(req.headers?.['x-bgn-nonce'] || req.headers?.['X-BGN-Nonce'] || '').trim();
    const clientToken = String(req.headers?.['x-bgn-client-token'] || req.headers?.['X-BGN-Client-Token'] || '').trim();
    const { payload: bodyObj, wasEncrypted } = decodeIncomingPayload(req.body, reqNonce, clientToken);

    try {
        const action = String(bodyObj.action || req.query?.action || 'SCAN_MERCHANTS_INDEX').trim().toUpperCase();
        const zoneId = String(bodyObj.zoneId || req.query?.zoneId || 'KDR-PARE-01').trim().replace(/[^a-zA-Z0-9_-]/g, '');

        // ======================================================================
        // 1. ACTION: SCAN_MERCHANTS_INDEX (Pemindaian Katalog Wilayah ~150B/Warung)
        // ======================================================================
        if (action === 'SCAN_MERCHANTS_INDEX') {
            const forceRefresh = Boolean(bodyObj.forceRefresh || req.query?.force === '1');
            const userLat = parseFloat(bodyObj.lat ?? req.query?.lat);
            const userLng = parseFloat(bodyObj.lng ?? req.query?.lng);
            const hasUserCoord = !isNaN(userLat) && !isNaN(userLng);

            const now = Date.now();
            const cachedZone = _zoneIndexCache.get(zoneId);
            let rawIndexMap = null;

            if (!forceRefresh && cachedZone && (now - cachedZone.timestamp < 20 * 1000)) {
                rawIndexMap = cachedZone.rawMap;
            } else {
                const rtdbUrl = `${NODE7_RTDB_URL}/merchants_index/${encodeURIComponent(zoneId)}.json`;
                const rtdbRes = await fetchJsonWithTimeout(rtdbUrl, { method: 'GET' }, 5000);
                if (rtdbRes.ok) {
                    rawIndexMap = rtdbRes.data || {};
                    _zoneIndexCache.set(zoneId, { timestamp: now, rawMap: rawIndexMap });
                } else if (cachedZone) {
                    rawIndexMap = cachedZone.rawMap;
                } else {
                    rawIndexMap = {};
                }
            }

            const merchantsList = [];
            if (rawIndexMap && typeof rawIndexMap === 'object') {
                for (const [uid, meta] of Object.entries(rawIndexMap)) {
                    if (!meta || typeof meta !== 'object' || !meta.n) continue;
                    // Wajib sembunyikan toko/resto yang sedang TUTUP dari katalog publik
                    if (Boolean(meta.o) !== true) continue;
                    const mLat = parseFloat(meta.lat);
                    const mLng = parseFloat(meta.lng);
                    if (isNaN(mLat) || isNaN(mLng)) continue;

                    const distKm = hasUserCoord
                        ? Number(calculateHaversineKm(userLat, userLng, mLat, mLng).toFixed(2))
                        : null;

                    merchantsList.push({
                        uid,
                        n: String(meta.n || 'Warung UMKM'),
                        c: String(meta.c || 'KULINER').toUpperCase(),
                        lat: mLat,
                        lng: mLng,
                        gh: String(meta.gh || ''),
                        o: Boolean(meta.o),
                        h: String(meta.h || '08:00-21:00'),
                        pr: String(meta.pr || ''),
                        img: String(meta.img || ''),
                        v: Number(meta.v || 0),
                        addr: String(meta.addr || meta.n || ''),
                        dsc: Number(meta.dsc || 0),
                        distKm
                    });
                }
            }

            // Urutkan: Toko Buka (o === true) diutamakan, lalu berdasarkan jarak terdekat (Haversine)
            merchantsList.sort((a, b) => {
                if (a.o !== b.o) return a.o ? -1 : 1;
                if (a.distKm !== null && b.distKm !== null) return a.distKm - b.distKm;
                return a.n.localeCompare(b.n);
            });

            return sendGatewayResponse(res, 200, {
                ok: true,
                zoneId,
                timestamp: now,
                merchants: merchantsList
            }, reqNonce, clientToken, wasEncrypted);
        }

        // ======================================================================
        // 2. ACTION: GET_MERCHANT_MENU (1 Dokumen Tunggal Firestore /merchants/{uid})
        // ======================================================================
        if (action === 'GET_MERCHANT_MENU') {
            const uid = String(bodyObj.uid || bodyObj.uidMerchant || req.query?.uid || '').trim();
            const expectedV = Number(bodyObj.v || req.query?.v || 0);

            if (!uid) {
                return sendGatewayResponse(res, 400, {
                    ok: false,
                    error: 'Parameter uid warung wajib disertakan.'
                }, reqNonce, clientToken, wasEncrypted);
            }

            const now = Date.now();
            const cachedDoc = _merchantDocCache.get(uid);
            if (
                cachedDoc &&
                (now - cachedDoc.timestamp < 60 * 1000) &&
                (!expectedV || cachedDoc.v >= expectedV)
            ) {
                return sendGatewayResponse(res, 200, {
                    ok: true,
                    uid,
                    cachedInServer: true,
                    merchant: cachedDoc.data
                }, reqNonce, clientToken, wasEncrypted);
            }

            const fsUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(NODE7_FIRESTORE_PROJECT)}/databases/(default)/documents/merchants/${encodeURIComponent(uid)}`;
            const fsRes = await fetchJsonWithTimeout(fsUrl, { method: 'GET' }, 5000);

            if (!fsRes.ok || !fsRes.data || !fsRes.data.fields) {
                return sendGatewayResponse(res, 404, {
                    ok: false,
                    error: 'Katalog menu warung tidak ditemukan atau belum dipublikasikan.'
                }, reqNonce, clientToken, wasEncrypted);
            }

            const parsedDoc = parseFirestoreFields(fsRes.data.fields);
            if (parsedDoc.admin_status && parsedDoc.admin_status.isBanned === true) {
                return sendGatewayResponse(res, 403, {
                    ok: false,
                    error: 'Toko ini sedang tidak aktif.'
                }, reqNonce, clientToken, wasEncrypted);
            }
            if (parsedDoc.profile && parsedDoc.profile.isOpen === false) {
                return sendGatewayResponse(res, 403, {
                    ok: false,
                    error: 'Toko ini sedang tutup.'
                }, reqNonce, clientToken, wasEncrypted);
            }

            const cleanMerchantData = {
                uid,
                v: Number(parsedDoc.v || expectedV || now),
                profile: parsedDoc.profile || {},
                items: Array.isArray(parsedDoc.items) ? parsedDoc.items : []
            };

            _merchantDocCache.set(uid, {
                timestamp: now,
                v: cleanMerchantData.v,
                data: cleanMerchantData
            });

            return sendGatewayResponse(res, 200, {
                ok: true,
                uid,
                cachedInServer: false,
                merchant: cleanMerchantData
            }, reqNonce, clientToken, wasEncrypted);
        }

        return sendGatewayResponse(res, 400, {
            ok: false,
            error: `Action '${action}' tidak dikenali.`
        }, reqNonce, clientToken, wasEncrypted);
    } catch (err) {
        return sendGatewayResponse(res, 500, {
            ok: false,
            error: err?.message || 'Internal Server Error pada bgn-merchant-public-gateway'
        }, reqNonce, clientToken, wasEncrypted);
    }
}
