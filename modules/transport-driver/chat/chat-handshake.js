// ==========================================================================
// FILE: chat/chat-handshake.js (APLIKASI PUBLIK / KLIEN - V13.2 PURE 3-NODE & 3-STAGE ORDER SYNC)
// FUNGSI: 1. Protokol Komunikasi Langsung via BGNSecurityShield.callGateway (CHAT_SYNC / POLL_STATE + ETag),
//         2. Sinkronisasi Real-Time 3 Tahapan Order Driver (ACCEPTED, ARRIVED + Suara/Getar, IN_PROGRESS),
//         3. Pemisahan Presisi Pemberitahuan CANCELLED (CANCELLED_BY_DRIVER), REJECTED, & COMPLETED,
//         4. Proteksi Mutlak roomExists === false (Hanya COMPLETED jika status sudah IN_PROGRESS / COMPLETED)
// ==========================================================================

import { dbChat, initFirebaseChat } from './config-chat.js';
import { uploadMediaKeServer } from './cloud-media.js';

let idTiketAktif = null;
let uidPengemudiTarget = null;
let payloadTiketAktif = null;
let statusOrderAktif = 'WAITING';
let waktuDibuatOrderAktif = 0;
let isOrderAccepted = false;
let timerPollingStatus = null;
let timerPemutusKoneksi = null;
let perakamAudio = null;
let potonganAudio = [];
let lastChatFcmTimestamp = 0;

let _deltaPollerTimer = null;
let _isDeltaPollingInFlight = false;
let _isConnectionPaused = false;
let _lastDeltaSinceTs = 0;
let _roomConfirmedExistsOnce = false;
let _consecutiveMissingCount = 0;
let _waktuMulaiDengarSesi = 0;
let _isRecoveryModeAktif = false;
let _lastArrivedAlertTicketId = null;

export function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeMediaUrl(url) {
    if (!url) return '';
    const trimmed = String(url).trim();
    if (trimmed.startsWith('/api/bgn-gateway') || /^https:\/\//i.test(trimmed)) {
        return escapeHTML(trimmed);
    }
    return '';
}

function bersihkanIstilahPesanMasuk(teks) {
    if (!teks) return '';
    return String(teks)
        .replace(/\s*melalui Radar Prioritas/gi, '')
        .replace(/\bRadar Prioritas\b/gi, 'Layanan Prioritas');
}

// 3 NODE MURNI SESUAI kumpulan_konfigurasi.json:
// Node 1: bagantara-core (Katalog & Presensi Driver Aktif)
// Node 2: futaqi-ali (Audit Log, Device Reputation, & Failover/Overflow)
// Node 3: chatting-88040 (Transaksi Order, Radar Tiket, Sesi Komunikasi & Chat Real-Time)
const _DIRECT_NODE1_CORE = 'https://bagantara-core-default-rtdb.asia-southeast1.firebasedatabase.app';
const _DIRECT_NODE2_OVERFLOW = 'https://futaqi-ali-default-rtdb.asia-southeast1.firebasedatabase.app';
const _DIRECT_NODE3_RADAR = 'https://chatting-88040-default-rtdb.asia-southeast1.firebasedatabase.app';
const _DIRECT_NODE3_CHAT = 'https://chatting-88040-default-rtdb.asia-southeast1.firebasedatabase.app';
const _GAS_MICRO_BACKEND_URL = 'https://script.google.com/macros/s/AKfycbxkSFTmerLbUa5iEWEqyjUz9OVBo8xTznm90HJMKDRBQ9t-x8UxjUHas_K1JqqMgHzneg/exec';
const _rtdbEtagCache = new Map();

function _getClusterUrl(nodeKey, fallbackUrl) {
    const c = window.BGN_CONFIG?.settings?.cluster_config || {};
    return String(c[nodeKey] || fallbackUrl).replace(/\/+$/, '');
}

function _getGasBackendUrl() {
    return window.BGN_CONFIG?.settings?.micro_backend?.gas_fcm_url || _GAS_MICRO_BACKEND_URL;
}

function _dispatchDirectGasPush(fcmPayload) {
    const gasUrl = _getGasBackendUrl();
    if (!gasUrl || !fcmPayload) return;
    fetch(gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(fcmPayload),
        cache: 'no-store'
    }).catch(() => {});
}

async function _fetchRtdbJson(url, options = {}, timeoutMs = 5000) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), timeoutMs);
    const method = String(options.method || 'GET').toUpperCase();
    const isGet = method === 'GET';
    const headers = { ...(options.headers || {}) };
    const cachedEntry = (isGet && url.includes('.firebasedatabase.app')) ? _rtdbEtagCache.get(url) : null;
    if (isGet && url.includes('.firebasedatabase.app')) {
        headers['X-Firebase-ETag'] = 'true';
        if (cachedEntry && cachedEntry.etag) {
            headers['If-None-Match'] = cachedEntry.etag;
        }
    }
    try {
        let r = await fetch(url, { ...options, method, headers, signal: ctrl.signal, cache: 'no-store' });
        if (r.status === 400 && isGet && url.includes('.firebasedatabase.app')) {
            _rtdbEtagCache.delete(url);
            const fallbackHeaders = { ...(options.headers || {}) };
            delete fallbackHeaders['X-Firebase-ETag'];
            delete fallbackHeaders['If-None-Match'];
            r = await fetch(url, { ...options, method, headers: fallbackHeaders, signal: ctrl.signal, cache: 'no-store' });
        }
        clearTimeout(tid);
        if (r.status === 304 && cachedEntry) {
            return { ok: true, status: 304, notModified: true, data: cachedEntry.data };
        }
        if (!r.ok) return { ok: false, status: r.status, data: null };
        const txt = await r.text();
        const parsed = (txt && txt.trim() !== '' && txt.trim() !== 'null') ? JSON.parse(txt) : null;
        if (isGet && url.includes('.firebasedatabase.app')) {
            const newEtag = r.headers.get('etag') || r.headers.get('ETag');
            if (newEtag) {
                _rtdbEtagCache.set(url, { etag: newEtag, data: parsed, ts: Date.now() });
            }
        }
        return { ok: true, status: r.status, data: parsed };
    } catch (e) {
        clearTimeout(tid);
        return { ok: false, status: 0, data: cachedEntry ? cachedEntry.data : null };
    }
}

