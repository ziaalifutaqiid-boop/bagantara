// ==========================================
// MESIN KATALOG PENGEMUDI AKTIF (ZERO-FIRESTORE-READ & DIRECT RTDB CLUSTER HYDRATION) - V12.5
// ARSITEKTUR: 100% ZERO-SOCKET HTTP REST + ETAG CACHING, SESSION CACHE 20S, AUTO-HIDE BUSY DRIVER, & QRIS NORMALIZER
// ==========================================

(function() {
    const _CORE_RTDB = 'https://bagantara-core-default-rtdb.asia-southeast1.firebasedatabase.app';
    const _OVERFLOW_RTDB = 'https://futaqi-ali-default-rtdb.asia-southeast1.firebasedatabase.app';
    const _SESSION_CATALOG_CACHE_KEY = 'bgn_catalog_session_cache_v12_5';
    const _LOCAL_PROFILE_CACHE_KEY = 'bgn_driver_profile_cache_v12_5';
    const _LOCAL_PROFILE_TTL_MS = 6 * 60 * 60 * 1000; // 6 Jam TTL
    const _MIN_REFRESH_COOLDOWN_MS = 20000; // 20 Detik Cooldown
    const _restEtagCache = new Map();

    function normalizeDriverQrisUrl(rawUrl) {
        if (typeof window.normalizeDriverQrisUrl === 'function') {
            return window.normalizeDriverQrisUrl(rawUrl);
        }
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

    function _readLocalProfileCache() {
        try {
            const raw = localStorage.getItem(_LOCAL_PROFILE_CACHE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return {};
            const now = Date.now();
            let mutated = false;
            for (const uid of Object.keys(parsed)) {
                const entry = parsed[uid];
                if (!entry || !entry.ts || (now - Number(entry.ts) > _LOCAL_PROFILE_TTL_MS)) {
                    delete parsed[uid];
                    mutated = true;
                }
            }
            if (mutated) {
                localStorage.setItem(_LOCAL_PROFILE_CACHE_KEY, JSON.stringify(parsed));
            }
            return parsed;
        } catch (e) {
            return {};
        }
    }

    function _writeLocalProfileCache(cacheObj) {
        try {
            localStorage.setItem(_LOCAL_PROFILE_CACHE_KEY, JSON.stringify(cacheObj || {}));
        } catch (e) {}
    }

    function _readSessionCatalogCache(coordKey) {
        try {
            const raw = sessionStorage.getItem(_SESSION_CATALOG_CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.hashKey !== coordKey || !Array.isArray(parsed.data)) return null;
            return parsed;
        } catch (e) {
            return null;
        }
    }

    function _writeSessionCatalogCache(coordKey, timestamp, driversList) {
        try {
            sessionStorage.setItem(_SESSION_CATALOG_CACHE_KEY, JSON.stringify({
                hashKey: coordKey,
                timestamp: timestamp,
                data: driversList
            }));
        } catch (e) {}
    }

    async function _fetchJsonSafe(url, timeoutMs = 5000, useEtag = true) {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), timeoutMs);
        const headers = { 'Accept': 'application/json' };
        const cachedEntry = _restEtagCache.get(url) || null;
        if (url.includes('.firebasedatabase.app')) {
            headers['X-Firebase-ETag'] = 'true';
            if (cachedEntry && cachedEntry.etag) {
                headers['If-None-Match'] = cachedEntry.etag;
            }
        }
        try {
            const r = await fetch(url, { method: 'GET', headers, signal: ctrl.signal, cache: 'no-store' });
            clearTimeout(tid);
            if (r.status === 304 && cachedEntry) {
                return cachedEntry.data;
            }
            if (!r.ok) return cachedEntry ? cachedEntry.data : null;
            const data = await r.json();
            const newEtag = r.headers.get('etag') || r.headers.get('ETag');
            if (newEtag) {
                _restEtagCache.set(url, { etag: newEtag, data, ts: Date.now() });
            }
            return data;
        } catch (e) {
            clearTimeout(tid);
            return cachedEntry ? cachedEntry.data : null;
        }
    }

    // 100% Zero-Firestore-Read: Hidrasi Katalog Pengemudi Murni dari RTDB Node #1 & Node #6
    async function _directClusterFallbackScan(userLat, userLng) {
        const now = Date.now();
        let n1Data = null;
        let n6Data = null;
        if (window.BGNSecurityShield && typeof window.BGNSecurityShield.callGateway === 'function') {
            const gwCatalog = await window.BGNSecurityShield.callGateway({ action: 'SCAN_CATALOG', rawOnly: true }, { timeoutMs: 5500 }).catch(() => null);
            if (gwCatalog && gwCatalog.ok) {
                n1Data = gwCatalog.node1Drivers || null;
                n6Data = gwCatalog.node3Drivers || null;
            }
        }
        if (!n1Data && !n6Data) {
            const [d1, d3] = await Promise.all([
                _fetchJsonSafe(`${_CORE_RTDB}/drivers.json`, 5500, true),
                _fetchJsonSafe(`${_OVERFLOW_RTDB}/drivers.json`, 4500, true)
            ]);
            n1Data = d1;
            n6Data = d3;
        }

        const r1Map = (n1Data && typeof n1Data === 'object') ? n1Data : {};
        const r6Map = (n6Data && typeof n6Data === 'object') ? n6Data : {};
        const localProfMap = _readLocalProfileCache();
        let profCacheUpdated = false;

        const allUids = new Set([
            ...Object.keys(r6Map),
            ...Object.keys(r1Map)
        ]);

        const drivers = [];
        for (const uid of allUids) {
            if (!uid || uid === 'null' || uid === 'undefined') continue;
            const r1 = r1Map[uid] || {};
            const r6 = r6Map[uid] || {};

            const s1 = (r1.status && typeof r1.status === 'object') ? r1.status : r1;
            const s6 = (r6.status && typeof r6.status === 'object') ? r6.status : r6;
            const statusData = (Number(s6?.timestamp || 0) > Number(s1?.timestamp || 0) ? s6 : s1) || {};

            // Filter Auto-Hide: Sembunyikan pengemudi yang sedang sibuk (isBusy === true)
            if (statusData.isBusy === true && (!statusData.busyUntil || Number(statusData.busyUntil) > now)) {
                continue;
            }

            const rtdbProfile = { ...(r6.profile || {}), ...(r1.profile || {}) };
            const rtdbSettings = { ...(r6.settings || {}), ...(r1.settings || {}) };
            const rtdbAdmin = { ...(r6.admin_status || {}), ...(r1.admin_status || {}) };
            const cachedProf = (localProfMap[uid] && localProfMap[uid].data) ? localProfMap[uid].data : {};

            if (rtdbAdmin.isBanned === true || statusData.isBanned === true) continue;
            if (rtdbAdmin.isApproved !== undefined && !rtdbAdmin.isApproved) continue;

            const dLat = parseFloat(statusData.lat ?? rtdbProfile.lat);
            const dLng = parseFloat(statusData.lng ?? rtdbProfile.lng);
            if (isNaN(dLat) || isNaN(dLng) || dLat < -11.5 || dLat > 6.5 || dLng < 94.5 || dLng > 141.5) continue;

            const rawRadius = parseFloat(statusData.radius ?? rtdbSettings.radius ?? cachedProf.radius);
            const radius = (!isNaN(rawRadius) && rawRadius >= 1 && rawRadius <= 25) ? rawRadius : 15.0;
            const jarak = window.AegisEngine.calculateDistance(userLat, userLng, dLat, dLng);
            if (jarak > Math.max(radius, 15.0)) continue;

            const rawArmada = String(statusData.armada || rtdbProfile.armada || cachedProf.armada || 'MOTOR').toUpperCase();
            const armada = (rawArmada.includes('MOBIL') || rawArmada === 'CAR') ? 'MOBIL' : 'MOTOR';

            const rawLayanan = statusData.layanan ?? rtdbSettings.layanan ?? cachedProf.layanan;
            let layanan = [];
            if (armada === 'MOBIL') {
                layanan = ['CAR'];
            } else if (Array.isArray(rawLayanan)) {
                layanan = rawLayanan.map(x => String(x || '').trim().toUpperCase()).filter(Boolean);
            } else if (typeof rawLayanan === 'string' && rawLayanan.trim() !== '') {
                layanan = rawLayanan.split(/[,|;\s]+/).map(x => x.trim().toUpperCase()).filter(Boolean);
            }
            if (layanan.length === 0) layanan = armada === 'MOBIL' ? ['CAR'] : ['RIDE', 'EXPRESS', 'JASTIP'];

            const rawWa = statusData.wa || rtdbProfile.wa || cachedProf.wa || '';
            const cleanWa = window.AegisEngine.validateWA(rawWa) || '';

            const mode = String(statusData.mode || 'aktif').toLowerCase();
            const isOnline = Boolean(statusData.isOnline);
            const ts = Number(statusData.timestamp || 0);
            const expiresAt = Number(statusData.expiresAt || 0);
            const tampilkanWa = statusData.tampilkan_wa !== undefined ? Boolean(statusData.tampilkan_wa) : true;

            const ageMs = ts > 0 ? Math.max(0, now - ts) : 0;
            const isStandbyValid = mode === 'standby' && expiresAt > now;
            const isFresh = ts > 0 ? (ageMs <= 30 * 60 * 1000) : isOnline;

            const isTier1 = (mode !== 'offline') && (isOnline || isStandbyValid) && (isFresh || isStandbyValid);
            const isTier2 = !isTier1 && Boolean(cleanWa) && tampilkanWa && (mode !== 'offline' || (ts > 0 && ageMs <= 12 * 3600 * 1000));
            if (!isTier1 && !isTier2) continue;

            const rawDiskon = statusData.diskon_map ?? rtdbSettings.diskon_map ?? cachedProf.diskon_map;
            const diskonMap = (rawDiskon && typeof rawDiskon === 'object' && !Array.isArray(rawDiskon))
                ? rawDiskon
                : window.AegisEngine.parseDriverDiskonMap(String(rawDiskon || ''));

            const resolvedNama = statusData.nama || rtdbProfile.nama || cachedProf.nama || 'Driver Bagantara';
            const resolvedPlat = statusData.plat || rtdbProfile.plat || cachedProf.plat || '-';
            const resolvedKendaraan = statusData.kendaraan || rtdbProfile.kendaraan || cachedProf.kendaraan || (armada === 'MOBIL' ? 'Mobil Standar' : 'Motor Standar');
            const resolvedFoto = statusData.foto_url || statusData.fotoUrl || rtdbProfile.fotoUrl || rtdbProfile.fotoProfile || cachedProf.fotoUrl || './assets/icon-192.png';
            const qrisUrl = normalizeDriverQrisUrl(
                statusData.qris_url || statusData.qrisUrl ||
                rtdbProfile.qrisUrl || rtdbProfile.qris_url ||
                rtdbSettings.qris_url || cachedProf.qrisUrl || ''
            );

            if (statusData.nama || statusData.plat || statusData.kendaraan || statusData.foto_url || cleanWa || qrisUrl) {
                localProfMap[uid] = {
                    ts: now,
                    data: {
                        nama: resolvedNama,
                        plat: resolvedPlat,
                        kendaraan: resolvedKendaraan,
                        wa: cleanWa,
                        fotoUrl: resolvedFoto,
                        qrisUrl: qrisUrl,
                        armada: armada
                    }
                };
                profCacheUpdated = true;
            }

            drivers.push({
                uid: String(uid),
                nama: resolvedNama,
                wa: cleanWa,
                plat: resolvedPlat,
                kendaraan: resolvedKendaraan,
                fotoProfile: resolvedFoto,
                qrisUrl,
                armada,
                layanan,
                tarifMin: parseInt(statusData.tarif_min ?? rtdbSettings.tarif_min, 10) || 10000,
                radius,
                jarak: parseFloat(jarak.toFixed(2)),
                lat: dLat,
                lng: dLng,
                info: statusData.agenda || '',
                promoTeks: statusData.promo_teks || '',
                diskonMap,
                timestamp: ts || now,
                serverRecordedAt: ts || now,
                mode: isStandbyValid ? 'standby' : 'aktif',
                expiresAt: expiresAt > 0 ? expiresAt : null,
                isBusy: false,
                busyUntil: 0,
                isWaFallbackOnly: !isTier1 && isTier2
            });
        }

        if (profCacheUpdated) {
            _writeLocalProfileCache(localProfMap);
        }

        return { ok: true, drivers };
    }

    window.AegisEngine = {
        _rtdbScanCache: {
            hashKey: null,
            timestamp: 0,
            data: null
        },

        normalizeDriverQrisUrl: normalizeDriverQrisUrl,

        normalizeDriverPhotoUrl: function(rawUrl, defaultAvatar = './assets/icon-192.png') {
            if (!rawUrl || typeof rawUrl !== 'string' || String(rawUrl).trim() === '') return defaultAvatar;
            const cleaned = String(rawUrl).trim().replace(/[<>"']/g, '');
            const match = cleaned.match(/(?:\/file\/d\/|\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/i);
            if (match && match[1]) {
                return "https://lh3.googleusercontent.com/d/" + match[1] + "=s400";
            }
            if (/^https:\/\//i.test(cleaned) || cleaned.startsWith('./') || cleaned.startsWith('/')) {
                return cleaned;
            }
            return defaultAvatar;
        },

        sanitizeText: function(text) {
            if (!text) return "";
            const secCfg = window.BGN_CONFIG.rules_app.security;
            const wPopup = window.BGN_CONFIG.wording.mitra_popup;
            let clean = text.toString().trim().replace(/[<>]/g, '');
            clean = clean.replace(/(https?:\/\/[^\s]+|www\.[^\s]+|\b\w+\.(com|id|me|net|org)\b)/gi, wPopup.blocked_link_placeholder);
            const badWords = secCfg.bad_words;
            const regexBad = new RegExp(`\\b(${badWords.join('|')})\\b`, 'gi');
            return clean.replace(regexBad, secCfg.censored_replacement);
        },

        parseDriverDiskonMap: function(rawStr) {
            const map = {};
            if (!rawStr) return map;
            if (typeof rawStr === 'object' && !Array.isArray(rawStr)) {
                for (const [k, v] of Object.entries(rawStr)) {
                    const srv = String(k || '').trim().toUpperCase();
                    const pct = Math.min(90, Math.max(0, parseInt(String(v || '0').replace(/[^0-9]/g, ''), 10) || 0));
                    if (srv && pct > 0) map[srv] = pct;
                }
                return map;
            }
            if (typeof rawStr !== 'string') return map;
            rawStr.split(',').forEach(part => {
                const [srvRaw, pctRaw] = String(part).split(':');
                if (!srvRaw) return;
                const srv = srvRaw.trim().toUpperCase();
                const pct = Math.min(90, Math.max(0, parseInt(String(pctRaw || '0').replace(/[^0-9]/g, ''), 10) || 0));
                if (srv && pct > 0) {
                    map[srv] = pct;
                }
            });
            return map;
        },

        extractNumber: function(text) {
            if (!text) return 0;
            const numStr = text.toString().replace(/[^0-9]/g, '');
            return numStr ? parseInt(numStr, 10) : 0;
        },

        validateWA: function(text) {
            if (!text) return null;
            const mm = window.BGN_CONFIG.rules_app.matchmaking;
            const prefix = mm.wa_country_prefix;
            let numStr = text.toString().replace(/[^0-9]/g, '');
            if (numStr.startsWith('0')) numStr = prefix + numStr.substring(1);
            else if (numStr.startsWith('8')) numStr = prefix + numStr;
            if (numStr.length < mm.wa_min_length || !numStr.startsWith(prefix)) return null;
            return numStr;
        },

        calculateDistance: function(lat1, lon1, lat2, lon2) {
            const R = window.BGN_CONFIG.rules_app.system_controls.earth_radius_km;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        },

        _filterDriversFromList: function(allDrivers, targetFilter, maxRender, wPopup, defaultFilter) {
            const list = Array.isArray(allDrivers) ? allDrivers : [];
            const now = Date.now();
            const filtered = list.filter(d => {
                if (!d) return false;
                if (d.isBusy === true && (!d.busyUntil || Number(d.busyUntil) > now)) return false;
                const cachedLocal = window.BAGANTARA_DRIVER_CACHE && window.BAGANTARA_DRIVER_CACHE[d.uid];
                if (cachedLocal && cachedLocal.isBusy === true && (!cachedLocal.busyUntil || Number(cachedLocal.busyUntil) > now)) {
                    return false;
                }
                if (targetFilter === defaultFilter || targetFilter === 'ALL') return true;
                if (targetFilter === 'CAR') {
                    return d.armada === wPopup.driver_car;
                }
                const srvList = Array.isArray(d.layanan) ? d.layanan : [];
                return d.armada === wPopup.driver_bike && srvList.includes(targetFilter);
            });

            filtered.sort((a, b) => {
                if (a.isWaFallbackOnly !== b.isWaFallbackOnly) {
                    return a.isWaFallbackOnly ? 1 : -1;
                }
                return a.jarak - b.jarak;
            });

            const totalTersedia = filtered.length;
            const sliced = filtered.slice(0, maxRender);
            return {
                drivers: sliced,
                totalTersedia: totalTersedia,
                hasMore: totalTersedia > sliced.length
            };
        },

        scanKatalogMitra: async function(userLat, userLng, filterService, forceRefresh = false, customLimit = null, useRamOnly = false) {
            try {
                if (isNaN(parseFloat(userLat)) || isNaN(parseFloat(userLng))) {
                    return { drivers: [], totalTersedia: 0, hasMore: false };
                }

                const lat = parseFloat(userLat);
                const lng = parseFloat(userLng);

                const rulesApp = window.BGN_CONFIG.rules_app;
                const matchmaking = rulesApp.matchmaking;
                const radarRules = rulesApp.radar_mitra;
                const activeServiceFlags = window.BGN_CONFIG.layanan.services;
                const wPopup = window.BGN_CONFIG.wording.mitra_popup;
                const defaultAvatar = window.BGN_CONFIG.settings.map_config.default_avatar_url;

                const cacheTtlMs = Math.max(20000, (parseInt(matchmaking.rtdb_cache_ttl_sec, 10) || 60) * 1000);
                const maxRender = customLimit ? parseInt(customLimit, 10) : (parseInt(radarRules.max_drivers_rendered, 10) || 10);
                const defaultFilter = radarRules.default_filter || 'ALL';
                const targetFilter = (filterService ? filterService : defaultFilter).toUpperCase();

                const coordKey = `${lat.toFixed(3)}_${lng.toFixed(3)}`;
                const now = Date.now();

                if (!window.BAGANTARA_DRIVER_CACHE) window.BAGANTARA_DRIVER_CACHE = {};

                // Pulihkan dari sessionStorage jika _rtdbScanCache di RAM belum terisi
                if (!Array.isArray(this._rtdbScanCache.data)) {
                    const sessionCached = _readSessionCatalogCache(coordKey);
                    if (sessionCached && Array.isArray(sessionCached.data)) {
                        this._rtdbScanCache = {
                            hashKey: sessionCached.hashKey,
                            timestamp: Number(sessionCached.timestamp || 0),
                            data: sessionCached.data
                        };
                    }
                }

                const elapsedSinceLastScan = now - Number(this._rtdbScanCache.timestamp || 0);

                // Gunakan RAM/Session Cache jika useRamOnly aktif, cooldown 20 detik belum lewat, atau cache masih segar
                if (
                    (useRamOnly && Array.isArray(this._rtdbScanCache.data)) ||
                    (Array.isArray(this._rtdbScanCache.data) && this._rtdbScanCache.hashKey === coordKey && elapsedSinceLastScan < _MIN_REFRESH_COOLDOWN_MS) ||
                    (!forceRefresh && Array.isArray(this._rtdbScanCache.data) && this._rtdbScanCache.hashKey === coordKey && elapsedSinceLastScan < cacheTtlMs)
                ) {
                    return this._filterDriversFromList(this._rtdbScanCache.data, targetFilter, maxRender, wPopup, defaultFilter);
                }

                // Panggil Langsung Firebase RTDB Node #1 & Node #6 via HTTP GET + ETag (If-None-Match) (0 Kuota Firestore & 0 Kuota Vercel!)
                const respData = await _directClusterFallbackScan(lat, lng);

                const rawDrivers = (respData && Array.isArray(respData.drivers)) ? respData.drivers : [];
                const sanitizedDrivers = [];

                for (let i = 0; i < rawDrivers.length; i++) {
                    const d = rawDrivers[i];
                    if (!d || !d.uid) continue;

                    const statusData = (d.status && typeof d.status === 'object') ? d.status : d;
                    const profileData = (d.profile && typeof d.profile === 'object') ? d.profile : d;
                    const status = statusData;

                    if (status.isBusy === true && (!status.busyUntil || Number(status.busyUntil) > Date.now())) {
                        continue;
                    }
                    const prevCached = window.BAGANTARA_DRIVER_CACHE[String(d.uid)];
                    if (prevCached && prevCached.isBusy === true && (!prevCached.busyUntil || Number(prevCached.busyUntil) > Date.now())) {
                        continue;
                    }

                    let rawLayanan = [];
                    if (Array.isArray(d.layanan)) {
                        rawLayanan = d.layanan.map(s => String(s || '').trim().toUpperCase()).filter(Boolean);
                    } else if (typeof d.layanan === 'string' && d.layanan.trim() !== '') {
                        rawLayanan = d.layanan.split(/[,|;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
                    }
                    const filteredLayanan = rawLayanan.filter(srv => activeServiceFlags[srv] !== false);
                    if (filteredLayanan.length === 0) continue;

                    const parsedDiskonMap = (d.diskonMap && typeof d.diskonMap === 'object' && !Array.isArray(d.diskonMap))
                        ? d.diskonMap
                        : this.parseDriverDiskonMap(d.diskonMap || d.diskon_map || '');

                    const qrisUrl = normalizeDriverQrisUrl(statusData.qris_url || profileData.qrisUrl || d.qrisUrl || d.qris_url || '');

                    const cleanDriver = {
                        uid: String(d.uid),
                        nama: this.sanitizeText(d.nama || wPopup.default_driver_name),
                        wa: d.wa ? String(d.wa) : '',
                        plat: this.sanitizeText(d.plat || wPopup.no_notes),
                        kendaraan: this.sanitizeText(d.kendaraan || (d.armada === wPopup.driver_car ? wPopup.default_vehicle_car : wPopup.default_vehicle_bike)),
                        fotoProfile: this.normalizeDriverPhotoUrl(d.fotoProfile, defaultAvatar),
                        qrisUrl: qrisUrl,
                        armada: d.armada || wPopup.driver_bike,
                        layanan: filteredLayanan,
                        tarifMin: parseInt(d.tarifMin, 10) || parseInt(matchmaking.default_min_tariff, 10) || 10000,
                        radius: parseFloat(d.radius) || parseFloat(matchmaking.max_scan_radius_km) || 15.0,
                        jarak: typeof d.jarak === 'number' ? d.jarak : this.calculateDistance(lat, lng, parseFloat(d.lat), parseFloat(d.lng)),
                        lat: parseFloat(d.lat),
                        lng: parseFloat(d.lng),
                        info: d.info ? this.sanitizeText(d.info) : '',
                        promoTeks: d.promoTeks ? this.sanitizeText(d.promoTeks).substring(0, 80) : '',
                        diskonMap: parsedDiskonMap,
                        timestamp: Number(d.timestamp || now),
                        serverRecordedAt: Number(d.serverRecordedAt || d.timestamp || now),
                        mode: d.mode || 'aktif',
                        expiresAt: d.expiresAt ? Number(d.expiresAt) : null,
                        isBusy: false,
                        busyUntil: 0,
                        isWaFallbackOnly: Boolean(d.isWaFallbackOnly)
                    };

                    window.BAGANTARA_DRIVER_CACHE[cleanDriver.uid] = {
                        uid: cleanDriver.uid,
                        nama: cleanDriver.nama,
                        wa: cleanDriver.wa,
                        plat: cleanDriver.plat,
                        kendaraan: cleanDriver.kendaraan,
                        fotoProfile: cleanDriver.fotoProfile,
                        qrisUrl: cleanDriver.qrisUrl,
                        layanan: cleanDriver.layanan,
                        armada: cleanDriver.armada,
                        tarifMin: cleanDriver.tarifMin,
                        tarif_min: cleanDriver.tarifMin,
                        radius: cleanDriver.radius,
                        info: cleanDriver.info,
                        agenda: cleanDriver.info,
                        promoTeks: cleanDriver.promoTeks,
                        promo_teks: cleanDriver.promoTeks,
                        diskonMap: cleanDriver.diskonMap,
                        diskon_map: cleanDriver.diskonMap,
                        lat: cleanDriver.lat,
                        lng: cleanDriver.lng,
                        jarak: cleanDriver.jarak,
                        timestamp: cleanDriver.timestamp,
                        serverRecordedAt: cleanDriver.serverRecordedAt,
                        mode: cleanDriver.mode,
                        expiresAt: cleanDriver.expiresAt,
                        isBusy: false,
                        busyUntil: 0,
                        isWaFallbackOnly: cleanDriver.isWaFallbackOnly
                    };

                    sanitizedDrivers.push(cleanDriver);
                }

                this._rtdbScanCache = {
                    hashKey: coordKey,
                    timestamp: now,
                    data: sanitizedDrivers
                };
                _writeSessionCatalogCache(coordKey, now, sanitizedDrivers);

                return this._filterDriversFromList(sanitizedDrivers, targetFilter, maxRender, wPopup, defaultFilter);
            } catch (err) {
                if (Array.isArray(this._rtdbScanCache.data)) {
                    const radarRules = window.BGN_CONFIG?.rules_app?.radar_mitra || {};
                    const wPopup = window.BGN_CONFIG?.wording?.mitra_popup || {};
                    const maxRender = customLimit ? parseInt(customLimit, 10) : (parseInt(radarRules.max_drivers_rendered, 10) || 10);
                    const defFlt = radarRules.default_filter || 'ALL';
                    return this._filterDriversFromList(this._rtdbScanCache.data, (filterService || defFlt).toUpperCase(), maxRender, wPopup, defFlt);
                }
                return { drivers: [], totalTersedia: 0, hasMore: false };
            }
        },

        _openClientIdentityForm: function(driverObj) {
            const noNotes = window.BGN_CONFIG.wording.mitra_popup.no_notes;
            const resolvedQris = normalizeDriverQrisUrl(
                driverObj.qrisUrl || driverObj.qris_url ||
                window.BAGANTARA_DRIVER_CACHE?.[driverObj.uid]?.qrisUrl || ''
            );
            window.BAGANTARA_DRIVER = { 
                uid: driverObj.uid, 
                nama: driverObj.nama, 
                wa: driverObj.wa,
                plat: driverObj.plat || '-',
                kendaraan: driverObj.kendaraan || '',
                qrisUrl: resolvedQris,
                isWaFallbackOnly: Boolean(driverObj.isWaFallbackOnly),
                promoTeks: driverObj.promoTeks ? driverObj.promoTeks : "",
                diskonMap: driverObj.diskonMap ? driverObj.diskonMap : {},
                tarifMin: driverObj.tarifMin || driverObj.tarif_min || 10000
            };
            
            const inputCatatan = document.getElementById('inputCatatanDriver');
            if (inputCatatan && window.BAGANTARA_PICKUP_DETAIL && window.BAGANTARA_PICKUP_DETAIL.patokan) {
                const patokan = window.BAGANTARA_PICKUP_DETAIL.patokan;
                inputCatatan.value = (patokan !== noNotes && patokan.trim() !== '') ? patokan : '';
            }
            
            if (window.OrderWAValidator) window.OrderWAValidator.syncFormUIByService(window.BAGANTARA_SERVICE);
            const overlay = document.getElementById('client-form-overlay');
            if (overlay) {
                overlay.classList.remove('hidden');
                if (typeof window.armBgtHistoryGuard === 'function') window.armBgtHistoryGuard('client-form');
            }
        },

        renderMitraList: async function(targetService, routePrice) {
            const pd = window.BAGANTARA_PRELOCKED_DRIVER;
            if (!pd) {
                const msgNoDriver = window.BGN_CONFIG.wording.alerts.uid_not_found;
                if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('uid_not_found', msgNoDriver);
                else window.alert(msgNoDriver);
                if (window.spaNavigateTo) window.spaNavigateTo("view-mitra-map");
                return;
            }

            const tarifMinDriver = parseInt(pd.tarifMin, 10);
            const hargaRute = parseInt(routePrice, 10);

            if (hargaRute >= tarifMinDriver) {
                this._openClientIdentityForm(pd);
                return;
            }

            if (window.BAGANTARA_MIN_TARIFF_PREAPPROVED === true) {
                window.BAGANTARA_FINAL_PRICE = tarifMinDriver;
                if (window.__BGN_SEAL__ && typeof window.__BGN_SEAL__.approveDriverMinTariff === 'function') {
                    window.__BGN_SEAL__.approveDriverMinTariff(tarifMinDriver);
                }
                this._openClientIdentityForm(pd);
                return;
            }

            const selisih = tarifMinDriver - hargaRute;
            const modalBoost = document.getElementById('tariff-match-overlay');
            if (!modalBoost) {
                window.BAGANTARA_FINAL_PRICE = tarifMinDriver;
                if (window.__BGN_SEAL__ && typeof window.__BGN_SEAL__.approveDriverMinTariff === 'function') {
                    window.__BGN_SEAL__.approveDriverMinTariff(tarifMinDriver);
                }
                this._openClientIdentityForm(pd);
                return;
            }

            const currencyCode = window.BGN_CONFIG.tariffs.currency;
            const fmt = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: currencyCode, minimumFractionDigits: 0 }).format(val);
            const elDriverName = document.getElementById('tmDriverName');
            const elRoutePrice = document.getElementById('tmRoutePrice');
            const elMinTariff = document.getElementById('tmMinTariff');
            const elDiffPrice = document.getElementById('tmDiffPrice');

            if (elDriverName) elDriverName.textContent = pd.nama;
            if (elRoutePrice) elRoutePrice.textContent = fmt(hargaRute);
            if (elMinTariff) elMinTariff.textContent = fmt(tarifMinDriver);
            if (elDiffPrice) elDiffPrice.textContent = `+${fmt(selisih)}`;

            modalBoost.classList.remove('hidden');
            if (typeof window.armBgtHistoryGuard === 'function') window.armBgtHistoryGuard('tariff-match');

            window.bindSafeButton('btnApproveTariffMatch', () => {
                modalBoost.classList.add('hidden');
                window.BAGANTARA_FINAL_PRICE = tarifMinDriver;
                if (window.__BGN_SEAL__ && typeof window.__BGN_SEAL__.approveDriverMinTariff === 'function') {
                    window.__BGN_SEAL__.approveDriverMinTariff(tarifMinDriver);
                }

                if (targetService === 'JASTIP' && window.FlowJastip && typeof window.FlowJastip.overrideJastipPriceDisplay === 'function') {
                    window.FlowJastip.overrideJastipPriceDisplay();
                } else {
                    const priceValueEl = document.getElementById('priceValue');
                    const badgeText = window.BGN_CONFIG.wording.radar.min_driver_tariff_badge;
                    if (priceValueEl) {
                        priceValueEl.innerHTML = `${fmt(tarifMinDriver)} <span style="font-size: 0.65rem; color: var(--neon-gold); font-weight: normal; margin-left: 4px;">${badgeText}</span>`;
                    }
                }

                this._openClientIdentityForm(pd);
            });

            window.bindSafeButton('btnRejectTariffMatch', () => {
                modalBoost.classList.add('hidden');
                if (window.SystemReset) window.SystemReset();
            });
        }
    };
})();
