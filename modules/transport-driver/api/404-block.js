// ==========================================================================
// FILE: api/404-block.js (VERCEL SERVERLESS FUNCTION - BAGANTARA PUBLIK V12.0)
// FUNGSI: Penangkap Rewrite Proteksi Direktori Internal (/data/*, /js/core/*, /chat/*)
// ==========================================================================

export default function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(404).json({
        ok: false,
        status: 404,
        error: 'Resource Not Found'
    });
}
