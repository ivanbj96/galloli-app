// BLE Bundle - Stub para PWA
// En APK/TWA, este archivo es reemplazado por el bundle generado por CI
// En PWA, este stub permite que la app funcione sin errores

window.BleClient = {
    isSupported: async () => false,
    initialize: async () => {},
    requestDevice: async () => { throw new Error('BLE no disponible en PWA'); },
    connect: async () => {},
    disconnect: async () => {},
    read: async () => new Uint8Array(),
    write: async () => {},
    startNotifications: async () => {},
    stopNotifications: async () => {}
};

console.log('✅ BLE Bundle stub cargado - BLE no disponible en PWA');
