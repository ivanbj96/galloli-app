/**
 * native-bridge.js
 * Usa los plugins Capacitor reales (BlePlugin, PushPlugin) registrados en MainActivity.
 * Solo activo en la APK nativa.
 */

(function initNativeBridge() {
    // Solo ejecutar en Capacitor nativo
    if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) {
        return;
    }

    console.log('[NativeBridge] Inicializando plugins nativos...');

    const { registerPlugin } = window.Capacitor;

    // ── Registrar plugins ────────────────────────────────────────────────────
    const BlePlugin  = registerPlugin('BlePlugin');
    const PushPlugin = registerPlugin('PushPlugin');

    // ── BLE ──────────────────────────────────────────────────────────────────
    function initBle() {
        if (!BlePlugin) { console.error('[BLE] BlePlugin no disponible'); return; }

        // Listeners de eventos del plugin Java
        BlePlugin.addListener('scanStart',    ()           => onScanStart());
        BlePlugin.addListener('scanStop',     ()           => onScanStop());
        BlePlugin.addListener('deviceFound',  (e)          => console.log('[BLE] Dispositivo encontrado:', e.name));
        BlePlugin.addListener('connected',    (e)          => onConnected(e.deviceId, e.name));
        BlePlugin.addListener('disconnected', ()           => onDisconnected());
        BlePlugin.addListener('data',         (e)          => onData(e.hex, e.ascii));
        BlePlugin.addListener('error',        (e)          => onBleError(e.message));

        // Parchear BluetoothScale para usar el plugin nativo
        patchBluetoothScale();

        console.log('[BLE] Plugin BLE inicializado');
    }

    function onScanStart() {
        if (window.BluetoothScale) {
            window.BluetoothScale.isConnecting = true;
            window.BluetoothScale.updateUI();
        }
    }

    function onScanStop() {
        if (window.BluetoothScale) {
            window.BluetoothScale.isConnecting = false;
            window.BluetoothScale.updateUI();
        }
        if (typeof Utils !== 'undefined') Utils.showNotification('No se encontró balanza', 'warning', 3000);
    }

    function onConnected(deviceId, name) {
        console.log('[BLE] Conectado:', name, deviceId);
        const bs = window.BluetoothScale;
        if (!bs) return;
        bs.isConnected  = true;
        bs.isConnecting = false;
        bs._nativeDeviceId = deviceId;
        const entry = { id: deviceId, name: name || 'Balanza', lastSeen: Date.now() };
        const idx = bs.savedScales.findIndex(s => s.id === deviceId);
        if (idx > -1) bs.savedScales[idx] = entry; else bs.savedScales.push(entry);
        bs.activeScaleId = deviceId;
        bs._saveSavedScales();
        bs.updateUI();
        if (typeof Utils !== 'undefined') Utils.showNotification('Balanza "' + (name || 'Balanza') + '" conectada', 'success', 3000);
    }

    function onDisconnected() {
        console.log('[BLE] Desconectado');
        const bs = window.BluetoothScale;
        if (!bs) return;
        bs.isConnected  = false;
        bs.isConnecting = false;
        bs.currentWeight = 0;
        bs.updateUI();
        bs._notifyListeners(null);
    }

    function onData(hex, ascii) {
        const bs = window.BluetoothScale;
        if (!bs) return;
        // Parsear ASCII primero (CAMRY: "001.70kg")
        const match = ascii.match(/([+-]?\s*\d+\.?\d*)\s*(kg|lb|g)/i);
        if (match) {
            let val = parseFloat(match[1].replace(/\s/g, ''));
            const unit = match[2].toLowerCase();
            if (val > 0) {
                if (unit === 'kg') val = parseFloat((val * 2).toFixed(2));
                else if (unit === 'g') val = parseFloat((val / 453.592).toFixed(2));
                bs.currentWeight = val;
                bs.currentRawWeight = val;
                bs._notifyListeners(val);
                bs._updateWeightDisplays();
                return;
            }
        }
        // Fallback HEX BLE Weight Scale estándar
        if (hex.length >= 6) {
            const flags = parseInt(hex.substring(0, 2), 16);
            const raw   = parseInt(hex.substring(2, 6), 16);
            if (raw > 0) {
                const val = (flags & 0x01) ? raw * 0.01 : parseFloat((raw * 0.005 * 2.20462).toFixed(3));
                bs.currentWeight = val;
                bs.currentRawWeight = val;
                bs._notifyListeners(val);
                bs._updateWeightDisplays();
            }
        }
    }

    function onBleError(msg) {
        console.error('[BLE] Error:', msg);
        if (window.BluetoothScale) {
            window.BluetoothScale.isConnecting = false;
            window.BluetoothScale.updateUI();
        }
        if (typeof Utils !== 'undefined') Utils.showNotification('BLE: ' + msg, 'error', 4000);
    }

    function patchBluetoothScale() {
        const bs = window.BluetoothScale;
        if (!bs) { setTimeout(patchBluetoothScale, 500); return; }

        bs.isNative    = () => true;
        bs.isSupported = () => true;

        bs._connectNative = async function() {
            await BlePlugin.scanAndConnect();
            return true;
        };

        bs._connectNativeById = async function(deviceId) {
            await BlePlugin.connectById({ deviceId });
            return true;
        };

        bs.disconnect = async function() {
            await BlePlugin.disconnect();
            this.isConnected   = false;
            this._nativeDeviceId = null;
            this.currentWeight = 0;
            this.activeScaleId = null;
            localStorage.removeItem(this.ACTIVE_KEY);
            this.updateUI();
            if (typeof Utils !== 'undefined') Utils.showNotification('Balanza desconectada', 'info', 2000);
        };

        bs.updateUI();
        console.log('[BLE] BluetoothScale parcheado con plugin nativo');
    }

    // ── PUSH ─────────────────────────────────────────────────────────────────
    function initPush() {
        if (!PushPlugin) { console.error('[Push] PushPlugin no disponible'); return; }

        PushPlugin.addListener('tokenReceived', (e) => {
            console.log('[Push] Token FCM recibido');
            localStorage.setItem('fcm_token', e.token);
            sendTokenToServer(e.token);
        });

        PushPlugin.addListener('pushReceived', (e) => {
            console.log('[Push] Notificación recibida:', e.title);
        });

        // Pedir permisos y obtener token
        PushPlugin.requestPermissions().then(result => {
            console.log('[Push] Permisos:', result.notifications);
            if (result.notifications === 'granted') {
                return PushPlugin.getToken();
            }
        }).then(result => {
            if (result && result.token) {
                console.log('[Push] Token obtenido');
                localStorage.setItem('fcm_token', result.token);
                sendTokenToServer(result.token);
            }
        }).catch(e => console.error('[Push] Error:', e));

        // Exponer para que notify-system.js pueda activar notificaciones
        window.NativePushPlugin = PushPlugin;
        console.log('[Push] Plugin Push inicializado');
    }

    function sendTokenToServer(token) {
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
                    if (r.ok) console.log('[Push] Token guardado en servidor');
                    else console.error('[Push] Error guardando token:', r.status);
                }).catch(e => console.error('[Push] Error:', e));
            } else if (retries > 0) {
                setTimeout(() => trySend(retries - 1), 2000);
            }
        };
        trySend(15);
    }

    // ── Inicializar cuando el DOM esté listo ─────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => { initBle(); initPush(); });
    } else {
        initBle();
        initPush();
    }

})();
