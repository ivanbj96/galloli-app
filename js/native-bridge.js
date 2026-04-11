/**
 * native-bridge.js
 * Puente entre el código Java nativo (AndroidBle, AndroidPush) y el JS de la app.
 * Solo activo cuando window.AndroidBle o window.AndroidPush existen (APK nativa).
 */

// ─── BLE NATIVO ─────────────────────────────────────────────────────────────
window.BleNative = {
    onScanStart() {
        console.log('[BleNative] Escaneo iniciado');
        if (window.BluetoothScale) {
            window.BluetoothScale.isConnecting = true;
            window.BluetoothScale.updateUI();
        }
    },

    onScanStop() {
        console.log('[BleNative] Escaneo detenido sin encontrar dispositivo');
        if (window.BluetoothScale) {
            window.BluetoothScale.isConnecting = false;
            window.BluetoothScale.updateUI();
        }
        if (typeof Utils !== 'undefined') Utils.showNotification('No se encontró balanza', 'warning', 3000);
    },

    onDeviceFound(deviceId, deviceName) {
        console.log('[BleNative] Dispositivo encontrado:', deviceName, deviceId);
    },

    onConnected(deviceId, deviceName) {
        console.log('[BleNative] Conectado a:', deviceName, deviceId);
        if (window.BluetoothScale) {
            window.BluetoothScale.isConnected = true;
            window.BluetoothScale.isConnecting = false;
            window.BluetoothScale._nativeDeviceId = deviceId;

            // Guardar en savedScales
            const entry = { id: deviceId, name: deviceName || 'Balanza', lastSeen: Date.now() };
            const idx = window.BluetoothScale.savedScales.findIndex(s => s.id === deviceId);
            if (idx > -1) window.BluetoothScale.savedScales[idx] = entry;
            else window.BluetoothScale.savedScales.push(entry);
            window.BluetoothScale.activeScaleId = deviceId;
            window.BluetoothScale._saveSavedScales();
            window.BluetoothScale.updateUI();
        }
        if (typeof Utils !== 'undefined') Utils.showNotification('Balanza "' + (deviceName || 'Balanza') + '" conectada', 'success', 3000);
    },

    onDisconnected() {
        console.log('[BleNative] Desconectado');
        if (window.BluetoothScale) {
            window.BluetoothScale.isConnected = false;
            window.BluetoothScale.isConnecting = false;
            window.BluetoothScale.currentWeight = 0;
            window.BluetoothScale.updateUI();
            window.BluetoothScale._notifyListeners(null);
        }
    },

    onData(hex, ascii) {
        // Parsear el peso desde los datos recibidos
        if (!window.BluetoothScale) return;

        // Intentar parsear ASCII primero (CAMRY envía texto como "001.70kg")
        const match = ascii.match(/([+-]?\s*\d+\.?\d*)\s*(kg|lb|g)/i);
        if (match) {
            let val = parseFloat(match[1].replace(/\s/g, ''));
            const unit = match[2].toLowerCase();
            if (val > 0) {
                if (unit === 'kg') val = parseFloat((val * 2).toFixed(2)); // CAMRY: kg → lb
                else if (unit === 'g') val = parseFloat((val / 453.592).toFixed(2));
                window.BluetoothScale.currentWeight = val;
                window.BluetoothScale.currentRawWeight = val;
                window.BluetoothScale._notifyListeners(val);
                window.BluetoothScale._updateWeightDisplays();
                return;
            }
        }

        // Fallback: parsear HEX como BLE Weight Scale estándar
        if (hex.length >= 6) {
            const flags = parseInt(hex.substring(0, 2), 16);
            const raw = parseInt(hex.substring(2, 6), 16);
            if (raw > 0) {
                const val = flags & 0x01
                    ? raw * 0.01
                    : parseFloat((raw * 0.005 * 2.20462).toFixed(3));
                window.BluetoothScale.currentWeight = val;
                window.BluetoothScale.currentRawWeight = val;
                window.BluetoothScale._notifyListeners(val);
                window.BluetoothScale._updateWeightDisplays();
            }
        }
    },

    onError(msg) {
        console.error('[BleNative] Error:', msg);
        if (window.BluetoothScale) {
            window.BluetoothScale.isConnecting = false;
            window.BluetoothScale.updateUI();
        }
        if (typeof Utils !== 'undefined') Utils.showNotification('BLE: ' + msg, 'error', 4000);
    }
};

// ─── PUSH NATIVO ─────────────────────────────────────────────────────────────
window.PushNative = {
    onToken(token) {
        console.log('[PushNative] Token FCM recibido');
        localStorage.setItem('fcm_token', token);

        // Enviar al servidor cuando AuthManager esté listo
        const trySend = (retries) => {
            if (window.AuthManager && window.AuthManager.token) {
                fetch('https://galloli-sync.ivanbj-96.workers.dev/api/push/subscribe', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + window.AuthManager.token
                    },
                    body: JSON.stringify({ token, platform: 'android', type: 'fcm' })
                }).then(r => {
                    if (r.ok) console.log('[PushNative] Token guardado en servidor');
                }).catch(e => console.error('[PushNative] Error guardando token:', e));
            } else if (retries > 0) {
                setTimeout(() => trySend(retries - 1), 2000);
            }
        };
        trySend(10);
    },

    onPermissionResult(result) {
        console.log('[PushNative] Permiso de notificaciones:', result);
    }
};

// ─── PARCHEAR BluetoothScale para usar el bridge nativo ──────────────────────
(function patchBluetoothScale() {
    const patch = () => {
        if (!window.BluetoothScale) return;
        if (!window.AndroidBle) return; // No estamos en APK nativa

        console.log('[NativeBridge] Parcheando BluetoothScale con AndroidBle...');

        // Sobreescribir isNative y isSupported
        window.BluetoothScale.isNative = () => true;
        window.BluetoothScale.isSupported = () => true;

        // Sobreescribir connect para usar el bridge nativo
        window.BluetoothScale._connectNative = async function() {
            window.AndroidBle.scanAndConnect();
            return true;
        };

        // Sobreescribir connectById para usar el bridge nativo
        window.BluetoothScale._connectNativeById = async function(deviceId, deviceName) {
            window.AndroidBle.connectById(deviceId);
            return true;
        };

        // Sobreescribir disconnect
        const origDisconnect = window.BluetoothScale.disconnect.bind(window.BluetoothScale);
        window.BluetoothScale.disconnect = async function() {
            window.AndroidBle.disconnect();
            this.isConnected = false;
            this._nativeDeviceId = null;
            this.currentWeight = 0;
            this.activeScaleId = null;
            localStorage.removeItem(this.ACTIVE_KEY);
            this.updateUI();
            if (typeof Utils !== 'undefined') Utils.showNotification('Balanza desconectada', 'info', 2000);
        };

        window.BluetoothScale.updateUI();
        console.log('[NativeBridge] BluetoothScale parcheado correctamente');
    };

    // Intentar parchear ahora y también cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(patch, 500));
    } else {
        setTimeout(patch, 500);
    }
})();

// ─── Recuperar token FCM pendiente al iniciar ─────────────────────────────────
(function recoverPendingToken() {
    if (!window.AndroidPush) return;
    const token = window.AndroidPush.getToken();
    if (token) {
        console.log('[NativeBridge] Token FCM recuperado del bridge nativo');
        window.PushNative.onToken(token);
    }
})();
