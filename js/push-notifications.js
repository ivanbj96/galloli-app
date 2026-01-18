// Sistema de Notificaciones Push - Versión 6.0 - Completamente nuevo
const PushNotifications = {
    swRegistration: null,
    permission: 'default',

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
        await this.requestPermission();
        
        return this.permission === 'granted';
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
            console.warn('⚠️ Módulos no disponibles');
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
                    vibrate: [500, 200, 500, 200, 500]
                }
            );
            return true;
        }
        
        return false;
    },

    // Verificar créditos pendientes
    async checkCreditsPending() {
        if (typeof SalesModule === 'undefined' || typeof ClientsModule === 'undefined') {
            console.warn('⚠️ Módulos no disponibles');
            return false;
        }

        const creditSales = SalesModule.getCreditSales();
        
        if (creditSales.length > 0) {
            const totalDebt = creditSales.reduce((sum, sale) => sum + sale.remainingDebt, 0);
            const clientsWithDebt = new Set(creditSales.map(s => s.clientId)).size;
            
            await this.show(
                '💳 Créditos Activos',
                `${clientsWithDebt} clientes con deuda - Total: ${Utils.formatCurrency(totalDebt)}`,
                {
                    tag: 'credits-active',
                    requireInteraction: true,
                    vibrate: [300, 100, 300, 100, 300]
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
