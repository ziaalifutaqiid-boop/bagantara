// ==========================================================================
// FILE: scripts/build-secure.mjs (BAGANTARA PUBLIC V13.2 - MAPTILER & CHAT UX EDITION)
// FUNGSI: 1. Enkripsi RC4 + XOR Byte Array untuk Konfigurasi Non-Rahasia & Halaman Statis
//         2. Single-IIFE Closure Bundling (15 Modul JS + 3 Modul Chat Murni via /api/bgn-gateway)
//         3. Shadowing `window` via Proxy ke `_bgnPrivateVault` (Anti-Console Inspection: window.* -> undefined)
//         4. High-Grade AST Obfuscation (RC4 String Array + Rotation/Shuffle + Control Flow Flattening)
//         5. Pembersihan Mutlak Output `dist/` (Tanpa Banner Rekrutmen & Tanpa OSM/Photon)
// ==========================================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const require = createRequire(import.meta.url);

export const OBFUSCATOR_OPTIONS = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    stringArray: true,
    stringArrayEncoding: ['rc4'],
    stringArrayRotate: true,
    stringArrayShuffle: true,
    selfDefending: true,
    disableConsoleOutput: false,
    sourceMap: false
};

const BUILTIN_CONTENT_FALLBACKS = {
    'content/manifest.json': "{\"version\":\"1.5\",\"banners\":[],\"about_pages\":[{\"id\":\"tentang-kami\",\"title\":\"Tentang Bagantara\",\"icon\":\"fa-solid fa-rocket\",\"file\":\"./content/pages/tentang.html\"},{\"id\":\"syarat-ketentuan\",\"title\":\"Syarat & Ketentuan Layanan\",\"icon\":\"fa-solid fa-scale-balanced\",\"file\":\"./content/pages/syarat-ketentuan.html\"},{\"id\":\"kebijakan-privasi\",\"title\":\"Kebijakan Privasi\",\"icon\":\"fa-solid fa-shield-halved\",\"file\":\"./content/pages/privasi.html\"},{\"id\":\"donasi-sociabuzz\",\"title\":\"Dukungan & Donasi Layanan\",\"icon\":\"fa-solid fa-hand-holding-heart\",\"file\":\"./content/pages/donasi.html\",\"url\":\"https://sociabuzz.com/bagantara\",\"badge\":\"SOCIABUZZ\"}]}",
    'content/pages/tentang.html': "<div style=\"display: flex; flex-direction: column; gap: 14px; padding-top: 6px; color: var(--text-muted); font-size: 0.83rem; line-height: 1.65;\">\n    <div style=\"background: linear-gradient(145deg, var(--card-bg-2), var(--void-black)); border: 1px solid var(--border-gold-subtle); border-left: 3.5px solid var(--neon-gold); border-radius: 12px; padding: 13px 14px;\">\n        <div class=\"font-tech\" style=\"font-size: 0.68rem; font-weight: 900; color: var(--neon-gold); letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 4px;\">\n            <i class=\"fa-solid fa-network-wired\"></i> BAGANTARA — BAGAN PERANTARA\n        </div>\n        <p style=\"margin: 0; color: var(--text-main); font-size: 0.82rem; line-height: 1.6;\">\n            <b>BAGANTARA</b> merupakan akronim dari <b>Bagan Perantara</b> — layanan penghubung transportasi dan pengantaran lokal yang mempertemukan masyarakat secara langsung dengan para pengemudi di lapangan.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-bolt\" style=\"color: var(--neon-green);\"></i>\n            <span>Layanan Praktis, Cepat &amp; Transparan</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            Pelanggan dapat langsung memilih pengemudi terdekat dan memesan layanan antar-jemput penumpang motor (<b>Ride</b>), mobil (<b>Car</b>), pengiriman barang atau dokumen (<b>Express</b>), serta jasa titip belanja (<b>Jastip</b>) secara praktis <b>tanpa perlu mendaftar akun</b>. Estimasi jarak dan rincian biaya ditampilkan secara terbuka sebelum pesanan dibuat.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-user-shield\" style=\"color: var(--neon-gold);\"></i>\n            <span>Pengemudi Terverifikasi &amp; Terdaftar Resmi</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            Keamanan dan kenyamanan pelanggan adalah prioritas utama kami. Setiap pengemudi yang tampil di katalog aktif telah melewati proses pemeriksaan identitas, pencatatan data kendaraan, serta persetujuan standar etika pelayanan oleh pengelola Bagantara.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-seedling\" style=\"color: var(--neon-green);\"></i>\n            <span>Misi Sosial &amp; Kemandirian Ekonomi Lokal</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            Bagantara hadir untuk membuka peluang penghasilan yang bermartabat bagi warga sekitar, mempermudah mobilitas harian masyarakat, serta menjaga agar seluruh hasil jerih payah pengantaran diterima secara utuh oleh pengemudi lokal tanpa potongan komisi.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-comments\" style=\"color: var(--amber-accent);\"></i>\n            <span>Terbuka terhadap Masukan Masyarakat</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            Kami terus menyempurnakan kualitas layanan sesuai kebutuhan nyata di lapangan. Saran, masukan, dan evaluasi dari pelanggan maupun pengemudi sangat berarti bagi peningkatan mutu layanan Bagantara ke depannya.\n        </p>\n    </div>\n    <div style=\"background: var(--emerald-bg-soft); border: 1px dashed rgba(16, 185, 129, 0.45); border-left: 3.5px solid var(--neon-green); border-radius: 12px; padding: 13px 14px; display: flex; flex-direction: column; gap: 10px;\">\n        <div class=\"font-tech\" style=\"font-size: 0.72rem; font-weight: 900; color: var(--emerald-accent); letter-spacing: 0.5px;\">\n            <i class=\"fa-solid fa-heart-pulse\"></i> DUKUNGAN KEBERLANJUTAN LAYANAN\n        </div>\n        <p style=\"margin: 0; color: var(--text-main); font-size: 0.8rem; line-height: 1.58;\">\n            Karena Bagantara tidak memungut biaya potongan komisi dari pengemudi maupun pelanggan, kami membuka ruang dukungan sukarela untuk merawat operasional sistem, menjaga kelancaran peta dan ruang obrolan, serta memperluas jangkauan wilayah layanan.\n        </p>\n        <div style=\"display: flex; flex-wrap: wrap; gap: 8px; margin-top: 2px;\">\n            <a href=\"https://sociabuzz.com/bagantara\" target=\"_blank\" rel=\"noopener noreferrer\" style=\"flex: 1 1 180px; background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; text-decoration: none; padding: 10px 14px; border-radius: 10px; font-family: 'Space Grotesk', monospace; font-size: 0.74rem; font-weight: 800; letter-spacing: 0.5px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);\">\n                <i class=\"fa-solid fa-hand-holding-heart\"></i> DUKUNG VIA SOCIABUZZ\n            </a>\n            <a href=\"https://wa.me/6282225225141?text=Halo%20Tim%20Bagantara,%20saya%20ingin%20memberikan%20saran%20dan%20masukan%20layanan:\" target=\"_blank\" rel=\"noopener noreferrer\" style=\"flex: 1 1 160px; background: var(--void-black); border: 1px solid var(--border-gold-subtle); color: var(--neon-gold); text-decoration: none; padding: 10px 14px; border-radius: 10px; font-family: 'Space Grotesk', monospace; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.5px; display: inline-flex; align-items: center; justify-content: center; gap: 7px;\">\n                <i class=\"fa-brands fa-whatsapp\"></i> KIRIM SARAN LAYANAN\n            </a>\n        </div>\n    </div>\n</div>\n",
    'content/pages/syarat-ketentuan.html': "<div style=\"display: flex; flex-direction: column; gap: 14px; padding-top: 6px; color: var(--text-muted); font-size: 0.83rem; line-height: 1.65;\">\n    <div style=\"background: linear-gradient(145deg, var(--card-bg-2), var(--void-black)); border: 1px solid var(--border-gold-subtle); border-left: 3.5px solid var(--neon-gold); border-radius: 12px; padding: 13px 14px;\">\n        <div class=\"font-tech\" style=\"font-size: 0.68rem; font-weight: 900; color: var(--neon-gold); letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 4px;\">\n            <i class=\"fa-solid fa-scale-balanced\"></i> KETENTUAN RESMI PENGGUNAAN LAYANAN BAGANTARA\n        </div>\n        <p style=\"margin: 0; color: var(--text-main); font-size: 0.82rem; line-height: 1.6;\">\n            Dokumen ini mengatur hak, kewajiban, mekanisme pemesanan, ketentuan pembayaran, serta tanggung jawab bersama bagi pelanggan dan pengemudi dalam menggunakan layanan <b>BAGANTARA</b>.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-handshake-simple\" style=\"color: var(--neon-green);\"></i>\n            <span>1. Kedudukan Layanan &amp; Kebijakan Tanpa Potongan Komisi</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            <b>BAGANTARA (Bagan Perantara)</b> berfungsi sebagai sarana penghubung yang mempertemukan pelanggan secara langsung dengan pengemudi di lapangan. Bagantara <b>tidak memungut biaya potongan komisi</b> atas tarif perjalanan penumpang (<b>Ride</b> &amp; <b>Car</b>), pengiriman barang (<b>Express</b>), maupun jasa titip belanja (<b>Jastip</b>). Seluruh ongkos layanan dibayarkan langsung oleh pelanggan kepada pengemudi sesuai rincian tarif yang tertera.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-calculator\" style=\"color: var(--neon-gold);\"></i>\n            <span>2. Transparansi Tarif &amp; Metode Pembayaran</span>\n        </h4>\n        <ul style=\"margin: 4px 0 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 5px;\">\n            <li><b>Perhitungan Rute Terbuka:</b> Estimasi jarak tempuh dan biaya pengantaran dihitung secara otomatis berdasarkan titik jemput dan titik tujuan yang dipilih pelanggan sebelum pesanan dikirimkan.</li>\n            <li><b>Pembayaran Langsung ke Pengemudi:</b> Pembayaran ongkos perjalanan atau pengantaran dilakukan secara tunai maupun non-tunai (melalui QRIS resmi milik pengemudi) setelah layanan diselesaikan atau sesuai kesepakatan bersama.</li>\n            <li><b>Ketentuan Belanja Layanan Jastip:</b> Untuk layanan titip belanja (<b>Jastip</b>), pelanggan wajib mengganti biaya pembelian barang sesuai struk atau nota harga asli dari lokasi perbelanjaan ditambah ongkos jasa pengantaran yang tertera di aplikasi.</li>\n        </ul>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-box-open\" style=\"color: var(--neon-green);\"></i>\n            <span>3. Ketentuan Pengiriman Barang (Express) &amp; Keselamatan</span>\n        </h4>\n        <ul style=\"margin: 4px 0 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 5px;\">\n            <li><b>Batas Muatan Wajar:</b> Barang yang dikirim melalui layanan <b>Express</b> maupun <b>Jastip</b> wajib dikemas dengan aman dan tidak melebihi batas kapasitas muatan wajar kendaraan pengemudi.</li>\n            <li><b>Barang Terlarang:</b> Pelanggan dilarang keras mengirimkan barang berbahaya, mudah meledak, narkotika, obat-obatan terlarang, senjata tajam, maupun barang yang melanggar hukum di Republik Indonesia. Pengemudi berhak menolak pesanan apabila muatan dinilai membahayakan keselamatan.</li>\n        </ul>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-ban\" style=\"color: var(--amber-accent);\"></i>\n            <span>4. Kebijakan Pembatalan Pesanan</span>\n        </h4>\n        <ul style=\"margin: 4px 0 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 5px;\">\n            <li><b>Sebelum Pengemudi Berangkat:</b> Pelanggan dapat membatalkan atau mengganti pengemudi apabila pengemudi yang dipilih belum merespons atau berhalangan mengambil pesanan.</li>\n            <li><b>Setelah Pesanan Diterima:</b> Apabila pembatalan terpaksa dilakukan setelah pengemudi menuju lokasi jemput atau setelah barang Jastip dibelanjakan, pelanggan wajib mengupayakan penyelesaian yang adil bersama pengemudi melalui ruang obrolan atau WhatsApp.</li>\n        </ul>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-user-check\" style=\"color: var(--neon-gold);\"></i>\n            <span>5. Etika Pengguna &amp; Larangan Pesanan Fiktif</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            Pelanggan wajib mencantumkan nama panggilan/lengkap, titik lokasi yang akurat, serta nomor WhatsApp aktif yang benar pada layanan yang mempersyaratkannya. Segala bentuk pembuatan pesanan fiktif, pelecehan, maupun tindakan yang merugikan pengemudi akan ditindak melalui pemblokiran akses perangkat serta pelaporan kepada pihak berwenang sesuai ketentuan hukum yang berlaku.\n        </p>\n    </div>\n</div>\n",
    'content/pages/privasi.html': "<div style=\"display: flex; flex-direction: column; gap: 14px; padding-top: 6px; color: var(--text-muted); font-size: 0.83rem; line-height: 1.65;\">\n    <div style=\"background: linear-gradient(145deg, var(--card-bg-2), var(--void-black)); border: 1px solid var(--border-gold-subtle); border-left: 3.5px solid var(--neon-gold); border-radius: 12px; padding: 13px 14px;\">\n        <div class=\"font-tech\" style=\"font-size: 0.68rem; font-weight: 900; color: var(--neon-gold); letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 4px;\">\n            <i class=\"fa-solid fa-user-lock\"></i> KOMITMEN PERLINDUNGAN PRIVASI PELANGGAN\n        </div>\n        <p style=\"margin: 0; color: var(--text-main); font-size: 0.82rem; line-height: 1.6;\">\n            Sebagai <b>Bagan Perantara (BAGANTARA)</b>, kami menghormati privasi Anda secara menyeluruh. <b>Pelanggan tidak perlu mendaftar akun, masuk dengan kata sandi, atau menyerahkan data pribadi sensitif</b> untuk memesan layanan.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-id-badge\" style=\"color: var(--neon-green);\"></i>\n            <span>1. Pemesanan Langsung Tanpa Pendaftaran Akun</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            Kami hanya meminta informasi seperlunya agar pesanan Anda dapat dilayani dengan baik. Saat memesan, Anda cukup mencantumkan <b>Nama Panggilan atau Nama Lengkap</b> agar pengemudi dapat mengenali pelanggan yang dijemput atau menerima barang, tanpa kewajiban membuat profil permanen.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-brands fa-whatsapp\" style=\"color: var(--neon-green);\"></i>\n            <span>2. Kerahasiaan Kontak &amp; Nomor WhatsApp</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            Untuk layanan <b>Ride, Car, dan Express</b> bersama pengemudi yang sedang aktif di aplikasi, pencantuman nomor WhatsApp bersifat <b>Opsional (boleh dikosongkan)</b> karena komunikasi dapat dilakukan langsung melalui ruang obrolan di dalam aplikasi. Nomor WhatsApp aktif hanya bersifat <b>Wajib pada layanan Jastip</b> atau saat menghubungi pengemudi <b>Siaga WA</b> guna memastikan kejelasan detail belanja dan titik pengantaran.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-location-crosshairs\" style=\"color: var(--neon-gold);\"></i>\n            <span>3. Penggunaan Lokasi Hanya Saat Aplikasi Dibuka</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            Titik lokasi perangkat Anda hanya digunakan ketika Anda sedang membuka aplikasi untuk menampilkan daftar pengemudi terdekat di wilayah Anda, menentukan titik jemput serta tujuan di peta, dan menghitung jarak rute perjalanan. Bagantara <b>tidak pernah memantau atau melacak lokasi Anda di latar belakang</b> ketika aplikasi ditutup.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-mobile-screen-button\" style=\"color: var(--amber-accent);\"></i>\n            <span>4. Riwayat Alamat Tersimpan di Perangkat Anda Sendiri</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            Daftar alamat favorit dan riwayat titik pencarian disimpan langsung di memori peramban ponsel Anda sendiri untuk mempercepat pemesanan berikutnya. Anda memegang kendali penuh untuk menghapus satu per satu maupun seluruh riwayat alamat kapan saja melalui tombol <b>Hapus Semua</b> pada layar pencarian lokasi.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-shield-halved\" style=\"color: var(--neon-green);\"></i>\n            <span>5. Penghapusan Obrolan Otomatis &amp; Keamanan Data</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            Seluruh pesan teks, titik lokasi, pesan suara, dan foto di ruang obrolan hanya digunakan selama proses penjemputan atau pengantaran berlangsung, serta <b>dihapus secara otomatis</b> segera setelah perjalanan selesai atau dibatalkan. Bagantara tidak pernah memperjualbelikan atau membagikan data pengguna kepada pihak ketiga mana pun.\n        </p>\n    </div>\n</div>\n",
    'content/pages/donasi.html': "<div style=\"display: flex; flex-direction: column; gap: 13px; padding-top: 6px; color: var(--text-muted); font-size: 0.83rem; line-height: 1.65;\">\n    <div style=\"background: linear-gradient(145deg, rgba(212, 175, 55, 0.14), rgba(16, 185, 129, 0.08)); border: 1px solid var(--border-gold-subtle); border-left: 3.5px solid var(--neon-gold); border-radius: 12px; padding: 13px 14px;\">\n        <div class=\"font-tech\" style=\"font-size: 0.68rem; font-weight: 900; color: var(--neon-gold); letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 4px;\">\n            <i class=\"fa-solid fa-hand-holding-heart\"></i> GOTONG ROYONG KEBERLANJUTAN LAYANAN\n        </div>\n        <p style=\"margin: 0; color: var(--text-main); font-size: 0.82rem; line-height: 1.6;\">\n            <b>BAGANTARA (Bagan Perantara)</b> hadir sebagai layanan penghubung transportasi dan pengantaran warga yang menjaga agar 100% penghasilan diterima utuh oleh pengemudi lokal tanpa potongan komisi.\n        </p>\n    </div>\n    <p style=\"margin: 0;\">\n        Agar layanan ini dapat terus berjalan secara mandiri, merawat sistem pemetaan dan ruang obrolan, serta memperluas jangkauan wilayah guna membuka peluang penghasilan bagi warga sekitar, kami membuka ruang <b>dukungan sukarela</b> yang dikelola secara <b>terbuka dan bertanggung jawab</b>.\n    </p>\n    <div style=\"background: var(--void-black); border: 1px solid var(--border-cyber); border-radius: 11px; padding: 11px 13px; display: flex; flex-direction: column; gap: 6px; font-size: 0.78rem;\">\n        <div class=\"font-tech text-main\" style=\"font-size: 0.7rem; font-weight: 800; color: var(--neon-green);\">\n            <i class=\"fa-solid fa-circle-check\"></i> PEMANFAATAN DUKUNGAN SUKARELA:\n        </div>\n        <div style=\"display: flex; flex-direction: column; gap: 4px; color: var(--text-muted);\">\n            <span>• Pemeliharaan operasional sistem, layanan peta rute, dan ruang obrolan pelanggan-pengemudi.</span>\n            <span>• Perluasan wilayah layanan baru dan pembukaan kesempatan kerja bagi pengemudi lokal.</span>\n            <span>• Penyempurnaan fitur aplikasi berdasarkan masukan masyarakat dan pengemudi.</span>\n        </div>\n    </div>\n    <a href=\"https://sociabuzz.com/bagantara\" target=\"_blank\" rel=\"noopener noreferrer\" style=\"width: 100%; background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; text-decoration: none; padding: 12px 16px; border-radius: 12px; font-family: 'Space Grotesk', monospace; font-size: 0.8rem; font-weight: 900; letter-spacing: 0.7px; display: flex; align-items: center; justify-content: center; gap: 9px; box-shadow: 0 6px 18px rgba(16, 185, 129, 0.35); text-transform: uppercase;\">\n        <i class=\"fa-solid fa-heart\"></i> DONASI &amp; DUKUNG DI SOCIABUZZ\n        <i class=\"fa-solid fa-up-right-from-square\" style=\"font-size: 0.72rem;\"></i>\n    </a>\n</div>\n"
};

