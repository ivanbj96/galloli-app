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
        
        // Conectar WebSocket PRIMERO
        this.connectWebSocket();
        
        // Detectar cambios de conectividad
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        
        // Interceptar cambios en módulos
        this.interceptModuleChanges();
        
        // Esperar a que WebSocket se conecte
        await this.waitForWebSocket();
        
        // Verificar si es primera sincronización o necesita sincronizar
        const needsSync = await this.needsFullSync();
        
        if (needsSync) {
            console.log('🆕 Sincronización completa necesaria...');
            await this.performInitialSync();
        } else {
            // Sincronizar cambios incrementales
            console.log('🔄 Sincronizando cambios recientes...');
            await this.syncNow();
        }
        
        // Sincronización periódica (fallback)
        this.startPeriodicSync();
        
        this.initialized = true;
        console.log('✅ Motor de sincronización inicializado');
    }

    async waitForWebSocket(timeout = 5000) {
        const start = Date.now();
        while (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            if (Date.now() - start > timeout) {
                console.warn('⚠️ Timeout esperando WebSocket');
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    async needsFullSync() {
        try {
            const syncStatus = await DB.get('config', 'sync_status');
            if (!syncStatus || !syncStatus.value || !syncStatus.value.last_full_sync) {
                return true;
            }
            
            // Sincronizar si han pasado más de 24 horas
            const dayInMs = 24 * 60 * 60 * 1000;
            const timeSinceLastSync = Date.now() - syncStatus.value.last_full_sync;
            return timeSinceLastSync > dayInMs;
        } catch {
            return true;
        }
    }

    async performInitialSync() {
        try {
            console.log('📤 Iniciando sincronización inicial completa...');
            
            // Mostrar indicador visual
            this.showSyncIndicator('Sincronizando datos...');
            
            // 1. Obtener TODOS los datos locales
            const localData = await this.getAllLocalData();
            
            // 2. Obtener TODOS los datos remotos
            const remoteData = await this.getAllRemoteData();
            
            // 3. Hacer merge inteligente
            const mergedData = await this.mergeData(localData, remoteData);
            
            // 4. Subir datos locales que no existen en remoto
            await this.uploadLocalData(mergedData.toUpload);
            
            // 5. Descargar datos remotos que no existen localmente
            await this.downloadRemoteData(mergedData.toDownload);
            
            // 6. Recargar todos los módulos con los datos actualizados
            await this.reloadAllModules();
            
            // 7. Marcar como sincronizado
            await DB.set('config', {
                key: 'sync_status',
                value: {
                    last_full_sync: Date.now(),
                    synced: true
                }
            });
            
            console.log('✅ Sincronización inicial completada');
            this.hideSyncIndicator();
            this.showSyncNotification('Datos sincronizados correctamente');
            
        } catch (error) {
            console.error('❌ Error en sincronización inicial:', error);
            this.hideSyncIndicator();
            this.showSyncNotification('Error en sincronización. Tus datos locales están seguros.');
        }
    }

    showSyncIndicator(message) {
        // Crear indicador visual discreto
        let indicator = document.getElementById('sync-indicator');
        if (!indicator) {
            indicator = document.createElement('div');
            indicator.id = 'sync-indicator';
            indicator.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: var(--primary);
                color: white;
                padding: 10px 20px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                z-index: 10000;
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 14px;
            `;
            document.body.appendChild(indicator);
        }
        indicator.innerHTML = `
            <i class="fas fa-sync fa-spin"></i>
            <span>${message}</span>
        `;
        indicator.style.display = 'flex';
    }

    hideSyncIndicator() {
        const indicator = document.getElementById('sync-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    async reloadAllModules() {
        console.log('🔄 Recargando todos los módulos...');
        
        try {
            // Recargar clientes
            if (window.ClientsModule) {
                await ClientsModule.loadClients();
                ClientsModule.updateClientList();
                ClientsModule.updateClientSelect();
            }
            
            // Recargar ventas
            if (window.SalesModule) {
                await SalesModule.loadSales();
                if (window.App && window.App.currentPage === 'sales') {
                    SalesModule.updateSalesList(window.App.currentDate);
                }
            }
            
            // Recargar pedidos
            if (window.OrdersModule) {
                await OrdersModule.loadOrders();
                if (window.App && window.App.currentPage === 'orders') {
                    OrdersModule.updateOrdersList();
                }
            }
            
            // Recargar gastos
            if (window.AccountingModule) {
                await AccountingModule.loadExpenses();
                if (window.App && window.App.currentPage === 'accounting') {
                    AccountingModule.updateAccounting(window.App.currentDate);
                }
            }
            
            // Recargar precios y merma
            if (window.MermaModule) {
                await MermaModule.loadDailyPrices();
                await MermaModule.loadMermaRecords();
            }
            
            // Recargar historial de pagos
            if (window.PaymentHistoryModule) {
                await PaymentHistoryModule.loadPayments();
            }
            
            // Recargar página actual
            if (window.App && window.App.currentPage) {
                window.App.loadPage(window.App.currentPage);
            }
            
            console.log('✅ Módulos recargados');
        } catch (error) {
            console.error('Error recargando módulos:', error);
        }
    }

    async getAllLocalData() {
        console.log('📦 Obteniendo datos locales...');
        
        const data = {
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
        
        const total = data.clients.length + data.sales.length + data.orders.length + 
                     data.expenses.length + data.prices.length + data.mermaRecords.length + 
                     data.diezmos.length + data.paymentHistory.length + data.config.length;
        console.log(`📦 ${total} registros locales encontrados`);
        
        return data;
    }

    async getAllRemoteData() {
        console.log('☁️ Obteniendo datos remotos...');
        
        try {
            const response = await fetch(`${SYNC_CONFIG.API_URL}/api/sync/full`, {
                headers: window.AuthManager.getAuthHeaders()
            });
            
            if (!response.ok) {
                throw new Error('Error obteniendo datos remotos');
            }
            
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
            
            const total = data.clients.length + data.sales.length + data.orders.length + 
                         data.expenses.length + data.prices.length + data.mermaRecords.length + 
                         data.diezmos.length + data.paymentHistory.length + data.config.length;
            console.log(`☁️ ${total} registros remotos encontrados`);
            
            return data;
        } catch (error) {
            console.error('Error obteniendo datos remotos:', error);
            return { clients: [], sales: [], orders: [], expenses: [], prices: [], mermaRecords: [], diezmos: [], paymentHistory: [], config: [] };
        }
    }

    async mergeData(localData, remoteData) {
        console.log('🔀 Haciendo merge de datos...');
        
        const toUpload = {
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
        
        const toDownload = {
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
        
        // Para cada tipo de dato
        for (const dataType of ['clients', 'sales', 'orders', 'expenses', 'prices', 'mermaRecords', 'diezmos', 'paymentHistory', 'config']) {
            const local = localData[dataType] || [];
            const remote = remoteData[dataType] || [];
            
            // Crear mapas por ID (o key para config)
            const getKey = (item) => item.id || item.key || item.date;
            const localMap = new Map(local.map(item => [getKey(item), item]));
            const remoteMap = new Map(remote.map(item => [getKey(item), item]));
            
            // Datos locales que no existen en remoto -> SUBIR
            local.forEach(item => {
                const key = getKey(item);
                if (!remoteMap.has(key)) {
                    toUpload[dataType].push(item);
                } else {
                    // Existe en ambos - comparar timestamps
                    const remoteItem = remoteMap.get(key);
                    const localTime = item.timestamp || item.date || item.created_at || 0;
                    const remoteTime = remoteItem.timestamp || remoteItem.date || remoteItem.created_at || 0;
                    
                    // Si local es más reciente, subir
                    if (localTime > remoteTime) {
                        toUpload[dataType].push(item);
                    }
                }
            });
            
            // Datos remotos que no existen localmente -> DESCARGAR
            remote.forEach(item => {
                const key = getKey(item);
                if (!localMap.has(key)) {
                    toDownload[dataType].push(item);
                } else {
                    // Existe en ambos - comparar timestamps
                    const localItem = localMap.get(key);
                    const localTime = localItem.timestamp || localItem.date || localItem.created_at || 0;
                    const remoteTime = item.timestamp || item.date || item.created_at || 0;
                    
                    // Si remoto es más reciente, descargar
                    if (remoteTime > localTime) {
                        toDownload[dataType].push(item);
                    }
                }
            });
        }
        
        const uploadCount = toUpload.clients.length + toUpload.sales.length + toUpload.orders.length + 
                           toUpload.expenses.length + toUpload.prices.length + toUpload.mermaRecords.length + 
                           toUpload.diezmos.length + toUpload.paymentHistory.length + toUpload.config.length;
        const downloadCount = toDownload.clients.length + toDownload.sales.length + toDownload.orders.length + 
                             toDownload.expenses.length + toDownload.prices.length + toDownload.mermaRecords.length + 
                             toDownload.diezmos.length + toDownload.paymentHistory.length + toDownload.config.length;
        
        console.log(`🔀 Merge completado: ${uploadCount} para subir, ${downloadCount} para descargar`);
        
        return { toUpload, toDownload };
    }

    async uploadLocalData(data) {
        const total = data.clients.length + data.sales.length + data.orders.length + data.expenses.length + 
                     data.prices.length + data.mermaRecords.length + data.diezmos.length + 
                     data.paymentHistory.length + data.config.length;
        
        if (total === 0) {
            console.log('✅ No hay datos locales para subir');
            return;
        }
        
        console.log(`📤 Subiendo ${total} registros locales...`);
        
        const changes = [];
        
        for (const dataType of ['clients', 'sales', 'orders', 'expenses', 'prices', 'mermaRecords', 'diezmos', 'paymentHistory', 'config']) {
            data[dataType].forEach(item => {
                const itemId = item.id || item.key || item.date || generateId();
                changes.push({
                    data_type: dataType,
                    data_id: itemId,
                    action: 'upsert',
                    data: item,
                    timestamp: Date.now()
                });
            });
        }
        
        // Subir en lotes de 50
        const batchSize = 50;
        for (let i = 0; i < changes.length; i += batchSize) {
            const batch = changes.slice(i, i + batchSize);
            
            try {
                const response = await fetch(`${SYNC_CONFIG.API_URL}/api/sync/push`, {
                    method: 'POST',
                    headers: window.AuthManager.getAuthHeaders(),
                    body: JSON.stringify({ changes: batch })
                });
                
                if (!response.ok) {
                    throw new Error('Error subiendo lote');
                }
                
                console.log(`✅ Lote ${Math.floor(i / batchSize) + 1} subido`);
            } catch (error) {
                console.error('❌ Error subiendo lote:', error);
            }
        }
        
        console.log('✅ Datos locales subidos');
    }

    async downloadRemoteData(data) {
        const total = data.clients.length + data.sales.length + data.orders.length + data.expenses.length + 
                     data.prices.length + data.mermaRecords.length + data.diezmos.length + 
                     data.paymentHistory.length + data.config.length;
        
        if (total === 0) {
            console.log('✅ No hay datos remotos para descargar');
            return;
        }
        
        console.log(`📥 Descargando ${total} registros remotos...`);
        
        for (const dataType of ['clients', 'sales', 'orders', 'expenses', 'prices', 'mermaRecords', 'diezmos', 'paymentHistory', 'config']) {
            for (const item of data[dataType]) {
                await this.updateLocalData(dataType, item);
            }
        }
        
        console.log('✅ Datos remotos descargados');
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
            'prices': 'prices',
            'mermaRecords': 'mermaRecords',
            'diezmos': 'diezmos',
            'paymentHistory': 'paymentHistory',
            'config': 'config'
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
            'expenses': 'expenses',
            'prices': 'prices',
            'mermaRecords': 'mermaRecords',
            'diezmos': 'diezmos',
            'paymentHistory': 'paymentHistory',
            'config': 'config'
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
            'expenses': ['accounting', 'stats'],
            'prices': ['config', 'dashboard'],
            'mermaRecords': ['merma', 'stats'],
            'diezmos': ['diezmos', 'stats'],
            'paymentHistory': ['payment-history'],
            'config': ['config']
        };
        
        const pagesToReload = reloadMap[dataType] || [];
        
        if (pagesToReload.includes(currentPage)) {
            console.log('🔄 Recargando página actual:', currentPage);
            
            // Recargar datos de los módulos
            switch(currentPage) {
                case 'clients':
                    if (window.ClientsModule) {
                        ClientsModule.updateClientList();
                    }
                    break;
                case 'sales':
                    if (window.SalesModule && window.App) {
                        SalesModule.updateSalesList(window.App.currentDate);
                    }
                    break;
                case 'orders':
                    if (window.OrdersModule) {
                        OrdersModule.updateOrdersList();
                    }
                    break;
                case 'dashboard':
                    // Recargar página completa del dashboard
                    if (window.App) {
                        window.App.loadPage('dashboard');
                    }
                    break;
                case 'stats':
                    if (window.StatsModule && window.App) {
                        StatsModule.updateStats(window.App.currentDate);
                    }
                    break;
                case 'accounting':
                    if (window.AccountingModule && window.App) {
                        AccountingModule.updateAccounting(window.App.currentDate);
                        AccountingModule.updateExpensesList(window.App.currentDate);
                    }
                    break;
                case 'merma':
                    if (window.App) {
                        window.App.loadPage('merma');
                    }
                    break;
                case 'config':
                    if (window.App) {
                        window.App.loadPage('config');
                    }
                    break;
            }
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
        try {
            // Interceptar guardado de clientes
            if (typeof ClientsModule !== 'undefined' && ClientsModule.saveClients) {
                const originalSaveClients = ClientsModule.saveClients;
                ClientsModule.saveClients = async () => {
                    await originalSaveClients.call(ClientsModule);
                    const clients = await ClientsModule.loadClients();
                    this.queueChanges('clients', clients);
                };
            }
            
            // Interceptar guardado de ventas
            if (typeof SalesModule !== 'undefined' && SalesModule.saveSales) {
                const originalSaveSales = SalesModule.saveSales;
                SalesModule.saveSales = async () => {
                    await originalSaveSales.call(SalesModule);
                    const sales = await SalesModule.loadSales();
                    this.queueChanges('sales', sales);
                };
            }
            
            // Interceptar guardado de pedidos
            if (typeof OrdersModule !== 'undefined' && OrdersModule.saveOrders) {
                const originalSaveOrders = OrdersModule.saveOrders;
                OrdersModule.saveOrders = async () => {
                    await originalSaveOrders.call(OrdersModule);
                    const orders = await OrdersModule.loadOrders();
                    this.queueChanges('orders', orders);
                };
            }
            
            // Interceptar guardado de gastos
            if (typeof AccountingModule !== 'undefined' && AccountingModule.saveExpenses) {
                const originalSaveExpenses = AccountingModule.saveExpenses;
                AccountingModule.saveExpenses = async () => {
                    await originalSaveExpenses.call(AccountingModule);
                    const expenses = await AccountingModule.loadExpenses();
                    this.queueChanges('expenses', expenses);
                };
            }
            
            // Interceptar guardado de precios (en MermaModule)
            if (typeof MermaModule !== 'undefined' && MermaModule.saveDailyPrices) {
                const originalSavePrices = MermaModule.saveDailyPrices;
                MermaModule.saveDailyPrices = async () => {
                    await originalSavePrices.call(MermaModule);
                    const prices = await DB.getAll('prices');
                    this.queueChanges('prices', prices);
                };
            }
            
            // Interceptar guardado de merma
            if (typeof MermaModule !== 'undefined' && MermaModule.saveMermaRecords) {
                const originalSaveMerma = MermaModule.saveMermaRecords;
                MermaModule.saveMermaRecords = async () => {
                    await originalSaveMerma.call(MermaModule);
                    const mermaConfig = await DB.get('config', 'merma-records');
                    if (mermaConfig && mermaConfig.value) {
                        this.queueChanges('mermaRecords', mermaConfig.value);
                    }
                };
            }
            
            // Interceptar guardado de diezmos
            if (typeof DiezmosModule !== 'undefined' && DiezmosModule.saveConfig) {
                const originalSaveDiezmos = DiezmosModule.saveConfig;
                DiezmosModule.saveConfig = async () => {
                    await originalSaveDiezmos.call(DiezmosModule);
                    const diezmosConfig = await DB.get('config', 'diezmos-config');
                    if (diezmosConfig && diezmosConfig.value) {
                        this.queueChanges('diezmos', [diezmosConfig.value]);
                    }
                };
            }
            
            // Interceptar guardado de historial de pagos
            if (typeof PaymentHistoryModule !== 'undefined' && PaymentHistoryModule.savePayments) {
                const originalSavePaymentHistory = PaymentHistoryModule.savePayments;
                PaymentHistoryModule.savePayments = async () => {
                    await originalSavePaymentHistory.call(PaymentHistoryModule);
                    const history = await DB.getAll('paymentHistory');
                    this.queueChanges('paymentHistory', history);
                };
            }
            
            // Interceptar guardado de configuración
            if (typeof ConfigModule !== 'undefined' && ConfigModule.saveConfig) {
                const originalSaveConfig = ConfigModule.saveConfig;
                ConfigModule.saveConfig = () => {
                    originalSaveConfig.call(ConfigModule);
                    // ConfigModule guarda en localStorage, obtener de ahí
                    const config = localStorage.getItem('polloConfig');
                    if (config) {
                        this.queueChanges('config', [{
                            key: 'app-config',
                            value: JSON.parse(config)
                        }]);
                    }
                };
            }
            
            console.log('✅ Interceptores de cambios instalados');
        } catch (error) {
            console.error('❌ Error instalando interceptores:', error);
        }
    }

    queueChanges(dataType, items) {
        if (!Array.isArray(items)) {
            items = [items];
        }
        
        const changes = [];
        
        items.forEach(item => {
            // Validar que el item exista
            if (!item) {
                console.warn('⚠️ Item vacío, ignorando');
                return;
            }
            
            // Obtener ID según el tipo de dato
            let itemId = item.id || item.key || item.date;
            
            // Si no tiene ID, generar uno
            if (!itemId) {
                itemId = `${dataType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                console.warn('⚠️ Item sin ID, generando:', itemId);
            }
            
            const change = {
                data_type: dataType,
                data_id: itemId,
                action: 'upsert',
                data: item,
                timestamp: Date.now()
            };
            
            this.pendingChanges.push(change);
            changes.push(change);
        });
        
        console.log(`📝 ${items.length} cambios en cola (${dataType})`);
        
        // Enviar via WebSocket inmediatamente si está conectado
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            changes.forEach(change => {
                try {
                    this.ws.send(JSON.stringify({
                        type: 'change',
                        data: change
                    }));
                    console.log('📤 Cambio enviado via WebSocket:', dataType);
                } catch (error) {
                    console.error('Error enviando via WebSocket:', error);
                }
            });
        }
        
        // Sincronizar via API si está online (fallback)
        if (this.isOnline && !this.isSyncing) {
            // Debounce para evitar múltiples llamadas
            clearTimeout(this.syncTimeout);
            this.syncTimeout = setTimeout(() => {
                this.syncNow();
            }, 1000);
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
