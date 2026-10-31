// ==========================================
// MESIN KONTEN INDEPENDEN (ZERO-FETCH IN-MEMORY VAULT & KAPSUL DONASI SOCIABUZZ - V12.4)
// ARSITEKTUR: MEMBACA LANGSUNG DARI MEMORI BUNDLE TERENKRIPSI (TANPA BANNER REKRUTMEN)
// ==========================================

window.ContentLoader = {
    _defaultManifest: {
        version: "1.3",
        banners: [],
        about_pages: [
            {
                id: "tentang-kami",
                title: "Tentang Bagantara",
                icon: "fa-solid fa-rocket",
                file: "./content/pages/tentang.html"
            },
            {
                id: "syarat-ketentuan",
                title: "Syarat & Ketentuan Layanan",
                icon: "fa-solid fa-scale-balanced",
                file: "./content/pages/syarat-ketentuan.html"
            },
            {
                id: "kebijakan-privasi",
                title: "Kebijakan Privasi",
                icon: "fa-solid fa-shield-halved",
                file: "./content/pages/privasi.html"
            },
            {
                id: "donasi-sociabuzz",
                title: "Dukungan & Donasi Ekosistem",
                icon: "fa-solid fa-hand-holding-heart",
                file: "./content/pages/donasi.html",
                url: "https://sociabuzz.com/bagantara",
                badge: "SOCIABUZZ"
            }
        ]
    },

    _defaultPagesHtml: {
        "./content/pages/tentang.html": "<div style=\"display: flex; flex-direction: column; gap: 14px; padding-top: 6px; color: var(--text-muted); font-size: 0.83rem; line-height: 1.65;\">\n    <div style=\"background: linear-gradient(145deg, var(--card-bg-2), var(--void-black)); border: 1px solid var(--border-gold-subtle); border-left: 3.5px solid var(--neon-gold); border-radius: 12px; padding: 13px 14px;\">\n        <div class=\"font-tech\" style=\"font-size: 0.68rem; font-weight: 900; color: var(--neon-gold); letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 4px;\">\n            <i class=\"fa-solid fa-network-wired\"></i> BAGANTARA — BAGAN PERANTARA\n        </div>\n        <p style=\"margin: 0; color: var(--text-main); font-size: 0.82rem; line-height: 1.6;\">\n            <b>BAGANTARA</b> merupakan akronim dari <b>Bagan Perantara</b> — layanan penghubung transportasi dan pengantaran lokal yang mempertemukan masyarakat secara langsung dengan para pengemudi di lapangan.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-bolt\" style=\"color: var(--neon-green);\"></i>\n            <span>Layanan Praktis, Cepat &amp; Transparan</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            Pelanggan dapat langsung memilih pengemudi terdekat dan memesan layanan antar-jemput penumpang motor (<b>Ride</b>), mobil (<b>Car</b>), pengiriman barang atau dokumen (<b>Express</b>), serta jasa titip belanja (<b>Jastip</b>) secara praktis <b>tanpa perlu mendaftar akun</b>. Estimasi jarak dan rincian biaya ditampilkan secara terbuka sebelum pesanan dibuat.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-user-shield\" style=\"color: var(--neon-gold);\"></i>\n            <span>Pengemudi Terverifikasi &amp; Terdaftar Resmi</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            Keamanan dan kenyamanan pelanggan adalah prioritas utama kami. Setiap pengemudi yang tampil di katalog aktif telah melewati proses pemeriksaan identitas, pencatatan data kendaraan, serta persetujuan standar etika pelayanan oleh pengelola Bagantara.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-seedling\" style=\"color: var(--neon-green);\"></i>\n            <span>Misi Sosial &amp; Kemandirian Ekonomi Lokal</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            Bagantara hadir untuk membuka peluang penghasilan yang bermartabat bagi warga sekitar, mempermudah mobilitas harian masyarakat, serta menjaga agar seluruh hasil jerih payah pengantaran diterima secara utuh oleh pengemudi lokal tanpa potongan komisi.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-comments\" style=\"color: var(--amber-accent);\"></i>\n            <span>Terbuka terhadap Masukan Masyarakat</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            Kami terus menyempurnakan kualitas layanan sesuai kebutuhan nyata di lapangan. Saran, masukan, dan evaluasi dari pelanggan maupun pengemudi sangat berarti bagi peningkatan mutu layanan Bagantara ke depannya.\n        </p>\n    </div>\n    <div style=\"background: var(--emerald-bg-soft); border: 1px dashed rgba(16, 185, 129, 0.45); border-left: 3.5px solid var(--neon-green); border-radius: 12px; padding: 13px 14px; display: flex; flex-direction: column; gap: 10px;\">\n        <div class=\"font-tech\" style=\"font-size: 0.72rem; font-weight: 900; color: var(--emerald-accent); letter-spacing: 0.5px;\">\n            <i class=\"fa-solid fa-heart-pulse\"></i> DUKUNGAN KEBERLANJUTAN LAYANAN\n        </div>\n        <p style=\"margin: 0; color: var(--text-main); font-size: 0.8rem; line-height: 1.58;\">\n            Karena Bagantara tidak memungut biaya potongan komisi dari pengemudi maupun pelanggan, kami membuka ruang dukungan sukarela untuk merawat operasional sistem, menjaga kelancaran peta dan ruang obrolan, serta memperluas jangkauan wilayah layanan.\n        </p>\n        <div style=\"display: flex; flex-wrap: wrap; gap: 8px; margin-top: 2px;\">\n            <a href=\"https://sociabuzz.com/bagantara\" target=\"_blank\" rel=\"noopener noreferrer\" style=\"flex: 1 1 180px; background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; text-decoration: none; padding: 10px 14px; border-radius: 10px; font-family: 'Space Grotesk', monospace; font-size: 0.74rem; font-weight: 800; letter-spacing: 0.5px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);\">\n                <i class=\"fa-solid fa-hand-holding-heart\"></i> DUKUNG VIA SOCIABUZZ\n            </a>\n            <a href=\"https://wa.me/6282225225141?text=Halo%20Tim%20Bagantara,%20saya%20ingin%20memberikan%20saran%20dan%20masukan%20layanan:\" target=\"_blank\" rel=\"noopener noreferrer\" style=\"flex: 1 1 160px; background: var(--void-black); border: 1px solid var(--border-gold-subtle); color: var(--neon-gold); text-decoration: none; padding: 10px 14px; border-radius: 10px; font-family: 'Space Grotesk', monospace; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.5px; display: inline-flex; align-items: center; justify-content: center; gap: 7px;\">\n                <i class=\"fa-brands fa-whatsapp\"></i> KIRIM SARAN LAYANAN\n            </a>\n        </div>\n    </div>\n</div>",
        "./content/pages/syarat-ketentuan.html": "<div style=\"display: flex; flex-direction: column; gap: 14px; padding-top: 6px; color: var(--text-muted); font-size: 0.83rem; line-height: 1.65;\">\n    <div style=\"background: linear-gradient(145deg, var(--card-bg-2), var(--void-black)); border: 1px solid var(--border-gold-subtle); border-left: 3.5px solid var(--neon-gold); border-radius: 12px; padding: 13px 14px;\">\n        <div class=\"font-tech\" style=\"font-size: 0.68rem; font-weight: 900; color: var(--neon-gold); letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 4px;\">\n            <i class=\"fa-solid fa-scale-balanced\"></i> KETENTUAN RESMI PENGGUNAAN LAYANAN BAGANTARA\n        </div>\n        <p style=\"margin: 0; color: var(--text-main); font-size: 0.82rem; line-height: 1.6;\">\n            Dokumen ini mengatur hak, kewajiban, mekanisme pemesanan, ketentuan pembayaran, serta tanggung jawab bersama bagi pelanggan dan pengemudi dalam menggunakan layanan <b>BAGANTARA</b>.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-handshake-simple\" style=\"color: var(--neon-green);\"></i>\n            <span>1. Kedudukan Layanan &amp; Kebijakan Tanpa Potongan Komisi</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            <b>BAGANTARA (Bagan Perantara)</b> berfungsi sebagai sarana penghubung yang mempertemukan pelanggan secara langsung dengan pengemudi di lapangan. Bagantara <b>tidak memungut biaya potongan komisi</b> atas tarif perjalanan penumpang (<b>Ride</b> &amp; <b>Car</b>), pengiriman barang (<b>Express</b>), maupun jasa titip belanja (<b>Jastip</b>). Seluruh ongkos layanan dibayarkan langsung oleh pelanggan kepada pengemudi sesuai rincian tarif yang tertera.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-calculator\" style=\"color: var(--neon-gold);\"></i>\n            <span>2. Transparansi Tarif &amp; Metode Pembayaran</span>\n        </h4>\n        <ul style=\"margin: 4px 0 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 5px;\">\n            <li><b>Perhitungan Rute Terbuka:</b> Estimasi jarak tempuh dan biaya pengantaran dihitung secara otomatis berdasarkan titik jemput dan titik tujuan yang dipilih pelanggan sebelum pesanan dikirimkan.</li>\n            <li><b>Pembayaran Langsung ke Pengemudi:</b> Pembayaran ongkos perjalanan atau pengantaran dilakukan secara tunai maupun non-tunai (melalui QRIS resmi milik pengemudi) setelah layanan diselesaikan atau sesuai kesepakatan bersama.</li>\n            <li><b>Ketentuan Belanja Layanan Jastip:</b> Untuk layanan titip belanja (<b>Jastip</b>), pelanggan wajib mengganti biaya pembelian barang sesuai struk atau nota harga asli dari lokasi perbelanjaan ditambah ongkos jasa pengantaran yang tertera di aplikasi.</li>\n        </ul>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-box-open\" style=\"color: var(--neon-green);\"></i>\n            <span>3. Ketentuan Pengiriman Barang (Express) &amp; Keselamatan</span>\n        </h4>\n        <ul style=\"margin: 4px 0 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 5px;\">\n            <li><b>Batas Muatan Wajar:</b> Barang yang dikirim melalui layanan <b>Express</b> maupun <b>Jastip</b> wajib dikemas dengan aman dan tidak melebihi batas kapasitas muatan wajar kendaraan pengemudi.</li>\n            <li><b>Barang Terlarang:</b> Pelanggan dilarang keras mengirimkan barang berbahaya, mudah meledak, narkotika, obat-obatan terlarang, senjata tajam, maupun barang yang melanggar hukum di Republik Indonesia. Pengemudi berhak menolak pesanan apabila muatan dinilai membahayakan keselamatan.</li>\n        </ul>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-ban\" style=\"color: var(--amber-accent);\"></i>\n            <span>4. Kebijakan Pembatalan Pesanan</span>\n        </h4>\n        <ul style=\"margin: 4px 0 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 5px;\">\n            <li><b>Sebelum Pengemudi Berangkat:</b> Pelanggan dapat membatalkan atau mengganti pengemudi apabila pengemudi yang dipilih belum merespons atau berhalangan mengambil pesanan.</li>\n            <li><b>Setelah Pesanan Diterima:</b> Apabila pembatalan terpaksa dilakukan setelah pengemudi menuju lokasi jemput atau setelah barang Jastip dibelanjakan, pelanggan wajib mengupayakan penyelesaian yang adil bersama pengemudi melalui ruang obrolan atau WhatsApp.</li>\n        </ul>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-user-check\" style=\"color: var(--neon-gold);\"></i>\n            <span>5. Etika Pengguna &amp; Larangan Pesanan Fiktif</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            Pelanggan wajib mencantumkan nama panggilan/lengkap, titik lokasi yang akurat, serta nomor WhatsApp aktif yang benar pada layanan yang mempersyaratkannya. Segala bentuk pembuatan pesanan fiktif, pelecehan, maupun tindakan yang merugikan pengemudi akan ditindak melalui pemblokiran akses perangkat serta pelaporan kepada pihak berwenang sesuai ketentuan hukum yang berlaku.\n        </p>\n    </div>\n</div>",
        "./content/pages/privasi.html": "<div style=\"display: flex; flex-direction: column; gap: 14px; padding-top: 6px; color: var(--text-muted); font-size: 0.83rem; line-height: 1.65;\">\n    <div style=\"background: linear-gradient(145deg, var(--card-bg-2), var(--void-black)); border: 1px solid var(--border-gold-subtle); border-left: 3.5px solid var(--neon-gold); border-radius: 12px; padding: 13px 14px;\">\n        <div class=\"font-tech\" style=\"font-size: 0.68rem; font-weight: 900; color: var(--neon-gold); letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 4px;\">\n            <i class=\"fa-solid fa-user-lock\"></i> KOMITMEN PERLINDUNGAN PRIVASI PELANGGAN\n        </div>\n        <p style=\"margin: 0; color: var(--text-main); font-size: 0.82rem; line-height: 1.6;\">\n            Sebagai <b>Bagan Perantara (BAGANTARA)</b>, kami menghormati privasi Anda secara menyeluruh. <b>Pelanggan tidak perlu mendaftar akun, masuk dengan kata sandi, atau menyerahkan data pribadi sensitif</b> untuk memesan layanan.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-id-badge\" style=\"color: var(--neon-green);\"></i>\n            <span>1. Pemesanan Langsung Tanpa Pendaftaran Akun</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            Kami hanya meminta informasi seperlunya agar pesanan Anda dapat dilayani dengan baik. Saat memesan, Anda cukup mencantumkan <b>Nama Panggilan atau Nama Lengkap</b> agar pengemudi dapat mengenali pelanggan yang dijemput atau menerima barang, tanpa kewajiban membuat profil permanen.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-brands fa-whatsapp\" style=\"color: var(--neon-green);\"></i>\n            <span>2. Kerahasiaan Kontak &amp; Nomor WhatsApp</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            Untuk layanan <b>Ride, Car, dan Express</b> bersama pengemudi yang sedang aktif di aplikasi, pencantuman nomor WhatsApp bersifat <b>Opsional (boleh dikosongkan)</b> karena komunikasi dapat dilakukan langsung melalui ruang obrolan di dalam aplikasi. Nomor WhatsApp aktif hanya bersifat <b>Wajib pada layanan Jastip</b> atau saat menghubungi pengemudi <b>Siaga WA</b> guna memastikan kejelasan detail belanja dan titik pengantaran.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-location-crosshairs\" style=\"color: var(--neon-gold);\"></i>\n            <span>3. Penggunaan Lokasi Hanya Saat Aplikasi Dibuka</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            Titik lokasi perangkat Anda hanya digunakan ketika Anda sedang membuka aplikasi untuk menampilkan daftar pengemudi terdekat di wilayah Anda, menentukan titik jemput serta tujuan di peta, dan menghitung jarak rute perjalanan. Bagantara <b>tidak pernah memantau atau melacak lokasi Anda di latar belakang</b> ketika aplikasi ditutup.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-mobile-screen-button\" style=\"color: var(--amber-accent);\"></i>\n            <span>4. Riwayat Alamat Tersimpan di Perangkat Anda Sendiri</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            Daftar alamat favorit dan riwayat titik pencarian disimpan langsung di memori peramban ponsel Anda sendiri untuk mempercepat pemesanan berikutnya. Anda memegang kendali penuh untuk menghapus satu per satu maupun seluruh riwayat alamat kapan saja melalui tombol <b>Hapus Semua</b> pada layar pencarian lokasi.\n        </p>\n    </div>\n    <div>\n        <h4 class=\"font-tech text-main\" style=\"font-size: 0.84rem; font-weight: 800; margin-bottom: 5px; display: flex; align-items: center; gap: 8px;\">\n            <i class=\"fa-solid fa-shield-halved\" style=\"color: var(--neon-green);\"></i>\n            <span>5. Penghapusan Obrolan Otomatis &amp; Keamanan Data</span>\n        </h4>\n        <p style=\"margin: 0;\">\n            Seluruh pesan teks, titik lokasi, pesan suara, dan foto di ruang obrolan hanya digunakan selama proses penjemputan atau pengantaran berlangsung, serta <b>dihapus secara otomatis</b> segera setelah perjalanan selesai atau dibatalkan. Bagantara tidak pernah memperjualbelikan atau membagikan data pengguna kepada pihak ketiga mana pun.\n        </p>\n    </div>\n</div>",
        "./content/pages/donasi.html": "<div style=\"display: flex; flex-direction: column; gap: 13px; padding-top: 6px; color: var(--text-muted); font-size: 0.83rem; line-height: 1.65;\">\n    <div style=\"background: linear-gradient(145deg, rgba(212, 175, 55, 0.14), rgba(16, 185, 129, 0.08)); border: 1px solid var(--border-gold-subtle); border-left: 3.5px solid var(--neon-gold); border-radius: 12px; padding: 13px 14px;\">\n        <div class=\"font-tech\" style=\"font-size: 0.68rem; font-weight: 900; color: var(--neon-gold); letter-spacing: 0.8px; text-transform: uppercase; margin-bottom: 4px;\">\n            <i class=\"fa-solid fa-hand-holding-heart\"></i> GOTONG ROYONG KEBERLANJUTAN LAYANAN\n        </div>\n        <p style=\"margin: 0; color: var(--text-main); font-size: 0.82rem; line-height: 1.6;\">\n            <b>BAGANTARA (Bagan Perantara)</b> hadir sebagai layanan penghubung transportasi dan pengantaran warga yang menjaga agar 100% penghasilan diterima utuh oleh pengemudi lokal tanpa potongan komisi.\n        </p>\n    </div>\n    <p style=\"margin: 0;\">\n        Agar layanan ini dapat terus berjalan secara mandiri, merawat sistem pemetaan dan ruang obrolan, serta memperluas jangkauan wilayah guna membuka peluang penghasilan bagi warga sekitar, kami membuka ruang <b>dukungan sukarela</b> yang dikelola secara <b>terbuka dan bertanggung jawab</b>.\n    </p>\n    <div style=\"background: var(--void-black); border: 1px solid var(--border-cyber); border-radius: 11px; padding: 11px 13px; display: flex; flex-direction: column; gap: 6px; font-size: 0.78rem;\">\n        <div class=\"font-tech text-main\" style=\"font-size: 0.7rem; font-weight: 800; color: var(--neon-green);\">\n            <i class=\"fa-solid fa-circle-check\"></i> PEMANFAATAN DUKUNGAN SUKARELA:\n        </div>\n        <div style=\"display: flex; flex-direction: column; gap: 4px; color: var(--text-muted);\">\n            <span>• Pemeliharaan operasional sistem, layanan peta rute, dan ruang obrolan pelanggan-pengemudi.</span>\n            <span>• Perluasan wilayah layanan baru dan pembukaan kesempatan kerja bagi pengemudi lokal.</span>\n            <span>• Penyempurnaan fitur aplikasi berdasarkan masukan masyarakat dan pengemudi.</span>\n        </div>\n    </div>\n    <a href=\"https://sociabuzz.com/bagantara\" target=\"_blank\" rel=\"noopener noreferrer\" style=\"width: 100%; background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; text-decoration: none; padding: 12px 16px; border-radius: 12px; font-family: 'Space Grotesk', monospace; font-size: 0.8rem; font-weight: 900; letter-spacing: 0.7px; display: flex; align-items: center; justify-content: center; gap: 9px; box-shadow: 0 6px 18px rgba(16, 185, 129, 0.35); text-transform: uppercase;\">\n        <i class=\"fa-solid fa-heart\"></i> DONASI &amp; DUKUNG DI SOCIABUZZ\n        <i class=\"fa-solid fa-up-right-from-square\" style=\"font-size: 0.72rem;\"></i>\n    </a>\n</div>"
    },

    _resolveStaticPageHtml: function(pageItem) {
        if (!pageItem) return '';
        const contentVault = window.BGN_CONFIG?.content_pages || window.__BGN_CONTENT_VAULT__ || null;
        const pagesMap = contentVault?.pages || {};
        const fileKey = pageItem.file || '';
        const baseName = fileKey.split('/').pop() || '';
        return (
            pagesMap[fileKey] ||
            pagesMap[pageItem.id] ||
            pagesMap[baseName] ||
            this._defaultPagesHtml[fileKey] ||
            ''
        );
    },

    init: function() {
        try {
            const contentVault = window.BGN_CONFIG?.content_pages || window.__BGN_CONTENT_VAULT__ || null;
            const manifestData = contentVault?.manifest || this._defaultManifest;

            this.loadBanners([]);
            let aboutPages = Array.isArray(manifestData.about_pages) && manifestData.about_pages.length > 0
                ? manifestData.about_pages.slice()
                : this._defaultManifest.about_pages.slice();

            if (!aboutPages.some(p => p && p.id === 'syarat-ketentuan')) {
                const defaultSyarat = this._defaultManifest.about_pages.find(p => p.id === 'syarat-ketentuan');
                if (defaultSyarat) {
                    aboutPages.splice(1, 0, defaultSyarat);
                }
            }
            this.loadAboutPages(aboutPages);
        } catch (err) {
            this.loadAboutPages(this._defaultManifest.about_pages);
        }
    },

    loadBanners: function() {
        const container = document.getElementById('dynamic-banner-container');
        if (container) {
            container.innerHTML = '';
            container.style.display = 'none';
            container.remove();
        }
    },

    openAboutPageById: function(pageId) {
        const targetId = String(pageId || 'syarat-ketentuan').trim();
        const navAbout = document.getElementById('navAbout');
        if (navAbout) {
            navAbout.click();
        } else {
            const viewAbout = document.getElementById('view-about');
            if (viewAbout) viewAbout.classList.remove('hidden');
        }
        setTimeout(() => {
            const cardEl = document.querySelector(`[data-about-page-id="${targetId}"]`);
            if (cardEl) {
                const headerEl = cardEl.querySelector('.bgn-about-page-header');
                const contentEl = cardEl.querySelector('.bgn-about-page-content');
                if (headerEl && contentEl && (contentEl.style.maxHeight === '0px' || !contentEl.style.maxHeight)) {
                    headerEl.click();
                }
                try { cardEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
            }
        }, 120);
    },

    loadAboutPages: function(pages) {
        const container = document.getElementById('dynamic-about-list');
        if (!container || pages.length === 0) return;
        container.innerHTML = '';
        const msgMaintenance = window.BGN_CONFIG?.wording?.alerts?.content_maintenance || "Konten sedang dalam pembaruan.";

        pages.forEach(p => {
            const item = document.createElement('div');
            item.className = "glass-panel";
            if (p.id) item.setAttribute('data-about-page-id', p.id);
            const isDonationCapsule = Boolean(p.url);
            item.style.cssText = isDonationCapsule
                ? "border-radius: 14px; overflow: hidden; transition: all 0.3s; margin-bottom: 0; border: 1px solid var(--border-gold-subtle); border-left: 3.5px solid var(--neon-green);"
                : "border-radius: 12px; overflow: hidden; transition: all 0.3s; margin-bottom: 0;";

            const header = document.createElement('div');
            header.className = "bgn-about-page-header";
            header.style.cssText = "padding: 16px; display: flex; align-items: center; justify-content: space-between; gap: 10px; cursor: pointer; font-weight: 700; color: var(--text-main); font-size: 0.95rem;";

            const capsuleBadgeHtml = p.url
                ? `<a href="${p.url}" target="_blank" rel="noopener noreferrer" class="driver-loc-pill bgn-direct-capsule-link" title="Buka ${p.title}" style="background: rgba(16, 185, 129, 0.16); border: 1px solid var(--neon-green); color: var(--emerald-accent); padding: 4px 10px; border-radius: 999px; font-size: 0.62rem; font-weight: 800; display: inline-flex; align-items: center; gap: 5px; text-decoration: none; flex-shrink: 0;">
                       <i class="fa-solid fa-heart"></i> <span>${p.badge || 'DONASI'}</span> <i class="fa-solid fa-up-right-from-square" style="font-size: 0.55rem;"></i>
                   </a>`
                : '';

            header.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
                    <i class="${p.icon} text-gold" style="font-size: 1.2rem; width: 24px; text-align: center; flex-shrink: 0;"></i>
                    <span style="line-height: 1.35;">${p.title}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                    ${capsuleBadgeHtml}
                    <i class="fa-solid ${p.file ? 'fa-chevron-down' : 'fa-up-right-from-square'} text-muted" style="transition: transform 0.3s;"></i>
                </div>
            `;

            const directLinkEl = header.querySelector('.bgn-direct-capsule-link');
            if (directLinkEl) {
                directLinkEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                });
            }

            if (!p.file && p.url) {
                header.addEventListener('click', () => {
                    window.open(p.url, '_blank', 'noopener,noreferrer');
                });
                item.appendChild(header);
                container.appendChild(item);
                return;
            }

            const contentBox = document.createElement('div');
            contentBox.className = "bgn-about-page-content";
            contentBox.style.cssText = "padding: 0 16px; max-height: 0; overflow: hidden; transition: max-height 0.4s ease, padding 0.4s ease; color: var(--text-muted); font-size: 0.85rem; line-height: 1.6;";

            let isLoaded = false;
            header.addEventListener('click', () => {
                const icon = header.querySelector('.fa-chevron-down');
                if (contentBox.style.maxHeight === '0px' || !contentBox.style.maxHeight) {
                    if (!isLoaded) {
                        const htmlBody = this._resolveStaticPageHtml(p);
                        contentBox.innerHTML = htmlBody
                            ? htmlBody
                            : `<div style="color:#ef4444; padding-bottom:10px;">${msgMaintenance}</div>`;
                        isLoaded = true;
                    }
                    contentBox.style.padding = '0 16px 18px 16px';
                    contentBox.style.maxHeight = (contentBox.scrollHeight + 320) + 'px';
                    requestAnimationFrame(() => {
                        contentBox.style.maxHeight = (contentBox.scrollHeight + 160) + 'px';
                    });
                    if (icon) icon.style.transform = 'rotate(180deg)';
                } else {
                    contentBox.style.maxHeight = '0px';
                    contentBox.style.padding = '0 16px';
                    if (icon) icon.style.transform = 'rotate(0deg)';
                }
            });

            item.appendChild(header);
            item.appendChild(contentBox);
            container.appendChild(item);
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.ContentLoader.init();
});
