// Sistema de Notificaciones Push - Versión 6.5 - Mejorado con diagnóstico
const PushNotifications = {
    swRegistration: null,
    permission: 'default',
    checkInterval: null,
    isInitialized: false,

    // Inicializar el sistema
    async init() {
        console.log('🔔 ========================================');
        console.log('🔔 INICIALIZANDO SISTEMA DE NOTIFICACIONES');
        console.log('🔔 ========================================');
        
        // Verificar soporte de notificaciones
        if (!('Notification' in window)) {
            console.error('❌ Notificaciones NO soportadas en este navegador');
            console.log('   Navegador:', navigator.userAgent);
            return false;
        }
        console.log('✅ Notificaciones soportadas');

        // Verificar soporte de Service Worker
        if (!('serviceWorker' in navigator)) {
            console.error('❌ Service Worker NO soportado en este navegador');
            return false;
        }
        console.log('✅ Service Worker soportado');

        // Verificar estado actual de permisos
        console.log('📋 Estado actual de permisos:', Notification.permission);

        // Obtener Service Worker
        try {
            console.log('⏳ Esperando Service Worker...');
            this.swRegistration = await navigator.serviceWorker.ready;
            console.log('✅ Service Worker listo:', this.swRegistration);
            console.log('   Scope:', this.swRegistration.scope);
            console.log('   Active:', this.swRegistration.active ? 'Sí' : 'No');
        } catch (error) {
            console.error('❌ Error obteniendo Service Worker:', error);
            console.error('   Mensaje:', error.message);
            console.error('   Stack:', error.stack);
            return false;
        }

        // Si los permisos ya están concedidos, inicializar completamente
        if (Notification.permission === 'granted') {
            console.log('✅ Permisos ya concedidos - Inicializando sistema completo');
            this.permission = 'granted';
            this.isInitialized = true;
            
            // Verificar tareas pendientes inmediatamente (después de 3 segundos)
            console.log('⏰ Programando verificación de tareas pendientes...');
            setTimeout(() => {
                console.log('� Ejecutando primera verificación de tareas...');
                this.checkAllPendingTasks();
            }, 3000);
            
            // Verificar cada 5 minutos
            this.checkInterval = setInterval(() => {
                console.log('� Verificación periódica de tareas...');
                this.checkAllPendingTasks();
            }, 5 * 60 * 1000);
            
            console.log('✅ Verificaciones periódicas programadas (cada 5 minutos)');
            console.log('🔔 ========================================');
            console.log('🔔 INICIALIZACIÓN COMPLETADA: ÉXITO');
            console.log('🔔 ========================================');
            return true;
        }
        
        // Si los permisos están en default, NO solicitar automáticamente
        // (el usuario debe hacer clic en el botón de prueba o configuración)
        if (Notification.permission === 'default') {
            console.log('⚠️ Permisos pendientes - esperando acción del usuario');
            console.log('💡 El usuario debe:');
            console.log('   1. Ir a Configuración');
            console.log('   2. Hacer clic en "Probar Notificaciones Push"');
            console.log('   3. Conceder permisos cuando se soliciten');
            console.log('🔔 ========================================');
            console.log('🔔 INICIALIZACIÓN COMPLETADA: PERMISOS PENDIENTES');
            console.log('🔔 ========================================');
            return false;
        }
        
        // Si los permisos están denegados
        if (Notification.permission === 'denied') {
            console.error('❌ Permisos DENEGADOS por el usuario');
            console.log('💡 Para habilitar notificaciones:');
            console.log('   1. Haz clic en el ícono de candado en la barra de direcciones');
            console.log('   2. Busca "Notificaciones" y cambia a "Permitir"');
            console.log('   3. Recarga la página');
            console.log('🔔 ========================================');
            console.log('🔔 INICIALIZACIÓN COMPLETADA: PERMISOS DENEGADOS');
            console.log('🔔 ========================================');
            return false;
        }
        
        return false;
    },

    // Solicitar permisos
    async requestPermission() {
        console.log('🔐 ========================================');
        console.log('🔐 SOLICITANDO PERMISOS DE NOTIFICACIÓN');
        console.log('🔐 Estado actual:', Notification.permission);
        
        if (Notification.permission === 'granted') {
            this.permission = 'granted';
            this.isInitialized = true;
            console.log('✅ Permisos YA concedidos previamente');
            console.log('🔐 ========================================');
            return true;
        }

        if (Notification.permission === 'denied') {
            this.permission = 'denied';
            console.error('❌ Permisos DENEGADOS por el usuario');
            console.log('💡 Para habilitar notificaciones:');
            console.log('   1. Haz clic en el ícono de candado en la barra de direcciones');
            console.log('   2. Busca "Notificaciones" y cambia a "Permitir"');
            console.log('   3. Recarga la página');
            console.log('🔐 ========================================');
            return false;
        }

        try {
            console.log('⏳ Mostrando diálogo de permisos al usuario...');
            const permission = await Notification.requestPermission();
            this.permission = permission;
            
            console.log('📋 Respuesta del usuario:', permission);
            
            if (permission === 'granted') {
                console.log('✅ Permisos CONCEDIDOS por el usuario');
                // Activar el sistema completo ahora que tenemos permisos
                this.isInitialized = true;
                if (!this.swRegistration) {
                    this.swRegistration = await navigator.serviceWorker.ready;
                }
                // Iniciar verificaciones periódicas
                if (!this.checkInterval) {
                    this.checkInterval = setInterval(() => {
                        this.checkAllPendingTasks();
                    }, 5 * 60 * 1000);
                }
                setTimeout(() => this.checkAllPendingTasks(), 2000);
                console.log('🔐 ========================================');
                return true;
            }
            
            console.warn('⚠️ Permisos DENEGADOS por el usuario');
            console.log('🔐 ========================================');
            return false;
        } catch (error) {
            console.error('❌ Error solicitando permisos:', error);
            console.error('   Mensaje:', error.message);
            console.error('   Stack:', error.stack);
            console.log('🔐 ========================================');
            return false;
        }
    },

    // Verificar todas las tareas pendientes
    async checkAllPendingTasks() {
        if (!this.isInitialized) {
            console.warn('⚠️ Sistema de notificaciones no inicializado - saltando verificación');
            return;
        }
        
        console.log('� ========================================');
        console.log('� VERIFICANDO TAREAS PENDIENTES');
        console.log('� Fecha:', new Date().toLocaleString('es-GT'));
        console.log('� ========================================');
        
        let notificationsSent = 0;
        
        // Verificar merma
        console.log('📊 Verificando merma pendiente...');
        const mermaNotified = await this.checkMermaPending();
        if (mermaNotified) {
            console.log('   ✅ Notificación de merma enviada');
            notificationsSent++;
        } else {
            console.log('   ℹ️ No hay merma pendiente');
        }
        
        // Verificar créditos por cliente
        console.log('💳 Verificando créditos pendientes...');
        const creditsNotified = await this.checkCreditsByClient();
        if (creditsNotified) {
            console.log('   ✅ Notificaciones de créditos enviadas');
            notificationsSent++;
        } else {
            console.log('   ℹ️ No hay créditos pendientes');
        }
        
        console.log('� ========================================');
        console.log('� VERIFICACIÓN COMPLETADA');
        console.log('� Notificaciones enviadas:', notificationsSent);
        console.log('� ========================================');
        
        // NO verificar backup - se hace automáticamente a las 10 PM desde el servidor
    },

    // Mostrar notificación
    async show(title, body, options = {}) {
        console.log('📤 ========================================');
        console.log('📤 ENVIANDO NOTIFICACIÓN');
        console.log('📤 Título:', title);
        console.log('📤 Cuerpo:', body);
        console.log('📤 ========================================');
        
        // Verificar permisos
        if (this.permission !== 'granted') {
            console.error('❌ No se puede mostrar notificación - Permisos:', this.permission);
            console.log('💡 Ejecuta: PushNotifications.requestPermission()');
            return false;
        }
        
        // Verificar Service Worker
        if (!this.swRegistration) {
            console.error('❌ No se puede mostrar notificación - Service Worker no disponible');
            console.log('💡 Ejecuta: PushNotifications.init()');
            return false;
        }

        try {
            const notificationOptions = {
                body: body,
                icon: options.icon || './icons/favicon.pub/android-chrome-192x192.png',
                badge: options.badge || './icons/favicon.pub/favicon-48x48.png',
                tag: options.tag || 'galloli-notification',
                requireInteraction: options.requireInteraction || false,
                silent: options.silent || false,
                vibrate: options.vibrate || [200, 100, 200],
                data: options.data || {},
                actions: options.actions || []
            };

            console.log('📤 Opciones:', notificationOptions);
            console.log('⏳ Enviando a Service Worker...');
            
            await this.swRegistration.showNotification(title, notificationOptions);
            
            console.log('✅ Notificación enviada exitosamente');
            console.log('📤 ========================================');
            return true;
        } catch (error) {
            console.error('❌ Error mostrando notificación:', error);
            console.error('   Mensaje:', error.message);
            console.error('   Stack:', error.stack);
            console.log('📤 ========================================');
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
                        { action: 'calculate', title: '🧮 Calcular Ahora', icon: './icons/favicon.pub/favicon-48x48.png' },
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

        // Crear notificación individual por cada cliente con ACCIONES INLINE
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
                        type: 'credit',
                        clientId: clientId,
                        clientName: client.name,
                        totalDebt: data.totalDebt,
                        sales: data.sales.map(s => s.id)
                    },
                    actions: [
                        { 
                            action: 'pay-full', 
                            title: `💵 Pagar ${Utils.formatCurrency(data.totalDebt)}`,
                            icon: './icons/favicon.pub/favicon-48x48.png'
                        },
                        { 
                            action: 'pay-partial', 
                            title: '💰 Abono Parcial',
                            icon: './icons/favicon.pub/favicon-48x48.png',
                            type: 'text',
                            placeholder: 'Monto del abono'
                        },
                        { 
                            action: 'view', 
                            title: '👁️ Ver Detalles' 
                        }
                    ]
                }
            );
        }

        return Object.keys(clientsWithDebt).length > 0;
    },

    // Verificar backup pendiente
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
        console.log('🧪 ========================================');
        console.log('🧪 PROBANDO SISTEMA DE NOTIFICACIONES');
        console.log('🧪 ========================================');
        
        // Verificar estado del sistema
        console.log('📋 Estado del sistema:');
        console.log('   - Inicializado:', this.isInitialized);
        console.log('   - Permisos:', this.permission);
        console.log('   - Service Worker:', this.swRegistration ? 'Disponible' : 'No disponible');
        console.log('   - Notification API:', 'Notification' in window ? 'Disponible' : 'No disponible');
        
        if (!this.isInitialized) {
            console.warn('⚠️ Sistema no inicializado - Inicializando ahora...');
            const initialized = await this.init();
            if (!initialized) {
                console.error('❌ No se pudo inicializar el sistema');
                alert('❌ No se pudo inicializar el sistema de notificaciones. Revisa la consola para más detalles.');
                return false;
            }
        }
        
        const granted = await this.requestPermission();
        if (!granted) {
            alert('❌ Necesitas conceder permisos de notificación para probar el sistema.\n\nPara habilitar:\n1. Haz clic en el ícono de candado en la barra de direcciones\n2. Busca "Notificaciones" y cambia a "Permitir"\n3. Recarga la página');
            return false;
        }

        console.log('✅ Sistema listo - Enviando notificaciones de prueba...');

        // Prueba 1
        console.log('🧪 Enviando prueba 1/3...');
        await this.show(
            '🧪 Prueba 1/3',
            'Notificación básica funcionando',
            { tag: 'test-1' }
        );

        // Prueba 2
        setTimeout(async () => {
            console.log('🧪 Enviando prueba 2/3...');
            await this.show(
                '🧪 Prueba 2/3',
                'Notificación con vibración',
                { tag: 'test-2', vibrate: [300, 100, 300] }
            );
        }, 2000);

        // Prueba 3
        setTimeout(async () => {
            console.log('🧪 Enviando prueba 3/3...');
            await this.show(
                '🧪 Prueba 3/3',
                'Sistema funcionando correctamente ✅',
                {
                    tag: 'test-3',
                    requireInteraction: true,
                    vibrate: [200, 100, 200, 100, 200]
                }
            );
            
            console.log('🧪 ========================================');
            console.log('🧪 PRUEBA COMPLETADA');
            console.log('🧪 Si no viste las notificaciones, revisa:');
            console.log('🧪 1. Permisos del navegador');
            console.log('🧪 2. Configuración de "No molestar" del sistema');
            console.log('🧪 3. Logs de errores arriba');
            console.log('🧪 ========================================');
        }, 4000);

        return true;
    }
};

// Alias para compatibilidad con código existente
const NotificationsModule = PushNotifications;
