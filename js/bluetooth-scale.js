// Módulo de Balanza Bluetooth BLE — GallOli
const BluetoothScale = {
    device: null,
    characteristic: null,
    isConnected: false,
    isConnecting: false,
    currentWeight: 0,
    weightListeners: [],
    savedDeviceId: null,
    reconnectInterval: null,
    STORAGE_KEY: 'galloli_scale_device',

    // Inicializar — cargar dispositivo guardado
    async init() {
        if (!this.isSupported()) return;
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved) {
            try {
                this.savedDeviceId = JSON.parse(saved);
            } catch(e) {}
        }
        this.updateUI();
    },

    isSupported() {
        return 'bluetooth' in navigator;
    },

    // Conectar a la balanza — abre selector de dispositivos BLE
    async connect() {
        if (!this.isSupported()) {
            Utils.showNotification('Bluetooth no soportado en este navegador', 'error', 4000);
            return false;
        }
        if (this.isConnecting) return false;

        this.isConnecting = true;
        this.updateUI();

        try {
            // Solicitar dispositivo BLE — acepta cualquier balanza
            this.device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: [
                    // Servicios comunes de balanzas BLE
                    '0000fff0-0000-1000-8000-00805f9b34fb', // Genérico
                    '0000ffe0-0000-1000-8000-00805f9b34fb', // Genérico 2
                    '00001809-0000-1000-8000-00805f9b34fb', // Health Thermometer (algunas balanzas)
                    '0000181d-0000-1000-8000-00805f9b34fb', // Weight Scale (estándar BLE)
                    '0000181b-0000-1000-8000-00805f9b34fb', // Body Composition
                    'generic_access',
                    'generic_attribute'
                ]
            });

            await this._connectToDevice();

            // Guardar ID del dispositivo para reconexión
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
                name: this.device.name,
                id: this.device.id
            }));
            this.savedDeviceId = { name: this.device.name, id: this.device.id };

            Utils.showNotification(`Balanza "${this.device.name || 'Desconocida'}" conectada`, 'success', 3000);
            return true;

        } catch(e) {
            if (e.name !== 'NotFoundError') {
                console.error('Error conectando balanza:', e.message);
                Utils.showNotification('Error al conectar balanza: ' + e.message, 'error', 4000);
            }
            this.isConnected = false;
            return false;
        } finally {
            this.isConnecting = false;
            this.updateUI();
        }
    },

    async _connectToDevice() {
        const server = await this.device.gatt.connect();

        // Escuchar desconexión
        this.device.addEventListener('gattserverdisconnected', () => {
            this.isConnected = false;
            this.characteristic = null;
            this.updateUI();
            this._notifyListeners(null);
            // Intentar reconectar automáticamente
            this._scheduleReconnect();
        });

        // Intentar encontrar el servicio y característica de peso
        const services = await server.getPrimaryServices();
        let found = false;

        for (const service of services) {
            try {
                const characteristics = await service.getCharacteristics();
                for (const char of characteristics) {
                    // Buscar característica con notify o indicate (envía datos)
                    if (char.properties.notify || char.properties.indicate) {
                        try {
                            await char.startNotifications();
                            char.addEventListener('characteristicvaluechanged', (e) => {
                                this._parseWeightData(e.target.value);
                            });
                            this.characteristic = char;
                            found = true;
                            break;
                        } catch(e) { /* continuar */ }
                    }
                }
                if (found) break;
            } catch(e) { /* continuar con siguiente servicio */ }
        }

        this.isConnected = true;
        this.updateUI();
    },

    // Parsear datos de peso — soporta múltiples formatos de balanzas
    _parseWeightData(dataView) {
        try {
            let weight = null;

            // Formato 1: Estándar BLE Weight Scale (0x181D)
            // Byte 0: flags, Bytes 1-2: peso en 0.005 kg
            if (dataView.byteLength >= 3) {
                const flags = dataView.getUint8(0);
                const unit = flags & 0x01; // 0=kg, 1=lb
                const rawWeight = dataView.getUint16(1, true);

                if (unit === 0) {
                    // kg → lb
                    weight = (rawWeight * 0.005) * 2.20462;
                } else {
                    // lb directamente (resolución 0.01 lb)
                    weight = rawWeight * 0.01;
                }
            }

            // Formato 2: ASCII (muchas balanzas chinas envían texto)
            if (weight === null || weight <= 0) {
                const text = new TextDecoder().decode(dataView.buffer).trim();
                const match = text.match(/(\d+\.?\d*)\s*(kg|lb|g)?/i);
                if (match) {
                    let val = parseFloat(match[1]);
                    const unit = (match[2] || '').toLowerCase();
                    if (unit === 'kg') val *= 2.20462;
                    else if (unit === 'g') val = val / 453.592;
                    weight = val;
                }
            }

            // Formato 3: Raw bytes (2 bytes little-endian, en gramos)
            if (weight === null || weight <= 0) {
                if (dataView.byteLength >= 2) {
                    const grams = dataView.getUint16(0, true);
                    if (grams > 0 && grams < 50000) {
                        weight = grams / 453.592; // g → lb
                    }
                }
            }

            if (weight !== null && weight > 0 && weight < 2000) {
                this.currentWeight = parseFloat(weight.toFixed(2));
                this._notifyListeners(this.currentWeight);
                this._updateWeightDisplays();
            }
        } catch(e) {
            console.warn('Error parseando datos de balanza:', e.message);
        }
    },

    // Notificar a todos los listeners registrados
    _notifyListeners(weight) {
        this.weightListeners.forEach(fn => {
            try { fn(weight); } catch(e) {}
        });
    },

    // Actualizar todos los campos de peso visibles en la UI
    _updateWeightDisplays() {
        const w = this.currentWeight;
        const displays = [
            'sale-weight',
            'live-weight',
            'processed-weight',
            'order-weight',
            'delivery-weight',
            'edit-sale-weight'
        ];
        displays.forEach(id => {
            const el = document.getElementById(id);
            if (el && document.activeElement !== el) {
                el.value = w;
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        // Actualizar indicador flotante
        const indicator = document.getElementById('scale-weight-indicator');
        const valueEl = document.getElementById('scale-weight-value');
        if (indicator) {
            indicator.style.display = 'flex';
        }
        if (valueEl) {
            valueEl.textContent = w.toFixed(2) + ' lb';
        }
    },

    // Registrar listener de peso
    onWeight(fn) {
        this.weightListeners.push(fn);
        return () => {
            this.weightListeners = this.weightListeners.filter(f => f !== fn);
        };
    },

    // Desconectar
    async disconnect() {
        this._clearReconnect();
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.device = null;
        this.characteristic = null;
        this.isConnected = false;
        this.currentWeight = 0;
        localStorage.removeItem(this.STORAGE_KEY);
        this.savedDeviceId = null;
        this.updateUI();
        Utils.showNotification('Balanza desconectada', 'info', 2000);
    },

    // Reconexión automática
    _scheduleReconnect() {
        this._clearReconnect();
        if (!this.savedDeviceId) return;
        this.reconnectInterval = setTimeout(async () => {
            if (!this.isConnected && this.device) {
                try {
                    await this._connectToDevice();
                    Utils.showNotification('Balanza reconectada', 'success', 2000);
                } catch(e) {
                    this._scheduleReconnect(); // Reintentar
                }
            }
        }, 5000);
    },

    _clearReconnect() {
        if (this.reconnectInterval) {
            clearTimeout(this.reconnectInterval);
            this.reconnectInterval = null;
        }
    },

    // Actualizar UI del toggle en sidebar y botones de captura
    updateUI() {
        const toggle = document.getElementById('scale-switch');
        const status = document.getElementById('scale-status-sidebar');
        const indicator = document.getElementById('scale-weight-indicator');

        if (toggle) {
            toggle.checked = this.isConnected;
            toggle.disabled = this.isConnecting;
        }
        if (status) {
            if (this.isConnecting) {
                status.textContent = 'Conectando...';
                status.style.color = 'var(--warning)';
            } else if (this.isConnected) {
                status.textContent = this.device?.name || 'Conectada';
                status.style.color = 'rgba(76, 175, 80, 0.9)';
            } else if (this.savedDeviceId) {
                status.textContent = this.savedDeviceId.name || 'Desconectada';
                status.style.color = '';
            } else {
                status.textContent = 'Toca para conectar';
                status.style.color = '';
            }
        }

        // Mostrar/ocultar botones de captura en formularios
        document.querySelectorAll('.scale-capture-btn').forEach(btn => {
            btn.style.display = this.isConnected ? 'flex' : 'none';
        });

        if (indicator) {
            indicator.style.display = this.isConnected ? 'block' : 'none';
        }
    },

    // Capturar peso actual en un campo específico
    captureWeight(fieldId) {
        if (!this.isConnected) {
            Utils.showNotification('Balanza no conectada', 'warning', 2000);
            return;
        }
        const el = document.getElementById(fieldId);
        if (el) {
            el.value = this.currentWeight.toFixed(2);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            // Feedback visual
            el.style.borderColor = 'var(--primary)';
            setTimeout(() => el.style.borderColor = '', 1000);
        }
    }
};
