// Módulo de Balanza Bluetooth BLE — GallOli
// Protocolo confirmado: servicio 0xFFE0, característica 0xFFE1, datos ASCII "050.60kg"
const BluetoothScale = {
    device: null,
    characteristic: null,
    isConnected: false,
    isConnecting: false,
    currentWeight: 0,       // en libras siempre
    currentUnit: 'kg',      // unidad original de la balanza
    weightListeners: [],
    STORAGE_KEY: 'galloli_scales',
    ACTIVE_KEY: 'galloli_scale_active',
    savedScales: [],
    activeScaleId: null,
    _rawLog: [],

    // Servicios y características conocidos de balanzas BLE
    KNOWN_SERVICES: [
        '0000ffe0-0000-1000-8000-00805f9b34fb', // CAMRY, XS, mayoría balanzas chinas
        '0000fff0-0000-1000-8000-00805f9b34fb', // Alternativo
        '0000181d-0000-1000-8000-00805f9b34fb', // BLE Weight Scale estándar
        '0000181b-0000-1000-8000-00805f9b34fb', // Body Composition
    ],

    async init() {
        if (!this.isSupported()) return;
        this._loadSavedScales();
        this.updateUI();
        if (this.activeScaleId) {
            setTimeout(() => this._tryAutoReconnect(), 2000);
        }
    },

    isSupported() {
        return 'bluetooth' in navigator;
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
        if (!navigator.bluetooth.getDevices) return;
        try {
            const devices = await navigator.bluetooth.getDevices();
            const saved = this.savedScales.find(s => s.id === this.activeScaleId);
            if (!saved) return;
            const device = devices.find(d => d.id === this.activeScaleId);
            if (device) {
                this.device = device;
                await this._connectToDevice();
            }
        } catch(e) { /* silencioso */ }
    },

    async connect() {
        if (!this.isSupported()) {
            Utils.showNotification('Bluetooth no soportado en este navegador', 'error', 4000);
            return false;
        }
        if (this.isConnecting) return false;

        this.isConnecting = true;
        this.updateUI();

        try {
            this.device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: this.KNOWN_SERVICES
            });

            await this._connectToDevice();

            // Guardar en lista
            const existing = this.savedScales.findIndex(s => s.id === this.device.id);
            const entry = { id: this.device.id, name: this.device.name || 'Balanza', lastSeen: Date.now() };
            if (existing > -1) this.savedScales[existing] = entry;
            else this.savedScales.push(entry);
            this.activeScaleId = this.device.id;
            this._saveSavedScales();

            Utils.showNotification(`Balanza "${this.device.name || 'Desconocida'}" conectada`, 'success', 3000);
            return true;

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

    async _connectToDevice() {
        const server = await this.device.gatt.connect();

        this.device.addEventListener('gattserverdisconnected', () => {
            this.isConnected = false;
            this.characteristic = null;
            this.currentWeight = 0;
            this.updateUI();
            this._notifyListeners(null);
            setTimeout(() => this._tryAutoReconnect(), 3000);
        });

        // Estrategia 1: ir directo al servicio 0xFFE0 (CAMRY y mayoría de balanzas)
        let subscribed = false;
        try {
            const service = await server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
            const char = await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');
            await char.startNotifications();
            char.addEventListener('characteristicvaluechanged', (e) => {
                this._handleData(e.target.value);
            });
            this.characteristic = char;
            subscribed = true;
        } catch(e) { /* no tiene 0xFFE0, probar otros */ }

        // Estrategia 2: descubrir todos los servicios y suscribirse a cualquier notify
        if (!subscribed) {
            const services = await server.getPrimaryServices();
            for (const service of services) {
                if (subscribed) break;
                try {
                    const chars = await service.getCharacteristics();
                    for (const char of chars) {
                        if (char.properties.notify || char.properties.indicate) {
                            try {
                                await char.startNotifications();
                                char.addEventListener('characteristicvaluechanged', (e) => {
                                    this._handleData(e.target.value);
                                });
                                this.characteristic = char;
                                subscribed = true;
                                break;
                            } catch(e) { /* continuar */ }
                        }
                    }
                } catch(e) { /* continuar */ }
            }
        }

        if (!subscribed) throw new Error('No se encontraron características de notificación');

        this.isConnected = true;
        this.updateUI();
    },

    _handleData(dataView) {
        const bytes = Array.from(new Uint8Array(dataView.buffer));
        this._rawLog.unshift({ bytes, ts: Date.now() });
        if (this._rawLog.length > 20) this._rawLog.pop();

        const result = this._parseWeight(dataView, bytes);
        if (result !== null && result.weight > 0 && result.weight < 2000) {
            this.currentUnit = result.unit;
            this.currentWeight = parseFloat(result.weight.toFixed(3));
            this._notifyListeners(this.currentWeight);
            this._updateWeightDisplays();
        }
    },

    // Parser — retorna { weight (en lb), unit (original) } o null
    _parseWeight(dataView, bytes) {
        // --- Formato 1: ASCII texto (CAMRY, XS y mayoría) ---
        // Ejemplos: "050.60kg", "112.00lb", "ST,GS,+  050.60 kg"
        try {
            const text = new TextDecoder('utf-8', { fatal: false }).decode(dataView.buffer).trim();
            if (text.length > 0) {
                const match = text.match(/([+-]?\s*\d+\.?\d*)\s*(kg|lb|g|KG|LB|G)/i);
                if (match) {
                    let val = parseFloat(match[1].replace(/\s/g, ''));
                    const unit = match[2].toLowerCase();
                    if (unit === 'kg') return { weight: val * 2.20462, unit: 'kg' };
                    if (unit === 'g')  return { weight: val / 453.592, unit: 'g' };
                    return { weight: val, unit: 'lb' };
                }
            }
        } catch(e) {}

        // --- Formato 2: BLE Weight Scale estándar (0x181D) ---
        if (bytes.length >= 3) {
            const flags = bytes[0];
            const raw = dataView.getUint16(1, true);
            if (raw > 0) {
                if (flags & 0x01) return { weight: raw * 0.01, unit: 'lb' };
                else return { weight: (raw * 0.005) * 2.20462, unit: 'kg' };
            }
        }

        // --- Formato 3: 2 bytes big-endian en gramos ---
        if (bytes.length >= 2) {
            const grams = (bytes[0] << 8) | bytes[1];
            if (grams > 0 && grams < 300000) return { weight: grams / 453.592, unit: 'g' };
        }

        // --- Formato 4: 2 bytes little-endian en gramos ---
        if (bytes.length >= 2) {
            const grams = dataView.getUint16(0, true);
            if (grams > 0 && grams < 300000) return { weight: grams / 453.592, unit: 'g' };
        }

        return null;
    },

    _notifyListeners(weight) {
        this.weightListeners.forEach(fn => { try { fn(weight); } catch(e) {} });
    },

    _updateWeightDisplays() {
        const w = this.currentWeight;
        const fields = ['sale-weight','live-weight','processed-weight','order-weight','delivery-weight','edit-sale-weight'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el && document.activeElement !== el) {
                const current = parseFloat(el.value) || 0;
                if (Math.abs(current - w) > 0.005) {
                    el.value = w.toFixed(3);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        });

        const valueEl = document.getElementById('scale-weight-value');
        if (valueEl) valueEl.textContent = w.toFixed(3) + ' lb';

        const indicator = document.getElementById('scale-weight-indicator');
        if (indicator) indicator.style.display = 'flex';
    },

    onWeight(fn) {
        this.weightListeners.push(fn);
        return () => { this.weightListeners = this.weightListeners.filter(f => f !== fn); };
    },

    async disconnect() {
        if (this.device && this.device.gatt.connected) this.device.gatt.disconnect();
        this.device = null;
        this.characteristic = null;
        this.isConnected = false;
        this.currentWeight = 0;
        this.activeScaleId = null;
        localStorage.removeItem(this.ACTIVE_KEY);
        this.updateUI();
        Utils.showNotification('Balanza desconectada', 'info', 2000);
    },

    removeScale(id) {
        this.savedScales = this.savedScales.filter(s => s.id !== id);
        if (this.activeScaleId === id) { this.activeScaleId = null; this.disconnect(); }
        this._saveSavedScales();
        this.updateUI();
    },

    async connectToSaved(id) {
        if (navigator.bluetooth.getDevices) {
            try {
                const devices = await navigator.bluetooth.getDevices();
                const device = devices.find(d => d.id === id);
                if (device) {
                    this.device = device;
                    this.activeScaleId = id;
                    this._saveSavedScales();
                    await this._connectToDevice();
                    Utils.showNotification(`Balanza "${device.name}" conectada`, 'success', 2000);
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
        const el = document.getElementById(fieldId);
        if (el) {
            el.value = this.currentWeight.toFixed(3);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.style.borderColor = 'var(--primary)';
            setTimeout(() => el.style.borderColor = '', 1000);
        }
    },

    showDebugLog() {
        if (this._rawLog.length === 0) {
            Utils.showNotification('No hay datos recibidos aún', 'info', 2000);
            return;
        }
        const lines = this._rawLog.slice(0, 5).map(e => {
            const hex = e.bytes.map(b => b.toString(16).padStart(2,'0')).join(' ');
            const ascii = e.bytes.map(b => b >= 32 && b < 127 ? String.fromCharCode(b) : '.').join('');
            return `HEX: ${hex}\nASCII: ${ascii}`;
        }).join('\n---\n');

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-bug"></i> Debug Balanza</h3>
                    <button class="close-modal" onclick="this.closest('.modal').remove()"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <p style="color:var(--gray);font-size:0.85rem;">Últimos datos recibidos:</p>
                    <pre style="background:#1e1e1e;color:#0f0;padding:15px;border-radius:8px;font-size:0.8rem;overflow-x:auto;white-space:pre-wrap;">${lines}</pre>
                    <p style="color:var(--gray);font-size:0.85rem;margin-top:10px;">Peso actual: <strong>${this.currentWeight.toFixed(3)} lb</strong> (${this.currentUnit})</p>
                </div>
            </div>`;
        document.body.appendChild(modal);
    },

    showScalesPanel() {
        const scalesList = this.savedScales.length === 0
            ? '<p style="color:var(--gray);text-align:center;padding:20px;">No hay balanzas guardadas</p>'
            : this.savedScales.map(s => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--light);border-radius:8px;margin-bottom:8px;">
                    <div>
                        <div style="font-weight:600;"><i class="fas fa-weight"></i> ${s.name}</div>
                        <small style="color:var(--gray);">Última vez: ${new Date(s.lastSeen).toLocaleDateString('es-ES')}</small>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        ${this.activeScaleId === s.id && this.isConnected
                            ? '<span style="color:var(--success);font-size:0.85rem;"><i class="fas fa-circle"></i> Conectada</span>'
                            : `<button class="btn btn-outline" style="padding:6px 12px;font-size:0.85rem;" onclick="BluetoothScale.connectToSaved('${s.id}');this.closest('.modal').remove()"><i class="fas fa-bluetooth"></i> Conectar</button>`
                        }
                        <button class="btn btn-danger" style="padding:6px 10px;font-size:0.85rem;" onclick="BluetoothScale.removeScale('${s.id}');this.closest('.modal').remove();BluetoothScale.showScalesPanel()"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`).join('');

        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h3><i class="fas fa-weight"></i> Mis Balanzas</h3>
                    <button class="close-modal" onclick="this.closest('.modal').remove()"><i class="fas fa-times"></i></button>
                </div>
                <div class="modal-body">
                    ${scalesList}
                    <button class="btn btn-primary" style="width:100%;margin-top:12px;" onclick="this.closest('.modal').remove();BluetoothScale.connect()">
                        <i class="fas fa-plus"></i> Agregar nueva balanza
                    </button>
                    ${this.isConnected ? `
                    <button class="btn btn-outline" style="width:100%;margin-top:8px;" onclick="BluetoothScale.showDebugLog()">
                        <i class="fas fa-bug"></i> Ver datos crudos (debug)
                    </button>` : ''}
                </div>
            </div>`;
        document.body.appendChild(modal);
    },

    updateUI() {
        const toggle = document.getElementById('scale-switch');
        const status = document.getElementById('scale-status-sidebar');
        const valueEl = document.getElementById('scale-weight-value');
        const indicator = document.getElementById('scale-weight-indicator');

        if (toggle) { toggle.checked = this.isConnected; toggle.disabled = this.isConnecting; }

        if (status) {
            if (this.isConnecting) {
                status.textContent = 'Conectando...';
                status.style.color = 'var(--warning)';
            } else if (this.isConnected) {
                status.textContent = this.device?.name || 'Balanza';
                status.style.color = 'rgba(76, 175, 80, 0.9)';
            } else {
                const saved = this.savedScales.find(s => s.id === this.activeScaleId);
                status.textContent = saved ? `${saved.name} (desconectada)` : 'Toca para conectar';
                status.style.color = '';
            }
        }

        document.querySelectorAll('.scale-capture-btn').forEach(btn => {
            btn.style.display = this.isConnected ? 'flex' : 'none';
        });

        if (indicator) indicator.style.display = this.isConnected ? 'flex' : 'none';
        if (valueEl && !this.isConnected) valueEl.textContent = '0.000 lb';
    }
};
