// ==========================================
// MESIN MODULAR: JASTIP (ALUR BELANJA PRESISI) - BRUTAL DIAMOND V8 (ZERO FALLBACK)
// ARSITEKTUR: DIRECT STORE LOCK, RECENT PLACES, & INTEGRATED DROPOFF SEARCH/GPS
// ==========================================

window.FlowJastip = {
    _searchTimeout: null,
    _dropoffSearchTimeout: null,
    _initialDropoffAutoLocked: false,

    init: function() {
        console.log("[FlowJastip] Mesin Diaktifkan");
        window.BAGANTARA_JASTIP_STORE = null;
        window.BAGANTARA_JASTIP_ITEMS = [];
        window.BAGANTARA_JASTIP_VALUE = 0;
        window.BAGANTARA_DROPOFF_COORD = null;
        window.BAGANTARA_DROPOFF_DETAIL = null;
        this._initialDropoffAutoLocked = false;
        this.showStoreSearch();
        this.setupSearchEngine(); 
        this.setupDropoffSearchInCart();
    },

    _getReferenceCoord: function() {
        if (window.BAGANTARA_JASTIP_STORE && !isNaN(parseFloat(window.BAGANTARA_JASTIP_STORE.lat))) {
            return { lat: parseFloat(window.BAGANTARA_JASTIP_STORE.lat), lng: parseFloat(window.BAGANTARA_JASTIP_STORE.lng) };
        }
        if (window.BAGANTARA_USER_GPS_COORD && !isNaN(parseFloat(window.BAGANTARA_USER_GPS_COORD.lat))) {
            return { lat: parseFloat(window.BAGANTARA_USER_GPS_COORD.lat), lng: parseFloat(window.BAGANTARA_USER_GPS_COORD.lng) };
        }
        if (window.ConfigManager && typeof window.ConfigManager.getActiveZoneCenter === 'function') {
            return window.ConfigManager.getActiveZoneCenter();
        }
        return window.BGN_CONFIG.settings.map_config.default_center;
    },

    _validatePrelockedDriverRadius: function(targetLat, targetLng, labelJenisTitik = 'Lokasi toko') {
        const prelockedDriver = window.BAGANTARA_PRELOCKED_DRIVER;
        if (!prelockedDriver) return true;

        const cachedDriver = (prelockedDriver.uid && window.BAGANTARA_DRIVER_CACHE)
            ? window.BAGANTARA_DRIVER_CACHE[prelockedDriver.uid]
            : null;
        const driverLat = parseFloat(prelockedDriver.lat !== undefined ? prelockedDriver.lat : cachedDriver?.lat);
        const driverLng = parseFloat(prelockedDriver.lng !== undefined ? prelockedDriver.lng : cachedDriver?.lng);
        const maxRadiusKm = Number(prelockedDriver.radius !== undefined ? prelockedDriver.radius : cachedDriver?.radius);
        const tLat = parseFloat(targetLat);
        const tLng = parseFloat(targetLng);

        if (isNaN(driverLat) || isNaN(driverLng) || isNaN(maxRadiusKm) || maxRadiusKm <= 0 || isNaN(tLat) || isNaN(tLng)) {
            return true;
        }
        if (!window.AegisEngine || typeof window.AegisEngine.calculateDistance !== 'function') {
            return true;
        }

        const distKm = window.AegisEngine.calculateDistance(driverLat, driverLng, tLat, tLng);
        if (distKm > maxRadiusKm) {
            const msg = `${labelJenisTitik} berjarak ${distKm.toFixed(1)} KM dan berada di luar jangkauan jemput maksimal (${maxRadiusKm} KM) milik Driver ${prelockedDriver.nama || 'Pilihan Anda'}. Silakan geser titik ke dalam jangkauan atau pilih driver lain.`;
            if (window.UIManager && typeof window.UIManager.alert === 'function') {
                window.UIManager.alert(msg);
            } else if (typeof window.alert === 'function') {
                window.alert(msg);
            }
            return false;
        }
        return true;
    },

    _lockStoreDirectly: function(title, fLat, fLng, subtitle = '') {
        const lat = parseFloat(fLat);
        const lng = parseFloat(fLng);
        if (isNaN(lat) || isNaN(lng)) return false;

        if (!this._validatePrelockedDriverRadius(lat, lng, 'Lokasi toko')) {
            return false;
        }

        if (window.GeocoderAPI && typeof window.GeocoderAPI.saveRecentPlace === 'function') {
            window.GeocoderAPI.saveRecentPlace(title, lat, lng, subtitle);
        }

        const noNotes = window.BGN_CONFIG.wording.mitra_popup.no_notes;
        const storeFormat = window.BGN_CONFIG.wording.templates.jastip_store_note_format;

        window.BAGANTARA_ACTIVE_COORD = { lat: lat, lng: lng };
        window.TEMPORARY_GEOCODE = title;
        window.LOCKED_SEARCH_COORD = { lat: lat, lng: lng };
        window.LOCKED_SEARCH_TEXT = title;
        window.LOCKED_SEARCH_TARGET = 'JASTIP_STORE';

        window.BAGANTARA_JASTIP_STORE = {
            lat: lat.toFixed(6),
            lng: lng.toFixed(6),
            address: title,
            notes: noNotes
        };
        window.BAGANTARA_PICKUP_COORD = `${lat.toFixed(6)},${lng.toFixed(6)}`;
        window.BAGANTARA_PICKUP_DETAIL = {
            kec: title,
            patokan: storeFormat.replace('{store}', title)
        };

        this.showItemization();
    },

    _openStoreMapForGmapsVerification: function(title, fLat, fLng, subtitle = '', shouldSaveRecent = true) {
        const lat = parseFloat(fLat);
        const lng = parseFloat(fLng);
        if (isNaN(lat) || isNaN(lng)) return;

        if (shouldSaveRecent !== false && window.GeocoderAPI && typeof window.GeocoderAPI.saveRecentPlace === 'function') {
            window.GeocoderAPI.saveRecentPlace(title, lat, lng, subtitle);
        }

        const noNotes = window.BGN_CONFIG.wording.mitra_popup.no_notes;
        const storeFormat = window.BGN_CONFIG.wording.templates.jastip_store_note_format;

        window.BAGANTARA_ACTIVE_COORD = { lat: lat, lng: lng };
        window.TEMPORARY_GEOCODE = title;
        window.LOCKED_SEARCH_COORD = { lat: lat, lng: lng };
        window.LOCKED_SEARCH_TEXT = title;
        window.LOCKED_SEARCH_TARGET = 'JASTIP_STORE';

        window.BAGANTARA_JASTIP_STORE = {
            lat: lat.toFixed(6),
            lng: lng.toFixed(6),
            address: title,
            notes: noNotes
        };
        window.BAGANTARA_PICKUP_COORD = `${lat.toFixed(6)},${lng.toFixed(6)}`;
        window.BAGANTARA_PICKUP_DETAIL = {
            kec: title,
            patokan: storeFormat.replace('{store}', title)
        };

        const inputStore = document.getElementById('inputJastipStore');
        if (inputStore) inputStore.value = title;

        this.showStoreMap();
    },

    _renderStoreRecentChips: function() {
        const container = document.getElementById('recentPlacesJastipStore');
        if (!container || !window.GeocoderAPI || typeof window.GeocoderAPI.getRecentPlaces !== 'function') return;

        const places = window.GeocoderAPI.getRecentPlaces();
        container.innerHTML = '';

        if (!places || places.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';
        places.forEach(p => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'recent-place-chip';
            const iconCls = p.isVault ? 'fa-solid fa-star text-gold' : 'fa-solid fa-store text-gold';
            chip.innerHTML = `<i class="${iconCls}"></i> <span class="chip-title-text"></span> <span class="chip-del-btn" title="Hapus alamat ini"><i class="fa-solid fa-xmark"></i></span>`;
            const titleSpan = chip.querySelector('.chip-title-text');
            if (titleSpan) titleSpan.textContent = p.title;

            const delBtn = chip.querySelector('.chip-del-btn');
            if (delBtn) {
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (window.GeocoderAPI && typeof window.GeocoderAPI.removeSavedPlace === 'function') {
                        window.GeocoderAPI.removeSavedPlace(p.title, p.lat, p.lng);
                    }
                    this._renderStoreRecentChips();
                    this._renderDropoffRecentChips();
                });
            }

            chip.addEventListener('click', () => {
                const inputStore = document.getElementById('inputJastipStore');
                if (inputStore) inputStore.value = p.title;
                document.getElementById('jastipStoreResults')?.classList.add('hidden');
                this._lockStoreDirectly(p.title, p.lat, p.lng, p.subtitle);
            });
            container.appendChild(chip);
        });

        const clearAllBtn = document.createElement('button');
        clearAllBtn.type = 'button';
        clearAllBtn.className = 'recent-clear-all-chip';
        clearAllBtn.title = 'Hapus semua alamat tersimpan';
        clearAllBtn.innerHTML = `<i class="fa-solid fa-trash-can"></i> Hapus Semua`;
        clearAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.GeocoderAPI && typeof window.GeocoderAPI.clearAllSavedPlaces === 'function') {
                window.GeocoderAPI.clearAllSavedPlaces();
            }
            this._renderStoreRecentChips();
            this._renderDropoffRecentChips();
        });
        container.appendChild(clearAllBtn);
    },

    _renderDropoffRecentChips: function() {
        const container = document.getElementById('recentPlacesJastipDropoff');
        if (!container || !window.GeocoderAPI || typeof window.GeocoderAPI.getRecentPlaces !== 'function') return;

        const places = window.GeocoderAPI.getRecentPlaces();
        container.innerHTML = '';

        if (!places || places.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'flex';
        places.forEach(p => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'recent-place-chip';
            const iconCls = p.isVault ? 'fa-solid fa-star text-gold' : 'fa-solid fa-clock-rotate-left text-gold';
            chip.innerHTML = `<i class="${iconCls}"></i> <span class="chip-title-text"></span> <span class="chip-del-btn" title="Hapus alamat ini"><i class="fa-solid fa-xmark"></i></span>`;
            const titleSpan = chip.querySelector('.chip-title-text');
            if (titleSpan) titleSpan.textContent = p.title;

            const delBtn = chip.querySelector('.chip-del-btn');
            if (delBtn) {
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    if (window.GeocoderAPI && typeof window.GeocoderAPI.removeSavedPlace === 'function') {
                        window.GeocoderAPI.removeSavedPlace(p.title, p.lat, p.lng);
                    }
                    this._renderDropoffRecentChips();
                    this._renderStoreRecentChips();
                });
            }

            chip.addEventListener('click', () => {
                document.getElementById('jastipDropoffResults')?.classList.add('hidden');
                this._lockDropoffDirectly(p.title, p.lat, p.lng, p.subtitle);
            });
            container.appendChild(chip);
        });

        const clearAllBtn = document.createElement('button');
        clearAllBtn.type = 'button';
        clearAllBtn.className = 'recent-clear-all-chip';
        clearAllBtn.title = 'Hapus semua alamat tersimpan';
        clearAllBtn.innerHTML = `<i class="fa-solid fa-trash-can"></i> Hapus Semua`;
        clearAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.GeocoderAPI && typeof window.GeocoderAPI.clearAllSavedPlaces === 'function') {
                window.GeocoderAPI.clearAllSavedPlaces();
            }
            this._renderDropoffRecentChips();
            this._renderStoreRecentChips();
        });
        container.appendChild(clearAllBtn);
    },

    setupSearchEngine: function() {
        const inputStore = document.getElementById('inputJastipStore');
        const btnClear = document.getElementById('btnClearJastipStore');
        if (!inputStore || !btnClear) return;

        if (inputStore.dataset.searchBound === 'true') return;
        inputStore.dataset.searchBound = 'true';

        const jalankanPencarianToko = async (query) => {
            if (window.UIManager && window.UIManager.renderSearchLoading) {
                window.UIManager.renderSearchLoading('jastipStoreResults');
            }
            const refCoord = this._getReferenceCoord();
            const features = await window.GeocoderAPI.search(query, refCoord.lat, refCoord.lng);
            
            window.UIManager.renderSearchResults('jastipStoreResults', features, (title, fLat, fLng, subtitle, isFromGmapsModal = false) => {
                inputStore.value = title;
                if (isFromGmapsModal) {
                    this._openStoreMapForGmapsVerification(title, fLat, fLng, subtitle);
                } else {
                    this._lockStoreDirectly(title, fLat, fLng, subtitle);
                }
            });
        };

        inputStore.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            btnClear.style.display = query.length > 0 ? 'block' : 'none';
            const minLen = window.BGN_CONFIG.rules_app.form_validation.min_search_query_length;
            const debounceMs = window.BGN_CONFIG.rules_app.map_and_routing.search_debounce_ms;
            
            if (query.length < minLen) {
                clearTimeout(this._searchTimeout);
                document.getElementById('jastipStoreResults').classList.add('hidden');
                return;
            }
            
            clearTimeout(this._searchTimeout);
            this._searchTimeout = setTimeout(() => jalankanPencarianToko(query), debounceMs);
        });

        inputStore.addEventListener('keydown', (e) => {
            const minLen = window.BGN_CONFIG.rules_app.form_validation.min_search_query_length;
            if (e.key === 'Enter') {
                e.preventDefault();
                const query = inputStore.value.trim();
                if (query.length >= minLen) {
                    clearTimeout(this._searchTimeout);
                    jalankanPencarianToko(query);
                }
            }
        });

        btnClear.addEventListener('click', () => {
            inputStore.value = '';
            btnClear.style.display = 'none';
            window.LOCKED_SEARCH_COORD = null;
            window.LOCKED_SEARCH_TEXT = null;
            window.LOCKED_SEARCH_TARGET = null;
            document.getElementById('jastipStoreResults').classList.add('hidden');
            inputStore.focus();
        });
    },

    _autoLockJastipHomeGps: function() {
        const inputDrop = document.getElementById('inputJastipDropoffSearch');
        const btnClearDrop = document.getElementById('btnClearJastipDropoff');
        if (!inputDrop || this._initialDropoffAutoLocked || window.BAGANTARA_DROPOFF_COORD || inputDrop.hasAttribute('readonly') || inputDrop.value.trim().length > 0) {
            return;
        }

        this._initialDropoffAutoLocked = true;
        const wPins = window.BGN_CONFIG.wording.map_pins;
        const noNotes = window.BGN_CONFIG.wording.mitra_popup.no_notes;
        const mapRouting = window.BGN_CONFIG.rules_app.map_and_routing;

        const lockHomeCoord = (lat, lng) => {
            if (window.BAGANTARA_DROPOFF_COORD || inputDrop.hasAttribute('readonly') || inputDrop.value.trim().length > 0) return;
            const labelHome = wPins.gps_home_current;
            const rawDropNotes = document.getElementById('inputJastipDropoffNotes')?.value?.trim();
            const notes = rawDropNotes ? rawDropNotes : noNotes;
            window.BAGANTARA_USER_GPS_COORD = { lat: lat, lng: lng, ts: Date.now() };
            window.BAGANTARA_DROPOFF_COORD = `${lat.toFixed(6)},${lng.toFixed(6)}`;
            window.BAGANTARA_DROPOFF_DETAIL = { kec: labelHome, patokan: notes };
            window.BAGANTARA_MULTI_DROPOFFS = [{
                lat: parseFloat(lat.toFixed(6)),
                lng: parseFloat(lng.toFixed(6)),
                name: labelHome,
                notes: notes
            }];
            inputDrop.value = labelHome;
            inputDrop.setAttribute('readonly', 'true');
            inputDrop.style.fontWeight = 'bold';
            if (btnClearDrop) btnClearDrop.style.display = 'block';
        };

        if (window.BAGANTARA_USER_GPS_COORD && !isNaN(parseFloat(window.BAGANTARA_USER_GPS_COORD.lat))) {
            lockHomeCoord(parseFloat(window.BAGANTARA_USER_GPS_COORD.lat), parseFloat(window.BAGANTARA_USER_GPS_COORD.lng));
        } else if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((pos) => {
                lockHomeCoord(pos.coords.latitude, pos.coords.longitude);
            }, () => {}, {
                enableHighAccuracy: false,
                timeout: mapRouting.gps_timeout_ms,
                maximumAge: mapRouting.gps_max_age_ms
            });
        }
    },

    _lockDropoffDirectly: function(title, fLat, fLng, subtitle = '') {
        const inputDrop = document.getElementById('inputJastipDropoffSearch');
        const btnClearDrop = document.getElementById('btnClearJastipDropoff');
        const lat = parseFloat(fLat);
        const lng = parseFloat(fLng);
        if (isNaN(lat) || isNaN(lng)) return;

        if (window.GeocoderAPI && typeof window.GeocoderAPI.saveRecentPlace === 'function') {
            window.GeocoderAPI.saveRecentPlace(title, lat, lng, subtitle);
        }

        const noNotes = window.BGN_CONFIG.wording.mitra_popup.no_notes;
        const rawDropNotes = document.getElementById('inputJastipDropoffNotes')?.value?.trim();
        const notes = rawDropNotes ? rawDropNotes : noNotes;
        window.BAGANTARA_DROPOFF_COORD = `${lat.toFixed(6)},${lng.toFixed(6)}`;
        window.BAGANTARA_DROPOFF_DETAIL = { kec: title, patokan: notes };
        window.BAGANTARA_MULTI_DROPOFFS = [{
            lat: parseFloat(lat.toFixed(6)),
            lng: parseFloat(lng.toFixed(6)),
            name: title,
            notes: notes
        }];
        window.LOCKED_SEARCH_COORD = { lat: lat, lng: lng };
        window.LOCKED_SEARCH_TEXT = title;
        window.LOCKED_SEARCH_TARGET = 'JASTIP_DROPOFF';

        if (inputDrop) {
            inputDrop.value = title;
            inputDrop.setAttribute('readonly', 'true');
            inputDrop.style.fontWeight = 'bold';
        }
        if (btnClearDrop) btnClearDrop.style.display = 'block';
        this._renderDropoffRecentChips();
    },

    _openDropoffMapForGmapsVerification: function(title, fLat, fLng, subtitle = '', shouldSaveRecent = true) {
        const items = window.UIJastip ? window.UIJastip.extractData() : [];
        if (items.length > 0) window.BAGANTARA_JASTIP_ITEMS = items;

        const inputDrop = document.getElementById('inputJastipDropoffSearch');
        const lat = parseFloat(fLat);
        const lng = parseFloat(fLng);
        if (isNaN(lat) || isNaN(lng)) return;

        if (shouldSaveRecent !== false && window.GeocoderAPI && typeof window.GeocoderAPI.saveRecentPlace === 'function') {
            window.GeocoderAPI.saveRecentPlace(title, lat, lng, subtitle);
        }

        const noNotes = window.BGN_CONFIG.wording.mitra_popup.no_notes;
        const rawDropNotes = document.getElementById('inputJastipDropoffNotes')?.value?.trim();
        const notes = rawDropNotes ? rawDropNotes : noNotes;

        window.BAGANTARA_ACTIVE_COORD = { lat: lat, lng: lng };
        window.TEMPORARY_GEOCODE = title;
        window.LOCKED_SEARCH_COORD = { lat: lat, lng: lng };
        window.LOCKED_SEARCH_TEXT = title;
        window.LOCKED_SEARCH_TARGET = 'JASTIP_DROPOFF';

        window.BAGANTARA_DROPOFF_COORD = `${lat.toFixed(6)},${lng.toFixed(6)}`;
        window.BAGANTARA_DROPOFF_DETAIL = { kec: title, patokan: notes };
        window.BAGANTARA_MULTI_DROPOFFS = [{
            lat: parseFloat(lat.toFixed(6)),
            lng: parseFloat(lng.toFixed(6)),
            name: title,
            notes: notes
        }];

        if (inputDrop) inputDrop.value = title;
        this.showDropoffMap();
    },

    setupDropoffSearchInCart: function() {
        const inputDrop = document.getElementById('inputJastipDropoffSearch');
        const btnClearDrop = document.getElementById('btnClearJastipDropoff');
        const btnMapDrop = document.getElementById('btnJastipDropoffMap');
        if (!inputDrop) return;

        if (inputDrop.dataset.searchBound === 'true') return;
        inputDrop.dataset.searchBound = 'true';

        const runDropoffSearch = async (query) => {
            if (window.UIManager && window.UIManager.renderSearchLoading) {
                window.UIManager.renderSearchLoading('jastipDropoffResults');
            }
            const refCoord = this._getReferenceCoord();
            const features = await window.GeocoderAPI.search(query, refCoord.lat, refCoord.lng);
            window.UIManager.renderSearchResults('jastipDropoffResults', features, (title, fLat, fLng, subtitle, isFromGmapsModal = false) => {
                if (isFromGmapsModal) {
                    this._openDropoffMapForGmapsVerification(title, fLat, fLng, subtitle);
                } else {
                    this._lockDropoffDirectly(title, fLat, fLng, subtitle);
                }
            });
        };

        inputDrop.addEventListener('input', (e) => {
            if (inputDrop.hasAttribute('readonly')) return;
            const query = e.target.value.trim();
            if (btnClearDrop) btnClearDrop.style.display = query.length > 0 ? 'block' : 'none';
            const minLen = window.BGN_CONFIG.rules_app.form_validation.min_search_query_length;
            const debounceMs = window.BGN_CONFIG.rules_app.map_and_routing.search_debounce_ms;

            if (query.length < minLen) {
                clearTimeout(this._dropoffSearchTimeout);
                document.getElementById('jastipDropoffResults')?.classList.add('hidden');
                return;
            }

            clearTimeout(this._dropoffSearchTimeout);
            this._dropoffSearchTimeout = setTimeout(() => runDropoffSearch(query), debounceMs);
        });

        if (btnClearDrop) {
            btnClearDrop.addEventListener('click', () => {
                inputDrop.removeAttribute('readonly');
                inputDrop.value = '';
                inputDrop.style.color = 'var(--text-main)';
                inputDrop.style.fontWeight = '';
                btnClearDrop.style.display = 'none';
                window.BAGANTARA_DROPOFF_COORD = null;
                window.BAGANTARA_DROPOFF_DETAIL = null;
                window.BAGANTARA_MULTI_DROPOFFS = [];
                window.LOCKED_SEARCH_COORD = null;
                window.LOCKED_SEARCH_TEXT = null;
                window.LOCKED_SEARCH_TARGET = null;
                document.getElementById('jastipDropoffResults')?.classList.add('hidden');
                inputDrop.focus();
            });
        }

        const btnGmapsDrop = document.getElementById('btnOpenGmapsJastipDropoff');
        if (btnGmapsDrop) {
            btnGmapsDrop.addEventListener('click', () => {
                if (window.UIManager && typeof window.UIManager.openGmapsBridgeModal === 'function') {
                    window.UIManager.openGmapsBridgeModal((title, lat, lng, subtitle, _isModal, shouldSaveRecent = true) => {
                        this._openDropoffMapForGmapsVerification(title, lat, lng, subtitle, shouldSaveRecent);
                    }, '');
                }
            });
        }

        if (btnMapDrop) {
            btnMapDrop.addEventListener('click', async () => {
                const items = window.UIJastip ? window.UIJastip.extractData() : [];
                if (items.length > 0) window.BAGANTARA_JASTIP_ITEMS = items;

                const query = inputDrop.value.trim();
                const minLen = window.BGN_CONFIG.rules_app.form_validation.min_search_query_length;
                const gpsHomeLabel = window.BGN_CONFIG.wording.map_pins.gps_home_current;

                // Isolasi penuh koordinat pengantaran agar tidak terkontaminasi oleh koordinat Toko Jastip
                if (inputDrop.hasAttribute('readonly') && window.BAGANTARA_DROPOFF_COORD) {
                    const [dLat, dLng] = String(window.BAGANTARA_DROPOFF_COORD).split(',').map(Number);
                    if (!isNaN(dLat) && !isNaN(dLng)) {
                        const dTitle = window.BAGANTARA_DROPOFF_DETAIL?.kec ? window.BAGANTARA_DROPOFF_DETAIL.kec : query;
                        window.BAGANTARA_ACTIVE_COORD = { lat: dLat, lng: dLng };
                        window.TEMPORARY_GEOCODE = dTitle;
                        window.LOCKED_SEARCH_COORD = { lat: dLat, lng: dLng };
                        window.LOCKED_SEARCH_TEXT = dTitle;
                        window.LOCKED_SEARCH_TARGET = 'JASTIP_DROPOFF';
                    }
                } else if (!inputDrop.hasAttribute('readonly') && query.length >= minLen && query !== gpsHomeLabel && window.GeocoderAPI) {
                    try {
                        const refCoord = this._getReferenceCoord();
                        const features = await window.GeocoderAPI.search(query, refCoord.lat, refCoord.lng);
                        if (features && features.length > 0) {
                            const fLat = features[0].geometry.coordinates[1];
                            const fLng = features[0].geometry.coordinates[0];
                            const props = features[0].properties ? features[0].properties : {};
                            const title = features[0].text ? features[0].text : (props.name ? props.name : query);
                            window.BAGANTARA_ACTIVE_COORD = { lat: fLat, lng: fLng };
                            window.TEMPORARY_GEOCODE = title;
                            window.LOCKED_SEARCH_COORD = { lat: fLat, lng: fLng };
                            window.LOCKED_SEARCH_TEXT = title;
                            window.LOCKED_SEARCH_TARGET = 'JASTIP_DROPOFF';
                        } else {
                            window.LOCKED_SEARCH_COORD = null;
                            window.LOCKED_SEARCH_TEXT = null;
                            window.LOCKED_SEARCH_TARGET = 'JASTIP_DROPOFF';
                            window.TEMPORARY_GEOCODE = null;
                        }
                    } catch (e) {}
                } else {
                    window.LOCKED_SEARCH_COORD = null;
                    window.LOCKED_SEARCH_TEXT = null;
                    window.LOCKED_SEARCH_TARGET = 'JASTIP_DROPOFF';
                    window.TEMPORARY_GEOCODE = null;
                    const refCoord = this._getReferenceCoord();
                    window.BAGANTARA_ACTIVE_COORD = { lat: refCoord.lat, lng: refCoord.lng };
                }

                this.showDropoffMap();
            });
        }
    },

    showStoreSearch: function() {
        window.spaNavigateTo('view-jastip-search');
        const nav = document.getElementById('mainBottomNav');
        if (nav) nav.classList.add('hidden');
        
        document.getElementById('btnGlobalBack').style.display = 'none';
        this._renderStoreRecentChips();

        window.bindSafeButton('btnBackJastipSearch', () => { if (window.SystemReset) window.SystemReset(); });
        window.bindSafeButton('btnOpenGmapsJastipStore', () => {
            if (window.UIManager && typeof window.UIManager.openGmapsBridgeModal !== 'function') return;
            const rawInitQ = document.getElementById('inputJastipStore')?.value?.trim();
            const initQ = rawInitQ ? rawInitQ : '';
            window.UIManager.openGmapsBridgeModal((title, lat, lng, subtitle, _isModal, shouldSaveRecent = true) => {
                this._openStoreMapForGmapsVerification(title, lat, lng, subtitle, shouldSaveRecent);
            }, initQ);
        });
        
        window.bindSafeButton('btnJastipMap', async () => { 
            clearTimeout(this._searchTimeout);
            const input = document.getElementById('inputJastipStore');
            const query = input ? input.value.trim() : '';
            const minLen = window.BGN_CONFIG.rules_app.form_validation.min_search_query_length;
            
            if (input && !input.hasAttribute('readonly') && query.length >= minLen) {
                const refCoord = this._getReferenceCoord();
                if (window.GeocoderAPI) {
                    try {
                        const features = await window.GeocoderAPI.search(query, refCoord.lat, refCoord.lng);
                        if (features && features.length > 0) {
                            const fLat = features[0].geometry.coordinates[1];
                            const fLng = features[0].geometry.coordinates[0];
                            const props = features[0].properties ? features[0].properties : {};
                            const title = features[0].text ? features[0].text : (props.name ? props.name : query);
                            
                            window.BAGANTARA_ACTIVE_COORD = { lat: fLat, lng: fLng };
                            window.TEMPORARY_GEOCODE = title;
                            window.LOCKED_SEARCH_COORD = { lat: fLat, lng: fLng };
                            window.LOCKED_SEARCH_TEXT = title;
                            window.LOCKED_SEARCH_TARGET = 'JASTIP_STORE';
                        }
                    } catch (err) {
                        console.warn("[Interceptor] Geocoder gagal:", err);
                    }
                }
            } else if (window.BAGANTARA_JASTIP_STORE) {
                const sLat = parseFloat(window.BAGANTARA_JASTIP_STORE.lat);
                const sLng = parseFloat(window.BAGANTARA_JASTIP_STORE.lng);
                if (!isNaN(sLat) && !isNaN(sLng)) {
                    window.BAGANTARA_ACTIVE_COORD = { lat: sLat, lng: sLng };
                    window.TEMPORARY_GEOCODE = window.BAGANTARA_JASTIP_STORE.address;
                    window.LOCKED_SEARCH_COORD = { lat: sLat, lng: sLng };
                    window.LOCKED_SEARCH_TEXT = window.BAGANTARA_JASTIP_STORE.address;
                    window.LOCKED_SEARCH_TARGET = 'JASTIP_STORE';
                }
            } else {
                window.LOCKED_SEARCH_COORD = null;
                window.LOCKED_SEARCH_TEXT = null;
                window.LOCKED_SEARCH_TARGET = 'JASTIP_STORE';
                window.TEMPORARY_GEOCODE = null;
            }
            this.showStoreMap(); 
        });
    },

    showStoreMap: function() {
        window.spaNavigateTo('view-map');
        const nav = document.getElementById('mainBottomNav');
        if (nav) nav.classList.add('hidden'); 

        const wPins = window.BGN_CONFIG.wording.map_pins;
        const wBtns = window.BGN_CONFIG.wording.buttons;
        const wAlerts = window.BGN_CONFIG.wording.alerts;
        const noNotes = window.BGN_CONFIG.wording.mitra_popup.no_notes;
        const storeFormat = window.BGN_CONFIG.wording.templates.jastip_store_note_format;

        document.getElementById('wizardInstruction').innerText = wPins.wizard_jastip_store;
        document.getElementById('inlineAddressPanel').style.display = 'flex';
        document.getElementById('priceArea').classList.add('hidden');
        
        const btnNext = document.getElementById('btnWizardNext');
        btnNext.className = 'btn-primary w-full pulse-attention step-jastip-store';
        const txtStore = wBtns.jastip_store;
        btnNext.innerHTML = `<i class="fa-solid fa-location-dot"></i> <span style="margin-left:4px;">${txtStore}</span>`;
        
        window.bindSafeButton('btnWizardNext', async () => {
            const rawInlineNote = document.getElementById('inputInlineNotes').value.trim();
            const notes = rawInlineNote ? rawInlineNote : noNotes;
            const mapCenter = window.MapEngine?.mainMap ? window.MapEngine.mainMap.getCenter() : null;
            const c = mapCenter ? { lat: mapCenter.lat, lng: mapCenter.lng } : window.BAGANTARA_ACTIVE_COORD;

            if (!c) {
                const msg = wAlerts.scanning_coords;
                if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('scanning_coords', msg);
                else window.alert(msg);
                return;
            }

            if (!this._validatePrelockedDriverRadius(c.lat, c.lng, 'Lokasi toko')) {
                return;
            }

            window.BAGANTARA_ACTIVE_COORD = { lat: c.lat, lng: c.lng };
            const inputStoreVal = document.getElementById('inputJastipStore')?.value?.trim();
            let resolvedStoreName = window.LOCKED_SEARCH_TEXT ? window.LOCKED_SEARCH_TEXT : (inputStoreVal ? inputStoreVal : window.TEMPORARY_GEOCODE);

            if ((!window.LOCKED_SEARCH_TEXT || !resolvedStoreName || resolvedStoreName.startsWith(wPins.map_point_prefix)) && window.GeocoderAPI) {
                const currBtn = document.getElementById('btnWizardNext');
                if (currBtn) currBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span style="margin-left:4px;">${wBtns.locking_store}</span>`;
                resolvedStoreName = await window.GeocoderAPI.reverseGeocode(c.lat, c.lng);
                window.TEMPORARY_GEOCODE = resolvedStoreName;
            }

            window.BAGANTARA_JASTIP_STORE = {
                lat: c.lat.toFixed(6),
                lng: c.lng.toFixed(6),
                address: resolvedStoreName,
                notes: notes
            };
            window.BAGANTARA_PICKUP_COORD = `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`;
            window.BAGANTARA_PICKUP_DETAIL = {
                kec: resolvedStoreName,
                patokan: `${storeFormat.replace('{store}', resolvedStoreName)} (${notes})`
            };

            this.showItemization(); 
        });

        window.bindSafeButton('btnBackMap', () => { this.showStoreSearch(); });
        window.dispatchEvent(new CustomEvent('wizardState', { detail: 'JASTIP_STORE' }));
    },

    showItemization: function() {
        window.spaNavigateTo('view-jastip-items');
        document.getElementById('btnGlobalBack').style.display = 'block';
        
        const storeTitle = document.getElementById('jastipStoreNameTitle');
        if (storeTitle && window.BAGANTARA_JASTIP_STORE) storeTitle.innerText = window.BAGANTARA_JASTIP_STORE.address;

        const itemsContainer = document.getElementById('jastipItemsContainer');
        const hasDomCards = Boolean(itemsContainer && itemsContainer.querySelectorAll('.jastip-item-card').length > 0);
        if (window.UIJastip && !hasDomCards && (!window.BAGANTARA_JASTIP_ITEMS || window.BAGANTARA_JASTIP_ITEMS.length === 0)) {
            window.UIJastip.init();
        }

        this._autoLockJastipHomeGps();
        this._renderDropoffRecentChips();
        this.setupDropoffSearchInCart();

        window.bindSafeButton('btnJastipProceed', async () => {
            const wAlerts = window.BGN_CONFIG.wording.alerts;
            const noNotes = window.BGN_CONFIG.wording.mitra_popup.no_notes;
            const minLen = window.BGN_CONFIG.rules_app.form_validation.min_search_query_length;
            const items = window.UIJastip.extractData();
            if (items.length === 0) {
                const msg = wAlerts.require_jastip_items;
                if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('require_jastip_items', msg);
                else window.alert(msg);
                return;
            }
            window.BAGANTARA_JASTIP_ITEMS = items; 

            const inputDrop = document.getElementById('inputJastipDropoffSearch');
            if (inputDrop && !inputDrop.hasAttribute('readonly') && inputDrop.value.trim().length >= minLen && window.GeocoderAPI) {
                try {
                    const refCoord = this._getReferenceCoord();
                    const features = await window.GeocoderAPI.search(inputDrop.value.trim(), refCoord.lat, refCoord.lng);
                    if (features && features.length > 0) {
                        const fLat = features[0].geometry.coordinates[1];
                        const fLng = features[0].geometry.coordinates[0];
                        const props = features[0].properties ? features[0].properties : {};
                        const title = features[0].text ? features[0].text : (props.name ? props.name : inputDrop.value.trim());
                        this._lockDropoffDirectly(title, fLat, fLng, features[0].place_name || '');
                    }
                } catch (e) {}
            }

            const rawDropNotes = document.getElementById('inputJastipDropoffNotes')?.value?.trim();
            const dropNotes = rawDropNotes ? rawDropNotes : noNotes;
            if (window.BAGANTARA_DROPOFF_DETAIL) window.BAGANTARA_DROPOFF_DETAIL.patokan = dropNotes;
            if (window.BAGANTARA_MULTI_DROPOFFS && window.BAGANTARA_MULTI_DROPOFFS[0]) {
                window.BAGANTARA_MULTI_DROPOFFS[0].notes = dropNotes;
            }

            if (window.BAGANTARA_DROPOFF_COORD) {
                this.showFinal();
            } else {
                window.LOCKED_SEARCH_COORD = null;
                window.LOCKED_SEARCH_TEXT = null;
                window.LOCKED_SEARCH_TARGET = 'JASTIP_DROPOFF';
                window.TEMPORARY_GEOCODE = null;
                this.showDropoffMap();
            }
        });

        window.bindSafeButton('btnGlobalBack', () => { this.showStoreSearch(); });
        window.bindSafeButton('btnBackJastipItems', () => { this.showStoreSearch(); });
    },

    showDropoffMap: function() {
        window.spaNavigateTo('view-map');
        
        const wPins = window.BGN_CONFIG.wording.map_pins;
        const wBtns = window.BGN_CONFIG.wording.buttons;
        const wAlerts = window.BGN_CONFIG.wording.alerts;
        const noNotes = window.BGN_CONFIG.wording.mitra_popup.no_notes;

        document.getElementById('wizardInstruction').innerText = wPins.wizard_jastip_dropoff;
        document.getElementById('inlineAddressPanel').style.display = 'flex';
        document.getElementById('priceArea').classList.add('hidden');
        const rawDropoffNotes = document.getElementById('inputJastipDropoffNotes')?.value;
        document.getElementById('inputInlineNotes').value = rawDropoffNotes ? rawDropoffNotes : ''; 

        const btnNext = document.getElementById('btnWizardNext');
        btnNext.className = 'btn-primary w-full pulse-attention step-jastip-dropoff';
        const txtDropoff = wBtns.jastip_dropoff;
        btnNext.innerHTML = `<i class="fa-solid fa-location-dot"></i> <span style="margin-left:4px;">${txtDropoff}</span>`;
        
        window.bindSafeButton('btnWizardNext', async () => {
            const rawInlineNote = document.getElementById('inputInlineNotes').value.trim();
            const notes = rawInlineNote ? rawInlineNote : noNotes;
            const mapCenter = window.MapEngine?.mainMap ? window.MapEngine.mainMap.getCenter() : null;
            const c = mapCenter ? { lat: mapCenter.lat, lng: mapCenter.lng } : window.BAGANTARA_ACTIVE_COORD;

            if (!c) {
                const msg = wAlerts.scanning_coords;
                if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('scanning_coords', msg);
                else window.alert(msg);
                return;
            }
            
            window.BAGANTARA_ACTIVE_COORD = { lat: c.lat, lng: c.lng };
            let resolvedDropName = window.LOCKED_SEARCH_TEXT ? window.LOCKED_SEARCH_TEXT : window.TEMPORARY_GEOCODE;
            if ((!window.LOCKED_SEARCH_TEXT || !resolvedDropName || resolvedDropName.startsWith(wPins.map_point_prefix)) && window.GeocoderAPI) {
                const currBtn = document.getElementById('btnWizardNext');
                if (currBtn) currBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span style="margin-left:4px;">${wBtns.locking_dropoff}</span>`;
                resolvedDropName = await window.GeocoderAPI.reverseGeocode(c.lat, c.lng);
                window.TEMPORARY_GEOCODE = resolvedDropName;
            }

            window.BAGANTARA_DROPOFF_COORD = `${c.lat.toFixed(6)},${c.lng.toFixed(6)}`;
            window.BAGANTARA_DROPOFF_DETAIL = { kec: resolvedDropName, patokan: notes };
            window.BAGANTARA_MULTI_DROPOFFS = [{ 
                lat: parseFloat(c.lat.toFixed(6)), 
                lng: parseFloat(c.lng.toFixed(6)), 
                name: resolvedDropName,
                notes: notes
            }];

            const inputDrop = document.getElementById('inputJastipDropoffSearch');
            const btnClearDrop = document.getElementById('btnClearJastipDropoff');
            if (inputDrop) {
                inputDrop.value = resolvedDropName;
                inputDrop.setAttribute('readonly', 'true');
                inputDrop.style.fontWeight = 'bold';
                if (btnClearDrop) btnClearDrop.style.display = 'block';
            }

            const notesFormEl = document.getElementById('inputJastipDropoffNotes');
            if (notesFormEl && notes !== noNotes) notesFormEl.value = notes;

            this.showFinal(); 
        });

        window.bindSafeButton('btnBackMap', () => { this.showItemization(); });
        window.dispatchEvent(new CustomEvent('wizardState', { detail: 'DROPOFF_PIN' }));
    },

    showFinal: function() {
        window.spaNavigateTo('view-map');
        if (window.BAGANTARA_JASTIP_STORE) {
            window.BAGANTARA_PICKUP_COORD = `${window.BAGANTARA_JASTIP_STORE.lat},${window.BAGANTARA_JASTIP_STORE.lng}`;
        }

        const wPins = window.BGN_CONFIG.wording.map_pins;
        const wBtns = window.BGN_CONFIG.wording.buttons;
        const wAlerts = window.BGN_CONFIG.wording.alerts;
        const mapRouting = window.BGN_CONFIG.rules_app.map_and_routing;

        const isPrelocked = window.BAGANTARA_PRELOCKED_DRIVER ? true : false;
        const driverName = isPrelocked ? window.BAGANTARA_PRELOCKED_DRIVER.nama.split(" ")[0] : "";

        document.getElementById('wizardInstruction').innerText = isPrelocked ? wPins.wizard_confirm_jastip_driver : wPins.wizard_confirm_jastip;
        document.getElementById('priceArea').classList.remove('hidden');
        document.getElementById('inlineAddressPanel').style.display = 'none';

        const btnNext = document.getElementById('btnWizardNext');
        const isWaFallbackPrelock = isPrelocked && window.BAGANTARA_PRELOCKED_DRIVER.isWaFallbackOnly === true;
        const prelockJastipPrefix = isWaFallbackPrelock ? (wBtns.prelock_wa_jastip_prefix || 'JASTIP VIA WA:') : wBtns.prelock_jastip_prefix;
        const prelockJastipIcon = isWaFallbackPrelock ? 'fa-brands fa-whatsapp' : 'fa-solid fa-handshake';

        if (isPrelocked) {
            btnNext.className = 'w-full step-final prelocked-btn';
            btnNext.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            btnNext.style.color = '#fff';
            btnNext.style.border = 'none';
            btnNext.innerHTML = `<i class="${prelockJastipIcon}"></i> <span style="margin-left:8px; font-weight:800;">${prelockJastipPrefix} ${driverName.toUpperCase()}</span>`;
        } else {
            btnNext.className = 'btn-primary w-full step-final';
            btnNext.style.background = '';
            btnNext.style.color = '';
            btnNext.style.border = '';
            const txtFinal = wBtns.final;
            btnNext.innerHTML = `<i class="fa-solid fa-location-dot"></i> <span style="margin-left:4px;">${txtFinal}</span>`;
        }
        
        window.bindSafeButton('btnWizardNext', () => {
            if (navigator.vibrate) navigator.vibrate(50);
            
            const txtLoading = wBtns.loading;
            const activeBtn = document.getElementById('btnWizardNext');
            if (activeBtn) activeBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span style="margin-left:4px;">${txtLoading}</span>`;
            
            const eksekusiLanjutan = () => {
                if (activeBtn) {
                    if (isPrelocked) {
                        activeBtn.innerHTML = `<i class="${prelockJastipIcon}"></i> <span style="margin-left:8px; font-weight:800;">${prelockJastipPrefix} ${driverName.toUpperCase()}</span>`;
                    } else {
                        const txtFinal = wBtns.final_jastip;
                        activeBtn.innerHTML = `<i class="fa-solid fa-location-dot"></i> <span style="margin-left:4px;">${txtFinal}</span>`;
                    }
                }
                if (window.AegisEngine) {
                    window.AegisEngine.renderMitraList('JASTIP', window.BAGANTARA_FINAL_PRICE);
                }
            };

            const maxRetries = mapRouting.price_check_max_retries;
            const retryIntervalMs = mapRouting.price_check_interval_ms;

            const cekHargaBerkala = (percobaan = 0) => {
                if (window.BAGANTARA_FINAL_PRICE && window.BAGANTARA_FINAL_PRICE > 0) {
                    eksekusiLanjutan();
                } else if (percobaan < maxRetries) {
                    setTimeout(() => cekHargaBerkala(percobaan + 1), retryIntervalMs);
                } else {
                    if (activeBtn) {
                        const txtFinal = wBtns.final;
                        activeBtn.innerHTML = `<i class="fa-solid fa-location-dot"></i> <span style="margin-left:4px;">${txtFinal}</span>`;
                    }
                    const txtTimeout = wAlerts.calc_timeout;
                    if (window.UIManager && window.UIManager.alertConfig) window.UIManager.alertConfig('calc_timeout', txtTimeout);
                    else window.alert(txtTimeout);
                }
            };
            
            cekHargaBerkala();
        });

        window.bindSafeButton('btnBackMap', () => { this.showItemization(); });

        window.BAGANTARA_FINAL_PRICE = 0;
        window.dispatchEvent(new CustomEvent('wizardState', { detail: 'CALCULATE' }));
    },

    overrideJastipPriceDisplay: function() {
        const priceValueEl = document.getElementById('priceValue');
        if (priceValueEl) {
            const ongkir = window.BAGANTARA_FINAL_PRICE ? window.BAGANTARA_FINAL_PRICE : 0;
            const ongkirAsli = window.BAGANTARA_ORIGINAL_PRICE ? window.BAGANTARA_ORIGINAL_PRICE : ongkir;
            const diskonPersen = window.BAGANTARA_DISCOUNT_PERCENT ? window.BAGANTARA_DISCOUNT_PERCENT : 0;
            const belanja = window.BAGANTARA_JASTIP_VALUE ? window.BAGANTARA_JASTIP_VALUE : 0;
            const totalSemua = ongkir + belanja;
            const currencyCode = window.BGN_CONFIG.tariffs.currency;
            const wPopup = window.BGN_CONFIG.wording.mitra_popup;
            
            const formatHarga = new Intl.NumberFormat('id-ID', { style: 'currency', currency: currencyCode, minimumFractionDigits: 0 }).format(totalSemua);
            const badgeDiskonHtml = (diskonPersen > 0 && ongkirAsli > ongkir)
                ? ` <span style="font-size: 0.6rem; background: rgba(16, 185, 129, 0.16); border: 1px solid var(--neon-green); color: var(--neon-green); padding: 2px 6px; border-radius: 6px; font-weight: 800; vertical-align: middle;">DISKON ONGKIR ${diskonPersen}%</span>`
                : '';
            const teksOngkir = (diskonPersen > 0 && ongkirAsli > ongkir)
                ? `${wPopup.jastip_shipping_prefix} <span style="text-decoration: line-through; opacity: 0.75;">Rp${ongkirAsli.toLocaleString('id-ID')}</span> Rp${ongkir.toLocaleString('id-ID')}`
                : `${wPopup.jastip_shipping_prefix} Rp${ongkir.toLocaleString('id-ID')}`;

            priceValueEl.innerHTML = `${formatHarga}${badgeDiskonHtml} <br><span style="font-size: 0.65rem; color: var(--text-muted); font-weight: normal; margin-top: 4px; display: inline-block;">(${wPopup.jastip_breakdown_prefix} Rp${belanja.toLocaleString('id-ID')} + ${teksOngkir})</span>`;
        }
    }
};

window.addEventListener('jastipUIUpdated', () => {
    if (!window.UIJastip) return;
    const items = window.UIJastip.extractData();
    let totalItems = 0;
    let grandTotal = 0;
    items.forEach(i => { totalItems += i.qty; grandTotal += i.subtotal; });
    window.BAGANTARA_JASTIP_VALUE = grandTotal;
    
    const stickyCheckout = document.getElementById('stickyJastipCheckout');
    const elItemCount = document.getElementById('jastipItemCount');
    const elGrandTotal = document.getElementById('jastipGrandTotal');

    if (stickyCheckout && elItemCount && elGrandTotal) {
        if (totalItems > 0 && grandTotal > 0) {
            const currencyCode = window.BGN_CONFIG.tariffs.currency;
            const itemSuffix = window.BGN_CONFIG.wording.mitra_popup.jastip_items_count_suffix;
            stickyCheckout.style.display = 'flex';
            elItemCount.innerText = `${totalItems} ${itemSuffix}`;
            elGrandTotal.innerText = new Intl.NumberFormat('id-ID', { style: 'currency', currency: currencyCode, minimumFractionDigits: 0 }).format(grandTotal);
        } else {
            stickyCheckout.style.display = 'none';
        }
    }
});