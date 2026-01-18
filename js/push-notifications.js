// Sistema de Notificaciones Push - Versión 6.0 - Completamente nuevo
const PushNotifications = {
    swRegistration: null,
    permission: 'default',
    checkInterval: null,

    // Inicializar el sistema
    async init() {
        console.log('🔔 Inicializando sistema de notificaciones push...');
        
        // Verificar soporte
        if (!('Notification' in window)) {
            console.warn('❌ Notificaciones no soportadas');
            return false;
        }

        if (!('serviceWorker' in navigator)) {
            console.warn('❌ Service Worker no soportado');
            return false;
        }

        // Obtener Service Worker
        try {
            this.swRegistration = await navigator.serviceWorker.ready;
            console.log('✅ Service Worker listo');
        } catch (error) {
            console.error('❌ Error con Service Worker:', error);
            return false;
        }

        // Solicitar permisos
        const granted = await this.requestPermission();
        
        if (granted) {
            // Verificar tareas pendientes inmediatamente
            setTimeout(() => this.checkAllPendingTasks(), 3000);
            
            // Verificar cada 5 minutos
            this.checkInterval = setInterval(() => {
                this.checkAllPendingTasks();
            }, 5 * 60 * 1000);
        }
        
        return granted;
    },

    // Solicitar permisos
    async requestPermission() {
        if (Notification.permission === 'granted') {
            this.permission = 'granted';
            console.log('✅ Permisos ya concedidos');
            return true;
        }

        if (Notification.permission === 'denied') {
            this.permission = 'denied';
            console.log('❌ Permisos denegados');
            return false;
        }

        try {
            const permission = await Notification.requestPermission();
            this.permission = permission;
            
            if (permission === 'granted') {
                console.log('✅ Permisos concedidos');
                return true;
            }
            
            console.log('⚠️ Permisos denegados por el usuario');
            return false;
        } catch (error) {
            console.error('❌ Error solicitando permisos:', error);
            return false;
        }
    },

    // Verificar todas las tareas pendientes
    async checkAllPendingTasks() {
        console.log('🔍 Verificando tareas pendientes...');
        
        // Verificar merma
        await this.checkMermaPending();
        
        // Verificar créditos por cliente
        await this.checkCreditsByClient();
        
        // Verificar backup
        await this.checkBackupPending();
    },

    // Mostrar notificación
    async show(title, body, options = {}) {
        if (this.permission !== 'granted' || !this.swRegistration) {
            console.warn('⚠️ No se puede mostrar notificación');
            return false;
        }

        try {
            const notificationOptions = {
                body: body,
                icon: options.icon || './icons/icon-192x192.png',
                badge: options.badge || './icons/icon-72x72.png',
                tag: options.tag || 'galloli-notification',
                requireInteraction: options.requireInteraction || false,
                silent: options.silent || false,
                vibrate: options.vibrate || [200, 100, 200],
                data: options.data || {},
                actions: options.actions || []
            };

            await this.swRegistration.showNotification(title, notificationOptions);
            console.log('✅ Notificación enviada:', title);
            return true;
        } catch (error) {
            console.error('❌ Error mostrando notificación:', error);
            return false;
        }
    },

    // Verificar merma pendiente
    async checkMermaPending() {
        const today = new Date().toISOString().split('T')[0];
        
        if (typeof MermaModule === 'undefined' || typeof SalesModule === 'undefined') {
            return false;
        }

        const mermaRecord = MermaModule.getMermaRecordByDate(today);
        const sales = SalesModule.getSalesByDate(today);
        
        if (!mermaRecord && sales.length > 0) {
            await this.show(
                '⚠️ Merma Sin Calcular',
                `Tienes ${sales.length} ventas registradas hoy. ¡Calcula la merma ahora!`,
                {
                    tag: 'merma-urgent',
                    requireInteraction: true,
                    vibrate: [500, 200, 500, 200, 500],
                    data: { action: 'calculate-merma' },
                    actions: [
                        { action: 'calculate', title: '🧮 Calcular Ahora', icon: './icons/icon-72x72.png' },
                        { action: 'dismiss', title: 'Más Tarde' }
                    ]
                }
            );
            return true;
        }
        
        return false;
    },

    // Verificar créditos por cliente individual
    async checkCreditsByClient() {
        if (typeof SalesModule === 'undefined' || typeof ClientsModule === 'undefined') {
            return false;
        }

        const creditSales = SalesModule.getCreditSales();
        
        // Agrupar por cliente
        const clientsWithDebt = {};
        creditSales.forEach(sale => {
            if (!clientsWithDebt[sale.clientId]) {
                const client = ClientsModule.getClientById(sale.clientId);
                clientsWithDebt[sale.clientId] = {
                    client: client,
                    totalDebt: 0,
                    sales: []
                };
            }
            clientsWithDebt[sale.clientId].totalDebt += sale.remainingDebt;
            clientsWithDebt[sale.clientId].sales.push(sale);
        });

        // Crear notificación individual por cada cliente
        for (const clientId in clientsWithDebt) {
            const data = clientsWithDebt[clientId];
            const client = data.client;
            
            await this.show(
                `💳 ${client.name} - Crédito Activo`,
                `Deuda total: ${Utils.formatCurrency(data.totalDebt)} (${data.sales.length} venta${data.sales.length > 1 ? 's' : ''})`,
                {
                    tag: `credit-${clientId}`,
                    requireInteraction: true,
                    vibrate: [300, 100, 300],
                    data: { 
                        action: 'pay-credit',
                        clientId: clientId,
                        clientName: client.name,
                        totalDebt: data.totalDebt
                    },
                    actions: [
                        { action: 'pay-full', title: '💵 Pagar Todo', icon: './icons/icon-72x72.png' },
                        { action: 'pay-partial', title: '💰 Abono Parcial', icon: './icons/icon-72x72.png' },
                        { action: 'view', title: '👁️ Ver Detalles' }
                    ]
                }
            );
        }

        return Object.keys(clientsWithDebt).length > 0;
    },

    // Verificar backup pendiente
    async checkBackupPending() {
        const lastBackup = localStorage.getItem('lastTelegramBackup');
        const today = new Date().toISOString().split('T')[0];
        
        if (!lastBackup) {
            // Nunca se ha hecho backup
            await this.show(
                '⚠️ Backup Pendiente',
                'No has realizado ningún backup. ¡Protege tus datos ahora!',
                {
                    tag: 'backup-never',
                    requireInteraction: true,
                    vibrate: [500, 200, 500, 200, 500],
                    data: { action: 'create-backup' },
                    actions: [
                        { action: 'backup-now', title: '💾 Hacer Backup Ahora', icon: './icons/icon-72x72.png' },
                        { action: 'dismiss', title: 'Más Tarde' }
                    ]
                }
            );
            return true;
        }

        const lastBackupDate = new Date(lastBackup).toISOString().split('T')[0];
        
        if (lastBackupDate !== today) {
            // No se ha hecho backup hoy
            const daysSince = Math.floor((Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24));
            
            await this.show(
                '💾 Backup Diario Pendiente',
                `Último backup hace ${daysSince} día${daysSince > 1 ? 's' : ''}. Crea uno ahora.`,
                {
                    tag: 'backup-pending',
                    requireInteraction: true,
                    vibrate: [400, 100, 400],
                    data: { action: 'create-backup' },
                    actions: [
                        { action: 'backup-now', title: '💾 Hacer Backup', icon: './icons/icon-72x72.png' },
                        { action: 'dismiss', title: 'Más Tarde' }
                    ]
                }
            );
            return true;
        }
        
        return false;
    },

    // Notificación de backup exitoso
    async notifyBackupSuccess(fileName) {
        await this.show(
            '✅ Backup Enviado a Telegram',
            `Archivo: ${fileName}`,
            {
                tag: 'telegram-backup-success',
                requireInteraction: false,
                vibrate: [200, 100, 200]
            }
        );
    },

    // Notificación de error en backup
    async notifyBackupError(error) {
        await this.show(
            '❌ Error en Backup a Telegram',
            `No se pudo enviar: ${error}`,
            {
                tag: 'telegram-backup-error',
                requireInteraction: true,
                vibrate: [500, 200, 500, 200, 500]
            }
        );
    },

    // Notificación de cliente creado
    async notifyClientCreated(clientName) {
        await this.show(
            '👥 Cliente Agregado',
            `"${clientName}" registrado exitosamente`,
            { tag: 'client-created' }
        );
    },

    // Notificación de venta completada
    async notifySaleCompleted(amount, clientName) {
        await this.show(
            '💰 Venta Registrada',
            `${Utils.formatCurrency(amount)} - ${clientName}`,
            { tag: 'sale-completed' }
        );
    },

    // Notificación de pedido entregado
    async notifyOrderDelivered(clientName) {
        await this.show(
            '📦 Pedido Entregado',
            `Pedido de ${clientName} completado`,
            { tag: 'order-delivered' }
        );
    },

    // Notificación de pago recibido
    async notifyPaymentReceived(amount, clientName) {
        await this.show(
            '💵 Pago Recibido',
            `${Utils.formatCurrency(amount)} de ${clientName}`,
            { tag: 'payment-received' }
        );
    },

    // Prueba del sistema
    async test() {
        console.log('🧪 Probando sistema de notificaciones...');
        
        const granted = await this.requestPermission();
        if (!granted) {
            alert('Necesitas conceder permisos de notificación');
            return false;
        }

        // Prueba 1
        await this.show(
            '🧪 Prueba 1/3',
            'Notificación básica funcionando',
            { tag: 'test-1' }
        );

        // Prueba 2
        setTimeout(async () => {
            await this.show(
                '🧪 Prueba 2/3',
                'Notificación con vibración',
                { tag: 'test-2', vibrate: [300, 100, 300] }
            );
        }, 2000);

        // Prueba 3
        setTimeout(async () => {
            await this.show(
                '🧪 Prueba 3/3',
                'Sistema funcionando correctamente ✅',
                {
                    tag: 'test-3',
                    requireInteraction: true,
                    vibrate: [200, 100, 200, 100, 200]
                }
            );
        }, 4000);

        return true;
    }
};

// Alias para compatibilidad con código existente
const NotificationsModule = PushNotifications;
