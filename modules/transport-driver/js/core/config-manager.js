// ==========================================
// FILE: js/core/config-manager.js
// FUNGSI: Penarik Konfigurasi Internal dari Memori Bundle Terenkripsi (RC4 + XOR Byte Array)
// ARSITEKTUR: MAPTILER EDITION (0% OSM & 0% PHOTON) - V13.2 PURE 3-NODE HARDENED
// ==========================================

const DEFAULT_SAFE_CONFIG = {
    settings: {
        version: 13.2,
        map_config: {
            tile_layer_url: "https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=GHEMVdokax4heMQCeIxM",
            fallback_tile_url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            max_zoom: 19,
            default_zoom: 16,
            focus_zoom: 17,
            tile_size: 256,
            keep_buffer: 2,
            max_tile_errors: 2,
            default_center: { lat: -7.768049, lng: 112.196514 },
            default_avatar_url: "./assets/icon-192.png",
            google_maps_search_url: "https://www.google.com/maps/search/?api=1&query=",
            google_maps_base_url: "https://www.google.com/maps/@",
            whatsapp_base_url: "https://wa.me/"
        },
        geocoder_api: {
            maptiler_key: "GHEMVdokax4heMQCeIxM",
            maptiler_search_url: "https://api.maptiler.com/geocoding/{query}.json?key=GHEMVdokax4heMQCeIxM&country=id&language=id&limit=6",
            maptiler_reverse_url: "https://api.maptiler.com/geocoding/{lng},{lat}.json?key=GHEMVdokax4heMQCeIxM&language=id&limit=1"
        },
        routing_api: {
            osrm_base_url: "https://router.project-osrm.org/route/v1/driving/"
        },
        paths: {
            drivers: "drivers",
            radar_tiket: "radar_tiket",
            sesi_komunikasi: "sesi_komunikasi",
            inbox_mitra: "inbox_mitra",
            inbox_driver: "inbox_driver",
            order_audit_log: "order_audit_log",
            device_reputation: "device_reputation"
        },
        micro_backend: {
            gas_fcm_url: "https://script.google.com/macros/s/AKfycbxkSFTmerLbUa5iEWEqyjUz9OVBo8xTznm90HJMKDRBQ9t-x8UxjUHas_K1JqqMgHzneg/exec",
            gas_unfurl_url: "https://script.google.com/macros/s/AKfycbxkSFTmerLbUa5iEWEqyjUz9OVBo8xTznm90HJMKDRBQ9t-x8UxjUHas_K1JqqMgHzneg/exec"
        },
        firebase_config: {
            projectId: "bagantara-core",
            databaseURL: "https://bagantara-core-default-rtdb.asia-southeast1.firebasedatabase.app"
        },
        firebase_core: {
            projectId: "bagantara-core",
            databaseURL: "https://bagantara-core-default-rtdb.asia-southeast1.firebasedatabase.app"
        },
        firebase_history: {
            projectId: "futaqi-ali",
            databaseURL: "https://futaqi-ali-default-rtdb.asia-southeast1.firebasedatabase.app"
        },
        firebase_overflow: {
            projectId: "futaqi-ali",
            databaseURL: "https://futaqi-ali-default-rtdb.asia-southeast1.firebasedatabase.app"
        },
        firebase_radar: {
            projectId: "chatting-88040",
            databaseURL: "https://chatting-88040-default-rtdb.asia-southeast1.firebasedatabase.app"
        },
        firebase_chat: {
            projectId: "chatting-88040",
            databaseURL: "https://chatting-88040-default-rtdb.asia-southeast1.firebasedatabase.app"
        },
        cluster_config: {
            node1_core: "https://bagantara-core-default-rtdb.asia-southeast1.firebasedatabase.app",
            node1_firestore_project: "bagantara-core",
            node2_history: "https://futaqi-ali-default-rtdb.asia-southeast1.firebasedatabase.app",
            node2_overflow: "https://futaqi-ali-default-rtdb.asia-southeast1.firebasedatabase.app",
            node3_radar: "https://chatting-88040-default-rtdb.asia-southeast1.firebasedatabase.app",
            node3_chat: "https://chatting-88040-default-rtdb.asia-southeast1.firebasedatabase.app"
        }
    },
    wording: {
        buttons: {
            dropoff: "KUNCI TUJUAN",
            pickup: "KUNCI JEMPUT",
            pickup_express: "KUNCI PENGAMBILAN",
            jastip_store: "KUNCI LOKASI TOKO",
            jastip_dropoff: "KUNCI PENGANTARAN",
            final: "LANJUTKAN PESANAN",
            final_jastip: "LANJUTKAN JASTIP",
            loading: "MEMPROSES...",
            locking_point: "MENGUNCI TITIK...",
            locking_store: "MENGUNCI TOKO...",
            locking_dropoff: "MENGUNCI TUJUAN...",
            cancel_search: "Batalkan Pesanan",
            prelock_order_prefix: "PESAN BERSAMA",
            prelock_jastip_prefix: "JASTIP BERSAMA",
            prelock_wa_order_prefix: "PESAN VIA WA:",
            prelock_wa_jastip_prefix: "JASTIP VIA WA:",
            load_more_drivers: "TAMPILKAN DRIVER LAINNYA",
            zone_recruit_wa: "DAFTAR PENGEMUDI PELOPOR",
            gmaps_import_inline: "CARI & IMPOR DARI GOOGLE MAPS",
            gmaps_import_footer: "Belum sesuai? Impor dari Google Maps"
        },
        map_pins: {
            dropoff_default: "TUJUAN (GESER)",
            pickup_default: "JEMPUT (GESER)",
            notes_default: "Ketik patokan lokasi...",
            pickup_jastip: "LOKASI TOKO (GESER)",
            notes_jastip_store: "Detail alamat toko / patokan...",
            dropoff_jastip: "LOKASI PENGANTARAN (GESER)",
            notes_jastip_drop: "Detail patokan pengantaran...",
            pickup_express: "AMBIL BARANG (GESER)",
            dropoff_express: "TUJUAN PENGIRIMAN",
            notes_express: "Detail barang & kontak penerima...",
            notes_car: "Patokan, jumlah penumpang, & barang bawaan...",
            scanning: "Mencari titik lokasi...",
            syncing: "Menyinkronkan data...",
            sync_failed: "Gagal memuat detail wilayah.",
            gps_current_accurate: "📍 Lokasi GPS Saat Ini (Akurat)",
            gps_home_current: "📍 Lokasi GPS Saya Saat Ini",
            map_point_prefix: "Titik Peta",
            wizard_dropoff: "TUJUAN",
            wizard_dropoff_multi_prefix: "TUJUAN KE-",
            wizard_pickup: "JEMPUT",
            wizard_pickup_express: "AMBIL BARANG",
            wizard_jastip_store: "LOKASI TOKO",
            wizard_jastip_dropoff: "LOKASI PENGANTARAN",
            wizard_confirm: "KONFIRMASI",
            wizard_confirm_driver: "KONFIRMASI DRIVER",
            wizard_confirm_jastip: "KONFIRMASI JASTIP",
            wizard_confirm_jastip_driver: "KONFIRMASI DRIVER TERPILIH",
            searching_gps: "Mencari Lokasi GPS...",
            searching_location: "MENCARI LOKASI...",
            multi_stop_placeholder_prefix: "Cari tujuan ke-"
        },
        radar: {
            loading: "Memuat driver...",
            searching_nearest: "MENAMPILKAN DRIVER TERDEKAT...",
            disabled: "Layanan Nonaktif",
            disabled_body: "Katalog Driver Sedang Nonaktif",
            gps_denied: "Lokasi GPS Belum Aktif",
            gps_denied_body: "Aktifkan layanan lokasi (GPS) pada perangkat Anda untuk melihat daftar pengemudi terdekat.",
            system_locked: "Di Luar Wilayah",
            ready_badge: "SIAP",
            wait_prefix: "Tunggu",
            active_just_now: "Baru saja aktif",
            active_minutes_ago_prefix: "Aktif",
            active_minutes_ago_suffix: "m lalu",
            active_drivers_suffix: "Driver Tersedia",
            min_tariff_prefix: "Min.",
            max_radius_prefix: "Maks.",
            order_service_prefix: "PESAN",
            order_wa_service_prefix: "PESAN WA:",
            wa_standby_badge: "SIAGA WA",
            wa_standby_status: "Siaga WhatsApp • Pesan via WhatsApp",
            min_driver_tariff_badge: "(Tarif Min. Driver)"
        },
        mitra_popup: {
            no_notes: "-",
            driver_car: "MOBIL",
            driver_bike: "MOTOR",
            default_driver_name: "Driver Bagantara",
            default_vehicle_car: "Mobil Standar",
            default_vehicle_bike: "Motor Standar",
            default_service: "RIDE",
            default_order_label: "ORDER",
            blocked_link_placeholder: "[TAUTAN DIBLOKIR]",
            jastip_items_count_suffix: "Item Belanjaan",
            jastip_breakdown_prefix: "Belanja:",
            jastip_shipping_prefix: "Ongkir:",
            peak_hour_badge_prefix: "Jam Sibuk:"
        },
        geocoder: {
            invalid_coord: "Koordinat Tidak Valid",
            detected_location: "Lokasi Terdeteksi",
            default_country: "Indonesia",
            default_region: "Jawa Timur, Indonesia",
            saved_history_subtitle: "Riwayat Tersimpan",
            locked_map_point_subtitle: "Titik Peta Terkunci",
            saved_phone_memory: "Tersimpan di Memori HP",
            gmaps_pin_name: "Lokasi Pin Google Maps",
            gmaps_coord_name: "Titik Google Maps",
            gmaps_dms_name: "Titik DMS Google Maps",
            gmaps_share_name: "Lokasi Share Google Maps",
            gmaps_custom_prefix: "Lokasi GMaps",
            precision_point_prefix: "Titik Presisi",
            precision_coord_prefix: "Koordinat Presisi",
            plus_code_prefix: "Plus Code",
            extracting_coord: "Mengekstrak koordinat lokasi...",
            point_found_badge: "KOORDINAT AWAL TERDETEKSI",
            accurate_badge: "WAJIB CEK DI PETA",
            empty_search_hint: "Lokasi spesifik belum terdaftar di peta standar."
        },
        chat_system: {
            default_client_name: "Penumpang",
            default_order_type: "ORDER",
            inbox_initial_preview: "Rincian pesanan masuk...",
            fcm_new_order_title: "Pesanan Baru Masuk",
            fcm_new_order_body_template: "Layanan {layanan} dari {nama} (Rp{harga})",
            session_title_prefix: "Sesi:",
            location_btn_label: "LOKASI",
            upload_failed_msg: "Gagal mengunggah media.",
            send_failed_msg: "Gagal mengirim.",
            voice_pause_label: "Jeda",
            voice_resume_label: "Lanjut",
            multi_stop_ready_label: "Multi-Stop (Navigasi Peta Siap)",
            empty_pickup_label: "Lokasi Jemput Kosong",
            empty_dropoff_label: "Lokasi Tujuan Kosong",
            note_label_prefix: "Catatan:",
            preview_location: "📍 Mengirim Lokasi",
            preview_audio: "🎤 Pesan Suara",
            preview_catalog: "📜 Rincian Pesanan",
            preview_image: "🖼️ Gambar Baru",
            catalog_shopping_header: "DAFTAR BELANJA:",
            catalog_shopping_total: "TOTAL BELANJA",
            catalog_driver_note: "CATATAN DRIVER:",
            catalog_tip_prefix: "Termasuk Tip",
            catalog_shipping_label: "ESTIMASI ONGKIR & JASA",
            catalog_total_tariff_label: "TOTAL ESTIMASI TARIF",
            catalog_order_prefix: "ORDER:",
            catalog_pickup_label: "Jemput:",
            catalog_dropoff_label: "Tujuan:",
            catalog_error_fallback: "[Rincian Pesanan]",
            location_card_title: "Titik Koordinat",
            location_open_maps: "BUKA MAPS",
            source_camera: "Kamera Langsung",
            source_gallery: "Galeri Perangkat"
        },
        alerts: {
            form_incomplete: "Harap lengkapi Nama dan Nomor WhatsApp yang valid.",
            uid_not_found: "Silakan pilih driver terlebih dahulu di Beranda.",
            jastip_warning: "Transaksi akan dilanjutkan sesuai Syarat & Ketentuan Layanan Bagantara.",
            wa_fallback_dispatched: "✅ Rincian pesanan telah diarahkan ke WhatsApp Driver! Silakan tekan tombol Kirim di aplikasi WhatsApp Anda.",
            calc_timeout: "Kalkulasi tarif memakan waktu terlalu lama akibat lambatnya koneksi. Silakan coba lagi.",
            address_not_found: "Alamat tidak ditemukan.<br>Gunakan opsi <b>Pilih lewat peta</b> atau <b>Cari via Google Maps</b>.",
            driver_locked_exact: "Driver <b>{nama}</b> dipilih untuk layanan <b>{srv}</b>.<br><br>Silakan tentukan titik jemput dan tujuan Anda.",
            driver_locked_multi: "Driver <b>{nama}</b> dipilih.<br><br>Silakan pilih layanan di bawah ini.",
            require_dropoff: "Harap kunci minimal 1 lokasi tujuan terlebih dahulu.",
            require_pickup: "Lokasi penjemputan belum ditentukan.",
            require_express_details: "Rincian barang dan Nama Penerima wajib diisi.",
            scanning_coords: "Sedang memuat titik koordinat, mohon tunggu sebentar.",
            require_jastip_items: "Harap masukkan minimal 1 barang dengan estimasi harga yang valid.",
            service_disabled: "Layanan ini sedang tidak aktif.",
            calc_failed: "Gagal memproses data.",
            out_of_zone: "Titik penjemputan berada di luar wilayah operasional yang aktif.",
            tariff_empty: "Struktur tarif wilayah belum dikonfigurasi.",
            service_empty: "Layanan belum tersedia di wilayah ini.",
            route_invalid: "Gagal menghitung rute. Titik tidak valid.",
            gps_denied: "Akses Lokasi GPS belum diaktifkan.",
            mic_denied: "Akses Mikrofon ditolak atau gagal dimuat.",
            chat_waiting: "⏳ Pesanan Terkirim Langsung ke Pengemudi — Menunggu Konfirmasi...",
            chat_cancel_manual: "Pesanan dibatalkan.",
            chat_timeout_driver: "Pengemudi belum merespons saat ini. Silakan pilih pengemudi lain.",
            chat_ticket_rejected: "Pesanan belum dapat diambil oleh Driver saat ini.",
            chat_connected: "✅ Driver terhubung! Pesanan dikonfirmasi.",
            chat_conn_failed: "Gagal menghubungkan ke server komunikasi.",
            chat_driver_unavailable: "Mohon maaf, driver belum dapat menerima pesanan Anda saat ini. Silakan pilih driver lain.",
            chat_ended: "Pesanan telah diselesaikan oleh Pengemudi. Terima kasih telah menggunakan Bagantara!",
            gmaps_input_empty: "Masukkan link Google Maps, Plus Code (XXXX+XXX), atau koordinat terlebih dahulu.",
            gmaps_shortlink_error: "Tautan pendek (maps.app.goo.gl) membutuhkan koneksi ke server pembuka tautan, ATAU salin Koordinat / Kode Plus (Cth: 65JX+QJM) langsung dari detail tempat di Google Maps.",
            gmaps_parse_failed: "Lokasi tidak terdeteksi dari teks tersebut. Tips: Tekan & tahan titik di Google Maps lalu salin angka koordinatnya (Cth: -7.7680, 112.1965), kemudian cek kembali posisi pin di peta.",
            content_maintenance: "Konten sedang dalam pembaruan."
        },
        templates: {
            wa_jastip_header: "*✨ PESANAN JASTIP BAGANTARA*\n\n",
            wa_fallback_order_header: "*✨ PESANAN PERJALANAN BAGANTARA*",
            wa_driver_greeting_acc: "Halo, saya penumpang Bagantara dengan ID Pesanan:",
            wa_driver_recovery: "Permisi, konfirmasi pesanan Bagantara. ID Pesanan:",
            wa_driver_check_active: "Halo, apakah Anda masih aktif menerima pesanan?",
            express_note_format: "[EXPRESS] Brg: {item} | Pnrima: {receiver} | Lokasi: {notes}",
            jastip_store_note_format: "[TOKO JASTIP] {store}"
        }
    },
    rules_app: {
        system_controls: {
            maintenance_mode: false,
            night_mode_start_hour: 18,
            night_mode_end_hour: 6,
            earth_radius_km: 6371,
            price_rounding_step: 100
        },
        radar_mitra: {
            is_active: true,
            max_drivers_rendered: 10,
            cooldown_refresh_sec: 20,
            warm_signal_threshold_minutes: 20,
            default_filter: "ALL"
        },
        matchmaking: {
            max_scan_radius_km: 15.0,
            max_profile_reads: 15,
            geohash_precision_level: 4,
            enable_boundary_neighbors: true,
            boundary_neighbor_offset_km: 4.0,
            rtdb_cache_ttl_sec: 60,
            rtdb_fetch_timeout_ms: 10000,
            max_offline_age_minutes: 5,
            max_wa_standby_hours: 12,
            default_min_tariff: 10000,
            wa_min_length: 10,
            wa_country_prefix: "62"
        },
        data_optimization: {
            lazy_load_profile: true,
            profile_cache_ttl_minutes: 1440
        },
        chat_controls: {
            media_feature_active: true,
            driver_response_timeout_ms: 180000,
            radar_poll_interval_ms: 4000,
            radar_fetch_timeout_ms: 5000,
            catalog_send_delay_ms: 1200,
            idle_disconnect_timeout_ms: 300000,
            media_upload_timeout_ms: 15000,
            image_max_width_px: 1200,
            image_jpeg_quality: 0.7,
            voice_max_duration_sec: 60,
            voice_lock_delta_y_px: -60,
            voice_cancel_delta_x_px: -50
        },
        form_validation: {
            min_name_length: 3,
            min_wa_length: 10,
            min_search_query_length: 3,
            max_multi_stops: 3,
            subtitle_max_chars: 55
        },
        map_and_routing: {
            search_lock_tolerance_km: 0.1,
            haversine_compensation_factor: 1.3,
            osrm_compensation_factor: 1.15,
            osrm_max_ratio_vs_haversine: 2.0,
            route_calc_debounce_ms: 350,
            fit_bounds_padding_px: 40,
            price_check_max_retries: 20,
            price_check_interval_ms: 500,
            search_debounce_ms: 900,
            gps_timeout_ms: 6000,
            gps_gatekeeper_timeout_ms: 10000,
            gps_max_age_ms: 60000
        },
        geocoder_rules: {
            cache_ttl_days: 30,
            max_cache_entries: 80,
            reverse_cache_radius_km: 0.075,
            vault_dedup_radius_km: 0.03,
            recent_dedup_radius_km: 0.05,
            max_vault_places: 30,
            max_combined_recent_places: 10,
            max_recent_places: 6,
            local_bbox_delta_deg: 0.65,
            maptiler_search_timeout_ms: 4500,
            maptiler_reverse_timeout_ms: 4000,
            gas_unfurl_timeout_ms: 6500,
            indonesia_bbox: {
                min_lat: -11.2,
                max_lat: 6.2,
                min_lng: 94.8,
                max_lng: 141.2
            },
            country_code: "ID"
        },
        security: {
            bad_words: ["anjing", "bangsat", "babi", "kontol", "memek", "penipu", "bajingan"],
            censored_replacement: "***"
        }
    },
    tariffs: {"version": 5, "currency": "IDR", "zones": {"KDR-PARE-01": {"RIDE": {"base_price": 6000, "min_distance_km": 2.0, "price_per_km": 2000, "multi_stop_fee": 0, "discount": "0%"}, "CAR": {"base_price": 15000, "min_distance_km": 2.0, "price_per_km": 4500, "multi_stop_fee": 0, "discount": "0%"}, "EXPRESS": {"base_price": 6000, "min_distance_km": 2.0, "price_per_km": 2000, "multi_stop_fee": 0, "discount": "0%"}, "JASTIP": {"base_price": 8000, "min_distance_km": 2.0, "price_per_km": 2000, "multi_stop_fee": 2000, "discount": "0%"}}}},
    peak_hours: {"version": 2, "zones": {"KDR-PARE-01": {"is_active": false, "rules": [{"name": "Sore Sibuk", "start_time": "16:00", "end_time": "19:00", "multiplier_factor": 1.25, "markup_flat": 2000}, {"name": "Hujan / Ekstrem", "start_time": "00:00", "end_time": "23:59", "multiplier_factor": 1.5, "markup_flat": 0}]}, "MLG-01": {"is_active": false, "rules": [{"name": "Macet Malang", "start_time": "15:00", "end_time": "20:00", "multiplier_factor": 1.3, "markup_flat": 3000}]}, "SBY-01": {"is_active": false, "rules": []}, "SDA-01": {"is_active": false, "rules": []}, "GSK-01": {"is_active": false, "rules": []}, "MJK-01": {"is_active": false, "rules": []}, "PSR-01": {"is_active": false, "rules": []}, "BTU-01": {"is_active": false, "rules": []}, "BLT-01": {"is_active": false, "rules": []}, "MDN-01": {"is_active": false, "rules": []}}},
    zones: {
        default_locked_message: {
            title: "ZONA BELUM TERSEDIA",
            body: "Halo Admin, saya melihat layanan ini belum beroperasi di wilayah saya.",
            wa_rekrutmen: "6282225225141"
        },
        active_zones: [
            { zone_id: "KDR-PARE-01", city_name: "Kediri", center: { lat: -7.768049, lng: 112.196514 }, radius_km: 25.0, is_open: true }
        ]
    },
    layanan: {
        services: { RIDE: true, CAR: true, EXPRESS: true, JASTIP: true }
    },
    content_pages: null
};

