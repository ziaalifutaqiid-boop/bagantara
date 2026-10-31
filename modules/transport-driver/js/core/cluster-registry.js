// ==========================================================================
// FILE: js/core/cluster-registry.js (APLIKASI PUBLIK V13.2 - PURE 3-NODE VAULT CLUSTER REGISTRY)
// FUNGSI: Manajer Endpoint Konsolidasi Murni 3 Node RTDB & Micro-Backend GAS
//         Node 1 (bagantara-core): Katalog & Presensi Driver Aktif
//         Node 2 (futaqi-ali): Audit Log, Device Reputation, & Failover/Overflow
//         Node 3 (chatting-88040): Transaksi Order, Radar Tiket, Sesi Komunikasi & Chat Real-Time
// ==========================================================================

window.BagantaraCluster = {
    nodes: {
        node1_core: {
            id: 1,
            role: "CORE_GPS_AND_CATALOG_DIRECT_REST",
            url: "https://bagantara-core-default-rtdb.asia-southeast1.firebasedatabase.app"
        },
        node2_history: {
            id: 2,
            role: "HISTORY_AUDIT_AND_OVERFLOW_DIRECT_REST",
            url: "https://futaqi-ali-default-rtdb.asia-southeast1.firebasedatabase.app"
        },
        node2_overflow: {
            id: 2,
            role: "OVERFLOW_FAILOVER_CLUSTER_DIRECT_REST",
            url: "https://futaqi-ali-default-rtdb.asia-southeast1.firebasedatabase.app"
        },
        node3_radar: {
            id: 3,
            role: "ORDER_DISPATCH_AND_CHAT_PRIMARY_DIRECT_REST",
            url: "https://chatting-88040-default-rtdb.asia-southeast1.firebasedatabase.app"
        },
        node3_chat: {
            id: 3,
            role: "CHAT_DIRECT_REST_PRIMARY",
            url: "https://chatting-88040-default-rtdb.asia-southeast1.firebasedatabase.app"
        }
    },

    getUrl: function(nodeKey = 'node1_core') {
        const cfgCluster = window.BGN_CONFIG?.settings?.cluster_config || {};
        if (cfgCluster[nodeKey]) return String(cfgCluster[nodeKey]).replace(/\/+$/, '');
        if (this.nodes[nodeKey] && this.nodes[nodeKey].url) return String(this.nodes[nodeKey].url).replace(/\/+$/, '');
        return String(cfgCluster.node1_core || this.nodes.node1_core.url).replace(/\/+$/, '');
    },

    getNode1Url: function() {
        return this.getUrl('node1_core');
    },

    getNode2Url: function() {
        return this.getUrl('node2_overflow');
    },

    getNode3Url: function() {
        return this.getUrl('node3_chat');
    },

    getOverflowUrl: function() {
        return (
            window.BGN_CONFIG?.settings?.cluster_config?.node2_overflow ||
            window.BGN_CONFIG?.settings?.cluster_config?.node2_history ||
            window.BGN_CONFIG?.settings?.firebase_overflow?.databaseURL ||
            this.nodes.node2_overflow.url
        ).replace(/\/+$/, '');
    },

    getGasUrl: function() {
        return window.BGN_CONFIG?.settings?.micro_backend?.gas_fcm_url ||
               "https://script.google.com/macros/s/AKfycbxkSFTmerLbUa5iEWEqyjUz9OVBo8xTznm90HJMKDRBQ9t-x8UxjUHas_K1JqqMgHzneg/exec";
    }
};
