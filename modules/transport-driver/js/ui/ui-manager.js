// ==========================================
// MANAJER UI PUSAT (V11.9 COMPACT ACCORDION DRIVER CATALOG, ANTI-HANG HYDRATION,
//                   ORDER REJECTION APOLOGY BANNER & GMAPS BRIDGE)
// ARSITEKTUR: NON-BLOCKING CATALOG LOADER, DUAL-ID COMPATIBILITY, & ZERO EXTRA QUOTA
// ==========================================

function normalizeDriverPhotoUrl(rawUrl, fallbackUrl = './assets/icon-192.png') {
    const safeFallback = fallbackUrl || './assets/icon-192.png';
    if (!rawUrl || typeof rawUrl !== 'string' || String(rawUrl).trim() === '') return safeFallback;
    const cleaned = String(rawUrl).trim().replace(/[<>"']/g, '');
    const match = cleaned.match(/(?:\/file\/d\/|\/d\/|[?&]id=)([a-zA-Z0-9_-]{20,})/i);
    if (match && match[1]) {
        return "https://lh3.googleusercontent.com/d/" + match[1] + "=s400";
    }
    if (/^https:\/\//i.test(cleaned) || cleaned.startsWith('./') || cleaned.startsWith('/')) {
        return cleaned;
    }
    return safeFallback;
}

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
window.normalizeDriverQrisUrl = normalizeDriverQrisUrl;


window.UIManager = {
    _transparentPixel: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    normalizeDriverPhotoUrl: normalizeDriverPhotoUrl,
    normalizeDriverQrisUrl: normalizeDriverQrisUrl,
    _rejectedBannerTimer: null,

    alert: function(message, title = 'INFORMASI LAYANAN') {
        const alertBox = document.getElementById('cyber-alert');
        const alertMsg = document.getElementById('cyber-alert-msg');
        const alertTitle = document.getElementById('cyber-alert-title') || (alertBox ? alertBox.querySelector('h3') : null);
        if (alertTitle) {
            alertTitle.textContent = title || 'INFORMASI LAYANAN';
        }
        if (alertBox && alertMsg) {
            alertMsg.innerHTML = message;
            alertBox.classList.remove('hidden');
            if (typeof window.armBgtHistoryGuard === 'function') window.armBgtHistoryGuard('alert');
        }
    },

    alertConfig: function(alertKey, customMsg, title = 'INFORMASI LAYANAN') {
        const configuredTxt = window.BGN_CONFIG?.wording?.alerts?.[alertKey];
        const txt = configuredTxt ? configuredTxt : customMsg;
        this.alert(txt, title);
    },

    showOrderRejectedBanner: function(driverName = 'Pengemudi', customMessage = '', mode = 'REJECTED') {
        const cleanDriver = String(driverName || 'Pengemudi').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const isCancelledByDriver = String(mode || '').toUpperCase() === 'CANCELLED_BY_DRIVER';

        const badgeText = isCancelledByDriver
            ? 'PEMBATALAN PESANAN OLEH PENGEMUDI'
            : 'PEMBERITAHUAN STATUS PENGEMUDI';

        const titleText = isCancelledByDriver
            ? 'PESANAN DIBATALKAN OLEH PENGEMUDI'
            : 'PENGEMUDI BELUM DAPAT MENERIMA PESANAN';

        const messageHtml = isCancelledByDriver
            ? `Mohon maaf, Pengemudi <b>${cleanDriver}</b> terpaksa membatalkan pesanan Anda dikarenakan kendala operasional di lapangan. Pesanan ini telah dibatalkan (bukan diselesaikan). Silakan pilih pengemudi lain yang tersedia di katalog.`
            : `Mohon maaf, Pengemudi <b>${cleanDriver}</b> belum dapat menerima pesanan Anda saat ini. Silakan pilih pengemudi lain yang tersedia di katalog.`;

        const extraReason = (customMessage && String(customMessage).trim() !== ''
            ? `<div style="margin-top: 8px; padding: 6px 10px; border-radius: 8px; background: ${isCancelledByDriver ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.1)'}; border: 1px dashed ${isCancelledByDriver ? 'rgba(239, 68, 68, 0.45)' : 'rgba(245, 158, 11, 0.35)'}; font-size: 0.66rem; color: ${isCancelledByDriver ? '#f87171' : 'var(--amber-accent)'}; font-weight: 600;"><i class="fa-solid fa-circle-info"></i> Status: ${String(customMessage)}</div>`
            : '');

        const catalogList = document.getElementById('mitraCatalogList') || document.getElementById('mitraCatalogContainer');
        const catalogContainer = document.querySelector('#view-mitra-map .mitra-catalog-shell') || document.querySelector('#view-mitra-map .wizard-container');
        if (catalogContainer) {
            let inlineBanner = document.getElementById('bgn-inline-rejected-apology-banner');
            if (!inlineBanner) {
                inlineBanner = document.createElement('div');
                inlineBanner.id = 'bgn-inline-rejected-apology-banner';
                inlineBanner.className = 'order-rejected-inline-card';
                if (catalogList && catalogList.parentNode === catalogContainer) {
                    catalogContainer.insertBefore(inlineBanner, catalogList);
                } else {
                    catalogContainer.prepend(inlineBanner);
                }
            }
            inlineBanner.style.borderColor = isCancelledByDriver ? 'rgba(239, 68, 68, 0.5)' : 'var(--amber-border)';
            inlineBanner.style.borderLeftColor = isCancelledByDriver ? '#ef4444' : 'var(--amber-accent)';
            inlineBanner.innerHTML = `
                <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;">
                    <div style="display: flex; align-items: flex-start; gap: 10px; min-width: 0;">
                        <div style="width: 34px; height: 34px; border-radius: 10px; background: ${isCancelledByDriver ? 'rgba(239, 68, 68, 0.16)' : 'rgba(245, 158, 11, 0.16)'}; border: 1px solid ${isCancelledByDriver ? 'rgba(239, 68, 68, 0.45)' : 'rgba(245, 158, 11, 0.45)'}; color: ${isCancelledByDriver ? '#f87171' : 'var(--amber-accent)'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 0.95rem;">
                            <i class="fa-solid ${isCancelledByDriver ? 'fa-ban' : 'fa-handshake-angle'}"></i>
                        </div>
                        <div style="min-width: 0;">
                            <div class="font-tech" style="font-size: 0.68rem; font-weight: 900; color: ${isCancelledByDriver ? '#f87171' : 'var(--amber-accent)'}; letter-spacing: 0.4px;">${titleText}</div>
                            <p style="font-size: 0.7rem; color: var(--text-main); line-height: 1.45; margin: 3px 0 0 0;">${messageHtml}</p>
                        </div>
                    </div>
                    <button type="button" id="btnDismissInlineRejectedBanner" class="btn-icon" style="font-size: 0.85rem; padding: 2px 6px; flex-shrink: 0;" aria-label="Tutup pemberitahuan">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            `;
            inlineBanner.style.display = 'block';
            document.getElementById('btnDismissInlineRejectedBanner')?.addEventListener('click', () => {
                inlineBanner.style.display = 'none';
            });
        }

        let overlay = document.getElementById('order-rejected-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'order-rejected-overlay';
            overlay.className = 'captcha-overlay hidden';
            overlay.style.zIndex = '12600';
            overlay.innerHTML = `
                <div id="orderRejectedModalCard" class="glass-panel order-rejected-modal-card">
                    <div id="orderRejectedIconWrap" class="order-rejected-icon-wrap">
                        <i id="orderRejectedIcon" class="fa-solid fa-user-clock"></i>
                    </div>
                    <span id="orderRejectedBadge" class="font-tech order-rejected-badge">PEMBERITAHUAN STATUS PENGEMUDI</span>
                    <h3 id="orderRejectedTitle" class="font-tech text-main" style="font-size: 0.88rem; font-weight: 900; letter-spacing: 0.5px; margin: 2px 0 0 0; line-height: 1.35;">
                        PENGEMUDI BELUM DAPAT MENERIMA PESANAN
                    </h3>
                    <p id="orderRejectedBody" class="text-muted" style="font-size: 0.75rem; line-height: 1.58; margin: 0;"></p>
                    <div id="orderRejectedExtraReason" style="width: 100%;"></div>
                    <button type="button" id="btnChooseAnotherDriverNow" class="btn-primary w-full" style="font-size: 0.75rem; padding: 12px 14px; margin-top: 4px;">
                        <i class="fa-solid fa-id-card-clip"></i>
                        <span>PILIH PENGEMUDI LAIN SEKARANG</span>
                    </button>
                    <div class="font-tech text-muted" style="font-size: 0.64rem; font-weight: 700;">
                        Menutup otomatis &amp; memfokuskan katalog dalam <b id="orderRejectedCountdown" class="text-gold">8</b> detik...
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
        }

        const cardEl = document.getElementById('orderRejectedModalCard') || overlay.querySelector('.order-rejected-modal-card');
        const iconWrapEl = document.getElementById('orderRejectedIconWrap') || overlay.querySelector('.order-rejected-icon-wrap');
        const iconEl = document.getElementById('orderRejectedIcon') || overlay.querySelector('.order-rejected-icon-wrap i');
        const badgeEl = document.getElementById('orderRejectedBadge') || overlay.querySelector('.order-rejected-badge');
        const titleEl = document.getElementById('orderRejectedTitle');
        const bodyEl = document.getElementById('orderRejectedBody');
        const extraEl = document.getElementById('orderRejectedExtraReason');
        const countEl = document.getElementById('orderRejectedCountdown');
        const btnChoose = document.getElementById('btnChooseAnotherDriverNow');

        if (cardEl) cardEl.classList.toggle('is-cancelled-by-driver', isCancelledByDriver);
        if (iconWrapEl) iconWrapEl.classList.toggle('is-cancelled-by-driver', isCancelledByDriver);
        if (iconEl) iconEl.className = isCancelledByDriver ? 'fa-solid fa-ban' : 'fa-solid fa-user-clock';
        if (badgeEl) {
            badgeEl.textContent = badgeText;
            badgeEl.classList.toggle('is-cancelled-by-driver', isCancelledByDriver);
        }
        if (titleEl) titleEl.textContent = titleText;
        if (bodyEl) bodyEl.innerHTML = messageHtml;
        if (extraEl) extraEl.innerHTML = extraReason;
        if (btnChoose) {
            btnChoose.innerHTML = `<i class="fa-solid fa-id-card-clip"></i><span>PILIH PENGEMUDI LAIN SEKARANG</span>`;
        }

        if (this._rejectedBannerTimer) {
            clearInterval(this._rejectedBannerTimer);
            this._rejectedBannerTimer = null;
        }

        const focusCatalog = () => {
            if (this._rejectedBannerTimer) {
                clearInterval(this._rejectedBannerTimer);
                this._rejectedBannerTimer = null;
            }
            overlay.classList.add('hidden');
            if (window.spaNavigateTo) window.spaNavigateTo('view-mitra-map');
            const viewEl = document.getElementById('view-mitra-map');
            if (viewEl) viewEl.scrollTop = 0;
            const listEl = document.getElementById('mitraCatalogContainer') || document.getElementById('mitraCatalogList');
            if (listEl) {
                try {
                    listEl.setAttribute('tabindex', '-1');
                    listEl.focus({ preventScroll: true });
                    listEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                } catch (e) {}
            }
        };

        if (btnChoose) btnChoose.onclick = focusCatalog;
        overlay.onclick = (e) => {
            if (e.target === overlay) focusCatalog();
        };

        let secLeft = isCancelledByDriver ? 8 : 6;
        if (countEl) countEl.textContent = String(secLeft);
        overlay.classList.remove('hidden');
        if (typeof window.armBgtHistoryGuard === 'function') window.armBgtHistoryGuard('order-rejected');

        this._rejectedBannerTimer = setInterval(() => {
            secLeft -= 1;
            if (countEl) countEl.textContent = String(Math.max(0, secLeft));
            if (secLeft <= 0) {
                focusCatalog();
            }
        }, 1000);
    },

    applyProtectedAvatar: function(imgEl, photoUrl, fallbackUrl = './assets/icon-192.png') {
        if (!imgEl) return;
        const safeFallback = fallbackUrl || './assets/icon-192.png';
        const targetUrl = normalizeDriverPhotoUrl(photoUrl, safeFallback);

        imgEl.setAttribute('referrerpolicy', 'no-referrer');
        imgEl.referrerPolicy = 'no-referrer';
        imgEl.src = this._transparentPixel;
        imgEl.setAttribute('draggable', 'false');
        imgEl.oncontextmenu = () => false;
        imgEl.ondragstart = () => false;
        imgEl.onerror = function() {
            this.onerror = null;
            this.src = safeFallback;
            this.style.backgroundImage = `url("${safeFallback.replace(/"/g, '\\"')}")`;
        };
        imgEl.style.backgroundImage = `url("${safeFallback.replace(/"/g, '\\"')}")`;
        imgEl.style.backgroundSize = 'cover';
        imgEl.style.backgroundPosition = 'center center';
        imgEl.style.backgroundRepeat = 'no-repeat';

        const parent = imgEl.parentElement;
        if (parent) {
            parent.style.position = 'relative';
            parent.oncontextmenu = () => false;
            if (!parent.querySelector('.photo-armor-shield')) {
                const shield = document.createElement('div');
                shield.className = 'photo-armor-shield';
                shield.oncontextmenu = () => false;
                parent.appendChild(shield);
            }
        }

        if (targetUrl !== safeFallback) {
            const preloader = new Image();
            preloader.referrerPolicy = 'no-referrer';
            preloader.onload = () => {
                imgEl.style.backgroundImage = `url("${targetUrl.replace(/"/g, '\\"')}")`;
            };
            preloader.onerror = () => {
                imgEl.style.backgroundImage = `url("${safeFallback.replace(/"/g, '\\"')}")`;
            };
            preloader.src = targetUrl;
        }
    },

    updatePrelockedBannerUI: function(service) {
        const pd = window.BAGANTARA_PRELOCKED_DRIVER;
        const banners = [
            document.getElementById('prelockedBannerRoute'),
            document.getElementById('prelockedBannerJastip')
        ];

        const currencyCode = window.BGN_CONFIG?.tariffs?.currency || 'IDR';
        const defaultMinTariff = window.BGN_CONFIG?.rules_app?.matchmaking?.default_min_tariff || 10000;
        const defaultAvatar = window.BGN_CONFIG?.settings?.map_config?.default_avatar_url || './assets/icon-192.png';
        const wRadar = window.BGN_CONFIG?.wording?.radar || {};
        const wPopup = window.BGN_CONFIG?.wording?.mitra_popup || {};

        banners.forEach(banner => {
            if (!banner) return;
            if (!pd) {
                banner.style.display = 'none';
                return;
            }

            const fmtTarif = new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: currencyCode,
                minimumFractionDigits: 0
            }).format(pd.tarifMin ? pd.tarifMin : defaultMinTariff);

            const img = banner.querySelector('.prelock-avatar');
            if (img) this.applyProtectedAvatar(img, pd.fotoProfile, defaultAvatar);

            const nameEl = banner.querySelector('.prelock-name');
            if (nameEl) nameEl.textContent = pd.nama;

            const metaEl = banner.querySelector('.prelock-meta');
            if (metaEl) metaEl.textContent = `${pd.kendaraan} • ${pd.plat}`;

            const activeSrv = (service ? service : (window.BAGANTARA_SERVICE ? window.BAGANTARA_SERVICE : (wPopup.default_order_label || 'ORDER'))).toUpperCase();
            const srvDiskon = (pd.diskonMap && Number(pd.diskonMap[activeSrv]) > 0) ? Number(pd.diskonMap[activeSrv]) : 0;

            const srvEl = banner.querySelector('.prelock-srv');
            if (srvEl) {
                const modeSuffix = pd.isWaFallbackOnly ? ' • VIA WA' : '';
                const diskonSuffix = srvDiskon > 0 ? ` • DISKON ${srvDiskon}%` : '';
                srvEl.textContent = `${activeSrv}${modeSuffix}${diskonSuffix}`;
            }

            const tarifEl = banner.querySelector('.prelock-tarif');
            if (tarifEl) tarifEl.textContent = `${wRadar.min_tariff_prefix || 'Min.'} ${fmtTarif}`;

            banner.style.display = 'flex';
        });
    },

    renderSearchLoading: function(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const searchingText = window.BGN_CONFIG?.wording?.map_pins?.searching_location || 'MENCARI LOKASI...';
        
        container.innerHTML = `
            <div style="padding: 25px 15px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; background: var(--void-black); border-radius: 12px;">
                <i class="fa-solid fa-circle-notch fa-spin text-gold" style="font-size: 1.8rem;"></i>
                <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: bold; font-family: 'Space Grotesk', monospace; letter-spacing: 1px;">${searchingText}</span>
            </div>
        `;
        container.classList.remove('hidden');
    },

    renderSearchResults: function(containerId, features, onSelectCallback) {
        const container = document.getElementById(containerId);
        const template = document.getElementById('tpl-search-result');
        if (!container || !template) return;

        const wGeo = window.BGN_CONFIG?.wording?.geocoder || {};
        const wBtns = window.BGN_CONFIG?.wording?.buttons || {};
        const maxSubChars = window.BGN_CONFIG?.rules_app?.form_validation?.subtitle_max_chars || 55;

        container.innerHTML = '';

        // KAPSUL IMPOR DARI GOOGLE MAPS SELALU DI URUTAN PALING ATAS (#1 TOP OPTION)
        const topGmapsCapsule = document.createElement('div');
        topGmapsCapsule.className = 'gmaps-top-dropdown-capsule';
        topGmapsCapsule.innerHTML = `
            <span style="font-family: 'Space Grotesk', monospace; font-size: 0.7rem; font-weight: 800; color: var(--neon-gold); display: inline-flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-up-right-from-square"></i> ${wBtns.gmaps_import_footer || 'Belum sesuai? Impor dari Google Maps'}
            </span>
            <span style="font-family: 'Space Grotesk', monospace; font-size: 0.56rem; font-weight: 900; background: rgba(212, 175, 55, 0.2); border: 1px solid var(--neon-gold); color: var(--neon-gold); padding: 2px 7px; border-radius: 999px; flex-shrink: 0;">
                OPSI UTAMA
            </span>
        `;
        topGmapsCapsule.addEventListener('click', () => {
            container.classList.add('hidden');
            this.openGmapsBridgeModal(onSelectCallback);
        });
        container.appendChild(topGmapsCapsule);

        if (!features || features.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'text-center';
            emptyDiv.style.cssText = 'padding: 14px 15px; background: var(--void-black); border-radius: 0 0 12px 12px;';
            emptyDiv.innerHTML = `
                <div class="text-xs text-muted" style="line-height: 1.5;">${wGeo.empty_search_hint || 'Lokasi belum terdaftar di peta standar. Gunakan kapsul Impor dari Google Maps di atas.'}</div>
            `;
            container.appendChild(emptyDiv);
            container.classList.remove('hidden');
            return;
        }

        features.forEach(item => {
            if (!item.geometry || !Array.isArray(item.geometry.coordinates)) return;
            const props = item.properties ? item.properties : {};
            const lat = item.geometry.coordinates[1];
            const lon = item.geometry.coordinates[0];
            
            const title = item.text ? item.text : (props.name ? props.name : (wGeo.detected_location || 'Lokasi Terdeteksi'));
            const joinedParts = [props.street, props.city, props.state, props.country].filter(Boolean).join(', ');
            const rawSubtitle = item.place_name ? item.place_name : (props.place_name ? props.place_name : (joinedParts ? joinedParts : (wGeo.default_country || 'Indonesia')));
            const subtitle = rawSubtitle.length > maxSubChars ? rawSubtitle.substring(0, maxSubChars) + '...' : rawSubtitle;

            const clone = template.content.cloneNode(true);
            const wrapper = clone.querySelector('.search-result-item');
            
            clone.querySelector('.tpl-title').textContent = title;
            clone.querySelector('.tpl-subtitle').textContent = subtitle;

            const distBadge = clone.querySelector('.tpl-dist-badge');
            if (distBadge && typeof item._distKm === 'number' && item._distKm > 0) {
                const comp = window.BGN_CONFIG?.rules_app?.map_and_routing?.haversine_compensation_factor || 1.3;
                const roadKm = item._distKm * comp;
                const isFar = item._distKm > 20;
                distBadge.textContent = `~${roadKm.toFixed(1)} KM${isFar ? ' (Jauh)' : ''}`;
                distBadge.style.background = isFar ? 'rgba(245, 158, 11, 0.16)' : 'rgba(16, 185, 129, 0.14)';
                distBadge.style.color = isFar ? 'var(--amber-accent)' : 'var(--neon-green)';
                distBadge.style.border = isFar ? '1px solid rgba(245, 158, 11, 0.45)' : '1px solid rgba(16, 185, 129, 0.35)';
                distBadge.classList.remove('hidden');
            }
            
            wrapper.addEventListener('click', () => {
                container.classList.add('hidden');
                if (typeof onSelectCallback === 'function') onSelectCallback(title, lat, lon, subtitle, false, true);
            });
            
            container.appendChild(clone);
        });

        container.classList.remove('hidden');
    },

    _gmapsModalCallback: null,
    _gmapsExtractedData: null,
    _gmapsModalBound: false,
    _gmapsUserTypedCustomLabel: false,

    openGmapsBridgeModal: function(onConfirmCallback, initialQuery = '') {
        const modal = document.getElementById('gmaps-bridge-overlay');
        if (!modal) return;

        this._gmapsModalCallback = onConfirmCallback;
        this._gmapsExtractedData = null;
        this._gmapsUserTypedCustomLabel = Boolean(initialQuery && String(initialQuery).trim().length >= 2);

        const inputRaw = document.getElementById('inputGmapsRaw');
        const inputLabel = document.getElementById('inputGmapsCustomLabel');
        const previewBox = document.getElementById('gmapsExtractPreview');
        const btnConfirm = document.getElementById('btnConfirmGmapsLock');

        if (inputRaw) inputRaw.value = '';
        if (inputLabel) inputLabel.value = initialQuery ? initialQuery : '';
        if (previewBox) {
            previewBox.style.display = 'none';
            previewBox.innerHTML = '';
        }
        if (btnConfirm) btnConfirm.disabled = true;
        const scrollBody = document.getElementById('gmapsBridgeScrollBody');
        if (scrollBody) scrollBody.scrollTop = 0;

        if (!this._gmapsModalBound) {
            this._gmapsModalBound = true;

            const btnOpenApp = document.getElementById('btnLaunchGoogleMapsApp');
            if (btnOpenApp) {
                btnOpenApp.addEventListener('click', () => {
                    const mapCfg = window.BGN_CONFIG.settings.map_config;
                    const dynCenter = (window.ConfigManager && typeof window.ConfigManager.getActiveZoneCenter === 'function')
                        ? window.ConfigManager.getActiveZoneCenter()
                        : mapCfg.default_center;
                    const c = window.BAGANTARA_USER_GPS_COORD
                        ? window.BAGANTARA_USER_GPS_COORD
                        : (window.BAGANTARA_ACTIVE_COORD ? window.BAGANTARA_ACTIVE_COORD : dynCenter);
                    const rawQ = document.getElementById('inputGmapsCustomLabel')?.value?.trim();
                    const q = rawQ ? rawQ : '';
                    const gmapsUrl = q.length >= 2
                        ? `${mapCfg.google_maps_search_url}${encodeURIComponent(q)}`
                        : `${mapCfg.google_maps_base_url}${c.lat},${c.lng},${mapCfg.default_zoom}z`;
                    window.open(gmapsUrl, '_blank');
                });
            }

            const btnResetGmaps = document.getElementById('btnResetGmapsInput');
            if (btnResetGmaps) {
                btnResetGmaps.addEventListener('click', () => {
                    this._gmapsExtractedData = null;
                    this._gmapsUserTypedCustomLabel = false;
                    if (inputRaw) inputRaw.value = '';
                    if (inputLabel) inputLabel.value = '';
                    if (previewBox) {
                        previewBox.style.display = 'none';
                        previewBox.innerHTML = '';
                    }
                    if (btnConfirm) btnConfirm.disabled = true;
                    if (inputRaw) inputRaw.focus();
                });
            }

            const prosesEkstraksi = async (rawStr) => {
                if (!rawStr || !window.GeocoderAPI) return;
                const wGeo = window.BGN_CONFIG.wording.geocoder;
                const wPins = window.BGN_CONFIG.wording.map_pins;
                const wAlerts = window.BGN_CONFIG.wording.alerts;

                if (previewBox) {
                    previewBox.style.display = 'block';
                    previewBox.style.borderColor = 'var(--border-cyber)';
                    previewBox.innerHTML = `<div class="text-xs text-muted"><i class="fa-solid fa-spinner fa-spin text-gold"></i> ${wGeo.extracting_coord}</div>`;
                }

                const rawCustomLbl = inputLabel?.value?.trim();
                const customLbl = rawCustomLbl ? rawCustomLbl : '';
                const minLen = window.BGN_CONFIG.rules_app.form_validation.min_search_query_length;
                const combinedInput = (rawStr.includes('goo.gl') && customLbl.length >= minLen && !rawStr.includes(customLbl))
                    ? `${customLbl} ${rawStr}`
                    : rawStr;

                const res = await window.GeocoderAPI.extractFromGoogleMapsInput(combinedInput);
                const detectedShortUrlMatch = rawStr.match(/https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\/[a-zA-Z0-9_-]+/i);
                const safeShortUrl = res?.shortUrl || (detectedShortUrlMatch ? detectedShortUrlMatch[0] : null);

                if (res && res.ok) {
                    this._gmapsExtractedData = res;
                    if (inputLabel && (!inputLabel.value.trim() || inputLabel.value.trim().length < 2)) {
                        if (res.name && !res.name.startsWith(wPins.map_point_prefix)) {
                            inputLabel.value = res.name;
                            this._gmapsUserTypedCustomLabel = false;
                        }
                    }
                    if (previewBox) {
                        const accLevel = res.accuracyLevel || 'VIEWPORT';
                        let borderCol = 'var(--amber-accent)';
                        let badgeHtml = `<span class="font-tech" style="font-size: 0.58rem; font-weight: 800; color: var(--amber-accent); background: var(--amber-bg-soft); border: 1px solid var(--amber-border); padding: 2px 6px; border-radius: 5px;">🟡 TITIK KAMERA • WAJIB PAS-KAN PIN</span>`;
                        let headerColor = 'var(--amber-accent)';
                        let headerText = wGeo.point_found_badge;
                        let footerGuidanceHtml = `
                            <div style="margin-top: 6px; padding-top: 5px; border-top: 1px dashed var(--amber-border); color: var(--amber-text-soft); font-size: 0.64rem; line-height: 1.35; font-weight: 600;">
                                <i class="fa-solid fa-hand-pointer"></i> Tautan ini memakai kamera peta (@lat,lng) yang bisa bergeser 50–300m. Lanjut tekan tombol di bawah untuk cek &amp; pas-kan pin di peta.
                            </div>
                        `;

                        if (accLevel === 'EXACT') {
                            borderCol = 'var(--neon-green)';
                            headerColor = 'var(--neon-green)';
                            headerText = 'TITIK PRESISI 100% TERDETEKSI';
                            badgeHtml = `<span class="font-tech" style="font-size: 0.58rem; font-weight: 800; color: var(--emerald-accent); background: var(--emerald-bg-soft); border: 1px solid var(--neon-green); padding: 2px 6px; border-radius: 5px;">🟢 AKURAT 100% (PIN / KODE PLUS)</span>`;
                            footerGuidanceHtml = `
                                <div style="margin-top: 6px; padding-top: 5px; border-top: 1px dashed rgba(16, 185, 129, 0.35); color: var(--emerald-accent); font-size: 0.64rem; line-height: 1.35; font-weight: 600;">
                                    <i class="fa-solid fa-circle-check"></i> Koordinat eksak terdeteksi! Tekan tombol di bawah untuk mengunci posisi di peta.
                                </div>
                            `;
                        } else if (accLevel === 'APPROX_TEXT') {
                            borderCol = 'var(--danger-accent)';
                            headerColor = 'var(--danger-accent)';
                            headerText = 'PERINGATAN: TANPA KOORDINAT GPS!';
                            badgeHtml = `<span class="font-tech" style="font-size: 0.58rem; font-weight: 800; color: var(--danger-accent); background: var(--danger-bg-soft); border: 1px solid rgba(239, 68, 68, 0.45); padding: 2px 6px; border-radius: 5px;">🔴 ESTIMASI TEKS (RAWAN MELESET!)</span>`;
                            footerGuidanceHtml = `
                                <div style="margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(239, 68, 68, 0.4); color: var(--danger-accent); font-size: 0.64rem; line-height: 1.4; font-weight: 600;">
                                    <i class="fa-solid fa-triangle-exclamation"></i> Tautan pendek ini <b>tidak menyimpan koordinat GPS</b> (hanya nama tempat yang rawan meleset jauh).<br>
                                    <b>Solusi Akurat 100%:</b> Buka tautan di Google Maps lewat tombol di bawah, lalu <b>Tekan &amp; Tahan titik lokasi selama 1 detik</b> dan salin angka koordinatnya (<i>-7.xxx, 112.xxx</i>)!
                                </div>
                            `;
                        }

                        const openShortlinkBtnHtml = safeShortUrl
                            ? `<a href="${safeShortUrl}" target="_blank" rel="noopener noreferrer" style="margin-top: 7px; width: 100%; background: var(--emerald-bg-soft); border: 1px solid var(--neon-green); color: var(--neon-green); padding: 6px 10px; border-radius: 7px; font-family: 'Space Grotesk', monospace; font-size: 0.64rem; font-weight: 800; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 6px;">
                                   <i class="fa-solid fa-up-right-from-square"></i> BUKA LINK INI DI APLIKASI GOOGLE MAPS
                               </a>`
                            : '';

                        previewBox.style.display = 'block';
                        previewBox.style.borderColor = borderCol;
                        previewBox.innerHTML = `
                            <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; flex-wrap: wrap;">
                                <span style="font-size: 0.68rem; font-weight: 800; color: ${headerColor};"><i class="fa-solid fa-location-dot"></i> ${headerText}</span>
                                ${badgeHtml}
                            </div>
                            <div class="text-main font-bold" style="font-size: 0.78rem; margin-top: 4px; line-height: 1.35; max-height: 76px; overflow-y: auto; word-break: break-word;">${res.name}</div>
                            <div class="font-tech text-muted" style="font-size: 0.66rem; margin-top: 3px;">📍 ${res.lat.toFixed(6)}, ${res.lng.toFixed(6)}</div>
                            ${footerGuidanceHtml}
                            ${openShortlinkBtnHtml}
                        `;
                        setTimeout(() => {
                            try { previewBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
                        }, 60);
                    }
                    if (btnConfirm) btnConfirm.disabled = false;
                } else {
                    this._gmapsExtractedData = null;
                    if (previewBox) {
                        previewBox.style.display = 'block';
                        previewBox.style.borderColor = 'var(--danger-accent)';
                        const errMsg = res && res.error ? res.error : wAlerts.gmaps_parse_failed;
                        const helperShortlinkBtn = safeShortUrl
                            ? `<a href="${safeShortUrl}" target="_blank" rel="noopener noreferrer" style="margin-top: 8px; width: 100%; background: var(--emerald-bg-soft); border: 1px solid var(--neon-green); color: var(--neon-green); padding: 7px 10px; border-radius: 8px; font-family: 'Space Grotesk', monospace; font-size: 0.65rem; font-weight: 800; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 6px;">
                                   <i class="fa-solid fa-up-right-from-square"></i> BUKA LINK INI DI GOOGLE MAPS (LALU SALIN KOORDINAT)
                               </a>
                               <div class="text-muted" style="font-size: 0.61rem; margin-top: 5px; line-height: 1.35;">
                                   💡 <i>Catatan: Jangan menempel link goo.gl di kolom pencarian Google Maps karena kolom cari Google Maps tidak membaca URL pendek. Klik tombol hijau di atas, lalu tekan &amp; tahan titiknya 1 detik untuk menyalin angka koordinat!</i>
                               </div>`
                            : '';
                        previewBox.innerHTML = `
                            <div style="font-size: 0.7rem; color: var(--danger-accent); line-height: 1.4; font-weight: 600;">
                                <i class="fa-solid fa-circle-exclamation"></i> ${errMsg}
                            </div>
                            ${helperShortlinkBtn}
                        `;
                    }
                    if (btnConfirm) btnConfirm.disabled = true;
                }
            };

            const btnPaste = document.getElementById('btnPasteGmapsClipboard');
            if (btnPaste) {
                btnPaste.addEventListener('click', async () => {
                    try {
                        if (navigator.clipboard && navigator.clipboard.readText) {
                            const clipText = await navigator.clipboard.readText();
                            if (clipText && clipText.trim().length > 0) {
                                if (inputRaw) inputRaw.value = clipText.trim();
                                await prosesEkstraksi(clipText.trim());
                                return;
                            }
                        }
                    } catch (e) {}
                    if (inputRaw) {
                        inputRaw.focus();
                        const minLen = window.BGN_CONFIG.rules_app.form_validation.min_search_query_length;
                        if (inputRaw.value.trim().length >= minLen) {
                            await prosesEkstraksi(inputRaw.value.trim());
                        }
                    }
                });
            }

            if (inputRaw) {
                inputRaw.addEventListener('focus', () => {
                    setTimeout(() => { try { inputRaw.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }, 220);
                });
                inputRaw.addEventListener('input', () => {
                    const val = inputRaw.value.trim();
                    if (val.length >= 4) {
                        prosesEkstraksi(val);
                    }
                });
            }

            if (inputLabel) {
                inputLabel.addEventListener('focus', () => {
                    setTimeout(() => { try { inputLabel.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }, 220);
                });
                inputLabel.addEventListener('input', () => {
                    this._gmapsUserTypedCustomLabel = Boolean(inputLabel.value && inputLabel.value.trim().length >= 2);
                });
            }

            if (btnConfirm) {
                btnConfirm.addEventListener('click', () => {
                    if (!this._gmapsExtractedData) return;
                    const wGeo = window.BGN_CONFIG.wording.geocoder;
                    const rawLbl = inputLabel?.value?.trim();
                    const customName = rawLbl
                        ? rawLbl
                        : (this._gmapsExtractedData.name ? this._gmapsExtractedData.name : `${wGeo.gmaps_custom_prefix} (${this._gmapsExtractedData.lat.toFixed(4)})`);
                    const lat = this._gmapsExtractedData.lat;
                    const lng = this._gmapsExtractedData.lng;

                    const chkSaveVault = document.getElementById('chkSaveGmapsToVault');
                    const shouldSaveToMemory = !chkSaveVault || chkSaveVault.checked;

                    if (shouldSaveToMemory && window.GeocoderAPI && typeof window.GeocoderAPI.saveToVault === 'function') {
                        window.GeocoderAPI.saveToVault(customName, lat, lng, `GMaps (${lat.toFixed(5)}, ${lng.toFixed(5)})`);
                    }

                    modal.classList.add('hidden');

                    if (typeof this._gmapsModalCallback === 'function') {
                        this._gmapsModalCallback(customName, lat, lng, shouldSaveToMemory ? wGeo.saved_phone_memory : `GMaps (${lat.toFixed(5)}, ${lng.toFixed(5)})`, true, shouldSaveToMemory);
                    }
                });
            }

            const btnCancel = document.getElementById('btnCancelGmapsBridge');
            if (btnCancel) {
                btnCancel.addEventListener('click', () => {
                    modal.classList.add('hidden');
                });
            }
        }

        modal.classList.remove('hidden');
        if (typeof window.armBgtHistoryGuard === 'function') window.armBgtHistoryGuard('gmaps-bridge');
    },

    _quickFareMapContext: null,
    _quickFareMoveEndHandler: null,

    openQuickFarePinVerificationMap: function(initialTitle, initialLat, initialLng, shouldSaveToVault = true) {
        const nLat = parseFloat(initialLat);
        const nLng = parseFloat(initialLng);
        if (isNaN(nLat) || isNaN(nLng)) return;

        const wGeo = window.BGN_CONFIG?.wording?.geocoder || {};
        const wPins = window.BGN_CONFIG?.wording?.map_pins || {};
        const cleanInitialTitle = (initialTitle && String(initialTitle).trim() !== '')
            ? String(initialTitle).trim()
            : (wGeo.gmaps_pin_name || 'Titik Tujuan');

        const customInputVal = document.getElementById('inputGmapsCustomLabel')?.value?.trim() || '';
        const customLabelFromModal = (this._gmapsUserTypedCustomLabel && customInputVal)
            ? customInputVal
            : '';

        // a) Set flag window.BAGANTARA_QUICK_FARE_MAP_MODE = true dan simpan konteks { initialTitle, initialLat, initialLng, shouldSaveToVault }
        window.BAGANTARA_QUICK_FARE_MAP_MODE = true;
        const ctxObj = {
            initialTitle: cleanInitialTitle,
            initialLat: nLat,
            initialLng: nLng,
            shouldSaveToVault: Boolean(shouldSaveToVault),
            customLabelFromModal: customLabelFromModal
        };
        this._quickFareMapContext = ctxObj;
        window.BAGANTARA_QUICK_FARE_MAP_CTX = ctxObj;

        window.BAGANTARA_ACTIVE_COORD = { lat: nLat, lng: nLng };
        window.TEMPORARY_GEOCODE = cleanInitialTitle;
        window.LOCKED_SEARCH_COORD = { lat: nLat, lng: nLng };
        window.LOCKED_SEARCH_TEXT = cleanInitialTitle;
        window.LOCKED_SEARCH_TARGET = 'QUICK_FARE';

        // b) Navigasikan SPA ke #view-map
        if (typeof window.spaNavigateTo === 'function') {
            window.spaNavigateTo('view-map');
        }

        // c) Inisialisasi/fokuskan peta window.MapEngine ke koordinat (initialLat, initialLng) dengan pin tengah aktif
        if (window.MapEngine) {
            window.MapEngine.activeMode = 'DROPOFF';
            window.MapEngine.initMainMap();
            const mapInst = window.MapEngine.map || window.MapEngine.mainMap;
            if (window.MapEngine.wizardLayer) {
                window.MapEngine.wizardLayer.clearLayers();
            }
            if (window.MapEngine.pinElements && window.MapEngine.pinElements.container) {
                window.MapEngine.pinElements.container.style.display = 'flex';
            }
            window.MapEngine.updatePinVisual('DROPOFF');
            const focusZoom = window.BGN_CONFIG?.settings?.map_config?.focus_zoom || 17;
            window.MapEngine.flyToCoordinate(`${nLat},${nLng}`, focusZoom, cleanInitialTitle);

            // d) Saat peta digeser (moveend) dalam mode window.BAGANTARA_QUICK_FARE_MAP_MODE === true,
            //    perbarui #liveAddressTitle dengan hasil GeocoderAPI.reverseGeocode(center.lat, center.lng, false)
            //    (atau pertahankan label kustom pengguna jika pergeseran < 30 meter).
            if (mapInst && typeof mapInst.on === 'function') {
                if (this._quickFareMoveEndHandler && typeof mapInst.off === 'function') {
                    mapInst.off('moveend', this._quickFareMoveEndHandler);
                }
                this._quickFareMoveEndHandler = async () => {
                    if (window.BAGANTARA_QUICK_FARE_MAP_MODE !== true) return;
                    const activeCtx = this._quickFareMapContext || window.BAGANTARA_QUICK_FARE_MAP_CTX || ctxObj;
                    const center = mapInst.getCenter();
                    if (!center) return;
                    window.BAGANTARA_ACTIVE_COORD = { lat: center.lat, lng: center.lng };

                    const distKm = (window.AegisEngine && typeof window.AegisEngine.calculateDistance === 'function')
                        ? window.AegisEngine.calculateDistance(activeCtx.initialLat, activeCtx.initialLng, center.lat, center.lng)
                        : (window.MapEngine && typeof window.MapEngine.getHaversineDistance === 'function'
                            ? window.MapEngine.getHaversineDistance(activeCtx.initialLat, activeCtx.initialLng, center.lat, center.lng)
                            : 0);

                    const liveTitleEl = document.getElementById('liveAddressTitle');
                    if (distKm < 0.03 && activeCtx.initialTitle) {
                        window.TEMPORARY_GEOCODE = activeCtx.initialTitle;
                        if (liveTitleEl) liveTitleEl.innerText = activeCtx.initialTitle;
                        return;
                    }

                    if (window.GeocoderAPI && typeof window.GeocoderAPI.reverseGeocode === 'function') {
                        const revAddr = await window.GeocoderAPI.reverseGeocode(center.lat, center.lng, false);
                        if (window.BAGANTARA_QUICK_FARE_MAP_MODE === true && revAddr) {
                            window.TEMPORARY_GEOCODE = revAddr;
                            const currLiveEl = document.getElementById('liveAddressTitle');
                            if (currLiveEl) currLiveEl.innerText = revAddr;
                        }
                    }
                };
                mapInst.on('moveend', this._quickFareMoveEndHandler);
            }
        }

        const labelLayananEl = document.getElementById('labelLayananPeta');
        if (labelLayananEl) labelLayananEl.innerText = 'CEK TITIK ESTIMASI';

        const wizardInstrEl = document.getElementById('wizardInstruction');
        if (wizardInstrEl) wizardInstrEl.innerText = 'GESER PETA UNTUK PAS-KAN TITIK TUJUAN';

        const inlinePanelEl = document.getElementById('inlineAddressPanel');
        if (inlinePanelEl) inlinePanelEl.style.display = 'flex';

        const liveAddrEl = document.getElementById('liveAddressTitle');
        if (liveAddrEl) liveAddrEl.innerText = cleanInitialTitle;

        const priceAreaEl = document.getElementById('priceArea');
        if (priceAreaEl) priceAreaEl.classList.add('hidden');

        const btnNext = document.getElementById('btnWizardNext');
        if (btnNext) {
            btnNext.className = 'btn-primary w-full pulse-attention step-dropoff';
            btnNext.style.background = '';
            btnNext.style.color = '';
            btnNext.style.border = '';
            btnNext.style.boxShadow = '';
            btnNext.innerHTML = '<i class="fa-solid fa-location-dot"></i> KUNCI TITIK & CEK TARIF DRIVER';
        }

        // e) & f) Tangani #btnWizardNext dan #btnBackMap sebelum handler FlowEngine agar tidak bentrok
        if (typeof window.bindSafeButton === 'function') {
            window.bindSafeButton('btnWizardNext', async (e) => {
                if (e && typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
                await this._confirmQuickFarePinVerificationMap();
            });

            window.bindSafeButton('btnBackMap', (e) => {
                if (e && typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
                this._cancelQuickFarePinVerificationMap();
            });
        }
    },

    _confirmQuickFarePinVerificationMap: async function() {
        if (window.BAGANTARA_QUICK_FARE_MAP_MODE !== true) return;

        const ctx = this._quickFareMapContext || window.BAGANTARA_QUICK_FARE_MAP_CTX || {};
        const mapInst = window.MapEngine?.map || window.MapEngine?.mainMap || null;
        if (mapInst && this._quickFareMoveEndHandler && typeof mapInst.off === 'function') {
            mapInst.off('moveend', this._quickFareMoveEndHandler);
            this._quickFareMoveEndHandler = null;
        }

        const centerObj = (mapInst && typeof mapInst.getCenter === 'function')
            ? mapInst.getCenter()
            : window.BAGANTARA_ACTIVE_COORD;
        const finalLat = centerObj && !isNaN(parseFloat(centerObj.lat))
            ? parseFloat(centerObj.lat)
            : parseFloat(ctx.initialLat);
        const finalLng = centerObj && !isNaN(parseFloat(centerObj.lng))
            ? parseFloat(centerObj.lng)
            : parseFloat(ctx.initialLng);
        if (isNaN(finalLat) || isNaN(finalLng)) return;

        window.BAGANTARA_ACTIVE_COORD = { lat: finalLat, lng: finalLng };

        const wPins = window.BGN_CONFIG?.wording?.map_pins || {};
        const pointPrefix = wPins.map_point_prefix || 'Titik Peta';
        const liveText = document.getElementById('liveAddressTitle')?.innerText?.trim() || '';
        const customLabelFromModal = (ctx.customLabelFromModal && String(ctx.customLabelFromModal).trim() !== '')
            ? String(ctx.customLabelFromModal).trim()
            : '';

        let finalTitle = customLabelFromModal || liveText || ctx.initialTitle || '';
        if (
            (!finalTitle || finalTitle.startsWith(pointPrefix) || finalTitle === wPins.scanning || finalTitle === wPins.searching_gps) &&
            window.GeocoderAPI &&
            typeof window.GeocoderAPI.reverseGeocode === 'function'
        ) {
            const revAddr = await window.GeocoderAPI.reverseGeocode(finalLat, finalLng, false);
            if (revAddr && !revAddr.startsWith(pointPrefix)) {
                finalTitle = revAddr;
            } else if (ctx.initialTitle) {
                finalTitle = ctx.initialTitle;
            }
        }
        if (!finalTitle) {
            finalTitle = `${pointPrefix} (${finalLat.toFixed(5)}, ${finalLng.toFixed(5)})`;
        }

        const shouldSaveToVault = ctx.shouldSaveToVault !== false;
        if (shouldSaveToVault && window.GeocoderAPI && typeof window.GeocoderAPI.saveToVault === 'function') {
            if (
                ctx.initialTitle &&
                (ctx.initialTitle !== finalTitle || Math.abs(ctx.initialLat - finalLat) > 0.0001 || Math.abs(ctx.initialLng - finalLng) > 0.0001) &&
                typeof window.GeocoderAPI.removeSavedPlace === 'function'
            ) {
                window.GeocoderAPI.removeSavedPlace(ctx.initialTitle, ctx.initialLat, ctx.initialLng);
            }
            window.GeocoderAPI.saveToVault(finalTitle, finalLat, finalLng);
            this._renderQuickFareVaultChips();
        }

        const uCoord = this._resolveBestCatalogCoord();
        const rawDist = (window.AegisEngine && typeof window.AegisEngine.calculateDistance === 'function')
            ? window.AegisEngine.calculateDistance(uCoord.lat, uCoord.lng, finalLat, finalLng)
            : (window.MapEngine && typeof window.MapEngine.getHaversineDistance === 'function'
                ? window.MapEngine.getHaversineDistance(uCoord.lat, uCoord.lng, finalLat, finalLng)
                : 2.0);
        const comp = window.BGN_CONFIG?.rules_app?.map_and_routing?.haversine_compensation_factor || 1.3;
        const estKm = Math.max(0.5, rawDist * comp);

        window.BAGANTARA_QUICK_FARE_MAP_MODE = false;
        window.BAGANTARA_QUICK_FARE_MAP_CTX = null;
        this._quickFareMapContext = null;

        if (typeof window.spaNavigateTo === 'function') {
            window.spaNavigateTo('view-mitra-map');
        }

        await this._applyQuickFareSelection(estKm, finalTitle, { lat: finalLat, lng: finalLng, title: finalTitle });
    },

    _cancelQuickFarePinVerificationMap: function() {
        const mapInst = window.MapEngine?.map || window.MapEngine?.mainMap || null;
        if (mapInst && this._quickFareMoveEndHandler && typeof mapInst.off === 'function') {
            mapInst.off('moveend', this._quickFareMoveEndHandler);
            this._quickFareMoveEndHandler = null;
        }
        window.BAGANTARA_QUICK_FARE_MAP_MODE = false;
        window.BAGANTARA_QUICK_FARE_MAP_CTX = null;
        this._quickFareMapContext = null;
        if (typeof window.spaNavigateTo === 'function') {
            window.spaNavigateTo('view-mitra-map');
        }
    },

    stopCount: 1,
    addMultiStop: function(routeInputsAreaId, btnAddStopId, unlockCallback, mapTriggerCallback, removeCallback) {
        const container = document.getElementById(routeInputsAreaId);
        const template = document.getElementById('tpl-multi-stop');
        const btnAdd = document.getElementById(btnAddStopId);
        if (!container || !template) return null;

        const maxStops = window.BGN_CONFIG.rules_app.form_validation.max_multi_stops;
        const placeholderPrefix = window.BGN_CONFIG.wording.map_pins.multi_stop_placeholder_prefix;

        let targetSlot = null;
        if (!document.getElementById('rowDropoff2')) targetSlot = 2;
        else if (!document.getElementById('rowDropoff3')) targetSlot = 3;
        else return null;

        const clone = template.content.cloneNode(true);
        const row = clone.querySelector('.route-row-inline');
        row.id = `rowDropoff${targetSlot}`;

        const input = clone.querySelector('.tpl-input');
        input.id = `inputSearchDropoff${targetSlot}`;
        input.setAttribute('data-index', targetSlot);
        input.placeholder = `${placeholderPrefix}${targetSlot}...`;
        
        const btnClear = clone.querySelector('.tpl-btn-clear');
        btnClear.addEventListener('click', (e) => {
            e.preventDefault();
            if (unlockCallback) unlockCallback(input.id);
        });

        const btnMap = clone.querySelector('.tpl-btn-map');
        btnMap.addEventListener('click', () => {
            if (mapTriggerCallback) mapTriggerCallback(targetSlot);
        });

        const btnRemove = clone.querySelector('.tpl-btn-remove');
        btnRemove.addEventListener('click', () => {
            row.remove();
            this.stopCount = container.querySelectorAll('.multi-target').length;
            if (btnAdd && this.stopCount < maxStops) btnAdd.style.display = 'block';
            if (removeCallback) removeCallback(targetSlot);
        });

        const existingRow3 = document.getElementById('rowDropoff3');
        if (targetSlot === 2 && existingRow3 && existingRow3.parentNode === container) {
            container.insertBefore(clone, existingRow3);
        } else {
            container.appendChild(clone);
        }

        this.stopCount = container.querySelectorAll('.multi-target').length;
        if (this.stopCount >= maxStops && btnAdd) btnAdd.style.display = 'none';
        
        return document.getElementById(`inputSearchDropoff${targetSlot}`); 
    },

    checkFormReady: function() {
        const btn = document.getElementById('stickyContinueArea');
        const drop1 = document.getElementById('inputSearchDropoff1');
        const pickup = document.getElementById('inputSearchPickup');

        if (btn && drop1 && pickup) {
            if (drop1.hasAttribute('readonly') && pickup.hasAttribute('readonly')) {
                btn.classList.remove('hidden');
            } else {
                btn.classList.add('hidden');
            }
        }
    },

    lockSearchField: function(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        input.setAttribute('readonly', 'true');
        input.style.color = 'var(--text-main)';
        input.style.fontWeight = 'bold';
        
        const rowEl = input.closest('.route-row-inline');
        const iconContainer = rowEl ? rowEl.querySelector('.icon-point i') : null;
        if (iconContainer) {
            if (!input.dataset.origIcon) input.dataset.origIcon = iconContainer.className;
            if (inputId === 'inputSearchPickup') {
                iconContainer.className = 'fa-solid fa-arrow-up';
                iconContainer.style.color = 'var(--neon-green)';
            } else {
                iconContainer.className = 'fa-solid fa-arrow-down';
                iconContainer.style.color = '#ef4444';
            }
        }
        
        const clearBtn = input.nextElementSibling;
        if (clearBtn && clearBtn.classList.contains('btn-clear-input')) clearBtn.style.display = 'block';
        this.checkFormReady();
    },

    unlockSearchField: function(inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;
        input.removeAttribute('readonly');
        input.value = '';
        input.style.color = 'var(--text-main)';
        input.style.fontWeight = '';
        
        const rowEl = input.closest('.route-row-inline');
        const iconContainer = rowEl ? rowEl.querySelector('.icon-point i') : null;
        if (iconContainer && input.dataset.origIcon) iconContainer.className = input.dataset.origIcon;
        
        const clearBtn = input.nextElementSibling;
        if (clearBtn) clearBtn.style.display = 'none';
        
        window.LOCKED_SEARCH_COORD = null;
        window.LOCKED_SEARCH_TEXT = null;
        window.LOCKED_SEARCH_TARGET = null;

        if (inputId === 'inputSearchPickup') {
            window.BAGANTARA_PICKUP_DETAIL = null;
            window.BAGANTARA_PICKUP_COORD = null;
        } else if (inputId === 'inputSearchDropoff1') {
            window.BAGANTARA_DROPOFF_DETAIL = null;
            window.BAGANTARA_DROPOFF_COORD = null;
            if (window.BAGANTARA_MULTI_DROPOFFS && window.BAGANTARA_MULTI_DROPOFFS[0]) {
                window.BAGANTARA_MULTI_DROPOFFS[0] = null;
            }
        } else {
            const attrIdx = parseInt(input.getAttribute('data-index'), 10);
            const idx = (!isNaN(attrIdx) ? attrIdx : 2) - 1;
            if (window.BAGANTARA_MULTI_DROPOFFS && window.BAGANTARA_MULTI_DROPOFFS[idx]) {
                window.BAGANTARA_MULTI_DROPOFFS[idx] = null;
            }
        }
        
        window.BAGANTARA_FINAL_PRICE = 0;
        window.BAGANTARA_ORIGINAL_PRICE = 0;
        window.BAGANTARA_DISCOUNT_PERCENT = 0;
        window.BAGANTARA_DISCOUNT_AMOUNT = 0;
        window.BAGANTARA_DISTANCE_KM = 0;
        const priceValueEl = document.getElementById('priceValue');
        if (priceValueEl) {
            priceValueEl.innerHTML = 'Rp 0';
        }
        
        this.checkFormReady();
        input.focus();
    },

    // ==========================================
    // 5. MESIN BERANDA KATALOG DRIVER AKTIF (NON-BLOCKING & SELF-HEALING V11.9)
    // ==========================================
    _catalogInitialized: false,
    _catalogLastRefreshTime: 0,
    _catalogCooldownTimer: null,
    _catalogActiveFilter: null,
    _catalogCurrentLimit: null,
    _catalogLastLat: null,
    _catalogLastLng: null,
    _quickFareDistanceKm: 0,
    _quickFareDestLabel: '',
    _quickFareDestCoord: null,
    _quickFareSearchTimer: null,
    _quickFareServerCache: null,

    fetchServerBatchFarePreview: async function(driversList, distanceKm) {
        const dist = parseFloat(distanceKm);
        if (isNaN(dist) || dist <= 0) {
            this._quickFareServerCache = null;
            return null;
        }
        try {
            const activeZone = window.BAGANTARA_ACTIVE_ZONE_ID || 'KDR-PARE-01';
            const drvPayload = Array.isArray(driversList)
                ? driversList.map(d => ({
                    uid: d.uid,
                    tarifMin: d.tarifMin,
                    diskonMap: d.diskonMap || {},
                    promoTeks: d.promoTeks || ''
                }))
                : [];

            if (window.__BGN_SEAL__ && typeof window.__BGN_SEAL__.computeBatchPreview === 'function') {
                const localData = window.__BGN_SEAL__.computeBatchPreview({
                    zoneId: activeZone,
                    distanceKm: dist,
                    drivers: drvPayload
                });
                if (localData && localData.ok) {
                    this._quickFareServerCache = localData;
                    return this._quickFareServerCache;
                }
            }

            // Fallback lokal langsung dari window.BGN_CONFIG.tariffs
            this._quickFareServerCache = { ok: true, zone_id: activeZone, distance_km: dist, service_fares: {}, drivers: {} };
            return this._quickFareServerCache;
        } catch (e) {
            return this._quickFareServerCache;
        }
    },

    calculateInstantDriverFare: function(driverObj, serviceName, distanceKm) {
        const dist = parseFloat(distanceKm);
        if (isNaN(dist) || dist <= 0) return null;

        const srv = String(serviceName || 'RIDE').toUpperCase();
        const uid = driverObj?.uid ? String(driverObj.uid) : '';
        const cache = this._quickFareServerCache;

        // 1. Gunakan hasil Batch Preview lokal dari closure __BGN_SEAL__
        if (cache && uid && cache.drivers && cache.drivers[uid] && cache.drivers[uid][srv]) {
            return cache.drivers[uid][srv];
        }

        // 2. Hitung langsung secara deterministik di dalam closure lokal (0 Kuota Vercel)
        if (window.__BGN_SEAL__ && typeof window.__BGN_SEAL__.computeSingleFare === 'function') {
            const activeZone = window.BAGANTARA_ACTIVE_ZONE_ID || 'KDR-PARE-01';
            const minDriverTariff = parseInt(driverObj?.tarifMin, 10) || (parseInt(window.BGN_CONFIG?.rules_app?.matchmaking?.default_min_tariff, 10) || 10000);
            const single = window.__BGN_SEAL__.computeSingleFare({
                zoneId: activeZone,
                layanan: srv,
                distanceKm: dist,
                extraStops: 0,
                multiStopCount: 1,
                driverDiskonMap: driverObj?.diskonMap || {},
                driverMinTariff: minDriverTariff,
                applyMinTariff: true,
                promoTeks: driverObj?.promoTeks || ''
            });
            if (single && single.ok) {
                return {
                    finalFare: single.harga_dasar,
                    routeFare: single.harga_rute,
                    normalFare: single.harga_normal,
                    isMinTariffApplied: single.harga_dasar > single.harga_rute,
                    discountPct: single.diskon_persen,
                    distanceKm: dist,
                    signature: single.signature || ''
                };
            }
        }

        // 3. Fallback formula langsung dari window.BGN_CONFIG.tariffs
        const activeZone = window.BAGANTARA_ACTIVE_ZONE_ID || 'KDR-PARE-01';
        const tariffsCfg = window.BGN_CONFIG?.tariffs?.zones?.[activeZone] || window.BGN_CONFIG?.tariffs?.zones?.['KDR-PARE-01'] || {};
        const srvCfg = tariffsCfg[srv] || tariffsCfg['RIDE'] || { base_price: 6000, min_distance_km: 2, price_per_km: 2300 };
        const step = parseInt(window.BGN_CONFIG?.rules_app?.system_controls?.price_rounding_step, 10) || 100;
        const extraKm = Math.max(0, dist - (parseFloat(srvCfg.min_distance_km) || 2));
        const normalFare = Math.ceil(((parseInt(srvCfg.base_price, 10) || 6000) + (extraKm * (parseInt(srvCfg.price_per_km, 10) || 2300))) / step) * step;
        const drvDisc = (driverObj?.diskonMap && Number(driverObj.diskonMap[srv]) > 0) ? Number(driverObj.diskonMap[srv]) : 0;
        const zoneDisc = tariffsCfg.discount_active ? (Number(tariffsCfg.discount_percent) || 0) : 0;
        const discPct = drvDisc > 0 ? drvDisc : zoneDisc;
        const routeRounded = discPct > 0
            ? Math.ceil((normalFare * (1 - (discPct / 100))) / step) * step
            : normalFare;
        const minDriverTariff = parseInt(driverObj?.tarifMin, 10) || (parseInt(window.BGN_CONFIG?.rules_app?.matchmaking?.default_min_tariff, 10) || 10000);
        const finalEstimated = Math.max(routeRounded, minDriverTariff);

        return {
            finalFare: finalEstimated,
            routeFare: routeRounded,
            normalFare: normalFare,
            isMinTariffApplied: finalEstimated > routeRounded,
            discountPct: discPct,
            distanceKm: dist,
            signature: ''
        };
    },

    _applyQuickFareSelection: async function(distKm, labelText = '', coordObj = null) {
        this._quickFareDistanceKm = parseFloat(parseFloat(distKm).toFixed(1)) || 0;
        this._quickFareDestLabel = labelText || '';
        this._quickFareDestCoord = coordObj || null;

        const inputEl = document.getElementById('inputQuickFareDest');
        const badgeEl = document.getElementById('quickFareDistBadge');
        const clearBtn = document.getElementById('btnClearQuickFare');
        const dropEl = document.getElementById('quickFareSearchResults');

        if (dropEl) dropEl.classList.add('hidden');

        if (this._quickFareDistanceKm > 0) {
            if (inputEl && labelText) inputEl.value = labelText;
            if (badgeEl) {
                badgeEl.textContent = `~${this._quickFareDistanceKm} KM`;
                badgeEl.classList.remove('hidden');
            }
            if (clearBtn) clearBtn.classList.remove('hidden');

            const cachedDriversObj = window.BAGANTARA_DRIVER_CACHE || {};
            const cachedList = Object.keys(cachedDriversObj).map(uid => ({
                uid: uid,
                tarifMin: cachedDriversObj[uid].tarif_min,
                diskonMap: cachedDriversObj[uid].diskon_map || {},
                promoTeks: cachedDriversObj[uid].promo_teks || ''
            }));
            await this.fetchServerBatchFarePreview(cachedList, this._quickFareDistanceKm);
        } else {
            this._quickFareServerCache = null;
            if (inputEl) inputEl.value = '';
            if (badgeEl) badgeEl.classList.add('hidden');
            if (clearBtn) clearBtn.classList.add('hidden');
            document.querySelectorAll('.quick-dist-chip').forEach(c => c.classList.remove('active'));
        }

        // Render ulang kartu dari RAM cache (0 Server Read!)
        this.loadMitraCatalog(false, true);
    },

    _renderQuickFareVaultChips: function() {
        const wrap = document.getElementById('quickFareSavedVaultChips');
        if (!wrap || !window.GeocoderAPI || typeof window.GeocoderAPI.getRecentPlaces !== 'function') return;
        const places = window.GeocoderAPI.getRecentPlaces().slice(0, 4);
        wrap.innerHTML = '';
        places.forEach(p => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'quick-dist-chip';
            btn.innerHTML = `<i class="fa-solid ${p.isVault ? 'fa-star' : 'fa-clock-rotate-left'} text-gold"></i> ${p.title.substring(0, 16)}`;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.quick-dist-chip').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                const userCoord = this._resolveBestCatalogCoord();
                const rawHaversine = window.AegisEngine
                    ? window.AegisEngine.calculateDistance(userCoord.lat, userCoord.lng, p.lat, p.lng)
                    : 2.0;
                const compFactor = window.BGN_CONFIG?.rules_app?.map_and_routing?.haversine_compensation_factor || 1.3;
                const estRoadKm = Math.max(0.5, rawHaversine * compFactor);
                this._applyQuickFareSelection(estRoadKm, p.title, { lat: p.lat, lng: p.lng, title: p.title });
            });
            wrap.appendChild(btn);
        });
    },

    _resolveBestCatalogCoord: function() {
        if (window.BAGANTARA_USER_GPS_COORD && !isNaN(parseFloat(window.BAGANTARA_USER_GPS_COORD.lat)) && !isNaN(parseFloat(window.BAGANTARA_USER_GPS_COORD.lng))) {
            return {
                lat: parseFloat(window.BAGANTARA_USER_GPS_COORD.lat),
                lng: parseFloat(window.BAGANTARA_USER_GPS_COORD.lng)
            };
        }
        if (window.BAGANTARA_ACTIVE_COORD && !isNaN(parseFloat(window.BAGANTARA_ACTIVE_COORD.lat)) && !isNaN(parseFloat(window.BAGANTARA_ACTIVE_COORD.lng))) {
            return {
                lat: parseFloat(window.BAGANTARA_ACTIVE_COORD.lat),
                lng: parseFloat(window.BAGANTARA_ACTIVE_COORD.lng)
            };
        }
        if (typeof window.getLastValidGpsCoord === 'function') {
            const cached = window.getLastValidGpsCoord();
            if (cached && !isNaN(cached.lat) && !isNaN(cached.lng)) {
                return { lat: cached.lat, lng: cached.lng };
            }
        }
        if (this._catalogLastLat !== null && this._catalogLastLng !== null) {
            return { lat: this._catalogLastLat, lng: this._catalogLastLng };
        }
        if (window.ConfigManager && typeof window.ConfigManager.getActiveZoneCenter === 'function') {
            const zc = window.ConfigManager.getActiveZoneCenter();
            if (zc && !isNaN(parseFloat(zc.lat)) && !isNaN(parseFloat(zc.lng))) {
                return { lat: parseFloat(zc.lat), lng: parseFloat(zc.lng) };
            }
        }
        return { lat: -7.768049, lng: 112.196514 };
    },

    _bindCatalogInteractiveControls: function() {
        if (this._catalogInitialized) return;
        this._catalogInitialized = true;

        const radarCfg = window.BGN_CONFIG?.rules_app?.radar_mitra || { max_drivers_rendered: 10, default_filter: 'ALL', cooldown_refresh_sec: 20 };
        const defaultLimit = parseInt(radarCfg.max_drivers_rendered, 10) || 10;
        if (this._catalogActiveFilter === null) this._catalogActiveFilter = radarCfg.default_filter || 'ALL';
        if (this._catalogCurrentLimit === null) this._catalogCurrentLimit = defaultLimit;

        const filterChips = document.querySelectorAll('#catalogFilterContainer .catalog-chip, #radarFilterContainer .radar-chip');
        filterChips.forEach(chip => {
            chip.addEventListener('click', (e) => {
                filterChips.forEach(c => c.classList.remove('active'));
                e.currentTarget.classList.add('active');
                const flt = e.currentTarget.getAttribute('data-filter');
                const defFlt = window.BGN_CONFIG?.rules_app?.radar_mitra?.default_filter || 'ALL';
                this._catalogActiveFilter = flt ? flt : defFlt;
                this._catalogCurrentLimit = parseInt(window.BGN_CONFIG?.rules_app?.radar_mitra?.max_drivers_rendered, 10) || 10;
                window.BAGANTARA_RADAR_FILTER = this._catalogActiveFilter;
                this.loadMitraCatalog(false, true);
            });
        });

        const btnRefresh = document.getElementById('btnRefreshMitraMap');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => {
                const cooldownSec = parseInt(window.BGN_CONFIG?.rules_app?.radar_mitra?.cooldown_refresh_sec, 10) || 20;
                const wRadar = window.BGN_CONFIG?.wording?.radar || { wait_prefix: 'Tunggu' };
                const now = Date.now();
                const elapsedSec = Math.floor((now - this._catalogLastRefreshTime) / 1000);

                if (elapsedSec < cooldownSec && this._catalogLastRefreshTime > 0) {
                    const sisa = cooldownSec - elapsedSec;
                    const timerUI = document.getElementById('mitraCountdownText');
                    if (timerUI) {
                        timerUI.innerText = `${wRadar.wait_prefix || 'Tunggu'} ${sisa}d`;
                        timerUI.style.color = '#f59e0b';
                    }
                    return;
                }

                const icon = btnRefresh.querySelector('i');
                if (icon) {
                    const prevRot = parseInt(icon.dataset.rot, 10);
                    icon.dataset.rot = (!isNaN(prevRot) ? prevRot : 0) - 360;
                    icon.style.transform = `rotate(${icon.dataset.rot}deg)`;
                }
                this._catalogCurrentLimit = parseInt(window.BGN_CONFIG?.rules_app?.radar_mitra?.max_drivers_rendered, 10) || 10;
                this.loadMitraCatalog(true, false);
            });
        }

        // Bind Fitur #2: Quick Fare Preview (0 Kuota Server)
        this._renderQuickFareVaultChips();
        document.querySelectorAll('.quick-dist-chip[data-km]').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.quick-dist-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                const km = parseFloat(chip.getAttribute('data-km')) || 2.0;
                this._applyQuickFareSelection(km, `Estimasi Jarak ~${km} KM`, null);
            });
        });

        const btnTogglePresets = document.getElementById('btnToggleQuickDistPresets');
        const presetsRow = document.getElementById('quickFarePresetsRow');
        if (btnTogglePresets && presetsRow) {
            btnTogglePresets.addEventListener('click', () => {
                presetsRow.classList.toggle('hidden');
            });
        }

        const btnQuickGmapsTop = document.getElementById('btnQuickFareGmapsTop');
        if (btnQuickGmapsTop) {
            btnQuickGmapsTop.addEventListener('click', () => {
                const initQ = document.getElementById('inputQuickFareDest')?.value?.trim() || '';
                this.openGmapsBridgeModal((title, fLat, fLng, _subtitle, _fromGmapsBridge, shouldSaveToMemory = true) => {
                    this.openQuickFarePinVerificationMap(title, fLat, fLng, shouldSaveToMemory);
                }, initQ);
            });
        }

        const btnClearQF = document.getElementById('btnClearQuickFare');
        if (btnClearQF) {
            btnClearQF.addEventListener('click', () => {
                this._applyQuickFareSelection(0, '', null);
            });
        }

        const inputQF = document.getElementById('inputQuickFareDest');
        if (inputQF) {
            inputQF.addEventListener('input', () => {
                const q = inputQF.value.trim();
                if (q.length === 0) {
                    this._applyQuickFareSelection(0, '', null);
                    return;
                }
                if (q.length < 3 || !window.GeocoderAPI) return;
                clearTimeout(this._quickFareSearchTimer);
                this._quickFareSearchTimer = setTimeout(async () => {
                    const uCoord = this._resolveBestCatalogCoord();
                    const features = await window.GeocoderAPI.search(q, uCoord.lat, uCoord.lng);
                    this.renderSearchResults('quickFareSearchResults', features, (title, fLat, fLng, _subtitle, fromGmapsBridge = false, shouldSaveToMemory = true) => {
                        if (fromGmapsBridge === true) {
                            this.openQuickFarePinVerificationMap(title, fLat, fLng, shouldSaveToMemory);
                            return;
                        }
                        const rawDist = window.AegisEngine
                            ? window.AegisEngine.calculateDistance(uCoord.lat, uCoord.lng, fLat, fLng)
                            : 2.0;
                        const comp = window.BGN_CONFIG?.rules_app?.map_and_routing?.haversine_compensation_factor || 1.3;
                        const estKm = Math.max(0.5, rawDist * comp);
                        this._applyQuickFareSelection(estKm, title, { lat: fLat, lng: fLng, title: title });
                    });
                }, 850);
            });
        }
    },

    initMitraCatalog: function() {
        this._bindCatalogInteractiveControls();

        const bestCoord = this._resolveBestCatalogCoord();
        window.BAGANTARA_GPS_VERIFIED = true;
        if (!window.BAGANTARA_USER_GPS_COORD) {
            window.BAGANTARA_USER_GPS_COORD = { lat: bestCoord.lat, lng: bestCoord.lng, ts: Date.now() };
        }
        if (!window.BAGANTARA_ACTIVE_COORD) {
            window.BAGANTARA_ACTIVE_COORD = { lat: bestCoord.lat, lng: bestCoord.lng };
        }

        const radarCfg = window.BGN_CONFIG?.rules_app?.radar_mitra || { max_drivers_rendered: 10, default_filter: 'ALL' };
        const defaultLimit = parseInt(radarCfg.max_drivers_rendered, 10) || 10;

        if (this._catalogActiveFilter === null) this._catalogActiveFilter = radarCfg.default_filter || 'ALL';
        if (this._catalogCurrentLimit === null) this._catalogCurrentLimit = defaultLimit;
        this._catalogLastLat = bestCoord.lat;
        this._catalogLastLng = bestCoord.lng;

        this.loadMitraCatalog(false, false);
    },

    _startCatalogCooldownUI: function() {
        const cooldownSec = parseInt(window.BGN_CONFIG?.rules_app?.radar_mitra?.cooldown_refresh_sec, 10) || 20;
        const wRadar = window.BGN_CONFIG?.wording?.radar || { ready_badge: 'SIAP' };
        let rem = cooldownSec;
        const timerUI = document.getElementById('mitraCountdownText');
        if (this._catalogCooldownTimer) clearInterval(this._catalogCooldownTimer);

        if (timerUI) {
            timerUI.innerText = `${rem}d`;
            timerUI.style.color = '#94a3b8';
        }

        this._catalogCooldownTimer = setInterval(() => {
            rem--;
            if (timerUI) {
                if (rem > 0) {
                    timerUI.innerText = `${rem}d`;
                    timerUI.style.color = '#94a3b8';
                } else {
                    timerUI.innerText = wRadar.ready_badge || 'SIAP';
                    timerUI.style.color = '#10b981';
                    clearInterval(this._catalogCooldownTimer);
                }
            }
        }, 1000);
    },

    loadMitraCatalog: async function(forceRefresh = false, useRamOnly = false) {
        this._bindCatalogInteractiveControls();

        const statusText = document.getElementById('mitraMapStatusText');
        const container = document.getElementById('mitraCatalogContainer');
        const wRadar = window.BGN_CONFIG?.wording?.radar || {};
        const wBtns = window.BGN_CONFIG?.wording?.buttons || {};
        const mapCfg = window.BGN_CONFIG?.settings?.map_config || { whatsapp_base_url: 'https://wa.me/' };
        const mapRouting = window.BGN_CONFIG?.rules_app?.map_and_routing || { gps_timeout_ms: 4500, gps_max_age_ms: 120000 };

        if (!container || !window.AegisEngine) return;

        if (window.BAGANTARA_ZONE_LOCKED === true) {
            const lockedMsg = window.BGN_CONFIG?.zones?.default_locked_message || {
                title: 'ZONA BELUM TERSEDIA',
                body: 'Layanan belum beroperasi di wilayah ini.',
                wa_rekrutmen: '6282225225141'
            };
            const title = lockedMsg.title;
            const body = lockedMsg.body;
            const wa = lockedMsg.wa_rekrutmen;
            if (statusText) statusText.innerText = wRadar.system_locked || 'Di Luar Wilayah';
            container.innerHTML = `
                <div class="glass-panel text-center" style="padding: 28px 20px; border-radius: 18px; border: 1px solid rgba(212, 175, 55, 0.4);">
                    <i class="fa-solid fa-map-location-dot text-gold text-3xl mb-3"></i>
                    <h4 class="font-tech text-main mb-2" style="font-size: 0.95rem; font-weight: 900;">${title}</h4>
                    <p class="text-muted text-xs mb-4" style="line-height: 1.6;">${body}</p>
                    <button type="button" id="btnZoneRecruitWA" class="btn-primary w-full" style="font-size: 0.75rem;">
                        <i class="fa-brands fa-whatsapp" style="font-size: 1.1rem;"></i> ${wBtns.zone_recruit_wa || 'DAFTAR PENGEMUDI PELOPOR'}
                    </button>
                </div>
            `;
            document.getElementById('btnZoneRecruitWA')?.addEventListener('click', () => {
                window.open(`${mapCfg.whatsapp_base_url}${wa}?text=${encodeURIComponent(body)}`, '_blank');
            });
            return;
        }

        const appRules = window.BGN_CONFIG?.rules_app;
        if (appRules && appRules.radar_mitra && appRules.radar_mitra.is_active === false) {
            if (statusText) statusText.innerText = wRadar.disabled || 'Layanan Nonaktif';
            container.innerHTML = `
                <div class="glass-panel text-center text-muted" style="padding: 28px 18px; border-radius: 16px;">
                    <i class="fa-solid fa-ban text-gold text-2xl mb-3"></i><br>
                    <b class="text-main">${wRadar.disabled_body || 'Katalog Driver Sedang Nonaktif'}</b>
                </div>
            `;
            return;
        }

        if (statusText) statusText.innerText = wRadar.loading || 'Memuat driver...';
        if (!useRamOnly) {
            container.innerHTML = `
                <div class="glass-panel text-center" style="padding: 32px 20px; border-radius: 16px; display: flex; flex-direction: column; align-items: center; gap: 12px;">
                    <i class="fa-solid fa-location-dot gps-icon-pulse text-gold" style="font-size: 1.7rem;"></i>
                    <span class="font-tech text-xs text-muted" style="letter-spacing: 0.8px;">${wRadar.searching_nearest || 'MENAMPILKAN DRIVER TERDEKAT...'}</span>
                </div>
            `;
        }

        const executeHydrationAt = async (lat, lng) => {
            const safeLat = !isNaN(parseFloat(lat)) ? parseFloat(lat) : -7.768049;
            const safeLng = !isNaN(parseFloat(lng)) ? parseFloat(lng) : 112.196514;
            this._catalogLastLat = safeLat;
            this._catalogLastLng = safeLng;

            if (!useRamOnly) {
                this._catalogLastRefreshTime = Date.now();
                this._startCatalogCooldownUI();
            }

            const addrEl = document.getElementById('catalogUserAddress') || document.getElementById('radarUserAddress');
            if (addrEl) {
                const zoneName = window.BAGANTARA_ACTIVE_ZONE_ID ? `${window.BAGANTARA_ACTIVE_ZONE_ID} • ` : '';
                addrEl.textContent = `${zoneName}${safeLat.toFixed(5)}, ${safeLng.toFixed(5)}`;
                if (window.GeocoderAPI && typeof window.GeocoderAPI.reverseGeocode === 'function') {
                    window.GeocoderAPI.reverseGeocode(safeLat, safeLng, false).then((resolvedAddr) => {
                        if (resolvedAddr && !resolvedAddr.startsWith('Titik Peta') && addrEl) {
                            addrEl.textContent = `${zoneName}${resolvedAddr}`;
                        }
                    }).catch(() => {});
                }
            }

            const result = await window.AegisEngine.scanKatalogMitra(
                safeLat,
                safeLng,
                this._catalogActiveFilter,
                forceRefresh,
                this._catalogCurrentLimit,
                useRamOnly
            );

            if (this._quickFareDistanceKm > 0 && Array.isArray(result.drivers) && result.drivers.length > 0) {
                await this.fetchServerBatchFarePreview(result.drivers, this._quickFareDistanceKm);
            }

            this.renderMitraCatalogCards(result.drivers, result.hasMore, result.totalTersedia);
        };

        if (useRamOnly) {
            const best = this._resolveBestCatalogCoord();
            await executeHydrationAt(best.lat, best.lng);
            return;
        }

        const maxAgeMs = parseInt(mapRouting.gps_max_age_ms, 10) || 120000;
        if (!forceRefresh && window.BAGANTARA_USER_GPS_COORD && !isNaN(parseFloat(window.BAGANTARA_USER_GPS_COORD.lat)) && (Date.now() - (window.BAGANTARA_USER_GPS_COORD.ts || 0) < maxAgeMs)) {
            await executeHydrationAt(window.BAGANTARA_USER_GPS_COORD.lat, window.BAGANTARA_USER_GPS_COORD.lng);
            return;
        }

        if (navigator.geolocation) {
            let refreshSettled = false;
            const fallbackRefreshTimer = setTimeout(() => {
                if (refreshSettled) return;
                refreshSettled = true;
                const fb = this._resolveBestCatalogCoord();
                executeHydrationAt(fb.lat, fb.lng);
            }, 4000);

            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    if (refreshSettled) return;
                    refreshSettled = true;
                    clearTimeout(fallbackRefreshTimer);
                    const uLat = pos.coords.latitude;
                    const uLng = pos.coords.longitude;
                    window.BAGANTARA_GPS_VERIFIED = true;
                    window.BAGANTARA_USER_GPS_COORD = { lat: uLat, lng: uLng, ts: Date.now(), isFallback: false };
                    window.BAGANTARA_ACTIVE_COORD = { lat: uLat, lng: uLng, isFallback: false };
                    if (typeof window.saveLastValidGpsCoord === 'function') {
                        window.saveLastValidGpsCoord(uLat, uLng);
                    }
                    executeHydrationAt(uLat, uLng);
                },
                () => {
                    if (refreshSettled) return;
                    refreshSettled = true;
                    clearTimeout(fallbackRefreshTimer);
                    const fb = this._resolveBestCatalogCoord();
                    executeHydrationAt(fb.lat, fb.lng);
                },
                {
                    enableHighAccuracy: false,
                    timeout: 3500,
                    maximumAge: 60000
                }
            );
        } else {
            const fb = this._resolveBestCatalogCoord();
            await executeHydrationAt(fb.lat, fb.lng);
        }
    },

    openDriverServerLocationModal: function(driverObj, meta = {}) {
        const modal = document.getElementById('driver-last-loc-modal');
        if (!modal) {
            if (meta.gmapsUrl) window.open(meta.gmapsUrl, '_blank', 'noopener');
            return;
        }
        const elName = document.getElementById('dlm-driver-name');
        const elCoord = document.getElementById('dlm-coord-val');
        const elTime = document.getElementById('dlm-time-val');
        const elNotice = document.getElementById('dlm-notice-text');
        const elLink = document.getElementById('dlm-gmaps-link');

        if (elName) elName.textContent = `${driverObj.nama || 'Driver'} • ${driverObj.plat || ''}`;
        if (elCoord) elCoord.textContent = `${Number(driverObj.lat).toFixed(5)}, ${Number(driverObj.lng).toFixed(5)}`;
        if (elTime) elTime.textContent = `${meta.recordedJamStr || '--:--'} WIB (${meta.recordedAgoLabel || 'Tercatat'})`;
        if (elNotice) elNotice.textContent = meta.noticeText || 'Titik ini adalah posisi lokasi pengemudi yang tercatat terakhir oleh server Bagantara.';
        if (elLink) elLink.href = meta.gmapsUrl || `https://www.google.com/maps/search/?api=1&query=${driverObj.lat},${driverObj.lng}`;

        const closeModal = () => modal.classList.add('hidden');
        const btnTop = document.getElementById('btn-close-dlm-top');
        const btnBot = document.getElementById('btn-close-dlm-bottom');
        if (btnTop) btnTop.onclick = closeModal;
        if (btnBot) btnBot.onclick = closeModal;
        if (elLink) elLink.onclick = () => setTimeout(closeModal, 150);
        modal.onclick = (ev) => {
            if (ev.target === modal) closeModal();
        };

        modal.classList.remove('hidden');
        if (typeof window.armBgtHistoryGuard === 'function') window.armBgtHistoryGuard('driver-loc');
    },

    openDriverQrisModal: function(driverObj) {
        if (!driverObj) return;
        const cleanQrisUrl = normalizeDriverQrisUrl(driverObj.qrisUrl || driverObj.qris_url || '');
        if (!cleanQrisUrl) return;

        let modal = document.getElementById('driver-qris-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'driver-qris-modal';
            modal.className = 'captcha-overlay hidden';
            modal.style.cssText = 'z-index: 12550; padding: 16px;';
            modal.innerHTML = `
                <div class="driver-loc-modal-card" style="max-width: 360px; align-items: center; text-align: center;">
                    <div class="driver-loc-modal-header" style="width: 100%; text-align: left;">
                        <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                            <div class="driver-loc-modal-ring" style="background: rgba(16, 185, 129, 0.16); border-color: rgba(16, 185, 129, 0.45); color: var(--neon-green);">
                                <i class="fa-solid fa-qrcode"></i>
                            </div>
                            <div style="min-width: 0;">
                                <div class="font-tech" style="font-size: 0.56rem; font-weight: 800; letter-spacing: 1.2px; color: var(--neon-green); text-transform: uppercase;">PEMBAYARAN NON-TUNAI RESMI</div>
                                <h3 id="dqm-driver-name" class="font-tech text-main" style="font-size: 0.92rem; font-weight: 800; margin: 1px 0 0 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Pengemudi Bagantara</h3>
                                <span id="dqm-driver-plat" class="font-tech text-gold" style="font-size: 0.65rem; font-weight: 800; display: block; margin-top: 1px;">-</span>
                            </div>
                        </div>
                        <button type="button" id="btn-close-dqm-top" class="driver-loc-modal-close" aria-label="Tutup">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                    <div style="position: relative; width: 235px; height: 235px; margin: 4px auto; padding: 10px; border-radius: 16px; background: #ffffff; border: 2px solid var(--neon-gold); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45); overflow: hidden;" oncontextmenu="return false;">
                        <img id="dqm-qris-img" src="" referrerpolicy="no-referrer" alt="QRIS Pengemudi" draggable="false" oncontextmenu="return false;" style="width: 100%; height: 100%; object-fit: contain; display: block; user-select: none; -webkit-user-drag: none;">
                        <div class="photo-armor-shield" oncontextmenu="return false;"></div>
                    </div>
                    <div class="driver-loc-notice-box" style="width: 100%; background: rgba(16, 185, 129, 0.08); border-color: rgba(16, 185, 129, 0.4); border-left-color: var(--neon-green);">
                        <p id="dqm-caption-text" style="font-size: 0.72rem; color: var(--text-main); line-height: 1.5; margin: 0; text-align: center; font-weight: 600;">
                            Pindai kode QRIS resmi pengemudi ini menggunakan aplikasi Mobile Banking atau E-Wallet Anda
                        </p>
                    </div>
                    <div style="display: flex; width: 100%; margin-top: 2px;">
                        <button type="button" id="btn-close-dqm-bottom" class="btn-primary w-full" style="font-size: 0.75rem; padding: 11px 14px; border-radius: 11px;">
                            TUTUP
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const elName = document.getElementById('dqm-driver-name');
        const elPlat = document.getElementById('dqm-driver-plat');
        const elImg = document.getElementById('dqm-qris-img');
        const elCaption = document.getElementById('dqm-caption-text');

        if (elName) elName.textContent = driverObj.nama || 'Pengemudi Bagantara';
        if (elPlat) {
            const platStr = (driverObj.plat && driverObj.plat !== '-') ? driverObj.plat : '';
            const kendStr = driverObj.kendaraan || '';
            elPlat.textContent = [platStr, kendStr].filter(Boolean).join(' • ') || 'QRIS Resmi Pengemudi';
        }
        if (elCaption) {
            elCaption.textContent = 'Pindai kode QRIS resmi pengemudi ini menggunakan aplikasi Mobile Banking atau E-Wallet Anda';
        }
        if (elImg) {
            elImg.setAttribute('referrerpolicy', 'no-referrer');
            elImg.referrerPolicy = 'no-referrer';
            elImg.src = cleanQrisUrl;
        }

        const closeModal = () => modal.classList.add('hidden');
        const btnTop = document.getElementById('btn-close-dqm-top');
        const btnBot = document.getElementById('btn-close-dqm-bottom');
        if (btnTop) btnTop.onclick = closeModal;
        if (btnBot) btnBot.onclick = closeModal;
        modal.onclick = (ev) => {
            if (ev.target === modal) closeModal();
        };

        modal.classList.remove('hidden');
        if (typeof window.armBgtHistoryGuard === 'function') window.armBgtHistoryGuard('driver-qris');
    },


    renderMitraCatalogCards: function(drivers, hasMore = false, totalTersedia = 0) {
        const container = document.getElementById('mitraCatalogContainer');
        const statusText = document.getElementById('mitraMapStatusText');
        const tplCard = document.getElementById('tpl-mitra-catalog-card');
        if (!container || !tplCard) return;

        const wRadar = window.BGN_CONFIG?.wording?.radar || {};
        const wPopup = window.BGN_CONFIG?.wording?.mitra_popup || {};
        const wBtns = window.BGN_CONFIG?.wording?.buttons || {};
        const mapCfg = window.BGN_CONFIG?.settings?.map_config || { default_avatar_url: './assets/icon-192.png', google_maps_search_url: 'https://www.google.com/maps/search/?api=1&query=' };
        const radarCfg = window.BGN_CONFIG?.rules_app?.radar_mitra || { warm_signal_threshold_minutes: 2, max_drivers_rendered: 10 };
        const defaultMinTariff = window.BGN_CONFIG?.rules_app?.matchmaking?.default_min_tariff || 10000;
        const currencyCode = window.BGN_CONFIG?.tariffs?.currency || 'IDR';

        container.innerHTML = '';

        if (statusText) {
            statusText.innerText = `${drivers ? drivers.length : 0} ${wRadar.active_drivers_suffix || 'Driver Tersedia'}`;
        }

        if (!drivers || drivers.length === 0) {
            const tplEmpty = document.getElementById('tpl-empty-drivers');
            if (tplEmpty) {
                container.appendChild(tplEmpty.content.cloneNode(true));
            }
            return;
        }

        const fragment = document.createDocumentFragment();
        const now = Date.now();

        let hasRenderedWaDivider = false;

        drivers.forEach((d, idx) => {
            if (d.isWaFallbackOnly && !hasRenderedWaDivider) {
                hasRenderedWaDivider = true;
                const divider = document.createElement('div');
                divider.style.cssText = 'margin: 10px 0 4px 0; padding: 7px 12px; border-radius: 10px; background: rgba(16, 185, 129, 0.08); border: 1px dashed rgba(16, 185, 129, 0.4); display: flex; align-items: center; justify-content: space-between; gap: 8px;';
                divider.innerHTML = `
                    <span class="font-tech" style="font-size: 0.63rem; font-weight: 800; color: var(--emerald-accent); letter-spacing: 0.5px;">
                        <i class="fa-brands fa-whatsapp"></i> PENGEMUDI SIAGA WHATSAPP
                    </span>
                    <span style="font-size: 0.58rem; color: var(--text-muted); font-weight: 600;">Pesan langsung melalui WhatsApp</span>
                `;
                fragment.appendChild(divider);
            }

            const clone = tplCard.content.cloneNode(true);
            const cardEl = clone.querySelector('.mitra-catalog-card');
            const badgeNearest = clone.querySelector('.tpl-badge-terdekat');

            if (d.isWaFallbackOnly) {
                if (cardEl) {
                    cardEl.style.borderColor = 'rgba(16, 185, 129, 0.35)';
                    if (idx === 0) cardEl.classList.add('expanded');
                }
                if (badgeNearest) {
                    badgeNearest.style.display = 'inline-flex';
                    badgeNearest.style.background = 'rgba(16, 185, 129, 0.16)';
                    badgeNearest.style.borderColor = '#10b981';
                    badgeNearest.style.color = 'var(--emerald-accent)';
                    badgeNearest.innerHTML = `<i class="fa-brands fa-whatsapp"></i> ${wRadar.wa_standby_badge || 'SIAGA WA'}`;
                }
            } else if (idx === 0 && cardEl) {
                cardEl.classList.add('is-nearest', 'expanded');
                if (badgeNearest) badgeNearest.style.display = 'inline-flex';
            }

            const summaryRow = clone.querySelector('.driver-card-summary');
            if (summaryRow && cardEl) {
                summaryRow.addEventListener('click', () => {
                    cardEl.classList.toggle('expanded');
                });
            }

            const imgEl = clone.querySelector('.tpl-foto');
            if (imgEl) this.applyProtectedAvatar(imgEl, d.fotoProfile, mapCfg.default_avatar_url);

            const selisihMenit = d.timestamp ? Math.max(0, Math.floor((now - d.timestamp) / 60000)) : 0;
            const avatarRing = clone.querySelector('.tpl-avatar-ring');
            if (avatarRing) {
                if (selisihMenit >= radarCfg.warm_signal_threshold_minutes) avatarRing.classList.add('warm-signal');
                else avatarRing.classList.add('fresh-signal');
            }

            const namaEl = clone.querySelector('.tpl-nama');
            if (namaEl) namaEl.textContent = d.nama;

            const cleanQrisUrl = normalizeDriverQrisUrl(d.qrisUrl || d.qris_url || '');
            d.qrisUrl = cleanQrisUrl;

            const badgeQrisEl = clone.querySelector('.badge-qris-ready');
            if (badgeQrisEl) {
                if (cleanQrisUrl) {
                    badgeQrisEl.classList.remove('hidden');
                    badgeQrisEl.style.display = 'inline-flex';
                    badgeQrisEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (navigator.vibrate) navigator.vibrate(15);
                        this.openDriverQrisModal(d);
                    });
                } else {
                    badgeQrisEl.classList.add('hidden');
                    badgeQrisEl.style.display = 'none';
                }
            }

            const qrisDrawerBar = clone.querySelector('.tpl-qris-drawer-bar');
            if (qrisDrawerBar) {
                if (cleanQrisUrl) {
                    qrisDrawerBar.classList.remove('hidden');
                    qrisDrawerBar.style.display = 'flex';
                    const btnPreviewQris = qrisDrawerBar.querySelector('.btn-preview-driver-qris');
                    if (btnPreviewQris) {
                        btnPreviewQris.addEventListener('click', (e) => {
                            e.stopPropagation();
                            if (navigator.vibrate) navigator.vibrate(15);
                            this.openDriverQrisModal(d);
                        });
                    }
                } else {
                    qrisDrawerBar.classList.add('hidden');
                    qrisDrawerBar.style.display = 'none';
                }
            }

            const badgeArmadaEl = clone.querySelector('.tpl-armada-badge');
            if (badgeArmadaEl) {
                const isMobil = d.armada === (wPopup.driver_car || 'MOBIL');
                badgeArmadaEl.innerHTML = isMobil
                    ? `<i class="fa-solid fa-car-side"></i> ${wPopup.driver_car || 'MOBIL'}`
                    : `<i class="fa-solid fa-motorcycle"></i> ${wPopup.driver_bike || 'MOTOR'}`;
            }

            const jarakEl = clone.querySelector('.tpl-jarak');
            if (jarakEl) jarakEl.textContent = `~${d.jarak.toFixed(1)} KM`;

            // Kapsul Tautan & Pemberitahuan Lokasi Driver yang Tercatat Terakhir oleh Server
            const recordedTs = Number(d.serverRecordedAt || d.timestamp || now);
            const recordedDt = new Date(recordedTs);
            const recordedJamStr = `${String(recordedDt.getHours()).padStart(2, '0')}:${String(recordedDt.getMinutes()).padStart(2, '0')}`;
            const recordedMinAgo = Math.max(0, Math.floor((now - recordedTs) / 60000));
            const recordedAgoLabel = recordedMinAgo < 1 ? 'Baru saja' : `${recordedMinAgo}m lalu`;
            const baseGmapsUrl = mapCfg.google_maps_search_url || 'https://www.google.com/maps/search/?api=1&query=';
            const gmapsDriverUrl = `${baseGmapsUrl}${encodeURIComponent(d.lat + ',' + d.lng)}`;

            let noticeTextServer = '';
            if (d.isWaFallbackOnly) {
                noticeTextServer = `Titik lokasi terakhir driver yang tercatat server pukul ${recordedJamStr} WIB (${recordedAgoLabel}) sebelum mode Siaga WA. Lokasi aktual dapat berubah.`;
            } else if (d.mode === 'standby' && d.expiresAt && Number(d.expiresAt) > now) {
                const dtExp = new Date(Number(d.expiresAt));
                const expStr = `${String(dtExp.getHours()).padStart(2, '0')}:${String(dtExp.getMinutes()).padStart(2, '0')}`;
                noticeTextServer = `Titik mangkal driver yang tercatat server pukul ${recordedJamStr} WIB (Siaga di sekitar titik ini s/d ${expStr} WIB).`;
            } else {
                noticeTextServer = `Titik GPS terakhir driver yang tercatat server pukul ${recordedJamStr} WIB (${recordedAgoLabel}). Posisi aktual dapat bergeser saat armada bergerak.`;
            }

            const locCapsuleBtn = clone.querySelector('.tpl-driver-loc-capsule');
            if (locCapsuleBtn) {
                const locLabelEl = locCapsuleBtn.querySelector('.tpl-driver-loc-label');
                if (locLabelEl) {
                    locLabelEl.textContent = d.mode === 'standby' ? 'Titik Mangkal' : 'Lokasi Tercatat';
                }
                locCapsuleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (navigator.vibrate) navigator.vibrate(15);
                    this.openDriverServerLocationModal(d, {
                        gmapsUrl: gmapsDriverUrl,
                        recordedJamStr: recordedJamStr,
                        recordedAgoLabel: recordedAgoLabel,
                        noticeText: noticeTextServer
                    });
                });
            }

            const fmtTarif = new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: currencyCode,
                minimumFractionDigits: 0
            }).format(d.tarifMin ? d.tarifMin : defaultMinTariff);

            const tarifSummaryEl = clone.querySelector('.tpl-tarif-ringkas');
            if (tarifSummaryEl) tarifSummaryEl.remove();

            const tarifEl = clone.querySelector('.tpl-tarif');
            if (tarifEl) tarifEl.textContent = fmtTarif;

            const qfPill = clone.querySelector('.tpl-quick-fare-pill');
            const minGateBox = clone.querySelector('.tpl-min-tariff-gate');
            const minGateMsg = clone.querySelector('.tpl-min-tariff-msg');
            const btnForceSelect = clone.querySelector('.tpl-btn-force-select');
            const btnForceLabel = clone.querySelector('.tpl-btn-force-label');

            if (qfPill) {
                if (this._quickFareDistanceKm > 0) {
                    const previewSrv = (this._catalogActiveFilter && this._catalogActiveFilter !== 'ALL')
                        ? this._catalogActiveFilter
                        : (d.armada === (wPopup.driver_car || 'MOBIL') ? 'CAR' : 'RIDE');
                    const estObj = this.calculateInstantDriverFare(d, previewSrv, this._quickFareDistanceKm);
                    if (estObj) {
                        const fmtFinal = new Intl.NumberFormat('id-ID', { style: 'currency', currency: currencyCode, minimumFractionDigits: 0 }).format(estObj.finalFare);
                        const fmtRoute = new Intl.NumberFormat('id-ID', { style: 'currency', currency: currencyCode, minimumFractionDigits: 0 }).format(estObj.routeFare);

                        if (estObj.isMinTariffApplied) {
                            qfPill.className = 'tpl-quick-fare-pill quick-fare-card-pill is-below-min';
                            qfPill.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Est. Rute ${fmtRoute} &lt; Min. ${fmtFinal}`;
                            qfPill.classList.remove('hidden');

                            if (cardEl) {
                                cardEl.classList.add('below-min-tariff');
                                cardEl.classList.remove('expanded');
                            }

                            if (minGateBox && minGateMsg && btnForceSelect && btnForceLabel) {
                                minGateMsg.innerHTML = `Driver hanya menerima trip nominal minimum <b style="color: #fca5a5;">${fmtFinal}</b> (estimasi jarak Anda <b>${fmtRoute}</b>).`;
                                btnForceLabel.textContent = `Tetap Pilih Driver Ini (${fmtFinal})`;
                                minGateBox.classList.remove('hidden');

                                btnForceSelect.addEventListener('click', (e) => {
                                    e.stopPropagation();
                                    if (navigator.vibrate) navigator.vibrate(25);
                                    if (cardEl) {
                                        cardEl.classList.add('min-tariff-unlocked', 'expanded');
                                    }
                                    window.BAGANTARA_MIN_TARIFF_PREAPPROVED = true;
                                    btnForceLabel.textContent = `Disetujui Tarif Min. ${fmtFinal} — Pilih Layanan di Bawah`;
                                });
                            }
                        } else {
                            qfPill.className = 'tpl-quick-fare-pill quick-fare-card-pill';
                            qfPill.innerHTML = `<i class="fa-solid fa-bolt"></i> Est. ${fmtFinal}`;
                            qfPill.classList.remove('hidden');
                            if (minGateBox) minGateBox.classList.add('hidden');
                        }
                    }
                } else {
                    qfPill.classList.add('hidden');
                    if (minGateBox) minGateBox.classList.add('hidden');
                }
            }

            const kendEl = clone.querySelector('.tpl-kendaraan');
            if (kendEl) kendEl.textContent = d.kendaraan;

            const platEl = clone.querySelector('.tpl-plat-badge');
            if (platEl) platEl.textContent = d.plat;

            const radiusEl = clone.querySelector('.tpl-radius');
            if (radiusEl) radiusEl.textContent = `${wRadar.max_radius_prefix || 'Maks.'} ${d.radius} KM`;

            const waktuEl = clone.querySelector('.tpl-waktu-aktif');
            if (waktuEl) {
                if (d.isWaFallbackOnly) {
                    waktuEl.textContent = wRadar.wa_standby_status || 'Siaga WhatsApp • Pesan via WhatsApp';
                    waktuEl.style.color = 'var(--emerald-accent)';
                } else if (d.mode === 'standby' && d.expiresAt && Number(d.expiresAt) > now) {
                    const dtEnd = new Date(Number(d.expiresAt));
                    const endJamStr = `${String(dtEnd.getHours()).padStart(2, '0')}:${String(dtEnd.getMinutes()).padStart(2, '0')}`;
                    waktuEl.textContent = `Mangkal s/d ${endJamStr} WIB`;
                } else {
                    waktuEl.textContent = selisihMenit < 1
                        ? (wRadar.active_just_now || 'Baru saja aktif')
                        : `${wRadar.active_minutes_ago_prefix || 'Aktif'} ${selisihMenit}${wRadar.active_minutes_ago_suffix || 'm lalu'}`;
                }
            }

            const promoWrap = clone.querySelector('.tpl-promo-wrap');
            const promoTextEl = clone.querySelector('.tpl-promo-teks');
            const diskonEntries = d.diskonMap ? Object.entries(d.diskonMap).filter(([, v]) => Number(v) > 0) : [];
            if (promoWrap && promoTextEl) {
                const rincianDiskonStr = diskonEntries.map(([k, v]) => `${k} -${v}%`).join(' • ');
                const adaPromoTeks = Boolean(d.promoTeks && d.promoTeks.trim() !== '');
                if (adaPromoTeks || rincianDiskonStr) {
                    promoTextEl.textContent = adaPromoTeks && rincianDiskonStr
                        ? `${d.promoTeks} (${rincianDiskonStr})`
                        : (adaPromoTeks ? d.promoTeks : `Diskon Spesial Layanan: ${rincianDiskonStr}`);
                    promoWrap.style.display = 'flex';
                } else {
                    promoWrap.style.display = 'none';
                }
            }

            const agendaWrap = clone.querySelector('.tpl-agenda-wrap');
            const agendaText = clone.querySelector('.tpl-info-agenda');
            if (agendaWrap && agendaText) {
                if (d.info && d.info.trim() !== '' && d.info !== (wPopup.no_notes || '-')) {
                    agendaText.textContent = `"${d.info}"`;
                    agendaWrap.style.display = 'flex';
                } else {
                    agendaWrap.style.display = 'none';
                }
            }

            const containerServices = clone.querySelector('.tpl-dynamic-services');
            if (containerServices) {
                containerServices.innerHTML = '';
                const listLayanan = (d.armada === (wPopup.driver_car || 'MOBIL')) ? ['CAR'] : (Array.isArray(d.layanan) ? d.layanan : []);

                listLayanan.forEach(srvItem => {
                    const srv = srvItem.toUpperCase();
                    const btnSrv = document.createElement('button');
                    btnSrv.type = 'button';
                    btnSrv.className = 'btn-mitra-srv';

                    let iconClass = 'fa-solid fa-location-dot';
                    if (d.isWaFallbackOnly) iconClass = 'fa-brands fa-whatsapp';
                    else if (srv === 'RIDE') iconClass = 'fa-solid fa-motorcycle';
                    else if (srv === 'CAR') iconClass = 'fa-solid fa-car-side';
                    else if (srv === 'EXPRESS') iconClass = 'fa-solid fa-cube';
                    else if (srv === 'JASTIP') iconClass = 'fa-solid fa-bag-shopping';

                    const srvDiskonPct = (d.diskonMap && Number(d.diskonMap[srv]) > 0) ? Number(d.diskonMap[srv]) : 0;
                    const badgeDiskonBtn = srvDiskonPct > 0
                        ? ` <span style="background: rgba(16, 185, 129, 0.22); border: 1px solid #10b981; color: var(--emerald-accent); padding: 1px 5px; border-radius: 5px; font-size: 0.58rem; font-weight: 900; margin-left: 4px;">-${srvDiskonPct}%</span>`
                        : '';
                    const prefixOrder = d.isWaFallbackOnly
                        ? (wRadar.order_wa_service_prefix || 'PESAN WA:')
                        : (wRadar.order_service_prefix || 'PESAN');

                    let quickPriceSuffix = '';
                    if (this._quickFareDistanceKm > 0) {
                        const srvEst = this.calculateInstantDriverFare(d, srv, this._quickFareDistanceKm);
                        if (srvEst) {
                            const fmtSrvEst = new Intl.NumberFormat('id-ID', { style: 'currency', currency: currencyCode, minimumFractionDigits: 0 }).format(srvEst.finalFare);
                            const minTag = srvEst.isMinTariffApplied ? 'Min. ' : '';
                            const colStyle = srvEst.isMinTariffApplied ? 'color: #fca5a5;' : 'color: var(--text-main);';
                            quickPriceSuffix = ` <span style="${colStyle} font-weight: 900; margin-left: 3px;">• ${minTag}${fmtSrvEst}</span>`;
                        }
                    }
                    btnSrv.innerHTML = `<i class="${iconClass}"></i> <span>${prefixOrder} ${srv}${badgeDiskonBtn}${quickPriceSuffix}</span>`;

                    btnSrv.addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (navigator.vibrate) navigator.vibrate(25);

                        const prelockedData = {
                            uid: d.uid,
                            nama: d.nama,
                            wa: d.wa,
                            plat: d.plat,
                            kendaraan: d.kendaraan,
                            fotoProfile: d.fotoProfile ? d.fotoProfile : mapCfg.default_avatar_url,
                            qrisUrl: cleanQrisUrl,
                            tarifMin: d.tarifMin,
                            radius: d.radius,
                            lat: d.lat,
                            lng: d.lng,
                            info: d.info ? d.info : (wPopup.no_notes || '-'),
                            promoTeks: d.promoTeks ? d.promoTeks : '',
                            diskonMap: d.diskonMap ? d.diskonMap : {},
                            isWaFallbackOnly: Boolean(d.isWaFallbackOnly),
                            armada: d.armada,
                            layanan: listLayanan,
                            jarak: d.jarak
                        };

                        const savedCoord = this._resolveBestCatalogCoord();
                        const savedZone = window.BAGANTARA_ACTIVE_ZONE_ID;
                        if (window.SystemReset) window.SystemReset();

                        window.BAGANTARA_GPS_VERIFIED = true;
                        window.BAGANTARA_ACTIVE_COORD = savedCoord;
                        if (!window.BAGANTARA_USER_GPS_COORD) {
                            window.BAGANTARA_USER_GPS_COORD = { lat: savedCoord.lat, lng: savedCoord.lng, ts: Date.now() };
                        }
                        if (savedZone) window.BAGANTARA_ACTIVE_ZONE_ID = savedZone;
                        window.BAGANTARA_PRELOCKED_DRIVER = prelockedData;
                        const savedQuickDest = this._quickFareDestCoord ? { ...this._quickFareDestCoord } : null;

                        if (window.ServiceRouter) window.ServiceRouter.route(srv);

                        if (savedQuickDest && !isNaN(parseFloat(savedQuickDest.lat)) && !isNaN(parseFloat(savedQuickDest.lng))) {
                            if ((srv === 'RIDE' || srv === 'CAR' || srv === 'EXPRESS') && window.FlowEngine && typeof window.FlowEngine._lockFieldDirectly === 'function') {
                                setTimeout(() => {
                                    window.FlowEngine._lockFieldDirectly('inputSearchDropoff1', savedQuickDest.title, savedQuickDest.lat, savedQuickDest.lng, 'Dari Estimasi Cepat Katalog');
                                }, 60);
                            }
                        }
                    });

                    containerServices.appendChild(btnSrv);
                });
            }

            fragment.appendChild(clone);
        });

        if (hasMore) {
            const btnMore = document.createElement('button');
            btnMore.type = 'button';
            btnMore.className = 'btn-primary w-full mt-2';
            btnMore.style.fontSize = '0.75rem';
            btnMore.innerHTML = `<i class="fa-solid fa-angles-down"></i> ${wBtns.load_more_drivers || 'TAMPILKAN DRIVER LAINNYA'} (${drivers.length} / ${totalTersedia})`;
            btnMore.addEventListener('click', () => {
                const step = parseInt(window.BGN_CONFIG?.rules_app?.radar_mitra?.max_drivers_rendered, 10) || 10;
                this._catalogCurrentLimit += step;
                this.loadMitraCatalog(false, true);
            });
            fragment.appendChild(btnMore);
        }

        container.appendChild(fragment);
    },

    initGlobalControls: function() {
        this._bindCatalogInteractiveControls();

        window.alert = (message, title = 'INFORMASI LAYANAN') => {
            this.alert(message, title);
        };

        const closeAlertBtn = document.getElementById('btn-close-alert');
        if (closeAlertBtn) closeAlertBtn.addEventListener('click', () => document.getElementById('cyber-alert').classList.add('hidden'));

        const inputInlineNotes = document.getElementById('inputInlineNotes');
        if (inputInlineNotes) {
            inputInlineNotes.addEventListener('focus', () => {
                setTimeout(() => inputInlineNotes.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
            });
            inputInlineNotes.addEventListener('blur', () => window.scrollTo(0, 0));
        }

        const inputSearchDropoff1 = document.getElementById('inputSearchDropoff1');
        const viewSearchRoute = document.getElementById('view-search-route');
        if (inputSearchDropoff1 && viewSearchRoute) {
            inputSearchDropoff1.addEventListener('focus', () => {
                if (viewSearchRoute.classList.contains('compact-mode')) {
                    viewSearchRoute.classList.remove('compact-mode');
                    viewSearchRoute.classList.add('expanded-mode');
                }
            });
        }

        window.addEventListener('initMitraCatalogEvent', () => {
            this.initMitraCatalog();
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.UIManager.initGlobalControls();
    
    document.querySelectorAll('.btn-clear-input').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const inputTarget = this.previousElementSibling;
            if (inputTarget) window.UIManager.unlockSearchField(inputTarget.id);
        });
    });
});
