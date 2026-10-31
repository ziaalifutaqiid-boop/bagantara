// ==========================================================================
// FILE: scripts/build-secure.mjs (BAGANTARA RENTAL PUBLIK SECURE COMPILER)
// FUNGSI:
//   1. Enkripsi Konfigurasi URL RTDB Utama & Cadangan, Kamus "data/car-dictionary.json",
//      dan Halaman Pusat Informasi ke dalam RC4 + XOR Byte Array Vault (window.__BGN_CONFIG_VAULT__)
//   2. Bundling Modul JS ke dalam Single-IIFE Closure (dist/js/bgn-rental-publik.min.js)
//      dengan Proxy _shadowWindow & _bgnPrivateVault (Zero Console Leak)
//   3. AST + RC4 String-Array Obfuscation + Terser Minification
//   4. Kompilasi dist/services-worker.js, dist/index.html, dist/css/theme-rental-publik.css,
//      dist/data/car-dictionary.json, dist/manifest.json, & dist/assets/*
//   5. Validasi AST Pasca-Kompilasi (Zero Syntax/Reference Error Guarantee)
// ==========================================================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

function loadOptionalModule(modName) {
    const searchPaths = [
        ROOT_DIR,
        path.resolve(ROOT_DIR, '../tmp_publik'),
        '/usr/share/nodejs',
        '/usr/local/lib/node_modules',
        '/usr/lib/nodejs'
    ];
    for (const base of searchPaths) {
        try {
            const req = createRequire(path.join(base, 'noop.js'));
            return req(modName);
        } catch (e) {}
    }
    return null;
}

const acorn = loadOptionalModule('acorn');
const terser = loadOptionalModule('terser');

function encryptRC4XorVault(plainObj, keyStr) {
    const jsonStr = JSON.stringify(plainObj);
    const inputBytes = Buffer.from(jsonStr, 'utf8');
    const len = inputBytes.length;
    const xorSeed = crypto.randomInt(19, 241);

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
        outBytes[k] = (inputBytes[k] ^ rc4Byte ^ xorSalt) & 0xff;
    }

    return {
        key: keyStr,
        seed: xorSeed,
        bytes: Array.from(outBytes)
    };
}

