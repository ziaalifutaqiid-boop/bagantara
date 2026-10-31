// ==========================================
// FILE: chat/config-chat.js
// FUNGSI: Konfigurasi Endpoint RTDB Komunikasi & Radar Langsung (3-Node 100% Zero-Socket HTTP REST)
//         Node 1 (bagantara-core): Katalog & Presensi Driver Aktif
//         Node 2 (futaqi-ali): Audit Log, Device Reputation, & Failover/Overflow
//         Node 3 (chatting-88040): Transaksi Order, Radar Tiket, Sesi Komunikasi & Chat Real-Time
// ==========================================

export let dbChat = {
    endpoint: 'https://chatting-88040-default-rtdb.asia-southeast1.firebasedatabase.app',
    radarEndpoint: 'https://chatting-88040-default-rtdb.asia-southeast1.firebasedatabase.app',
    overflowEndpoint: 'https://futaqi-ali-default-rtdb.asia-southeast1.firebasedatabase.app',
    gasEndpoint: 'https://script.google.com/macros/s/AKfycbxkSFTmerLbUa5iEWEqyjUz9OVBo8xTznm90HJMKDRBQ9t-x8UxjUHas_K1JqqMgHzneg/exec',
    ready: true
};

export const getRadarDatabaseUrl = () => {
    return window.BGN_CONFIG?.settings?.cluster_config?.node3_radar ||
           window.BGN_CONFIG?.settings?.cluster_config?.node3_chat ||
           window.BGN_CONFIG?.settings?.firebase_radar?.databaseURL ||
           'https://chatting-88040-default-rtdb.asia-southeast1.firebasedatabase.app';
};

export const initFirebaseChat = async () => {
    if (window.ConfigManager && !window.ConfigManager.isLoaded && typeof window.ConfigManager.init === 'function') {
        await window.ConfigManager.init();
    }
    const clusterCfg = window.BGN_CONFIG?.settings?.cluster_config || {};
    dbChat = {
        endpoint: clusterCfg.node3_chat || window.BGN_CONFIG?.settings?.firebase_chat?.databaseURL || 'https://chatting-88040-default-rtdb.asia-southeast1.firebasedatabase.app',
        radarEndpoint: clusterCfg.node3_radar || clusterCfg.node3_chat || window.BGN_CONFIG?.settings?.firebase_radar?.databaseURL || 'https://chatting-88040-default-rtdb.asia-southeast1.firebasedatabase.app',
        overflowEndpoint: clusterCfg.node2_overflow || clusterCfg.node2_history || window.BGN_CONFIG?.settings?.firebase_overflow?.databaseURL || 'https://futaqi-ali-default-rtdb.asia-southeast1.firebasedatabase.app',
        gasEndpoint: window.BGN_CONFIG?.settings?.micro_backend?.gas_fcm_url || 'https://script.google.com/macros/s/AKfycbxkSFTmerLbUa5iEWEqyjUz9OVBo8xTznm90HJMKDRBQ9t-x8UxjUHas_K1JqqMgHzneg/exec',
        ready: true
    };
    return dbChat;
};
