// Módulo de Balanza Bluetooth BLE — GallOli
const BluetoothScale = {
    device: null,
    characteristic: null,
    isConnected: false,
    isConnecting: false,
    currentWeight: 0,
    weightListeners: [],
    STORAGE_KEY: 'galloli_scales',  // Lista de balanzas guardadas
    ACTIVE_KEY: 'galloli_scale_active', // ID de la balanza activa
    savedScales: [],   // [{ id, name, lastSeen }]
    activeScaleId: null,
    _rawLog: [],       // Log de bytes crudos para debug

    async init() {
        if (!this.isSupported()) return;
        this._loadSavedScales();
        this.updateUI();

        // Intentar reconectar automáticamente si hay balanza activa guardada
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

    // Intentar reconectar sin mostrar selector (usa dispositivos ya autorizados)
    async _tryAutoReconnect() {
        if (!navigator.bluetooth.getDevices) return; // API no disponible
        try {
            const devices = await navigator.bluetooth.getDevices();
            const saved = this.savedScales.find(s => s.id === this.activeScaleId);
            if (!saved) return;

            const device = devices.find(d => d.id === this.activeScaleId || d.name === saved.name);
            if (device) {
                this.device = device;
                await this._connectToDevice();
                Utils.showNotification(`Balanza "${device.name || saved.name}" reconectada`, 'success', 2000);
            }
        } catch(e) {
            // Silencioso — el usuario puede conectar manualmente
        }
    },

    // Conectar — abre selector de dispositivos
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
                optionalServices: [
                    '0000fff0-0000-1000-8000-00805f9b34fb',
                    '0000ffe0-0000-1000-8000-00805f9b34fb',
                    '0000ffe5-0000-1000-8000-00805f9b34fb',
                    '00001809-0000-1000-8000-00805f9b34fb',
                    '0000181d-0000-1000-8000-00805f9b34fb',
                    '0000181b-0000-1000-8000-00805f9b34fb',
                    '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC BLE
                    'generic_access',
                    'generic_attribute'
                ]
            });

            await this._connectToDevice();

            // Guardar en lista de balanzas
            const existing = this.savedScales.findIndex(s => s.id === this.device.id);
            const entry = { id: this.device.id, name: this.device.name || 'Balanza', lastSeen: Date.now() };
            if (existing > -1) {
                this.savedScales[existing] = entry;
            } else {
                this.savedScales.push(entry);
            }
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
            // Reconexión automática
            setTimeout(() => this._tryAutoReconnect(), 3000);
        });

        // Descubrir todos los servicios y suscribirse a notificaciones
        const services = await server.getPrimaryServices();
        this._rawLog = [];
        let subscribed = 0;

        for (const service of services) {
            try {
                const chars = await service.getCharacteristics();
                for (const char of chars) {
                    if (char.properties.notify || char.properties.indicate) {
                        try {
                            await char.startNotifications();
                            char.addEventListener('characteristicvaluechanged', (e) => {
                                this._handleData(e.target.value, service.uuid, char.uuid);
                            });
                            subscribed++;
                        } catch(e) { /* continuar */ }
                    }
                    // También leer valor actual si es readable
                    if (char.properties.read) {
                        try {
                            const val = await char.readValue();
                            this._handleData(val, service.uuid, char.uuid);
                        } catch(e) { /* continuar */ }
                    }
                }
            } catch(e) { /* continuar */ }
        }

        if (subscribed === 0) {
            throw new Error('No se encontraron características de notificación en la balanza');
        }

        this.isConnected = true;
        this.updateUI();
    },

    // Manejar datos recibidos — log para debug + parseo
    _handleData(dataView, serviceUuid, charUuid) {
        // Guardar log de bytes crudos (últimos 20)
        const bytes = Array.from(new Uint8Array(dataView.buffer));
        const entry = { bytes, serviceUuid, charUuid, ts: Date.now() };
        this._rawLog.unshift(entry);
        if (this._rawLog.length > 20) this._rawLog.pop();

        const weight = this._parseWeight(dataView, bytes);
        if (weight !== null && weight > 0 && weight < 2000) {
            this.currentWeight = parseFloat(weight.toFixed(3));
            this._notifyListeners(this.currentWeight);
            this._updateWeightDisplays();
        }
    },

    // Parser multi-formato
    _parseWeight(dataView, bytes) {
        // --- Formato 1: BLE Weight Scale estándar (0x181D) ---
        // Byte 0: flags (bit0=0:kg, bit0=1:lb), Bytes 1-2: peso uint16 LE
        if (bytes.length >= 3) {
            const flags = bytes[0];
            const raw = dataView.getUint16(1, true);
            if (raw > 0) {
                if (flags & 0x01) return raw * 0.01;          // lb (res 0.01)
                else return (raw * 0.005) * 2.20462;           // kg→lb (res 5g)
            }
        }

        // --- Formato 2: ASCII/texto (ej: "  1.234 kg\r\n" o "ST,GS,+  1.234kg") ---
        try {
            const text = new TextDecoder('utf-8', { fatal: false }).decode(dataView.buffer).trim();
            if (text.length > 0) {
                // Buscar número seguido de unidad
                const match = text.match(/([+-]?\d+\.?\d*)\s*(kg|lb|g|KG|LB|G)/i);
                if (match) {
                    let val = parseFloat(match[1]);
                    const unit = match[2].toLowerCase();
                    if (unit === 'kg') return val * 2.20462;
                    if (unit === 'g')  return val / 453.592;
                    return val; // lb
                }
                // Solo número sin unidad
                const numMatch = text.match(/([+-]?\d+\.?\d+)/);
                if (numMatch) {
                    const val = parseFloat(numMatch[1]);
                    if (val > 0 && val < 500) return val; // Asumir lb
                }
            }
        } catch(e) {}

        // --- Formato 3: 2 bytes big-endian en gramos (balanzas chinas comunes) ---
        if (bytes.length >= 2) {
            const grams = (bytes[0] << 8) | bytes[1];
            if (grams > 0 && grams < 300000) return grams / 453.592;
        }

        // --- Formato 4: 2 bytes little-endian en gramos ---
        if (bytes.length >= 2) {
            const grams = dataView.getUint16(0, true);
            if (grams > 0 && grams < 300000) return grams / 453.592;
        }

        // --- Formato 5: Byte 4-5 como peso (algunas balanzas con header) ---
        if (bytes.length >= 6) {
            const raw = (bytes[4] << 8) | bytes[5];
            if (raw > 0 && raw < 50000) return raw / 100; // Asumir lb×100
        }

        return null;
    },

    _notifyListeners(weight) {
        this.weightListeners.forEach(fn => { try { fn(weight); } catch(e) {} });
    },

    _updateWeightDisplays() {
        const w = this.currentWeight;
        const fields = ['sale-weight','live-weight','processed-weight','order-weight','delivery-weight','edit-sale-weight'];

        // Solo actualizar si el campo NO está enfocado (no interrumpir al usuario)
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el && document.activeElement !== el) {
                // Solo actualizar si el valor cambió significativamente (>0.01 lb)
                const current = parseFloat(el.value) || 0;
                if (Math.abs(current - w) > 0.01) {
                    el.value = w.toFixed(3);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        });

        // Indicador flotante
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
        if (this.device && this.device.gatt.connected) {
            this.device.gatt.disconnect();
        }
        this.device = null;
        this.characteristic = null;
        this.isConnected = false;
        this.currentWeight = 0;
        this.activeScaleId = null;
        localStorage.removeItem(this.ACTIVE_KEY);
        this.updateUI();
        Utils.showNotification('Balanza desconectada', 'info', 2000);
    },

    // Eliminar una balanza guardada
    removeScale(id) {
        this.savedScales = this.savedScales.filter(s => s.id !== id);
        if (this.activeScaleId === id) {
            this.activeScaleId = null;
            this.disconnect();
        }
        this._saveSavedScales();
        this.updateUI();
    },

    // Conectar a una balanza guardada específica
    async connectToSaved(id) {
        if (!navigator.bluetooth.getDevices) {
            // Fallback: abrir selector
            return this.connect();
        }
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
        // Si no se puede reconectar sin selector, abrir selector
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

    // Mostrar log de bytes crudos para debug (ayuda a identificar el protocolo)
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
                    <p style="color:var(--gray);font-size:0.85rem;">Últimos datos recibidos (comparte esto si el peso no funciona):</p>
                    <pre style="background:#1e1e1e;color:#0f0;padding:15px;border-radius:8px;font-size:0.8rem;overflow-x:auto;white-space:pre-wrap;">${lines}</pre>
                    <p style="color:var(--gray);font-size:0.85rem;margin-top:10px;">Peso actual: <strong>${this.currentWeight.toFixed(3)} lb</strong></p>
                </div>
            </div>`;
        document.body.appendChild(modal);
    },

    // Mostrar panel de gestión de balanzas
    showScalesPanel() {
        const scalesList = this.savedScales.length === 0
            ? '<p style="color:var(--gray);text-align:center;">No hay balanzas guardadas</p>'
            : this.savedScales.map(s => `
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--light);border-radius:8px;margin-bottom:8px;">
                    <div>
                        <div style="font-weight:600;">${s.name}</div>
                        <small style="color:var(--gray);">Última vez: ${new Date(s.lastSeen).toLocaleDateString('es-ES')}</small>
                    </div>
                    <div style="display:flex;gap:8px;">
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

        if (toggle) {
            toggle.checked = this.isConnected;
            toggle.disabled = this.isConnecting;
        }

        if (status) {
            if (this.isConnecting) {
                status.textContent = 'Conectando...';
                status.style.color = 'var(--warning)';
            } else if (this.isConnected) {
                const name = this.device?.name || 'Balanza';
                status.textContent = name;
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

        if (indicator) {
            indicator.style.display = this.isConnected ? 'flex' : 'none';
        }
        if (valueEl && !this.isConnected) {
            valueEl.textContent = '0.000 lb';
        }
    }
};
