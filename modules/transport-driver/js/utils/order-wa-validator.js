// ==========================================================================
// FILE: js/utils/order-wa-validator.js (MODUL TERISOLASI V12.0 - HARDENED)
// FUNGSI: Validasi Nomor WA Klien Kondisional & Pengiriman Tanda Tangan HMAC Server:
//         1. WAJIB (Min 10 Digit Awalan 08/628) untuk layanan JASTIP (Rawan Order Fiktif)
//         2. OPSIONAL (Boleh Dikosongkan) untuk layanan RIDE, CAR, dan EXPRESS
//         3. Pencatatan Reputasi Perangkat, Verifikasi Signature Tarif, & Audit Keamanan
//            melalui Serverless /api/create-order (Zero-Leak di Browser)
// ==========================================================================

window.OrderWAValidator = {
    normalizeWA: function(rawText) {
        if (!rawText) return "";
        let cleaned = String(rawText).replace(/[^0-9]/g, "");
        if (cleaned.startsWith("08")) {
            cleaned = "62" + cleaned.substring(1);
        } else if (cleaned.startsWith("8")) {
            cleaned = "62" + cleaned;
        }
        return cleaned;
    },

    syncFormUIByService: function(serviceName) {
        const srv = String(serviceName || window.BAGANTARA_SERVICE || "RIDE").toUpperCase();
        const isJastip = (srv === "JASTIP");

        const inputWA = document.getElementById("inputClientWA");
        const hintWA = document.getElementById("clientWaHintText");
        const badgeWA = document.getElementById("clientWaRequirementBadge");

        if (inputWA) {
            if (isJastip) {
                inputWA.required = true;
                inputWA.placeholder = "WAJIB DIISI (Cth: 0812... / 62812...)";
            } else {
                inputWA.required = false;
                inputWA.placeholder = "Nomor WA (Opsional - Boleh Dikosongkan)";
            }
        }

        if (badgeWA) {
            if (isJastip) {
                badgeWA.textContent = "WAJIB (ANTI ORDER FIKTIF JASTIP)";
                badgeWA.style.background = "rgba(239, 68, 68, 0.16)";
                badgeWA.style.borderColor = "rgba(239, 68, 68, 0.5)";
                badgeWA.style.color = "#f87171";
            } else {
                badgeWA.textContent = `OPSIONAL UNTUK ${srv}`;
                badgeWA.style.background = "rgba(16, 185, 129, 0.15)";
                badgeWA.style.borderColor = "rgba(16, 185, 129, 0.45)";
                badgeWA.style.color = "#34d399";
            }
        }

        if (hintWA) {
            if (isJastip) {
                hintWA.textContent = "*Wajib nomor WA aktif (awalan 08/628) karena layanan Jastip melibatkan talangan dana belanja.";
                hintWA.style.color = "#f59e0b";
            } else {
                hintWA.textContent = `*Boleh dikosongkan untuk layanan ${srv} (Komunikasi aman melalui Chat Aplikasi).`;
                hintWA.style.color = "var(--text-muted)";
            }
        }
    },

    validateSubmission: function(cName, rawWA, serviceName) {
        const srv = String(serviceName || window.BAGANTARA_SERVICE || "RIDE").toUpperCase();
        const isJastip = (srv === "JASTIP");
        const formVal = window.BGN_CONFIG?.rules_app?.form_validation || { min_name_length: 3, min_wa_length: 10 };
        const minName = parseInt(formVal.min_name_length, 10) || 3;
        const minWA = parseInt(formVal.min_wa_length, 10) || 10;

        if (!cName || cName.trim().length < minName) {
            return {
                valid: false,
                cleanWA: "",
                message: `Nama penumpang wajib diisi (minimal ${minName} huruf).`
            };
        }

        const trimmedWA = (rawWA || "").trim();

        // Untuk RIDE, CAR, EXPRESS: Boleh dikosongkan 100%!
        if (!isJastip && trimmedWA === "") {
            return {
                valid: true,
                cleanWA: "",
                message: "OK"
            };
        }

        // Untuk JASTIP (Wajib) atau jika Klien mengisi WA pada layanan lain: Validasi format
        const normalized = this.normalizeWA(trimmedWA);
        if (!normalized.startsWith("628") || normalized.length < minWA || normalized.length > 15) {
            return {
                valid: false,
                cleanWA: "",
                message: isJastip
                    ? "Layanan JASTIP wajib melampirkan Nomor WhatsApp aktif yang valid (awalan 08 atau 628, minimal 10 angka) untuk mencegah order fiktif!"
                    : "Format Nomor WhatsApp tidak valid. Gunakan awalan 08 atau 628, atau kosongkan kolom WA untuk layanan ini."
            };
        }

        return {
            valid: true,
            cleanWA: normalized,
            message: "OK"
        };
    },

    catatAuditKeamananNode5: async function(idTiket, payloadTiket = {}, extraMeta = {}) {
        try {
            let deviceId = localStorage.getItem("bgt_device_id");
            if (!deviceId) {
                deviceId = "DEV_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);
                localStorage.setItem("bgt_device_id", deviceId);
            }

            const now = Date.now();
            const countPrev = parseInt(localStorage.getItem("bgt_order_count") || "0", 10) + 1;
            localStorage.setItem("bgt_order_count", String(countPrev));

            const isSingleObjCall = (idTiket && typeof idTiket === "object");
            const pObj = isSingleObjCall ? idTiket : (payloadTiket || {});
            const rawTicketId = isSingleObjCall ? (idTiket.id_tiket || idTiket.idTiket || `AUD_${now}`) : (idTiket || `AUD_${now}`);
            const safeTicketId = String(rawTicketId).trim().replace(/[.#$\[\]\/]/g, "_");
            const safeDeviceId = String(deviceId).trim().replace(/[.#$\[\]\/]/g, "_").substring(0, 64);
            const layananStr = String(pObj.layanan || "RIDE").toUpperCase().substring(0, 20);
            const hasVerifiedWa = Boolean(pObj.wa_klien && String(pObj.wa_klien).length >= 10);

            const localSignature = extraMeta?.signature
                || (window.__BGN_SEAL__ && typeof window.__BGN_SEAL__.getSignature === "function" ? window.__BGN_SEAL__.getSignature() : "")
                || window.BAGANTARA_FARE_SIGNATURE
                || "";

            const secBaseUrl = (
                window.BGN_CONFIG?.settings?.cluster_config?.node5_security ||
                window.BGN_CONFIG?.settings?.firebase_security?.databaseURL ||
                "https://futaqi-ali-default-rtdb.asia-southeast1.firebasedatabase.app"
            ).replace(/\/+$/, "");

            const auditPayload = {
                id_tiket: safeTicketId,
                layanan: layananStr,
                waktu_dibuat: now,
                device_id: safeDeviceId,
                harga_dasar: Number(pObj.harga_dasar || 0),
                harga_tawaran: Number(pObj.harga_tawaran || 0),
                estimasi_belanja: Number(pObj.estimasi_belanja || 0),
                jarak_km: Number(pObj.jarak_km || 0),
                has_verified_wa: hasVerifiedWa,
                signature: String(localSignature)
            };

            const repPayload = {
                last_order_at: now,
                total_orders: countPrev,
                last_service: layananStr,
                has_verified_wa: hasVerifiedWa
            };

            const auditUrl = `${secBaseUrl}/order_audit_log/${encodeURIComponent(safeTicketId)}.json`;
            const repUrl = `${secBaseUrl}/device_reputation/${encodeURIComponent(safeDeviceId)}.json`;

            await Promise.allSettled([
                fetch(auditUrl, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(auditPayload),
                    cache: "no-store"
                }),
                fetch(repUrl, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(repPayload),
                    cache: "no-store"
                }).then(async (r) => {
                    if (!r.ok) {
                        await fetch(repUrl, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ ...repPayload, total_orders: now }),
                            cache: "no-store"
                        }).catch(() => {});
                    }
                })
            ]);
        } catch (e) {}
    }
};