function decodeEmbeddedConfigVault() {
    try {
        const vault = window.__BGN_CONFIG_VAULT__;
        if (!vault || typeof vault.key !== 'string' || !Array.isArray(vault.bytes) || vault.bytes.length === 0) {
            return null;
        }

        const bytes = new Uint8Array(vault.bytes);
        const keyStr = vault.key;
        const seed = typeof vault.seed === 'number' ? (vault.seed & 0xff) : 0;

        const S = new Uint8Array(256);
        for (let i = 0; i < 256; i++) S[i] = i;
        let j = 0;
        for (let i = 0; i < 256; i++) {
            j = (j + S[i] + keyStr.charCodeAt(i % keyStr.length)) & 0xff;
            const tmp = S[i];
            S[i] = S[j];
            S[j] = tmp;
        }

        const len = bytes.length;
        const out = new Uint8Array(len);
        let x = 0;
        let y = 0;
        for (let k = 0; k < len; k++) {
            x = (x + 1) & 0xff;
            y = (y + S[x]) & 0xff;
            const tmp = S[x];
            S[x] = S[y];
            S[y] = tmp;
            const rc4Byte = S[(S[x] + S[y]) & 0xff];
            const xorSalt = (keyStr.charCodeAt(k % keyStr.length) ^ ((seed + ((k * 31) & 0xff)) & 0xff)) & 0xff;
            out[k] = bytes[k] ^ rc4Byte ^ xorSalt;
            bytes[k] = 0;
            vault.bytes[k] = 0;
        }

        vault.bytes.fill(0);
        vault.key = '';
        const jsonStr = new TextDecoder('utf-8').decode(out);
        out.fill(0);
        const parsed = JSON.parse(jsonStr);
        return (parsed && typeof parsed === 'object') ? parsed : null;
    } catch (e) {
        return null;
    }
}

