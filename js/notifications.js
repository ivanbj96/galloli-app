// Sistema de Notificaciones Push Nativas con Persistencia
const NotificationsModule = {
    permission: 'default',
    reminders: [],
    checkInterval: null,

    async init() {
        await this.loadReminders();
        const granted = await this.requestPermission();
        
        if (granted) {
            // Registrar periodic sync si está disponible
            await this.registerPeriodicSync();
            
            // Fallback: verificar cada minuto
            this.startReminderCheck();
            
            // Verificar tareas pendientes
            this.checkDailyTasks();
        }
    },

    async requestPermission() {
        if (!('Notification' in window)) {
            console.log('❌ Este navegador no soporta notificaciones');
            return false;
        }
        
        if (!('serviceWorker' in navigator)) {
            console.log('❌ Service Worker no soportado');
            return false;
        }

        if (Notification.permission === 'granted') {
            this.permission = 'granted';
            return true;
        }

        if (Notification.permission !== 'denied') {
            try {
                const permission = await Notification.requestPermission();
                this.permission = permission;
                return permission === 'granted';
            } catch (error) {
                console.error('❌ Error solicitando permisos:', error);
                return false;
            }
        }

        return false;
    },

    // Registrar periodic sync para notificaciones en segundo plano
    async registerPeriodicSync() {
        if ('serviceWorker' in navigator && 'periodicSync' in navigator.serviceWorker) {
            try {
                const registration = await navigator.serviceWorker.ready;
                await registration.periodicSync.register('check-reminders', {
                    minInterval: 60 * 1000 // Cada minuto
                });
                console.log('Periodic sync registrado para notificaciones');
            } catch (error) {
                console.log('Periodic sync no disponible, usando fallback');
            }
        }
    },

    // Fallback: verificar recordatorios cada minuto
    startReminderCheck() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        
        this.checkInterval = setInterval(() => {
            this.checkScheduledReminders();
        }, 60000); // Cada minuto
        
        // Verificar inmediatamente
        this.checkScheduledReminders();
    },

    async checkScheduledReminders() {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        
        // Verificar si ya se mostró hoy
        const shownToday = localStorage.getItem('notificationsShownToday');
        const shownData = shownToday ? JSON.parse(shownToday) : {};
        
        // Backup reminder (8 PM)
        if (hour === 20 && minute === 0 && !shownData[`backup-${today}`]) {
            await this.showPersistentNotification(
                '💾 Recordatorio de Backup',
                'No olvides crear un backup de tus datos hoy',
                'backup-reminder'
            );
            shownData[`backup-${today}`] = true;
            localStorage.setItem('notificationsShownToday', JSON.stringify(shownData));
        }
        
        // Merma reminder (6 PM)
        if (hour === 18 && minute === 0 && !shownData[`merma-${today}`]) {
            await this.showPersistentNotification(
                '🧮 Recordatorio de Merma',
                'Recuerda calcular la merma del día',
                'merma-reminder'
            );
            shownData[`merma-${today}`] = true;
            localStorage.setItem('notificationsShownToday', JSON.stringify(shownData));
        }
        
        // Diezmos reminder (9 PM)
        if (hour === 21 && minute === 0 && !shownData[`diezmos-${today}`]) {
            await this.showPersistentNotification(
                '🙏 Recordatorio de Diezmos',
                'Revisa y guarda los diezmos del día',
                'diezmos-reminder'
            );
            shownData[`diezmos-${today}`] = true;
            localStorage.setItem('notificationsShownToday', JSON.stringify(shownData));
        }
    },

    // Mostrar notificación persistente (funciona con app cerrada)
    async showPersistentNotification(title, body, tag) {
        if (this.permission !== 'granted') {
            console.log('❌ Permisos no concedidos para notificación persistente');
            return false;
        }
        
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.ready;
                console.log('📱 Enviando notificación persistente via Service Worker');
                await registration.showNotification(title, {
                    body,
                    icon: './icons/icon-192x192.png',
                    tag,
                    requireInteraction: false,
                    silent: false,
                    vibrate: [200, 100, 200],
                    actions: [
                        { action: 'open', title: 'Abrir App' }
                    ],
                    data: {
                        url: './',
                        timestamp: Date.now()
                    }
                });
                console.log('✅ Notificación persistente enviada');
                return true;
            } catch (error) {
                console.error('❌ Error mostrando notificación persistente:', error);
                return false;
            }
        } else {
            console.log('⚠️ Service Worker no disponible');
            return false;
        }
    },

    async showNotification(title, body, icon = '🐔', tag = 'gallo-app') {
        if (this.permission !== 'granted') {
            console.log('❌ Permisos no concedidos');
            return false;
        }

        // SIEMPRE usar Service Worker en móviles
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.ready;
                console.log('📱 Enviando notificación via Service Worker');
                await registration.showNotification(title, {
                    body,
                    icon: './icons/icon-192x192.png',
                    tag,
                    requireInteraction: false,
                    silent: false,
                    vibrate: [200, 100, 200],
                    actions: [
                        { action: 'open', title: 'Abrir App' }
                    ],
                    data: {
                        url: './',
                        timestamp: Date.now()
                    }
                });
                console.log('✅ Notificación enviada correctamente');
                return true;
            } catch (error) {
                console.error('❌ Error con Service Worker:', error);
            }
        }
        
        console.log('⚠️ Service Worker no disponible, usando fallback');
        return false;
    },

    // Verificar tareas pendientes al abrir la app
    checkDailyTasks() {
        const today = new Date().toISOString().split('T')[0];
        
        // Verificar si falta calcular merma (después de 5 segundos)
        setTimeout(async () => {
            if (typeof MermaModule !== 'undefined') {
                const mermaRecord = MermaModule.getMermaRecordByDate(today);
                if (!mermaRecord && typeof SalesModule !== 'undefined') {
                    const sales = SalesModule.getSalesByDate(today);
                    if (sales.length > 0) {
                        await this.showPersistentNotification(
                            '⚠️ Merma Pendiente',
                            'Tienes ventas hoy pero no has calculado la merma',
                            'merma-pending'
                        );
                    }
                }
            }
        }, 5000);

        // Verificar backup (después de 10 segundos)
        setTimeout(async () => {
            const lastBackup = localStorage.getItem('lastBackup');
            if (lastBackup) {
                const daysSince = Math.floor((Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24));
                if (daysSince >= 7) {
                    await this.showPersistentNotification(
                        '⚠️ Backup Atrasado',
                        `Han pasado ${daysSince} días desde tu último backup`,
                        'backup-overdue'
                    );
                }
            }
        }, 10000);
    },

    // Notificaciones específicas de la app
    async notifyClientCreated(clientName) {
        await this.showPersistentNotification(
            '👥 Nuevo Cliente Agregado',
            `Cliente "${clientName}" ha sido registrado exitosamente`,
            'client-created'
        );
    },

    async notifySaleCompleted(amount, client) {
        await this.showPersistentNotification(
            '💰 Venta Registrada',
            `Venta de $${amount.toFixed(2)} a ${client || 'Cliente'} completada`,
            'sale-completed'
        );
    },

    async notifyBackupCreated() {
        await this.showPersistentNotification(
            '💾 Backup Creado',
            'Backup de datos creado exitosamente',
            'backup-created'
        );
    },

    async notifyDiezmosCalculated(amount) {
        await this.showPersistentNotification(
            '🙏 Diezmos Calculados',
            `Diezmos del día: $${amount.toFixed(2)}`,
            'diezmos-calculated'
        );
    },

    async notifyMermaCalculated(price) {
        await this.showPersistentNotification(
            '🧮 Merma Calculada',
            `Precio por libra actualizado: $${price.toFixed(2)}`,
            'merma-calculated'
        );
    },

    async notifyOrderDelivered(clientName) {
        await this.showPersistentNotification(
            '📦 Pedido Entregado',
            `Pedido para ${clientName} marcado como entregado`,
            'order-delivered'
        );
    },

    // Notificación instantánea personalizada
    async notify(type, message) {
        const notifications = {
            backup: { title: '💾 Backup', icon: '💾' },
            merma: { title: '🧮 Merma', icon: '🧮' },
            diezmos: { title: '🙏 Diezmos', icon: '🙏' },
            sale: { title: '💰 Venta', icon: '💰' },
            order: { title: '📋 Pedido', icon: '📋' },
            credit: { title: '💳 Crédito', icon: '💳' }
        };

        const config = notifications[type] || { title: '🐔 GallOli', icon: '🐔' };
        await this.showPersistentNotification(config.title, message, `${type}-notification`);
    },

    async saveReminders() {
        localStorage.setItem('notificationReminders', JSON.stringify(this.reminders));
    },

    async loadReminders() {
        const saved = localStorage.getItem('notificationReminders');
        if (saved) {
            this.reminders = JSON.parse(saved);
        }
    },

    // Desactivar notificaciones
    disable() {
        this.permission = 'denied';
        localStorage.setItem('notificationsDisabled', 'true');
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
    },

    // Activar notificaciones
    async enable() {
        localStorage.removeItem('notificationsDisabled');
        const granted = await this.requestPermission();
        if (granted) {
            await this.registerPeriodicSync();
            this.startReminderCheck();
        }
        return granted;
    },

    // Método de prueba rápido
    async test() {
        console.log('🧪 Iniciando prueba de notificaciones...');
        
        const granted = await this.requestPermission();
        if (!granted) {
            console.error('❌ Permisos denegados');
            return false;
        }
        
        console.log('✅ Permisos concedidos, enviando notificaciones de prueba...');
        
        // Prueba básica (ahora usa Service Worker)
        await this.showNotification('🧪 Prueba 1/3', 'Notificación básica funcionando');
        
        // Prueba persistente después de 2 segundos
        setTimeout(async () => {
            await this.showPersistentNotification('🧪 Prueba 2/3', 'Notificación persistente funcionando', 'test-persistent');
        }, 2000);
        
        // Prueba del sistema después de 4 segundos
        setTimeout(async () => {
            await this.notify('backup', '🧪 Prueba 3/3: Sistema de notificaciones funcionando correctamente');
        }, 4000);
        
        console.log('✅ Pruebas enviadas. Revisa las notificaciones.');
        return true;
    }
};
