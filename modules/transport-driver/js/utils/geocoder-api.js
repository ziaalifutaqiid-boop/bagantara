// ==========================================
// MESIN GEOCODER MAPTILER + GOOGLE MAPS SMART EXTRACTOR & LOCAL VAULT (V12.2 - MAPTILER EDITION)
// ARSITEKTUR: 100% MAPTILER GEOCODING API (0% OSM & 0% PHOTON), STRICT INDONESIA BBOX,
//             OLC PLUS-CODE DECODER, 3-TIER ACCURACY VERIFIER, & SERVERLESS /api/unfurl-maps BRIDGE
// ==========================================

window.GeocoderAPI = {
    _searchCacheKey: 'bgn_geo_fwd_cache_v4_mt',
    _reverseCacheKey: 'bgn_geo_rev_cache_v4_mt',
    _recentPlacesKey: 'bgn_recent_places_v1',
    _vaultPlacesKey: 'bgn_saved_places_vault_v1',
    _maptilerKey: 'GHEMVdokax4heMQCeIxM',

    _getCacheTtlMs: function() {
        const days = window.BGN_CONFIG.rules_app.geocoder_rules.cache_ttl_days;
        return days * 24 * 60 * 60 * 1000;
    },

    _getDynamicDefaultCenter: function() {
        if (window.ConfigManager && typeof window.ConfigManager.getActiveZoneCenter === 'function') {
            return window.ConfigManager.getActiveZoneCenter();
        }
        return window.BGN_CONFIG.settings.map_config.default_center;
    },

    _getHaversineDistance: function(lat1, lon1, lat2, lon2) {
        if (window.AegisEngine && typeof window.AegisEngine.calculateDistance === 'function') {
            return window.AegisEngine.calculateDistance(lat1, lon1, lat2, lon2);
        }
        const R = window.BGN_CONFIG.rules_app.system_controls.earth_radius_km;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    },

    _isNumericOnlyPlaceLabel: function(labelStr) {
        if (!labelStr || typeof labelStr !== 'string') return true;
        const cleaned = labelStr.trim();
        if (!cleaned) return true;
        const parts = cleaned.split(',').map(s => s.trim()).filter(Boolean);
        if (parts.length === 0) return true;
        const firstPart = parts[0];
        if (/^[0-9\s./#-]+$/.test(firstPart)) {
            const nonNumericRest = parts.slice(1).filter(p => !/^[0-9\s./#-]+$/.test(p) && !/^(indonesia|id)$/i.test(p));
            if (nonNumericRest.length === 0) return true;
        }
        return /^[0-9\s,./#-]+$/.test(cleaned);
    },

    _decodeUrlPreservingPlusCode: function(rawStr) {
        if (!rawStr || typeof rawStr !== 'string') return '';
        const protectedStr = rawStr
            .replace(/%2B/gi, '+')
            .replace(/([23456789CFGHJMPQRVWX]{4,8})\+([23456789CFGHJMPQRVWX]{2,3})/gi, '$1__BGN_OLC_PLUS__$2');
        let decoded = protectedStr.replace(/\+/g, ' ');
        try {
            decoded = decodeURIComponent(decoded);
        } catch (e) {}
        return decoded
            .replace(/__BGN_OLC_PLUS__/g, '+')
            .replace(/(^|[\s,/(\[])([23456789CFGHJMPQRVWX]{4,8})\s+([23456789CFGHJMPQRVWX]{2,3})(?=$|[\s,.)\]])/gi, '$1$2+$3');
    },

    _restorePlusCodeInLabel: function(str) {
        if (!str || typeof str !== 'string') return '';
        return str
            .replace(/__BGN_OLC_PLUS__/g, '+')
            .replace(/^([23456789CFGHJMPQRVWX]{4,8})\s+([23456789CFGHJMPQRVWX]{2,3})\b/i, '$1+$2')
            .replace(/(^|[\s,/(\[])([23456789CFGHJMPQRVWX]{4,8})\s+([23456789CFGHJMPQRVWX]{2,3})(?=$|[\s,.)\]])/gi, '$1$2+$3')
            .trim();
    },

    _extractDescriptiveReverseAddress: function(features) {
        if (!Array.isArray(features) || features.length === 0) return null;

        let fallbackCandidate = null;

        for (let i = 0; i < features.length; i++) {
            const feat = features[i];
            if (!feat) continue;
            const props = feat.properties || {};
            const rawPlace = String(
                feat.place_name_id ||
                feat.place_name ||
                props.place_name ||
                feat.text_id ||
                feat.text ||
                props.name ||
                ''
            ).trim();
            if (!rawPlace) continue;

            const rawSegments = rawPlace
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);

            const nonNumericSegments = rawSegments.filter(seg => !/^[0-9\s./#-]+$/.test(seg));
            const descriptiveSegments = nonNumericSegments.filter(
                seg => /[a-zA-Z]{2,}/.test(seg) && !/^(indonesia|id)$/i.test(seg)
            );

            if (descriptiveSegments.length > 0) {
                const selectedSegments = nonNumericSegments
                    .filter((seg, idx) => !(idx === nonNumericSegments.length - 1 && nonNumericSegments.length > 2 && /^indonesia$/i.test(seg)))
                    .slice(0, 3);
                const joined = (selectedSegments.length > 0 ? selectedSegments : descriptiveSegments.slice(0, 3)).join(', ');
                if (joined && !this._isNumericOnlyPlaceLabel(joined)) {
                    return joined;
                }
            }

            if (!fallbackCandidate && !this._isNumericOnlyPlaceLabel(rawPlace)) {
                fallbackCandidate = rawSegments.slice(0, 3).join(', ');
            }
        }

        return fallbackCandidate;
    },

    // ==========================================
    // 1. BRANKAS LOKASI TERSIMPAN & RIWAYAT (LOCAL ADDRESS VAULT - 0 API REQUEST)
    // ==========================================
    getVaultPlaces: function() {
        try {
            const raw = localStorage.getItem(this._vaultPlacesKey);
            if (!raw) return [];
            const list = JSON.parse(raw);
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    },

    saveToVault: function(label, lat, lng, rawAddress = '') {
        try {
            if (!label || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) return false;
            const cleanLabel = label.trim();
            const nLat = parseFloat(parseFloat(lat).toFixed(6));
            const nLng = parseFloat(parseFloat(lng).toFixed(6));
            const geoRules = window.BGN_CONFIG.rules_app.geocoder_rules;

            let vault = this.getVaultPlaces();
            vault = vault.filter(item => {
                const sameName = (item.title ? item.title : '').toLowerCase() === cleanLabel.toLowerCase();
                const nearCoord = this._getHaversineDistance(nLat, nLng, item.lat, item.lng) <= geoRules.vault_dedup_radius_km;
                return !sameName && !nearCoord;
            });

            vault.unshift({
                title: cleanLabel,
                subtitle: rawAddress ? rawAddress : `GMaps (${nLat.toFixed(5)}, ${nLng.toFixed(5)})`,
                lat: nLat,
                lng: nLng,
                isVault: true,
                ts: Date.now()
            });

            if (vault.length > geoRules.max_vault_places) vault = vault.slice(0, geoRules.max_vault_places);
            localStorage.setItem(this._vaultPlacesKey, JSON.stringify(vault));
            return true;
        } catch (e) {
            return false;
        }
    },

    removeFromVault: function(title) {
        this.removeSavedPlace(title);
    },

    removeSavedPlace: function(title, lat = null, lng = null) {
        try {
            const cleanTarget = String(title || '').trim().toLowerCase();
            const hasCoord = (lat !== null && lng !== null && !isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng)));
            const nLat = hasCoord ? parseFloat(lat) : 0;
            const nLng = hasCoord ? parseFloat(lng) : 0;

            const shouldKeep = (item) => {
                if (!item) return false;
                const itemTitle = String(item.title || '').trim().toLowerCase();
                if (cleanTarget && itemTitle === cleanTarget) return false;
                if (hasCoord && !isNaN(parseFloat(item.lat)) && !isNaN(parseFloat(item.lng))) {
                    if (this._getHaversineDistance(nLat, nLng, parseFloat(item.lat), parseFloat(item.lng)) <= 0.025) {
                        return false;
                    }
                }
                return true;
            };

            const vault = this.getVaultPlaces().filter(shouldKeep);
            localStorage.setItem(this._vaultPlacesKey, JSON.stringify(vault));

            const rawRecent = localStorage.getItem(this._recentPlacesKey);
            if (rawRecent) {
                const parsedRecent = JSON.parse(rawRecent);
                if (Array.isArray(parsedRecent)) {
                    const filteredRecent = parsedRecent.filter(shouldKeep);
                    localStorage.setItem(this._recentPlacesKey, JSON.stringify(filteredRecent));
                }
            }
            return true;
        } catch (e) {
            return false;
        }
    },

    clearAllSavedPlaces: function() {
        try {
            localStorage.removeItem(this._vaultPlacesKey);
            localStorage.removeItem(this._recentPlacesKey);
            return true;
        } catch (e) {
            return false;
        }
    },

    getRecentPlaces: function() {
        try {
            const geoRules = window.BGN_CONFIG.rules_app.geocoder_rules;
            const vault = this.getVaultPlaces();
            const rawRecent = localStorage.getItem(this._recentPlacesKey);
            const recent = rawRecent ? JSON.parse(rawRecent) : [];
            const validRecent = Array.isArray(recent)
                ? recent.filter(r => r && r.title && !this._isNumericOnlyPlaceLabel(r.title))
                : [];

            const combined = [...vault];
            validRecent.forEach(r => {
                const exists = combined.some(v =>
                    (v.title ? v.title : '').toLowerCase() === (r.title ? r.title : '').toLowerCase() ||
                    this._getHaversineDistance(v.lat, v.lng, r.lat, r.lng) <= geoRules.recent_dedup_radius_km
                );
                if (!exists) combined.push(r);
            });

            return combined.slice(0, geoRules.max_combined_recent_places);
        } catch (e) {
            return [];
        }
    },

    saveRecentPlace: function(title, lat, lng, subtitle = '') {
        try {
            if (!title || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) return;
            const wPins = window.BGN_CONFIG.wording.map_pins;
            const wGeo = window.BGN_CONFIG.wording.geocoder;
            const geoRules = window.BGN_CONFIG.rules_app.geocoder_rules;

            const cleanTitle = title.trim();
            if (
                cleanTitle.startsWith(wPins.map_point_prefix) ||
                cleanTitle === wPins.gps_current_accurate ||
                cleanTitle === wPins.gps_home_current ||
                this._isNumericOnlyPlaceLabel(cleanTitle)
            ) {
                return;
            }

            const nLat = parseFloat(parseFloat(lat).toFixed(6));
            const nLng = parseFloat(parseFloat(lng).toFixed(6));

            const raw = localStorage.getItem(this._recentPlacesKey);
            let list = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(list)) list = [];

            list = list.filter(item => {
                const sameName = (item.title ? item.title : '').toLowerCase() === cleanTitle.toLowerCase();
                const nearCoord = this._getHaversineDistance(nLat, nLng, item.lat, item.lng) <= geoRules.recent_dedup_radius_km;
                return !sameName && !nearCoord;
            });

            list.unshift({
                title: cleanTitle,
                subtitle: subtitle ? subtitle : wGeo.saved_history_subtitle,
                lat: nLat,
                lng: nLng,
                isVault: false,
                ts: Date.now()
            });

            if (list.length > geoRules.max_recent_places) list = list.slice(0, geoRules.max_recent_places);
            localStorage.setItem(this._recentPlacesKey, JSON.stringify(list));
        } catch (e) {}
    },

    // ==========================================
    // 2. MESIN EKSTRAKTOR PINTAR GOOGLE MAPS (4-ENGINE HYBRID + 3-TIER ACCURACY)
    // ==========================================
    _decodePlusCode: function(plusCodeStr, refLat, refLng) {
        if (!plusCodeStr || typeof plusCodeStr !== 'string') return null;
        const ALPHABET = "23456789CFGHJMPQRVWX";
        const normalizedInput = this._restorePlusCodeInLabel(plusCodeStr).toUpperCase();
        const match = normalizedInput.match(/\b([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})\b/);
        if (!match) return null;

        let code = match[1];
        const parts = code.split('+');
        const prefix = parts[0];
        const suffix = parts[1] ? parts[1] : '';

        let fullCode = code;
        if (prefix.length < 8) {
            const padCount = 8 - prefix.length;
            let latVal = Math.min(Math.max(refLat + 90, 0), 179.999999);
            let lngVal = Math.min(Math.max(refLng + 180, 0), 359.999999);

            const d1Lat = Math.floor(latVal / 20);
            const d1Lng = Math.floor(lngVal / 20);
            const d2Lat = Math.floor(latVal % 20);
            const d2Lng = Math.floor(lngVal % 20);

            let areaPrefix = ALPHABET[d1Lat] + ALPHABET[d1Lng] + ALPHABET[d2Lat] + ALPHABET[d2Lng];
            fullCode = areaPrefix.substring(0, padCount) + prefix + '+' + suffix;
        }

        const clean = fullCode.replace('+', '');
        let southLat = -90.0;
        let westLng = -180.0;
        let latRes = 20.0;
        let lngRes = 20.0;

        for (let i = 0; i < Math.min(clean.length, 10); i += 2) {
            if (i > 0) {
                latRes /= 20.0;
                lngRes /= 20.0;
            }
            const latIdx = ALPHABET.indexOf(clean[i]);
            const lngIdx = ALPHABET.indexOf(clean[i + 1]);
            if (latIdx < 0 || lngIdx < 0) return null;

            southLat += latIdx * latRes;
            westLng += lngIdx * lngRes;
        }

        if (clean.length > 10) {
            const gIdx = ALPHABET.indexOf(clean[10]);
            if (gIdx >= 0) {
                latRes /= 5.0;
                lngRes /= 4.0;
                southLat += Math.floor(gIdx / 4) * latRes;
                westLng += (gIdx % 4) * lngRes;
            }
        }

        let centerLat = southLat + (latRes / 2.0);
        let centerLng = westLng + (lngRes / 2.0);

        if (prefix.length === 4) {
            if (centerLat - refLat > 0.5) centerLat -= 1.0;
            else if (refLat - centerLat > 0.5) centerLat += 1.0;

            if (centerLng - refLng > 0.5) centerLng -= 1.0;
            else if (refLng - centerLng > 0.5) centerLng += 1.0;
        }

        return { lat: parseFloat(centerLat.toFixed(6)), lng: parseFloat(centerLng.toFixed(6)), code: match[1] };
    },

    _classifyAccuracyLevel: function(method) {
        const m = String(method || '').toUpperCase();
        if (
            m.includes('PIN') ||
            m.includes('EXPLICIT') ||
            m.includes('QUERY_COORD') ||
            m.includes('RAW_DECIMAL') ||
            m.includes('DMS_COORD') ||
            m.includes('PLUS_CODE') ||
            m.includes('PLUSCODE') ||
            m.includes('STATICMAP')
        ) {
            return 'EXACT';
        }
        if (m.includes('VIEWPORT') || m.includes('COORD_URL') || m.includes('INIT_STATE')) {
            return 'VIEWPORT';
        }
        return 'APPROX_TEXT';
    },

    _parseGmapsStringOffline: function(rawText, defaultRefLat, defaultRefLng) {
        if (!rawText) return null;
        let text = rawText.trim();
        try {
            text = text.replace(/%2C/gi, ',').replace(/%2B/gi, '+');
            text = this._restorePlusCodeInLabel(text);
        } catch (e) {}

        const wGeo = window.BGN_CONFIG.wording.geocoder;
        const idBbox = window.BGN_CONFIG.rules_app.geocoder_rules.indonesia_bbox;
        const defCenter = this._getDynamicDefaultCenter();
        const isDirectionsUrl = /\/maps\/dir\//i.test(text);

        let extractedName = "";
        try {
            const decodedUrl = this._decodeUrlPreservingPlusCode(text);
            const placeMatch = decodedUrl.match(/\/maps\/(?:place|search)\/([^/@?]+)/i);
            if (placeMatch && placeMatch[1]) {
                const candidate = this._restorePlusCodeInLabel(placeMatch[1].trim());
                if (!/^-?\d+\.\d+\s*,\s*\d+\.\d+$/.test(candidate)) {
                    extractedName = candidate;
                }
            }
            if (!extractedName) {
                const qMatch = decodedUrl.match(/[?&](?:q|query)=([^&]+)/i);
                if (qMatch && qMatch[1]) {
                    const qCand = this._restorePlusCodeInLabel(qMatch[1].trim());
                    if (qCand && !/^-?\d+\.\d+\s*,\s*\d+\.\d+$/.test(qCand) && !/^https?:\/\//i.test(qCand)) {
                        extractedName = qCand;
                    }
                }
            }
        } catch (e) {}

        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const nonUrlLines = lines.filter(l => !/^https?:\/\//i.test(l));
        if (!extractedName && nonUrlLines.length > 0) {
            extractedName = this._restorePlusCodeInLabel(nonUrlLines[0].replace(/https?:\/\/\S+/gi, '').trim());
        }

        const isInsideIndonesia = (lat, lng) => (
            lat >= idBbox.min_lat && lat <= idBbox.max_lat && lng >= idBbox.min_lng && lng <= idBbox.max_lng
        );

        // 1A. Prioritas Tertinggi: Pin Asli !3d<lat>!4d<lng>
        const allBangMatches = [...text.matchAll(/!3d(-?\d{1,2}\.\d{3,15})!4d(\d{2,3}\.\d{3,15})/g)];
        if (allBangMatches.length > 0) {
            const chosenHit = isDirectionsUrl ? allBangMatches[allBangMatches.length - 1] : allBangMatches[0];
            const lat = parseFloat(chosenHit[1]);
            const lng = parseFloat(chosenHit[2]);
            if (isInsideIndonesia(lat, lng)) {
                return {
                    lat,
                    lng,
                    name: extractedName ? extractedName : wGeo.gmaps_pin_name,
                    method: "GMAPS_PIN_URL",
                    accuracyLevel: "EXACT"
                };
            }
        }

        // 1B. Pin Protobuf !2d<lng>!3d<lat>
        const allPbMatches = [...text.matchAll(/!2d(\d{2,3}\.\d{3,15})!3d(-?\d{1,2}\.\d{3,15})/g)];
        if (allPbMatches.length > 0) {
            const chosenPb = isDirectionsUrl ? allPbMatches[allPbMatches.length - 1] : allPbMatches[0];
            const lng = parseFloat(chosenPb[1]);
            const lat = parseFloat(chosenPb[2]);
            if (isInsideIndonesia(lat, lng)) {
                return {
                    lat,
                    lng,
                    name: extractedName ? extractedName : wGeo.gmaps_pin_name,
                    method: "GMAPS_PB_PIN_URL",
                    accuracyLevel: "EXACT"
                };
            }
        }

        // 2. Prioritas Kedua: Query Koordinat Eksplisit
        const explicitQueryMatch = text.match(/(?:[?&](?:q|ll|sll|query|destination|daddr|center)=|\/maps\/(?:search|place)\/)(-?\d{1,2}\.\d{3,15})\s*,\s*(\d{2,3}\.\d{3,15})/i);
        if (explicitQueryMatch) {
            const lat = parseFloat(explicitQueryMatch[1]);
            const lng = parseFloat(explicitQueryMatch[2]);
            if (isInsideIndonesia(lat, lng)) {
                return {
                    lat,
                    lng,
                    name: extractedName ? extractedName : wGeo.gmaps_coord_name,
                    method: "GMAPS_QUERY_COORD_URL",
                    accuracyLevel: "EXACT"
                };
            }
        }

        // 3. Prioritas Ketiga: DMS (Derajat Menit Detik)
        const dmsMatch = text.match(/(\d{1,2})°\s*(\d{1,2})'\s*(\d{1,2}(?:\.\d+)?)"?\s*([NSns])\s*[, ]+\s*(\d{2,3})°\s*(\d{1,2})'\s*(\d{1,2}(?:\.\d+)?)"?\s*([EWew])/);
        if (dmsMatch) {
            let lat = parseInt(dmsMatch[1], 10) + (parseInt(dmsMatch[2], 10) / 60) + (parseFloat(dmsMatch[3]) / 3600);
            if (dmsMatch[4].toUpperCase() === 'S') lat = -lat;
            let lng = parseInt(dmsMatch[5], 10) + (parseInt(dmsMatch[6], 10) / 60) + (parseFloat(dmsMatch[7]) / 3600);
            if (dmsMatch[8].toUpperCase() === 'W') lng = -lng;
            if (isInsideIndonesia(lat, lng)) {
                return {
                    lat: parseFloat(lat.toFixed(6)),
                    lng: parseFloat(lng.toFixed(6)),
                    name: extractedName ? extractedName : wGeo.gmaps_dms_name,
                    method: "DMS_COORD",
                    accuracyLevel: "EXACT"
                };
            }
        }

        // 4. Prioritas Keempat: Plus Code (OLC) sebelum jatuh ke @viewport
        let refLat = defaultRefLat !== null && !isNaN(defaultRefLat) ? defaultRefLat : defCenter.lat;
        let refLng = defaultRefLng !== null && !isNaN(defaultRefLng) ? defaultRefLng : defCenter.lng;
        const activeZones = window.BGN_CONFIG.zones.active_zones;
        const combinedSearchableText = `${text} ${extractedName}`.toLowerCase();
        for (const z of activeZones) {
            if (z.city_name && combinedSearchableText.includes(z.city_name.toLowerCase())) {
                refLat = z.center.lat;
                refLng = z.center.lng;
                break;
            }
        }

        const plusDecoded = this._decodePlusCode(extractedName ? `${extractedName} ${text}` : text, refLat, refLng);
        if (plusDecoded && isInsideIndonesia(plusDecoded.lat, plusDecoded.lng)) {
            const codeRegex = new RegExp(plusDecoded.code.replace('+', '\\+'), 'i');
            const cleanTextNoUrl = text.replace(/https?:\/\/\S+/gi, '').replace(codeRegex, '').replace(/^[\s,.-]+/, '').trim();
            const cleanExtractedNoCode = extractedName ? extractedName.replace(codeRegex, '').replace(/^[\s,.-]+/, '').trim() : '';
            const labelAfterCode = cleanTextNoUrl || cleanExtractedNoCode;
            const resolvedPlusName = labelAfterCode ? labelAfterCode : (extractedName ? extractedName : `${wGeo.plus_code_prefix} ${plusDecoded.code}`);
            return {
                lat: plusDecoded.lat,
                lng: plusDecoded.lng,
                name: resolvedPlusName,
                method: "PLUS_CODE",
                accuracyLevel: "EXACT"
            };
        }

        // 5. Prioritas Kelima: Koordinat Desimal Mentah
        const textWithoutUrls = text.replace(/https?:\/\/\S+/gi, '').trim();
        const rawCoordOutsideUrl = textWithoutUrls.match(/(-?\d{1,2}\.\d{3,15})\s*,\s*(\d{2,3}\.\d{3,15})/);
        if (rawCoordOutsideUrl) {
            const lat = parseFloat(rawCoordOutsideUrl[1]);
            const lng = parseFloat(rawCoordOutsideUrl[2]);
            if (isInsideIndonesia(lat, lng)) {
                const cleanLabel = textWithoutUrls.replace(rawCoordOutsideUrl[0], '').replace(/[()]/g, '').trim();
                const resolvedName = cleanLabel ? cleanLabel : (extractedName ? extractedName : `${wGeo.precision_point_prefix} (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
                return {
                    lat,
                    lng,
                    name: resolvedName,
                    method: "RAW_DECIMAL",
                    accuracyLevel: "EXACT"
                };
            }
        }

        // 6. Prioritas Keenam: @lat,lng (Viewport Kamera pada URL)
        const atMatch = text.match(/@(-?\d{1,2}\.\d{3,15})\s*,\s*(\d{2,3}\.\d{3,15})/i);
        if (atMatch) {
            const lat = parseFloat(atMatch[1]);
            const lng = parseFloat(atMatch[2]);
            if (isInsideIndonesia(lat, lng)) {
                return {
                    lat,
                    lng,
                    name: extractedName ? extractedName : wGeo.gmaps_coord_name,
                    method: "GMAPS_COORD_URL",
                    accuracyLevel: "VIEWPORT"
                };
            }
        }

        const rawCoordMatch = text.match(/(-?\d{1,2}\.\d{3,15})\s*,\s*(\d{2,3}\.\d{3,15})/);
        if (rawCoordMatch) {
            const lat = parseFloat(rawCoordMatch[1]);
            const lng = parseFloat(rawCoordMatch[2]);
            if (isInsideIndonesia(lat, lng)) {
                const cleanLabel = text.replace(rawCoordMatch[0], '').replace(/[()]/g, '').trim();
                const resolvedName = cleanLabel ? cleanLabel : (extractedName ? extractedName : `${wGeo.precision_point_prefix} (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
                return {
                    lat,
                    lng,
                    name: resolvedName,
                    method: "RAW_DECIMAL",
                    accuracyLevel: "EXACT"
                };
            }
        }

        return null;
    },

    extractFromGoogleMapsInput: async function(rawInput) {
        const wAlerts = window.BGN_CONFIG.wording.alerts;
        const wGeo = window.BGN_CONFIG.wording.geocoder;
        const minLen = window.BGN_CONFIG.rules_app.form_validation.min_search_query_length;
        const defCenter = this._getDynamicDefaultCenter();
        const geoRules = window.BGN_CONFIG.rules_app.geocoder_rules;
        const idBbox = geoRules.indonesia_bbox;

        if (!rawInput || rawInput.trim().length < minLen) {
            return { ok: false, error: wAlerts.gmaps_input_empty };
        }

        const text = rawInput.trim();
        const refLat = window.BAGANTARA_USER_GPS_COORD ? window.BAGANTARA_USER_GPS_COORD.lat : (window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lat : defCenter.lat);
        const refLng = window.BAGANTARA_USER_GPS_COORD ? window.BAGANTARA_USER_GPS_COORD.lng : (window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lng : defCenter.lng);

        const isInsideIndonesia = (lat, lng) => (
            typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng) &&
            lat >= idBbox.min_lat && lat <= idBbox.max_lat && lng >= idBbox.min_lng && lng <= idBbox.max_lng
        );

        const offlineParsed = this._parseGmapsStringOffline(text, refLat, refLng);
        if (offlineParsed) {
            return {
                ok: true,
                lat: offlineParsed.lat,
                lng: offlineParsed.lng,
                name: offlineParsed.name,
                method: offlineParsed.method,
                accuracyLevel: offlineParsed.accuracyLevel || this._classifyAccuracyLevel(offlineParsed.method),
                shortUrl: null
            };
        }

        const shortUrlMatch = text.match(/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\/[a-zA-Z0-9_-]+/i);
        if (shortUrlMatch) {
            const shortUrl = shortUrlMatch[0];
            const prefixTitle = text.replace(shortUrl, '').replace(/\r?\n/g, ' ').trim();
            let discoveredTextName = '';

            const gasUnfurlUrl = window.BGN_CONFIG?.settings?.micro_backend?.gas_unfurl_url ||
                window.BGN_CONFIG?.settings?.micro_backend?.gas_fcm_url ||
                'https://script.google.com/macros/s/AKfycbxkSFTmerLbUa5iEWEqyjUz9OVBo8xTznm90HJMKDRBQ9t-x8UxjUHas_K1JqqMgHzneg/exec';
            const vercelUnfurlUrl = window.BGN_CONFIG?.settings?.vercel_api?.unfurl_maps_url || '/api/unfurl-maps';
            const clientToken = (window.BGNSecurityShield && typeof window.BGNSecurityShield.getClientToken === 'function')
                ? window.BGNSecurityShield.getClientToken()
                : 'bgn_client';
            const gasTimeoutMs = parseInt(geoRules.gas_unfurl_timeout_ms, 10) || 6500;

            try {
                let vData = null;

                // 1. Panggil Google Apps Script (?action=unfurl) terlebih dahulu (0 Kuota Vercel!)
                try {
                    const gCtrl = new AbortController();
                    const gTid = setTimeout(() => gCtrl.abort(), gasTimeoutMs);
                    const gRes = await fetch(`${gasUnfurlUrl}?action=unfurl&url=${encodeURIComponent(shortUrl)}`, {
                        method: 'GET',
                        signal: gCtrl.signal
                    });
                    clearTimeout(gTid);
                    if (gRes.ok) {
                        const gJson = await gRes.json().catch(() => null);
                        if (gJson && (gJson.ok || gJson.lat !== undefined || gJson.resolvedUrl || gJson.finalUrl)) {
                            vData = gJson;
                        }
                    }
                } catch (gasErr) {}

                // 2. Fallback via BGNSecurityShield.callGateway (100% Zero-Vercel-Function via GAS Micro-Backend)
                if (!vData && window.BGNSecurityShield && typeof window.BGNSecurityShield.callGateway === 'function') {
                    const gwUnfurl = await window.BGNSecurityShield.callGateway({
                        action: 'UNFURL_MAPS',
                        url: shortUrl
                    }, { timeoutMs: 7500 }).catch(() => null);
                    if (gwUnfurl && (gwUnfurl.ok || gwUnfurl.lat !== undefined || gwUnfurl.resolvedUrl || gwUnfurl.finalUrl)) {
                        vData = gwUnfurl;
                    }
                }

                if (vData) {
                    if (vData?.name) discoveredTextName = this._restorePlusCodeInLabel(vData.name);
                    const vLat = parseFloat(vData?.lat);
                    const vLng = parseFloat(vData?.lng);
                    if (isInsideIndonesia(vLat, vLng)) {
                        const methodUsed = vData.method || "VERCEL_UNFURL_PIN";
                        return {
                            ok: true,
                            lat: vLat,
                            lng: vLng,
                            name: prefixTitle ? prefixTitle : (discoveredTextName ? discoveredTextName : wGeo.gmaps_share_name),
                            method: methodUsed,
                            accuracyLevel: vData.accuracyLevel || this._classifyAccuracyLevel(methodUsed),
                            shortUrl: shortUrl
                        };
                    }
                    const candidateUrl = vData?.resolvedUrl || vData?.finalUrl || '';
                    if (candidateUrl) {
                        const fromResolved = this._parseGmapsStringOffline(candidateUrl, refLat, refLng);
                        if (fromResolved) {
                            return {
                                ok: true,
                                lat: fromResolved.lat,
                                lng: fromResolved.lng,
                                name: prefixTitle ? prefixTitle : (discoveredTextName || fromResolved.name),
                                method: fromResolved.method || "VERCEL_REDIRECT_PARSED",
                                accuracyLevel: fromResolved.accuracyLevel || this._classifyAccuracyLevel(fromResolved.method),
                                shortUrl: shortUrl
                            };
                        }
                        try {
                            const dec = this._decodeUrlPreservingPlusCode(candidateUrl);
                            const searchMatch = dec.match(/\/maps\/(?:search|place)\/([^/?@]+)/i) || dec.match(/[?&](?:q|query)=([^&]+)/i);
                            if (searchMatch && searchMatch[1] && !discoveredTextName) {
                                discoveredTextName = this._restorePlusCodeInLabel(searchMatch[1].trim());
                            }
                        } catch (e) {}
                    }
                    if (discoveredTextName) {
                        const fromTitlePlus = this._parseGmapsStringOffline(discoveredTextName, refLat, refLng);
                        if (fromTitlePlus) {
                            return {
                                ok: true,
                                lat: fromTitlePlus.lat,
                                lng: fromTitlePlus.lng,
                                name: prefixTitle ? prefixTitle : fromTitlePlus.name,
                                method: "VERCEL_TITLE_PLUSCODE",
                                accuracyLevel: "EXACT",
                                shortUrl: shortUrl
                            };
                        }
                    }
                }
            } catch (e) {}

            const fallbackQuery = prefixTitle.length >= minLen ? prefixTitle : discoveredTextName;
            if (fallbackQuery && fallbackQuery.length >= minLen) {
                const features = await this.search(fallbackQuery, refLat, refLng);
                if (features && features.length > 0) {
                    return {
                        ok: true,
                        lat: features[0].geometry.coordinates[1],
                        lng: features[0].geometry.coordinates[0],
                        name: prefixTitle ? prefixTitle : fallbackQuery,
                        method: "SHORTLINK_TEXT_FALLBACK",
                        accuracyLevel: "APPROX_TEXT",
                        shortUrl: shortUrl
                    };
                }
            }

            return {
                ok: false,
                error: wAlerts.gmaps_shortlink_error,
                shortUrl: shortUrl
            };
        }

        const features = await this.search(text, refLat, refLng);
        if (features && features.length > 0) {
            return {
                ok: true,
                lat: features[0].geometry.coordinates[1],
                lng: features[0].geometry.coordinates[0],
                name: features[0].text ? features[0].text : text,
                method: "ADDRESS_TEXT_SEARCH",
                accuracyLevel: "APPROX_TEXT",
                shortUrl: null
            };
        }

        return {
            ok: false,
            error: wAlerts.gmaps_parse_failed
        };
    },

    // ==========================================
    // 3. CACHE PENCARIAN & SPATIAL REVERSE
    // ==========================================
    _getSearchCache: function(queryKey) {
        try {
            const raw = localStorage.getItem(this._searchCacheKey);
            if (!raw) return null;
            const cache = JSON.parse(raw);
            const entry = cache[queryKey];
            if (!entry) return null;

            if (entry.ts && (Date.now() - entry.ts < this._getCacheTtlMs()) && Array.isArray(entry.data)) {
                return entry.data;
            }
            delete cache[queryKey];
            localStorage.setItem(this._searchCacheKey, JSON.stringify(cache));
            return null;
        } catch (e) {
            return null;
        }
    },

    _setSearchCache: function(queryKey, features) {
        try {
            const maxEntries = window.BGN_CONFIG.rules_app.geocoder_rules.max_cache_entries;
            const raw = localStorage.getItem(this._searchCacheKey);
            let cache = raw ? JSON.parse(raw) : {};
            const keys = Object.keys(cache);
            if (keys.length >= maxEntries) delete cache[keys[0]];
            cache[queryKey] = { ts: Date.now(), data: features };
            localStorage.setItem(this._searchCacheKey, JSON.stringify(cache));
        } catch (e) {}
    },

    _getReverseCache: function(lat, lng) {
        try {
            const geoRules = window.BGN_CONFIG.rules_app.geocoder_rules;
            const raw = localStorage.getItem(this._reverseCacheKey);
            if (!raw) return null;
            const list = JSON.parse(raw);
            if (!Array.isArray(list)) return null;

            const now = Date.now();
            const ttlMs = this._getCacheTtlMs();
            for (let i = 0; i < list.length; i++) {
                const item = list[i];
                if (item.ts && (now - item.ts < ttlMs) && item.address && !this._isNumericOnlyPlaceLabel(item.address)) {
                    if (this._getHaversineDistance(lat, lng, item.lat, item.lng) <= geoRules.reverse_cache_radius_km) {
                        return item.address;
                    }
                }
            }
            return null;
        } catch (e) {
            return null;
        }
    },

    _setReverseCache: function(lat, lng, address) {
        try {
            const wPins = window.BGN_CONFIG.wording.map_pins;
            const maxEntries = window.BGN_CONFIG.rules_app.geocoder_rules.max_cache_entries;
            if (!address || address.startsWith(wPins.map_point_prefix) || this._isNumericOnlyPlaceLabel(address)) return;
            const raw = localStorage.getItem(this._reverseCacheKey);
            let list = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(list)) list = [];

            const now = Date.now();
            const ttlMs = this._getCacheTtlMs();
            list = list.filter(item => item.ts && (now - item.ts < ttlMs) && !this._isNumericOnlyPlaceLabel(item.address));
            if (list.length >= maxEntries) list.shift();

            list.push({
                lat: parseFloat(parseFloat(lat).toFixed(6)),
                lng: parseFloat(parseFloat(lng).toFixed(6)),
                address: address,
                ts: now
            });
            localStorage.setItem(this._reverseCacheKey, JSON.stringify(list));
        } catch (e) {}
    },

    _normalizeAndFilterIndonesia: function(features, refLat = null, refLng = null) {
        if (!Array.isArray(features)) return [];
        const valid = [];
        const geoRules = window.BGN_CONFIG.rules_app.geocoder_rules;
        const idBbox = geoRules.indonesia_bbox;
        const wGeo = window.BGN_CONFIG.wording.geocoder;

        for (let i = 0; i < features.length; i++) {
            const item = features[i];
            if (!item || !item.geometry || !Array.isArray(item.geometry.coordinates)) continue;

            const lon = parseFloat(item.geometry.coordinates[0]);
            const lat = parseFloat(item.geometry.coordinates[1]);
            if (isNaN(lat) || isNaN(lon)) continue;

            if (lat < idBbox.min_lat || lat > idBbox.max_lat || lon < idBbox.min_lng || lon > idBbox.max_lng) continue;

            const p = item.properties ? item.properties : {};
            const rawCc = p.countrycode ? p.countrycode : (p.country_code ? p.country_code : '');
            const cc = String(rawCc).toUpperCase();
            if (cc && cc !== geoRules.country_code) continue;

            const fallbackTitle = item.text_id || item.text || p.name || p.street || p.locality || p.district || p.city || wGeo.detected_location;
            const title = String(fallbackTitle).trim();
            const joinedParts = [p.street, p.locality, p.district, p.city, p.state].filter(Boolean).join(', ');
            const subtitle = String(item.place_name_id || item.place_name || joinedParts || wGeo.default_region).trim();

            const distKm = (refLat !== null && refLng !== null && !isNaN(refLat) && !isNaN(refLng))
                ? this._getHaversineDistance(refLat, refLng, lat, lon)
                : 0;

            valid.push({
                geometry: item.geometry,
                text: title,
                place_name: subtitle,
                _distKm: distKm,
                properties: {
                    ...p,
                    name: title,
                    place_name: subtitle
                }
            });
        }

        if (refLat !== null && refLng !== null) {
            valid.sort((a, b) => a._distKm - b._distKm);
        }

        return valid;
    },

    // ==========================================
    // 4. PENCARIAN ALAMAT (100% MAPTILER GEOCODING API - 0% PHOTON/OSM)
    // ==========================================
    search: async function(query, lat = null, lng = null) {
        const minLen = window.BGN_CONFIG.rules_app.form_validation.min_search_query_length;
        if (!query || query.trim().length < minLen) return [];
        const cleanQuery = query.trim().toLowerCase();

        const defCenter = this._getDynamicDefaultCenter();
        const geoRules = window.BGN_CONFIG.rules_app.geocoder_rules;
        const wGeo = window.BGN_CONFIG.wording.geocoder;

        const refLat = (lat !== null && !isNaN(lat)) ? parseFloat(lat) : (window.BAGANTARA_USER_GPS_COORD ? window.BAGANTARA_USER_GPS_COORD.lat : (window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lat : defCenter.lat));
        const refLng = (lng !== null && !isNaN(lng)) ? parseFloat(lng) : (window.BAGANTARA_USER_GPS_COORD ? window.BAGANTARA_USER_GPS_COORD.lng : (window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lng : defCenter.lng));

        const restoredQuery = this._restorePlusCodeInLabel(query.trim());
        if (/(-?\d{1,2}\.\d{3,12}\s*,\s*\d{2,3}\.\d{3,12})|([23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3})/i.test(restoredQuery)) {
            const direct = this._parseGmapsStringOffline(restoredQuery, refLat, refLng);
            if (direct) {
                const subText = `${wGeo.precision_coord_prefix} (${direct.lat.toFixed(5)}, ${direct.lng.toFixed(5)})`;
                return [{
                    geometry: { type: 'Point', coordinates: [direct.lng, direct.lat] },
                    text: direct.name,
                    place_name: subText,
                    properties: { name: direct.name, place_name: subText }
                }];
            }
        }

        const cacheKey = `${cleanQuery}_${refLat.toFixed(2)}_${refLng.toFixed(2)}`;
        const cached = this._getSearchCache(cacheKey);
        if (cached && cached.length > 0) return cached;

        const geoCfg = window.BGN_CONFIG.settings.geocoder_api || {};
        const mtKey = geoCfg.maptiler_key || this._maptilerKey || 'GHEMVdokax4heMQCeIxM';
        const bboxDelta = geoRules.local_bbox_delta_deg || 0.65;

        const minLon = (refLng - bboxDelta).toFixed(4);
        const minLat = (refLat - bboxDelta).toFixed(4);
        const maxLon = (refLng + bboxDelta).toFixed(4);
        const maxLat = (refLat + bboxDelta).toFixed(4);
        const bboxParam = `${minLon},${minLat},${maxLon},${maxLat}`;
        const searchTimeoutMs = geoRules.maptiler_search_timeout_ms || 4500;

        // 1. Panggil MapTiler Geocoding API Langsung (Lokal + Proximity, lalu Nasional jika kosong)
        const mtUrls = [
            `https://api.maptiler.com/geocoding/${encodeURIComponent(query.trim())}.json?key=${encodeURIComponent(mtKey)}&country=id&language=id&proximity=${refLng},${refLat}&bbox=${bboxParam}&limit=6`,
            `https://api.maptiler.com/geocoding/${encodeURIComponent(query.trim())}.json?key=${encodeURIComponent(mtKey)}&country=id&language=id&proximity=${refLng},${refLat}&limit=6`
        ];

        for (const mtUrl of mtUrls) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), searchTimeoutMs);
                const res = await fetch(mtUrl, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const data = await res.json();
                    const filtered = this._normalizeAndFilterIndonesia(Array.isArray(data.features) ? data.features : [], refLat, refLng);
                    if (filtered.length > 0) {
                        this._setSearchCache(cacheKey, filtered);
                        return filtered;
                    }
                }
            } catch (mtErr) {}
        }

        return [];
    },

    // ==========================================
    // 5. REVERSE GEOCODE (SPATIAL 75M -> MAPTILER REVERSE LIMIT=5 -> BFF GATEWAY)
    // ==========================================
    reverseGeocode: async function(lat, lng, saveToRecent = false) {
        const wGeo = window.BGN_CONFIG.wording.geocoder;
        const wPins = window.BGN_CONFIG.wording.map_pins;
        const geoRules = window.BGN_CONFIG.rules_app.geocoder_rules;
        if (lat === null || lng === null || isNaN(lat) || isNaN(lng)) return wGeo.invalid_coord;

        const nLat = parseFloat(lat);
        const nLng = parseFloat(lng);

        const cachedAddress = this._getReverseCache(nLat, nLng);
        if (cachedAddress) {
            if (saveToRecent === true) {
                this.saveRecentPlace(cachedAddress, nLat, nLng, wGeo.locked_map_point_subtitle);
            }
            return cachedAddress;
        }

        const geoCfg = window.BGN_CONFIG.settings.geocoder_api || {};
        const mtKey = geoCfg.maptiler_key || this._maptilerKey || 'GHEMVdokax4heMQCeIxM';
        const fallbackCoordText = `${wPins.map_point_prefix} (${nLat.toFixed(5)}, ${nLng.toFixed(5)})`;
        const revTimeoutMs = geoRules.maptiler_reverse_timeout_ms || 4000;

        // 1. Panggil MapTiler Reverse Geocoding API Langsung (limit=5 untuk memilih nama jalan/desa/kecamatan deskriptif)
        try {
            const mtRevUrl = `https://api.maptiler.com/geocoding/${nLng},${nLat}.json?key=${encodeURIComponent(mtKey)}&language=id&limit=5`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), revTimeoutMs);

            const res = await fetch(mtRevUrl, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                if (data && Array.isArray(data.features) && data.features.length > 0) {
                    const resolvedAddr = this._extractDescriptiveReverseAddress(data.features);
                    if (resolvedAddr) {
                        this._setReverseCache(nLat, nLng, resolvedAddr);
                        if (saveToRecent === true) {
                            this.saveRecentPlace(resolvedAddr, nLat, nLng, wGeo.locked_map_point_subtitle);
                        }
                        return resolvedAddr;
                    }
                }
            }
        } catch (e) {}

        return fallbackCoordText;
    }
};