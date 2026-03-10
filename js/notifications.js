// Sistema de Notificaciones Push - Optimizado para Android
// Versión 5.5.2 - Con notificaciones persistentes de merma, créditos y backup 
const NotificationsModule = {
    permission: 'default',
    swRegistration: null,
    isSupported: false,

    async init() {
        console.log('🔔 Inicializando sistema de notificaciones...');
        
        // Verificar soporte
        this.isSupported = this.checkSupport();
        if (!this.isSupported) {
            console.warn('⚠️ Notificaciones no soportadas en este navegador');
            return false;
        }

        // Esperar a que el Service Worker esté listo
        if ('serviceWorker' in navigator) {
            try {
                this.swRegistration = await navigator.serviceWorker.ready;
                console.log('✅ Service Worker listo para notificaciones');
            } catch (error) {
                console.error('❌ Error obteniendo Service Worker:', error);
                return false;
            }
        }

        // Solicitar permisos
        const granted = await this.requestPermission();
        
        if (granted) {
            console.log('✅ Permisos de notificación concedidos');
            
            // Iniciar verificación de recordatorios
            this.startReminderCheck();
            
            // Verificar tareas pendientes después de 5 segundos
            setTimeout(() => this.checkDailyTasks(), 5000);
            
            return true;
        }
        
        return false;
    },

    checkSupport() {
        if (!('Notification' in window)) {
            console.log('❌ API de Notificaciones no disponible');
            return false;
        }
        
        if (!('serviceWorker' in navigator)) {
            console.log('❌ Service Worker no disponible');
            return false;
        }
        
        return true;
    },

    async requestPermission() {
        if (!this.isSupported) return false;

        // Si ya está concedido
        if (Notification.permission === 'granted') {
            this.permission = 'granted';
            return true;
        }

        // Si está denegado
        if (Notification.permission === 'denied') {
            console.log('❌ Permisos de notificación denegados');
            this.permission = 'denied';
            return false;
        }

        // Solicitar permisos
        try {
            const permission = await Notification.requestPermission();
            this.permission = permission;
            
            if (permission === 'granted') {
                console.log('✅ Usuario concedió permisos de notificación');
                return true;
            } else {
                console.log('⚠️ Usuario denegó permisos de notificación');
                return false;
            }
        } catch (error) {
            console.error('❌ Error solicitando permisos:', error);
            return false;
        }
    },

    // Mostrar notificación usando Service Worker (funciona en segundo plano)
    async showNotification(title, body, options = {}) {
        if (!this.isSupported || this.permission !== 'granted') {
            console.log('⚠️ No se puede mostrar notificación - permisos no concedidos');
            return false;
        }

        if (!this.swRegistration) {
            console.log('⚠️ Service Worker no disponible');
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
                data: {
                    url: options.url || './',
                    timestamp: Date.now(),
                    ...options.data
                },
                actions: options.actions || [
                    { action: 'open', title: 'Abrir' }
                ]
            };

            await this.swRegistration.showNotification(title, notificationOptions);
            console.log('✅ Notificación enviada:', title);
            return true;
        } catch (error) {
            console.error('❌ Error mostrando notificación:', error);
            return false;
        }
    },

    // Verificar recordatorios programados
    startReminderCheck() {
        // Verificar cada minuto
        setInterval(() => {
            this.checkScheduledReminders();
        }, 60000);
        
        // Verificar inmediatamente
        this.checkScheduledReminders();
    },

    async checkScheduledReminders() {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const today = now.toISOString().split('T')[0];
        
        // Obtener notificaciones ya mostradas hoy
        const shownToday = JSON.parse(localStorage.getItem('notificationsShownToday') || '{}');
        
        // Limpiar notificaciones de días anteriores
        Object.keys(shownToday).forEach(key => {
            if (!key.includes(today)) {
                delete shownToday[key];
            }
        });
        
        // Recordatorio de Merma (6:00 PM)
        if (hour === 18 && minute === 0 && !shownToday[`merma-${today}`]) {
            await this.showNotification(
                '🧮 Recordatorio de Merma',
                'Recuerda calcular la merma del día',
                { tag: 'merma-reminder' }
            );
            shownToday[`merma-${today}`] = true;
        }
        
        // Recordatorio de Backup (8:00 PM)
        if (hour === 20 && minute === 0 && !shownToday[`backup-${today}`]) {
            await this.showNotification(
                '💾 Recordatorio de Backup',
                'No olvides crear un backup de tus datos',
                { tag: 'backup-reminder' }
            );
            shownToday[`backup-${today}`] = true;
        }
        
        // Recordatorio de Diezmos (9:00 PM)
        if (hour === 21 && minute === 0 && !shownToday[`diezmos-${today}`]) {
            await this.showNotification(
                '🙏 Recordatorio de Diezmos',
                'Revisa y guarda los diezmos del día',
                { tag: 'diezmos-reminder' }
            );
            shownToday[`diezmos-${today}`] = true;
        }
        
        // Guardar notificaciones mostradas
        localStorage.setItem('notificationsShownToday', JSON.stringify(shownToday));
    },

    // Verificar tareas pendientes
    async checkDailyTasks() {
        const today = new Date().toISOString().split('T')[0];
        
        // Verificar merma pendiente
        if (typeof MermaModule !== 'undefined') {
            const mermaRecord = MermaModule.getMermaRecordByDate(today);
            if (!mermaRecord && typeof SalesModule !== 'undefined') {
                const sales = SalesModule.getSalesByDate(today);
                if (sales.length > 0) {
                    await this.showNotification(
                        '⚠️ Merma Pendiente',
                        `Tienes ${sales.length} ventas hoy pero no has calculado la merma`,
                        { 
                            tag: 'merma-pending', 
                            requireInteraction: true,
                            vibrate: [500, 200, 500]
                        }
                    );
                }
            }
        }
        
        // Verificar créditos pendientes
        if (typeof SalesModule !== 'undefined') {
            const creditSales = SalesModule.getCreditSales();
            if (creditSales.length > 0) {
                const totalDebt = creditSales.reduce((sum, sale) => sum + sale.remainingDebt, 0);
                await this.showNotification(
                    '💳 Créditos Pendientes',
                    `${creditSales.length} créditos activos - Total: ${Utils.formatCurrency(totalDebt)}`,
                    { 
                        tag: 'credits-pending', 
                        requireInteraction: true,
                        vibrate: [300, 100, 300]
                    }
                );
            }
        }
        
        // Verificar backup atrasado
        const lastBackup = localStorage.getItem('lastBackup');
        if (lastBackup) {
            const daysSince = Math.floor((Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24));
            if (daysSince >= 7) {
                await this.showNotification(
                    '⚠️ Backup Atrasado',
                    `Han pasado ${daysSince} días desde tu último backup`,
                    { 
                        tag: 'backup-overdue', 
                        requireInteraction: true,
                        vibrate: [500, 200, 500, 200, 500]
                    }
                );
            }
        }
    },

    // Verificar merma pendiente (llamar manualmente)
    async checkPendingMerma() {
        const today = new Date().toISOString().split('T')[0];
        
        if (typeof MermaModule !== 'undefined' && typeof SalesModule !== 'undefined') {
            const mermaRecord = MermaModule.getMermaRecordByDate(today);
            const sales = SalesModule.getSalesByDate(today);
            
            if (!mermaRecord && sales.length > 0) {
                await this.showNotification(
                    '⚠️ Merma Sin Calcular',
                    `Tienes ${sales.length} ventas registradas hoy. ¡Calcula la merma ahora!`,
                    { 
                        tag: 'merma-urgent', 
                        requireInteraction: true,
                        vibrate: [500, 200, 500, 200, 500],
                        actions: [
                            { action: 'calculate', title: 'Calcular Ahora' },
                            { action: 'dismiss', title: 'Más Tarde' }
                        ]
                    }
                );
                return true;
            }
        }
        return false;
    },

    // Verificar créditos pendientes (llamar manualmente)
    async checkPendingCredits() {
        if (typeof SalesModule !== 'undefined' && typeof ClientsModule !== 'undefined') {
            const creditSales = SalesModule.getCreditSales();
            
            if (creditSales.length > 0) {
                const totalDebt = creditSales.reduce((sum, sale) => sum + sale.remainingDebt, 0);
                const clientsWithDebt = new Set(creditSales.map(s => s.clientId)).size;
                
                await this.showNotification(
                    '💳 Créditos Activos',
                    `${clientsWithDebt} clientes con deuda - Total: ${Utils.formatCurrency(totalDebt)}`,
                    { 
                        tag: 'credits-active', 
                        requireInteraction: true,
                        vibrate: [300, 100, 300, 100, 300],
                        actions: [
                            { action: 'view', title: 'Ver Créditos' },
                            { action: 'dismiss', title: 'Cerrar' }
                        ]
                    }
                );
                return true;
            }
        }
        return false;
    },

    // Notificación de backup exitoso a Telegram
    async notifyTelegramBackupSuccess(fileName) {
        await this.showNotification(
            '✅ Backup Enviado a Telegram',
            `Archivo: ${fileName}`,
            { 
                tag: 'telegram-backup-success',
                requireInteraction: false,
                vibrate: [200, 100, 200],
                icon: './icons/icon-192x192.png'
            }
        );
    },

    // Notificación de error en backup a Telegram
    async notifyTelegramBackupError(error) {
        await this.showNotification(
            '❌ Error en Backup a Telegram',
            `No se pudo enviar: ${error}`,
            { 
                tag: 'telegram-backup-error',
                requireInteraction: true,
                vibrate: [500, 200, 500, 200, 500]
            }
        );
    },

    // Notificaciones específicas de eventos
    async notifyClientCreated(clientName) {
        await this.showNotification(
            '👥 Cliente Agregado',
            `"${clientName}" registrado exitosamente`,
            { tag: 'client-created' }
        );
    },

    async notifySaleCompleted(amount, clientName) {
        await this.showNotification(
            '💰 Venta Registrada',
            `${Utils.formatCurrency(amount)} - ${clientName}`,
            { tag: 'sale-completed' }
        );
    },

    async notifyOrderDelivered(clientName) {
        await this.showNotification(
            '📦 Pedido Entregado',
            `Pedido de ${clientName} completado`,
            { tag: 'order-delivered' }
        );
    },

    async notifyPaymentReceived(amount, clientName) {
        await this.showNotification(
            '💵 Pago Recibido',
            `${Utils.formatCurrency(amount)} de ${clientName}`,
            { tag: 'payment-received' }
        );
    },

    async notifyBackupCreated() {
        await this.showNotification(
            '💾 Backup Creado',
            'Tus datos están seguros',
            { tag: 'backup-created' }
        );
    },

    async notifyDiezmosCalculated(amount) {
        await this.showNotification(
            '🙏 Diezmos Calculados',
            `Total: ${Utils.formatCurrency(amount)}`,
            { tag: 'diezmos-calculated' }
        );
    },

    async notifyMermaCalculated(price) {
        await this.showNotification(
            '🧮 Merma Calculada',
            `Precio/lb: ${Utils.formatCurrency(price)}`,
            { tag: 'merma-calculated' }
        );
    },

    // Método de prueba
    async test() {
        console.log('🧪 Iniciando prueba de notificaciones...');
        
        if (!this.isSupported) {
            Utils.showAlert('Tu navegador no soporta notificaciones', 'No Soportado', 'error');
            return false;
        }

        const granted = await this.requestPermission();
        if (!granted) {
            Utils.showAlert('Necesitas conceder permisos de notificación para usar esta función', 'Permisos Requeridos', 'warning');
            return false;
        }

        console.log('✅ Enviando notificaciones de prueba...');

        // Prueba 1
        await this.showNotification(
            '🧪 Prueba 1/3',
            'Notificación básica funcionando',
            { tag: 'test-1' }
        );

        // Prueba 2 (después de 2 segundos)
        setTimeout(async () => {
            await this.showNotification(
                '🧪 Prueba 2/3',
                'Notificación con vibración',
                { tag: 'test-2', vibrate: [300, 100, 300] }
            );
        }, 2000);

        // Prueba 3 (después de 4 segundos)
        setTimeout(async () => {
            await this.showNotification(
                '🧪 Prueba 3/3',
                'Sistema funcionando correctamente ✅',
                { 
                    tag: 'test-3',
                    requireInteraction: true,
                    vibrate: [200, 100, 200, 100, 200]
                }
            );
        }, 4000);

        Utils.showAlert('Pruebas enviadas. Revisa tus notificaciones en unos segundos.', 'Pruebas Enviadas', 'success');
        return true;
    }
};