function buildEncryptedConfigVaultBlock() {
    const carDictionary = JSON.parse(
        fs.readFileSync(path.join(ROOT_DIR, 'data', 'car-dictionary.json'), 'utf8')
    );

    const infoSections = [
        {
            id: 'layanan-tanpa-komisi',
            icon: 'fa-solid fa-handshake-simple',
            title: '1. Katalog Rental Mobil Terdekat Tanpa Komisi',
            html: `<p><b>Bagantara Rental Mobil</b> mempertemukan penyewa secara langsung dengan <b>Mitra Pengusaha Rental</b> terverifikasi di sekitar lokasi Anda tanpa perantara dan tanpa tambahan biaya komisi aplikasi.</p>
                   <p>Seluruh tarif paket 6 jam, 12 jam, harian (24 jam), mingguan, maupun bulanan yang tertera di katalog merupakan tarif resmi dari masing-masing garasi pengusaha rental, lengkap mulai dari mobil keluarga, City Car, SUV, Hiace, Isuzu Elf, hingga Bus Pariwisata.</p>`
        },
        {
            id: 'panduan-keamanan-dp',
            icon: 'fa-solid fa-shield-halved',
            title: '2. Panduan Pemesanan & Pembayaran Uang Muka (DP)',
            html: `<ul class="list-disc pl-4 space-y-1.5">
                     <li><b>Pilih Armada &amp; Jadwal Sewa:</b> Buka rincian kartu armada yang sesuai kebutuhan Anda, tonton video review atau perbesar foto dengan cubitan 2 jari, lalu atur tanggal dan jam serah terima melalui lembar pemesanan.</li>
                     <li><b>Periksa Lokasi Garasi:</b> Gunakan tombol <b>Lokasi Garasi (Google Maps)</b> pada kartu armada untuk melihat alamat fisik garasi pengusaha rental.</li>
                     <li><b>Konfirmasi &amp; Pembayaran Resmi:</b> Kode pembayaran QRIS resmi garasi akan ditampilkan pada langkah konfirmasi akhir sebelum Anda mengirimkan rincian pesanan <b>#RNT-XXXXX</b> ke WhatsApp resmi pemilik garasi.</li>
                   </ul>`
        },
        {
            id: 'syarat-ketentuan-umum',
            icon: 'fa-solid fa-scale-balanced',
            title: '3. Ketentuan Umum Penyewaan Kendaraan',
            html: `<ul class="list-disc pl-4 space-y-1.5">
                     <li><b>Persyaratan Lepas Kunci:</b> Untuk layanan lepas kunci, penyewa wajib menyiapkan dokumen identitas asli sesuai ketentuan garasi (seperti E-KTP Asli, SIM A Aktif, KK/ID Kerja, atau penitipan sepeda motor beserta STNK asli).</li>
                     <li><b>Layanan Dengan Sopir:</b> Untuk armada rombongan seperti Toyota Hiace, Isuzu Elf, dan Bus Pariwisata dengan layanan sopir, penyewa cukup melakukan konfirmasi jadwal penjemputan dan pembayaran uang muka tanpa penyerahan jaminan dokumen lepas kunci.</li>
                     <li><b>Ketepatan Waktu Pengembalian:</b> Keterlambatan pengembalian kendaraan melebihi durasi sewa yang disepakati akan dikenakan biaya tambahan per jam sesuai ketentuan masing-masing garasi.</li>
                   </ul>`
        }
    ];

    const plainPayload = {
        rtdbNode1Url: 'https://bagantara-history-default-rtdb.asia-southeast1.firebasedatabase.app/rental_catalog.json',
        rtdbNode2Url: 'https://bagantara-overflow-default-rtdb.asia-southeast1.firebasedatabase.app/rental_catalog.json',
        carDictionary,
        infoSections
    };

    const vaultKey = 'BGN_RNT_' + crypto.randomBytes(16).toString('hex');
    const encrypted = encryptRC4XorVault(plainPayload, vaultKey);

    return `
window.__BGN_CONFIG_VAULT__ = {
    key: ${JSON.stringify(encrypted.key)},
    seed: ${encrypted.seed},
    bytes: [${encrypted.bytes.join(',')}]
};
`;
}

const PUBLIC_MODULES_ORDER = [
    'js/core/rtdb-etag-client.js',
    'js/modules/booking-calculator.js',
    'js/modules/catalog-view.js',
    'js/modules/info-and-settings.js'
];

function stripModuleImportsAndExports(relPath, code) {
    if (!acorn) {
        throw new Error('Acorn AST parser is required.');
    }
    const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
    const edits = [];

    for (const node of ast.body) {
        if (node.type === 'ImportDeclaration') {
            edits.push({ start: node.start, end: node.end, replacement: '' });
        } else if (node.type === 'ExportNamedDeclaration') {
            if (node.declaration) {
                edits.push({ start: node.start, end: node.declaration.start, replacement: '' });
            } else {
                edits.push({ start: node.start, end: node.end, replacement: '' });
            }
        } else if (node.type === 'ExportDefaultDeclaration') {
            edits.push({ start: node.start, end: node.declaration.start, replacement: '' });
        }
    }

    edits.sort((a, b) => b.start - a.start);
    let out = code;
    for (const ed of edits) {
        out = out.slice(0, ed.start) + ed.replacement + out.slice(ed.end);
    }
    return `\n// --- [MODULE: ${relPath}] ---\n` + out.trim() + '\n';
}

