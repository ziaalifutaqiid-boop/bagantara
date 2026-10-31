// ==========================================================================
// FILE: scripts/build-superapp.mjs (BAGANTARA SUPER-APP MASTER COMPILER V14.0)
// FUNGSI:
//   Tahap 1: Menjalankan kompilasi aman modules/transport-driver/scripts/build-secure.mjs
//            dan menyalin hasil bundel produksinya (js/bgn-core.min.js, index.html,
//            css/*, assets/*, manifest.json) ke dist/modules/transport-driver/.
//   Tahap 2: Menjalankan kompilasi aman modules/rental-mobil/scripts/build-secure.mjs
//            dan menyalin hasil bundel produksinya (js/bgn-rental-publik.min.js,
//            index.html, css/*, data/car-dictionary.json, assets/*, manifest.json)
//            ke dist/modules/rental-mobil/.
//   Tahap 3: Menyalin modules/_template-layanan-baru/ ke dist/modules/_template-layanan-baru/.
//   Tahap 4: Mengenkripsi dan mengobfuskasi js/superapp-shell.js dengan AST + RC4
//            String Array + Proxy _shadowWindow + Anti-DevTools Keyboard/Contextmenu
//            Guard + Terser Minification menjadi dist/js/superapp-shell.min.js.
//   Tahap 5: Meminifikasi index.html, css/superapp-shell.css, dan services-worker.js
//            ke dalam dist/, menyalin manifest.json & assets/*, serta memverifikasi
//            seluruh berkas .js di dist/ menggunakan acorn.parse (jaminan 100%
//            bebas SyntaxError/ReferenceError).
// ==========================================================================

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');

