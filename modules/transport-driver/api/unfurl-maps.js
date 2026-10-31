// ==========================================================================
// FILE: api/unfurl-maps.js (VERCEL SERVERLESS FUNCTION - BAGANTARA PUBLIK V12.0)
// FUNGSI: 1. Pengurai Tautan Pendek Google Maps (maps.app.goo.gl / goo.gl/maps) Presisi Tinggi
//         2. Fallback Server-to-Server ke Google Apps Script (process.env.BGN_GAS_UNFURL_URL)
//            agar URL GAS tidak pernah terekspos di sisi klien/browser.
// ==========================================================================

const DEFAULT_SERVER_GAS_UNFURL_URL = 'https://script.google.com/macros/s/AKfycbxkSFTmerLbUa5iEWEqyjUz9OVBo8xTznm90HJMKDRBQ9t-x8UxjUHas_K1JqqMgHzneg/exec';

function isValidIndonesiaCoord(lat, lng) {
    return (
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        !isNaN(lat) &&
        !isNaN(lng) &&
        lat >= -11.5 &&
        lat <= 6.5 &&
        lng >= 94.5 &&
        lng <= 141.5
    );
}

function decodePreservingPlusCode(rawStr) {
    if (!rawStr || typeof rawStr !== 'string') return '';
    const protectedStr = rawStr
        .replace(/%2B/gi, '+')
        .replace(/([23456789CFGHJMPQRVWX]{4,8})\+([23456789CFGHJMPQRVWX]{2,3})/gi, '$1__BGN_OLC_PLUS__$2');
    let decoded = protectedStr.replace(/\+/g, ' ');
    try {
        decoded = decodeURIComponent(decoded);
    } catch (e) {}
    return decoded
        .replace(/__BGN_OLC_PLUS__/g, '+')
        .replace(/(^|[\s,/(\[])([23456789CFGHJMPQRVWX]{4,8})\s+([23456789CFGHJMPQRVWX]{2,3})(?=$|[\s,.)\]])/gi, '$1$2+$3');
}

function extractPlaceNameFromUrlOrHtml(decodedUrl, htmlBody = '') {
    let placeName = '';

    const placeMatch = decodedUrl.match(/\/maps\/(?:place|search)\/([^/@?]+)/i);
    if (placeMatch && placeMatch[1]) {
        const candidate = decodePreservingPlusCode(placeMatch[1]).trim()
            .replace(/^([23456789CFGHJMPQRVWX]{4,8})\s+([23456789CFGHJMPQRVWX]{2,3})\b/i, '$1+$2');
        if (!/^-?\d+\.\d+\s*,\s*\d+\.\d+$/.test(candidate)) {
            placeName = candidate;
        }
    }

    if (!placeName) {
        const qMatch = decodedUrl.match(/[?&](?:q|query)=([^&]+)/i);
        if (qMatch && qMatch[1]) {
            try {
                const qDecoded = decodePreservingPlusCode(qMatch[1]).trim()
                    .replace(/^([23456789CFGHJMPQRVWX]{4,8})\s+([23456789CFGHJMPQRVWX]{2,3})\b/i, '$1+$2');
                if (qDecoded && !/^-?\d+\.\d+\s*,\s*\d+\.\d+$/.test(qDecoded) && !/^https?:\/\//i.test(qDecoded)) {
                    placeName = qDecoded;
                }
            } catch (e) {}
        }
    }

    if (!placeName && htmlBody) {
        const ogTitleMatch = htmlBody.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)
            || htmlBody.match(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i)
            || htmlBody.match(/<title>([^<]+)<\/title>/i);
        if (ogTitleMatch && ogTitleMatch[1]) {
            const rawTitle = ogTitleMatch[1]
                .replace(/\s*·.*$/i, '')
                .replace(/\s*-\s*Google\s+Maps.*$/i, '')
                .replace(/&#39;/g, "'")
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&')
                .trim()
                .replace(/^([23456789CFGHJMPQRVWX]{4,8})\s+([23456789CFGHJMPQRVWX]{2,3})\b/i, '$1+$2');
            if (rawTitle && rawTitle.toLowerCase() !== 'google maps') {
                placeName = rawTitle;
            }
        }
    }

    return placeName;
}

