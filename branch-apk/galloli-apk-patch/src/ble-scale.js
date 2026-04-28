// src/native/ble-scale.js
//
// Wrapper sobre @capacitor-community/bluetooth-le para la balanza.
// Reemplaza GALLOLI_SCALE_SERVICE / CHARACTERISTIC con los UUIDs reales
// de tu balanza (los puedes leer del módulo actual `app.js` donde ya
// haces conexión BLE).
//
// Emite eventos:
//   onWeight(kg)   – cada lectura
//   onConnected()  – al enlazar
//   onDisconnect() – al perder

import { BleClient } from '@capacitor-community/bluetooth-le';

const SCALE_SERVICE = '0000fff0-0000-1000-8000-00805f9b34fb';      // ⚠️ reemplaza
const SCALE_CHAR    = '0000fff1-0000-1000-8000-00805f9b34fb';      // ⚠️ reemplaza

let deviceId = null;
let listeners = { weight: [], connected: [], disconnect: [] };

export const onWeight     = (cb) => listeners.weight.push(cb);
export const onConnected  = (cb) => listeners.connected.push(cb);
export const onDisconnect = (cb) => listeners.disconnect.push(cb);

const emit = (k, ...a) => listeners[k].forEach(fn => { try { fn(...a); } catch(e){ console.error(e); } });

export async function initBleScale(savedDeviceId) {
  await BleClient.initialize({ androidNeverForLocation: true });

  if (savedDeviceId) {
    deviceId = savedDeviceId;
  } else {
    const dev = await BleClient.requestDevice({ services: [SCALE_SERVICE] });
    deviceId = dev.deviceId;
    localStorage.setItem('galloli.scale.deviceId', deviceId);
  }
  await connect();
}

async function connect() {
  if (!deviceId) return;
  try {
    await BleClient.connect(deviceId, () => {
      emit('disconnect');
      // reintento exponencial
      setTimeout(connect, 3000);
    });
    await BleClient.startNotifications(deviceId, SCALE_SERVICE, SCALE_CHAR, (value) => {
      const kg = parseScaleFrame(value);
      if (kg != null) emit('weight', kg);
    });
    emit('connected');
  } catch (e) {
    console.warn('[ble-scale] connect failed, retry in 5s', e);
    setTimeout(connect, 5000);
  }
}

// ⚠️ Adapta este parser al protocolo real de tu balanza.
// Ejemplo genérico: 7 bytes ASCII tipo "  4.32\n"
function parseScaleFrame(dv) {
  try {
    const txt = new TextDecoder().decode(dv).trim();
    const n = parseFloat(txt.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

export async function disconnectScale() {
  if (deviceId) try { await BleClient.disconnect(deviceId); } catch {}
}