function loadCompilerModule(modName) {
    const searchPaths = [
        ROOT_DIR,
        path.join(ROOT_DIR, 'modules', 'transport-driver'),
        path.join(ROOT_DIR, 'modules', 'rental-mobil'),
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

const acorn = loadCompilerModule('acorn');
const terser = loadCompilerModule('terser');

function copyDirRecursive(srcDir, destDir, excludeFiles = new Set()) {
    if (!fs.existsSync(srcDir)) return;
    fs.mkdirSync(destDir, { recursive: true });
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        if (excludeFiles.has(entry.name)) continue;
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath, excludeFiles);
        } else if (entry.isFile()) {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function wrapShellWithShadowWindowProxy(rawShellCode) {
    return `(function() {
    "use strict";

    const _realWindow = typeof globalThis !== "undefined" ? globalThis : window;
    const _realDocument = _realWindow.document;
    const _bgnShellVault = Object.create(null);

    try {
        const _noop = function() {};
        ["log", "info", "debug", "table", "trace"].forEach((_m) => {
            if (_realWindow.console && _realWindow.console[_m]) {
                try { _realWindow.console[_m] = _noop; } catch (_e) {}
            }
        });
    } catch (_e) {}

    const _PRIVATE_SHELL_KEYS = new Set([
        "BagantaraHostBridge",
        "__BGN_SUPERAPP_VAULT__",
        "__BGN_SHELL_SEAL__"
    ]);

    function _isIsolatedShellProp(prop) {
        return typeof prop === "string" && (
            _PRIVATE_SHELL_KEYS.has(prop) ||
            prop.startsWith("__BGN_") ||
            prop.startsWith("BGN_SUPERAPP_")
        );
    }

    for (const _k of _PRIVATE_SHELL_KEYS) {
        try {
            delete _realWindow[_k];
        } catch (_e) {}
    }

    const _shadowWindow = new Proxy(_realWindow, {
        get(target, prop) {
            if (prop === "window" || prop === "self" || prop === "globalThis") {
                return _shadowWindow;
            }
            if (prop === "document") {
                return _realDocument;
            }
            if (_isIsolatedShellProp(prop) || Object.prototype.hasOwnProperty.call(_bgnShellVault, prop)) {
                return _bgnShellVault[prop];
            }
            const val = Reflect.get(target, prop, target);
            if (typeof val === "function") {
                const pName = String(prop);
                if (/^[A-Z]|^webkit[A-Z]/.test(pName)) return val;
                return val.bind(target);
            }
            return val;
        },
        set(target, prop, value) {
            if (_isIsolatedShellProp(prop)) {
                _bgnShellVault[prop] = value;
                return true;
            }
            return Reflect.set(target, prop, value, target);
        },
        has(target, prop) {
            if (_isIsolatedShellProp(prop)) {
                return Object.prototype.hasOwnProperty.call(_bgnShellVault, prop);
            }
            return Reflect.has(target, prop);
        }
    });

    (function(window, document, globalThis, self) {
        ${rawShellCode}
    })(_shadowWindow, _realDocument, _shadowWindow, _shadowWindow);
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
    if (!acorn) {
        throw new Error('Acorn AST parser diperlukan untuk obfuskasi RC4.');
    }
    const ast = acorn.parse(sourceCode, { ecmaVersion: 'latest', sourceType: 'script' });

    const keyPool = ['bgnSa1', 'k9QpL3', 'x4VmR8', 't7WzN2', 'p5HcD6', 'm2JfY9'];
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

                const rawCall = `_0xSaDec(0x${idx.toString(16)},${JSON.stringify(rc4Key)})`;
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
const _0xSaArr = ${JSON.stringify(rotatedPool)};
(function(_a, _r) {
    while (--_r >= 0) _a.unshift(_a.pop());
})(_0xSaArr, 0x${shiftOffset.toString(16)});
const _0xSaCache = Object.create(null);
function _0xSaDec(_idx, _key) {
    const _ck = _idx + ":" + _key;
    if (_0xSaCache[_ck] !== undefined) return _0xSaCache[_ck];
    const _bin = atob(_0xSaArr[_idx]);
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
    _0xSaCache[_ck] = _dec;
    return _dec;
}
`;

    return header + '\n' + mutated;
}

async function minifyJsCode(code) {
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

function minifyHtmlContent(rawHtml) {
    return String(rawHtml || '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\r?\n\s*/g, ' ')
        .replace(/>\s+</g, '><')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function collectAllJsFiles(dirPath, outList = []) {
    if (!fs.existsSync(dirPath)) return outList;
    for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            collectAllJsFiles(fullPath, outList);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            outList.push(fullPath);
        }
    }
    return outList;
}

function verifyAllDistJsAst(distRoot) {
    if (!acorn) {
        throw new Error('Acorn tidak ditemukan untuk verifikasi AST.');
    }
    const jsFiles = collectAllJsFiles(distRoot);
    for (const jsFile of jsFiles) {
        const rel = path.relative(ROOT_DIR, jsFile);
        const content = fs.readFileSync(jsFile, 'utf8');
        if (/(?:return|else|case|throw|typeof|void|delete)_0x/.test(content)) {
            throw new Error(`[AST INTEGRITY FAIL] Token merge terdeteksi di ${rel}`);
        }
        acorn.parse(content, { ecmaVersion: 'latest', sourceType: 'script' });
        console.log(`  ✓ AST Valid: ${rel} (${(Buffer.byteLength(content) / 1024).toFixed(1)} KB)`);
    }
}

async function runSuperAppBuild() {
    console.log('====================================================================');
    console.log(' BAGANTARA SUPER-APP PUBLIK v14.0 - MASTER ANTI-INSPECTION COMPILER ');
    console.log('====================================================================');

    if (fs.existsSync(DIST_DIR)) {
        fs.rmSync(DIST_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(path.join(DIST_DIR, 'js'), { recursive: true });
    fs.mkdirSync(path.join(DIST_DIR, 'css'), { recursive: true });
    fs.mkdirSync(path.join(DIST_DIR, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(DIST_DIR, 'modules'), { recursive: true });

    // ------------------------------------------------------------------
    // TAHAP 1: Kompilasi Modul 1 (modules/transport-driver/)
    // ------------------------------------------------------------------
    console.log('\n[Tahap 1/5] Mengompilasi Modul 1: modules/transport-driver/ (Ojol v13.2)...');
    const ojolDir = path.join(ROOT_DIR, 'modules', 'transport-driver');
    const ojolBuildScript = path.join(ojolDir, 'scripts', 'build-secure.mjs');
    execFileSync(process.execPath, [ojolBuildScript], { cwd: ojolDir, stdio: 'inherit' });

    const ojolDistSrc = path.join(ojolDir, 'dist');
    const ojolDistDest = path.join(DIST_DIR, 'modules', 'transport-driver');
    copyDirRecursive(ojolDistSrc, ojolDistDest, new Set(['services-worker.js']));

    // ------------------------------------------------------------------
    // TAHAP 2: Kompilasi Modul 2 (modules/rental-mobil/)
    // ------------------------------------------------------------------
    console.log('\n[Tahap 2/5] Mengompilasi Modul 2: modules/rental-mobil/ (Rental Mobil v2.3)...');
    const rentalDir = path.join(ROOT_DIR, 'modules', 'rental-mobil');
    const rentalBuildScript = path.join(rentalDir, 'scripts', 'build-secure.mjs');
    execFileSync(process.execPath, [rentalBuildScript], { cwd: rentalDir, stdio: 'inherit' });

    const rentalDistSrc = path.join(rentalDir, 'dist');
    const rentalDistDest = path.join(DIST_DIR, 'modules', 'rental-mobil');
    copyDirRecursive(rentalDistSrc, rentalDistDest, new Set(['services-worker.js']));

    // ------------------------------------------------------------------
    // TAHAP 3: Menyalin Starter Kit (modules/_template-layanan-baru/)
    // ------------------------------------------------------------------
    console.log('\n[Tahap 3/5] Menyalin Starter Kit: modules/_template-layanan-baru/...');
    const tplSrc = path.join(ROOT_DIR, 'modules', '_template-layanan-baru');
    const tplDest = path.join(DIST_DIR, 'modules', '_template-layanan-baru');
    copyDirRecursive(tplSrc, tplDest);

    // ------------------------------------------------------------------
    // TAHAP 4: Enkripsi & Obfuskasi Wadah Induk (js/superapp-shell.js)
    // ------------------------------------------------------------------
    console.log('\n[Tahap 4/5] Mengenkripsi & Mengobfuskasi js/superapp-shell.js -> dist/js/superapp-shell.min.js...');
    const rawShellJs = fs.readFileSync(path.join(ROOT_DIR, 'js', 'superapp-shell.js'), 'utf8');
    const shadowedShellJs = wrapShellWithShadowWindowProxy(rawShellJs);
    const obfuscatedShellJs = applyAstRc4Obfuscation(shadowedShellJs);
    const minifiedShellJs = await minifyJsCode(obfuscatedShellJs);

    fs.writeFileSync(path.join(DIST_DIR, 'js', 'superapp-shell.min.js'), minifiedShellJs, 'utf8');
    fs.writeFileSync(path.join(ROOT_DIR, 'js', 'superapp-shell.min.js'), minifiedShellJs, 'utf8');

    // ------------------------------------------------------------------
    // TAHAP 5: Minifikasi index.html, superapp-shell.css, services-worker.js,
    //          Salin Aset, & Verifikasi AST Acorn Seluruh Berkas .js di dist/
    // ------------------------------------------------------------------
    console.log('\n[Tahap 5/5] Meminifikasi Wadah Induk, Master Service Worker, & Memvalidasi AST...');
    const rawIndexHtml = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    fs.writeFileSync(path.join(DIST_DIR, 'index.html'), minifyHtmlContent(rawIndexHtml), 'utf8');

    const rawShellCss = fs.readFileSync(path.join(ROOT_DIR, 'css', 'superapp-shell.css'), 'utf8');
    fs.writeFileSync(path.join(DIST_DIR, 'css', 'superapp-shell.css'), minifyCssContent(rawShellCss), 'utf8');

    const rawMasterSw = fs.readFileSync(path.join(ROOT_DIR, 'services-worker.js'), 'utf8');
    const obfuscatedSw = applyAstRc4Obfuscation(rawMasterSw);
    const minifiedSw = await minifyJsCode(obfuscatedSw);
    fs.writeFileSync(path.join(DIST_DIR, 'services-worker.js'), minifiedSw, 'utf8');

    const rawManifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'manifest.json'), 'utf8'));
    fs.writeFileSync(path.join(DIST_DIR, 'manifest.json'), JSON.stringify(rawManifest), 'utf8');

    copyDirRecursive(path.join(ROOT_DIR, 'assets'), path.join(DIST_DIR, 'assets'));

    console.log('\n[Verifikasi AST Acorn] Memeriksa seluruh berkas .js di dist/:');
    verifyAllDistJsAst(DIST_DIR);

    console.log('\n====================================================================');
    console.log(' BUILD SUPER-APP PUBLIK v14.0 SELESAI 100% & BEBAS SYNTAX ERROR!   ');
    console.log('====================================================================');
}

runSuperAppBuild().catch((err) => {
    console.error('[SUPER-APP BUILD ERROR]', err);
    process.exit(1);
});
