// ==========================================================================
// FILE: api/create-order.js (VERCEL SERVERLESS FUNCTION - BAGANTARA PUBLIK V12.0)
// FUNGSI: 1. Gerbang Keamanan Server-Side untuk Validasi WA Jastip, Verifikasi Signature Tarif, & Audit Node #5
//         2. Pengiriman Push Notification FCM Server-to-Server ke Google Apps Script
//            (process.env.BGN_GAS_FCM_URL) sehingga URL GAS 100% tersembunyi dari Browser
//         3. Rate Limiting berbasis IP (x-forwarded-for) dan deviceId
//         4. Kompatibilitas Monotonik total_orders terhadap Rules Node #5 (futaqi-ali)
// ==========================================================================

import crypto from 'crypto';

const HMAC_SECRET = process.env.BGN_HMAC_SECRET || 'BGN_SERVER_DEFAULT_HMAC_VAULT_KEY_V12';

// URL Default Server-Side (Zero-Client-Leak)
const DEFAULT_SERVER_GAS_FCM_URL = 'https://script.google.com/macros/s/AKfycbxkSFTmerLbUa5iEWEqyjUz9OVBo8xTznm90HJMKDRBQ9t-x8UxjUHas_K1JqqMgHzneg/exec';
const DEFAULT_SECURITY_DB_URL = 'https://futaqi-ali-default-rtdb.asia-southeast1.firebasedatabase.app';

// In-Memory Sliding Window Rate Limiter pada instance Serverless Vercel
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 Menit
const MAX_REQUESTS_PER_WINDOW = 15;     // Maksimal 15 order/menit per IP atau DeviceId
const MIN_INTERVAL_MS = 1200;           // Cooldown minimal 1.2 detik antar submit order
const _rateTracker = new Map();
const _deviceOrderCountCache = new Map();

function cleanExpiredRateEntries(now) {
    if (_rateTracker.size < 500) return;
    for (const [key, entry] of _rateTracker.entries()) {
        if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
            _rateTracker.delete(key);
        }
    }
}

function checkRateLimit(key, now, maxReqs = MAX_REQUESTS_PER_WINDOW, minIntervalMs = MIN_INTERVAL_MS) {
    if (!key) return { allowed: true };
    cleanExpiredRateEntries(now);

    const existing = _rateTracker.get(key);
    if (!existing || (now - existing.windowStart) > RATE_LIMIT_WINDOW_MS) {
        _rateTracker.set(key, {
            windowStart: now,
            lastRequestAt: now,
            count: 1
        });
        return { allowed: true };
    }

    if (minIntervalMs > 0 && (now - existing.lastRequestAt) < minIntervalMs) {
        return {
            allowed: false,
            reason: 'Terlalu cepat mengirim permintaan pesanan. Mohon tunggu beberapa detik.'
        };
    }

    if (existing.count >= maxReqs) {
        return {
            allowed: false,
            reason: 'Batas frekuensi pemesanan tercapai. Silakan tunggu 1 menit sebelum mencoba kembali.'
        };
    }

    existing.count += 1;
    existing.lastRequestAt = now;
    _rateTracker.set(key, existing);
    return { allowed: true };
}

function verifyFareSignature(body) {
    if (!body || !body.signature) return false;
    try {
        const srv = String(body.layanan || 'RIDE').toUpperCase();
        const zoneId = String(body.zoneId || 'KDR-PARE-01').trim();
        const distNorm = Number(body.jarak_km !== undefined ? body.jarak_km : (body.distanceKm || 0)).toFixed(2);
        const stops = parseInt(body.extraStops, 10) || 0;
        const hargaDasar = parseInt(body.harga_dasar, 10) || 0;
        const hargaNormal = parseInt(body.harga_normal || body.harga_dasar, 10) || 0;
        const diskonPct = Number(body.diskon_persen || 0).toFixed(2);
        const canonical = `${srv}|${zoneId}|${distNorm}|${stops}|${hargaDasar}|${hargaNormal}|${diskonPct}`;
        const expected = crypto.createHmac('sha256', HMAC_SECRET).update(canonical).digest('hex');
        return expected === String(body.signature);
    } catch (e) {
        return false;
    }
}