function buildActiveRuntimeConfig() {
    const embeddedData = decodeEmbeddedConfigVault();

    const settingsRaw = embeddedData?.settings || null;
    const wordingRaw = embeddedData?.wording || null;
    const rulesAppRaw = embeddedData?.rules_app || null;
    const zonesRaw = embeddedData?.zones || null;
    const layananRaw = embeddedData?.layanan || null;
    const contentPagesRaw = embeddedData?.content_pages || null;

    const tariffsRaw = embeddedData?.tariffs || null;
    const peakHoursRaw = embeddedData?.peak_hours || null;

    const settings = settingsRaw
        ? {
            ...DEFAULT_SAFE_CONFIG.settings,
            ...settingsRaw,
            paths: { ...DEFAULT_SAFE_CONFIG.settings.paths, ...(settingsRaw.paths || {}) },
            micro_backend: { ...DEFAULT_SAFE_CONFIG.settings.micro_backend, ...(settingsRaw.micro_backend || {}) },
            cluster_config: {
                node1_core: "https://bagantara-core-default-rtdb.asia-southeast1.firebasedatabase.app",
                node1_firestore_project: "bagantara-core",
                node2_history: "https://futaqi-ali-default-rtdb.asia-southeast1.firebasedatabase.app",
                node2_overflow: "https://futaqi-ali-default-rtdb.asia-southeast1.firebasedatabase.app",
                node3_radar: "https://chatting-88040-default-rtdb.asia-southeast1.firebasedatabase.app",
                node3_chat: "https://chatting-88040-default-rtdb.asia-southeast1.firebasedatabase.app"
            }
        }
        : DEFAULT_SAFE_CONFIG.settings;

    if (settings.map_config) {
        settings.map_config.tile_layer_url = "https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=GHEMVdokax4heMQCeIxM";
        settings.map_config.fallback_tile_url = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
        delete settings.map_config.tiles_json_url;
        delete settings.map_config.tms_Reference;
    }
    if (settings.geocoder_api) {
        delete settings.geocoder_api.search_url_template;
        delete settings.geocoder_api.reverse_url_template;
        delete settings.geocoder_api.backup_search_url_template;
        delete settings.geocoder_api.backup_reverse_url_template;
        delete settings.geocoder_api.photon_search_url;
        delete settings.geocoder_api.photon_reverse_url;
        settings.geocoder_api.maptiler_key = "GHEMVdokax4heMQCeIxM";
        settings.geocoder_api.maptiler_search_url = "https://api.maptiler.com/geocoding/{query}.json?key=GHEMVdokax4heMQCeIxM&country=id&language=id&limit=6";
        settings.geocoder_api.maptiler_reverse_url = "https://api.maptiler.com/geocoding/{lng},{lat}.json?key=GHEMVdokax4heMQCeIxM&language=id&limit=5";
        delete settings.geocoder_api.gateway_url;
    }
    if (settings.vercel_api) {
        delete settings.vercel_api.bootstrap_config_url;
        delete settings.vercel_api;
    }

    const wording = wordingRaw
        ? { ...DEFAULT_SAFE_CONFIG.wording, ...wordingRaw }
        : DEFAULT_SAFE_CONFIG.wording;
    const rulesApp = rulesAppRaw
        ? {
            ...DEFAULT_SAFE_CONFIG.rules_app,
            ...rulesAppRaw,
            geocoder_rules: {
                ...DEFAULT_SAFE_CONFIG.rules_app.geocoder_rules,
                ...(rulesAppRaw.geocoder_rules || {})
            }
        }
        : DEFAULT_SAFE_CONFIG.rules_app;
    const tariffs = tariffsRaw || DEFAULT_SAFE_CONFIG.tariffs;
    const peakHours = peakHoursRaw || DEFAULT_SAFE_CONFIG.peak_hours;
    const zones = zonesRaw || DEFAULT_SAFE_CONFIG.zones;
    const layanan = layananRaw || DEFAULT_SAFE_CONFIG.layanan;

    if (zones && Array.isArray(zones.active_zones) && settings.map_config) {
        const openZone = zones.active_zones.find(
            z => z && z.is_open === true && z.center && !isNaN(parseFloat(z.center.lat)) && !isNaN(parseFloat(z.center.lng))
        );
        if (openZone) {
            settings.map_config.default_center = {
                lat: parseFloat(openZone.center.lat),
                lng: parseFloat(openZone.center.lng)
            };
        }
    }

    return {
        settings: settings,
        wording: wording,
        rules_app: rulesApp,
        tariffs: tariffs,
        peak_hours: peakHours,
        zones: zones,
        layanan: layanan,
        content_pages: contentPagesRaw
    };
}