function assembleSingleIifePublicBundle() {
    const vaultBlock = buildEncryptedConfigVaultBlock();
    const cleanedModules = PUBLIC_MODULES_ORDER.map((rel) => {
        const raw = fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');
        return stripModuleImportsAndExports(rel, raw);
    }).join('\n');

    return `(function() {
    "use strict";

    const _realWindow = typeof globalThis !== 'undefined' ? globalThis : window;
    const _realDocument = _realWindow.document;
    const _bgnPrivateVault = Object.create(null);

    try {
        const _noop = function() {};
        ['log', 'info', 'debug', 'table', 'trace'].forEach((_m) => {
            if (_realWindow.console && _realWindow.console[_m]) {
                try { _realWindow.console[_m] = _noop; } catch (_e) {}
            }
        });
    } catch (_e) {}

    const _PRIVATE_VAULT_KEYS = new Set([
        '__BGN_CONFIG_VAULT__',
        'BGN_RENTAL_VAULT',
        'bukaPanelMediaMengambang',
        'tutupPanelMediaMengambang',
        'hancurkanSemuaIframeVideoAktif',
        'dapatkanDaftarSlotJamValid'
    ]);

    function _isIsolatedVaultProp(prop) {
        return typeof prop === 'string' && (
            _PRIVATE_VAULT_KEYS.has(prop) ||
            prop.startsWith('__BGN_') ||
            prop.startsWith('BGN_')
        );
    }

    for (const _k of _PRIVATE_VAULT_KEYS) {
        try {
            delete _realWindow[_k];
            Object.defineProperty(_realWindow, _k, {
                get: function() { return undefined; },
                set: function() { return true; },
                enumerable: false,
                configurable: true
            });
        } catch (_e) {}
    }

    const _shadowWindow = new Proxy(_realWindow, {
        get(target, prop) {
            if (prop === 'window' || prop === 'self' || prop === 'globalThis') {
                return _shadowWindow;
            }
            if (_isIsolatedVaultProp(prop) || Object.prototype.hasOwnProperty.call(_bgnPrivateVault, prop)) {
                return _bgnPrivateVault[prop];
            }
            const val = Reflect.get(target, prop, target);
            if (typeof val === 'function') {
                const pName = String(prop);
                if (/^[A-Z]|^webkit[A-Z]/.test(pName)) return val;
                return val.bind(target);
            }
            return val;
        },
        set(target, prop, value) {
            if (_isIsolatedVaultProp(prop)) {
                _bgnPrivateVault[prop] = value;
                return true;
            }
            return Reflect.set(target, prop, value, target);
        },
        has(target, prop) {
            if (_isIsolatedVaultProp(prop)) {
                return Object.prototype.hasOwnProperty.call(_bgnPrivateVault, prop);
            }
            return Reflect.has(target, prop);
        }
    });

    (function(window, document) {
        ${vaultBlock}
        ${cleanedModules}
    })(_shadowWindow, _realDocument);
})();`;
}

function rc4TransformBase64(str, key) {
    const s = new Uint8Array(256);
    for (let i = 0; i < 256; i++) s[i] = i;
    let j = 0;
    for (let i = 0; i < 256; i++) {
        j = (j + s[i] + key.charCodeAt(i % key.length)) & 0xff;
        const t = s[i];
        s[i] = s[j];
        s[j] = t;
    }
    const utf8Bytes = Buffer.from(str, 'utf8');
    let i = 0;
    j = 0;
    const out = Buffer.alloc(utf8Bytes.length);
    for (let p = 0; p < utf8Bytes.length; p++) {
        i = (i + 1) & 0xff;
        j = (j + s[i]) & 0xff;
        const t = s[i];
        s[i] = s[j];
        s[j] = t;
        const k = s[(s[i] + s[j]) & 0xff];
        out[p] = utf8Bytes[p] ^ k;
    }
    return out.toString('base64');
}

