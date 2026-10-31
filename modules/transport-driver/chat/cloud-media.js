// ==========================================
// FILE: chat/cloud-media.js
// FUNGSI: Unggah Media Langsung ke Cloudinary CDN (0 Kuota Vercel Function)
// ==========================================

function blobToBase64DataUrl(fileBlob) {
    return new Promise((resolve, reject) => {
        if (!fileBlob) return reject(new Error("File kosong"));
        if (typeof fileBlob === 'string') return resolve(fileBlob);
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(fileBlob);
    });
}

export async function uploadMediaKeServer(fileBlob, jenisMedia = 'image') {
    try {
        // 1. Unggah langsung ke Cloudinary CDN agar 0 Vercel Function Invocations
        const resourceType = jenisMedia === 'audio' ? 'video' : 'image';
        const cloudinaryUrl = `https://api.cloudinary.com/v1_1/wuw7hvjo/${resourceType}/upload`;
        const formData = new FormData();
        formData.append('file', fileBlob);
        formData.append('upload_preset', 'ova0913d');

        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 14000);
        try {
            const directRes = await fetch(cloudinaryUrl, {
                method: 'POST',
                body: formData,
                signal: ctrl.signal
            });
            clearTimeout(tid);
            if (directRes.ok) {
                const directJson = await directRes.json();
                if (directJson && directJson.secure_url) {
                    return String(directJson.secure_url);
                }
            }
        } catch (cloudErr) {
            clearTimeout(tid);
        }

        // 2. Cadangan Data-URL terkompresi jika offline/gagal koneksi CDN
        const dataUrl = await blobToBase64DataUrl(fileBlob);
        if (dataUrl && dataUrl.length <= 4900) {
            return dataUrl;
        }
        return null;
    } catch (error) {
        return null;
    }
}
