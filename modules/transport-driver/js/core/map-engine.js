// ==========================================
// MESIN PEMETAAN RUTE PENUMPANG (100% MAPTILER RASTER TILE ENGINE - ZERO OSM/CARTODB)
// ARSITEKTUR: LAZY INIT, IDLE-ONLY TILE FETCH, ZERO-ANIMATION JUMP, AUTO-FAILOVER MAPTILER CDN
// ==========================================

window.MapEngine = {
    map: null,
    mainMap: null,
    wizardLayer: null,
    osrmAbortController: null,
    _mainTileLoaded: false,
    _lastUserLat: null,
    _lastUserLng: null,
    _qfRevReqId: 0,
    
    activeMode: 'DROPOFF',
    pickupCoords: null,
    dropoffCoords: null,
    
    pinElements: {
        container: document.createElement('div'),
        label: document.createElement('div'),
        marker: document.createElement('div'),
        shadow: document.createElement('div')
    },

    init: function() {
        this.setupEventListeners();
    },

    _getFallbackCenter: function() {
        if (window.BAGANTARA_USER_GPS_COORD && !isNaN(parseFloat(window.BAGANTARA_USER_GPS_COORD.lat))) {
            return {
                lat: parseFloat(window.BAGANTARA_USER_GPS_COORD.lat),
                lng: parseFloat(window.BAGANTARA_USER_GPS_COORD.lng)
            };
        }
        if (window.ConfigManager && typeof window.ConfigManager.getActiveZoneCenter === 'function') {
            return window.ConfigManager.getActiveZoneCenter();
        }
        return window.BGN_CONFIG.settings.map_config.default_center;
    },

    _ensureTileLayer: function(mapInstance) {
        if (!mapInstance || this._mainTileLoaded) return;
        const mapCfg = window.BGN_CONFIG.settings.map_config;
        const maptilerDirectUrl = (mapCfg.tile_layer_url && !String(mapCfg.tile_layer_url).includes('/api/bgn-gateway'))
            ? mapCfg.tile_layer_url
            : 'https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=GHEMVdokax4heMQCeIxM';
        const osmFallbackUrl = mapCfg.fallback_tile_url || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        const mapZoom = mapCfg.max_zoom || 19;
        const tileSize = mapCfg.tile_size || 256;
        const keepBuffer = mapCfg.keep_buffer || 2;

        // Gunakan CDN Resmi MapTiler streets-v2 secara langsung (0 Kuota Vercel!) & fallback ke OSM jika tileerror
        const tileLayer = L.tileLayer(maptilerDirectUrl, {
            maxZoom: mapZoom,
            tileSize: tileSize,
            crossOrigin: true,
            updateWhenIdle: true,
            updateWhenZooming: false,
            keepBuffer: keepBuffer
        }).addTo(mapInstance);

        let errorCount = 0;
        let switchedToFallback = false;
        tileLayer.on('tileerror', () => {
            errorCount++;
            if (!switchedToFallback && errorCount >= (mapCfg.max_tile_errors || 2)) {
                switchedToFallback = true;
                tileLayer.setUrl(osmFallbackUrl);
            }
        });

        this._mainTileLoaded = true;
    },

    setupEventListeners: function() {
        window.addEventListener('wizardState', (e) => this.handleWizardState(e.detail));
        window.addEventListener('bgn_config_loaded', () => {
            const defCenter = this._getFallbackCenter();
            if (this._lastUserLat === null) this._lastUserLat = defCenter.lat;
            if (this._lastUserLng === null) this._lastUserLng = defCenter.lng;
            if (this.mainMap) this._ensureTileLayer(this.mainMap);
        });
        
        const btnMyGPS = document.getElementById('btnMyGPS');
        if (btnMyGPS) {
            btnMyGPS.addEventListener('click', () => {
                if (navigator.geolocation && this.mainMap) {
                    const focusZoom = window.BGN_CONFIG.settings.map_config.focus_zoom;
                    navigator.geolocation.getCurrentPosition((pos) => {
                        const uLat = pos.coords.latitude;
                        const uLng = pos.coords.longitude;
                        window.BAGANTARA_USER_GPS_COORD = { lat: uLat, lng: uLng, ts: Date.now() };
                        window.LOCKED_SEARCH_COORD = null;
                        window.LOCKED_SEARCH_TEXT = null;
                        window.LOCKED_SEARCH_TARGET = null;
                        this.mainMap.setView([uLat, uLng], focusZoom, { animate: false });
                        this._syncMapCenterState(uLat, uLng, null);
                    });
                }
            });
        }
    },

    _syncMapCenterState: function(lat, lng, explicitLabel = null) {
        const nLat = parseFloat(lat);
        const nLng = parseFloat(lng);
        if (isNaN(nLat) || isNaN(nLng)) return;

        window.BAGANTARA_ACTIVE_COORD = { lat: nLat, lng: nLng };
        this.updatePinVisual(this.activeMode);

        if (window.BAGANTARA_QUICK_FARE_MAP_MODE === true) {
            const qfCtx = window.BAGANTARA_QUICK_FARE_MAP_CTX || (window.UIManager && window.UIManager._quickFareMapContext) || null;
            const initLat = qfCtx ? parseFloat(qfCtx.initialLat) : NaN;
            const initLng = qfCtx ? parseFloat(qfCtx.initialLng) : NaN;
            const initTitle = qfCtx && qfCtx.initialTitle ? String(qfCtx.initialTitle).trim() : '';
            const distFromInitKm = (!isNaN(initLat) && !isNaN(initLng))
                ? this.getHaversineDistance(nLat, nLng, initLat, initLng)
                : 999;

            const liveAddressEl = document.getElementById('liveAddressTitle');
            if (explicitLabel && String(explicitLabel).trim() !== '') {
                window.TEMPORARY_GEOCODE = String(explicitLabel).trim();
                if (liveAddressEl) liveAddressEl.innerText = window.TEMPORARY_GEOCODE;
            } else if (distFromInitKm < 0.03 && initTitle) {
                window.TEMPORARY_GEOCODE = initTitle;
                if (liveAddressEl) liveAddressEl.innerText = initTitle;
            } else if (window.GeocoderAPI && typeof window.GeocoderAPI.reverseGeocode === 'function') {
                const reqId = ++this._qfRevReqId;
                window.GeocoderAPI.reverseGeocode(nLat, nLng, false).then((resolvedAddr) => {
                    if (!window.BAGANTARA_QUICK_FARE_MAP_MODE || this._qfRevReqId !== reqId) return;
                    if (resolvedAddr && String(resolvedAddr).trim() !== '') {
                        window.TEMPORARY_GEOCODE = String(resolvedAddr).trim();
                        const currLiveEl = document.getElementById('liveAddressTitle');
                        if (currLiveEl) currLiveEl.innerText = window.TEMPORARY_GEOCODE;
                    }
                }).catch(() => {});
            }

            if (this.activeMode === 'DROPOFF') this.dropoffCoords = { lat: nLat, lng: nLng };
            return;
        }

        const toleranceKm = window.BGN_CONFIG.rules_app.map_and_routing.search_lock_tolerance_km;
        const pointPrefix = window.BGN_CONFIG.wording.map_pins.map_point_prefix;

        if (explicitLabel && String(explicitLabel).trim() !== '') {
            window.TEMPORARY_GEOCODE = String(explicitLabel).trim();
        } else {
            let isLockedBySearch = false;
            if (window.LOCKED_SEARCH_COORD && window.LOCKED_SEARCH_TEXT) {
                const distanceShifted = this.getHaversineDistance(nLat, nLng, window.LOCKED_SEARCH_COORD.lat, window.LOCKED_SEARCH_COORD.lng);
                if (distanceShifted <= toleranceKm) isLockedBySearch = true;
            }

            if (isLockedBySearch) {
                window.TEMPORARY_GEOCODE = window.LOCKED_SEARCH_TEXT;
            } else {
                window.LOCKED_SEARCH_TEXT = null;
                window.LOCKED_SEARCH_COORD = null;
                window.LOCKED_SEARCH_TARGET = null;
                window.TEMPORARY_GEOCODE = `${pointPrefix} (${nLat.toFixed(5)}, ${nLng.toFixed(5)})`;
            }
        }

        const liveAddress = document.getElementById('liveAddressTitle');
        if (liveAddress) liveAddress.innerText = window.TEMPORARY_GEOCODE;
        window.dispatchEvent(new Event('mapStopped'));

        if (this.activeMode === 'DROPOFF') this.dropoffCoords = { lat: nLat, lng: nLng };
        else if (this.activeMode === 'PICKUP' || this.activeMode === 'JASTIP_STORE') this.pickupCoords = { lat: nLat, lng: nLng };
    },

    recalibrateMapSize: function(targetCoord = null, targetZoom = null) {
        if (!this.mainMap) return;
        this.mainMap.invalidateSize({ pan: false });
        if (targetCoord && !isNaN(parseFloat(targetCoord.lat)) && !isNaN(parseFloat(targetCoord.lng))) {
            const z = targetZoom ? targetZoom : this.mainMap.getZoom();
            this.mainMap.setView([parseFloat(targetCoord.lat), parseFloat(targetCoord.lng)], z, { animate: false });
        }
    },

    initMainMap: function() {
        if (this.mainMap) {
            this.map = this.mainMap;
            this._ensureTileLayer(this.mainMap);
            this.recalibrateMapSize();
            setTimeout(() => { this.recalibrateMapSize(); }, 80);
            return; 
        }
        const mapContainer = document.getElementById('map-container');
        if (!mapContainer) return;

        const mapCfg = window.BGN_CONFIG.settings.map_config;
        const defCenter = this._getFallbackCenter();
        const defaultZoom = mapCfg.default_zoom;

        let startLat = window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lat : defCenter.lat;
        let startLng = window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD.lng : defCenter.lng;

        this.mainMap = L.map('map-container', {
            zoomControl: false,
            attributionControl: false,
            fadeAnimation: true,
            zoomAnimation: false
        });
        this.map = this.mainMap;

        this._ensureTileLayer(this.mainMap);
        this.wizardLayer = L.featureGroup().addTo(this.mainMap);

        // Pasang listener pin & moveend SEBELUM setView pertama agar tidak ada state yang terlewat
        this.setupCenterPin(mapContainer);
        this.mainMap.setView([startLat, startLng], defaultZoom, { animate: false });

        if (!window.BAGANTARA_ACTIVE_COORD) {
            window.BAGANTARA_ACTIVE_COORD = { lat: startLat, lng: startLng };
        }

        if (typeof ResizeObserver !== 'undefined' && !this._mapResizeObserver) {
            this._mapResizeObserver = new ResizeObserver(() => {
                if (this.mainMap) {
                    this.mainMap.invalidateSize({ pan: false });
                }
            });
            this._mapResizeObserver.observe(mapContainer);
            const dynPanel = document.getElementById('dynamicOrderPanel');
            if (dynPanel) this._mapResizeObserver.observe(dynPanel);
        }
    },

    setupCenterPin: function(mapContainer) {
        this.pinElements.container.className = 'center-pin-container';
        this.pinElements.label.className = 'pin-label';
        this.pinElements.marker.className = 'css-pin-marker';
        this.pinElements.shadow.className = 'pin-shadow-base';
        
        this.pinElements.container.appendChild(this.pinElements.label);
        this.pinElements.container.appendChild(this.pinElements.shadow);
        this.pinElements.container.appendChild(this.pinElements.marker);
        mapContainer.appendChild(this.pinElements.container);

        this.updatePinVisual(this.activeMode);

        this.mainMap.on('movestart', () => {
            mapContainer.classList.add('map-is-moving');
            const dynPanel = document.getElementById('dynamicOrderPanel');
            if (dynPanel) dynPanel.classList.add('map-dragging-panel');
            this.pinElements.label.innerText = window.BGN_CONFIG.wording.map_pins.scanning;
            window.dispatchEvent(new Event('mapIsMoving')); 
        });

        this.mainMap.on('moveend', () => {
            mapContainer.classList.remove('map-is-moving');
            const dynPanel = document.getElementById('dynamicOrderPanel');
            if (dynPanel) dynPanel.classList.remove('map-dragging-panel');
            if (navigator.vibrate) navigator.vibrate(30); 

            const center = this.mainMap.getCenter();
            this._syncMapCenterState(center.lat, center.lng, null);
        });
    },

    updatePinVisual: function(mode) {
        const mapContainer = document.getElementById('map-container');
        const pinTypeIcon = document.getElementById('pinTypeIcon');
        const inputInlineNotes = document.getElementById('inputInlineNotes');

        const wPopup = window.BGN_CONFIG.wording.mitra_popup;
        const service = window.BAGANTARA_SERVICE ? window.BAGANTARA_SERVICE : wPopup.default_service;
        const wMap = window.BGN_CONFIG.wording.map_pins;
        
        let labelDropoff = wMap.dropoff_default;
        let labelPickup = wMap.pickup_default;
        let placeholderNotes = wMap.notes_default;

        if (service === 'JASTIP') {
            if (mode === 'JASTIP_STORE') {
                labelPickup = wMap.pickup_jastip;
                placeholderNotes = wMap.notes_jastip_store;
            } else {
                labelDropoff = wMap.dropoff_jastip;
                placeholderNotes = wMap.notes_jastip_drop;
            }
        } else if (service === 'EXPRESS') {
            labelPickup = wMap.pickup_express;
            labelDropoff = wMap.dropoff_express;
            placeholderNotes = wMap.notes_express;
        } else if (service === 'CAR') {
            placeholderNotes = wMap.notes_car;
        }

        if (mode === 'DROPOFF') {
            this.pinElements.label.innerText = labelDropoff;
            this.pinElements.label.style.borderColor = '#ef4444'; 
            this.pinElements.label.style.color = '#ef4444';
            mapContainer.classList.remove('pickup-mode', 'jastip-store-mode'); 
            if (pinTypeIcon) { pinTypeIcon.className = 'fa-solid fa-location-dot'; pinTypeIcon.style.color = '#ef4444'; }
            this.pinElements.marker.style.background = '#ef4444';
            this.pinElements.marker.style.boxShadow = '0 0 10px #ef4444';
        } else if (mode === 'JASTIP_STORE') {
            this.pinElements.label.innerText = labelPickup; 
            this.pinElements.label.style.borderColor = '#3b82f6'; 
            this.pinElements.label.style.color = '#3b82f6';
            mapContainer.classList.remove('pickup-mode');
            mapContainer.classList.add('jastip-store-mode'); 
            if (pinTypeIcon) { pinTypeIcon.className = 'fa-solid fa-store'; pinTypeIcon.style.color = '#3b82f6'; }
            this.pinElements.marker.style.background = '#3b82f6';
            this.pinElements.marker.style.boxShadow = '0 0 10px #3b82f6';
        } else {
            this.pinElements.label.innerText = labelPickup;
            this.pinElements.label.style.borderColor = '#bd8c11'; 
            this.pinElements.label.style.color = '#bd8c11';
            mapContainer.classList.remove('jastip-store-mode');
            mapContainer.classList.add('pickup-mode'); 
            if (pinTypeIcon) { pinTypeIcon.className = 'fa-solid fa-location-dot'; pinTypeIcon.style.color = '#bd8c11'; }
            this.pinElements.marker.style.background = '#bd8c11';
            this.pinElements.marker.style.boxShadow = '0 0 10px #bd8c11';
        }
        
        if (inputInlineNotes) inputInlineNotes.placeholder = placeholderNotes;
    },

    dropStaticMarker: function(mode, coords, indexLabel = '') {
        const pinColor = mode === 'PICKUP' ? '#bd8c11' : '#ef4444'; 
        const labelHtml = indexLabel ? `<div style="position: absolute; top: -20px; left: 16px; transform: translateX(-50%); background: rgba(0,0,0,0.85); border: 1px solid #bd8c11; border-radius: 12px; padding: 2px 8px; color: #bd8c11; font-weight: 900; font-size: 12px; font-family: 'Space Grotesk', sans-serif; z-index: 10; box-shadow: 0 2px 5px rgba(0,0,0,0.8); pointer-events: none; white-space: nowrap;">${indexLabel}</div>` : '';
        
        const customIcon = L.divIcon({
            className: 'static-css-icon',
            html: `
                <div style="position:relative; width: 32px; height: 40px;">
                    <div class="pin-shadow-base"></div>
                    <div class="css-pin-marker" style="background: ${pinColor}; border-color: #fff; animation: none; box-shadow: 0 0 8px ${pinColor};"></div>
                    ${labelHtml}
                </div>
            `,
            iconSize: [32, 40], iconAnchor: [16, 38] 
        });
        L.marker([coords.lat, coords.lng], { icon: customIcon }).addTo(this.wizardLayer);
    },

    handleWizardState: function(state) {
        if (state === 'SEARCH_ROUTE' || window.BAGANTARA_QUICK_FARE_MAP_MODE === true) return;

        this.initMainMap();
        const focusZoom = window.BGN_CONFIG.settings.map_config.focus_zoom;

        if (this.wizardLayer) this.wizardLayer.clearLayers();
        if (this.osrmAbortController) { this.osrmAbortController.abort(); this.osrmAbortController = null; }

        if (state === 'DROPOFF_PIN') {
            this.activeMode = 'DROPOFF';
            this.pinElements.container.style.display = 'flex';
            this.updatePinVisual('DROPOFF');
            
            const targetIdx = window.BAGANTARA_MAP_TARGET_INDEX ? window.BAGANTARA_MAP_TARGET_INDEX : 1;
            const expectedTargetKey = (window.BAGANTARA_SERVICE === 'JASTIP') ? 'JASTIP_DROPOFF' : `DROPOFF_${targetIdx}`;
            let existingCoord = null;
            let existingLabel = null;
            
            if (window.BAGANTARA_PICKUP_COORD) {
                const [pLat, pLng] = window.BAGANTARA_PICKUP_COORD.split(',');
                if (!isNaN(parseFloat(pLat)) && !isNaN(parseFloat(pLng))) {
                    this.dropStaticMarker('PICKUP', { lat: parseFloat(pLat), lng: parseFloat(pLng) });
                }
            }

            const multi = window.BAGANTARA_MULTI_DROPOFFS ? window.BAGANTARA_MULTI_DROPOFFS : [];
            multi.forEach((m, idx) => {
                if (m && (idx + 1) !== targetIdx && !isNaN(parseFloat(m.lat)) && !isNaN(parseFloat(m.lng))) {
                    this.dropStaticMarker('DROPOFF', { lat: parseFloat(m.lat), lng: parseFloat(m.lng) }, (idx + 1).toString());
                }
            });
            
            if (multi && multi[targetIdx - 1] && !isNaN(parseFloat(multi[targetIdx - 1].lat)) && !isNaN(parseFloat(multi[targetIdx - 1].lng))) {
                existingCoord = `${multi[targetIdx - 1].lat},${multi[targetIdx - 1].lng}`;
                existingLabel = multi[targetIdx - 1].name ? multi[targetIdx - 1].name : null;
            } else if (targetIdx === 1 && window.BAGANTARA_DROPOFF_COORD) {
                existingCoord = window.BAGANTARA_DROPOFF_COORD;
                existingLabel = window.BAGANTARA_DROPOFF_DETAIL?.kec ? window.BAGANTARA_DROPOFF_DETAIL.kec : null;
            }

            const isTargetMatchedLock = Boolean(
                window.LOCKED_SEARCH_COORD &&
                window.LOCKED_SEARCH_TEXT &&
                (!window.LOCKED_SEARCH_TARGET || window.LOCKED_SEARCH_TARGET === expectedTargetKey)
            );
            
            if (isTargetMatchedLock) {
                const sLat = parseFloat(window.LOCKED_SEARCH_COORD.lat);
                const sLng = parseFloat(window.LOCKED_SEARCH_COORD.lng);
                this.mainMap.setView([sLat, sLng], focusZoom, { animate: false });
                this._syncMapCenterState(sLat, sLng, window.LOCKED_SEARCH_TEXT);
                setTimeout(() => {
                    if (this.mainMap) {
                        this.mainMap.invalidateSize({ pan: false });
                        this.mainMap.setView([sLat, sLng], focusZoom, { animate: false });
                    }
                }, 80);
            } else if (existingCoord) {
                this.flyToCoordinate(existingCoord, focusZoom, existingLabel);
            } else {
                const fallbackCoord = window.BAGANTARA_PICKUP_COORD
                    ? window.BAGANTARA_PICKUP_COORD
                    : `${this._getFallbackCenter().lat},${this._getFallbackCenter().lng}`;
                window.LOCKED_SEARCH_COORD = null;
                window.LOCKED_SEARCH_TEXT = null;
                window.LOCKED_SEARCH_TARGET = expectedTargetKey;
                this.flyToCoordinate(fallbackCoord, focusZoom, null);
            }
        } 
        else if (state === 'PICKUP' || state === 'JASTIP_STORE') {
            this.activeMode = state;
            this.pinElements.container.style.display = 'flex';
            this.updatePinVisual(state); 

            const expectedTargetKey = (state === 'JASTIP_STORE') ? 'JASTIP_STORE' : 'PICKUP';

            const multi = window.BAGANTARA_MULTI_DROPOFFS ? window.BAGANTARA_MULTI_DROPOFFS : [];
            if (multi.length > 0) {
                multi.forEach((m, idx) => {
                    if (m && !isNaN(parseFloat(m.lat)) && !isNaN(parseFloat(m.lng))) {
                        this.dropStaticMarker('DROPOFF', { lat: parseFloat(m.lat), lng: parseFloat(m.lng) }, (idx + 1).toString());
                    }
                });
            } else if (window.BAGANTARA_DROPOFF_COORD) {
                const [lat, lng] = window.BAGANTARA_DROPOFF_COORD.split(',');
                if (!isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
                    this.dropStaticMarker('DROPOFF', { lat: parseFloat(lat), lng: parseFloat(lng) }, "1");
                }
            }

            const existingPickupCoord = window.BAGANTARA_PICKUP_COORD;
            const existingPickupLabel = (state === 'JASTIP_STORE')
                ? (window.BAGANTARA_JASTIP_STORE?.address ? window.BAGANTARA_JASTIP_STORE.address : null)
                : (window.BAGANTARA_PICKUP_DETAIL?.kec ? window.BAGANTARA_PICKUP_DETAIL.kec : null);

            const isTargetMatchedLock = Boolean(
                window.LOCKED_SEARCH_COORD &&
                window.LOCKED_SEARCH_TEXT &&
                (!window.LOCKED_SEARCH_TARGET || window.LOCKED_SEARCH_TARGET === expectedTargetKey)
            );
            
            if (isTargetMatchedLock) {
                const sLat = parseFloat(window.LOCKED_SEARCH_COORD.lat);
                const sLng = parseFloat(window.LOCKED_SEARCH_COORD.lng);
                this.mainMap.setView([sLat, sLng], focusZoom, { animate: false });
                this._syncMapCenterState(sLat, sLng, window.LOCKED_SEARCH_TEXT);
                setTimeout(() => {
                    if (this.mainMap) {
                        this.mainMap.invalidateSize({ pan: false });
                        this.mainMap.setView([sLat, sLng], focusZoom, { animate: false });
                    }
                }, 80);
            } else if (existingPickupCoord) {
                this.flyToCoordinate(existingPickupCoord, focusZoom, existingPickupLabel);
            } else {
                const fb = this._getFallbackCenter();
                window.LOCKED_SEARCH_COORD = null;
                window.LOCKED_SEARCH_TEXT = null;
                window.LOCKED_SEARCH_TARGET = expectedTargetKey;
                this.flyToCoordinate(`${fb.lat},${fb.lng}`, focusZoom, null);
            }
        }
        else if (state === 'CALCULATE') {
            this.pinElements.container.style.display = 'none';
            
            let finalPickup = null;
            if (window.BAGANTARA_PICKUP_COORD) {
                const [lat, lng] = window.BAGANTARA_PICKUP_COORD.split(',');
                if (!isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
                    finalPickup = { lat: parseFloat(lat), lng: parseFloat(lng) };
                    this.dropStaticMarker('PICKUP', finalPickup);
                }
            }

            const multi = window.BAGANTARA_MULTI_DROPOFFS ? window.BAGANTARA_MULTI_DROPOFFS : [];
            if (multi.length > 0) {
                multi.forEach((m, idx) => {
                    if (m && !isNaN(parseFloat(m.lat)) && !isNaN(parseFloat(m.lng))) {
                        this.dropStaticMarker('DROPOFF', { lat: parseFloat(m.lat), lng: parseFloat(m.lng) }, (idx + 1).toString());
                    }
                });
            } else if (window.BAGANTARA_DROPOFF_COORD) {
                const [lat, lng] = window.BAGANTARA_DROPOFF_COORD.split(',');
                if (!isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
                    this.dropStaticMarker('DROPOFF', { lat: parseFloat(lat), lng: parseFloat(lng) }, "1");
                }
            }
            
            setTimeout(() => { if (this.mainMap) this.mainMap.invalidateSize({ pan: false }); }, 80);
            if (finalPickup) this.calculatePrecisionRouteMulti(finalPickup);
        }
    },

    flyToCoordinate: function(coordStr, customZoom = null, explicitLabel = null) {
        const targetZoom = customZoom ? customZoom : window.BGN_CONFIG.settings.map_config.default_zoom;
        let targetLat = null;
        let targetLng = null;

        if (coordStr) {
            const [lat, lng] = String(coordStr).split(',');
            if (!isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) {
                targetLat = parseFloat(lat);
                targetLng = parseFloat(lng);
            }
        }

        if (targetLat === null || targetLng === null) {
            const fb = this._getFallbackCenter();
            targetLat = fb.lat;
            targetLng = fb.lng;
        }

        if (explicitLabel && String(explicitLabel).trim() !== '') {
            window.LOCKED_SEARCH_COORD = { lat: targetLat, lng: targetLng };
            window.LOCKED_SEARCH_TEXT = String(explicitLabel).trim();
        }

        this.mainMap.setView([targetLat, targetLng], targetZoom, { animate: false });
        this._syncMapCenterState(targetLat, targetLng, explicitLabel);

        setTimeout(() => {
            if (this.mainMap) {
                this.mainMap.invalidateSize({ pan: false });
                this.mainMap.setView([targetLat, targetLng], targetZoom, { animate: false });
                this._syncMapCenterState(targetLat, targetLng, explicitLabel);
            }
        }, 80);
    },

    getHaversineDistance: function(lat1, lon1, lat2, lon2) {
        if (window.AegisEngine && typeof window.AegisEngine.calculateDistance === 'function') {
            return window.AegisEngine.calculateDistance(lat1, lon1, lat2, lon2);
        }
        const R = window.BGN_CONFIG.rules_app.system_controls.earth_radius_km;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    },

    calculatePrecisionRouteMulti: function(startPoint) {
        if (this._routeTimeout) clearTimeout(this._routeTimeout);
        const mapRouting = window.BGN_CONFIG.rules_app.map_and_routing;
        const debounceMs = mapRouting.route_calc_debounce_ms;
        
        this._routeTimeout = setTimeout(async () => {
            const multi = window.BAGANTARA_MULTI_DROPOFFS ? window.BAGANTARA_MULTI_DROPOFFS : [];
            let segments = [startPoint];
            
            if (multi.length > 0) {
                multi.forEach(m => { 
                    if (m && !isNaN(parseFloat(m.lat)) && !isNaN(parseFloat(m.lng))) segments.push({ lat: parseFloat(m.lat), lng: parseFloat(m.lng) }); 
                });
            } else if (window.BAGANTARA_DROPOFF_COORD) {
                const [lat, lng] = window.BAGANTARA_DROPOFF_COORD.split(',');
                if (!isNaN(parseFloat(lat)) && !isNaN(parseFloat(lng))) segments.push({ lat: parseFloat(lat), lng: parseFloat(lng) });
            }
            
            if (segments.length < 2) return;

            let coordStrs = segments.map(s => `${s.lng},${s.lat}`);
            const osrmBase = window.BGN_CONFIG.settings.routing_api.osrm_base_url;
            const osrmUrl = `${osrmBase}${coordStrs.join(';')}?overview=full&geometries=geojson`;
            
            let fallbackDistance = 0;
            for (let i = 0; i < segments.length - 1; i++) {
                fallbackDistance += this.getHaversineDistance(segments[i].lat, segments[i].lng, segments[i + 1].lat, segments[i + 1].lng);
            }
            fallbackDistance = fallbackDistance * mapRouting.haversine_compensation_factor;

            let finalDistanceKm = 0;
            if (this.osrmAbortController) { this.osrmAbortController.abort(); }
            this.osrmAbortController = new AbortController();

            const fitPadding = mapRouting.fit_bounds_padding_px;

            try {
                const response = await fetch(osrmUrl, { signal: this.osrmAbortController.signal });
                const data = await response.json();
                if (data.code === 'Ok') {
                    const route = data.routes[0];
                    const compensatedOsrm = (route.distance / 1000) * mapRouting.osrm_compensation_factor;
                    finalDistanceKm = (compensatedOsrm > fallbackDistance * mapRouting.osrm_max_ratio_vs_haversine) ? fallbackDistance : compensatedOsrm;
                    L.geoJSON(route.geometry, { style: { color: 'var(--route-line, #3b82f6)', weight: 6, opacity: 0.9 } }).addTo(this.wizardLayer);
                    setTimeout(() => {
                        if (this.wizardLayer && this.mainMap) {
                            this.mainMap.fitBounds(this.wizardLayer.getBounds(), { padding: [fitPadding, fitPadding], animate: false });
                        }
                    }, debounceMs);
                } else {
                    finalDistanceKm = fallbackDistance;
                }
            } catch (error) {
                if (error.name === 'AbortError') return; 
                finalDistanceKm = fallbackDistance;
            }

            finalDistanceKm = parseFloat(finalDistanceKm.toFixed(2));
            window.dispatchEvent(new CustomEvent('priceCalculated', { detail: { distance: finalDistanceKm } }));
        }, debounceMs); 
    },

    buildDriverPopupHTML: function(driver) {
        if (!driver) return '';
        const defaultAvatar = window.BGN_CONFIG?.settings?.map_config?.default_avatar_url || './assets/icon-192.png';
        const normPhoto = (window.UIManager && typeof window.UIManager.normalizeDriverPhotoUrl === 'function')
            ? window.UIManager.normalizeDriverPhotoUrl(driver.fotoProfile || driver.fotoUrl, defaultAvatar)
            : (driver.fotoProfile || driver.fotoUrl || defaultAvatar);
        return `
            <div style="display:flex; align-items:center; gap:8px; padding:4px;">
                <img src="${normPhoto}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${defaultAvatar}';" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border:1.5px solid #d4af37;" alt="Driver">
                <div>
                    <div style="font-weight:800; font-size:0.78rem;">${driver.nama || 'Driver'}</div>
                    <div style="font-size:0.65rem; opacity:0.8;">${driver.kendaraan || ''} • ${driver.plat || ''}</div>
                </div>
            </div>
        `;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.MapEngine.init();
});