function extractBestCoordsAndName(finalUrl, htmlBody = '') {
    let decodedUrl = finalUrl || '';
    try {
        decodedUrl = decodePreservingPlusCode(finalUrl);
    } catch (e) {
        decodedUrl = finalUrl || '';
    }

    const isDirectionsUrl = /\/maps\/dir\//i.test(decodedUrl);
    const placeName = extractPlaceNameFromUrlOrHtml(decodedUrl, htmlBody);

    // PRIORITAS 1: Pin Eksak !3d<lat>!4d<lng> di URL
    const all3dUrl = [...decodedUrl.matchAll(/!3d(-?\d{1,2}\.\d{3,15})!4d(\d{2,3}\.\d{3,15})/g)];
    if (all3dUrl.length > 0) {
        const targetHit = isDirectionsUrl ? all3dUrl[all3dUrl.length - 1] : all3dUrl[0];
        const lat = parseFloat(targetHit[1]);
        const lng = parseFloat(targetHit[2]);
        if (isValidIndonesiaCoord(lat, lng)) {
            return { lat, lng, name: placeName, method: 'URL_PIN_3D4D', accuracyLevel: 'EXACT' };
        }
    }

    // Format Protobuf !2d<lng>!3d<lat>
    const all2d3dUrl = [...decodedUrl.matchAll(/!2d(\d{2,3}\.\d{3,15})!3d(-?\d{1,2}\.\d{3,15})/g)];
    if (all2d3dUrl.length > 0) {
        const targetHit = isDirectionsUrl ? all2d3dUrl[all2d3dUrl.length - 1] : all2d3dUrl[0];
        const lng = parseFloat(targetHit[1]);
        const lat = parseFloat(targetHit[2]);
        if (isValidIndonesiaCoord(lat, lng)) {
            return { lat, lng, name: placeName, method: 'URL_PIN_2D3D', accuracyLevel: 'EXACT' };
        }
    }

    // PRIORITAS 2: Parameter Koordinat Eksplisit (?q=, ?query=, ?ll=, ?sll=, ?daddr=, ?destination=, ?center=, /maps/search/, /maps/place/)
    const explicitPatterns = [
        /[?&](?:q|query|ll|sll|daddr|destination|saddr|center)=(-?\d{1,2}\.\d{3,15})\s*,\s*(\d{2,3}\.\d{3,15})/i,
        /\/maps\/(?:search|place)\/(-?\d{1,2}\.\d{3,15})\s*,\s*(\d{2,3}\.\d{3,15})/i
    ];
    for (const pat of explicitPatterns) {
        const m = decodedUrl.match(pat);
        if (m) {
            const lat = parseFloat(m[1]);
            const lng = parseFloat(m[2]);
            if (isValidIndonesiaCoord(lat, lng)) {
                return { lat, lng, name: placeName, method: 'URL_EXPLICIT_QUERY', accuracyLevel: 'EXACT' };
            }
        }
    }

    // PRIORITAS 3: Ekstraksi dari HTML Body (Meta og:image staticmap?center=lat,lng atau Pin Pertama !3d!4d di HTML)
    if (htmlBody) {
        let decodedHtml = htmlBody;
        try {
            decodedHtml = htmlBody.replace(/%2C/gi, ',').replace(/\\u0026/g, '&').replace(/&amp;/g, '&');
        } catch (e) {}

        // 3A. Meta staticmap center atau markers
        const staticMapMatch = decodedHtml.match(/staticmap\?[^"']*?(?:center|markers)=(-?\d{1,2}\.\d{3,15})\s*,\s*(\d{2,3}\.\d{3,15})/i);
        if (staticMapMatch) {
            const lat = parseFloat(staticMapMatch[1]);
            const lng = parseFloat(staticMapMatch[2]);
            if (isValidIndonesiaCoord(lat, lng)) {
                return { lat, lng, name: placeName, method: 'HTML_STATICMAP_PIN', accuracyLevel: 'EXACT' };
            }
        }

        // 3B. !3d<lat>!4d<lng> di dalam HTML Google Maps (Ambil index 0 = tempat utama)
        const all3dHtml = [...decodedHtml.matchAll(/!3d(-?\d{1,2}\.\d{3,15})!4d(\d{2,3}\.\d{3,15})/g)];
        if (all3dHtml.length > 0) {
            const firstHit = all3dHtml[0];
            const lat = parseFloat(firstHit[1]);
            const lng = parseFloat(firstHit[2]);
            if (isValidIndonesiaCoord(lat, lng)) {
                return { lat, lng, name: placeName, method: 'HTML_PIN_3D4D', accuracyLevel: 'EXACT' };
            }
        }

        // 3C. !2d<lng>!3d<lat> di dalam HTML Google Maps (Ambil index 0)
        const all2d3dHtml = [...decodedHtml.matchAll(/!2d(\d{2,3}\.\d{3,15})!3d(-?\d{1,2}\.\d{3,15})/g)];
        if (all2d3dHtml.length > 0) {
            const firstHit = all2d3dHtml[0];
            const lng = parseFloat(firstHit[1]);
            const lat = parseFloat(firstHit[2]);
            if (isValidIndonesiaCoord(lat, lng)) {
                return { lat, lng, name: placeName, method: 'HTML_PIN_2D3D', accuracyLevel: 'EXACT' };
            }
        }

        // 3D. Koordinat dalam APP_INITIALIZATION_STATE [null,null,lat,lng]
        const initStateMatch = decodedHtml.match(/\[null\s*,\s*null\s*,\s*(-?\d{1,2}\.\d{4,15})\s*,\s*(\d{2,3}\.\d{4,15})\]/);
        if (initStateMatch) {
            const lat = parseFloat(initStateMatch[1]);
            const lng = parseFloat(initStateMatch[2]);
            if (isValidIndonesiaCoord(lat, lng)) {
                return { lat, lng, name: placeName, method: 'HTML_INIT_STATE', accuracyLevel: 'VIEWPORT' };
            }
        }
    }

    // PRIORITAS 4: Koordinat @lat,lng pada URL (Viewport/Kamera)
    const matchAt = decodedUrl.match(/@(-?\d{1,2}\.\d{3,15})\s*,\s*(\d{2,3}\.\d{3,15})/);
    if (matchAt) {
        const lat = parseFloat(matchAt[1]);
        const lng = parseFloat(matchAt[2]);
        if (isValidIndonesiaCoord(lat, lng)) {
            return { lat, lng, name: placeName, method: 'URL_AT_VIEWPORT', accuracyLevel: 'VIEWPORT' };
        }
    }

    return { lat: null, lng: null, name: placeName, method: 'UNRESOLVED', accuracyLevel: 'APPROX_TEXT' };
}

async function fallbackUnfurlViaGAS(shortUrl) {
    const gasUnfurlUrl = (process.env.BGN_GAS_UNFURL_URL || process.env.BGT_GAS_BACKEND_URL || DEFAULT_SERVER_GAS_UNFURL_URL).trim();
    if (!gasUnfurlUrl) return null;

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 5500);
    try {
        const sep = gasUnfurlUrl.includes('?') ? '&' : '?';
        const endpoint = `${gasUnfurlUrl}${sep}action=unfurl&url=${encodeURIComponent(shortUrl)}`;
        const gasRes = await fetch(endpoint, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal
        });
        clearTimeout(tid);
        if (!gasRes.ok) return null;

        const gasData = await gasRes.json();
        if (!gasData) return null;

        const gLat = parseFloat(gasData.lat);
        const gLng = parseFloat(gasData.lng);
        if (isValidIndonesiaCoord(gLat, gLng)) {
            return {
                ok: true,
                resolvedUrl: gasData.finalUrl || gasData.resolvedUrl || shortUrl,
                finalUrl: gasData.finalUrl || gasData.resolvedUrl || shortUrl,
                lat: gLat,
                lng: gLng,
                name: gasData.name || '',
                method: gasData.method || 'GAS_SERVER_FALLBACK_PIN',
                accuracyLevel: gasData.accuracyLevel || 'EXACT'
            };
        }

        if (gasData.finalUrl) {
            const parsedFromGasUrl = extractBestCoordsAndName(gasData.finalUrl, '');
            if (isValidIndonesiaCoord(parsedFromGasUrl.lat, parsedFromGasUrl.lng)) {
                return {
                    ok: true,
                    resolvedUrl: gasData.finalUrl,
                    finalUrl: gasData.finalUrl,
                    lat: parsedFromGasUrl.lat,
                    lng: parsedFromGasUrl.lng,
                    name: gasData.name || parsedFromGasUrl.name || '',
                    method: parsedFromGasUrl.method || 'GAS_SERVER_REDIRECT_PARSED',
                    accuracyLevel: parsedFromGasUrl.accuracyLevel || 'EXACT'
                };
            }
            return {
                ok: true,
                resolvedUrl: gasData.finalUrl,
                finalUrl: gasData.finalUrl,
                lat: null,
                lng: null,
                name: gasData.name || parsedFromGasUrl.name || '',
                method: 'GAS_SERVER_UNRESOLVED_COORD',
                accuracyLevel: 'APPROX_TEXT'
            };
        }
        return null;
    } catch (e) {
        clearTimeout(tid);
        return null;
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-BGN-Client-Token');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const shortUrl = (req.query?.url || req.body?.url || '').toString().trim();
    if (!shortUrl) {
        return res.status(400).json({ ok: false, error: 'Parameter url diperlukan' });
    }

    // Validasi domain tautan agar tidak disalahgunakan sebagai open proxy (SSRF protection)
    if (!/^https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|(?:www\.)?google\.[a-z.]+\/maps)/i.test(shortUrl)) {
        return res.status(400).json({ ok: false, error: 'Hanya tautan Google Maps resmi yang diizinkan' });
    }

    let directResult = null;
    try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 4500);
        const response = await fetch(shortUrl, {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8'
            }
        });
        clearTimeout(tid);

        const finalUrl = response.url || shortUrl;
        let htmlSnippet = '';
        try {
            const rawText = await response.text();
            htmlSnippet = rawText ? rawText.substring(0, 180000) : '';
        } catch (e) {}

        let effectiveUrl = finalUrl;
        if (htmlSnippet && /goo\.gl/i.test(effectiveUrl)) {
            const metaRefresh = htmlSnippet.match(/url=([^"'>\s]+)/i);
            if (metaRefresh && metaRefresh[1] && metaRefresh[1].startsWith('http')) {
                effectiveUrl = metaRefresh[1].replace(/&amp;/g, '&');
            }
        }

        const extracted = extractBestCoordsAndName(effectiveUrl, htmlSnippet);
        directResult = {
            ok: true,
            resolvedUrl: effectiveUrl,
            finalUrl: effectiveUrl,
            lat: extracted.lat,
            lng: extracted.lng,
            name: extracted.name || '',
            method: extracted.method,
            accuracyLevel: extracted.accuracyLevel
        };

        if (isValidIndonesiaCoord(directResult.lat, directResult.lng)) {
            return res.status(200).json(directResult);
        }
    } catch (err) {
        // Lanjut ke fallback server-to-server GAS jika fetch langsung gagal/timeout
    }

    // FALLBACK SERVER-TO-SERVER KE GOOGLE APPS SCRIPT (process.env.BGN_GAS_UNFURL_URL)
    const gasFallbackResult = await fallbackUnfurlViaGAS(shortUrl);
    if (gasFallbackResult) {
        return res.status(200).json(gasFallbackResult);
    }

    if (directResult) {
        return res.status(200).json(directResult);
    }

    return res.status(502).json({
        ok: false,
        error: 'Gagal mengurai tautan pendek Google Maps di server.'
    });
}