async function dispatchServerFcmToGas(fcmData) {
    const gasFcmUrl = (process.env.BGN_GAS_FCM_URL || process.env.BGT_GAS_BACKEND_URL || DEFAULT_SERVER_GAS_FCM_URL).trim();
    if (!gasFcmUrl) return false;

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 5500);
    try {
        const payload = {
            fcmToken: String(fcmData.fcmToken || ''),
            idTiket: String(fcmData.idTiket || ''),
            uidDriver: String(fcmData.uidDriver || ''),
            type: String(fcmData.type || 'NEW_ORDER'),
            layanan: String(fcmData.layanan || 'RIDE'),
            harga: Number(fcmData.harga) || 0,
            tip: Number(fcmData.tip) || 0,
            title: String(fcmData.title || ''),
            body: String(fcmData.body || '')
        };

        await fetch(gasFcmUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(tid);
        return true;
    } catch (err) {
        clearTimeout(tid);
        return false;
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-BGN-Client-Token, X-BGN-Nonce');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    }

    try {
        const now = Date.now();
        const forwardedFor = req.headers['x-forwarded-for'];
        const clientIp = (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : '')
            || req.headers['x-real-ip']
            || req.socket?.remoteAddress
            || 'unknown_ip';

        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const action = String(body.action || 'CREATE_ORDER').toUpperCase();
        const rawDeviceId = String(body.deviceId || 'DEV_VERCEL').trim();
        const sanitizedDeviceId = rawDeviceId.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64) || 'DEV_VERCEL';

        // JALUR 1: PROXY SERVER-TO-SERVER PUSH NOTIFICATION FCM KE GOOGLE APPS SCRIPT
        if (action === 'PUSH_FCM') {
            const fcmRate = checkRateLimit(`FCM_IP:${clientIp}`, now, 30, 300);
            if (!fcmRate.allowed) {
                return res.status(429).json({ ok: false, error: fcmRate.reason });
            }
            const uidDriver = String(body.uidDriver || '').trim();
            if (!uidDriver) {
                return res.status(400).json({ ok: false, error: 'uidDriver diperlukan untuk PUSH_FCM' });
            }
            const sent = await dispatchServerFcmToGas(body);
            return res.status(200).json({
                ok: true,
                action: 'PUSH_FCM',
                dispatched: sent
            });
        }

        // JALUR 2: VALIDASI ORDER, VERIFIKASI SIGNATURE TARIF, & AUDIT KEAMANAN NODE #5
        const ipCheck = checkRateLimit(`IP:${clientIp}`, now);
        if (!ipCheck.allowed) {
            return res.status(429).json({ ok: false, error: ipCheck.reason });
        }

        const devCheck = checkRateLimit(`DEV:${sanitizedDeviceId}`, now);
        if (!devCheck.allowed) {
            return res.status(429).json({ ok: false, error: devCheck.reason });
        }

        const layanan = String(body.layanan || 'RIDE').toUpperCase().substring(0, 20);
        const rawWa = String(body.wa_klien || '').replace(/[^0-9]/g, '');

        // Aturan Mutlak Server: JASTIP wajib menyertakan nomor WA valid (>= 10 digit)
        if (layanan === 'JASTIP' && rawWa.length < 10) {
            return res.status(400).json({
                ok: false,
                error: 'Layanan JASTIP wajib menyertakan nomor WhatsApp aktif untuk mencegah order fiktif.'
            });
        }

        const isSignatureVerified = verifyFareSignature(body);

        // Ambil URL Firebase Security (Node #5) dari Environment Variable Vercel atau Default Fallback
        const securityDbUrl = (
            process.env.BGN_FIREBASE_SECURITY_URL ||
            process.env.BGT_NODE5_SECURITY_DB_URL ||
            process.env.BGT_NODE5_RTDB_URL ||
            DEFAULT_SECURITY_DB_URL
        ).trim().replace(/\/+$/, '');

        const rawIdTiket = String(body.idTiket || `AUD_${now}`).trim();
        const idTiket = rawIdTiket.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64) || `AUD_${now}`;
        const clientOrderCount = Math.max(1, parseInt(body.total_orders, 10) || 1);
        const prevServerCount = _deviceOrderCountCache.get(sanitizedDeviceId) || 0;
        const monotonicTotalOrders = Math.max(clientOrderCount, prevServerCount + 1);
        _deviceOrderCountCache.set(sanitizedDeviceId, monotonicTotalOrders);

        const hasVerifiedWa = Boolean(rawWa.length >= 10);

        const tasks = [];

        if (securityDbUrl) {
            tasks.push(
                fetch(`${securityDbUrl}/order_audit_log/${encodeURIComponent(idTiket)}.json`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id_tiket: idTiket,
                        device_id: sanitizedDeviceId,
                        layanan: layanan,
                        has_wa: hasVerifiedWa,
                        harga_dasar: Number(body.harga_dasar) || 0,
                        harga_tawaran: Number(body.harga_tawaran) || 0,
                        estimasi_belanja: Number(body.estimasi_belanja) || 0,
                        signature_verified: isSignatureVerified,
                        waktu_dibuat: now
                    })
                }),
                fetch(`${securityDbUrl}/device_reputation/${encodeURIComponent(sanitizedDeviceId)}.json`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        last_order_at: now,
                        total_orders: monotonicTotalOrders,
                        last_service: layanan,
                        has_verified_wa: hasVerifiedWa
                    })
                })
            );
        }

        // Jika disertakan payload FCM sekaligus saat membuat order, kirimkan otomatis
        if (body.fcmPayload && typeof body.fcmPayload === 'object' && body.fcmPayload.uidDriver) {
            tasks.push(dispatchServerFcmToGas({
                idTiket,
                ...body.fcmPayload
            }));
        }

        if (tasks.length > 0) {
            await Promise.allSettled(tasks);
        }

        return res.status(200).json({
            ok: true,
            idTiket: idTiket,
            layanan: layanan,
            signatureVerified: isSignatureVerified
        });
    } catch (err) {
        return res.status(500).json({ ok: false, error: 'Internal Server Security Error' });
    }
}
