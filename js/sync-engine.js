// Motor de Sincronización en Tiempo Real - GallOli Cloud Sync
// Sincroniza datos automáticamente con WebSocket + API REST

const SYNC_CONFIG = {
    API_URL: 'https://galloli-sync.ivanbj-96.workers.dev',
    WS_URL: 'wss://galloli-sync.ivanbj-96.workers.dev/ws',
    SYNC_INTERVAL: 30000, // 30 segundos
    RETRY_DELAY: 5000, // 5 segundos
    MAX_RETRIES: 3
};

class SyncEngine {
    constructor() {
        this.ws = null;
        this.syncInterval = null;
        this.isOnline = navigator.onLine;
        this.isSyncing = false;
        this.pendingChanges = [];
        this.lastSyncTime = 0;
        this.retryCount = 0;
        this.initialized = false;
    }

    async init() {
        if (this.initialized) return;
        
        console.log('🔄 Inicializando motor de sincronización...');
        
        // Verificar autenticación
        if (!window.AuthManager.isAuthenticated()) {
            console.log('⚠️ No autenticado, sincronización deshabilitada');
            return;
        }
        
        // Cargar cambios pendientes
        await this.loadPendingChanges();
        
        // Conectar WebSocket
        this.connectWebSocket();
        
        // Sincronización periódica (fallback)
        this.startPeriodicSync();
        
        // Detectar cambios de conectividad
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        
        // Interceptar cambios en módulos
        this.interceptModuleChanges();
        
        this.initialized = true;
        console.log('✅ Motor de sincronización inicializado');
    }

    connectWebSocket() {
        if (!window.AuthManager.isAuthenticated()) return;
        
        const user = window.AuthManager.user;
        const business = window.AuthManager.business;
        
        const wsUrl = `${SYNC_CONFIG.WS_URL}?business_id=${business.id}&user_id=${user.id}&user_name=${encodeURIComponent(user.name)}`;
        
        console.log('🔌 Conectando WebSocket...');
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('✅ WebSocket conectado');
                this.retryCount = 0;
                
                // Sincronizar al conectar
                this.syncNow();
            };
            
            this.ws.onmessage = (event) => {
                this.handleWebSocketMessage(event.data);
            };
            
            this.ws.onerror = (error) => {
                console.error('❌ Error WebSocket:', error);
            };
            
