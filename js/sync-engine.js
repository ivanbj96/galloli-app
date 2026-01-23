// Motor de Sincronización P2P en Tiempo Real - GallOli Cloud Sync
// Arquitectura: WebSocket para tiempo real + API REST para persistencia

const SYNC_CONFIG = {
    API_URL: 'https://galloli-sync.ivanbj-96.workers.dev',
    WS_URL: 'wss://galloli-sync.ivanbj-96.workers.dev/ws',
    SYNC_INTERVAL: 30000, // 30 segundos (fallback)
    RETRY_DELAY: 3000
};

class SyncEngine {
    constructor() {
        this.ws = null;
        this.isOnline = navigator.onLine;
        this.isSyncing = false;
        this.syncInterval = null;
        this.reconnectTimeout = null;
    }

    async init() {
        console.log('🔄 Inicializando sincronización P2P...');
        
        if (!window.AuthManager?.isAuthenticated()) {
            console.log('⚠️ No autenticado');
            return;
        }

        // 1. Conectar WebSocket
        this.connectWebSocket();

        // 2. Sincronización inicial completa
        await this.fullSync();

        // 3. Esperar a que los módulos estén listos antes de interceptar
        setTimeout(() => {
            this.interceptChanges();
        }, 2000);

        // 4. Detectar online/offline
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());