async function _fallbackDirectChatOp(subAction, payload, timeoutMs = 6000) {
    const uidDriver = String(payload.uidDriver || '').trim();
    const idTiket = String(payload.idTiket || '').trim();
    const now = Date.now();

    const coreDbUrl = _getClusterUrl('node1_core', _DIRECT_NODE1_CORE);
    const overflowDbUrl = _getClusterUrl('node2_overflow', _DIRECT_NODE2_OVERFLOW);
    const radarDbUrl = _getClusterUrl('node3_radar', _DIRECT_NODE3_RADAR);
    const chatDbUrl = _getClusterUrl('node3_chat', _DIRECT_NODE3_CHAT);

    if (subAction === 'CREATE_TICKET') {
        const rawOrder = payload.dataTiketOrder || {};
        const rawMeta = payload.metadataOrder || {};
        const rawInbox = payload.inboxEntry || {};
        const waktuDibuat = Number(payload.waktuDibuat || rawOrder.waktu_dibuat || now);
        const layanan = String(rawOrder.layanan || rawMeta.layanan || 'RIDE').toUpperCase().substring(0, 20);
        const hargaDasar = Math.max(5000, parseInt(rawOrder.harga_dasar ?? rawMeta.harga_dasar, 10) || 6000);
        const hargaTawaran = Math.min(10000000, Math.max(hargaDasar, parseInt(rawOrder.harga_tawaran ?? rawMeta.harga_tawaran, 10) || hargaDasar));
        const initialStatus = String(rawOrder.status || rawMeta.status || 'WAITING').toUpperCase();

        const ticketObj = { ...rawOrder, waktu_dibuat: waktuDibuat, layanan, harga_dasar: hargaDasar, harga_tawaran: hargaTawaran, status: initialStatus };
        const metaObj = { ...rawMeta, status: initialStatus, waktu_dibuat: waktuDibuat, uid_driver: uidDriver, layanan, harga_dasar: hargaDasar, harga_tawaran: hargaTawaran };
        const inboxObj = {
            nama_klien: String(rawInbox.nama_klien || rawMeta.nama_klien || 'Penumpang').substring(0, 60),
            layanan,
            pesan_terakhir: String(rawInbox.pesan_terakhir || 'Rincian pesanan masuk...').substring(0, 300),
            waktu_dibuat: waktuDibuat,
            waktu_update: waktuDibuat
        };
        const msgInitObj = {
            pengirim: 'klien',
            tipe: 'katalog_order',
            konten: typeof payload.katalogOrder === 'string' ? payload.katalogOrder : JSON.stringify(payload.katalogOrder || ticketObj),
            waktu: waktuDibuat,
            status: 'sent'
        };

        const busyUntilVal = Date.now() + 1800000;
        let usedOverflow = false;
        const [rRadar, rMeta] = await Promise.all([
            _fetchRtdbJson(`${radarDbUrl}/radar_tiket/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ticketObj)
            }, timeoutMs),
            _fetchRtdbJson(`${chatDbUrl}/sesi_komunikasi/${encodeURIComponent(idTiket)}/metadata_order.json`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metaObj)
            }, timeoutMs),
            _fetchRtdbJson(`${chatDbUrl}/sesi_komunikasi/${encodeURIComponent(idTiket)}/pesan/MSG_INIT.json`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msgInitObj)
            }, timeoutMs),
            _fetchRtdbJson(`${chatDbUrl}/inbox_mitra/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inboxObj)
            }, timeoutMs),
            _fetchRtdbJson(`${chatDbUrl}/inbox_driver/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inboxObj)
            }, timeoutMs),
            _fetchRtdbJson(`${coreDbUrl}/drivers/${encodeURIComponent(uidDriver)}/status/isBusy.json`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(true)
            }, timeoutMs),
            _fetchRtdbJson(`${coreDbUrl}/drivers/${encodeURIComponent(uidDriver)}/status/busyUntil.json`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(busyUntilVal)
            }, timeoutMs),
            _fetchRtdbJson(`${coreDbUrl}/drivers/${encodeURIComponent(uidDriver)}/status/activeTicketId.json`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(idTiket)
            }, timeoutMs)
        ]);

        if (!rRadar.ok || !rMeta.ok) {
            usedOverflow = true;
            const [ovR, ovM] = await Promise.all([
                _fetchRtdbJson(`${overflowDbUrl}/radar_tiket/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ticketObj)
                }, timeoutMs),
                _fetchRtdbJson(`${overflowDbUrl}/sesi_komunikasi/${encodeURIComponent(idTiket)}/metadata_order.json`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(metaObj)
                }, timeoutMs),
                _fetchRtdbJson(`${overflowDbUrl}/inbox_mitra/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inboxObj)
                }, timeoutMs)
            ]);
            if (!ovR.ok && !ovM.ok) return { ok: false };
        }

        if (payload.fcmNotification) {
            _dispatchDirectGasPush({
                uidDriver,
                idTiket,
                type: 'NEW_ORDER',
                layanan,
                harga: hargaTawaran,
                tip: rawOrder.tip_nominal || 0,
                nama_klien: String(rawOrder.nama_klien || rawMeta.nama_klien || 'Penumpang').substring(0, 80),
                jemput: String(rawOrder.pickup_alamat || ''),
                tujuan: String(rawOrder.dropoff_alamat || ''),
                pickup_coord: String(rawOrder.pickup_coord || ''),
                dropoff_coord: String(rawOrder.dropoff_coord || ''),
                jarak: String(rawOrder.jarak_km || '0'),
                title: payload.fcmNotification.title || 'Pesanan Baru Masuk!',
                body: payload.fcmNotification.body || '',
                skipBusyLock: true
            });
        }
        return { ok: true, idTiket, uidDriver, usedOverflow };
    }

    if (subAction === 'POLL_STATE' || subAction === 'CHAT_SYNC') {
        const sinceTs = Number(payload.sinceTs || 0);
        const useOv = Boolean(payload.usedOverflow);
        const chatBase = useOv ? overflowDbUrl : chatDbUrl;
        const radarBase = useOv ? overflowDbUrl : radarDbUrl;

        const matchTktTs = idTiket.match(/^TKT_(\d{10,15})_/);
        const ticketCreatedAt = Number(payload.waktuDibuat || (matchTktTs ? matchTktTs[1] : 0) || 0);
        const ticketAgeMs = ticketCreatedAt > 0 ? Math.max(0, Date.now() - ticketCreatedAt) : 999999;

        const [cRes, rRes] = await Promise.all([
            _fetchRtdbJson(`${chatBase}/sesi_komunikasi/${encodeURIComponent(idTiket)}.json`, { method: 'GET' }, timeoutMs),
            uidDriver ? _fetchRtdbJson(`${radarBase}/radar_tiket/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}/status.json`, { method: 'GET' }, timeoutMs) : Promise.resolve({ ok: true, status: 200, data: null })
        ]);

        if (!cRes.ok || cRes.status === 0) {
            return { ok: false, transientError: true };
        }

        const roomData = cRes.data;
        const radarStatus = typeof rRes.data === 'string' ? rRes.data : null;
        if (!roomData || typeof roomData !== 'object') {
            const rStUpper = radarStatus ? String(radarStatus).toUpperCase() : null;
            if (ticketAgeMs < 25000 && rStUpper !== 'REJECTED' && rStUpper !== 'CANCELLED') {
                return { ok: true, roomExists: true, status: 'WAITING', effectiveStatus: 'WAITING', transientWaiting: true, messages: [], readClientMsgIds: [] };
            }
            return { ok: true, httpStatus: cRes.status === 304 ? 200 : (cRes.status || 200), roomExists: false, radarStatus: rStUpper, messages: [], readClientMsgIds: [] };
        }

        const metadata = roomData.metadata_order || {};
        const rawPesan = roomData.pesan || {};
        const messages = [];
        const readClientMsgIds = [];
        let hasMitra = false;

        for (const [mId, mObj] of Object.entries(rawPesan)) {
            if (!mObj || typeof mObj !== 'object') continue;
            const w = Number(mObj.waktu || 0);
            if (mObj.pengirim === 'driver' || mObj.pengirim === 'mitra') hasMitra = true;
            if (mObj.pengirim === 'klien' && mObj.status === 'read') readClientMsgIds.push(mId);
            if (sinceTs <= 0 || w > sinceTs) messages.push({ id: mId, ...mObj, waktu: w });
        }
        messages.sort((a, b) => a.waktu - b.waktu);

        const E = String(metadata.status || '').toUpperCase();
        const N = radarStatus ? String(radarStatus).toUpperCase() : null;
        let effectiveStatus = 'WAITING';
        if (E === 'COMPLETED' || N === 'COMPLETED') effectiveStatus = 'COMPLETED';
        else if (E === 'CANCELLED' || N === 'CANCELLED') effectiveStatus = 'CANCELLED';
        else if (E === 'REJECTED' || N === 'REJECTED') effectiveStatus = 'REJECTED';
        else if (E === 'IN_PROGRESS' || N === 'IN_PROGRESS') effectiveStatus = 'IN_PROGRESS';
        else if (E === 'ARRIVED' || N === 'ARRIVED') effectiveStatus = 'ARRIVED';
        else if (E === 'ACCEPTED' || N === 'ACCEPTED' || hasMitra) effectiveStatus = 'ACCEPTED';
        else effectiveStatus = 'WAITING';

        const out = { ok: true, roomExists: true, metadata, effectiveStatus, radarStatus: N, messages, readClientMsgIds };
        if (effectiveStatus === 'CANCELLED') {
            out.cancelledBy = metadata.cancelled_by || 'driver';
            out.cancelReason = metadata.alasan_batal || '';
        }
        return out;
    }

    if (subAction === 'SEND_MSG') {
        const chatBase = payload.usedOverflow ? overflowDbUrl : chatDbUrl;
        const w = Number(payload.waktu || now);
        const msgId = `msg_${w}_${Math.random().toString(36).substring(2, 7)}`;
        const kontenAman = String(payload.konten || '').substring(0, 4950);
        const msgObj = {
            pengirim: 'klien',
            tipe: String(payload.tipe || 'teks'),
            konten: kontenAman,
            waktu: w,
            status: 'sent',
            ...(payload.forensik ? { forensik: payload.forensik } : {})
        };
        const inboxPatch = {
            pesan_terakhir: String(payload.preview || kontenAman).substring(0, 290),
            waktu_update: w
        };
        await Promise.allSettled([
            _fetchRtdbJson(`${chatBase}/sesi_komunikasi/${encodeURIComponent(idTiket)}/pesan/${encodeURIComponent(msgId)}.json`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msgObj)
            }, timeoutMs),
            uidDriver ? _fetchRtdbJson(`${chatBase}/inbox_mitra/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inboxPatch)
            }, timeoutMs) : Promise.resolve(),
            uidDriver ? _fetchRtdbJson(`${chatBase}/inbox_driver/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(inboxPatch)
            }, timeoutMs) : Promise.resolve()
        ]);

        if (payload.triggerFcm && uidDriver) {
            _dispatchDirectGasPush({
                uidDriver,
                idTiket,
                type: 'CHAT_MESSAGE',
                layanan: payload.layanan || 'CHAT',
                title: payload.fcmTitle || 'Pesan Baru dari Penumpang',
                body: payload.fcmBody || inboxPatch.pesan_terakhir
            });
        }
        return { ok: true, msgId, waktu: w };
    }

    if (subAction === 'UPDATE_STATUS') {
        if (uidDriver && idTiket && payload.deleteTicketOnly) {
            await Promise.allSettled([
                _fetchRtdbJson(`${radarDbUrl}/radar_tiket/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, { method: 'DELETE' }, timeoutMs),
                _fetchRtdbJson(`${overflowDbUrl}/radar_tiket/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, { method: 'DELETE' }, timeoutMs)
            ]);
        }
        return { ok: true };
    }

    if (subAction === 'CLEANUP') {
        const unbusyPatch = { isBusy: false, busyUntil: 0, activeTicketId: null };
        await Promise.allSettled([
            idTiket ? _fetchRtdbJson(`${chatDbUrl}/sesi_komunikasi/${encodeURIComponent(idTiket)}.json`, { method: 'DELETE' }, timeoutMs) : Promise.resolve(),
            idTiket ? _fetchRtdbJson(`${overflowDbUrl}/sesi_komunikasi/${encodeURIComponent(idTiket)}.json`, { method: 'DELETE' }, timeoutMs) : Promise.resolve(),
            (uidDriver && idTiket) ? _fetchRtdbJson(`${radarDbUrl}/radar_tiket/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, { method: 'DELETE' }, timeoutMs) : Promise.resolve(),
            (uidDriver && idTiket) ? _fetchRtdbJson(`${overflowDbUrl}/radar_tiket/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, { method: 'DELETE' }, timeoutMs) : Promise.resolve(),
            (uidDriver && idTiket) ? _fetchRtdbJson(`${chatDbUrl}/inbox_mitra/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, { method: 'DELETE' }, timeoutMs) : Promise.resolve(),
            (uidDriver && idTiket) ? _fetchRtdbJson(`${chatDbUrl}/inbox_driver/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, { method: 'DELETE' }, timeoutMs) : Promise.resolve(),
            (uidDriver && idTiket) ? _fetchRtdbJson(`${overflowDbUrl}/inbox_mitra/${encodeURIComponent(uidDriver)}/${encodeURIComponent(idTiket)}.json`, { method: 'DELETE' }, timeoutMs) : Promise.resolve(),
            uidDriver ? _fetchRtdbJson(`${coreDbUrl}/drivers/${encodeURIComponent(uidDriver)}/status/isBusy.json`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(false)
            }, timeoutMs) : Promise.resolve(),
            uidDriver ? _fetchRtdbJson(`${coreDbUrl}/drivers/${encodeURIComponent(uidDriver)}/status/busyUntil.json`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(0)
            }, timeoutMs) : Promise.resolve(),
            uidDriver ? _fetchRtdbJson(`${coreDbUrl}/drivers/${encodeURIComponent(uidDriver)}/status/activeTicketId.json`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(null)
            }, timeoutMs) : Promise.resolve(),
            uidDriver ? _fetchRtdbJson(`${overflowDbUrl}/drivers/${encodeURIComponent(uidDriver)}/status/isBusy.json`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(false)
            }, timeoutMs) : Promise.resolve(),
            uidDriver ? _fetchRtdbJson(`${overflowDbUrl}/drivers/${encodeURIComponent(uidDriver)}/status/busyUntil.json`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(0)
            }, timeoutMs) : Promise.resolve(),
            uidDriver ? _fetchRtdbJson(`${overflowDbUrl}/drivers/${encodeURIComponent(uidDriver)}/status/activeTicketId.json`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(null)
            }, timeoutMs) : Promise.resolve()
        ]);
        return { ok: true };
    }

    return { ok: false };
}

async function callChatGateway(subAction, payloadExtra = {}, timeoutMs = 8000) {
    if (window.BGNSecurityShield && typeof window.BGNSecurityShield.callGateway === 'function') {
        const mappedAction = subAction === 'CREATE_TICKET'
            ? 'CREATE_ORDER'
            : ((subAction === 'POLL_STATE' || subAction === 'CHAT_SYNC') ? 'CHAT_SYNC' : 'CHAT_OP');
        return await window.BGNSecurityShield.callGateway({
            action: mappedAction,
            subAction: subAction,
            ...payloadExtra
        }, { timeoutMs });
    }
    return await _fallbackDirectChatOp(subAction, payloadExtra, timeoutMs);
}

window.ChatHandshake = {
    escapeHTML: escapeHTML,
    _sedangMemulihkan: false,
    _sedangMenutupSesi: false,
    _activeTicketUsesOverflow: false,

    resetSebelumOrderBaru: function() {
        if (this.timeoutPesanan) { clearTimeout(this.timeoutPesanan); this.timeoutPesanan = null; }
        if (this.timeoutKatalog) { clearTimeout(this.timeoutKatalog); this.timeoutKatalog = null; }
        if (this.intervalRekamanGlobal) { clearInterval(this.intervalRekamanGlobal); this.intervalRekamanGlobal = null; }
        clearTimeout(timerPemutusKoneksi);
        this._hentikanPollingStatus();
        this._hentikanAdaptiveDeltaPoller();
        idTiketAktif = null;
        uidPengemudiTarget = null;
        payloadTiketAktif = null;
        statusOrderAktif = 'WAITING';
        waktuDibuatOrderAktif = 0;
        isOrderAccepted = false;
        _lastDeltaSinceTs = 0;
        _roomConfirmedExistsOnce = false;
        _consecutiveMissingCount = 0;
        _lastArrivedAlertTicketId = null;
        this._sedangMenutupSesi = false;
        try { localStorage.removeItem('bgt_active_chat');
            try { localStorage.removeItem('bgn_active_chat_session'); } catch (e) {}
            if (typeof window.periksaSesiChatAktif === 'function') window.periksaSesiChatAktif(); localStorage.removeItem('bgn_active_chat_session'); } catch (e) {}
        try { sessionStorage.removeItem('bgt_active_chat'); } catch (e) {}
        _rtdbEtagCache.clear();
        if (window.BGNSecurityShield && typeof window.BGNSecurityShield.resetEtagCache === 'function') {
            window.BGNSecurityShield.resetEtagCache();
        }
        const rejOverlay = document.getElementById('order-rejected-overlay');
        if (rejOverlay) rejOverlay.classList.add('hidden');
        const inlineRej = document.getElementById('bgn-inline-rejected-apology-banner');
        if (inlineRej) inlineRej.style.display = 'none';
    },

    isSesiAktif: function() {
        return Boolean(idTiketAktif || localStorage.getItem('bgt_active_chat'));
    },

    _ambilNamaDriverAktif: function() {
        let savedName = '';
        try {
            const rawPrev = localStorage.getItem('bgt_active_chat');
            if (rawPrev) {
                const parsed = JSON.parse(rawPrev);
                if (parsed && parsed.namaDriver) savedName = String(parsed.namaDriver).trim();
            }
        } catch (e) {}
        return String(
            window.BAGANTARA_DRIVER?.nama ||
            window.BAGANTARA_PRELOCKED_DRIVER?.nama ||
            (uidPengemudiTarget && window.BAGANTARA_DRIVER_CACHE?.[uidPengemudiTarget]?.nama) ||
            savedName ||
            'Pengemudi'
        ).trim();
    },

    _simpanStateChatLokal: function(extraFields = {}) {
        if (!idTiketAktif || !uidPengemudiTarget) return;
        try {
            let prev = {};
            const rawPrev = localStorage.getItem('bgt_active_chat');
            if (rawPrev) {
                try { prev = JSON.parse(rawPrev) || {}; } catch (e) {}
            }
            const waDriver = (window.BAGANTARA_DRIVER && window.BAGANTARA_DRIVER.wa)
                ? window.BAGANTARA_DRIVER.wa
                : (prev.noWa || "");
            const namaDriver = (window.BAGANTARA_DRIVER && window.BAGANTARA_DRIVER.nama)
                ? window.BAGANTARA_DRIVER.nama
                : ((window.BAGANTARA_PRELOCKED_DRIVER && window.BAGANTARA_PRELOCKED_DRIVER.nama)
                    ? window.BAGANTARA_PRELOCKED_DRIVER.nama
                    : (prev.namaDriver || ""));
            const platDriver = (window.BAGANTARA_DRIVER && window.BAGANTARA_DRIVER.plat)
                ? window.BAGANTARA_DRIVER.plat
                : ((window.BAGANTARA_PRELOCKED_DRIVER && window.BAGANTARA_PRELOCKED_DRIVER.plat)
                    ? window.BAGANTARA_PRELOCKED_DRIVER.plat
                    : (prev.platDriver || "-"));
            const qrisDriver = (window.BAGANTARA_DRIVER && window.BAGANTARA_DRIVER.qrisUrl)
                ? window.BAGANTARA_DRIVER.qrisUrl
                : ((window.BAGANTARA_PRELOCKED_DRIVER && window.BAGANTARA_PRELOCKED_DRIVER.qrisUrl)
                    ? window.BAGANTARA_PRELOCKED_DRIVER.qrisUrl
                    : ((uidPengemudiTarget && window.BAGANTARA_DRIVER_CACHE?.[uidPengemudiTarget]?.qrisUrl)
                        ? window.BAGANTARA_DRIVER_CACHE[uidPengemudiTarget].qrisUrl
                        : (prev.qrisUrl || "")));
            const nextState = {
                ...prev,
                idTiket: idTiketAktif,
                uidDriver: uidPengemudiTarget,
                noWa: waDriver,
                namaDriver: namaDriver,
                platDriver: platDriver,
                qrisUrl: qrisDriver,
                status: statusOrderAktif || prev.status || 'WAITING',
                waktuDibuat: waktuDibuatOrderAktif || prev.waktuDibuat || Date.now(),
                payloadTiket: payloadTiketAktif || prev.payloadTiket || null,
                ...extraFields
            };
            localStorage.setItem('bgt_active_chat', JSON.stringify(nextState));
            localStorage.setItem('bgn_active_chat_session', JSON.stringify(nextState));
            if (typeof window.periksaSesiChatAktif === 'function') window.periksaSesiChatAktif();
        } catch (e) {}
    },

    /**
     * Sinkronisasi visual status tahapan order dari Driver di header ruang chat (.tpl-chat-status)
     * dan di banner beranda (#active-chat-session-banner -> #activeChatBannerStatus & #activeChatBannerTitle)
     */
    _sinkronkanVisualTahapanOrder: function(rawStatus, triggerAlertOnArrive = true) {
        const st = String(rawStatus || statusOrderAktif || 'WAITING').toUpperCase();
        const prevSt = String(statusOrderAktif || 'WAITING').toUpperCase();

        // Urutan progres tahapan agar status yang sudah ARRIVED / IN_PROGRESS tidak turun kembali ke ACCEPTED
        const stageRank = { WAITING: 0, ASSIGNED: 0, ACCEPTED: 1, ARRIVED: 2, IN_PROGRESS: 3, COMPLETED: 4 };
        const effectiveStage = (stageRank[st] !== undefined && stageRank[prevSt] !== undefined && stageRank[st] < stageRank[prevSt] && st === 'ACCEPTED')
            ? prevSt
            : st;

        const isJustArrived = (effectiveStage === 'ARRIVED' && prevSt !== 'ARRIVED' && _lastArrivedAlertTicketId !== idTiketAktif);
        statusOrderAktif = effectiveStage;
        if (['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(effectiveStage)) {
            isOrderAccepted = true;
        }

        // 1. Bunyikan nada dering notifikasi & getar taktis saat Driver tiba di titik jemput (ARRIVED)
        if (isJustArrived && idTiketAktif) {
            _lastArrivedAlertTicketId = idTiketAktif;
            if (triggerAlertOnArrive) {
                this.mainkanSuara();
                if (typeof window.triggerHaptic === 'function') {
                    window.triggerHaptic([140, 80, 180, 80, 220]);
                }
            }
        }

        // 2. Perbarui indikator status di header ruang chat (.tpl-chat-status)
        const panel = document.getElementById('panel-komunikasi-utama');
        const statusEls = panel
            ? panel.querySelectorAll('.tpl-chat-status')
            : document.querySelectorAll('.tpl-chat-status');

        let labelHeader = 'MENUNGGU KONFIRMASI PENGEMUDI';
        let accentColor = '#f59e0b';

        if (effectiveStage === 'ACCEPTED') {
            labelHeader = 'PENGEMUDI MENUJU TITIK JEMPUT';
            accentColor = '#38bdf8'; // Biru / Cyan
        } else if (effectiveStage === 'ARRIVED') {
            labelHeader = 'PENGEMUDI SUDAH SAMPAI DI LOKASI JEMPUT';
            accentColor = '#ceab6b'; // Emas #ceab6b
        } else if (effectiveStage === 'IN_PROGRESS') {
            labelHeader = 'DALAM PERJALANAN MENUJU TUJUAN';
            accentColor = '#10b981'; // Hijau Emerald #10b981
        }

        statusEls.forEach(el => {
            el.style.color = accentColor;
            el.innerHTML = `
                <span class="tpl-chat-status-dot" style="width: 6px; height: 6px; background: ${accentColor}; border-radius: 50%; display: inline-block; box-shadow: 0 0 6px ${accentColor}; flex-shrink: 0;"></span>
                <span class="tpl-chat-status-text" style="font-weight: 800; letter-spacing: 0.4px;">${escapeHTML(labelHeader)}</span>
            `;
        });

        // 3. Perbarui banner di halaman utama (#active-chat-session-banner -> #activeChatBannerStatus & #activeChatBannerTitle)
        const bannerEl = document.getElementById('active-chat-session-banner');
        const bannerStatusEl = document.getElementById('activeChatBannerStatus');
        const bannerTitleEl = document.getElementById('activeChatBannerTitle');
        const bannerIconEl = document.getElementById('activeChatBannerIcon');
        const btnBannerCancel = document.getElementById('btnBannerCancelChat');
        const namaDriver = this._ambilNamaDriverAktif();
        const idTiketShort = idTiketAktif ? String(idTiketAktif).substring(0, 8) : '';

        if (bannerEl) {
            bannerEl.classList.remove('is-waiting', 'is-accepted', 'is-arrived', 'is-in-progress');
            if (effectiveStage === 'ACCEPTED') bannerEl.classList.add('is-accepted');
            else if (effectiveStage === 'ARRIVED') bannerEl.classList.add('is-arrived');
            else if (effectiveStage === 'IN_PROGRESS') bannerEl.classList.add('is-in-progress');
            else bannerEl.classList.add('is-waiting');
        }

        if (bannerStatusEl) {
            bannerStatusEl.textContent = labelHeader;
            bannerStatusEl.style.color = accentColor;
        }

        if (bannerTitleEl) {
            const subLabel = effectiveStage === 'ACCEPTED'
                ? 'Menuju Titik Jemput'
                : (effectiveStage === 'ARRIVED'
                    ? 'Sudah di Lokasi Jemput'
                    : (effectiveStage === 'IN_PROGRESS' ? 'Menuju Lokasi Tujuan' : 'Menunggu Konfirmasi'));
            bannerTitleEl.textContent = idTiketShort
                ? `${namaDriver} • ${subLabel} (#${idTiketShort})`
                : `${namaDriver} • ${subLabel}`;
        }

        if (bannerIconEl && bannerIconEl.parentElement) {
            const iconWrap = bannerIconEl.parentElement;
            if (effectiveStage === 'ACCEPTED') {
                bannerIconEl.className = 'fa-solid fa-motorcycle';
                iconWrap.style.background = 'rgba(56, 189, 248, 0.18)';
                iconWrap.style.borderColor = '#38bdf8';
                iconWrap.style.color = '#38bdf8';
            } else if (effectiveStage === 'ARRIVED') {
                bannerIconEl.className = 'fa-solid fa-location-dot';
                iconWrap.style.background = 'rgba(206, 171, 107, 0.2)';
                iconWrap.style.borderColor = '#ceab6b';
                iconWrap.style.color = '#ceab6b';
            } else if (effectiveStage === 'IN_PROGRESS') {
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

        if (btnBannerCancel) {
            btnBannerCancel.style.display = isOrderAccepted ? 'none' : 'inline-flex';
        }

        this._simpanStateChatLokal({ status: effectiveStage });
        if (typeof window.periksaSesiChatAktif === 'function') {
            window.periksaSesiChatAktif();
        }
    },

    sinkronisasiLayarChat: function(isOpen) {
        const bottomNav = document.getElementById('mainBottomNav');
        const btnFloatChat = document.getElementById('btnPulihkanChat');
        const orderPanel = document.getElementById('dynamicOrderPanel');

        if (isOpen) {
            document.body.classList.add('chat-room-open');
            if (bottomNav) bottomNav.classList.add('hidden');
            if (btnFloatChat) btnFloatChat.classList.add('hidden');
            if (orderPanel) orderPanel.style.display = 'none';
            if (typeof window.hideMandatoryGpsOverlay === 'function') {
                window.hideMandatoryGpsOverlay();
            }
            if (typeof window.armBgtHistoryGuard === 'function') {
                window.armBgtHistoryGuard('chat');
            }
        } else {
            document.body.classList.remove('chat-room-open');
            if (typeof window.syncChatAndBottomNavState === 'function') {
                window.syncChatAndBottomNavState();
            } else if (bottomNav) {
                bottomNav.classList.remove('hidden');
            }
            if (typeof window.periksaSesiChatAktif === 'function') {
                window.periksaSesiChatAktif();
            }
        }
    },

    minimalkanRuangKomunikasi: function() {
        const panel = document.getElementById('panel-komunikasi-utama');
        if (!panel) {
            this.sinkronisasiLayarChat(false);
            return;
        }
        panel.style.animation = 'slideUp 0.24s cubic-bezier(0.4, 0, 0.2, 1) reverse forwards';
        setTimeout(() => {
            panel.style.display = 'none';
            panel.style.animation = 'none';
            // Pertahankan poller aktif saat sesi masih berlangsung agar perubahan status driver
            // (ACCEPTED / ARRIVED / IN_PROGRESS / CANCELLED / COMPLETED) langsung memperbarui banner beranda secara real-time!
            if (!idTiketAktif) {
                this.putuskanKoneksiChat();
            }
            if (window.spaNavigateTo) {
                window.spaNavigateTo('view-mitra-map');
            }
            this.sinkronisasiLayarChat(false);
        }, 240);
    },

    tampilkanKembaliRuangKomunikasi: function() {
        const panel = document.getElementById('panel-komunikasi-utama');
        if (panel && idTiketAktif) {
            panel.style.display = 'flex';
            panel.style.animation = 'none';
            void panel.offsetWidth;
            panel.style.animation = 'slideUp 0.28s cubic-bezier(0.4, 0, 0.2, 1)';
            this.sinkronisasiLayarChat(true);
            this._sinkronkanVisualTahapanOrder(statusOrderAktif, false);
            this.aktifkanKoneksiChat();

            const dotNotif = document.getElementById('chat-notif-dot-global');
            if (dotNotif) dotNotif.classList.add('hidden-state');

            const wadahChat = panel.querySelector('.tpl-chat-body');
            if (wadahChat) {
                setTimeout(() => wadahChat.scrollTo({ top: wadahChat.scrollHeight, behavior: 'smooth' }), 80);
            }
        } else {
            this.pulihkanSesiAktif();
        }
    },

    aktifkanKoneksiChat: function() {
        clearTimeout(timerPemutusKoneksi);
        _isConnectionPaused = false;
        if (idTiketAktif && !_deltaPollerTimer) {
            this._mulaiAdaptiveDeltaPoller();
        }
    },

    putuskanKoneksiChat: function() {
        clearTimeout(timerPemutusKoneksi);
        _isConnectionPaused = true;
        this._hentikanAdaptiveDeltaPoller();
    },

    _hentikanPollingStatus: function() {
        if (timerPollingStatus) {
            clearInterval(timerPollingStatus);
            timerPollingStatus = null;
        }
    },

    _hentikanAdaptiveDeltaPoller: function() {
        if (_deltaPollerTimer) {
            clearInterval(_deltaPollerTimer);
            _deltaPollerTimer = null;
        }
        _isDeltaPollingInFlight = false;
    },

    _mulaiAdaptiveDeltaPoller: function() {
        this._hentikanAdaptiveDeltaPoller();
        if (!idTiketAktif || _isConnectionPaused) return;

        const pollIntervalMs = 4000;
        const executePollCycle = async () => {
            if (!idTiketAktif || _isConnectionPaused || _isDeltaPollingInFlight || this._sedangMenutupSesi) return;
            _isDeltaPollingInFlight = true;
            try {
                const currentTicketId = idTiketAktif;
                const res = await callChatGateway('CHAT_SYNC', {
                    idTiket: currentTicketId,
                    uidDriver: uidPengemudiTarget || '',
                    waktuDibuat: waktuDibuatOrderAktif || 0,
                    sinceTs: _lastDeltaSinceTs,
                    isAccepted: Boolean(isOrderAccepted || ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(statusOrderAktif)),
                    usedOverflow: Boolean(this._activeTicketUsesOverflow)
                }, 6000);

                if (!res || !res.ok || res.transientError || idTiketAktif !== currentTicketId || this._sedangMenutupSesi) return;
                if (res.transientWaiting) {
                    _consecutiveMissingCount = 0;
                    return;
                }

                const wAlerts = window.BGN_CONFIG?.wording?.alerts || {};

                // TUGAS 3.2: Toleransi Jaringan & Propagasi Awal (25 Detik Grace Period + Minimal 4x Pembacaan Null Berturut-turut HTTP 200)
                if (res.roomExists === false) {
                    const umurSesiMs = Date.now() - (waktuDibuatOrderAktif || Date.now());
                    const rSt = String(res.radarStatus || '').toUpperCase();

                    if (rSt === 'COMPLETED') {
                        this.tutupSesiDariServer();
                        return;
                    }
                    if (rSt === 'REJECTED') {
                        this.batalkanSesi(
                            wAlerts.chat_ticket_rejected || "PENGEMUDI BELUM DAPAT MENERIMA PESANAN",
                            { isRejectedByDriver: true, rejectMode: 'REJECTED' }
                        );
                        return;
                    }
                    if (rSt === 'CANCELLED') {
                        this.batalkanSesi(
                            "Pesanan dibatalkan oleh pengemudi.",
                            { isRejectedByDriver: true, isCancelledByDriver: true, rejectMode: 'CANCELLED_BY_DRIVER' }
                        );
                        return;
                    }

                    // Selama 25 detik pertama sejak CREATE_ORDER, abaikan respons kosong (null) sementara
                    if (umurSesiMs < 25000) {
                        _consecutiveMissingCount = 0;
                        return;
                    }

                    // Jika tiket masih berstatus WAITING/ACCEPTED/ARRIVED/IN_PROGRESS di radar, jangan batalkan!
                    if (['WAITING', 'ASSIGNED', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(rSt)) {
                        _consecutiveMissingCount = 0;
                        return;
                    }

                    if (res.httpStatus === 200 || res.httpStatus === undefined) {
                        _consecutiveMissingCount += 1;
                    }

                    if (_consecutiveMissingCount >= 4) {
                        const prevStatus = String(statusOrderAktif || 'WAITING').toUpperCase();
                        if (prevStatus === 'IN_PROGRESS' || prevStatus === 'COMPLETED') {
                            this.tutupSesiDariServer();
                        } else {
                            this.batalkanSesi(
                                "Pesanan dibatalkan oleh pengemudi.",
                                { isRejectedByDriver: true, isCancelledByDriver: true, rejectMode: 'CANCELLED_BY_DRIVER' }
                            );
                        }
                    }
                    return;
                }

                _consecutiveMissingCount = 0;
                _roomConfirmedExistsOnce = true;

                if (res.metadata && res.metadata.waktu_dibuat) {
                    waktuDibuatOrderAktif = Number(res.metadata.waktu_dibuat);
                }

                if (Array.isArray(res.messages) && res.messages.length > 0) {
                    for (let i = 0; i < res.messages.length; i++) {
                        const msg = res.messages[i];
                        if (!msg) continue;
                        if (msg.waktu && Number(msg.waktu) > _lastDeltaSinceTs) {
                            _lastDeltaSinceTs = Number(msg.waktu);
                        }
                        this._prosesPesanDariPoller(msg);
                    }
                }

                if (Array.isArray(res.readClientMsgIds) && res.readClientMsgIds.length > 0) {
                    res.readClientMsgIds.forEach(msgId => {
                        const elemenPesan = document.getElementById(msgId);
                        if (elemenPesan && elemenPesan.dataset.readMarked !== 'true') {
                            elemenPesan.dataset.readMarked = 'true';
                            const timeSpan = elemenPesan.querySelector('.msg-time');
                            if (timeSpan) {
                                const waktuTeks = elemenPesan.dataset.msgTimeStr || '';
                                timeSpan.innerHTML = `${escapeHTML(waktuTeks)} <i class="fa-solid fa-check-double" style="color: #3b82f6; font-size: 0.65rem;"></i>`;
                            }
                        }
                    });
                }

                // TUGAS 3.2 (Rule 1 & Rule 2): Modal pembatalan/penolakan HANYA boleh muncul jika status eksplisit 'CANCELLED' atau 'REJECTED'
                const effStatus = String(res.effectiveStatus || res.metadata?.status || 'WAITING').toUpperCase();
                const radarStExplicit = String(res.radarStatus || '').toUpperCase();
                if (effStatus === 'COMPLETED' || radarStExplicit === 'COMPLETED') {
                    this.tutupSesiDariServer();
                } else if (effStatus === 'CANCELLED' || radarStExplicit === 'CANCELLED') {
                    if (this.timeoutPesanan) { clearTimeout(this.timeoutPesanan); this.timeoutPesanan = null; }
                    this._hentikanPollingStatus();
                    this.batalkanSesi(
                        res.cancelReason || res.metadata?.alasan_batal || "Dibatalkan oleh pengemudi",
                        {
                            isRejectedByDriver: true,
                            isCancelledByDriver: true,
                            rejectMode: 'CANCELLED_BY_DRIVER',
                            cancelledBy: res.cancelledBy || res.metadata?.cancelled_by || 'driver',
                            cancelReason: res.cancelReason || res.metadata?.alasan_batal || ''
                        }
                    );
                } else if (effStatus === 'REJECTED' || radarStExplicit === 'REJECTED') {
                    if (this.timeoutPesanan) { clearTimeout(this.timeoutPesanan); this.timeoutPesanan = null; }
                    this._hentikanPollingStatus();
                    this.batalkanSesi(
                        wAlerts.chat_ticket_rejected || "PENGEMUDI BELUM DAPAT MENERIMA PESANAN",
                        { isRejectedByDriver: true, rejectMode: 'REJECTED' }
                    );
                } else if (effStatus === 'IN_PROGRESS') {
                    this._aktifkanModeSesiDiterima(true, 'IN_PROGRESS');
                } else if (effStatus === 'ARRIVED') {
                    this._aktifkanModeSesiDiterima(true, 'ARRIVED');
                } else if (effStatus === 'ACCEPTED') {
                    this._aktifkanModeSesiDiterima(true, 'ACCEPTED');
                }
            } catch (e) {
            } finally {
                _isDeltaPollingInFlight = false;
            }
        };

        executePollCycle();
        _deltaPollerTimer = setInterval(executePollCycle, pollIntervalMs);
    },

    _ikatTombolWaHeader: function(isRecoveryGreeting = false) {
        const panel = document.getElementById('panel-komunikasi-utama');
        const btnWa = panel ? panel.querySelector('.tpl-btn-wa-driver') : document.querySelector('.tpl-btn-wa-driver');
        const waDriver = window.BAGANTARA_DRIVER ? window.BAGANTARA_DRIVER.wa : "";
        if (!btnWa || !waDriver || !idTiketAktif) return;

        const wTemplates = window.BGN_CONFIG?.wording?.templates || {};
        const mapCfg = window.BGN_CONFIG?.settings?.map_config || { whatsapp_base_url: 'https://wa.me/' };

        btnWa.classList.remove('hidden-state');
        const newBtnWa = btnWa.cloneNode(true);
        if (btnWa.parentNode) {
            btnWa.parentNode.replaceChild(newBtnWa, btnWa);
        }
        newBtnWa.addEventListener('click', () => {
            const prefix = isRecoveryGreeting
                ? (wTemplates.wa_driver_recovery || "Permisi, konfirmasi pesanan Bagantara. ID Pesanan:")
                : (wTemplates.wa_driver_greeting_acc || "Halo, saya penumpang Bagantara dengan ID Pesanan:");
            const msgWa = `${prefix} ${idTiketAktif.substring(0, 8)}`;
            window.open(`${mapCfg.whatsapp_base_url}${waDriver}?text=${encodeURIComponent(msgWa)}`, '_blank');
        });
    },

    _ikatTombolQrisHeader: function() {
        const panel = document.getElementById('panel-komunikasi-utama');
        const btnQris = panel ? panel.querySelector('.tpl-btn-qris-driver') : document.querySelector('.tpl-btn-qris-driver');
        if (!btnQris) return;

        let savedChat = null;
        try {
            const rawSaved = localStorage.getItem('bgt_active_chat');
            if (rawSaved) savedChat = JSON.parse(rawSaved);
        } catch (e) {}

        const cachedDriver = (uidPengemudiTarget && window.BAGANTARA_DRIVER_CACHE)
            ? window.BAGANTARA_DRIVER_CACHE[uidPengemudiTarget]
            : null;

        const rawQris = (
            window.BAGANTARA_DRIVER?.qrisUrl ||
            window.BAGANTARA_PRELOCKED_DRIVER?.qrisUrl ||
            cachedDriver?.qrisUrl ||
            savedChat?.qrisUrl ||
            ''
        );
        const cleanQrisUrl = (typeof window.normalizeDriverQrisUrl === 'function')
            ? window.normalizeDriverQrisUrl(rawQris)
            : String(rawQris || '').trim();

        if (!cleanQrisUrl) {
            btnQris.classList.add('hidden-state');
            return;
        }

        btnQris.classList.remove('hidden-state');
        const newBtnQris = btnQris.cloneNode(true);
        if (btnQris.parentNode) {
            btnQris.parentNode.replaceChild(newBtnQris, btnQris);
        }
        newBtnQris.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.triggerHaptic === 'function') window.triggerHaptic(18);
            const namaDrv = window.BAGANTARA_DRIVER?.nama || window.BAGANTARA_PRELOCKED_DRIVER?.nama || cachedDriver?.nama || savedChat?.namaDriver || 'Pengemudi Bagantara';
            const platDrv = window.BAGANTARA_DRIVER?.plat || window.BAGANTARA_PRELOCKED_DRIVER?.plat || cachedDriver?.plat || savedChat?.platDriver || '-';
            const kendDrv = window.BAGANTARA_DRIVER?.kendaraan || window.BAGANTARA_PRELOCKED_DRIVER?.kendaraan || cachedDriver?.kendaraan || '';
            if (window.UIManager && typeof window.UIManager.openDriverQrisModal === 'function') {
                window.UIManager.openDriverQrisModal({
                    uid: uidPengemudiTarget || '',
                    nama: namaDrv,
                    plat: platDrv,
                    kendaraan: kendDrv,
                    qrisUrl: cleanQrisUrl
                });
            }
        });
    },

    _setDriverBusyState: function(uidDriver, isBusy, ticketId = null) {
        if (!uidDriver) return;
        const busyFlag = Boolean(isBusy);
        const busyUntilTs = busyFlag ? (Date.now() + 1800000) : 0;
        const activeTicket = busyFlag ? (ticketId || idTiketAktif || null) : null;

        if (window.BAGANTARA_DRIVER_CACHE && window.BAGANTARA_DRIVER_CACHE[uidDriver]) {
            window.BAGANTARA_DRIVER_CACHE[uidDriver].isBusy = busyFlag;
            window.BAGANTARA_DRIVER_CACHE[uidDriver].busyUntil = busyUntilTs;
            window.BAGANTARA_DRIVER_CACHE[uidDriver].activeTicketId = activeTicket;
        }
        if (window.AegisEngine && window.AegisEngine._rtdbScanCache && Array.isArray(window.AegisEngine._rtdbScanCache.data)) {
            window.AegisEngine._rtdbScanCache.data.forEach(drv => {
                if (drv && drv.uid === uidDriver) {
                    drv.isBusy = busyFlag;
                    drv.busyUntil = busyUntilTs;
                    drv.activeTicketId = activeTicket;
                }
            });
        }
        if (window.UIManager && typeof window.UIManager.loadMitraCatalog === 'function') {
            window.UIManager.loadMitraCatalog(false, true);
        }

        if (window.BGNSecurityShield && typeof window.BGNSecurityShield.lockDriverBusyNode1 === 'function') {
            window.BGNSecurityShield.lockDriverBusyNode1(uidDriver, busyFlag, activeTicket, 4500).catch(() => {});
        } else {
            const uidEnc = encodeURIComponent(uidDriver);
            Promise.allSettled([
                _fetchRtdbJson(`${_DIRECT_NODE1_CORE}/drivers/${uidEnc}/status/isBusy.json`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(busyFlag)
                }, 4500),
                _fetchRtdbJson(`${_DIRECT_NODE1_CORE}/drivers/${uidEnc}/status/busyUntil.json`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(busyUntilTs)
                }, 4500),
                _fetchRtdbJson(`${_DIRECT_NODE1_CORE}/drivers/${uidEnc}/status/activeTicketId.json`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(activeTicket)
                }, 4500)
            ]).catch(() => {});
        }
    },

    _aktifkanModeSesiDiterima: function(tampilkanBannerTeks = true, targetStage = null) {
        if (!idTiketAktif) return;
        const belumDiterimaSebelumnya = !isOrderAccepted;
        isOrderAccepted = true;

        const nextStage = targetStage
            ? String(targetStage).toUpperCase()
            : (['ARRIVED', 'IN_PROGRESS'].includes(statusOrderAktif) ? statusOrderAktif : 'ACCEPTED');

        if (this.timeoutPesanan) {
            clearTimeout(this.timeoutPesanan);
            this.timeoutPesanan = null;
        }
        this._hentikanPollingStatus();

        const uiTunggu = document.getElementById('ui-tunggu-acc');
        if (uiTunggu) uiTunggu.remove();

        this._sinkronkanVisualTahapanOrder(nextStage, tampilkanBannerTeks);
        this._ikatTombolWaHeader(false);
        this._ikatTombolQrisHeader();

        const alertElem = document.getElementById('cyber-alert');
        if (alertElem) alertElem.classList.add('hidden');

        const wadahChat = document.querySelector('.tpl-chat-body');
        const wAlerts = window.BGN_CONFIG?.wording?.alerts || {};
        if (tampilkanBannerTeks && wadahChat && !document.getElementById('ui-status-connected')) {
            const txtSukses = escapeHTML(wAlerts.chat_connected || "✅ Driver terhubung! Pesanan dikonfirmasi.");
            wadahChat.insertAdjacentHTML('beforeend', `<div id="ui-status-connected" style="text-align:center; color:#38bdf8; font-size:0.75rem; margin-top:10px; font-weight:bold;">${txtSukses}</div>`);
            wadahChat.scrollTo({ top: wadahChat.scrollHeight, behavior: 'smooth' });
        }

        if (belumDiterimaSebelumnya && window.periksaSesiChatAktif) {
            window.periksaSesiChatAktif();
        }
    },

    _renderKotakTungguKonfirmasi: function() {
        if (isOrderAccepted || ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(statusOrderAktif)) return;
        const wadahChat = document.querySelector('.tpl-chat-body');
        if (!wadahChat || document.getElementById('ui-tunggu-acc')) return;

        const wAlerts = window.BGN_CONFIG?.wording?.alerts || {};
        const mapCfg = window.BGN_CONFIG?.settings?.map_config || { whatsapp_base_url: 'https://wa.me/' };
        const cachedDriver = (uidPengemudiTarget && window.BAGANTARA_DRIVER_CACHE)
            ? window.BAGANTARA_DRIVER_CACHE[uidPengemudiTarget]
            : null;
        const rawWaDriver = (
            window.BAGANTARA_DRIVER?.wa ||
            window.BAGANTARA_PRELOCKED_DRIVER?.wa ||
            cachedDriver?.wa ||
            ''
        );
        const cleanWaDriver = String(rawWaDriver).replace(/[^0-9]/g, '').replace(/^0/, '62');
        const namaDriver = this._ambilNamaDriverAktif();

        const btnWaWakeupHtml = cleanWaDriver.length >= 10
            ? `<button id="btnPanggilCepatWaTunggu" type="button" style="width: 100%; background: linear-gradient(135deg, #10b981, #059669); border: 1px solid rgba(255,255,255,0.22); color: #052e16; padding: 10px 14px; border-radius: 10px; font-family: 'Space Grotesk', monospace; font-size: 0.72rem; font-weight: 900; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 7px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.3);">
                   <i class="fa-brands fa-whatsapp" style="font-size: 0.95rem;"></i>
                   <span>Panggil Cepat via WhatsApp</span>
               </button>`
            : '';

        const htmlTunggu = `
            <div id="ui-tunggu-acc" style="margin: 14px auto 8px auto; width: 100%; max-width: 340px; background: linear-gradient(160deg, #131c2e, #0b101a); border: 1px solid rgba(206, 171, 107, 0.45); border-top: 3px solid #10b981; border-radius: 16px; padding: 16px 14px; text-align: center; display: flex; flex-direction: column; gap: 10px; align-items: center; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);">
                <div class="bgn-radar-wave-box">
                    <i class="fa-solid fa-satellite-dish"></i>
                </div>
                <div style="color: #f8fafc; font-size: 0.78rem; font-weight: 800; line-height: 1.4; letter-spacing: 0.2px;">
                    Pesanan Terkirim Langsung ke Pengemudi — Menunggu Konfirmasi
                </div>
                <div style="color: #94a3b8; font-size: 0.66rem; line-height: 1.45;">
                    Pesanan Anda telah dikunci untuk <b style="color: #ceab6b;">${escapeHTML(namaDriver)}</b>. Silakan tunggu konfirmasi pengemudi atau gunakan aksi langsung di bawah ini:
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px; width: 100%; margin-top: 2px;">
                    ${btnWaWakeupHtml}
                    <button id="btnBatalMandiri" type="button" style="width: 100%; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.55); color: #f87171; padding: 10px 14px; border-radius: 10px; font-family: 'Space Grotesk', monospace; font-size: 0.7rem; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 7px;">
                        <i class="fa-solid fa-rotate-left"></i>
                        <span>Batalkan &amp; Pilih Pengemudi Lain</span>
                    </button>
                </div>
            </div>
        `;
        wadahChat.insertAdjacentHTML('beforeend', htmlTunggu);

        const btnWaWake = document.getElementById('btnPanggilCepatWaTunggu');
        if (btnWaWake && cleanWaDriver.length >= 10) {
            btnWaWake.addEventListener('click', () => {
                const shortTicket = idTiketAktif ? idTiketAktif.substring(0, 8) : 'ORDER';
                const layananStr = payloadTiketAktif?.layanan || 'RIDE';
                const wakeMsg = `Halo Kak ${namaDriver}, saya baru saja mengirim pesanan ${layananStr} di aplikasi Bagantara (ID: #${shortTicket}). Mohon dicek di ruang pesanan aplikasi Pengemudi ya, terima kasih!`;
                window.open(`${mapCfg.whatsapp_base_url}${cleanWaDriver}?text=${encodeURIComponent(wakeMsg)}`, '_blank', 'noopener,noreferrer');
            });
        }

        const btnBatal = document.getElementById('btnBatalMandiri');
        if (btnBatal) {
            btnBatal.addEventListener('click', () => {
                this.batalkanSesi(wAlerts.chat_cancel_manual || "Pesanan dibatalkan.");
            });
        }
    },

    _pasangPemantauStatusOrder: function(_waktuDibuatRef = null) {
        if (!idTiketAktif || !uidPengemudiTarget) return;
        if (isOrderAccepted || ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(statusOrderAktif)) {
            this._aktifkanModeSesiDiterima(false, statusOrderAktif);
            return;
        }
        if (this.timeoutPesanan) {
            clearTimeout(this.timeoutPesanan);
            this.timeoutPesanan = null;
        }
        this._sinkronkanVisualTahapanOrder('WAITING', false);
        this._renderKotakTungguKonfirmasi();
    },

    _bangunDataKatalogOrder: function(lockedOrder) {
        if (!lockedOrder) return null;
        const wChat = window.BGN_CONFIG.wording.chat_system;
        const wPopup = window.BGN_CONFIG.wording.mitra_popup;
        const wPins = window.BGN_CONFIG.wording.map_pins;

        const layananSistem = lockedOrder.layanan ? lockedOrder.layanan : wPopup.default_service;
        const multiList = Array.isArray(lockedOrder.multi_dropoffs) ? lockedOrder.multi_dropoffs : [];
        
        let stringWaypoints = "";
        let labelTujuan = lockedOrder.dropoff_alamat
            ? (lockedOrder.dropoff_patokan && lockedOrder.dropoff_patokan !== wPopup.no_notes
                ? `${lockedOrder.dropoff_alamat} (${lockedOrder.dropoff_patokan})`
                : lockedOrder.dropoff_alamat)
            : wPopup.no_notes;
        
        if (multiList.length > 1) {
            const titikSinggah = multiList.slice(0, -1).filter(Boolean);
            if (titikSinggah.length > 0) {
                stringWaypoints = titikSinggah.map(p => `${parseFloat(p.lat).toFixed(6)},${parseFloat(p.lng).toFixed(6)}`).join('|');
            }
            labelTujuan = multiList.map((s, idx) => `${idx + 1}. ${s.name}${s.notes ? ' (' + s.notes + ')' : ''}`).join(' → ');
        } else if (multiList.length === 1 && multiList[0]?.name) {
            labelTujuan = multiList[0].notes
                ? `${multiList[0].name} (${multiList[0].notes})`
                : multiList[0].name;
        }

        const pickupCoordStr = lockedOrder.pickup_coord ? lockedOrder.pickup_coord : '';
        const dropoffCoordStr = lockedOrder.dropoff_coord ? lockedOrder.dropoff_coord : '';

        const namaJemput = lockedOrder.pickup_alamat ? lockedOrder.pickup_alamat : '';
        const patokanJemput = lockedOrder.pickup_patokan ? lockedOrder.pickup_patokan : wPopup.no_notes;
        let labelJemputFaktual = '';

        if (!namaJemput || namaJemput === wPopup.no_notes || namaJemput.toLowerCase().includes('memindai')) {
            labelJemputFaktual = pickupCoordStr ? `📍 ${wPins.map_point_prefix}: ${pickupCoordStr}` : wChat.empty_pickup_label;
            if (patokanJemput && patokanJemput !== wPopup.no_notes) {
                labelJemputFaktual += ` (${wChat.note_label_prefix} ${patokanJemput})`;
            }
        } else {
            labelJemputFaktual = (patokanJemput && patokanJemput !== wPopup.no_notes)
                ? `${namaJemput} (${patokanJemput})`
                : namaJemput;
        }

        let labelTujuanFaktual = '';
        if (!labelTujuan || labelTujuan === wPopup.no_notes || labelTujuan.toLowerCase().includes('memindai')) {
            labelTujuanFaktual = dropoffCoordStr ? `📍 ${wPins.map_point_prefix}: ${dropoffCoordStr}` : wChat.empty_dropoff_label;
        } else {
            labelTujuanFaktual = labelTujuan;
        }

        const hargaDasar = parseInt(lockedOrder.harga_dasar, 10) ? parseInt(lockedOrder.harga_dasar, 10) : 0;
        const nominalTip = parseInt(lockedOrder.tip_nominal, 10) ? parseInt(lockedOrder.tip_nominal, 10) : 0;
        const hargaTotal = parseInt(lockedOrder.harga_tawaran, 10) ? parseInt(lockedOrder.harga_tawaran, 10) : (hargaDasar + nominalTip);

        return {
            layanan: layananSistem,
            harga: hargaTotal, 
            harga_dasar: hargaDasar,
            harga_normal: parseInt(lockedOrder.harga_normal, 10) ? parseInt(lockedOrder.harga_normal, 10) : hargaDasar,
            diskon_persen: parseFloat(lockedOrder.diskon_persen) ? parseFloat(lockedOrder.diskon_persen) : 0,
            diskon_source: lockedOrder.diskon_source ? lockedOrder.diskon_source : null,
            promo_teks: lockedOrder.promo_teks ? lockedOrder.promo_teks : '',
            tip_nominal: nominalTip,
            catatan: lockedOrder.catatan_tambahan ? lockedOrder.catatan_tambahan : "",
            jarak: lockedOrder.jarak_km ? lockedOrder.jarak_km : 0,
            jemput: labelJemputFaktual,
            tujuan: labelTujuanFaktual,
            pickup_coord: pickupCoordStr,
            dropoff_coord: dropoffCoordStr,
            waypoints: stringWaypoints, 
            toko_jastip: lockedOrder.toko_jastip ? lockedOrder.toko_jastip : null,
            belanjaan: layananSistem === 'JASTIP' ? (Array.isArray(lockedOrder.belanjaan) ? lockedOrder.belanjaan : []) : null,
            wa_klien: lockedOrder.wa_klien ? lockedOrder.wa_klien : ""
        };
    },
    
    pulihkanSesiAktif: async function() {
        const sesiTersimpan = localStorage.getItem('bgt_active_chat');
        if (!sesiTersimpan) {
            this.putuskanKoneksiChat();
            this.sinkronisasiLayarChat(false);
            return;
        }

        let sesi = null;
        try {
            sesi = JSON.parse(sesiTersimpan);
        } catch (parseErr) {
            localStorage.removeItem('bgt_active_chat');
            try { localStorage.removeItem('bgn_active_chat_session'); } catch (e) {}
            if (typeof window.periksaSesiChatAktif === 'function') window.periksaSesiChatAktif();
            this.putuskanKoneksiChat();
            this.sinkronisasiLayarChat(false);
            return;
        }

        if (!sesi || !sesi.idTiket || !sesi.uidDriver) {
            localStorage.removeItem('bgt_active_chat');
            try { localStorage.removeItem('bgn_active_chat_session'); } catch (e) {}
            if (typeof window.periksaSesiChatAktif === 'function') window.periksaSesiChatAktif();
            this.putuskanKoneksiChat();
            this.sinkronisasiLayarChat(false);
            return;
        }

        if (this._sedangMemulihkan) {
            const panelExisting = document.getElementById('panel-komunikasi-utama');
            if (panelExisting) {
                panelExisting.style.display = 'flex';
                this.sinkronisasiLayarChat(true);
            }
            return;
        }
        this._sedangMemulihkan = true;
        this._sedangMenutupSesi = false;

        try {
            if (window.ConfigManager && !window.ConfigManager.isLoaded && typeof window.ConfigManager.init === 'function') {
                await window.ConfigManager.init();
            }
            await initFirebaseChat();

            idTiketAktif = sesi.idTiket;
            uidPengemudiTarget = sesi.uidDriver;
            payloadTiketAktif = sesi.payloadTiket ? sesi.payloadTiket : null;
            statusOrderAktif = String(sesi.status || 'WAITING').toUpperCase();
            waktuDibuatOrderAktif = Number(sesi.waktuDibuat || Date.now());
            isOrderAccepted = ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(statusOrderAktif);
            _lastDeltaSinceTs = 0;
            _roomConfirmedExistsOnce = false;
            if (statusOrderAktif === 'ARRIVED') {
                _lastArrivedAlertTicketId = idTiketAktif;
            }

            if (sesi.noWa || sesi.namaDriver || sesi.qrisUrl) {
                window.BAGANTARA_DRIVER = {
                    ...(window.BAGANTARA_DRIVER || {}),
                    uid: sesi.uidDriver,
                    wa: sesi.noWa || (window.BAGANTARA_DRIVER?.wa || ''),
                    nama: sesi.namaDriver || (window.BAGANTARA_DRIVER?.nama || ''),
                    plat: sesi.platDriver || (window.BAGANTARA_DRIVER?.plat || '-'),
                    qrisUrl: sesi.qrisUrl || (window.BAGANTARA_DRIVER?.qrisUrl || '')
                };
            }

            if (payloadTiketAktif?.pickup_coord && typeof window.saveLastValidGpsCoord === 'function') {
                const [pLat, pLng] = String(payloadTiketAktif.pickup_coord).split(',').map(Number);
                if (!isNaN(pLat) && !isNaN(pLng)) {
                    window.saveLastValidGpsCoord(pLat, pLng);
                }
            }

            this.aktifkanKoneksiChat();
            this.bukaRuangKomunikasi(true, payloadTiketAktif, sesi);

            if (isOrderAccepted) {
                this._aktifkanModeSesiDiterima(false, statusOrderAktif);
            } else {
                this._pasangPemantauStatusOrder(waktuDibuatOrderAktif);
            }

            if (idTiketAktif) {
                const wAlerts = window.BGN_CONFIG?.wording?.alerts || {};
                const syncRes = await callChatGateway('CHAT_SYNC', {
                    idTiket: idTiketAktif,
                    uidDriver: uidPengemudiTarget,
                    sinceTs: 0,
                    isAccepted: isOrderAccepted
                }).catch(() => null);

                if (syncRes && syncRes.ok && !syncRes.transientError && !syncRes.transientWaiting) {
                    if (syncRes.roomExists === false) {
                        const umurSesiMs = Date.now() - waktuDibuatOrderAktif;
                        const rSt = String(syncRes.radarStatus || '').toUpperCase();
                        if (rSt === 'COMPLETED') {
                            this.tutupSesiDariServer();
                            return;
                        } else if (rSt === 'REJECTED') {
                            this.batalkanSesi(
                                wAlerts.chat_ticket_rejected || "PENGEMUDI BELUM DAPAT MENERIMA PESANAN",
                                { isRejectedByDriver: true, rejectMode: 'REJECTED' }
                            );
                            return;
                        } else if (rSt === 'CANCELLED') {
                            this.batalkanSesi(
                                "Pesanan dibatalkan oleh pengemudi.",
                                { isRejectedByDriver: true, isCancelledByDriver: true, rejectMode: 'CANCELLED_BY_DRIVER' }
                            );
                            return;
                        } else if (umurSesiMs > 25000 && !['WAITING', 'ASSIGNED', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(rSt)) {
                            _consecutiveMissingCount += 1;
                            if (_consecutiveMissingCount >= 4) {
                                const prevSt = String(statusOrderAktif || 'WAITING').toUpperCase();
                                if (prevSt === 'IN_PROGRESS' || prevSt === 'COMPLETED') {
                                    this.tutupSesiDariServer();
                                } else {
                                    this.batalkanSesi(
                                        "Pesanan dibatalkan oleh pengemudi.",
                                        { isRejectedByDriver: true, isCancelledByDriver: true, rejectMode: 'CANCELLED_BY_DRIVER' }
                                    );
                                }
                                return;
                            }
                        }
                    } else {
                        _roomConfirmedExistsOnce = true;
                        const meta = syncRes.metadata || {};
                        if (meta.waktu_dibuat) {
                            waktuDibuatOrderAktif = Number(meta.waktu_dibuat);
                        }
                        const effSt = String(syncRes.effectiveStatus || meta.status || 'WAITING').toUpperCase();
                        if (effSt === 'COMPLETED') {
                            this.tutupSesiDariServer();
                            return;
                        } else if (effSt === 'CANCELLED') {
                            this.batalkanSesi(
                                syncRes.cancelReason || meta.alasan_batal || "Dibatalkan oleh pengemudi",
                                {
                                    isRejectedByDriver: true,
                                    isCancelledByDriver: true,
                                    rejectMode: 'CANCELLED_BY_DRIVER',
                                    cancelledBy: syncRes.cancelledBy || meta.cancelled_by || 'driver',
                                    cancelReason: syncRes.cancelReason || meta.alasan_batal || ''
                                }
                            );
                            return;
                        } else if (effSt === 'REJECTED') {
                            this.batalkanSesi(
                                wAlerts.chat_ticket_rejected || "PENGEMUDI BELUM DAPAT MENERIMA PESANAN",
                                { isRejectedByDriver: true, rejectMode: 'REJECTED' }
                            );
                            return;
                        } else if (effSt === 'IN_PROGRESS' || effSt === 'ARRIVED' || effSt === 'ACCEPTED') {
                            this._aktifkanModeSesiDiterima(false, effSt);
                        } else {
                            this._pasangPemantauStatusOrder(waktuDibuatOrderAktif);
                        }

                        const daftarPesan = Array.isArray(syncRes.messages) ? syncRes.messages : [];
                        daftarPesan.forEach(m => this._prosesPesanDariPoller(m));
                        const sudahAdaKatalog = daftarPesan.some(p => p && p.tipe === 'katalog_order');
                        if (!sudahAdaKatalog && payloadTiketAktif) {
                            const dataKatalog = this._bangunDataKatalogOrder(payloadTiketAktif);
                            if (dataKatalog) {
                                await this.kirimPayloadPesan(JSON.stringify(dataKatalog), "katalog_order");
                                this._simpanStateChatLokal({ katalogTerkirim: true });
                            }
                        }
                    }
                }
            }
        } catch (err) {
        } finally {
            this._sedangMemulihkan = false;
        }
    },

    ajukanTawaran: async function(uidDriver, payloadTiket, pregeneratedTicketId = null) {
        this.resetSebelumOrderBaru();
        this._sedangMenutupSesi = false;
        
        await initFirebaseChat();

        let deviceId = localStorage.getItem('bgt_device_id');
        if (!deviceId) {
            deviceId = 'DEV_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
            localStorage.setItem('bgt_device_id', deviceId);
        }

        const waktuDibuat = Date.now();
        uidPengemudiTarget = uidDriver;
        idTiketAktif = pregeneratedTicketId ? String(pregeneratedTicketId) : `TKT_${waktuDibuat}_${Math.random().toString(36).substring(2, 7)}`;
        payloadTiketAktif = { ...payloadTiket };
        statusOrderAktif = 'WAITING';
        waktuDibuatOrderAktif = waktuDibuat;
        isOrderAccepted = false;
        _lastDeltaSinceTs = 0;
        _roomConfirmedExistsOnce = false;
        _consecutiveMissingCount = 0;
        _lastArrivedAlertTicketId = null;

        if (window.BAGANTARA_DRIVER_CACHE && window.BAGANTARA_DRIVER_CACHE[uidDriver]) {
            window.BAGANTARA_DRIVER_CACHE[uidDriver].isBusy = true;
            window.BAGANTARA_DRIVER_CACHE[uidDriver].busyUntil = waktuDibuat + 1800000;
            window.BAGANTARA_DRIVER_CACHE[uidDriver].activeTicketId = idTiketAktif;
        }
        this._setDriverBusyState(uidDriver, true, idTiketAktif);

        this._simpanStateChatLokal({
            status: 'WAITING',
            waktuDibuat: waktuDibuat,
            katalogTerkirim: false
        });
        
        // Tunda poller sampai CREATE_TICKET selesai menulis ke RTDB agar poller tidak membaca null sebelum tiket tertulis
        _isConnectionPaused = true;
        this.bukaRuangKomunikasi(false, payloadTiketAktif);

        const wAlerts = window.BGN_CONFIG.wording.alerts;
        const wChat = window.BGN_CONFIG.wording.chat_system;

        this._renderKotakTungguKonfirmasi();

        const dataTiketOrder = {
            ...payloadTiketAktif,
            device_id: deviceId,
            waktu_dibuat: waktuDibuat,
            status: 'WAITING'
        };

        const metadataOrder = {
            status: 'WAITING',
            waktu_dibuat: waktuDibuat,
            uid_driver: uidDriver,
            nama_klien: payloadTiketAktif.nama_klien ? payloadTiketAktif.nama_klien : wChat.default_client_name,
            wa_klien: payloadTiketAktif.wa_klien ? payloadTiketAktif.wa_klien : "",
            layanan: payloadTiketAktif.layanan ? payloadTiketAktif.layanan : wChat.default_order_type,
            harga_tawaran: payloadTiketAktif.harga_tawaran,
            harga_dasar: payloadTiketAktif.harga_dasar,
            harga_normal: payloadTiketAktif.harga_normal ? payloadTiketAktif.harga_normal : payloadTiketAktif.harga_dasar,
            diskon_persen: payloadTiketAktif.diskon_persen ? payloadTiketAktif.diskon_persen : 0,
            diskon_source: payloadTiketAktif.diskon_source ? payloadTiketAktif.diskon_source : null,
            promo_teks: payloadTiketAktif.promo_teks ? payloadTiketAktif.promo_teks : '',
            tip_nominal: payloadTiketAktif.tip_nominal
        };

        const inboxEntry = {
            nama_klien: payloadTiketAktif.nama_klien ? payloadTiketAktif.nama_klien : wChat.default_client_name,
            layanan: payloadTiketAktif.layanan ? payloadTiketAktif.layanan : wChat.default_order_type,
            pesan_terakhir: wChat.inbox_initial_preview,
            waktu_dibuat: waktuDibuat,
            waktu_update: waktuDibuat
        };

        const fcmBody = wChat.fcm_new_order_body_template
            .replace('{layanan}', payloadTiketAktif.layanan)
            .replace('{nama}', payloadTiketAktif.nama_klien)
            .replace('{harga}', (payloadTiketAktif.harga_tawaran).toLocaleString('id-ID'));

        try {
            const katalogDataObj = this._bangunDataKatalogOrder(payloadTiketAktif);
            const createRes = await callChatGateway('CREATE_TICKET', {
                uidDriver: uidDriver,
                idTiket: idTiketAktif,
                deviceId: deviceId,
                waktuDibuat: waktuDibuat,
                dataTiketOrder: dataTiketOrder,
                metadataOrder: metadataOrder,
                inboxEntry: inboxEntry,
                katalogOrder: katalogDataObj ? JSON.stringify(katalogDataObj) : null,
                fcmNotification: {
                    type: "NEW_ORDER",
                    layanan: payloadTiketAktif.layanan,
                    harga: payloadTiketAktif.harga_tawaran,
                    tip: payloadTiketAktif.tip_nominal,
                    title: wChat.fcm_new_order_title,
                    body: fcmBody
                }
            }, 10000);

            if (!createRes || !createRes.ok) {
                throw new Error("CREATE_TICKET_FAILED");
            }
            this._activeTicketUsesOverflow = Boolean(createRes.usedOverflow);
            _roomConfirmedExistsOnce = true;
            _consecutiveMissingCount = 0;
            _rtdbEtagCache.clear();
            if (window.BGNSecurityShield && typeof window.BGNSecurityShield.resetEtagCache === 'function') {
                window.BGNSecurityShield.resetEtagCache();
            }

            this._pasangPemantauStatusOrder(waktuDibuat);
            this.aktifkanKoneksiChat();
        } catch (error) {
            this.batalkanSesi(wAlerts.chat_conn_failed);
        }
    },

    batalkanSesi: async function(pesanAlert, options = {}) {
        if (this._sedangMenutupSesi) return;
        this._sedangMenutupSesi = true;

        try {
            const lastDriverName = this._ambilNamaDriverAktif();
            const prevPayloadTiket = payloadTiketAktif;

            if (this.timeoutPesanan) { clearTimeout(this.timeoutPesanan); this.timeoutPesanan = null; }
            if (this.timeoutKatalog) { clearTimeout(this.timeoutKatalog); this.timeoutKatalog = null; }
            if (this.intervalRekamanGlobal) { clearInterval(this.intervalRekamanGlobal); this.intervalRekamanGlobal = null; }
            if (perakamAudio && perakamAudio.state === "recording") { perakamAudio.stop(); }

            this._hentikanPollingStatus();
            this._hentikanAdaptiveDeltaPoller();

            const targetUid = uidPengemudiTarget;
            const targetTiket = idTiketAktif;

            if (targetUid) {
                if (window.BAGANTARA_DRIVER_CACHE && window.BAGANTARA_DRIVER_CACHE[targetUid]) {
                    window.BAGANTARA_DRIVER_CACHE[targetUid].isBusy = false;
                    window.BAGANTARA_DRIVER_CACHE[targetUid].busyUntil = 0;
                    window.BAGANTARA_DRIVER_CACHE[targetUid].activeTicketId = null;
                }
                this._setDriverBusyState(targetUid, false, null);
            }

            idTiketAktif = null;
            uidPengemudiTarget = null;
            payloadTiketAktif = null;
            statusOrderAktif = 'WAITING';
            waktuDibuatOrderAktif = 0;
            isOrderAccepted = false;
            _lastDeltaSinceTs = 0;
            _roomConfirmedExistsOnce = false;
            _lastArrivedAlertTicketId = null;
            localStorage.removeItem('bgt_active_chat');
            try { localStorage.removeItem('bgn_active_chat_session'); } catch (e) {}
            if (typeof window.periksaSesiChatAktif === 'function') window.periksaSesiChatAktif();

            if (this._handleMovePersisten) {
                document.removeEventListener('mousemove', this._handleMovePersisten);
                document.removeEventListener('touchmove', this._handleMovePersisten);
            }
            if (this._handleEndPersisten) {
                document.removeEventListener('mouseup', this._handleEndPersisten);
                document.removeEventListener('touchend', this._handleEndPersisten);
            }

            const isCancelledByDriver = Boolean(options && (options.isCancelledByDriver || options.rejectMode === 'CANCELLED_BY_DRIVER'));
            const isRejectedByDriver = Boolean(options && (options.isRejectedByDriver || isCancelledByDriver));
            const rejectMode = isCancelledByDriver ? 'CANCELLED_BY_DRIVER' : 'REJECTED';

            const savedDropoffSnapshot = {
                dropoffCoord: window.BAGANTARA_DROPOFF_COORD || prevPayloadTiket?.dropoff_coord || null,
                dropoffDetail: window.BAGANTARA_DROPOFF_DETAIL || (prevPayloadTiket?.dropoff_alamat ? { kec: prevPayloadTiket.dropoff_alamat, patokan: prevPayloadTiket.dropoff_patokan || '-' } : null),
                multiDropoffs: Array.isArray(window.BAGANTARA_MULTI_DROPOFFS) && window.BAGANTARA_MULTI_DROPOFFS.length > 0
                    ? window.BAGANTARA_MULTI_DROPOFFS
                    : (Array.isArray(prevPayloadTiket?.multi_dropoffs) ? prevPayloadTiket.multi_dropoffs : []),
                jastipStore: window.BAGANTARA_JASTIP_STORE || prevPayloadTiket?.toko_jastip || null,
                jastipItems: Array.isArray(window.BAGANTARA_JASTIP_ITEMS) && window.BAGANTARA_JASTIP_ITEMS.length > 0
                    ? window.BAGANTARA_JASTIP_ITEMS
                    : (Array.isArray(prevPayloadTiket?.belanjaan) ? prevPayloadTiket.belanjaan : [])
            };

            const panel = document.getElementById('panel-komunikasi-utama');
            if (panel) {
                panel.style.display = 'none';
                panel.remove();
            }
            document.body.classList.remove('chat-room-open');

            if (window.SystemReset) window.SystemReset();

            if (isRejectedByDriver && savedDropoffSnapshot.jastipStore && savedDropoffSnapshot.jastipItems.length > 0) {
                const sLat = parseFloat(savedDropoffSnapshot.jastipStore?.lat);
                const sLng = parseFloat(savedDropoffSnapshot.jastipStore?.lng);
                window.BAGANTARA_SERVICE = 'JASTIP';
                window.BAGANTARA_JASTIP_STORE = savedDropoffSnapshot.jastipStore;
                window.BAGANTARA_JASTIP_ITEMS = savedDropoffSnapshot.jastipItems;
                window.BAGANTARA_JASTIP_VALUE = savedDropoffSnapshot.jastipItems.reduce((acc, it) => acc + ((Number(it.qty) || 1) * (Number(it.price) || 0)), 0);
                if (!isNaN(sLat) && !isNaN(sLng)) {
                    window.BAGANTARA_PICKUP_COORD = `${sLat.toFixed(6)},${sLng.toFixed(6)}`;
                    window.BAGANTARA_PICKUP_DETAIL = {
                        kec: window.BAGANTARA_JASTIP_STORE.name || window.BAGANTARA_JASTIP_STORE.address,
                        patokan: window.BAGANTARA_JASTIP_STORE.notes || '-'
                    };
                }
                if (savedDropoffSnapshot.dropoffCoord) {
                    window.BAGANTARA_DROPOFF_COORD = savedDropoffSnapshot.dropoffCoord;
                    window.BAGANTARA_DROPOFF_DETAIL = savedDropoffSnapshot.dropoffDetail;
                    window.BAGANTARA_MULTI_DROPOFFS = Array.isArray(savedDropoffSnapshot.multiDropoffs) ? savedDropoffSnapshot.multiDropoffs : [];
                    const inpDrop = document.getElementById('inputSearchJastipDropoff');
                    const clearBtn = document.getElementById('btnClearJastipDropoff');
                    if (inpDrop && savedDropoffSnapshot.dropoffDetail?.kec) {
                        inpDrop.value = savedDropoffSnapshot.dropoffDetail.kec;
                        inpDrop.setAttribute('readonly', 'true');
                        inpDrop.style.fontWeight = '700';
                        if (clearBtn) clearBtn.style.display = 'block';
                    }
                }
            }

            this.sinkronisasiLayarChat(false);

            const viewMitra = document.getElementById('view-mitra-map');
            if (viewMitra) viewMitra.scrollTop = 0;

            if (isRejectedByDriver) {
                if (window.UIManager && typeof window.UIManager.loadMitraCatalog === 'function') {
                    window.UIManager.loadMitraCatalog(false, true);
                }
                if (window.UIManager && typeof window.UIManager.showOrderRejectedBanner === 'function') {
                    window.UIManager.showOrderRejectedBanner(lastDriverName, pesanAlert, rejectMode);
                } else if (window.UIManager && typeof window.UIManager.alert === 'function') {
                    window.UIManager.alert(pesanAlert || 'Mohon maaf, driver belum dapat menerima pesanan Anda saat ini.');
                }
            } else {
                if (window.UIManager && typeof window.UIManager.loadMitraCatalog === 'function') {
                    window.UIManager.loadMitraCatalog(false, true);
                }
                if (window.UIManager && pesanAlert) {
                    window.UIManager.alert(pesanAlert);
                }
            }

            if (targetUid && targetTiket && !isCancelledByDriver) {
                await callChatGateway(isRejectedByDriver ? 'CLEANUP' : 'CANCEL_ORDER', {
                    uidDriver: targetUid,
                    idTiket: targetTiket,
                    cancelledByClient: !isRejectedByDriver
                }).catch(() => {});
            }

            this.putuskanKoneksiChat();
        } finally {
            this._sedangMenutupSesi = false;
        }
    },

    bukaRuangKomunikasi: function(isRecovery = false, orderPayload = null, sesiRecovery = null) {
        const panelLama = document.getElementById('panel-komunikasi-utama');
        if (panelLama) panelLama.remove();

        const wChat = window.BGN_CONFIG.wording.chat_system;
        const wAlerts = window.BGN_CONFIG.wording.alerts;
        const wTemplates = window.BGN_CONFIG.wording.templates;
        const chatCtrl = window.BGN_CONFIG.rules_app.chat_controls;
        const mapCfg = window.BGN_CONFIG.settings.map_config;

        if (!document.getElementById('modal-fullscreen-img')) {
            const htmlTambahan = `
                <div id="modal-fullscreen-img" class="hidden-state opacity-0" style="position:fixed; inset:0; background:rgba(0,0,0,0.92); z-index:11000; display:flex; flex-direction:column; align-items:center; justify-content:center; transition:opacity 0.3s;">
                    <div style="position:absolute; top:20px; right:20px; z-index:11010;">
                        <button id="btn-tutup-modal-img" style="background:#ceab6b; color:#0b101a; border:none; width:40px; height:40px; border-radius:50%; font-size:1.2rem; cursor:pointer;"><i class="fa-solid fa-times"></i></button>
                    </div>
                    <img id="fullscreen-img-target" src="" style="max-width:95%; max-height:85vh; object-fit:contain; border-radius:8px; pointer-events:none; -webkit-touch-callout:none; user-select:none;">
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', htmlTambahan);
        }

        const template = document.getElementById('tpl-chat-panel');
        if (!template) return;
        const clone = template.content.cloneNode(true);
        
        const titleEl = clone.querySelector('.tpl-chat-title');
        if (titleEl && idTiketAktif) {
            titleEl.textContent = `${wChat.session_title_prefix} ${idTiketAktif.substring(0, 8)}`;
        }

        const btnWaHeader = clone.querySelector('.tpl-btn-wa-driver');
        const btnKirim = clone.querySelector('.tpl-btn-send');
        const inputTeks = clone.querySelector('.tpl-chat-teks');
        const btnToggle = clone.querySelector('.tpl-btn-toggle');
        const menuAlat = clone.querySelector('.tpl-menu-ekspansi');
        const btnMic = clone.querySelector('.tpl-tool-audio');
        const btnLokasi = clone.querySelector('.tpl-tool-lokasi');
        const btnKamera = clone.querySelector('.tpl-tool-kamera');
        const btnGaleri = clone.querySelector('.tpl-tool-galeri');
        const inpKamera = clone.querySelector('.tpl-input-kamera');
        const inpGaleri = clone.querySelector('.tpl-input-galeri');
        const wadahChat = clone.querySelector('.tpl-chat-body');

        const isMediaAktif = chatCtrl.media_feature_active;
        if (!isMediaAktif) {
            if (btnToggle) btnToggle.style.display = 'none';
            if (btnMic) btnMic.style.display = 'none';
            if (btnKamera) btnKamera.style.display = 'none';
            if (btnGaleri) btnGaleri.style.display = 'none';
        }

        btnToggle.addEventListener('click', () => {
            menuAlat.classList.toggle('show-tools');
            btnToggle.style.transform = menuAlat.classList.contains('show-tools') ? 'rotate(45deg)' : 'rotate(0deg)';
        });

        inputTeks.addEventListener('input', () => {
            if (inputTeks.value.trim() !== '') {
                btnMic.classList.add('hidden-state');
                btnKirim.classList.remove('hidden-state');
            } else {
                btnMic.classList.remove('hidden-state');
                btnKirim.classList.add('hidden-state');
            }
        });

        inputTeks.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && inputTeks.value.trim() !== '') {
                e.preventDefault();
                btnKirim.click();
            }
        });

        btnKirim.addEventListener('click', () => {
            if (inputTeks.value.trim() !== '') {
                this.kirimPayloadPesan(inputTeks.value, "teks");
                inputTeks.value = '';
                btnMic.classList.remove('hidden-state');
                btnKirim.classList.add('hidden-state');
            }
        });

        btnLokasi.addEventListener('click', () => {
            btnLokasi.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition((pos) => {
                    const kordinat = `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
                    this.kirimPayloadPesan(kordinat, "lokasi");
                    btnLokasi.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${wChat.location_btn_label}`;
                    menuAlat.classList.remove('show-tools');
                }, () => {
                    btnLokasi.innerHTML = `<i class="fa-solid fa-location-dot"></i> ${wChat.location_btn_label}`;
                    const txtGps = wAlerts.gps_denied;
                    if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('gps_denied', txtGps);
                    else if (window.UIManager) window.UIManager.alert(txtGps);
                }, { enableHighAccuracy: true });
            }
        });

        btnKamera.addEventListener('click', () => inpKamera.click());
        btnGaleri.addEventListener('click', () => inpGaleri.click());

        const prosesUploadVisual = async (file, asalTangkapan) => {
            menuAlat.classList.remove('show-tools');

            const idLoading = 'load_' + Date.now();
            const templateLoading = document.getElementById('tpl-chat-loading');
            if (templateLoading && wadahChat) {
                const cloneLoad = templateLoading.content.cloneNode(true);
                cloneLoad.querySelector('.msg-bubble').id = idLoading;
                wadahChat.appendChild(cloneLoad);
                wadahChat.scrollTo({ top: wadahChat.scrollHeight, behavior: 'smooth' });
            }

            try {
                const dataForensik = {
                    sumber: asalTangkapan,
                    waktu_unggah: Date.now()
                };

                const maxImgWidth = chatCtrl.image_max_width_px;
                const jpegQuality = chatCtrl.image_jpeg_quality;
                const uploadTimeoutMs = chatCtrl.media_upload_timeout_ms;

                const fileTerkompresi = await new Promise((resolve) => {
                    if (!file.type.startsWith('image/')) return resolve(file);
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            let w = img.width, h = img.height;
                            if (w > maxImgWidth) { h = Math.round(h * maxImgWidth / w); w = maxImgWidth; }
                            canvas.width = w; canvas.height = h;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, w, h);
                            canvas.toBlob((blob) => resolve(blob), 'image/jpeg', jpegQuality);
                        };
                        img.src = e.target.result;
                    };
                    reader.readAsDataURL(file);
                });

                const url = await Promise.race([
                    uploadMediaKeServer(fileTerkompresi, 'image'),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), uploadTimeoutMs))
                ]);

                if (url) {
                    await this.kirimPayloadPesan(url, "gambar", dataForensik);
                    const loadEl = document.getElementById(idLoading);
                    if (loadEl) loadEl.remove();
                } else throw new Error("Gagal URL");

            } catch(e) {
                const loadEl = document.getElementById(idLoading);
                if (loadEl) {
                    loadEl.style.borderColor = "#ef4444"; loadEl.style.color = "#ef4444";
                    const content = loadEl.querySelector('.msg-content');
                    if (content) content.innerHTML = `<i class="fa-solid fa-circle-xmark"></i><span class="tpl-loading-text font-bold tracking-wide" style="margin-left:8px;">${escapeHTML(wChat.upload_failed_msg)}</span>`;
                }
            }
        };

        inpKamera.addEventListener('change', (e) => { if (e.target.files.length > 0) prosesUploadVisual(e.target.files[0], wChat.source_camera); });
        inpGaleri.addEventListener('change', (e) => { if (e.target.files.length > 0) prosesUploadVisual(e.target.files[0], wChat.source_gallery); });

        if (isRecovery && btnWaHeader && window.BAGANTARA_DRIVER && window.BAGANTARA_DRIVER.wa && (isOrderAccepted || ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(sesiRecovery?.status))) {
            btnWaHeader.classList.remove('hidden-state');
            btnWaHeader.addEventListener('click', () => {
                const msgRec = `${wTemplates.wa_driver_recovery} ${idTiketAktif.substring(0, 8)}`;
                window.open(`${mapCfg.whatsapp_base_url}${window.BAGANTARA_DRIVER.wa}?text=${encodeURIComponent(msgRec)}`, '_blank');
            });
        }

        const btnBack = clone.querySelector('.tpl-btn-back');
        if (btnBack) {
            btnBack.addEventListener('click', () => {
                this.minimalkanRuangKomunikasi();
            });
        }

        const uiRecording = clone.querySelector('.tpl-recording-ui');
        const timerText = clone.querySelector('.tpl-record-timer');
        const btnBatalVoice = clone.querySelector('.tpl-btn-cancel-record');
        const btnKirimVoice = clone.querySelector('.tpl-btn-send-record');
        const canvasGelombang = clone.querySelector('.tpl-waveform-canvas');
        const stateActive = clone.querySelector('.tpl-record-state-active');
        const stateLocked = clone.querySelector('.tpl-record-state-locked');
        const hintGeser = clone.querySelector('.tpl-slide-hint');
        const indicatorLock = clone.querySelector('.tpl-lock-indicator');
        const btnPause = clone.querySelector('.tpl-btn-pause-record');

        let waktuRekaman = 0;
        let isDibatalkan = false;
        let isTerkunci = false;
        let isTerjeda = false;
        let konteksAudio = null;
        let idAnimasiCanvas = null;
        let touchStartX = 0;
        let touchStartY = 0;
        let streamGlobal = null;
        let isRekamanAktif = false; 

        function formatTime(sec) {
            const m = Math.floor(sec / 60);
            const s = sec % 60;
            return `${m}:${s < 10 ? '0' : ''}${s}`;
        }

        const mulaiPerekaman = async () => {
            if (isRekamanAktif) return;
            isRekamanAktif = true;

            try {
                streamGlobal = await navigator.mediaDevices.getUserMedia({ audio: true });
                perakamAudio = new MediaRecorder(streamGlobal);
                potonganAudio = [];
                isDibatalkan = false;
                isTerkunci = false;
                isTerjeda = false;
                waktuRekaman = 0;

                if (uiRecording) uiRecording.classList.add('active');
                if (indicatorLock) indicatorLock.classList.add('show');
                if (btnKirimVoice) btnKirimVoice.style.transform = 'scale(0)';
                if (stateActive) stateActive.style.display = 'flex';
                if (stateLocked) stateLocked.style.display = 'none';
                if (hintGeser) hintGeser.style.opacity = '1';
                if (timerText) timerText.innerText = "0:00"; 

                if (canvasGelombang) {
                    canvasGelombang.width = canvasGelombang.offsetWidth ? canvasGelombang.offsetWidth : 150;
                    canvasGelombang.height = canvasGelombang.offsetHeight ? canvasGelombang.offsetHeight : 24;
                    const canvasCtx = canvasGelombang.getContext('2d');
                    
                    const AudioCtx = window.AudioContext ? window.AudioContext : window.webkitAudioContext;
                    konteksAudio = new AudioCtx();
                    const sumberAudio = konteksAudio.createMediaStreamSource(streamGlobal);
                    const analyser = konteksAudio.createAnalyser();
                    
                    analyser.fftSize = 64; 
                    const panjangBuffer = analyser.frequencyBinCount;
                    const dataArray = new Uint8Array(panjangBuffer);
                    sumberAudio.connect(analyser);

                    function gambarGelombang() {
                        if (!isTerjeda) analyser.getByteFrequencyData(dataArray);
                        canvasCtx.clearRect(0, 0, canvasGelombang.width, canvasGelombang.height);
                        const barWidth = 3; const gap = 2;
                        const barCount = Math.floor(canvasGelombang.width / (barWidth + gap));
                        let x = 0;

                        for (let i = 0; i < barCount; i++) {
                            const tinggiBar = (dataArray[i] / 255) * canvasGelombang.height;
                            const tinggiMinimal = Math.max(tinggiBar, 2); 
                            const y = (canvasGelombang.height / 2) - (tinggiMinimal / 2); 
                            
                            canvasCtx.fillStyle = '#10b981'; 
                            canvasCtx.beginPath();
                            if (canvasCtx.roundRect) canvasCtx.roundRect(x, y, barWidth, tinggiMinimal, 2);
                            else canvasCtx.fillRect(x, y, barWidth, tinggiMinimal);
                            canvasCtx.fill();
                            x += barWidth + gap;
                        }
                        idAnimasiCanvas = requestAnimationFrame(gambarGelombang);
                    }
                    gambarGelombang();
                }

                perakamAudio.ondataavailable = e => { if (e.data.size > 0) potonganAudio.push(e.data); };
                
                perakamAudio.onstop = async () => {
                    isRekamanAktif = false;
                    if (streamGlobal) streamGlobal.getTracks().forEach(track => track.stop());
                    
                    if (window.ChatHandshake.intervalRekamanGlobal) clearInterval(window.ChatHandshake.intervalRekamanGlobal);
                    if (idAnimasiCanvas) cancelAnimationFrame(idAnimasiCanvas);
                    if (konteksAudio && konteksAudio.state !== 'closed') konteksAudio.close();
                    
                    if (uiRecording) uiRecording.classList.remove('active');
                    if (indicatorLock) indicatorLock.classList.remove('show');
                    btnMic.style.transform = 'scale(1)';

                    if (isDibatalkan) {
                        return;
                    }

                    const idLoading = 'load_audio_' + Date.now();
                    const templateLoading = document.getElementById('tpl-chat-loading');
                    if (templateLoading && wadahChat) {
                        const cloneLoad = templateLoading.content.cloneNode(true);
                        cloneLoad.querySelector('.msg-bubble').id = idLoading;
                        wadahChat.appendChild(cloneLoad);
                        wadahChat.scrollTo({ top: wadahChat.scrollHeight, behavior: 'smooth' });
                    }

                    const blobAudio = new Blob(potonganAudio, { type: 'audio/webm' });
                    const uploadTimeoutMs = chatCtrl.media_upload_timeout_ms;
                    try {
                        const url = await Promise.race([
                            uploadMediaKeServer(blobAudio, 'audio'),
                            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), uploadTimeoutMs))
                        ]);
                        if (url) {
                            await window.ChatHandshake.kirimPayloadPesan(url, "audio");
                            const loadEl = document.getElementById(idLoading);
                            if (loadEl) loadEl.remove();
                        } else throw new Error("Gagal URL");
                    } catch(e) {
                        const loadEl = document.getElementById(idLoading);
                        if (loadEl) {
                            loadEl.style.borderColor = "#ef4444"; loadEl.style.color = "#ef4444";
                            const content = loadEl.querySelector('.msg-content');
                            if (content) content.innerHTML = `<i class="fa-solid fa-circle-xmark"></i><span class="tpl-loading-text font-bold tracking-wide" style="margin-left:8px;">${escapeHTML(wChat.send_failed_msg)}</span>`;
                        }
                    }
                };

                perakamAudio.start();

                const maxVoiceSec = chatCtrl.voice_max_duration_sec;
                window.ChatHandshake.intervalRekamanGlobal = setInterval(() => {
                    waktuRekaman++;
                    if (timerText) timerText.innerText = formatTime(waktuRekaman);
                    if (waktuRekaman >= maxVoiceSec && perakamAudio && (perakamAudio.state === "recording" || perakamAudio.state === "paused")) perakamAudio.stop();
                }, 1000);

            } catch (e) {
                isRekamanAktif = false;
                const txtMic = wAlerts.mic_denied;
                if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('mic_denied', txtMic);
                else if (window.UIManager) window.UIManager.alert(txtMic);
            }
        };

        const handleStart = (e) => {
            e.preventDefault(); 
            const sentuh = e.touches ? e.touches[0] : e;
            touchStartX = sentuh.clientX;
            touchStartY = sentuh.clientY;
            btnMic.style.transform = 'scale(1.2)'; 
            mulaiPerekaman();
        };

        const handleMove = (e) => {
            if (!isRekamanAktif || isTerkunci) return;
            const sentuh = e.touches ? e.touches[0] : e;
            const deltaX = sentuh.clientX - touchStartX;
            const deltaY = sentuh.clientY - touchStartY;
            const lockDeltaY = chatCtrl.voice_lock_delta_y_px;
            const cancelDeltaX = chatCtrl.voice_cancel_delta_x_px;

            if (deltaY < lockDeltaY) {
                isTerkunci = true;
                if (indicatorLock) indicatorLock.classList.remove('show');
                if (hintGeser) hintGeser.style.opacity = '0';
                if (stateActive) stateActive.style.display = 'none';
                if (stateLocked) stateLocked.style.display = 'flex';
                if (btnKirimVoice) btnKirimVoice.style.transform = 'scale(1)'; 
                btnMic.style.transform = 'scale(1)'; 
                return;
            }

            if (deltaX < cancelDeltaX) {
                isDibatalkan = true;
                if (perakamAudio && perakamAudio.state === "recording") perakamAudio.stop();
                return;
            }

            if (deltaX < 0 && deltaX > cancelDeltaX && hintGeser) {
                hintGeser.style.opacity = 1 - (Math.abs(deltaX) / Math.abs(cancelDeltaX));
            }
        };

        const handleEnd = () => {
            btnMic.style.transform = 'scale(1)';
            if (!isRekamanAktif) return;
            if (!isTerkunci) {
                if (perakamAudio && perakamAudio.state === "recording") perakamAudio.stop();
            }
        };

        btnMic.addEventListener('mousedown', handleStart);
        btnMic.addEventListener('touchstart', handleStart, { passive: false });
        
        if (window.ChatHandshake._handleMovePersisten) {
            document.removeEventListener('mousemove', window.ChatHandshake._handleMovePersisten);
            document.removeEventListener('touchmove', window.ChatHandshake._handleMovePersisten);
        }
        if (window.ChatHandshake._handleEndPersisten) {
            document.removeEventListener('mouseup', window.ChatHandshake._handleEndPersisten);
            document.removeEventListener('touchend', window.ChatHandshake._handleEndPersisten);
        }

        window.ChatHandshake._handleMovePersisten = handleMove;
        window.ChatHandshake._handleEndPersisten = handleEnd;
        
        document.addEventListener('mousemove', window.ChatHandshake._handleMovePersisten);
        document.addEventListener('touchmove', window.ChatHandshake._handleMovePersisten, { passive: false });
        
        document.addEventListener('mouseup', window.ChatHandshake._handleEndPersisten);
        document.addEventListener('touchend', window.ChatHandshake._handleEndPersisten);

        if (btnBatalVoice) {
            btnBatalVoice.addEventListener('click', (e) => {
                e.preventDefault();
                isDibatalkan = true;
                if (perakamAudio && (perakamAudio.state === "recording" || perakamAudio.state === "paused")) perakamAudio.stop();
            });
        }

        if (btnKirimVoice) {
            btnKirimVoice.addEventListener('click', (e) => {
                e.preventDefault();
                if (perakamAudio && (perakamAudio.state === "recording" || perakamAudio.state === "paused")) perakamAudio.stop();
            });
        }
        
        if (btnPause) {
            btnPause.addEventListener('click', (e) => {
                e.preventDefault();
                if (!perakamAudio) return;
                const maxVoiceSec = chatCtrl.voice_max_duration_sec;
                
                if (perakamAudio.state === "recording") {
                    isTerjeda = true;
                    perakamAudio.pause();
                    btnPause.innerHTML = `<i class="fa-solid fa-microphone"></i> ${escapeHTML(wChat.voice_resume_label)}`;
                    if (window.ChatHandshake.intervalRekamanGlobal) clearInterval(window.ChatHandshake.intervalRekamanGlobal);
                } else if (perakamAudio.state === "paused") {
                    isTerjeda = false;
                    perakamAudio.resume();
                    btnPause.innerHTML = `<i class="fa-solid fa-pause"></i> ${escapeHTML(wChat.voice_pause_label)}`;
                    window.ChatHandshake.intervalRekamanGlobal = setInterval(() => {
                        waktuRekaman++;
                        if (timerText) timerText.innerText = formatTime(waktuRekaman);
                        if (waktuRekaman >= maxVoiceSec && perakamAudio.state === "recording") perakamAudio.stop();
                    }, 1000);
                }
            });
        }

        wadahChat.addEventListener('click', (e) => {
            const triggerImg = e.target.closest('.image-fullscreen-trigger');
            if (triggerImg) this.bukaLayarPenuhGambar(triggerImg.getAttribute('data-img'));
        });

        document.body.appendChild(clone);

        const panelBaru = document.getElementById('panel-komunikasi-utama');
        if (panelBaru) {
            panelBaru.style.display = 'flex';
        }

        this._ikatTombolQrisHeader();
        this._sinkronkanVisualTahapanOrder(statusOrderAktif, false);
        this.sinkronisasiLayarChat(true);
        
        const btnTutupImg = document.getElementById('btn-tutup-modal-img');
        const modalImg = document.getElementById('modal-fullscreen-img');
        if (btnTutupImg && !btnTutupImg.dataset.boundClose) {
            btnTutupImg.dataset.boundClose = 'true';
            btnTutupImg.addEventListener('click', () => this.tutupLayarPenuhGambar());
        }
        if (modalImg && !modalImg.dataset.boundBackdrop) {
            modalImg.dataset.boundBackdrop = 'true';
            modalImg.addEventListener('click', (e) => { if (e.target.id === 'modal-fullscreen-img') this.tutupLayarPenuhGambar(); });
        }

        this.mulaiDengarPesan(isRecovery);

        if (!isRecovery) {
            const lockedOrder = orderPayload ? orderPayload : (payloadTiketAktif ? payloadTiketAktif : window.BAGANTARA_LAST_ORDER_PAYLOAD);
            const dataKatalogAwal = this._bangunDataKatalogOrder(lockedOrder);
            if (dataKatalogAwal && idTiketAktif) {
                this._prosesPesanDariPoller({
                    id: 'MSG_INIT',
                    pengirim: 'klien',
                    tipe: 'katalog_order',
                    konten: JSON.stringify(dataKatalogAwal),
                    waktu: waktuDibuatOrderAktif || Date.now(),
                    status: 'sent'
                });
                this._simpanStateChatLokal({ katalogTerkirim: true });
            } 
        } 
    },

    kirimPayloadPesan: async function(kontenPesan, tipePesan = "teks", metadataForensik = null) {
        if (!idTiketAktif || !kontenPesan) return;
        this.aktifkanKoneksiChat();
        const wChat = window.BGN_CONFIG.wording.chat_system;
        const waktuKirim = Date.now();

        let preview = tipePesan === 'teks'
            ? kontenPesan
            : (tipePesan === 'lokasi'
                ? wChat.preview_location
                : (tipePesan === 'audio'
                    ? wChat.preview_audio
                    : (tipePesan === 'katalog_order'
                        ? wChat.preview_catalog
                        : wChat.preview_image)));

        const now = Date.now();
        let triggerFcm = false;
        if (tipePesan !== 'katalog_order' && (now - lastChatFcmTimestamp >= 10000)) {
            lastChatFcmTimestamp = now;
            triggerFcm = true;
        }
        const namaKlien = payloadTiketAktif?.nama_klien || "Penumpang";

        const sendRes = await callChatGateway('SEND_MSG', {
            idTiket: idTiketAktif,
            uidDriver: uidPengemudiTarget || '',
            usedOverflow: Boolean(this._activeTicketUsesOverflow),
            tipe: tipePesan,
            konten: kontenPesan,
            waktu: waktuKirim,
            forensik: metadataForensik || null,
            preview: preview,
            triggerFcm: triggerFcm,
            layanan: payloadTiketAktif?.layanan || "CHAT",
            fcmTitle: `💬 Pesan dari ${namaKlien}`,
            fcmBody: String(preview).substring(0, 120)
        }, 10000).catch(() => null);

        const msgId = sendRes?.msgId || `local_${waktuKirim}_${Math.random().toString(36).substring(2, 6)}`;
        this._prosesPesanDariPoller({
            id: msgId,
            pengirim: 'klien',
            tipe: tipePesan,
            konten: kontenPesan,
            waktu: waktuKirim,
            status: 'sent',
            forensik: metadataForensik || null
        });
    },

    _prosesPesanDariPoller: function(pesan) {
        const wadahChat = document.querySelector('.tpl-chat-body');
        const idUnik = pesan?.id;
        if (!wadahChat || !pesan || !idUnik) return;
        if (document.getElementById(idUnik)) return;
        if (pesan.pengirim === 'klien') {
            const existingLocal = wadahChat.querySelector(`[data-client-ts="${pesan.waktu}"]`);
            if (existingLocal) {
                existingLocal.id = idUnik;
                return;
            }
        }

        const wAlerts = window.BGN_CONFIG.wording.alerts;
        const wChat = window.BGN_CONFIG.wording.chat_system;
        const currencyCode = window.BGN_CONFIG.tariffs.currency;
        const gmapsSearchUrl = window.BGN_CONFIG.settings.map_config.google_maps_search_url;

        if (pesan.tipe === 'sistem_ping') {
            return;
        }

        if (pesan.tipe === 'sistem_tolak') {
            if (this.timeoutPesanan) { clearTimeout(this.timeoutPesanan); this.timeoutPesanan = null; }
            this._hentikanPollingStatus();
            const uiTunggu = document.getElementById('ui-tunggu-acc');
            if (uiTunggu) uiTunggu.remove();

            const msgTolak = wAlerts.chat_driver_unavailable;
            this.batalkanSesi(msgTolak, { isRejectedByDriver: true, rejectMode: 'REJECTED' });
            return;
        }

        const isPesanBaruPascaBuka = !_isRecoveryModeAktif || (pesan.waktu && Number(pesan.waktu) >= (_waktuMulaiDengarSesi - 1500));
        const teksPesanLower = String(pesan.konten || '').toLowerCase();
        const isCancelMsg = teksPesanLower.includes('terpaksa membatalkan pesanan ini');

        if ((pesan.pengirim === 'driver' || pesan.pengirim === 'mitra') && !isCancelMsg) {
            if (isPesanBaruPascaBuka) {
                this.mainkanSuara();
                const panel = document.getElementById('panel-komunikasi-utama');
                const isMinimized = !panel || panel.style.display === 'none';
                const indikatorKedip = document.getElementById('chat-notif-dot-global');
                if (indikatorKedip && isMinimized) {
                    indikatorKedip.classList.remove('hidden-state');
                }
            }
            if (teksPesanLower.includes('sampai di lokasi penjemputan')) {
                this._aktifkanModeSesiDiterima(false, 'ARRIVED');
            } else if (teksPesanLower.includes('penjemputan berhasil') || teksPesanLower.includes('mengantar menuju lokasi tujuan')) {
                this._aktifkanModeSesiDiterima(false, 'IN_PROGRESS');
            } else {
                this._aktifkanModeSesiDiterima(false);
            }
        }

        const posisiKelas = pesan.pengirim === 'klien' ? 'msg-mitra' : 'msg-klien';
        let htmlKonten = '';

        if (pesan.tipe === 'teks') {
            const teksBersih = bersihkanIstilahPesanMasuk(pesan.konten);
            htmlKonten = `<p>${escapeHTML(teksBersih)}</p>`;
        } else if (pesan.tipe === 'katalog_order') {
            try {
                const k = JSON.parse(pesan.konten);
                const warnaLayanan = k.layanan === 'RIDE' ? '#3b82f6' : (k.layanan === 'EXPRESS' ? '#f59e0b' : '#10b981');
                const isJastip = k.layanan === 'JASTIP' && Array.isArray(k.belanjaan) && k.belanjaan.length > 0;
                
                let htmlJastip = '';
                let rincianBelanjaTotal = 0;
                
                if (isJastip) {
                    k.belanjaan.forEach(item => { rincianBelanjaTotal += ((Number(item.qty) ? Number(item.qty) : 0) * (Number(item.price) ? Number(item.price) : 0)); });
                    const formatBelanja = new Intl.NumberFormat('id-ID', { style: 'currency', currency: currencyCode, minimumFractionDigits: 0 }).format(rincianBelanjaTotal);
                    const listBelanjaHtml = k.belanjaan.map(i => `<li><b>${escapeHTML(i.qty)}x</b> ${escapeHTML(i.name)} (@ Rp${escapeHTML(i.price)})</li>`).join('');
                    
                    htmlJastip = `<div style="border-top:1px dashed rgba(255,255,255,0.2); margin:8px 0; padding-top:8px;">
                        <span style="font-size:0.6rem; color:#94a3b8; display:block; margin-bottom:4px; font-weight:bold;">${escapeHTML(wChat.catalog_shopping_header)}</span>
                        <ul style="margin:0 0 6px 0; padding-left:14px; font-size:0.75rem; color:#f8fafc; list-style-type:square;">
                            ${listBelanjaHtml}
                        </ul>
                        <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); padding: 4px 8px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-size:0.65rem; color:#10b981; font-weight:bold;">${escapeHTML(wChat.catalog_shopping_total)}</span>
                            <span style="font-size:0.85rem; color:#10b981; font-weight:900; font-family:monospace;">${escapeHTML(formatBelanja)}</span>
                        </div>
                    </div>`;
                }

                let htmlCatatan = '';
                if (k.catatan && String(k.catatan).trim() !== '') {
                    htmlCatatan = `<div style="background:rgba(255,255,255,0.05); border-left:3px solid #94a3b8; padding:8px; border-radius:4px; margin-top:8px;">
                        <span style="font-size:0.65rem; color:#94a3b8; font-weight:bold; display:block; margin-bottom:2px;"><i class="fa-solid fa-comment-dots"></i> ${escapeHTML(wChat.catalog_driver_note)}</span>
                        <span style="font-size:0.75rem; color:#f8fafc; font-style:italic;">"${escapeHTML(k.catatan)}"</span>
                    </div>`;
                }

                let htmlBadgeDiskon = '';
                const diskonNum = Number(k.diskon_persen);
                if (!isNaN(diskonNum) && diskonNum > 0) {
                    htmlBadgeDiskon = `<div style="margin-top:4px; display:inline-block; background:rgba(16, 185, 129, 0.16); border:1px solid #10b981; color:#10b981; font-size:0.6rem; font-weight:bold; padding:2px 8px; border-radius:12px;">
                        <i class="fa-solid fa-tags"></i> Diskon ${escapeHTML(diskonNum)}%${k.promo_teks ? ' • ' + escapeHTML(k.promo_teks) : ''}
                    </div>`;
                }

                let htmlBadgeTip = '';
                const tipNum = Number(k.tip_nominal);
                if (!isNaN(tipNum) && tipNum > 0) {
                    const formatTip = new Intl.NumberFormat('id-ID', { style: 'currency', currency: currencyCode, minimumFractionDigits: 0 }).format(tipNum);
                    htmlBadgeTip = `<div style="margin-top:4px; display:inline-block; background:rgba(212, 175, 55, 0.15); border:1px solid #ceab6b; color:#ceab6b; font-size:0.6rem; font-weight:bold; padding:2px 8px; border-radius:12px;">
                        <i class="fa-solid fa-bolt"></i> ${escapeHTML(wChat.catalog_tip_prefix)} ${escapeHTML(formatTip)}
                    </div>`;
                }
                
                const estimasiOngkirMurni = Number(k.harga) ? Number(k.harga) : 0;
                const formatOngkir = new Intl.NumberFormat('id-ID', { style: 'currency', currency: currencyCode, minimumFractionDigits: 0 }).format(estimasiOngkirMurni);
                const labelHargaBawah = isJastip ? wChat.catalog_shipping_label : wChat.catalog_total_tariff_label;

                htmlKonten = `
                    <div style="background:#0f1624; border:1px solid ${warnaLayanan}; border-radius:12px; padding:12px; width:min(255px, 76vw); display:flex; flex-direction:column; gap:6px; box-shadow:0 8px 20px rgba(0,0,0,0.4);">
                        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">
                            <span style="font-size:0.65rem; color:${warnaLayanan}; font-weight:900; letter-spacing:1px;"><i class="fa-solid fa-receipt mr-1"></i> ${escapeHTML(wChat.catalog_order_prefix)} ${escapeHTML(k.layanan)}</span>
                            <span style="font-size:0.65rem; color:#94a3b8; font-family:monospace;">${escapeHTML(k.jarak)} KM</span>
                        </div>
                        <div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">
                            <div style="display:flex; gap:6px;">
                                <i class="fa-solid fa-circle-up" style="color:#10b981; font-size:0.7rem; margin-top:3px;"></i>
                                <span style="font-size:0.75rem; color:#f8fafc; line-height:1.3;"><b>${escapeHTML(wChat.catalog_pickup_label)}</b><br>${escapeHTML(k.jemput)}</span>
                            </div>
                            <div style="width:2px; height:10px; background:rgba(255,255,255,0.2); margin-left:4px;"></div>
                            <div style="display:flex; gap:6px;">
                                <i class="fa-solid fa-location-dot" style="color:#ef4444; font-size:0.7rem; margin-top:3px;"></i>
                                <span style="font-size:0.75rem; color:#f8fafc; line-height:1.3;"><b>${escapeHTML(wChat.catalog_dropoff_label)}</b><br>${escapeHTML(k.tujuan)}</span>
                            </div>
                        </div>
                        ${htmlJastip}
                        ${htmlCatatan}
                        <div style="background:rgba(212,175,55,0.1); border:1px dashed #ceab6b; border-radius:6px; padding:8px; text-align:center; margin-top:6px;">
                            <span style="font-size:0.6rem; color:#ceab6b; display:block; font-weight:bold;">${escapeHTML(labelHargaBawah)}</span>
                            <span style="font-size:1.2rem; color:#ceab6b; font-weight:900; font-family:monospace;">${escapeHTML(formatOngkir)}</span>
                            <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
                                ${htmlBadgeDiskon}
                                ${htmlBadgeTip}
                            </div>
                        </div>
                    </div>
                `;
            } catch(e) { htmlKonten = `<p><i>${escapeHTML(wChat.catalog_error_fallback)}</i></p>`; }
        } else if (pesan.tipe === 'lokasi') {
            const parts = String(pesan.konten).split(',');
            const nLat = parseFloat(parts[0]);
            const nLng = parseFloat(parts[1]);
            const safeLat = !isNaN(nLat) ? nLat : 0;
            const safeLng = !isNaN(nLng) ? nLng : 0;
            
            htmlKonten = `
                <div style="background:#0f1624; border:1px solid #ceab6b; border-radius:12px; padding:12px; width:220px; display:flex; flex-direction:column; gap:10px; box-shadow:0 4px 15px rgba(0,0,0,0.3);">
                    <div style="display:flex; align-items:center; gap:10px; border-bottom:1px solid rgba(206,171,107,0.2); padding-bottom:8px;">
                        <div style="width:36px; height:36px; border-radius:50%; background:rgba(206,171,107,0.1); display:flex; justify-content:center; align-items:center; color:#ceab6b; font-size:1.1rem; flex-shrink:0;">
                            <i class="fa-solid fa-map-pin"></i>
                        </div>
                        <div style="display:flex; flex-direction:column; overflow:hidden;">
                            <span style="font-size:0.75rem; color:#ceab6b; font-weight:bold;">${escapeHTML(wChat.location_card_title)}</span>
                            <span style="font-size:0.6rem; color:#94a3b8; font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Lat: ${safeLat.toFixed(5)}</span>
                            <span style="font-size:0.6rem; color:#94a3b8; font-family:monospace; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Lng: ${safeLng.toFixed(5)}</span>
                        </div>
                    </div>
                    <a href="${gmapsSearchUrl}${safeLat},${safeLng}" target="_blank" rel="noopener noreferrer" style="background:#ceab6b; color:#0b101a; padding:10px; border-radius:8px; text-align:center; font-size:0.8rem; font-weight:bold; text-decoration:none; display:flex; justify-content:center; align-items:center; gap:6px;">
                        <i class="fa-solid fa-diamond-turn-right"></i> ${escapeHTML(wChat.location_open_maps)}
                    </a>
                </div>
            `;
        } else if (pesan.tipe === 'audio') {
            const safeAudioUrl = sanitizeMediaUrl(pesan.konten);
            htmlKonten = `<audio controls src="${safeAudioUrl}" style="height:32px; width:180px;"></audio>`;
        } else if (pesan.tipe === 'gambar') {
            const safeImgUrl = sanitizeMediaUrl(pesan.konten);
            htmlKonten = `
            <div class="media-container" style="position:relative; width:200px;">
                <div class="image-wrapper image-fullscreen-trigger" data-img="${safeImgUrl}" style="position:relative; border-radius:6px; overflow:hidden; cursor:pointer; height: 260px;">
                    <img src="${safeImgUrl}" loading="lazy" style="width:100%; height:100%; object-fit:cover; display:block; pointer-events:none; -webkit-touch-callout:none; user-select:none;">
                </div>
            </div>`;
        }

        const waktuFormat = new Date(pesan.waktu || Date.now()).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'});
        let statusIkon = '';
        if (pesan.pengirim === 'klien') {
            statusIkon = pesan.status === 'read' 
                ? `<i class="fa-solid fa-check-double" style="color: #3b82f6; font-size: 0.65rem;"></i>` 
                : `<i class="fa-solid fa-check" style="color: #9ca3af; font-size: 0.65rem;"></i>`;
        }

        const extraCardClass = (pesan.tipe === "katalog_order" || pesan.tipe === "lokasi" || pesan.tipe === "gambar") ? " msg-katalog-card" : "";
        const htmlElemen = `<div id="${escapeHTML(idUnik)}" data-client-ts="${escapeHTML(pesan.waktu || 0)}" data-msg-time-str="${escapeHTML(waktuFormat)}" class="msg-bubble ${posisiKelas}${extraCardClass}"><div class="msg-content">${htmlKonten}</div><span class="msg-time" style="display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 2px;">${escapeHTML(waktuFormat)}${statusIkon}</span></div>`;
        
        const elTunggu = document.getElementById('ui-tunggu-acc');
        if (elTunggu && elTunggu.parentNode === wadahChat) {
            elTunggu.insertAdjacentHTML('beforebegin', htmlElemen);
        } else {
            wadahChat.insertAdjacentHTML('beforeend', htmlElemen);
        }
        
        clearTimeout(wadahChat.scrollTimer);
        wadahChat.scrollTimer = setTimeout(() => wadahChat.scrollTo({ top: wadahChat.scrollHeight, behavior: 'smooth' }), 150);
    },

    mulaiDengarPesan: function(isRecovery = false) {
        _waktuMulaiDengarSesi = Date.now();
        _isRecoveryModeAktif = Boolean(isRecovery);
        _lastDeltaSinceTs = 0;
        this._mulaiAdaptiveDeltaPoller();
    },

    mainkanSuara: function() {
        try {
            if (window.BGNSettings && window.BGNSettings.sound === false) {
                return;
            }
            if (!this._audioCtx) {
                const AudioCtx = window.AudioContext ? window.AudioContext : window.webkitAudioContext;
                this._audioCtx = new AudioCtx();
            }
            if (this._audioCtx.state === 'suspended') {
                this._audioCtx.resume().catch(() => {});
            }
            const synth = function(audioCtx) {
                const t = audioCtx.currentTime;
                for (let i = 0; i < 2; i++) {
                    const start = t + (i * 2);
                    [1500, 2000].forEach((freq, idx) => {
                        const o = audioCtx.createOscillator();
                        const g = audioCtx.createGain();
                        o.type = 'sine';
                        o.frequency.value = freq;
                        const d = start + (idx * 0.15);
                        g.gain.setValueAtTime(0, d);
                        g.gain.linearRampToValueAtTime(0.7, d + 0.05);
                        g.gain.exponentialRampToValueAtTime(0.001, d + 1.5);
                        o.connect(g);
                        g.connect(audioCtx.destination);
                        o.start(d);
                        o.stop(d + 1.5);
                    });
                }
            };
            synth(this._audioCtx);
        } catch (e) {}
    },

    akhiriSesiObrolan: async function() {
        if (this._sedangMenutupSesi) return;
        this._sedangMenutupSesi = true;

        try {
            if (this.timeoutPesanan) { clearTimeout(this.timeoutPesanan); this.timeoutPesanan = null; }
            if (this.timeoutKatalog) { clearTimeout(this.timeoutKatalog); this.timeoutKatalog = null; }
            if (this.intervalRekamanGlobal) { clearInterval(this.intervalRekamanGlobal); this.intervalRekamanGlobal = null; }
            if (perakamAudio && perakamAudio.state === "recording") { perakamAudio.stop(); }

            this._hentikanPollingStatus();
            this._hentikanAdaptiveDeltaPoller();

            const targetUid = uidPengemudiTarget;
            const targetTiket = idTiketAktif;

            if (targetUid) {
                this._setDriverBusyState(targetUid, false, null);
            }

            idTiketAktif = null;
            uidPengemudiTarget = null;
            payloadTiketAktif = null;
            statusOrderAktif = 'WAITING';
            waktuDibuatOrderAktif = 0;
            isOrderAccepted = false;
            _lastDeltaSinceTs = 0;
            _roomConfirmedExistsOnce = false;
            _lastArrivedAlertTicketId = null;
            localStorage.removeItem('bgt_active_chat');
            try { localStorage.removeItem('bgn_active_chat_session'); } catch (e) {}
            if (typeof window.periksaSesiChatAktif === 'function') window.periksaSesiChatAktif();

            if (this._handleMovePersisten) {
                document.removeEventListener('mousemove', this._handleMovePersisten);
                document.removeEventListener('touchmove', this._handleMovePersisten);
            }
            if (this._handleEndPersisten) {
                document.removeEventListener('mouseup', this._handleEndPersisten);
                document.removeEventListener('touchend', this._handleEndPersisten);
            }

            const panel = document.getElementById('panel-komunikasi-utama');
            if (panel) {
                panel.style.display = 'none';
                panel.remove();
            }
            document.body.classList.remove('chat-room-open');

            if (window.SystemReset) window.SystemReset();
            this.sinkronisasiLayarChat(false);

            if (targetTiket) {
                await callChatGateway('CLEANUP', {
                    uidDriver: targetUid || '',
                    idTiket: targetTiket
                }).catch(() => {});
            }

            this.putuskanKoneksiChat();
        } finally {
            this._sedangMenutupSesi = false;
        }
    },

    tutupSesiDariServer: function(pesanAlert = '') {
        if (this._sedangMenutupSesi) return;
        this._sedangMenutupSesi = true;

        try {
            const lastDriverName = this._ambilNamaDriverAktif();

            if (this.timeoutPesanan) { clearTimeout(this.timeoutPesanan); this.timeoutPesanan = null; }
            if (this.timeoutKatalog) { clearTimeout(this.timeoutKatalog); this.timeoutKatalog = null; }
            if (this.intervalRekamanGlobal) { clearInterval(this.intervalRekamanGlobal); this.intervalRekamanGlobal = null; }
            if (perakamAudio && perakamAudio.state === "recording") { perakamAudio.stop(); }

            this._hentikanPollingStatus();
            this._hentikanAdaptiveDeltaPoller();

            if (uidPengemudiTarget) {
                this._setDriverBusyState(uidPengemudiTarget, false, null);
            }
            if (uidPengemudiTarget && idTiketAktif) {
                callChatGateway('UPDATE_STATUS', {
                    uidDriver: uidPengemudiTarget,
                    idTiket: idTiketAktif,
                    deleteTicketOnly: true
                }).catch(() => {});
            }
            
            localStorage.removeItem('bgt_active_chat');
            try { localStorage.removeItem('bgn_active_chat_session'); } catch (e) {}
            if (typeof window.periksaSesiChatAktif === 'function') window.periksaSesiChatAktif();
            
            if (this._handleMovePersisten) {
                document.removeEventListener('mousemove', this._handleMovePersisten);
                document.removeEventListener('touchmove', this._handleMovePersisten);
            }
            if (this._handleEndPersisten) {
                document.removeEventListener('mouseup', this._handleEndPersisten);
                document.removeEventListener('touchend', this._handleEndPersisten);
            }
            
            idTiketAktif = null;
            uidPengemudiTarget = null;
            payloadTiketAktif = null;
            statusOrderAktif = 'WAITING';
            waktuDibuatOrderAktif = 0;
            isOrderAccepted = false;
            _lastDeltaSinceTs = 0;
            _roomConfirmedExistsOnce = false;
            _lastArrivedAlertTicketId = null;

            const panel = document.getElementById('panel-komunikasi-utama');
            if (panel) {
                panel.style.display = 'none';
                panel.remove();
            }
            document.body.classList.remove('chat-room-open');

            this.putuskanKoneksiChat();
            if (window.SystemReset) window.SystemReset();
            this.sinkronisasiLayarChat(false);

            const viewMitra = document.getElementById('view-mitra-map');
            if (viewMitra) viewMitra.scrollTop = 0;

            if (window.UIManager && typeof window.UIManager.loadMitraCatalog === 'function') {
                window.UIManager.loadMitraCatalog(false, true);
            }

            const pesanResmiSelesai = `PESANAN SELESAI — Terima kasih telah menggunakan layanan BAGANTARA bersama Pengemudi ${lastDriverName}.`;
            if (window.UIManager && typeof window.UIManager.alert === 'function') {
                window.UIManager.alert(pesanResmiSelesai, 'PESANAN SELESAI');
            }
        } finally {
            this._sedangMenutupSesi = false;
        }
    },

    bukaLayarPenuhGambar: function(urlGambar) {
        const modal = document.getElementById('modal-fullscreen-img');
        const targetImg = document.getElementById('fullscreen-img-target');
        if (modal && targetImg) {
            targetImg.src = urlGambar;
            modal.classList.remove('hidden-state');
            if (typeof window.armBgtHistoryGuard === 'function') window.armBgtHistoryGuard('fullscreen-img');
            requestAnimationFrame(() => modal.classList.remove('opacity-0'));
        }
    },

    tutupLayarPenuhGambar: function() {
        const modal = document.getElementById('modal-fullscreen-img');
        if (modal) {
            modal.classList.add('opacity-0');
            setTimeout(() => { modal.classList.add('hidden-state'); document.getElementById('fullscreen-img-target').src = ''; }, 300);
        }
    }
};

const jalankanPemulihanAwalChat = () => {
    if (window.ChatHandshake) window.ChatHandshake.pulihkanSesiAktif();
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', jalankanPemulihanAwalChat, { once: true });
} else {
    jalankanPemulihanAwalChat();
}

document.addEventListener("visibilitychange", () => {
    const idleMs = window.BGN_CONFIG?.rules_app?.chat_controls?.idle_disconnect_timeout_ms;
    if (document.visibilityState === 'hidden') {
        if (idleMs && !localStorage.getItem('bgt_active_chat') && !localStorage.getItem('bgn_active_chat_session')) {
            timerPemutusKoneksi = setTimeout(() => {
                if (window.ChatHandshake) window.ChatHandshake.putuskanKoneksiChat();
            }, idleMs);
        }
    } else {
        clearTimeout(timerPemutusKoneksi);
        if (idTiketAktif || localStorage.getItem('bgt_active_chat')) {
            if (window.ChatHandshake) {
                window.ChatHandshake.aktifkanKoneksiChat();
            }
            const panel = document.getElementById('panel-komunikasi-utama');
            if (panel && panel.style.display !== 'none') {
                if (window.ChatHandshake) {
                    window.ChatHandshake.sinkronisasiLayarChat(true);
                }
            } else if (window.periksaSesiChatAktif) {
                window.periksaSesiChatAktif();
            }
        }
    }
});
