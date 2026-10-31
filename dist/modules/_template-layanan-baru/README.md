# Cetakan Layanan Baru (`modules/_template-layanan-baru/`)

Direktori ini adalah **Starter Kit Resmi** untuk menambahkan modul layanan ke-3 atau seterusnya ke dalam ekosistem `bagantara-superapp-publik`.

## Standar Integrasi Wajib Sub-Modul Bagantara
1. **Jangan Mendaftarkan Service Worker Mandiri**: Biarkan `/services-worker.js` di root Wadah Induk mengelola cache statis.
2. **Gunakan `bgn_superapp_shared_gps`**: Baca koordinat GPS dari `sessionStorage.getItem('bgn_superapp_shared_gps')` agar pengguna tidak pernah diminta izin lokasi dua kali.
3. **Dengarkan Sinyal `BagantaraHostBridge`**:
   - `BGN_BRIDGE_GPS_SYNC`: Terima koordinat GPS terbaru dari Wadah Induk.
   - `BGN_BRIDGE_THEME_SYNC`: Sinkronkan mode tampilan Siang/Malam (`auto` / `dark` / `light`).
   - `BGN_BRIDGE_HIBERNATE`: Hentikan pemutar video/audio saat pengguna berpindah ke tab layanan lain.
4. **Isolasi Database**: Pastikan endpoint Firebase modul baru terpisah secara tegas dan terdaftar pada bypass `/services-worker.js`.