function readJsonFile(relPath) {
    const cleanRel = String(relPath || '').replace(/^\.\//, '');
    const fullPath = path.join(ROOT_DIR, cleanRel);
    if (fs.existsSync(fullPath)) {
        return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    }
    if (BUILTIN_CONTENT_FALLBACKS[cleanRel]) {
        return JSON.parse(BUILTIN_CONTENT_FALLBACKS[cleanRel]);
    }
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
}

function readTextFile(relPath) {
    const cleanRel = String(relPath || '').replace(/^\.\//, '');
    const fullPath = path.join(ROOT_DIR, cleanRel);
    if (fs.existsSync(fullPath)) {
        return fs.readFileSync(fullPath, 'utf8');
    }
    if (BUILTIN_CONTENT_FALLBACKS[cleanRel]) {
        try {
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, BUILTIN_CONTENT_FALLBACKS[cleanRel], 'utf8');
        } catch (e) {}
        return BUILTIN_CONTENT_FALLBACKS[cleanRel];
    }
    return fs.readFileSync(fullPath, 'utf8');
}

function encryptRC4XorVault(plainObj, keyStr) {
    const jsonStr = JSON.stringify(plainObj);
    const inputBytes = Buffer.from(jsonStr, 'utf8');
    const len = inputBytes.length;
    const xorSeed = crypto.randomInt(17, 241);

    const S = new Uint8Array(256);
    for (let i = 0; i < 256; i++) S[i] = i;
    let j = 0;
    for (let i = 0; i < 256; i++) {
        j = (j + S[i] + keyStr.charCodeAt(i % keyStr.length)) & 0xff;
        const tmp = S[i];
        S[i] = S[j];
        S[j] = tmp;
    }

    const outBytes = new Uint8Array(len);
    let x = 0;
    let y = 0;
    for (let k = 0; k < len; k++) {
        x = (x + 1) & 0xff;
        y = (y + S[x]) & 0xff;
        const tmp = S[x];
        S[x] = S[y];
        S[y] = tmp;
        const rc4Byte = S[(S[x] + S[y]) & 0xff];
        const xorSalt = (keyStr.charCodeAt(k % keyStr.length) ^ ((xorSeed + ((k * 31) & 0xff)) & 0xff)) & 0xff;
        outBytes[k] = inputBytes[k] ^ rc4Byte ^ xorSalt;
    }

    return {
        key: keyStr,
        seed: xorSeed,
        bytes: Array.from(outBytes)
    };
}

function rc4TransformStr(str, key) {
    const s = [];
    for (let i = 0; i < 256; i++) s[i] = i;
    let j = 0;
    for (let i = 0; i < 256; i++) {
        j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
        const x = s[i];
        s[i] = s[j];
        s[j] = x;
    }
    let i = 0;
    j = 0;
    const utf8Bytes = Buffer.from(str, 'utf8');
    const out = Buffer.alloc(utf8Bytes.length);
    for (let y = 0; y < utf8Bytes.length; y++) {
        i = (i + 1) % 256;
        j = (j + s[i]) % 256;
        const x = s[i];
        s[i] = s[j];
        s[j] = x;
        out[y] = utf8Bytes[y] ^ s[(s[i] + s[j]) % 256];
    }
    return out.toString('base64');
}

function buildEncryptedConfigDecoratorSource() {
    const rawSettings = readJsonFile('data/settings.json');
    const wording = readJsonFile('data/wording.json');
    const rulesApp = readJsonFile('data/rules-app.json');
    const tariffs = readJsonFile('data/tariffs.json');
    const peakHours = readJsonFile('data/peak-hours.json');
    const zones = readJsonFile('data/zones.json');
    const layanan = readJsonFile('data/layanan.json');

    const sanitizedSettings = JSON.parse(JSON.stringify(rawSettings));

    if (sanitizedSettings.map_config) {
        delete sanitizedSettings.map_config.tms_Reference;
        delete sanitizedSettings.map_config.tiles_json_url;
        sanitizedSettings.map_config.tile_layer_url = 'https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=GHEMVdokax4heMQCeIxM';
        sanitizedSettings.map_config.fallback_tile_url = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    }
    if (sanitizedSettings.geocoder_api) {
        delete sanitizedSettings.geocoder_api.search_url_template;
        delete sanitizedSettings.geocoder_api.reverse_url_template;
        delete sanitizedSettings.geocoder_api.backup_search_url_template;
        delete sanitizedSettings.geocoder_api.backup_reverse_url_template;
        delete sanitizedSettings.geocoder_api.photon_search_url;
        delete sanitizedSettings.geocoder_api.photon_reverse_url;
        sanitizedSettings.geocoder_api.maptiler_key = 'GHEMVdokax4heMQCeIxM';
        sanitizedSettings.geocoder_api.maptiler_search_url = 'https://api.maptiler.com/geocoding/{query}.json?key=GHEMVdokax4heMQCeIxM&country=id&language=id&limit=6';
        sanitizedSettings.geocoder_api.maptiler_reverse_url = 'https://api.maptiler.com/geocoding/{lng},{lat}.json?key=GHEMVdokax4heMQCeIxM&language=id&limit=5';
        delete sanitizedSettings.geocoder_api.gateway_url;
    }
    if (sanitizedSettings.vercel_api) {
        delete sanitizedSettings.vercel_api.bootstrap_config_url;
        delete sanitizedSettings.vercel_api;
    }
    delete sanitizedSettings.firebase_security;
    sanitizedSettings.cluster_config = {
        node1_core: 'https://bagantara-core-default-rtdb.asia-southeast1.firebasedatabase.app',
        node1_firestore_project: 'bagantara-core',
        node2_history: 'https://futaqi-ali-default-rtdb.asia-southeast1.firebasedatabase.app',
        node2_overflow: 'https://futaqi-ali-default-rtdb.asia-southeast1.firebasedatabase.app',
        node3_radar: 'https://chatting-88040-default-rtdb.asia-southeast1.firebasedatabase.app',
        node3_chat: 'https://chatting-88040-default-rtdb.asia-southeast1.firebasedatabase.app'
    };

    const contentManifest = readJsonFile('content/manifest.json');
    contentManifest.banners = [];
    const tentangHtml = minifyHtmlFragment(readTextFile('content/pages/tentang.html'));
    const syaratHtml = minifyHtmlFragment(readTextFile('content/pages/syarat-ketentuan.html'));
    const privasiHtml = minifyHtmlFragment(readTextFile('content/pages/privasi.html'));
    const donasiHtml = minifyHtmlFragment(readTextFile('content/pages/donasi.html'));

    const plainVaultPayload = {
        settings: sanitizedSettings,
        wording: wording,
        rules_app: rulesApp,
        tariffs: tariffs,
        peak_hours: peakHours,
        zones: zones,
        layanan: layanan,
        content_pages: {
            manifest: contentManifest,
            pages: {
                './content/pages/tentang.html': tentangHtml,
                './content/pages/syarat-ketentuan.html': syaratHtml,
                './content/pages/privasi.html': privasiHtml,
                './content/pages/donasi.html': donasiHtml,
                'tentang-kami': tentangHtml,
                'syarat-ketentuan': syaratHtml,
                'kebijakan-privasi': privasiHtml,
                'donasi-sociabuzz': donasiHtml
            }
        }
    };

    const vaultKey = 'BGN12_' + crypto.randomBytes(18).toString('hex');
    const encryptedVault = encryptRC4XorVault(plainVaultPayload, vaultKey);

    return `
window.__BGN_CONFIG_VAULT__ = {
    key: ${JSON.stringify(encryptedVault.key)},
    seed: ${encryptedVault.seed},
    bytes: ${JSON.stringify(encryptedVault.bytes)}
};
`;
}

function transformChatModulesForSingleBundle() {
    let configChatCode = readTextFile('chat/config-chat.js');
    let cloudMediaCode = readTextFile('chat/cloud-media.js');
    let chatHandshakeCode = readTextFile('chat/chat-handshake.js');

    configChatCode = configChatCode
        .replace(/\bexport\s+let\s+dbChat\b/g, 'let dbChat')
        .replace(/\bexport\s+const\s+getRadarDatabaseUrl\b/g, 'const getRadarDatabaseUrl')
        .replace(/\bexport\s+const\s+initFirebaseChat\b/g, 'const initFirebaseChat');

    cloudMediaCode = cloudMediaCode
        .replace(/\bexport\s+async\s+function\s+uploadMediaKeServer\b/g, 'async function uploadMediaKeServer');

    chatHandshakeCode = chatHandshakeCode
        .replace(/^\s*import\s+\{[^}]+\}\s+from\s+['"]\.\/config-chat\.js['"];?\s*$/gm, '')
        .replace(/^\s*import\s+\{[^}]+\}\s+from\s+['"]\.\/cloud-media\.js['"];?\s*$/gm, '')
        .replace(/\bexport\s+function\s+escapeHTML\b/g, 'function escapeHTML');

    return `${configChatCode}\n${cloudMediaCode}\n${chatHandshakeCode}`;
}

function assembleSingleIifeClosureBundle() {
    const encryptedDecorator = buildEncryptedConfigDecoratorSource();

    const orderedFiles = [
        'js/core/security-shield.js',
        'js/core/cluster-registry.js',
        'js/core/config-manager.js',
        'js/core/app.js',
        'js/core/firebase-engine.js',
        'js/core/map-engine.js',
        'js/services/service-router.js',
        'js/services/flow-engine.js',
        'js/services/flow-jastip.js',
        'js/ui/ui-manager.js',
        'js/ui/ui-jastip.js',
        'js/ui/content-loader.js',
        'js/utils/geocoder-api.js',
        'js/utils/order-wa-validator.js',
        'js/utils/chat-trigger.js'
    ];

    const modulesCode = orderedFiles.map((relPath) => {
        const content = readTextFile(relPath);
        return `\n// --- MODULE: ${relPath} ---\n${content}\n`;
    }).join('\n');

    const chatBundleCode = transformChatModulesForSingleBundle();

    return `(function() {
    'use strict';

    const _realWindow = typeof globalThis !== 'undefined' ? globalThis : window;
    const _realDocument = _realWindow.document;
    const _bgnPrivateVault = Object.create(null);

    const _PRIVATE_VAULT_KEYS = new Set([
        'BGN_CONFIG',
        '__BGN_CONFIG_VAULT__',
        '__BGN_CONTENT_VAULT__',
        '__BGN_SEAL__',
        'BGNSecurityShield',
        'BagantaraCluster',
        'ConfigManager',
        'BGNSettings',
        'AegisEngine',
        'MapEngine',
        'ServiceRouter',
        'FlowEngine',
        'FlowJastip',
        'UIManager',
        'UIJastip',
        'ContentLoader',
        'GeocoderAPI',
        'OrderWAValidator',
        'ChatHandshake',
        'triggerHaptic',
        'saveLastValidGpsCoord',
        'getLastValidGpsCoord',
        'syncChatAndBottomNavState',
        'hasActiveOverlayOrSubView',
        'armBgtHistoryGuard',
        'periksaSesiChatAktif',
        'applyBgnSettingsToRuntime',
        'spaNavigateTo',
        'hideMandatoryGpsOverlay',
        'enforceMandatoryGpsLock',
        'unlockWithActiveZoneFallback',
        'verifyMandatoryHardwareGps',
        'bindSafeButton',
        'SystemReset',
        'resetWizard',
        'bangunPesanTemplateWhatsAppDriver',
        'normalizeDriverQrisUrl',
        'normalizeDriverPhotoUrl',
        'TEMPORARY_GEOCODE',
        'LOCKED_SEARCH_COORD',
        'LOCKED_SEARCH_TEXT',
        'LOCKED_SEARCH_TARGET'
    ]);

    function _isIsolatedVaultProp(prop) {
        if (typeof prop !== 'string') return false;
        return (
            _PRIVATE_VAULT_KEYS.has(prop) ||
            prop.startsWith('BAGANTARA_') ||
            prop.startsWith('__BGN_') ||
            prop.startsWith('BGN')
        );
    }

    try {
        for (const k of _PRIVATE_VAULT_KEYS) {
            if (k in _realWindow) {
                try { delete _realWindow[k]; } catch (e) {}
            }
        }
    } catch (e) {}

    const _PROTECTED_OJOL_KEYS = new Set([
        'bgt_device_id',
        'bgt_order_count',
        'bgt_active_chat',
        'bgn_active_chat_session',
        'bgn_user_settings_v1',
        'bgn_user_device_settings_v13',
        'bgn_superapp_shared_gps'
    ]);
    const _SCOPED_CLEARABLE_OJOL_KEYS = [
        'bgn_geo_fwd_cache_v4_mt',
        'bgn_geo_rev_cache_v4_mt',
        'bgn_recent_places_v1',
        'bgn_saved_places_vault_v1',
        'bgn_driver_profile_cache_v12_5',
        'bgn_catalog_session_cache_v12_5'
    ];
    const _memStore = Object.create(null);
    const _safeStorage = {
        getItem(k) { try { return _realWindow.localStorage.getItem(k); } catch (e) { return _memStore[k] ?? null; } },
        setItem(k, v) { try { _realWindow.localStorage.setItem(k, String(v)); } catch (e) { _memStore[k] = String(v); } },
        removeItem(k) { try { _realWindow.localStorage.removeItem(k); } catch (e) { delete _memStore[k]; } },
        clear() {
            try {
                for (let i = 0; i < _SCOPED_CLEARABLE_OJOL_KEYS.length; i++) {
                    const key = _SCOPED_CLEARABLE_OJOL_KEYS[i];
                    if (!_PROTECTED_OJOL_KEYS.has(key) && !key.startsWith('bgn_rental_') && !key.startsWith('bgn_superapp_')) {
                        _realWindow.localStorage.removeItem(key);
                    }
                }
            } catch (e) {}
            for (const k of Object.keys(_memStore)) {
                if (!_PROTECTED_OJOL_KEYS.has(k) && !k.startsWith('bgn_rental_') && !k.startsWith('bgn_superapp_')) {
                    delete _memStore[k];
                }
            }
        }
    };

    let _shadowWindow = null;

    const _origDocAddEventListener = _realDocument.addEventListener.bind(_realDocument);
    try {
        _realDocument.addEventListener = function(type, listener, options) {
            if (type === 'DOMContentLoaded' && _realDocument.readyState !== 'loading') {
                Promise.resolve().then(() => {
                    try { listener(new Event('DOMContentLoaded')); } catch (e) {}
                });
                return;
            }
            return _origDocAddEventListener(type, listener, options);
        };
    } catch (e) {}
    const _shadowDocument = _realDocument;

    _shadowWindow = new Proxy(_realWindow, {
        get(target, prop) {
            if (prop === 'window' || prop === 'self' || prop === 'globalThis' || prop === 'top' || prop === 'parent') {
                return _shadowWindow;
            }
            if (prop === 'document') {
                return _shadowDocument;
            }
            if (prop === 'localStorage' || prop === 'sessionStorage') {
                return _safeStorage;
            }
            if (_isIsolatedVaultProp(prop)) {
                return _bgnPrivateVault[prop];
            }
            if (prop === 'alert' && typeof _bgnPrivateVault.alert === 'function') {
                return _bgnPrivateVault.alert;
            }
            const val = Reflect.get(target, prop, target);
            if (typeof val === 'function') {
                const pName = String(prop);
                if (/^[a-z]/.test(pName) && (!val.prototype || Object.keys(val.prototype).length === 0)) {
                    return val.bind(target);
                }
            }
            return val;
        },
        set(target, prop, value) {
            if (_isIsolatedVaultProp(prop) || prop === 'alert') {
                Object.defineProperty(_bgnPrivateVault, prop, { value: value, writable: true, enumerable: true, configurable: true });
                return true;
            }
            return Reflect.set(target, prop, value, target);
        },
        has(target, prop) {
            if (_isIsolatedVaultProp(prop)) {
                return prop in _bgnPrivateVault;
            }
            return Reflect.has(target, prop);
        },
        defineProperty(target, prop, descriptor) {
            if (_isIsolatedVaultProp(prop)) {
                Object.defineProperty(_bgnPrivateVault, prop, {
                    ...descriptor,
                    writable: true,
                    configurable: true
                });
                return true;
            }
            return Reflect.defineProperty(target, prop, descriptor);
        },
        getOwnPropertyDescriptor(target, prop) {
            if (_isIsolatedVaultProp(prop)) {
                return Object.getOwnPropertyDescriptor(_bgnPrivateVault, prop);
            }
            return Reflect.getOwnPropertyDescriptor(target, prop);
        },
        deleteProperty(target, prop) {
            if (_isIsolatedVaultProp(prop)) {
                delete _bgnPrivateVault[prop];
                return true;
            }
            return Reflect.deleteProperty(target, prop);
        }
    });

    (function(window, document, globalThis, self, localStorage, sessionStorage) {
        const alert = function(...args) {
            return window.alert(...args);
        };
        ${encryptedDecorator}
        ${modulesCode}
        ${chatBundleCode}
    })(_shadowWindow, _shadowDocument, _shadowWindow, _shadowWindow, _safeStorage, _safeStorage);
})();`;
}

async function obfuscateBundleCode(rawBundleCode) {
    try {
        const jsObfMod = await import('javascript-obfuscator');
        const JavaScriptObfuscator = jsObfMod.default || jsObfMod;
        if (JavaScriptObfuscator && typeof JavaScriptObfuscator.obfuscate === 'function') {
            console.log('[BuildSecure] Menjalankan javascript-obfuscator dengan RC4 & Control Flow Flattening...');
            const obfResult = JavaScriptObfuscator.obfuscate(rawBundleCode, OBFUSCATOR_OPTIONS);
            return obfResult.getObfuscatedCode();
        }
    } catch (e) {}

    console.log('[BuildSecure] Menjalankan Internal AST + RC4 String-Array + Control-Flow Obfuscator & Terser...');
    let acorn = null;
    let minify = null;
    try { acorn = require('acorn'); } catch (e1) {
        try { acorn = require('/usr/share/nodejs/acorn'); } catch (e2) {}
    }
    try { minify = require('terser').minify; } catch (e1) {
        try { minify = require('/usr/share/nodejs/terser').minify; } catch (e2) {}
    }
    if (!acorn || !minify) {
        console.log('[BuildSecure] Menggunakan Fallback Pure-JS Bundle Minifier (Serverless Safe)...');
        return rawBundleCode;
    }

    const preMinified = await minify(rawBundleCode, {
        compress: {
            dead_code: false,
            drop_console: false,
            drop_debugger: true,
            passes: 1
        },
        mangle: false,
        format: {
            comments: false,
            beautify: false
        }
    });

    const cleanCode = preMinified.code || rawBundleCode;
    const ast = acorn.parse(cleanCode, { ecmaVersion: 'latest', sourceType: 'script' });

    const stringPoolMap = new Map();
    const stringPool = [];
    const replacements = [];

    function walkAst(node, parent = null) {
        if (!node || typeof node !== 'object') return;

        if (node.type === 'Literal' && typeof node.value === 'string') {
            const val = node.value;
            const isDirective = val === 'use strict';
            const isObjectKey = parent && (
                (parent.type === 'Property' && parent.key === node && !parent.computed) ||
                (parent.type === 'MethodDefinition' && parent.key === node && !parent.computed) ||
                parent.type === 'ImportDeclaration' ||
                parent.type === 'ExportNamedDeclaration' ||
                parent.type === 'ExportAllDeclaration'
            );

            if (!isDirective && !isObjectKey && val.length >= 3 && val.length <= 240) {
                let idx = stringPoolMap.get(val);
                if (idx === undefined) {
                    idx = stringPool.length;
                    stringPool.push(val);
                    stringPoolMap.set(val, idx);
                }
                replacements.push({ start: node.start, end: node.end, index: idx });
            }
        }

        for (const k of Object.keys(node)) {
            if (k === 'start' || k === 'end' || k === 'loc' || k === 'range') continue;
            const child = node[k];
            if (Array.isArray(child)) {
                for (let i = 0; i < child.length; i++) {
                    if (child[i] && typeof child[i].type === 'string') {
                        walkAst(child[i], node);
                    }
                }
            } else if (child && typeof child.type === 'string') {
                walkAst(child, node);
            }
        }
    }

    walkAst(ast);

    const rc4Key = crypto.randomBytes(8).toString('hex');
    const totalStrings = stringPool.length;

    const perm = Array.from({ length: totalStrings }, (_, i) => i);
    for (let i = totalStrings - 1; i > 0; i--) {
        const r = crypto.randomInt(0, i + 1);
        const tmp = perm[i];
        perm[i] = perm[r];
        perm[r] = tmp;
    }

    const rotateOffset = totalStrings > 2 ? crypto.randomInt(1, Math.min(31, totalStrings)) : 0;
    const rotatedPerm = perm.map((_, idx) => perm[(idx + rotateOffset) % totalStrings]);

    const originalToFinalIdx = new Array(totalStrings);
    const encodedStringArray = new Array(totalStrings);
    for (let finalIdx = 0; finalIdx < totalStrings; finalIdx++) {
        const origIdx = rotatedPerm[finalIdx];
        originalToFinalIdx[origIdx] = finalIdx;
        encodedStringArray[finalIdx] = rc4TransformStr(stringPool[origIdx], rc4Key);
    }

    const preRotatedArray = encodedStringArray.map(
        (_, idx) => encodedStringArray[(idx - rotateOffset + totalStrings) % totalStrings]
    );

    const indexBaseOffset = 0x1a0;
    replacements.sort((a, b) => b.start - a.start);
    let transformedCode = cleanCode;
    for (const rep of replacements) {
        const finalIdx = originalToFinalIdx[rep.index] + indexBaseOffset;
        transformedCode =
            transformedCode.slice(0, rep.start) +
            `(_0x4b9e(0x${finalIdx.toString(16)}))` +
            transformedCode.slice(rep.end);
    }

    const obfuscationRuntimeHeader = `(function(){
const _0x2f1a=${JSON.stringify(preRotatedArray)};
(function(_0xarr,_0xrot){
    const _0xshf=function(_0xn){while(_0xn-->0){_0xarr.push(_0xarr.shift());}};
    _0xshf(_0xrot);
})(_0x2f1a,0x${rotateOffset.toString(16)});
const _0x8c1d=Object.create(null);
function _0x4b9e(_0xidx){
    const _0xi=_0xidx-0x${indexBaseOffset.toString(16)};
    if(_0x8c1d[_0xi]!==undefined)return _0x8c1d[_0xi];
    const _0xb64=_0x2f1a[_0xi];
    const _0xkey=${JSON.stringify(rc4Key)};
    const _0xbin=atob(_0xb64);
    const _0xs=new Uint8Array(256);
    let _0xj=0,_0xstate=0;
    while(_0xstate<3){
        switch(_0xstate){
            case 0:
                for(let _0xk=0;_0xk<256;_0xk++)_0xs[_0xk]=_0xk;
                _0xstate=1;
                break;
            case 1:
                for(let _0xk=0;_0xk<256;_0xk++){
                    _0xj=(_0xj+_0xs[_0xk]+_0xkey.charCodeAt(_0xk%_0xkey.length))&255;
                    const _0xt=_0xs[_0xk];_0xs[_0xk]=_0xs[_0xj];_0xs[_0xj]=_0xt;
                }
                _0xstate=2;
                break;
            case 2:
                const _0xout=new Uint8Array(_0xbin.length);
                let _0xp=0,_0xq=0;
                for(let _0xm=0;_0xm<_0xbin.length;_0xm++){
                    _0xp=(_0xp+1)&255;
                    _0xq=(_0xq+_0xs[_0xp])&255;
                    const _0xt=_0xs[_0xp];_0xs[_0xp]=_0xs[_0xq];_0xs[_0xq]=_0xt;
                    _0xout[_0xm]=_0xbin.charCodeAt(_0xm)^_0xs[(_0xs[_0xp]+_0xs[_0xq])&255];
                }
                const _0xdec=new TextDecoder('utf-8').decode(_0xout);
                _0x8c1d[_0xi]=_0xdec;
                return _0xdec;
        }
    }
}
(function(){
    const _0xselfDef=function(){const _0xrgx=new RegExp("\\n\\s{4,}");return !_0xrgx.test(_0xselfDef.toString());};
    if(!_0xselfDef()){return;}
    try{
        const _0xnoop=function(){};
        const _0xm=['log','info','debug','table','trace'];
        for(let _0xk=0;_0xk<_0xm.length;_0xk++){
            if(typeof console!=='undefined'&&console[_0xm[_0xk]]){
                console[_0xm[_0xk]]=_0xnoop;
            }
        }
    }catch(_0xe){}
})();
${transformedCode}
})();`;

    const finalMinified = await minify(obfuscationRuntimeHeader, {
        compress: {
            passes: 2,
            drop_console: false,
            drop_debugger: true,
            conditionals: true,
            sequences: true,
            booleans: true
        },
        mangle: {
            toplevel: true
        },
        format: {
            comments: false,
            beautify: false
        }
    });

    return finalMinified.code || obfuscationRuntimeHeader;
}

function minifyHtmlFragment(html) {
    return String(html || '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\r?\n\s*/g, ' ')
        .replace(/>\s+</g, '><')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function minifyFullHtmlDocument(rawHtml) {
    let html = String(rawHtml || '');

    html = html.replace(/<!--[\s\S]*?-->/g, '');

    html = html
        .replace(/\.\/css\/theme\.css(?:\?v=[0-9.]+)?/g, './css/theme.css?v=13.2')
        .replace(/\.\/css\/map\.css(?:\?v=[0-9.]+)?/g, './css/map.css?v=13.2')
        .replace(/\.\/css\/theme-chat-publik\.css(?:\?v=[0-9.]+)?/g, './css/theme-chat-publik.css?v=13.2')
        .replace(/\.\/services-worker\.js(?:\?v=[0-9.]+)?/g, './services-worker.js?v=13.2')
        .replace(/BAGANTARA V11\.9/g, 'BAGANTARA V13.2')
        .replace(/BAGANTARA V12\.0/g, 'BAGANTARA V13.2')
        .replace(/BAGANTARA V12\.5 - MapTiler Engine/g, 'BAGANTARA V13.2 - MapTiler Engine');

    let insertedCoreScript = false;
    html = html.replace(/<script\b[^>]*\bsrc=["']\.\/(?:js|chat)\/[^"']+["'][^>]*>\s*<\/script>/gi, () => {
        if (!insertedCoreScript) {
            insertedCoreScript = true;
            return '<script src="./js/bgn-core.min.js?v=13.2" defer></script>';
        }
        return '';
    });

    html = html
        .replace(/console\.log\([^)]*\)/g, 'void 0')
        .replace(/console\.error\([^)]*\)/g, 'void 0');

    html = html
        .replace(/\r?\n\s*/g, ' ')
        .replace(/>\s+</g, '><')
        .replace(/\s{2,}/g, ' ')
        .trim();

    return html;
}

function minifyCssContent(rawCss) {
    const quotedPlaceholders = [];
    const protectedCss = String(rawCss || '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(["'])(?:(?=(\\?))\2.)*?\1/g, (match) => {
            const idx = quotedPlaceholders.length;
            quotedPlaceholders.push(match);
            return `__BGN_CSS_STR_${idx}__`;
        });

    const minified = protectedCss
        .replace(/\s+/g, ' ')
        .replace(/\s*([{}:;,>~])\s*/g, '$1')
        .replace(/;}/g, '}')
        .trim();

    return minified.replace(/__BGN_CSS_STR_(\d+)__/g, (_, idx) => quotedPlaceholders[Number(idx)] || '');
}