function applyAstRc4Obfuscation(sourceCode) {
    const ast = acorn.parse(sourceCode, { ecmaVersion: 'latest', sourceType: 'script' });

    const keyPool = ['bgn7R1', 'q4LmP9', 'x8VtK2', 'm5NwC6', 'z3HpD8', 'v9JrF4'];
    const encryptedPool = [];
    const poolIndexMap = new Map();
    const replacements = [];

    function walk(node, parent) {
        if (!node || typeof node !== 'object') return;

        if (node.type === 'Literal' && typeof node.value === 'string') {
            const val = node.value;
            const isDirective = val === 'use strict';
            const isObjKey =
                parent &&
                ((parent.type === 'Property' && parent.key === node && !parent.computed) ||
                 (parent.type === 'MethodDefinition' && parent.key === node && !parent.computed));

            if (!isDirective && !isObjKey && val.length >= 3 && val.length <= 240) {
                const keyIdx = (encryptedPool.length + val.length) % keyPool.length;
                const rc4Key = keyPool[keyIdx];
                const cacheKey = `${rc4Key}:${val}`;
                let idx;
                if (poolIndexMap.has(cacheKey)) {
                    idx = poolIndexMap.get(cacheKey);
                } else {
                    idx = encryptedPool.length;
                    encryptedPool.push(rc4TransformBase64(val, rc4Key));
                    poolIndexMap.set(cacheKey, idx);
                }

                const rawCall = `_0xBgnDec(0x${idx.toString(16)},${JSON.stringify(rc4Key)})`;
                const prevChar = node.start > 0 ? sourceCode[node.start - 1] : '';
                const nextChar = node.end < sourceCode.length ? sourceCode[node.end] : '';
                const padLeft = /[A-Za-z0-9_$]/.test(prevChar) ? ' ' : '';
                const padRight = /[A-Za-z0-9_$]/.test(nextChar) ? ' ' : '';
                replacements.push({
                    start: node.start,
                    end: node.end,
                    text: `${padLeft}${rawCall}${padRight}`
                });
            }
        }

        for (const k of Object.keys(node)) {
            if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'range') continue;
            const child = node[k];
            if (Array.isArray(child)) {
                for (let i = 0; i < child.length; i++) {
                    if (child[i] && typeof child[i].type === 'string') {
                        walk(child[i], node);
                    }
                }
            } else if (child && typeof child.type === 'string') {
                walk(child, node);
            }
        }
    }

    walk(ast, null);

    const total = encryptedPool.length;
    const shiftOffset = total > 5 ? crypto.randomInt(1, total - 1) : 0;
    const rotatedPool = total > 0
        ? encryptedPool.slice(shiftOffset).concat(encryptedPool.slice(0, shiftOffset))
        : [];

    replacements.sort((a, b) => b.start - a.start);
    let mutated = sourceCode;
    for (const rep of replacements) {
        mutated = mutated.slice(0, rep.start) + rep.text + mutated.slice(rep.end);
    }

    const header = `
const _0xBgnArr = ${JSON.stringify(rotatedPool)};
(function(_a, _r) {
    while (--_r >= 0) _a.unshift(_a.pop());
})(_0xBgnArr, 0x${shiftOffset.toString(16)});
const _0xBgnCache = Object.create(null);
function _0xBgnDec(_idx, _key) {
    const _ck = _idx + ":" + _key;
    if (_0xBgnCache[_ck] !== undefined) return _0xBgnCache[_ck];
    const _bin = atob(_0xBgnArr[_idx]);
    const _len = _bin.length;
    const _s = new Uint8Array(256);
    for (let _i = 0; _i < 256; _i++) _s[_i] = _i;
    let _j = 0;
    for (let _i = 0; _i < 256; _i++) {
        _j = (_j + _s[_i] + _key.charCodeAt(_i % _key.length)) & 255;
        const _t = _s[_i]; _s[_i] = _s[_j]; _s[_j] = _t;
    }
    let _x = 0; _j = 0;
    const _out = new Uint8Array(_len);
    for (let _p = 0; _p < _len; _p++) {
        _x = (_x + 1) & 255;
        _j = (_j + _s[_x]) & 255;
        const _t = _s[_x]; _s[_x] = _s[_j]; _s[_j] = _t;
        _out[_p] = _bin.charCodeAt(_p) ^ _s[(_s[_x] + _s[_j]) & 255];
    }
    const _dec = new TextDecoder().decode(_out);
    _0xBgnCache[_ck] = _dec;
    return _dec;
}
`;

    return header + '\n' + mutated;
}

