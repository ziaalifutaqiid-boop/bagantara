// ==========================================================================
// FILE: js/core/security-shield.js (APLIKASI PUBLIK V13.2 - PURE 3-NODE & ZERO-SOCKET)
// FUNGSI: 1. Memori ETag (X-Firebase-ETag: true & If-None-Match) untuk HTTP REST GET RTDB (304 = 0 Byte)
//         2. Eksekusi Langsung (Direct Client-to-RTDB HTTP REST fetch) ke 3 Node Firebase Murni:
//            - Node 1 (bagantara-core): Katalog & Presensi Driver Aktif (3-PUT Lock isBusy / busyUntil / activeTicketId)
//            - Node 2 (futaqi-ali): Audit Log, Device Reputation, & Failover/Overflow
//            - Node 3 (chatting-88040): Transaksi Order, Radar Tiket, Sesi Komunikasi & Chat Real-Time
//         3. Trigger Push Notification FCM (NEW_ORDER, CHAT_MESSAGE, SONAR_PING) ke Code-GAS-Unified-V8.gs
//            menggunakan Content-Type: text/plain;charset=utf-8 (Bebas Preflight CORS & 0 Vercel Function)
// ==========================================================================

window.BGNSecurityShield = {
    _version: '13.2',
    _sessionSeed: Math.random().toString(36).substring(2, 10),
    _xorMaskSalt: 'BGN13_GW_XOR_MASK_7731',
    _etagVault: new Map(),

    // NODE 1 (bagantara-core): Katalog & Presensi Driver Aktif
    getNode1Url: function() {
        return (
            (window.BagantaraCluster && typeof window.BagantaraCluster.getUrl === 'function' && window.BagantaraCluster.getUrl('node1_core')) ||
            window.BGN_CONFIG?.settings?.cluster_config?.node1_core ||
            'https://bagantara-core-default-rtdb.asia-southeast1.firebasedatabase.app'
        ).replace(/\/+$/, '');
    },

    // NODE 2 (futaqi-ali): Audit Log, Device Reputation, & Failover/Overflow
    getNode2Url: function() {
        return (
            (window.BagantaraCluster && typeof window.BagantaraCluster.getOverflowUrl === 'function' && window.BagantaraCluster.getOverflowUrl()) ||
            window.BGN_CONFIG?.settings?.cluster_config?.node2_overflow ||
            window.BGN_CONFIG?.settings?.cluster_config?.node2_history ||
            window.BGN_CONFIG?.settings?.firebase_overflow?.databaseURL ||
            'https://futaqi-ali-default-rtdb.asia-southeast1.firebasedatabase.app'
        ).replace(/\/+$/, '');
    },

    // NODE 3 (chatting-88040): Transaksi Order, Radar Tiket, Sesi Komunikasi & Chat Real-Time
    getNode3Url: function() {
        return (
            (window.BagantaraCluster && typeof window.BagantaraCluster.getUrl === 'function' && window.BagantaraCluster.getUrl('node3_chat')) ||
            window.BGN_CONFIG?.settings?.cluster_config?.node3_chat ||
            window.BGN_CONFIG?.settings?.cluster_config?.node3_radar ||
            window.BGN_CONFIG?.settings?.firebase_chat?.databaseURL ||
            'https://chatting-88040-default-rtdb.asia-southeast1.firebasedatabase.app'
        ).replace(/\/+$/, '');
    },

    getGasUrl: function() {
        return (
            (window.BagantaraCluster && typeof window.BagantaraCluster.getGasUrl === 'function' && window.BagantaraCluster.getGasUrl()) ||
            window.BGN_CONFIG?.settings?.micro_backend?.gas_fcm_url ||
            'https://script.google.com/macros/s/AKfycbxkSFTmerLbUa5iEWEqyjUz9OVBo8xTznm90HJMKDRBQ9t-x8UxjUHas_K1JqqMgHzneg/exec'
        );
    },

    getDeviceId: function() {
        try {
            let devId = localStorage.getItem('bgt_device_id');
            if (!devId) {
                devId = 'DEV_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
                localStorage.setItem('bgt_device_id', devId);
            }
            return devId;
        } catch (e) {
            return 'DEV_GUEST_' + this._sessionSeed;
        }
    },

    getClientToken: function() {
        try {
            const devId = this.getDeviceId();
            const bucket = Math.floor(Date.now() / 60000);
            const raw = `${devId}|${bucket}|${this._version}`;
            let hash = 0x811c9dc5;
            for (let i = 0; i < raw.length; i++) {
                hash ^= raw.charCodeAt(i);
                hash = Math.imul(hash, 0x01000193);
            }
            const sig = (hash >>> 0).toString(16).padStart(8, '0');
            return `bgn13_${sig}_${bucket}`;
        } catch (e) {
            return 'bgn13_client';
        }
    },

    generateNonce: function() {
        const rand = Math.random().toString(36).substring(2, 10);
        const tsHex = (Date.now() & 0xffffffff >>> 0).toString(16);
        return `n13_${tsHex}_${rand}`;
    },

    resetEtagCache: function(prefixStr = '') {
        if (!prefixStr) {
            this._etagVault.clear();
            return;
        }
        for (const k of this._etagVault.keys()) {
            if (k.includes(prefixStr)) {
                this._etagVault.delete(k);
            }
        }
    },

    /**
     * HTTP GET ke RTDB dengan memori ETag (X-Firebase-ETag: true & If-None-Match)
     * Mengembalikan cached.data ketika server merespons 304 Not Modified (0 byte bandwidth)
     */
    rtdbGet: async function(fullUrl, options = {}) {
        const timeoutMs = parseInt(options.timeoutMs, 10) || 5500;
        const useEtag = options.useEtag !== false;
        const cached = (useEtag && fullUrl.includes('.firebasedatabase.app'))
            ? this._etagVault.get(fullUrl)
            : null;

        const headers = { 'Accept': 'application/json' };
        if (useEtag && fullUrl.includes('.firebasedatabase.app')) {
            headers['X-Firebase-ETag'] = 'true';
            if (cached && cached.etag) {
                headers['If-None-Match'] = cached.etag;
            }
        }

        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), timeoutMs);
        if (options.signal) {
            options.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
        }

        try {
            let res = await fetch(fullUrl, {
                method: 'GET',
                headers: headers,
                signal: ctrl.signal,
                cache: 'no-store'
            });

            // TUGAS 3.2: Perbaikan rtdbGet Anti-Error 400 ETag
            if (res.status === 400 && useEtag && fullUrl.includes('.firebasedatabase.app')) {
                this._etagVault.delete(fullUrl);
                res = await fetch(fullUrl, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                    signal: ctrl.signal,
                    cache: 'no-store'
                });
            }
            clearTimeout(tid);

            if (res.status === 304 && cached) {
                return {
                    ok: true,
                    notModified: true,
                    status: 304,
                    etag: cached.etag,
                    data: cached.data
                };
            }

            if (!res.ok) {
                return {
                    ok: false,
                    notModified: false,
                    status: res.status,
                    etag: null,
                    data: null
                };
            }

            const newEtag = res.headers.get('ETag') || res.headers.get('etag') || null;
            const txt = await res.text();
            const parsed = (txt && txt.trim() !== '' && txt.trim() !== 'null') ? JSON.parse(txt) : null;

            if (newEtag && fullUrl.includes('.firebasedatabase.app')) {
                this._etagVault.set(fullUrl, { etag: newEtag, data: parsed, ts: Date.now() });
            }

            return {
                ok: true,
                notModified: false,
                status: res.status,
                etag: newEtag,
                data: parsed
            };
        } catch (err) {
            clearTimeout(tid);
            return {
                ok: false,
                notModified: false,
                status: 0,
                etag: cached ? cached.etag : null,
                data: cached ? cached.data : null,
                error: err
            };
        }
    },

    /**
     * HTTP Mutasi ke RTDB (PUT, PATCH, POST, DELETE) + invalidasi cache ETag terkait
     */
    rtdbMutate: async function(fullUrl, method = 'PUT', payload = null, timeoutMs = 6000) {
        const upperMethod = String(method || 'PUT').toUpperCase();
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), timeoutMs);

        try {
            const fetchOpts = {
                method: upperMethod,
                headers: { 'Content-Type': 'application/json' },
                signal: ctrl.signal,
                cache: 'no-store'
            };
            if (upperMethod !== 'DELETE') {
                fetchOpts.body = JSON.stringify(payload !== undefined ? payload : null);
            }

            const res = await fetch(fullUrl, fetchOpts);
            clearTimeout(tid);

            const baseNoJson = fullUrl.split('.json')[0];
            if (baseNoJson) {
                const parentSeg = baseNoJson.split('/').slice(0, 5).join('/');
                this.resetEtagCache(parentSeg);
            }

            const txt = await res.text().catch(() => '');
            const parsed = (txt && txt.trim() !== '' && txt.trim() !== 'null') ? JSON.parse(txt) : null;
            return { ok: res.ok, status: res.status, data: parsed };
        } catch (err) {
            clearTimeout(tid);
            return { ok: false, status: 0, data: null, error: err };
        }
    },

    /**
     * Kunci / Bebaskan status sibuk driver di Node 1 (bagantara-core) dan Failover Node 2 (futaqi-ali)
     * menggunakan 3 panggilan paralel HTTP PUT ke child yang memiliki .write: true
     */
    lockDriverBusyNode1: async function(uidDriver, isBusy, idTiket = null, timeoutMs = 5000) {
        if (!uidDriver) return false;
        const uidEnc = encodeURIComponent(String(uidDriver).trim());
        const busyVal = Boolean(isBusy);
        const busyUntilVal = busyVal ? (Date.now() + 1800000) : 0;
        const activeTicketVal = busyVal && idTiket ? String(idTiket).trim() : null;

        const node1Url = this.getNode1Url();
        const node2OverflowUrl = this.getNode2Url();

        const results = await Promise.allSettled([
            this.rtdbMutate(`${node1Url}/drivers/${uidEnc}/status/isBusy.json`, 'PUT', busyVal, timeoutMs),
            this.rtdbMutate(`${node1Url}/drivers/${uidEnc}/status/busyUntil.json`, 'PUT', busyUntilVal, timeoutMs),
            this.rtdbMutate(`${node1Url}/drivers/${uidEnc}/status/activeTicketId.json`, 'PUT', activeTicketVal, timeoutMs)
        ]);

        const allNode1Ok = results.every(r => r.status === 'fulfilled' && r.value && r.value.ok);
        if (!allNode1Ok) {
            await Promise.allSettled([
                this.rtdbMutate(`${node2OverflowUrl}/drivers/${uidEnc}/status/isBusy.json`, 'PUT', busyVal, timeoutMs),
                this.rtdbMutate(`${node2OverflowUrl}/drivers/${uidEnc}/status/busyUntil.json`, 'PUT', busyUntilVal, timeoutMs),
                this.rtdbMutate(`${node2OverflowUrl}/drivers/${uidEnc}/status/activeTicketId.json`, 'PUT', activeTicketVal, timeoutMs)
            ]);
        }
        return true;
    },

    /**
     * Panggil URL Google Apps Script (BagantaraCluster.getGasUrl()) via HTTP POST
     * dengan Content-Type: text/plain;charset=utf-8 (Bebas Preflight CORS)
     */
    triggerGasPushNotification: function(fcmPayload) {
        const gasUrl = this.getGasUrl();
        if (!gasUrl || !fcmPayload) return Promise.resolve({ ok: false });
        return fetch(gasUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(fcmPayload),
            cache: 'no-store'
        }).then(async (r) => {
            const j = await r.json().catch(() => ({ ok: r.ok }));
            return { ok: r.ok, status: r.status, data: j };
        }).catch(() => ({ ok: false }));
    },

    /**
     * Bangun struktur katalog struk order (MSG_INIT) dari data order
     */
    _buildDefaultCatalogJson: function(orderObj = {}, metaObj = {}) {
        const layanan = String(orderObj.layanan || metaObj.layanan || 'RIDE').toUpperCase();
        const hargaDasar = Math.max(5000, parseInt(orderObj.harga_dasar ?? metaObj.harga_dasar, 10) || 6000);
        const tipNominal = Math.max(0, parseInt(orderObj.tip_nominal ?? metaObj.tip_nominal, 10) || 0);
        const hargaTotal = Math.max(hargaDasar, parseInt(orderObj.harga_tawaran ?? metaObj.harga_tawaran, 10) || (hargaDasar + tipNominal));

        const multiList = Array.isArray(orderObj.multi_dropoffs) ? orderObj.multi_dropoffs.filter(Boolean) : [];
        let waypointsStr = '';
        if (multiList.length > 1) {
            waypointsStr = multiList.slice(0, -1)
                .map(p => `${parseFloat(p.lat).toFixed(6)},${parseFloat(p.lng).toFixed(6)}`)
                .join('|');
        }

        const pickupAlamat = orderObj.pickup_alamat || 'Titik Jemput Peta';
        const pickupPatokan = (orderObj.pickup_patokan && orderObj.pickup_patokan !== '-') ? ` (${orderObj.pickup_patokan})` : '';
        const dropoffAlamat = orderObj.dropoff_alamat || 'Titik Tujuan Peta';
        const dropoffPatokan = (orderObj.dropoff_patokan && orderObj.dropoff_patokan !== '-') ? ` (${orderObj.dropoff_patokan})` : '';

        return JSON.stringify({
            layanan: layanan,
            harga: hargaTotal,
            harga_dasar: hargaDasar,
            harga_normal: parseInt(orderObj.harga_normal, 10) || hargaDasar,
            diskon_persen: parseFloat(orderObj.diskon_persen) || 0,
            diskon_source: orderObj.diskon_source || null,
            promo_teks: orderObj.promo_teks || '',
            tip_nominal: tipNominal,
            catatan: orderObj.catatan_tambahan || '',
            jarak: orderObj.jarak_km || 0,
            jemput: `${pickupAlamat}${pickupPatokan}`,
            tujuan: `${dropoffAlamat}${dropoffPatokan}`,
            pickup_coord: orderObj.pickup_coord || '',
            dropoff_coord: orderObj.dropoff_coord || '',
            waypoints: waypointsStr,
            toko_jastip: orderObj.toko_jastip || null,
            belanjaan: layanan === 'JASTIP' ? (Array.isArray(orderObj.belanjaan) ? orderObj.belanjaan : []) : null,
            wa_klien: orderObj.wa_klien || metaObj.wa_klien || ''
        });
    },

    /**
     * Eksekusi 100% Lokal & Langsung (Direct Client-to-RTDB HTTP REST fetch + ETag + GAS Push)
     * 3 Node Murni:
     *   - node1Url (bagantara-core): Katalog & Presensi Driver Aktif
     *   - node2Url (futaqi-ali): Audit Log, Device Reputation, & Failover/Overflow
     *   - node3Url (chatting-88040): Transaksi Order, Radar Tiket, Sesi Komunikasi & Chat Real-Time
     */
    callGateway: async function(payloadObj = {}, options = {}) {
        const timeoutMs = parseInt(options.timeoutMs, 10) || 8000;
        const action = String(payloadObj.action || '').toUpperCase();
        const subAction = String(payloadObj.subAction || payloadObj.mode || '').toUpperCase();

        const node1Url = this.getNode1Url();
        const node2Url = this.getNode2Url();
        const node3Url = this.getNode3Url();

        // 1. PEMBACAAN KATALOG DRIVER (GET /drivers.json dari Node 1 dengan fallback Node 2 Overflow)
        if (action === 'SCAN_CATALOG' || action === 'GET_DRIVERS') {
            const [resNode1, resNode2] = await Promise.all([
                this.rtdbGet(`${node1Url}/drivers.json`, { timeoutMs: Math.min(timeoutMs, 5500), useEtag: true }),
                this.rtdbGet(`${node2Url}/drivers.json`, { timeoutMs: Math.min(timeoutMs, 4500), useEtag: true })
            ]);
            const node1Drivers = (resNode1.ok && resNode1.data && typeof resNode1.data === 'object') ? resNode1.data : null;
            const node2Drivers = (resNode2.ok && resNode2.data && typeof resNode2.data === 'object') ? resNode2.data : null;
            return {
                ok: Boolean(node1Drivers || node2Drivers),
                node1Drivers: node1Drivers || {},
                node2Drivers: node2Drivers || {},
                node3Drivers: node2Drivers || {},
                driversMap: { ...(node2Drivers || {}), ...(node1Drivers || {}) }
            };
        }

        // 2. PEMBUATAN ORDER / INISIALISASI TIKET (CREATE_ORDER / CREATE_TICKET)
        if (action === 'CREATE_ORDER' || subAction === 'CREATE_TICKET') {
            this.resetEtagCache();
            const now = Date.now();
            const uidDriver = String(payloadObj.uidDriver || payloadObj.uid_driver || '').trim();
            const idTiket = String(payloadObj.idTiket || payloadObj.id_tiket || `TKT_${now}_${Math.random().toString(36).substring(2, 7)}`).trim();
            const deviceId = String(payloadObj.deviceId || payloadObj.device_id || this.getDeviceId()).trim().replace(/[.#$\[\]\/]/g, '_').substring(0, 64);
            const waktuDibuat = Number(payloadObj.waktuDibuat || payloadObj.dataTiketOrder?.waktu_dibuat || now);

            if (!uidDriver || !idTiket) {
                return { ok: false, error: 'MISSING_DRIVER_OR_TICKET' };
            }

            const rawOrder = payloadObj.dataTiketOrder || payloadObj.orderData || payloadObj;
            const rawMeta = payloadObj.metadataOrder || {};
            const rawInbox = payloadObj.inboxEntry || {};

            const layanan = String(rawOrder.layanan || rawMeta.layanan || 'RIDE').toUpperCase().substring(0, 20);
            const hargaDasar = Math.max(5000, parseInt(rawOrder.harga_dasar ?? rawMeta.harga_dasar, 10) || 6000);
            const tipNominal = Math.max(0, parseInt(rawOrder.tip_nominal ?? rawMeta.tip_nominal, 10) || 0);
            const hargaTawaran = Math.min(10000000, Math.max(hargaDasar, parseInt(rawOrder.harga_tawaran ?? rawMeta.harga_tawaran, 10) || (hargaDasar + tipNominal)));
            const namaKlien = String(rawOrder.nama_klien || rawMeta.nama_klien || rawInbox.nama_klien || 'Penumpang').substring(0, 80);
            const waKlien = String(rawOrder.wa_klien ?? rawMeta.wa_klien ?? '').substring(0, 25);
            const initialStatus = String(rawOrder.status || rawMeta.status || 'WAITING').toUpperCase();

            const ticketObj = {
                ...rawOrder,
                device_id: deviceId,
                waktu_dibuat: waktuDibuat,
                layanan: layanan,
                harga_dasar: hargaDasar,
                harga_tawaran: hargaTawaran,
                tip_nominal: tipNominal,
                nama_klien: namaKlien,
                wa_klien: waKlien,
                pickup_coord: String(rawOrder.pickup_coord || ''),
                dropoff_coord: String(rawOrder.dropoff_coord || ''),
                pickup_alamat: String(rawOrder.pickup_alamat || ''),
                dropoff_alamat: String(rawOrder.dropoff_alamat || ''),
                status: initialStatus
            };

            const metaObj = {
                ...rawMeta,
                status: initialStatus,
                waktu_dibuat: waktuDibuat,
                uid_driver: uidDriver,
                nama_klien: namaKlien,
                wa_klien: waKlien,
                layanan: layanan,
                harga_dasar: hargaDasar,
                harga_tawaran: hargaTawaran,
                harga_normal: parseInt(rawOrder.harga_normal ?? rawMeta.harga_normal, 10) || hargaDasar,
                diskon_persen: parseFloat(rawOrder.diskon_persen ?? rawMeta.diskon_persen) || 0,
                diskon_source: rawOrder.diskon_source ?? rawMeta.diskon_source ?? null,
                promo_teks: String(rawOrder.promo_teks ?? rawMeta.promo_teks ?? ''),
                tip_nominal: tipNominal
            };

            const catalogContentStr = payloadObj.katalogOrder
                ? (typeof payloadObj.katalogOrder === 'string' ? payloadObj.katalogOrder : JSON.stringify(payloadObj.katalogOrder))
                : this._buildDefaultCatalogJson(ticketObj, metaObj);

            const msgInitObj = {
                pengirim: 'klien',
                tipe: 'katalog_order',
                konten: catalogContentStr.substring(0, 4950),
                waktu: waktuDibuat,
                status: 'sent'
            };

            const inboxObj = {
                nama_klien: namaKlien.substring(0, 60),
                layanan: layanan,
                pesan_terakhir: String(rawInbox.pesan_terakhir || 'Rincian pesanan masuk...').substring(0, 300),
                waktu_dibuat: waktuDibuat,
                waktu_update: waktuDibuat
            };

            const uidEnc = encodeURIComponent(uidDriver);
            const tktEnc = encodeURIComponent(idTiket);
            const devEnc = encodeURIComponent(deviceId);

            // 2a. Tulis langsung via HTTP PUT ke Node 3 (chatting-88040)
            let usedOverflow = false;
            const [rRadar, rMeta] = await Promise.all([
                this.rtdbMutate(`${node3Url}/radar_tiket/${uidEnc}/${tktEnc}.json`, 'PUT', ticketObj, timeoutMs),
                this.rtdbMutate(`${node3Url}/sesi_komunikasi/${tktEnc}/metadata_order.json`, 'PUT', metaObj, timeoutMs),
                this.rtdbMutate(`${node3Url}/sesi_komunikasi/${tktEnc}/pesan/MSG_INIT.json`, 'PUT', msgInitObj, timeoutMs),
                this.rtdbMutate(`${node3Url}/inbox_mitra/${uidEnc}/${tktEnc}.json`, 'PUT', inboxObj, timeoutMs),
                this.rtdbMutate(`${node3Url}/inbox_driver/${uidEnc}/${tktEnc}.json`, 'PUT', inboxObj, timeoutMs)
            ]);

            if (!rRadar.ok || !rMeta.ok) {
                usedOverflow = true;
                const [ovRadar, ovMeta] = await Promise.all([
                    this.rtdbMutate(`${node2Url}/radar_tiket/${uidEnc}/${tktEnc}.json`, 'PUT', ticketObj, timeoutMs),
                    this.rtdbMutate(`${node2Url}/sesi_komunikasi/${tktEnc}/metadata_order.json`, 'PUT', metaObj, timeoutMs),
                    this.rtdbMutate(`${node2Url}/sesi_komunikasi/${tktEnc}/pesan/MSG_INIT.json`, 'PUT', msgInitObj, timeoutMs),
                    this.rtdbMutate(`${node2Url}/inbox_mitra/${uidEnc}/${tktEnc}.json`, 'PUT', inboxObj, timeoutMs),
                    this.rtdbMutate(`${node2Url}/inbox_driver/${uidEnc}/${tktEnc}.json`, 'PUT', inboxObj, timeoutMs)
                ]);
                if (!ovRadar.ok && !ovMeta.ok) {
                    return { ok: false, error: 'RTDB_WRITE_FAILED' };
                }
            }

            // 2b. Kunci status sibuk driver di Node 1 (bagantara-core)
            await this.lockDriverBusyNode1(uidDriver, true, idTiket, 5000);

            // 2c. Tulis log ke Node 2 (futaqi-ali): PUT /order_audit_log/{idTiket}.json dan PUT /device_reputation/{deviceId}.json
            const countPrev = parseInt(localStorage.getItem('bgt_order_count') || '0', 10) + 1;
            try { localStorage.setItem('bgt_order_count', String(countPrev)); } catch (e) {}
            const hasVerifiedWa = Boolean(waKlien && waKlien.length >= 10);
            const localSig = (window.__BGN_SEAL__ && typeof window.__BGN_SEAL__.getSignature === 'function' ? window.__BGN_SEAL__.getSignature() : '') || window.BAGANTARA_FARE_SIGNATURE || '';

            const auditPayload = {
                id_tiket: idTiket,
                layanan: layanan,
                waktu_dibuat: waktuDibuat,
                device_id: deviceId,
                harga_dasar: hargaDasar,
                harga_tawaran: hargaTawaran,
                estimasi_belanja: Number(ticketObj.estimasi_belanja || 0),
                jarak_km: Number(ticketObj.jarak_km || 0),
                has_verified_wa: hasVerifiedWa,
                signature: String(localSig)
            };
            const repPayload = {
                last_order_at: waktuDibuat,
                total_orders: countPrev,
                last_service: layanan,
                has_verified_wa: hasVerifiedWa
            };

            Promise.allSettled([
                this.rtdbMutate(`${node2Url}/order_audit_log/${tktEnc}.json`, 'PUT', auditPayload, 5000),
                this.rtdbMutate(`${node2Url}/device_reputation/${devEnc}.json`, 'PUT', repPayload, 5000)
            ]).catch(() => {});

            // 2d. Panggil URL Google Apps Script (BagantaraCluster.getGasUrl()) via HTTP POST (text/plain;charset=utf-8)
            const fcmNotif = payloadObj.fcmNotification || {};
            this.triggerGasPushNotification({
                uidDriver: uidDriver,
                idTiket: idTiket,
                type: 'NEW_ORDER',
                layanan: layanan,
                harga: hargaTawaran,
                tip: tipNominal,
                nama_klien: namaKlien,
                jemput: ticketObj.pickup_alamat,
                tujuan: ticketObj.dropoff_alamat,
                pickup_coord: ticketObj.pickup_coord,
                dropoff_coord: ticketObj.dropoff_coord,
                jarak: String(ticketObj.jarak_km || '0'),
                title: fcmNotif.title || 'Pesanan Baru Masuk!',
                body: fcmNotif.body || `Layanan ${layanan} dari ${namaKlien} (Rp${hargaTawaran.toLocaleString('id-ID')})`,
                skipBusyLock: true
            });

            return {
                ok: true,
                idTiket: idTiket,
                uidDriver: uidDriver,
                usedOverflow: usedOverflow,
                status: initialStatus,
                msgInit: { id: 'MSG_INIT', ...msgInitObj }
            };
        }

        // 3. PANTAU STATUS ORDER & BACA PESAN (CHAT_SYNC / POLL_STATE / POLL_CHAT_ROOM / SYNC_CHAT_STATE)
        if (
            action === 'CHAT_SYNC' || subAction === 'CHAT_SYNC' ||
            action === 'POLL_STATE' || subAction === 'POLL_STATE' ||
            action === 'POLL_CHAT_ROOM' || subAction === 'POLL_CHAT_ROOM' ||
            action === 'SYNC_CHAT_STATE' || subAction === 'SYNC_CHAT_STATE'
        ) {
            const idTiket = String(payloadObj.idTiket || '').trim();
            const uidDriver = String(payloadObj.uidDriver || '').trim();
            const sinceTs = Number(payloadObj.sinceTs || 0);
            const useOv = Boolean(payloadObj.usedOverflow);
            const baseUrl = useOv ? node2Url : node3Url;

            if (!idTiket) return { ok: false };
            const tktEnc = encodeURIComponent(idTiket);
            const uidEnc = uidDriver ? encodeURIComponent(uidDriver) : '';

            const matchTktTs = idTiket.match(/^TKT_(\d{10,15})_/);
            const ticketCreatedAt = Number(payloadObj.waktuDibuat || payloadObj.ticketCreatedAt || (matchTktTs ? matchTktTs[1] : 0) || 0);
            const ticketAgeMs = ticketCreatedAt > 0 ? Math.max(0, Date.now() - ticketCreatedAt) : 999999;

            const [cRes, rRes] = await Promise.all([
                this.rtdbGet(`${baseUrl}/sesi_komunikasi/${tktEnc}.json`, { timeoutMs, useEtag: true }),
                uidEnc ? this.rtdbGet(`${baseUrl}/radar_tiket/${uidEnc}/${tktEnc}/status.json`, { timeoutMs, useEtag: true }) : Promise.resolve({ ok: true, status: 200, data: null })
            ]);

            // TUGAS 3.2 (1): Jika request mengalami gangguan jaringan (!cRes.ok atau cRes.status === 0)
            if (!cRes.ok || cRes.status === 0) {
                if (!useOv) {
                    const [ovResErr, ovRadarErr] = await Promise.all([
                        this.rtdbGet(`${node2Url}/sesi_komunikasi/${tktEnc}.json`, { timeoutMs: 4500, useEtag: true }),
                        uidEnc ? this.rtdbGet(`${node2Url}/radar_tiket/${uidEnc}/${tktEnc}/status.json`, { timeoutMs: 4000, useEtag: true }) : Promise.resolve({ ok: true, status: 200, data: null })
                    ]);
                    if (!ovResErr.ok || ovResErr.status === 0 || !ovResErr.data || typeof ovResErr.data !== 'object') {
                        return { ok: false, transientError: true };
                    }
                    cRes.ok = true;
                    cRes.status = ovResErr.status || 200;
                    cRes.data = ovResErr.data;
                    if (!rRes.data && typeof ovRadarErr.data === 'string') {
                        rRes.data = ovRadarErr.data;
                    }
                } else {
                    return { ok: false, transientError: true };
                }
            }

            let roomData = cRes.data;
            let radarStatus = typeof rRes.data === 'string' ? rRes.data : null;
            let finalHttpStatus = cRes.status || 200;

            // Fallback ke Node 2 (futaqi-ali) jika belum ditemukan di Node 3 (chatting-88040)
            if ((!roomData || typeof roomData !== 'object') && !useOv) {
                const [ovRes, ovRadarRes] = await Promise.all([
                    this.rtdbGet(`${node2Url}/sesi_komunikasi/${tktEnc}.json`, { timeoutMs: 4500, useEtag: true }),
                    uidEnc && !radarStatus ? this.rtdbGet(`${node2Url}/radar_tiket/${uidEnc}/${tktEnc}/status.json`, { timeoutMs: 4000, useEtag: true }) : Promise.resolve({ ok: true, status: 200, data: null })
                ]);
                if (ovRes.ok && ovRes.data && typeof ovRes.data === 'object') {
                    roomData = ovRes.data;
                    finalHttpStatus = ovRes.status || 200;
                }
                if (!radarStatus && typeof ovRadarRes.data === 'string') {
                    radarStatus = ovRadarRes.data;
                }
            }

            if (!roomData || typeof roomData !== 'object') {
                const rStMissing = radarStatus ? String(radarStatus).toUpperCase() : null;
                // TUGAS 3.2 (2): Grace Period 25 detik pertama sejak dibuat
                if (ticketAgeMs < 25000 && rStMissing !== 'REJECTED' && rStMissing !== 'CANCELLED') {
                    return {
                        ok: true,
                        roomExists: true,
                        status: 'WAITING',
                        effectiveStatus: 'WAITING',
                        transientWaiting: true,
                        messages: [],
                        readClientMsgIds: []
                    };
                }
                return {
                    ok: true,
                    httpStatus: finalHttpStatus === 304 ? 200 : finalHttpStatus,
                    roomExists: false,
                    radarStatus: rStMissing,
                    messages: [],
                    readClientMsgIds: []
                };
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

            // Evaluasi presisi metadata_order.status (E) dan radarStatus (N) tanpa menyatukan semua pembatalan:
            const E = String(metadata.status || '').toUpperCase();
            const N = radarStatus ? String(radarStatus).toUpperCase() : null;
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
            } else if (E === 'ACCEPTED' || N === 'ACCEPTED' || hasMitra) {
                effectiveStatus = 'ACCEPTED';
            } else {
                effectiveStatus = 'WAITING';
            }

            const resultPayload = {
                ok: true,
                roomExists: true,
                metadata,
                effectiveStatus,
                radarStatus: N,
                messages,
                readClientMsgIds
            };

            if (effectiveStatus === 'CANCELLED') {
                resultPayload.cancelledBy = metadata.cancelled_by || 'driver';
                resultPayload.cancelReason = metadata.alasan_batal || '';
            }

            return resultPayload;
        }

        // 4. KIRIM PESAN PELANGGAN (SEND_MSG: teks, lokasi, audio, gambar)
        if (action === 'SEND_MSG' || subAction === 'SEND_MSG') {
            const idTiket = String(payloadObj.idTiket || '').trim();
            const uidDriver = String(payloadObj.uidDriver || '').trim();
            const w = Number(payloadObj.waktu || Date.now());
            const baseUrl = payloadObj.usedOverflow ? node2Url : node3Url;

            if (!idTiket) return { ok: false };
            const tktEnc = encodeURIComponent(idTiket);
            const uidEnc = uidDriver ? encodeURIComponent(uidDriver) : '';

            const tipePesan = String(payloadObj.tipe || 'teks');
            const msgId = tipePesan === 'katalog_order'
                ? 'MSG_INIT'
                : `msg_${w}_${Math.random().toString(36).substring(2, 7)}`;
            const kontenAman = String(payloadObj.konten || '').substring(0, 4950);
            const msgObj = {
                pengirim: 'klien',
                tipe: tipePesan,
                konten: kontenAman,
                waktu: w,
                status: 'sent',
                ...(payloadObj.forensik ? { forensik: payloadObj.forensik } : {})
            };
            const inboxPatch = {
                pesan_terakhir: String(payloadObj.preview || kontenAman).substring(0, 290),
                waktu_update: w
            };

            const putRes = await this.rtdbMutate(`${baseUrl}/sesi_komunikasi/${tktEnc}/pesan/${encodeURIComponent(msgId)}.json`, 'PUT', msgObj, timeoutMs);
            if (!putRes.ok && !payloadObj.usedOverflow) {
                await this.rtdbMutate(`${node2Url}/sesi_komunikasi/${tktEnc}/pesan/${encodeURIComponent(msgId)}.json`, 'PUT', msgObj, timeoutMs);
            }

            if (uidEnc) {
                await Promise.allSettled([
                    this.rtdbMutate(`${baseUrl}/inbox_mitra/${uidEnc}/${tktEnc}.json`, 'PATCH', inboxPatch, timeoutMs),
                    this.rtdbMutate(`${baseUrl}/inbox_driver/${uidEnc}/${tktEnc}.json`, 'PATCH', inboxPatch, timeoutMs)
                ]);
            }

            if (payloadObj.triggerFcm && uidDriver) {
                this.triggerGasPushNotification({
                    uidDriver: uidDriver,
                    idTiket: idTiket,
                    type: 'CHAT_MESSAGE',
                    layanan: payloadObj.layanan || 'CHAT',
                    title: payloadObj.fcmTitle || 'Pesan Baru dari Penumpang',
                    body: payloadObj.fcmBody || inboxPatch.pesan_terakhir
                });
            }
            return { ok: true, msgId: msgId, waktu: w };
        }

        // 5. SONAR PING KE PENGEMUDI (SONAR_PING / PING_DRIVER)
        if (action === 'SONAR_PING' || subAction === 'SONAR_PING' || subAction === 'PING_DRIVER') {
            const idTiket = String(payloadObj.idTiket || '').trim();
            const uidDriver = String(payloadObj.uidDriver || '').trim();
            const w = Date.now();
            const baseUrl = payloadObj.usedOverflow ? node2Url : node3Url;

            if (!idTiket) return { ok: false };
            const tktEnc = encodeURIComponent(idTiket);

            await this.rtdbMutate(`${baseUrl}/sesi_komunikasi/${tktEnc}/metadata_order.json`, 'PATCH', {
                ping_alert: w
            }, timeoutMs);

            if (uidDriver) {
                this.triggerGasPushNotification({
                    uidDriver: uidDriver,
                    idTiket: idTiket,
                    type: 'SONAR_PING',
                    layanan: payloadObj.layanan || 'RIDE',
                    title: payloadObj.title || 'Panggilan Pelanggan!',
                    body: payloadObj.body || 'Pelanggan menunggu konfirmasi Anda di ruang pesan.'
                });
            }
            return { ok: true, ping_alert: w };
        }

        // 6. UPDATE STATUS TIKET RADAR (UPDATE_STATUS)
        if (action === 'UPDATE_STATUS' || subAction === 'UPDATE_STATUS') {
            const idTiket = String(payloadObj.idTiket || '').trim();
            const uidDriver = String(payloadObj.uidDriver || '').trim();
            if (uidDriver && idTiket && payloadObj.deleteTicketOnly) {
                const uidEnc = encodeURIComponent(uidDriver);
                const tktEnc = encodeURIComponent(idTiket);
                await Promise.allSettled([
                    this.rtdbMutate(`${node3Url}/radar_tiket/${uidEnc}/${tktEnc}.json`, 'DELETE', null, timeoutMs),
                    this.rtdbMutate(`${node2Url}/radar_tiket/${uidEnc}/${tktEnc}.json`, 'DELETE', null, timeoutMs)
                ]);
            }
            return { ok: true };
        }

        // 7. PEMBATALAN ORDER OLEH PELANGGAN ATAU PEMBERSIHAN SESI (CANCEL_ORDER / CLEANUP)
        if (action === 'CANCEL_ORDER' || subAction === 'CANCEL_ORDER' || action === 'CLEANUP' || subAction === 'CLEANUP') {
            const idTiket = String(payloadObj.idTiket || '').trim();
            const uidDriver = String(payloadObj.uidDriver || '').trim();
            const isCancelByClient = (action === 'CANCEL_ORDER' || subAction === 'CANCEL_ORDER' || Boolean(payloadObj.cancelledByClient));
            const now = Date.now();

            const uidEnc = uidDriver ? encodeURIComponent(uidDriver) : '';
            const tktEnc = idTiket ? encodeURIComponent(idTiket) : '';

            if (uidDriver) {
                await this.lockDriverBusyNode1(uidDriver, false, null, timeoutMs);
            }

            if (isCancelByClient && tktEnc) {
                await Promise.allSettled([
                    this.rtdbMutate(`${node3Url}/sesi_komunikasi/${tktEnc}/metadata_order.json`, 'PATCH', {
                        status: 'CANCELLED',
                        cancelled_by: 'client',
                        alasan_batal: 'Dibatalkan oleh pelanggan',
                        waktu_dibatalkan: now
                    }, timeoutMs),
                    this.rtdbMutate(`${node2Url}/sesi_komunikasi/${tktEnc}/metadata_order.json`, 'PATCH', {
                        status: 'CANCELLED',
                        cancelled_by: 'client',
                        alasan_batal: 'Dibatalkan oleh pelanggan',
                        waktu_dibatalkan: now
                    }, timeoutMs),
                    (uidEnc && tktEnc) ? this.rtdbMutate(`${node3Url}/radar_tiket/${uidEnc}/${tktEnc}.json`, 'DELETE', null, timeoutMs) : Promise.resolve(),
                    (uidEnc && tktEnc) ? this.rtdbMutate(`${node2Url}/radar_tiket/${uidEnc}/${tktEnc}.json`, 'DELETE', null, timeoutMs) : Promise.resolve(),
                    (uidEnc && tktEnc) ? this.rtdbMutate(`${node3Url}/inbox_mitra/${uidEnc}/${tktEnc}.json`, 'DELETE', null, timeoutMs) : Promise.resolve(),
                    (uidEnc && tktEnc) ? this.rtdbMutate(`${node3Url}/inbox_driver/${uidEnc}/${tktEnc}.json`, 'DELETE', null, timeoutMs) : Promise.resolve()
                ]);
                return { ok: true, status: 'CANCELLED' };
            }

            await Promise.allSettled([
                tktEnc ? this.rtdbMutate(`${node3Url}/sesi_komunikasi/${tktEnc}.json`, 'DELETE', null, timeoutMs) : Promise.resolve(),
                tktEnc ? this.rtdbMutate(`${node2Url}/sesi_komunikasi/${tktEnc}.json`, 'DELETE', null, timeoutMs) : Promise.resolve(),
                (uidEnc && tktEnc) ? this.rtdbMutate(`${node3Url}/radar_tiket/${uidEnc}/${tktEnc}.json`, 'DELETE', null, timeoutMs) : Promise.resolve(),
                (uidEnc && tktEnc) ? this.rtdbMutate(`${node2Url}/radar_tiket/${uidEnc}/${tktEnc}.json`, 'DELETE', null, timeoutMs) : Promise.resolve(),
                (uidEnc && tktEnc) ? this.rtdbMutate(`${node3Url}/inbox_mitra/${uidEnc}/${tktEnc}.json`, 'DELETE', null, timeoutMs) : Promise.resolve(),
                (uidEnc && tktEnc) ? this.rtdbMutate(`${node3Url}/inbox_driver/${uidEnc}/${tktEnc}.json`, 'DELETE', null, timeoutMs) : Promise.resolve(),
                (uidEnc && tktEnc) ? this.rtdbMutate(`${node2Url}/inbox_mitra/${uidEnc}/${tktEnc}.json`, 'DELETE', null, timeoutMs) : Promise.resolve()
            ]);
            return { ok: true };
        }

        // 8. UNFURL SHORTLINK GOOGLE MAPS VIA GAS MICRO-BACKEND
        if (action === 'UNFURL_MAPS') {
            const shortUrl = String(payloadObj.url || '').trim();
            if (!shortUrl) return { ok: false };
            const gasUrl = this.getGasUrl();
            const ctrl = new AbortController();
            const tid = setTimeout(() => ctrl.abort(), timeoutMs);
            try {
                const r = await fetch(`${gasUrl}?action=unfurl&url=${encodeURIComponent(shortUrl)}`, {
                    method: 'GET',
                    signal: ctrl.signal
                });
                clearTimeout(tid);
                if (!r.ok) return { ok: false, status: r.status };
                const data = await r.json().catch(() => null);
                return data || { ok: false };
            } catch (e) {
                clearTimeout(tid);
                return { ok: false };
            }
        }

        return { ok: false, error: 'UNKNOWN_GATEWAY_ACTION' };
    }
};