function copyAllowedImagesOnly(srcDir, destDir) {
    if (!fs.existsSync(srcDir)) return;
    const allowedExts = new Set(['.png', '.jpg', '.jpeg', '.webp']);
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);
        if (entry.isDirectory()) {
            copyAllowedImagesOnly(srcPath, destPath);
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (allowedExts.has(ext)) {
                fs.mkdirSync(path.dirname(destPath), { recursive: true });
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }
}

async function runBuild() {
    console.log('==========================================================');
    console.log(' BAGANTARA PUBLIC v13.2 - MAPTILER & CHAT UX SECURE BUILD ');
    console.log('==========================================================');

    const ALLOWED_TOP = new Set(["index.html", "manifest.json", "services-worker.js", "js", "css", "assets"]);
    if (fs.existsSync(DIST_DIR)) {
        for (const entry of fs.readdirSync(DIST_DIR)) {
            if (!ALLOWED_TOP.has(entry)) {
                try { fs.rmSync(path.join(DIST_DIR, entry), { recursive: true, force: true }); } catch (e) {}
            }
        }
    }
    fs.mkdirSync(path.join(DIST_DIR, 'js'), { recursive: true });
    fs.mkdirSync(path.join(DIST_DIR, 'css'), { recursive: true });
    fs.mkdirSync(path.join(DIST_DIR, 'assets'), { recursive: true });

    const rawBundleCode = assembleSingleIifeClosureBundle();
    const obfuscatedBundle = await obfuscateBundleCode(rawBundleCode);
    const outJsPath = path.join(DIST_DIR, 'js', 'bgn-core.min.js');
    fs.writeFileSync(outJsPath, obfuscatedBundle, 'utf8');
    fs.writeFileSync(path.join(ROOT_DIR, 'js', 'bgn-core.min.js'), obfuscatedBundle, 'utf8');
    console.log(`[BuildSecure] dist/js/bgn-core.min.js berhasil dibuat (${(Buffer.byteLength(obfuscatedBundle) / 1024).toFixed(1)} KB).`);

    const rawSw = readTextFile('services-worker.js');
    let minifiedSw = rawSw;
    try {
        const { minify } = require('/usr/share/nodejs/terser');
        const swRes = await minify(rawSw, {
            compress: { passes: 2, drop_console: true },
            mangle: { toplevel: false },
            format: { comments: false }
        });
        if (swRes && swRes.code) minifiedSw = swRes.code;
    } catch (e) {
        minifiedSw = rawSw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim();
    }
    fs.writeFileSync(path.join(DIST_DIR, 'services-worker.js'), minifiedSw, 'utf8');

    const rawIndexHtml = readTextFile('index.html');
    const minifiedIndexHtml = minifyFullHtmlDocument(rawIndexHtml);
    fs.writeFileSync(path.join(DIST_DIR, 'index.html'), minifiedIndexHtml, 'utf8');

    const cssFiles = ['theme.css', 'map.css', 'theme-chat-publik.css'];
    for (const cssFile of cssFiles) {
        const rawCss = readTextFile(path.join('css', cssFile));
        const minifiedCss = minifyCssContent(rawCss);
        fs.writeFileSync(path.join(DIST_DIR, 'css', cssFile), minifiedCss, 'utf8');
    }

    const pwaManifest = readJsonFile('manifest.json');
    fs.writeFileSync(path.join(DIST_DIR, 'manifest.json'), JSON.stringify(pwaManifest), 'utf8');

    copyAllowedImagesOnly(path.join(ROOT_DIR, 'assets'), path.join(DIST_DIR, 'assets'));

    console.log('[BuildSecure] Build v13.2 selesai 100% (MapTiler Aktif, Tanpa Banner Rekrutmen, Tanpa OSM/Photon)!');
}

runBuild().catch((err) => {
    console.error('[BuildSecure] Build gagal:', err);
    process.exit(1);
});
