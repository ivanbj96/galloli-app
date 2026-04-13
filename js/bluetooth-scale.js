// Balanza Bluetooth BLE — GallOli
// Protocolo CAMRY: servicio 0xFFE0, caracteristica 0xFFE1, datos ASCII "001.70kg"
// En Capacitor APK: usa @capacitor-community/bluetooth-le (BleClient via ble-bundle.js)
// En navegador/TWA: usa Web Bluetooth API
const BluetoothScale = {
    device: null,
    characteristic: null,
    isConnected: false,
    isConnecting: false,
    currentWeight: 0,
    currentRawWeight: 0,
    currentUnit: 'lb',
    weightListeners: [],
    STORAGE_KEY: 'galloli_scales',
    ACTIVE_KEY: 'galloli_scale_active',
    savedScales: [],
    activeScaleId: null,
    _rawLog: [],
    _nativeDeviceId: null,
    _bleClient: null,
    _reconnectTimer: null,  // timer de reconexión automática

    isNative() {
        return typeof window !== 'undefined' &&
               window.Capacitor &&
               window.Capacitor.isNativePlatform &&
               window.Capacitor.isNativePlatform();
    },

    _getBleClient() {
        if (this._bleClient) return this._bleClient;
        if (window.BleClient) {
            this._bleClient = window.BleClient;
            return this._bleClient;
        }
        return null;
    },

    isSupported() {
        return this.isNative() || ('bluetooth' in navigator);
    },

    // Iniciar foreground service para mantener conexión en segundo plano
    _startForeground() {
        if (!this.isNative() || !window.Capacitor) return;
        try {
            var BleForeground = window.Capacitor.Plugins && window.Capacitor.Plugins.BleForeground;
            if (BleForeground) BleForeground.start().catch(function(){});
        } catch(e) {}
    },

    _stopForeground() {
        if (!this.isNative() || !window.Capacitor) return;
        try {
            var BleForeground = window.Capacitor.Plugins && window.Capacitor.Plugins.BleForeground;
            if (BleForeground) BleForeground.stop().catch(function(){});
        } catch(e) {}
    },

    // Programar reconexión automática sin esperar interacción del usuario
    _scheduleReconnect() {
        if (this._reconnectTimer) return;
        var self = this;
        this._reconnectTimer = setTimeout(function() {
            self._reconnectTimer = null;
            self._autoReconnect();
        }, 3000);
    },

    async _autoReconnect() {
        if (this.isConnected || this.isConnecting) return;
        if (!this.activeScaleId) return;
        var saved = this.savedScales.find(function(s) { return s.id === BluetoothScale.activeScaleId; });
        if (!saved) return;
        try {
            await this._connectNativeById(saved.id, saved.name);
        } catch(e) {
            // Si falla, volver a intentar en 5s
            var self = this;
            this._reconnectTimer = setTimeout(function() {
                self._reconnectTimer = null;
                self._autoReconnect();
            }, 5000);
        }
    },

    async init() {
        if (!this.isSupported()) return;
        this._loadSavedScales();
        this.updateUI();

        // En nativo: reconectar inmediatamente al iniciar si hay dispositivo guardado
        if (this.isNative() && this.activeScaleId) {
            var self = this;
            // Pequeño delay para que BleClient esté listo
            setTimeout(function() { self._autoReconnect(); }, 1000);
        } else if (this.activeScaleId) {
            // Web: esperar interacción del usuario (requerimiento del navegador)
            var tryOnce = async function() {
                document.removeEventListener('touchstart', tryOnce);
                document.removeEventListener('click', tryOnce);
                await BluetoothScale._tryAutoReconnect();
            };
            document.addEventListener('touchstart', tryOnce, { once: true, passive: true });
            document.addEventListener('click', tryOnce, { once: true });
        }
    },

    _loadSavedScales() {
        try {
            this.savedScales = JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]');
            this.activeScaleId = localStorage.getItem(this.ACTIVE_KEY);
        } catch(e) {
            this.savedScales = [];
        }
    },

    _saveSavedScales() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.savedScales));
        if (this.activeScaleId) {
            localStorage.setItem(this.ACTIVE_KEY, this.activeScaleId);
        } else {
            localStorage.removeItem(this.ACTIVE_KEY);
        }
    },

    async _tryAutoReconnect() {
        if (this.isConnected || this.isConnecting) return;
        if (this.isNative()) {
            await this._autoReconnect();
            return;
        }
        if (!navigator.bluetooth || !navigator.bluetooth.getDevices) return;
        try {
            var devices = await navigator.bluetooth.getDevices();
            var saved = this.savedScales.find(function(s) { return s.id === BluetoothScale.activeScaleId; });
            if (!saved) return;
            var device = devices.find(function(d) { return d.id === BluetoothScale.activeScaleId; });
            if (device) {
                this.isConnecting = true;
                this.updateUI();
                this.device = device;
                await this._connectToDevice();
            }
        } catch(e) {
            // silencioso
        } finally {
            this.isConnecting = false;
            this.updateUI();
        }
    },

    async connect() {
        if (!this.isSupported()) {
            Utils.showNotification('Bluetooth no soportado', 'error', 4000);
            return false;
        }
        if (this.isConnecting) return false;
        this.isConnecting = true;
        this.updateUI();
        try {
            if (this.isNative()) {
                return await this._connectNative();
            }
            return await this._connectWeb();
        } catch(e) {
            if (e.name !== 'NotFoundError') {
                Utils.showNotification('Error al conectar: ' + e.message, 'error', 4000);
            }
            this.isConnected = false;
            return false;
        } finally {
            this.isConnecting = false;
            this.updateUI();
        }
    },

    async _connectNative() {
        var BleClient = this._getBleClient();
        if (!BleClient) throw new Error('Plugin BLE no disponible');
        await BleClient.initialize({ androidNeverForLocation: false });
        var device = await BleClient.requestDevice({
            services: ['0000ffe0-0000-1000-8000-00805f9b34fb'],
            optionalServices: ['0000fff0-0000-1000-8000-00805f9b34fb']
        });
        return await this._connectNativeById(device.deviceId, device.name);
    },

    async _connectNativeById(deviceId, deviceName) {
        var BleClient = this._getBleClient();
        if (!BleClient) throw new Error('Plugin BLE no disponible');

        // Inicializar BLE antes de conectar
        try { await BleClient.initialize({ androidNeverForLocation: false }); } catch(e) {}

        var self = this;

        // Callback de desconexión: reconectar automáticamente sin esperar interacción
        await BleClient.connect(deviceId, function() {
            self.isConnected = false;
            self._nativeDeviceId = null;
            self.currentWeight = 0;
            self.updateUI();
            self._notifyListeners(null);
            self._stopForeground();
            // Reconectar automáticamente en 3s
            self._scheduleReconnect();
        });

        await BleClient.startNotifications(
            deviceId,
            '0000ffe0-0000-1000-8000-00805f9b34fb',
            '0000ffe1-0000-1000-8000-00805f9b34fb',
            function(value) { self._handleData(value); }
        );

        this._nativeDeviceId = deviceId;
        var entry = { id: deviceId, name: deviceName || 'Balanza', lastSeen: Date.now() };
        var existing = this.savedScales.findIndex(function(s) { return s.id === deviceId; });
        if (existing > -1) this.savedScales[existing] = entry;
        else this.savedScales.push(entry);
        this.activeScaleId = deviceId;
        this._saveSavedScales();
        this.isConnected = true;
        this.updateUI();

        // Iniciar foreground service para mantener conexión en segundo plano
        this._startForeground();

        Utils.showNotification('Balanza "' + (deviceName || 'Desconocida') + '" conectada', 'success', 3000);
        return true;
    },

    async _connectWeb() {
        this.device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [
                '0000ffe0-0000-1000-8000-00805f9b34fb',
                '0000fff0-0000-1000-8000-00805f9b34fb',
                '0000181d-0000-1000-8000-00805f9b34fb',
                '0000181b-0000-1000-8000-00805f9b34fb'
            ]
        });
        await this._connectToDevice();
        var entry = { id: this.device.id, name: this.device.name || 'Balanza', lastSeen: Date.now() };
        var existing = this.savedScales.findIndex(function(s) { return s.id === this.device.id; }.bind(this));
        if (existing > -1) this.savedScales[existing] = entry;
        else this.savedScales.push(entry);
        this.activeScaleId = this.device.id;
        this._saveSavedScales();
        Utils.showNotification('Balanza "' + (this.device.name || 'Desconocida') + '" conectada', 'success', 3000);
        return true;
    },

    async _connectToDevice() {
        var server = await this.device.gatt.connect();
        var self = this;
        this.device.addEventListener('gattserverdisconnected', function() {
            self.isConnected = false;
            self.characteristic = null;
            self.currentWeight = 0;
            self.updateUI();
            self._notifyListeners(null);
            var tryReconnect = async function() {
                document.removeEventListener('touchstart', tryReconnect);
                document.removeEventListener('click', tryReconnect);
                await self._tryAutoReconnect();
            };
            document.addEventListener('touchstart', tryReconnect, { once: true, passive: true });
            document.addEventListener('click', tryReconnect, { once: true });
        });
        // Ir directo al servicio 0xFFE0 (CAMRY)
        try {
            var service = await server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
            var char = await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');
            await char.startNotifications();
            char.addEventListener('characteristicvaluechanged', function(e) {
                self._handleData(e.target.value);
            });
            self.characteristic = char;
            self.isConnected = true;
            self.updateUI();
            return;
        } catch(e) {
            // No tiene 0xFFE0, probar fallback
        }
        // Fallback: servicios alternativos
        var fallbacks = [
            { s: '0000fff0-0000-1000-8000-00805f9b34fb', c: '0000fff1-0000-1000-8000-00805f9b34fb' },
            { s: '0000181d-0000-1000-8000-00805f9b34fb', c: '00002a9d-0000-1000-8000-00805f9b34fb' }
        ];
        for (var i = 0; i < fallbacks.length; i++) {
            try {
                var svc = await server.getPrimaryService(fallbacks[i].s);
                var ch = await svc.getCharacteristic(fallbacks[i].c);
                if (ch.properties.notify || ch.properties.indicate) {
                    await ch.startNotifications();
                    ch.addEventListener('characteristicvaluechanged', function(e) {
                        self._handleData(e.target.value);
                    });
                    self.characteristic = ch;
                    self.isConnected = true;
                    self.updateUI();
                    return;
                }
            } catch(e2) { /* continuar */ }
        }
        throw new Error('No se pudo conectar a la balanza');
    },

    _handleData(dataView) {
        var bytes = Array.from(new Uint8Array(dataView.buffer));
        this._rawLog.unshift({ bytes: bytes, ts: Date.now() });
        if (this._rawLog.length > 20) this._rawLog.pop();
        var result = this._parseWeight(dataView, bytes);
        if (result !== null && result.weight > 0 && result.weight < 2000) {
            this.currentUnit = 'lb';
            this.currentRawWeight = result.weight;
            this.currentWeight = result.weight;
            this._notifyListeners(this.currentWeight);
            this._updateWeightDisplays();
        }
    },

    _parseWeight(dataView, bytes) {
        // ASCII texto (CAMRY siempre envia kg aunque display muestre lb)
        try {
            var text = new TextDecoder('utf-8', { fatal: false }).decode(dataView.buffer).trim();
            if (text.length > 0) {
                var match = text.match(/([+-]?\s*\d+\.?\d*)\s*(kg|lb|g|KG|LB|G)/i);
                if (match) {
                    var val = parseFloat(match[1].replace(/\s/g, ''));
                    var unit = match[2].toLowerCase();
                    if (val > 0) {
                        // CAMRY envia kg, multiplicar x2 para obtener lb visual del display
                        if (unit === 'kg') return { weight: parseFloat((val * 2).toFixed(2)), unit: 'lb' };
                        if (unit === 'g') return { weight: parseFloat((val / 453.592).toFixed(2)), unit: 'lb' };
                        return { weight: val, unit: 'lb' };
                    }
                }
            }
        } catch(e) {}
        // BLE Weight Scale estandar
        if (bytes.length >= 3) {
            var flags = bytes[0];
            var raw = dataView.getUint16(1, true);
            if (raw > 0) {
                if (flags & 0x01) return { weight: raw * 0.01, unit: 'lb' };
                else return { weight: parseFloat((raw * 0.005 * 2.20462).toFixed(3)), unit: 'lb' };
            }
        }
        return null;
    },

    _notifyListeners(weight) {
        this.weightListeners.forEach(function(fn) { try { fn(weight); } catch(e) {} });
    },

    _updateWeightDisplays() {
        var w = this.currentRawWeight;
        var unit = this.currentUnit;
        var fields = ['sale-weight','live-weight','processed-weight','order-weight','delivery-weight','edit-sale-weight'];
        fields.forEach(function(id) {
            var el = document.getElementById(id);
            if (el && document.activeElement !== el) {
                var current = parseFloat(el.value) || 0;
                if (Math.abs(current - w) > 0.005) {
                    el.value = w.toFixed(2);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        });
        var valueEl = document.getElementById('scale-weight-value');
        if (valueEl) valueEl.textContent = w.toFixed(2) + ' ' + unit;
        var indicator = document.getElementById('scale-weight-indicator');
        if (indicator) indicator.style.display = 'flex';
    },

    onWeight(fn) {
        this.weightListeners.push(fn);
        var self = this;
        return function() { self.weightListeners = self.weightListeners.filter(function(f) { return f !== fn; }); };
    },

    async disconnect() {
        // Cancelar reconexión automática pendiente
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
        if (this.isNative() && this._nativeDeviceId) {
            var BleClient = this._getBleClient();
            if (BleClient) {
                try { await BleClient.disconnect(this._nativeDeviceId); } catch(e) {}
            }
            this._nativeDeviceId = null;
        } else if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.device = null;
        this.characteristic = null;
        this.isConnected = false;
        this.currentWeight = 0;
        this.activeScaleId = null;
        localStorage.removeItem(this.ACTIVE_KEY);
        this._stopForeground();
        this.updateUI();
        Utils.showNotification('Balanza desconectada', 'info', 2000);
    },

    removeScale(id) {
        this.savedScales = this.savedScales.filter(function(s) { return s.id !== id; });
        if (this.activeScaleId === id) { this.activeScaleId = null; this.disconnect(); }
        this._saveSavedScales();
        this.updateUI();
    },

    async connectToSaved(id) {
        if (this.isNative()) {
            var saved = this.savedScales.find(function(s) { return s.id === id; });
            if (saved) return await this._connectNativeById(id, saved.name);
        }
        if (navigator.bluetooth && navigator.bluetooth.getDevices) {
            try {
                var devices = await navigator.bluetooth.getDevices();
                var device = devices.find(function(d) { return d.id === id; });
                if (device) {
                    this.device = device;
                    this.activeScaleId = id;
                    this._saveSavedScales();
                    await this._connectToDevice();
                    Utils.showNotification('Balanza "' + device.name + '" conectada', 'success', 2000);
                    return true;
                }
            } catch(e) {}
        }
        return this.connect();
    },

    captureWeight(fieldId) {
        if (!this.isConnected) {
            Utils.showNotification('Balanza no conectada', 'warning', 2000);
            return;
        }
        var el = document.getElementById(fieldId);
        if (el) {
            el.value = this.currentRawWeight.toFixed(2);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.style.borderColor = 'var(--primary)';
            setTimeout(function() { el.style.borderColor = ''; }, 1000);
            Utils.showNotification(this.currentRawWeight.toFixed(2) + ' ' + this.currentUnit + ' capturado', 'success', 1500);
        }
    },

    showDebugLog() {
        if (this._rawLog.length === 0) {
            Utils.showNotification('No hay datos recibidos aun', 'info', 2000);
            return;
        }
        var lines = this._rawLog.slice(0, 5).map(function(e) {
            var hex = e.bytes.map(function(b) { return b.toString(16).padStart(2,'0'); }).join(' ');
            var ascii = e.bytes.map(function(b) { return b >= 32 && b < 127 ? String.fromCharCode(b) : '.'; }).join('');
            return 'HEX: ' + hex + '\nASCII: ' + ascii;
        }).join('\n---\n');
        var modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = '<div class="modal-content"><div class="modal-header"><h3><i class="fas fa-bug"></i> Debug Balanza</h3><button class="close-modal" onclick="this.closest(\'.modal\').remove()"><i class="fas fa-times"></i></button></div><div class="modal-body"><p style="color:var(--gray);font-size:0.85rem;">Ultimos datos recibidos:</p><pre style="background:#1e1e1e;color:#0f0;padding:15px;border-radius:8px;font-size:0.8rem;overflow-x:auto;white-space:pre-wrap;">' + lines + '</pre><p style="color:var(--gray);font-size:0.85rem;margin-top:10px;">Peso actual: <strong>' + this.currentWeight.toFixed(2) + ' lb</strong></p></div></div>';
        document.body.appendChild(modal);
    },

    showScalesPanel() {
        var self = this;
        var scalesList = this.savedScales.length === 0
            ? '<p style="color:var(--gray);text-align:center;padding:20px;">No hay balanzas guardadas</p>'
            : this.savedScales.map(function(s) {
                return '<div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--light);border-radius:8px;margin-bottom:8px;"><div><div style="font-weight:600;"><i class="fas fa-weight"></i> ' + s.name + '</div><small style="color:var(--gray);">Ultima vez: ' + new Date(s.lastSeen).toLocaleDateString('es-ES') + '</small></div><div style="display:flex;gap:8px;align-items:center;">' +
                    (self.activeScaleId === s.id && self.isConnected
                        ? '<span style="color:var(--success);font-size:0.85rem;"><i class="fas fa-circle"></i> Conectada</span>'
                        : '<button class="btn btn-outline" style="padding:6px 12px;font-size:0.85rem;" onclick="BluetoothScale.connectToSaved(\'' + s.id + '\');this.closest(\'.modal\').remove()"><i class="fas fa-bluetooth"></i> Conectar</button>') +
                    '<button class="btn btn-danger" style="padding:6px 10px;font-size:0.85rem;" onclick="BluetoothScale.removeScale(\'' + s.id + '\');this.closest(\'.modal\').remove();BluetoothScale.showScalesPanel()"><i class="fas fa-trash"></i></button></div></div>';
            }).join('');
        var modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = '<div class="modal-content"><div class="modal-header"><h3><i class="fas fa-weight"></i> Mis Balanzas</h3><button class="close-modal" onclick="this.closest(\'.modal\').remove()"><i class="fas fa-times"></i></button></div><div class="modal-body">' + scalesList + '<button class="btn btn-primary" style="width:100%;margin-top:12px;" onclick="this.closest(\'.modal\').remove();BluetoothScale.connect()"><i class="fas fa-plus"></i> Agregar nueva balanza</button>' + (this.isConnected ? '<button class="btn btn-outline" style="width:100%;margin-top:8px;" onclick="BluetoothScale.showDebugLog()"><i class="fas fa-bug"></i> Ver datos crudos (debug)</button>' : '') + '</div></div>';
        document.body.appendChild(modal);
    },

    updateUI() {
        var toggle = document.getElementById('scale-switch');
        var status = document.getElementById('scale-status-sidebar');
        var valueEl = document.getElementById('scale-weight-value');
        var indicator = document.getElementById('scale-weight-indicator');
        if (toggle) { toggle.checked = this.isConnected; toggle.disabled = this.isConnecting; }
        if (status) {
            if (this.isConnecting) {
                status.textContent = 'Conectando...';
                status.style.color = 'var(--warning)';
            } else if (this.isConnected) {
                status.textContent = (this.isNative() ? 'Balanza' : (this.device && this.device.name ? this.device.name : 'Balanza'));
                status.style.color = 'rgba(76, 175, 80, 0.9)';
            } else {
                var saved = this.savedScales.find(function(s) { return s.id === this.activeScaleId; }.bind(this));
                status.textContent = saved ? saved.name + ' (desconectada)' : 'Toca para conectar';
                status.style.color = '';
            }
        }
        document.querySelectorAll('.scale-capture-btn').forEach(function(btn) {
            btn.style.display = this.isConnected ? 'flex' : 'none';
        }.bind(this));
        if (indicator) indicator.style.display = this.isConnected ? 'flex' : 'none';
        if (valueEl && !this.isConnected) valueEl.textContent = '0.00 lb';
    }
};