            this.ws.onclose = () => {
                console.log('🔌 WebSocket desconectado');
                this.ws = null;
                
                // Reintentar conexión
                if (this.retryCount < SYNC_CONFIG.MAX_RETRIES) {
                    this.retryCount++;
                    setTimeout(() => this.connectWebSocket(), SYNC_CONFIG.RETRY_DELAY);
                }
            };
        } catch (error) {
            console.error('❌ Error creando WebSocket:', error);
        }
    }

    handleWebSocketMessage(data) {
        try {
            const message = JSON.parse(data);
            console.log('📨 Mensaje WebSocket:', message);
            
            switch (message.type) {
                case 'change':
                    // Otro usuario hizo un cambio
                    this.applyRemoteChange(message.data);
                    break;
                    
                case 'presence':
                    // Actualizar usuarios online
                    this.updatePresence(message.users);
                    break;
                    
                case 'sync_request':
                    // Servidor solicita sincronización
                    this.syncNow();
                    break;
            }
        } catch (error) {
            console.error('Error procesando mensaje WebSocket:', error);
        }
    }

    async applyRemoteChange(change) {
        console.log('📥 Aplicando cambio remoto:', change);
        
        try {
            const { data_type, data, action } = change;
            
            if (action === 'delete') {
                // Eliminar dato
                await this.deleteLocalData(data_type, data.id);
            } else {
                // Crear o actualizar dato
                await this.updateLocalData(data_type, data);
            }
            
            // Recargar UI si es necesario
            this.reloadUIIfNeeded(data_type);
            
            // Notificar al usuario
            this.showSyncNotification(`Datos actualizados: ${data_type}`);
        } catch (error) {
            console.error('Error aplicando cambio remoto:', error);
        }
    }

    async updateLocalData(dataType, data) {
        const storeMap = {
            'clients': 'clients',
            'sales': 'sales',
            'orders': 'orders',
            'expenses': 'expenses',
            'prices': 'prices'
        };
        
        const storeName = storeMap[dataType];
        if (!storeName) return;
        
        await DB.set(storeName, data);
    }

    async deleteLocalData(dataType, id) {
        const storeMap = {
            'clients': 'clients',
            'sales': 'sales',
            'orders': 'orders',
            'expenses': 'expenses'
        };
        
        const storeName = storeMap[dataType];
        if (!storeName) return;
        
        await DB.delete(storeName, id);
    }

    reloadUIIfNeeded(dataType) {
        // Recargar la página actual si corresponde
        const currentPage = window.App?.currentPage;
        
        const reloadMap = {
            'clients': ['clients', 'sales', 'orders', 'dashboard'],
            'sales': ['sales', 'dashboard', 'stats', 'accounting'],
            'orders': ['orders', 'dashboard'],
            'expenses': ['accounting', 'stats']
        };
        
        const pagesToReload = reloadMap[dataType] || [];
        
        if (pagesToReload.includes(currentPage)) {
            console.log('🔄 Recargando página actual...');
            window.App.loadPage(currentPage);
        }
    }

    showSyncNotification(message) {
        // Mostrar notificación discreta
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('GallOli Sync', {
                body: message,
                icon: '/icons/icon-192x192.png',
                badge: '/icons/icon-192x192.png',
                tag: 'sync',
                renotify: false
            });
        }
    }

    interceptModuleChanges() {
        // Interceptar guardado de clientes
        const originalSaveClients = ClientsModule.saveClients;
        ClientsModule.saveClients = async () => {
            await originalSaveClients.call(ClientsModule);
            const clients = await ClientsModule.loadClients();
            this.queueChanges('clients', clients);
        };
        
        // Interceptar guardado de ventas
        const originalSaveSales = SalesModule.saveSales;
        SalesModule.saveSales = async () => {
            await originalSaveSales.call(SalesModule);
            const sales = await SalesModule.loadSales();
            this.queueChanges('sales', sales);
        };
        
        // Interceptar guardado de pedidos
        const originalSaveOrders = OrdersModule.saveOrders;
        OrdersModule.saveOrders = async () => {
            await originalSaveOrders.call(OrdersModule);
            const orders = await OrdersModule.loadOrders();
            this.queueChanges('orders', orders);
        };
        
        // Interceptar guardado de gastos
        const originalSaveExpenses = AccountingModule.saveExpenses;
        AccountingModule.saveExpenses = async () => {
            await originalSaveExpenses.call(AccountingModule);
            const expenses = await AccountingModule.loadExpenses();
            this.queueChanges('expenses', expenses);
        };
        
        console.log('✅ Interceptores de cambios instalados');
    }

    queueChanges(dataType, items) {
        if (!Array.isArray(items)) {
            items = [items];
        }
        
        items.forEach(item => {
            this.pendingChanges.push({
                data_type: dataType,
                data_id: item.id,
                action: 'upsert',
                data: item,
                timestamp: Date.now()
            });
        });
        
        console.log(`📝 ${items.length} cambios en cola (${dataType})`);
        
        // Sincronizar inmediatamente si está online
        if (this.isOnline && !this.isSyncing) {
            this.syncNow();
        }
    }

    async syncNow() {
        if (this.isSyncing) {
            console.log('⏳ Sincronización en progreso...');
            return;
        }
        
        if (!window.AuthManager.isAuthenticated()) {
            console.log('⚠️ No autenticado');
            return;
        }
        
        this.isSyncing = true;
        console.log('🔄 Iniciando sincronización...');
        
        try {
            // 1. Subir cambios pendientes
            if (this.pendingChanges.length > 0) {
                await this.pushChanges();
            }
            
            // 2. Descargar cambios remotos
            await this.pullChanges();
            
            this.lastSyncTime = Date.now();
            console.log('✅ Sincronización completada');
            
        } catch (error) {
            console.error('❌ Error en sincronización:', error);
        } finally {
            this.isSyncing = false;
        }
    }

    async pushChanges() {
        if (this.pendingChanges.length === 0) return;
        
        console.log(`📤 Subiendo ${this.pendingChanges.length} cambios...`);
        
        try {
            const response = await fetch(`${SYNC_CONFIG.API_URL}/api/sync/push`, {
                method: 'POST',
                headers: window.AuthManager.getAuthHeaders(),
                body: JSON.stringify({
                    changes: this.pendingChanges
                })
            });
            
            if (!response.ok) {
                throw new Error('Error subiendo cambios');
            }
            
            const result = await response.json();
            console.log('✅ Cambios subidos:', result);
            
            // Limpiar cambios enviados
            this.pendingChanges = [];
            await this.savePendingChanges();
            
            // Notificar via WebSocket
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'changes_pushed',
                    count: result.results?.length || 0
                }));
            }
            
        } catch (error) {
            console.error('❌ Error subiendo cambios:', error);
            throw error;
        }
    }

    async pullChanges() {
        console.log('📥 Descargando cambios remotos...');
        
        try {
            const url = `${SYNC_CONFIG.API_URL}/api/sync/pull?since=${this.lastSyncTime}`;
            
            const response = await fetch(url, {
                headers: window.AuthManager.getAuthHeaders()
            });
            
            if (!response.ok) {
                throw new Error('Error descargando cambios');
            }
            
            const result = await response.json();
            console.log(`📥 ${result.data?.length || 0} cambios remotos`);
            
            // Aplicar cambios
            for (const change of result.data || []) {
                await this.applyRemoteChange(change);
            }
            
        } catch (error) {
            console.error('❌ Error descargando cambios:', error);
            throw error;
        }
    }

    async loadPendingChanges() {
        try {
            const stored = await DB.get('config', 'pending_changes');
            if (stored && stored.value) {
                this.pendingChanges = stored.value;
                console.log(`📋 ${this.pendingChanges.length} cambios pendientes cargados`);
            }
        } catch (error) {
            console.error('Error cargando cambios pendientes:', error);
        }
    }

    async savePendingChanges() {
        try {
            await DB.set('config', {
                key: 'pending_changes',
                value: this.pendingChanges
            });
        } catch (error) {
            console.error('Error guardando cambios pendientes:', error);
        }
    }

    startPeriodicSync() {
        if (this.syncInterval) return;
        
        this.syncInterval = setInterval(() => {
            if (this.isOnline && !this.isSyncing) {
                this.syncNow();
            }
        }, SYNC_CONFIG.SYNC_INTERVAL);
        
        console.log('⏰ Sincronización periódica iniciada');
    }

    stopPeriodicSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    handleOnline() {
        console.log('🌐 Conexión restaurada');
        this.isOnline = true;
        
        // Reconectar WebSocket
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.connectWebSocket();
        }
        
        // Sincronizar inmediatamente
        this.syncNow();
    }

    handleOffline() {
        console.log('📴 Sin conexión');
        this.isOnline = false;
    }

    updatePresence(users) {
        console.log('👥 Usuarios online:', users);
        // Actualizar UI de presencia si existe
        if (window.App?.currentPage === 'cloud-sync') {
            // Actualizar lista de usuarios online
        }
    }

    async destroy() {
        console.log('🛑 Deteniendo motor de sincronización...');
        
        this.stopPeriodicSync();
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        await this.savePendingChanges();
        
        this.initialized = false;
    }
}

// Instancia global
window.SyncEngine = new SyncEngine();