        console.log('✅ Sincronización P2P activa');
    }

    connectWebSocket() {
        if (!window.AuthManager?.isAuthenticated()) return;

        const user = window.AuthManager.user;
        const business = window.AuthManager.business;
        
        const wsUrl = `${SYNC_CONFIG.WS_URL}?business_id=${business.id}&user_id=${user.id}&user_name=${encodeURIComponent(user.name)}`;
        
        console.log('🔌 Conectando WebSocket...');
        
        try {
            this.ws = new WebSocket(wsUrl);
            
            this.ws.onopen = () => {
                console.log('✅ WebSocket conectado');
            };
            
            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleWebSocketMessage(message);
                } catch (error) {
                    console.error('Error procesando mensaje:', error);
                }
            };
            
            this.ws.onerror = (error) => {
                console.error('❌ Error WebSocket:', error);
            };
            
            this.ws.onclose = () => {
                console.log('🔌 WebSocket desconectado');
                this.ws = null;
                // Reconectar después de 3 segundos
                this.reconnectTimeout = setTimeout(() => this.connectWebSocket(), SYNC_CONFIG.RETRY_DELAY);
            };
        } catch (error) {
            console.error('Error creando WebSocket:', error);
        }
    }

    handleWebSocketMessage(message) {
        console.log('📨 Mensaje recibido:', message.type);
        
        switch (message.type) {
            case 'connected':
                console.log('✅ Conectado al servidor');
                break;
                
            case 'change':
                // Otro usuario hizo un cambio
                const dataType = message.data?.data_type;
                if (dataType) {
                    console.log('🔔 Cambio remoto detectado:', dataType);
                    // Sincronizar solo ese tipo de dato
                    this.syncDataType(dataType);
                }
                break;
                
            case 'presence':
                console.log(`👥 ${message.users?.length || 0} usuarios online`);
                break;
        }
    }

    async syncDataType(dataType) {
        console.log('🔄 Sincronizando:', dataType);
        
        try {
            // Obtener datos remotos de ese tipo
            const response = await fetch(`${SYNC_CONFIG.API_URL}/api/sync/full`, {
                headers: window.AuthManager.getAuthHeaders()
            });
            
            if (!response.ok) return;
            
            const result = await response.json();
            
            // Filtrar solo el tipo de dato que cambió
            const items = (result.data || [])
                .filter(item => item.data_type === dataType)
                .map(item => item.data);
            
            // Guardar localmente
            for (const item of items) {
                await this.saveLocal(dataType, item);
            }
            
            // Recargar UI
            await this.reloadUI(dataType);
            
            console.log(`✅ ${items.length} items sincronizados (${dataType})`);
            
        } catch (error) {
            console.error('Error sincronizando:', error);
        }
    }

    async saveLocal(dataType, data) {
        const storeMap = {
            'clients': 'clients',
            'sales': 'sales',
            'orders': 'orders',
            'expenses': 'expenses',
            'prices': 'prices',
            'mermaRecords': 'mermaRecords',
            'diezmos': 'diezmos',
            'paymentHistory': 'paymentHistory',
            'config': 'config'
        };
        
        const store = storeMap[dataType];
        if (store) {
            await DB.set(store, data);
        }
    }

    async deleteLocal(dataType, id) {
        const storeMap = {
            'clients': 'clients',
            'sales': 'sales',
            'orders': 'orders',
            'expenses': 'expenses',
            'prices': 'prices',
            'mermaRecords': 'mermaRecords',
            'diezmos': 'diezmos',
            'paymentHistory': 'paymentHistory',
            'config': 'config'
        };
        
        const store = storeMap[dataType];
        if (store) {
            await DB.delete(store, id);
        }
    }

    async reloadUI(dataType) {
        console.log('🔄 Recargando UI:', dataType);
        
        // Recargar módulo específico
        switch(dataType) {
            case 'clients':
                if (window.ClientsModule) {
                    await ClientsModule.loadClients();
                    ClientsModule.updateClientList();
                    ClientsModule.updateClientSelect();
                }
                break;
                
            case 'sales':
                if (window.SalesModule) {
                    await SalesModule.loadSales();
                    if (window.App?.currentPage === 'sales') {
                        SalesModule.updateSalesList(window.App.currentDate);
                    }
                }
                break;
                
            case 'orders':
                if (window.OrdersModule) {
                    await OrdersModule.loadOrders();
                    if (window.App?.currentPage === 'orders') {
                        OrdersModule.updateOrdersList();
                    }
                }
                break;
                
            case 'expenses':
                if (window.AccountingModule) {
                    await AccountingModule.loadExpenses();
                    if (window.App?.currentPage === 'accounting') {
                        AccountingModule.updateAccounting(window.App.currentDate);
                    }
                }
                break;
                
            case 'prices':
                if (window.MermaModule) {
                    await MermaModule.loadDailyPrices();
                }
                break;
                
            case 'mermaRecords':
                if (window.MermaModule) {
                    await MermaModule.loadMermaRecords();
                }
                break;
                
            case 'paymentHistory':
                if (window.PaymentHistoryModule) {
                    await PaymentHistoryModule.loadPayments();
                }
                break;
        }
    }

    async fullSync() {
        if (this.isSyncing) return;
        
        this.isSyncing = true;
        console.log('🔄 Sincronización completa iniciada...');
        
        try {
            // 1. Obtener datos locales
            const localData = await this.getLocalData();
            
            // 2. Obtener datos remotos
            const remoteData = await this.getRemoteData();
            
            // 3. Subir datos locales
            await this.uploadData(localData);
            
            // 4. Descargar y aplicar datos remotos
            await this.downloadData(remoteData);
            
            // 5. Recargar toda la UI
            await this.reloadAllModules();
            
            console.log('✅ Sincronización completa');
            
        } catch (error) {
            console.error('❌ Error en sincronización:', error);
        } finally {
            this.isSyncing = false;
        }
    }

    async getLocalData() {
        console.log('📦 Obteniendo datos locales...');
        
        return {
            clients: await DB.getAll('clients') || [],
            sales: await DB.getAll('sales') || [],
            orders: await DB.getAll('orders') || [],
            expenses: await DB.getAll('expenses') || [],
            prices: await DB.getAll('prices') || [],
            mermaRecords: await DB.getAll('mermaRecords') || [],
            diezmos: await DB.getAll('diezmos') || [],
            paymentHistory: await DB.getAll('paymentHistory') || [],
            config: await DB.getAll('config') || []
        };
    }

    async getRemoteData() {
        console.log('☁️ Obteniendo datos remotos...');
        
        try {
            const response = await fetch(`${SYNC_CONFIG.API_URL}/api/sync/full`, {
                headers: window.AuthManager.getAuthHeaders()
            });
            
            if (!response.ok) throw new Error('Error obteniendo datos remotos');
            
            const result = await response.json();
            
            // Organizar por tipo
            const data = {
                clients: [],
                sales: [],
                orders: [],
                expenses: [],
                prices: [],
                mermaRecords: [],
                diezmos: [],
                paymentHistory: [],
                config: []
            };
            
            (result.data || []).forEach(item => {
                if (data[item.data_type]) {
                    data[item.data_type].push(item.data);
                }
            });
            
            return data;
        } catch (error) {
            console.error('Error obteniendo datos remotos:', error);
            return { clients: [], sales: [], orders: [], expenses: [], prices: [], mermaRecords: [], diezmos: [], paymentHistory: [], config: [] };
        }
    }

    async uploadData(localData) {
        console.log('📤 Subiendo datos locales...');
        
        const changes = [];
        
        for (const [dataType, items] of Object.entries(localData)) {
            items.forEach(item => {
                const itemId = item.id || item.key || item.date || `${dataType}_${Date.now()}`;
                changes.push({
                    data_type: dataType,
                    data_id: itemId,
                    action: 'upsert',
                    data: item,
                    timestamp: Date.now()
                });
            });
        }
        
        if (changes.length === 0) return;
        
        // Subir en lotes de 50
        const batchSize = 50;
        for (let i = 0; i < changes.length; i += batchSize) {
            const batch = changes.slice(i, i + batchSize);
            
            try {
                await fetch(`${SYNC_CONFIG.API_URL}/api/sync/push`, {
                    method: 'POST',
                    headers: window.AuthManager.getAuthHeaders(),
                    body: JSON.stringify({ changes: batch })
                });
                
                console.log(`✅ Lote ${Math.floor(i / batchSize) + 1} subido`);
            } catch (error) {
                console.error('Error subiendo lote:', error);
            }
        }
    }

    async downloadData(remoteData) {
        console.log('📥 Descargando datos remotos...');
        
        for (const [dataType, items] of Object.entries(remoteData)) {
            for (const item of items) {
                await this.saveLocal(dataType, item);
            }
        }
    }

    async reloadAllModules() {
        console.log('🔄 Recargando todos los módulos...');
        
        try {
            if (window.ClientsModule) {
                await ClientsModule.loadClients();
                ClientsModule.updateClientList();
                ClientsModule.updateClientSelect();
            }
            
            if (window.SalesModule) {
                await SalesModule.loadSales();
            }
            
            if (window.OrdersModule) {
                await OrdersModule.loadOrders();
            }
            
            if (window.AccountingModule) {
                await AccountingModule.loadExpenses();
            }
            
            if (window.MermaModule) {
                await MermaModule.loadDailyPrices();
                await MermaModule.loadMermaRecords();
            }
            
            if (window.PaymentHistoryModule) {
                await PaymentHistoryModule.loadPayments();
            }
            
            // Recargar página actual
            if (window.App?.currentPage) {
                window.App.loadPage(window.App.currentPage);
            }
            
        } catch (error) {
            console.error('Error recargando módulos:', error);
        }
    }

    interceptChanges() {
        console.log('🎯 Interceptando cambios locales...');
        
        let interceptorsInstalled = 0;
        
        // Clientes
        if (window.ClientsModule?.saveClients) {
            const original = ClientsModule.saveClients;
            ClientsModule.saveClients = async () => {
                await original.call(ClientsModule);
                console.log('📤 Cambio detectado: clients');
                this.notifyChange('clients');
            };
            interceptorsInstalled++;
        } else {
            console.warn('⚠️ ClientsModule.saveClients no disponible');
        }
        
        // Ventas
        if (window.SalesModule?.saveSales) {
            const original = SalesModule.saveSales;
            SalesModule.saveSales = async () => {
                await original.call(SalesModule);
                console.log('📤 Cambio detectado: sales');
                this.notifyChange('sales');
            };
            interceptorsInstalled++;
        } else {
            console.warn('⚠️ SalesModule.saveSales no disponible');
        }
        
        // Pedidos
        if (window.OrdersModule?.saveOrders) {
            const original = OrdersModule.saveOrders;
            OrdersModule.saveOrders = async () => {
                await original.call(OrdersModule);
                console.log('📤 Cambio detectado: orders');
                this.notifyChange('orders');
            };
            interceptorsInstalled++;
        } else {
            console.warn('⚠️ OrdersModule.saveOrders no disponible');
        }
        
        // Gastos
        if (window.AccountingModule?.saveExpenses) {
            const original = AccountingModule.saveExpenses;
            AccountingModule.saveExpenses = async () => {
                await original.call(AccountingModule);
                console.log('📤 Cambio detectado: expenses');
                this.notifyChange('expenses');
            };
            interceptorsInstalled++;
        } else {
            console.warn('⚠️ AccountingModule.saveExpenses no disponible');
        }
        
        // Precios
        if (window.MermaModule?.saveDailyPrices) {
            const original = MermaModule.saveDailyPrices;
            MermaModule.saveDailyPrices = async () => {
                await original.call(MermaModule);
                console.log('📤 Cambio detectado: prices');
                this.notifyChange('prices');
            };
            interceptorsInstalled++;
        } else {
            console.warn('⚠️ MermaModule.saveDailyPrices no disponible');
        }
        
        // Merma
        if (window.MermaModule?.saveMermaRecords) {
            const original = MermaModule.saveMermaRecords;
            MermaModule.saveMermaRecords = async () => {
                await original.call(MermaModule);
                console.log('📤 Cambio detectado: mermaRecords');
                this.notifyChange('mermaRecords');
            };
            interceptorsInstalled++;
        } else {
            console.warn('⚠️ MermaModule.saveMermaRecords no disponible');
        }
        
        // Historial de pagos
        if (window.PaymentHistoryModule?.savePayments) {
            const original = PaymentHistoryModule.savePayments;
            PaymentHistoryModule.savePayments = async () => {
                await original.call(PaymentHistoryModule);
                console.log('📤 Cambio detectado: paymentHistory');
                this.notifyChange('paymentHistory');
            };
            interceptorsInstalled++;
        } else {
            console.warn('⚠️ PaymentHistoryModule.savePayments no disponible');
        }
        
        console.log(`✅ ${interceptorsInstalled} interceptores instalados`);
    }

    notifyChange(dataType) {
        // Enviar notificación simple via WebSocket
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'change',
                data: {
                    data_type: dataType,
                    action: 'sync_request',
                    timestamp: Date.now()
                }
            }));
            console.log('✅ Notificación enviada via WebSocket:', dataType);
        } else {
            console.warn('⚠️ WebSocket no conectado');
        }
    }

    startPeriodicSync() {
        // Sincronización periódica desactivada - solo WebSocket en tiempo real
        console.log('⏰ Sincronización periódica desactivada (solo WebSocket)');
    }

    handleOnline() {
        console.log('🌐 Conexión restaurada');
        this.isOnline = true;
        this.connectWebSocket();
        this.fullSync();
    }

    handleOffline() {
        console.log('📴 Sin conexión');
        this.isOnline = false;
    }
}

// Instancia global
window.SyncEngine = new SyncEngine();