window.BGN_CONFIG = buildActiveRuntimeConfig();

window.ConfigManager = {
    isLoaded: true,
    _initPromise: null,

    init: async function() {
        if (!this.isLoaded) {
            window.BGN_CONFIG = buildActiveRuntimeConfig();
            this.isLoaded = true;
        }
        window.dispatchEvent(new Event('bgn_config_loaded'));
        return window.BGN_CONFIG;
    },

    get: function(keyPath) {
        return keyPath.split('.').reduce((o, i) => (o ? o[i] : undefined), window.BGN_CONFIG);
    },

    getActiveZoneCenter: function() {
        const zones = window.BGN_CONFIG?.zones?.active_zones;
        if (Array.isArray(zones)) {
            if (window.BAGANTARA_ACTIVE_ZONE_ID) {
                const matched = zones.find(z => z && z.zone_id === window.BAGANTARA_ACTIVE_ZONE_ID && z.center);
                if (matched && !isNaN(parseFloat(matched.center.lat)) && !isNaN(parseFloat(matched.center.lng))) {
                    return {
                        lat: parseFloat(matched.center.lat),
                        lng: parseFloat(matched.center.lng),
                        zone_id: matched.zone_id
                    };
                }
            }
            const firstOpen = zones.find(z => z && z.is_open === true && z.center && !isNaN(parseFloat(z.center.lat)) && !isNaN(parseFloat(z.center.lng)));
            if (firstOpen) {
                return {
                    lat: parseFloat(firstOpen.center.lat),
                    lng: parseFloat(firstOpen.center.lng),
                    zone_id: firstOpen.zone_id
                };
            }
        }
        const defCenter = window.BGN_CONFIG?.settings?.map_config?.default_center;
        return defCenter ? { lat: parseFloat(defCenter.lat), lng: parseFloat(defCenter.lng), zone_id: "KDR-PARE-01" } : { lat: -7.768049, lng: 112.196514, zone_id: "KDR-PARE-01" };
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.ConfigManager.init();
});