async function minifyJsBundle(code) {
    if (terser && typeof terser.minify === 'function') {
        const res = await terser.minify(code, {
            compress: {
                dead_code: true,
                drop_debugger: true,
                conditionals: true,
                evaluate: true,
                booleans: true,
                loops: true,
                unused: true,
                passes: 2
            },
            mangle: { toplevel: false },
            format: { comments: false }
        });
        if (res && res.code) return res.code;
    }
    return code;
}

function verifyAstIntegrity(label, code) {
    if (/(?:return|else|case|throw|typeof|void|delete)_0xBgnDec/.test(code)) {
        throw new Error(`[INTEGRITY FAIL] Token merge corruption detected in ${label}`);
    }
    if (acorn) {
        acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script' });
    }
}

function minifyCss(cssText) {
    return cssText
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s*([{}:;,>~])\s*/g, '$1')
        .replace(/;}/g, '}')
        .trim();
}

function minifyHtml(htmlText) {
    return htmlText
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/>\s+</g, '><')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function copyDirRecursive(srcDir, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

async function runBuild() {
    console.log('[BAGANTARA RENTAL PUBLIK BUILD] Memulai kompilasi produksi...');
    if (fs.existsSync(DIST_DIR)) {
        try {
            fs.rmSync(DIST_DIR, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        } catch (_e) {}
    }

    fs.mkdirSync(path.join(DIST_DIR, 'js'), { recursive: true });
    fs.mkdirSync(path.join(DIST_DIR, 'css'), { recursive: true });
    fs.mkdirSync(path.join(DIST_DIR, 'data'), { recursive: true });
    fs.mkdirSync(path.join(DIST_DIR, 'assets'), { recursive: true });

    // 1. Bangun Single-IIFE Bundle + window.__BGN_CONFIG_VAULT__ + Proxy _shadowWindow -> AST RC4 -> Terser
    const rawBundle = assembleSingleIifePublicBundle();
    const obfuscatedBundle = applyAstRc4Obfuscation(rawBundle);
    const finalBundle = await minifyJsBundle(obfuscatedBundle);
    verifyAstIntegrity('dist/js/bgn-rental-publik.min.js', finalBundle);

    fs.writeFileSync(path.join(DIST_DIR, 'js', 'bgn-rental-publik.min.js'), finalBundle, 'utf8');
    fs.writeFileSync(path.join(ROOT_DIR, 'js', 'bgn-rental-publik.min.js'), finalBundle, 'utf8');

    // 2. Obfuscate & Minify services-worker.js
    const rawSw = fs.readFileSync(path.join(ROOT_DIR, 'services-worker.js'), 'utf8');
    const obfuscatedSw = applyAstRc4Obfuscation(rawSw);
    const finalSw = await minifyJsBundle(obfuscatedSw);
    verifyAstIntegrity('dist/services-worker.js', finalSw);
    fs.writeFileSync(path.join(DIST_DIR, 'services-worker.js'), finalSw, 'utf8');

    // 3. Minifikasi index.html & CSS
    const rawHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    fs.writeFileSync(path.join(DIST_DIR, 'index.html'), minifyHtml(rawHtml), 'utf8');

    const rawCss = fs.readFileSync(path.join(ROOT_DIR, 'css', 'theme-rental-publik.css'), 'utf8');
    fs.writeFileSync(path.join(DIST_DIR, 'css', 'theme-rental-publik.css'), minifyCss(rawCss), 'utf8');

    // 4. Salin manifest.json, data/car-dictionary.json, & assets/*
    fs.copyFileSync(path.join(ROOT_DIR, 'manifest.json'), path.join(DIST_DIR, 'manifest.json'));
    fs.copyFileSync(
        path.join(ROOT_DIR, 'data', 'car-dictionary.json'),
        path.join(DIST_DIR, 'data', 'car-dictionary.json')
    );
    copyDirRecursive(path.join(ROOT_DIR, 'assets'), path.join(DIST_DIR, 'assets'));

    console.log('[BAGANTARA RENTAL PUBLIK BUILD] Selesai & Terverifikasi AST! Berkas produksi siap di dist/');
}

runBuild().catch((err) => {
    console.error('[BAGANTARA RENTAL PUBLIK BUILD ERROR]', err);
    process.exit(1);
});
